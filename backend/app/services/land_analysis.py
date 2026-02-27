from __future__ import annotations

import json

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.footprint import AnalyseResponse, DeforestationAlerts, LandCoverItem

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


async def analyse_footprint(
    geometry: dict,
    db: AsyncSession,
    buffer_km: float | None = None,
) -> AnalyseResponse:
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
        ),
        centroid=[float(area_row["lon"]), float(area_row["lat"])],
    )
