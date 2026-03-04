from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from shapely.geometry import mapping as shapely_mapping
from shapely.geometry import shape
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.footprint import (
    AnalyseResponse,
    ConfidenceBreakdown,
    DeforestationAlerts,
    LandCoverItem,
    YearlyAlerts,
)
from app.services.alert_ingestion import ingest_alerts_for_geometry

logger = logging.getLogger(__name__)

_DEFAULT_BUFFER_M = 1000.0  # metres


def _resolved_geom(geometry_type: str, buffer_km: float | None) -> str:
    """Return the SQL expression that resolves the working geometry."""
    if geometry_type == "Point" or buffer_km is not None:
        return """
            ST_Transform(
                ST_Buffer(
                    ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326), 3857),
                    :buffer_m
                ),
                4326
            )
        """
    return "ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326)"


def _to_gfw_polygon(geometry: dict, buffer_km: float | None) -> dict:
    """Return a GeoJSON Polygon suitable for the GFW API.

    Points and explicitly-buffered polygons are buffered using an equatorial
    degree approximation (1° ≈ 111.32 km). The small distortion is acceptable
    because GFW data is stored in PostGIS and the spatial query uses the
    accurate PostGIS buffer anyway.
    """
    if geometry["type"] == "Polygon" and buffer_km is None:
        return geometry
    geom = shape(geometry)
    deg = ((buffer_km or 1.0) * 1000) / 111_320
    buffered = geom.buffer(deg)
    return json.loads(json.dumps(shapely_mapping(buffered)))


async def analyse_footprint(
    geometry: dict,
    db: AsyncSession,
    buffer_km: float | None = None,
    settings=None,
) -> AnalyseResponse:
    alerts_live = False
    if settings is not None:
        gfw_geom = _to_gfw_polygon(geometry, buffer_km)
        _, alerts_live = await ingest_alerts_for_geometry(gfw_geom, db, settings)

    buffer_m = (buffer_km * 1000) if buffer_km is not None else _DEFAULT_BUFFER_M
    params = {"geojson": json.dumps(geometry), "buffer_m": float(buffer_m)}
    geom = _resolved_geom(geometry["type"], buffer_km)

    # 1. Area + centroid
    area_row = (
        await db.execute(
            text(f"""
                SELECT
                    ST_Area(ST_Transform({geom}, 3857)) / 10000.0 AS area_ha,
                    ST_X(ST_Centroid({geom}))                     AS lon,
                    ST_Y(ST_Centroid({geom}))                     AS lat
            """),
            params,
        )
    ).mappings().one()

    # 2. Land cover intersection — grouped by cover_type
    lc_rows = (
        await db.execute(
            text(f"""
                SELECT
                    lcp.cover_type,
                    SUM(
                        ST_Area(
                            ST_Transform(ST_Intersection(lcp.geometry, {geom}), 3857)
                        )
                    ) AS intersect_m2
                FROM land_cover_polygons lcp
                WHERE ST_Intersects(lcp.geometry, {geom})
                GROUP BY lcp.cover_type
            """),
            params,
        )
    ).mappings().all()

    total_m2 = sum(float(r["intersect_m2"]) for r in lc_rows)
    land_cover = (
        [
            LandCoverItem(
                type=r["cover_type"],
                percentage=round(float(r["intersect_m2"]) / total_m2 * 100, 2),
            )
            for r in lc_rows
        ]
        if total_m2 > 0
        else []
    )

    # 3. Deforestation alerts within polygon
    alerts_row = (
        await db.execute(
            text(f"""
                SELECT
                    COUNT(*)                           AS count,
                    COALESCE(SUM(da.area_ha), 0.0)     AS total_area_ha,
                    MIN(da.alert_date)                 AS min_date,
                    MAX(da.alert_date)                 AS max_date
                FROM deforestation_alerts da
                WHERE ST_Within(da.geometry, {geom})
            """),
            params,
        )
    ).mappings().one()

    # 4. Confidence breakdown
    conf_rows = (
        await db.execute(
            text(f"""
                SELECT
                    da.confidence                      AS level,
                    COUNT(*)                           AS count,
                    COALESCE(SUM(da.area_ha), 0.0)     AS total_area_ha
                FROM deforestation_alerts da
                WHERE ST_Within(da.geometry, {geom})
                GROUP BY da.confidence
                ORDER BY
                    CASE da.confidence
                        WHEN 'high'    THEN 1
                        WHEN 'nominal' THEN 2
                        WHEN 'low'     THEN 3
                        ELSE 4
                    END
            """),
            params,
        )
    ).mappings().all()

    # 5. Yearly breakdown
    year_rows = (
        await db.execute(
            text(f"""
                SELECT
                    EXTRACT(YEAR FROM da.alert_date)::int  AS year,
                    COUNT(*)                               AS count,
                    COALESCE(SUM(da.area_ha), 0.0)         AS total_area_ha
                FROM deforestation_alerts da
                WHERE ST_Within(da.geometry, {geom})
                GROUP BY EXTRACT(YEAR FROM da.alert_date)
                ORDER BY year
            """),
            params,
        )
    ).mappings().all()

    count = int(alerts_row["count"])
    period = (
        f"{alerts_row['min_date'].isoformat()}/{alerts_row['max_date'].isoformat()}"
        if count > 0
        else "no alerts"
    )

    return AnalyseResponse(
        area_ha=float(area_row["area_ha"]),
        land_cover=land_cover,
        deforestation_alerts=DeforestationAlerts(
            count=count,
            area_ha=float(alerts_row["total_area_ha"]),
            period=period,
            by_confidence=[
                ConfidenceBreakdown(
                    level=r["level"],
                    count=int(r["count"]),
                    area_ha=float(r["total_area_ha"]),
                )
                for r in conf_rows
            ],
            by_year=[
                YearlyAlerts(
                    year=int(r["year"]),
                    count=int(r["count"]),
                    area_ha=float(r["total_area_ha"]),
                )
                for r in year_rows
            ],
        ),
        centroid=[float(area_row["lon"]), float(area_row["lat"])],
        alerts_live=alerts_live,
        alerts_fetched_at=datetime.now(timezone.utc),
    )
