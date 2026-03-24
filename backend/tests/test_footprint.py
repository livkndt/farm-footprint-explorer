import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock

from app.config import Settings, get_settings
from app.db import get_db
from app.main import app
from app.schemas.footprint import LandCoverItem
from tests.conftest import seed_alert, seed_land_cover

# 0.5° × 0.5° at the equator ≈ 309,800 ha — well within the 500,000 ha limit
POLYGON_BODY = {
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [[0.0, 0.0], [0.5, 0.0], [0.5, 0.5], [0.0, 0.5], [0.0, 0.0]]
        ],
    }
}

POINT_BODY = {
    "geometry": {"type": "Point", "coordinates": [10.0, 20.0]}
}

_SEED_POLYGON = POLYGON_BODY["geometry"]


@pytest.fixture(autouse=True)
def mock_ingest(monkeypatch):
    """Prevent any test in this module from making real GFW HTTP calls."""
    import app.services.land_analysis as la

    monkeypatch.setattr(
        la, "ingest_alerts_for_geometry", AsyncMock(return_value=(0, True))
    )


@pytest.fixture(autouse=True)
def mock_land_cover(monkeypatch):
    """Return deterministic land cover so tests don't call the GFW land cover API."""
    import app.services.land_analysis as la

    monkeypatch.setattr(
        la,
        "fetch_land_cover",
        AsyncMock(
            return_value=[
                LandCoverItem(type="tree_cover", percentage=70.0),
                LandCoverItem(type="cropland", percentage=30.0),
            ]
        ),
    )


@pytest_asyncio.fixture
async def client_with_db(db_session):
    from datetime import date

    await seed_land_cover(db_session, _SEED_POLYGON, "tree_cover")
    # Two high-confidence alerts in 2023, one nominal in 2024 — all inside the 0.5°×0.5° polygon
    await seed_alert(db_session, 0.1, 0.1, 1.0, "high", alert_date=date(2023, 6, 15))
    await seed_alert(db_session, 0.2, 0.2, 0.5, "high", alert_date=date(2023, 9, 1))
    await seed_alert(db_session, 0.3, 0.3, 0.8, "nominal", alert_date=date(2024, 3, 10))

    async def override_db():
        yield db_session

    def override_settings():
        return Settings(
            gfw_api_key="test-key",
            gfw_api_base_url="https://example.com",
            gfw_alerts_lookback_days=365,
        )

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = override_settings
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client
    app.dependency_overrides.clear()


async def test_analyse_polygon_returns_200_with_data(client_with_db):
    response = await client_with_db.post("/footprint/analyse", json=POLYGON_BODY)
    assert response.status_code == 200
    body = response.json()
    assert body["area_ha"] > 0
    assert isinstance(body["land_cover"], list)
    assert body["deforestation_alerts"]["count"] == 3
    assert body["deforestation_alerts"]["area_ha"] > 0
    assert body["deforestation_alerts"]["period"] != "no alerts"
    assert len(body["centroid"]) == 2
    assert all(isinstance(v, float) for v in body["centroid"])


async def test_alerts_by_confidence_breakdown(client_with_db):
    response = await client_with_db.post("/footprint/analyse", json=POLYGON_BODY)
    assert response.status_code == 200
    by_conf = response.json()["deforestation_alerts"]["by_confidence"]
    assert isinstance(by_conf, list)
    levels = {item["level"]: item for item in by_conf}
    assert "high" in levels
    assert "nominal" in levels
    assert levels["high"]["count"] == 2
    assert abs(levels["high"]["area_ha"] - 1.5) < 0.01
    assert levels["nominal"]["count"] == 1
    assert abs(levels["nominal"]["area_ha"] - 0.8) < 0.01


async def test_alerts_by_year_breakdown(client_with_db):
    response = await client_with_db.post("/footprint/analyse", json=POLYGON_BODY)
    assert response.status_code == 200
    by_year = response.json()["deforestation_alerts"]["by_year"]
    assert isinstance(by_year, list)
    years = {item["year"]: item for item in by_year}
    assert 2023 in years
    assert 2024 in years
    assert years[2023]["count"] == 2
    assert years[2024]["count"] == 1
    # Years should be returned in ascending order
    assert by_year == sorted(by_year, key=lambda x: x["year"])


async def test_analyse_point_returns_200(client_with_db):
    response = await client_with_db.post("/footprint/analyse", json=POINT_BODY)
    assert response.status_code == 200
    body = response.json()
    assert body["area_ha"] > 0
    assert "land_cover" in body
    assert "deforestation_alerts" in body
    assert isinstance(body["deforestation_alerts"]["period"], str)


async def test_analyse_with_buffer_km_returns_200(client_with_db):
    response = await client_with_db.post(
        "/footprint/analyse", json={**POLYGON_BODY, "buffer_km": 5.0}
    )
    assert response.status_code == 200
    assert response.json()["area_ha"] > 0


async def test_analyse_unknown_geometry_type_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/footprint/analyse",
            json={"geometry": {"type": "MultiPolygon", "coordinates": []}},
        )
    assert response.status_code == 422


async def test_analyse_missing_geometry_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/footprint/analyse", json={})
    assert response.status_code == 422


async def test_analyse_point_with_wrong_ordinate_count_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/footprint/analyse",
            json={"geometry": {"type": "Point", "coordinates": [0.0]}},
        )
    assert response.status_code == 422


async def test_analyse_polygon_ring_too_short_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/footprint/analyse",
            json={"geometry": {"type": "Polygon", "coordinates": [[[0.0, 0.0], [1.0, 0.0]]]}},
        )
    assert response.status_code == 422


async def test_analyse_polygon_returns_land_cover(client_with_db):
    response = await client_with_db.post("/footprint/analyse", json=POLYGON_BODY)
    assert response.status_code == 200
    land_cover = response.json()["land_cover"]
    assert len(land_cover) > 0
    assert all("type" in item and "percentage" in item for item in land_cover)
    types = {item["type"] for item in land_cover}
    assert "tree_cover" in types


async def test_analyse_buffer_km_zero_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/footprint/analyse",
            json={**POLYGON_BODY, "buffer_km": 0},
        )
    assert response.status_code == 422


# --- Size validation tests ---

# A polygon that spans roughly 100° × 100° — far larger than the limit
_OVERSIZED_POLYGON = {
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [
                [-50.0, -50.0],
                [50.0, -50.0],
                [50.0, 50.0],
                [-50.0, 50.0],
                [-50.0, -50.0],
            ]
        ],
    }
}


async def test_oversized_polygon_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/footprint/analyse", json=_OVERSIZED_POLYGON)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("area" in str(d).lower() for d in detail)


async def test_oversized_polygon_error_mentions_limit():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/footprint/analyse", json=_OVERSIZED_POLYGON)
    assert response.status_code == 422
    # The error message should mention the maximum area so users know the constraint
    body_text = response.text
    assert "500,000" in body_text or "500000" in body_text
