import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.db import get_db
from app.main import app
from tests.conftest import seed_alert, seed_land_cover

POLYGON_BODY = {
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]
        ],
    }
}

POINT_BODY = {
    "geometry": {"type": "Point", "coordinates": [10.0, 20.0]}
}

_SEED_POLYGON = POLYGON_BODY["geometry"]


@pytest_asyncio.fixture
async def client_with_db(db_session):
    await seed_land_cover(db_session, _SEED_POLYGON, "tree_cover")
    await seed_alert(db_session, 0.5, 0.5, 1.0, "high")

    async def override():
        yield db_session

    app.dependency_overrides[get_db] = override
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
    assert body["deforestation_alerts"]["count"] == 1
    assert body["deforestation_alerts"]["area_ha"] > 0
    assert body["deforestation_alerts"]["period"] != "no alerts"
    assert len(body["centroid"]) == 2
    assert all(isinstance(v, float) for v in body["centroid"])


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


async def test_analyse_buffer_km_zero_returns_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/footprint/analyse",
            json={**POLYGON_BODY, "buffer_km": 0},
        )
    assert response.status_code == 422
