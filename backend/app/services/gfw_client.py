import logging
from datetime import date, timedelta

import httpx
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class GFWAlert(BaseModel):
    longitude: float
    latitude: float
    alert_date: date = Field(alias="gfw_integrated_alerts__date")
    confidence: str = Field(alias="gfw_integrated_alerts__confidence")

    model_config = ConfigDict(populate_by_name=True)


async def fetch_deforestation_alerts(
    geometry: dict,
    lookback_days: int,
    api_key: str,
    base_url: str,
) -> list[GFWAlert]:
    since = (date.today() - timedelta(days=lookback_days)).isoformat()
    sql = (
        "SELECT longitude, latitude, gfw_integrated_alerts__date, "
        "gfw_integrated_alerts__confidence FROM results "
        f"WHERE gfw_integrated_alerts__date >= '{since}'"
    )
    url = f"{base_url}/dataset/gfw_integrated_alerts/latest/query/json"

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.post(
            url,
            json={"sql": sql, "geometry": geometry},
            headers={"x-api-key": api_key, "Content-Type": "application/json"},
        )

    if response.status_code != 200:
        raise RuntimeError(
            f"GFW API returned HTTP {response.status_code}: {response.text[:200]}"
        )

    body = response.json()
    if body.get("status") == "error":
        raise RuntimeError(f"GFW API returned error status: {body}")

    alerts = [GFWAlert.model_validate(item) for item in body.get("data", [])]
    logger.info("GFW fetch returned %d alerts", len(alerts))
    return alerts
