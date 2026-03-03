from datetime import date
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text

from app.services.alert_ingestion import ingest_alerts_for_geometry
from app.services.gfw_client import GFWAlert


def _make_settings():
    from app.config import Settings

    return Settings(
        gfw_api_key="test-key",
        gfw_api_base_url="https://data-api.globalforestwatch.org",
        gfw_alerts_lookback_days=365,
    )


_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]],
}

_SAMPLE_ALERTS = [
    GFWAlert(
        longitude=103.21,
        latitude=0.57,
        alert_date=date(2024, 3, 15),
        confidence="high",
    ),
    GFWAlert(
        longitude=103.22,
        latitude=0.58,
        alert_date=date(2024, 3, 16),
        confidence="medium",
    ),
]


async def test_ingest_inserts_new_alerts(db_session):
    with patch(
        "app.services.alert_ingestion.fetch_deforestation_alerts",
        new_callable=AsyncMock,
        return_value=_SAMPLE_ALERTS,
    ):
        count, alive = await ingest_alerts_for_geometry(_POLYGON, db_session, _make_settings())

    assert alive is True
    row = (
        await db_session.execute(text("SELECT COUNT(*) FROM deforestation_alerts"))
    ).scalar_one()
    assert row == len(_SAMPLE_ALERTS)


async def test_ingest_skips_duplicate_alerts(db_session):
    with patch(
        "app.services.alert_ingestion.fetch_deforestation_alerts",
        new_callable=AsyncMock,
        return_value=_SAMPLE_ALERTS,
    ):
        await ingest_alerts_for_geometry(_POLYGON, db_session, _make_settings())
        await ingest_alerts_for_geometry(_POLYGON, db_session, _make_settings())

    row = (
        await db_session.execute(text("SELECT COUNT(*) FROM deforestation_alerts"))
    ).scalar_one()
    assert row == len(_SAMPLE_ALERTS)


async def test_ingest_returns_correct_new_count(db_session):
    with patch(
        "app.services.alert_ingestion.fetch_deforestation_alerts",
        new_callable=AsyncMock,
        return_value=_SAMPLE_ALERTS,
    ):
        first_count, _ = await ingest_alerts_for_geometry(_POLYGON, db_session, _make_settings())
        second_count, _ = await ingest_alerts_for_geometry(_POLYGON, db_session, _make_settings())

    assert first_count == len(_SAMPLE_ALERTS)
    assert second_count == 0


async def test_ingest_handles_gfw_failure_gracefully(db_session):
    with patch(
        "app.services.alert_ingestion.fetch_deforestation_alerts",
        new_callable=AsyncMock,
        side_effect=RuntimeError("GFW API is down"),
    ):
        count, alive = await ingest_alerts_for_geometry(_POLYGON, db_session, _make_settings())

    assert count == 0
    assert alive is False
    row = (
        await db_session.execute(text("SELECT COUNT(*) FROM deforestation_alerts"))
    ).scalar_one()
    assert row == 0
