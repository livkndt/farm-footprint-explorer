import logging
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.gfw_client import fetch_deforestation_alerts

logger = logging.getLogger(__name__)

_SOURCE = "gfw_integrated_alerts"
# asyncpg limits positional params to ~32,767 per query. Each row uses 8 params
# (id, lon×2, lat×2, date, confidence, source), so 500 rows ≈ 4,000 params.
_BATCH_SIZE = 500


async def ingest_alerts_for_geometry(
    geometry: dict,
    db: AsyncSession,
    settings,
) -> tuple[int, bool]:
    """Fetch live GFW alerts for the geometry and upsert into the DB.

    Returns (new_row_count, alerts_live). alerts_live is False when the GFW
    fetch failed and the function fell back to cached data.
    """
    try:
        alerts = await fetch_deforestation_alerts(
            geometry=geometry,
            lookback_days=settings.gfw_alerts_lookback_days,
            api_key=settings.gfw_api_key,
            base_url=settings.gfw_api_base_url,
        )
    except Exception as exc:
        logger.warning("GFW fetch failed — falling back to cached data: %s", exc)
        return 0, False

    if not alerts:
        return 0, True

    new_count = 0
    for batch_start in range(0, len(alerts), _BATCH_SIZE):
        batch = alerts[batch_start : batch_start + _BATCH_SIZE]
        params: dict = {}
        value_rows: list[str] = []
        for i, alert in enumerate(batch):
            params[f"id_{i}"] = str(uuid.uuid4())
            params[f"lon_{i}"] = alert.longitude
            params[f"lat_{i}"] = alert.latitude
            params[f"date_{i}"] = alert.alert_date
            params[f"conf_{i}"] = alert.confidence
            params[f"src_{i}"] = _SOURCE
            value_rows.append(
                f"(:{f'id_{i}'},"
                f" ST_SetSRID(ST_MakePoint(:{f'lon_{i}'}, :{f'lat_{i}'}), 4326),"
                f" :{f'date_{i}'}, :{f'conf_{i}'}, 0.0, :{f'src_{i}'},"
                f" :{f'lon_{i}'}, :{f'lat_{i}'})"
            )
        values_sql = ", ".join(value_rows)
        result = await db.execute(
            text(f"""
                INSERT INTO deforestation_alerts
                    (id, geometry, alert_date, confidence, area_ha, source, longitude, latitude)
                VALUES {values_sql}
                ON CONFLICT (longitude, latitude, alert_date, source) DO NOTHING
                RETURNING id
            """),
            params,
        )
        new_count += len(result.fetchall())

    logger.info("Ingested %d new alerts (of %d fetched)", new_count, len(alerts))
    return new_count, True
