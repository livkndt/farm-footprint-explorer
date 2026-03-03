import json
from datetime import date, timedelta

import httpx
import pytest
import respx

from app.services.gfw_client import fetch_deforestation_alerts

_BASE_URL = "https://data-api.globalforestwatch.org"
_URL = f"{_BASE_URL}/dataset/gfw_integrated_alerts/latest/query/json"

_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]],
}

_SUCCESS_RESPONSE = {
    "status": "success",
    "data": [
        {
            "longitude": 103.21,
            "latitude": 0.57,
            "gfw_integrated_alerts__date": "2024-03-15",
            "gfw_integrated_alerts__confidence": "high",
        }
    ],
}


async def test_fetch_alerts_returns_parsed_alerts():
    with respx.mock:
        respx.post(_URL).mock(return_value=httpx.Response(200, json=_SUCCESS_RESPONSE))
        alerts = await fetch_deforestation_alerts(
            geometry=_POLYGON,
            lookback_days=365,
            api_key="test-key",
            base_url=_BASE_URL,
        )

    assert len(alerts) == 1
    assert alerts[0].longitude == 103.21
    assert alerts[0].latitude == 0.57
    assert alerts[0].alert_date == date(2024, 3, 15)
    assert alerts[0].confidence == "high"


async def test_fetch_alerts_raises_on_api_error():
    with respx.mock:
        respx.post(_URL).mock(return_value=httpx.Response(500, text="Internal Server Error"))
        with pytest.raises(RuntimeError, match="HTTP 500"):
            await fetch_deforestation_alerts(
                geometry=_POLYGON,
                lookback_days=365,
                api_key="test-key",
                base_url=_BASE_URL,
            )


async def test_fetch_alerts_raises_on_gfw_status_error():
    with respx.mock:
        respx.post(_URL).mock(
            return_value=httpx.Response(200, json={"status": "error", "message": "bad sql"})
        )
        with pytest.raises(RuntimeError, match="error status"):
            await fetch_deforestation_alerts(
                geometry=_POLYGON,
                lookback_days=365,
                api_key="test-key",
                base_url=_BASE_URL,
            )


async def test_fetch_alerts_applies_date_filter():
    with respx.mock:
        route = respx.post(_URL).mock(
            return_value=httpx.Response(200, json={"status": "success", "data": []})
        )
        await fetch_deforestation_alerts(
            geometry=_POLYGON,
            lookback_days=30,
            api_key="test-key",
            base_url=_BASE_URL,
        )

    request_body = json.loads(route.calls[0].request.content)
    expected_date = (date.today() - timedelta(days=30)).isoformat()
    assert expected_date in request_body["sql"]


async def test_fetch_alerts_passes_geometry():
    with respx.mock:
        route = respx.post(_URL).mock(
            return_value=httpx.Response(200, json={"status": "success", "data": []})
        )
        await fetch_deforestation_alerts(
            geometry=_POLYGON,
            lookback_days=365,
            api_key="test-key",
            base_url=_BASE_URL,
        )

    request_body = json.loads(route.calls[0].request.content)
    assert request_body["geometry"] == _POLYGON
