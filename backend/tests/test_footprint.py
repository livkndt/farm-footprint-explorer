import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

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


async def test_analyse_polygon_returns_200_with_correct_shape():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/footprint/analyse", json=POLYGON_BODY)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["area_ha"], float)
    assert isinstance(body["land_cover"], list)
    assert len(body["land_cover"]) > 0
    assert isinstance(body["land_cover"][0]["type"], str)
    assert isinstance(body["land_cover"][0]["percentage"], float)
    alerts = body["deforestation_alerts"]
    assert isinstance(alerts["count"], int)
    assert isinstance(alerts["area_ha"], float)
    assert isinstance(alerts["period"], str)
    centroid = body["centroid"]
    assert len(centroid) == 2
    assert all(isinstance(v, float) for v in centroid)


async def test_analyse_point_returns_200_with_correct_shape():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post("/footprint/analyse", json=POINT_BODY)

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["area_ha"], float)
    assert "land_cover" in body
    assert "deforestation_alerts" in body
    assert "centroid" in body


async def test_analyse_with_buffer_km_returns_200():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/footprint/analyse", json={**POLYGON_BODY, "buffer_km": 5.0}
        )

    assert response.status_code == 200


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
