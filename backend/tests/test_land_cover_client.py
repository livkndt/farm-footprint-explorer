import json

import httpx
import pytest
import respx

from app.services.land_cover_client import fetch_land_cover

_BASE_URL = "https://data-api.globalforestwatch.org"
_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]],
}

_SUCCESS_RESPONSE = {
    "status": "success",
    "data": [
        {"esa_land_cover_2015__class": "Forest", "area__ha": 60.0},
        {"esa_land_cover_2015__class": "Agriculture", "area__ha": 40.0},
    ],
}

_DATASET_URL = f"{_BASE_URL}/dataset/esa_land_cover_2015/v2016/query/json"


async def test_fetch_land_cover_returns_parsed_items():
    with respx.mock:
        respx.post(_DATASET_URL).mock(
            return_value=httpx.Response(200, json=_SUCCESS_RESPONSE)
        )
        items = await fetch_land_cover(
            geometry=_POLYGON, api_key="test-key", base_url=_BASE_URL
        )

    assert len(items) == 2
    types = {item.type: item for item in items}
    assert "tree_cover" in types
    assert "cropland" in types
    assert abs(types["tree_cover"].percentage - 60.0) < 0.01
    assert abs(types["cropland"].percentage - 40.0) < 0.01


async def test_fetch_land_cover_percentages_sum_to_100():
    with respx.mock:
        respx.post(_DATASET_URL).mock(
            return_value=httpx.Response(200, json=_SUCCESS_RESPONSE)
        )
        items = await fetch_land_cover(
            geometry=_POLYGON, api_key="test-key", base_url=_BASE_URL
        )

    total = sum(item.percentage for item in items)
    assert abs(total - 100.0) < 0.01


async def test_fetch_land_cover_returns_empty_on_api_error():
    with respx.mock:
        respx.post(_DATASET_URL).mock(
            return_value=httpx.Response(500, text="Internal Server Error")
        )
        items = await fetch_land_cover(
            geometry=_POLYGON, api_key="test-key", base_url=_BASE_URL
        )

    assert items == []


async def test_fetch_land_cover_returns_empty_on_gfw_status_error():
    with respx.mock:
        respx.post(_DATASET_URL).mock(
            return_value=httpx.Response(200, json={"status": "error", "message": "bad sql"})
        )
        items = await fetch_land_cover(
            geometry=_POLYGON, api_key="test-key", base_url=_BASE_URL
        )

    assert items == []


async def test_fetch_land_cover_passes_geometry():
    with respx.mock:
        route = respx.post(_DATASET_URL).mock(
            return_value=httpx.Response(200, json={"status": "success", "data": []})
        )
        await fetch_land_cover(
            geometry=_POLYGON, api_key="test-key", base_url=_BASE_URL
        )

    request_body = json.loads(route.calls[0].request.content)
    assert request_body["geometry"] == _POLYGON


async def test_fetch_land_cover_returns_empty_when_no_data():
    with respx.mock:
        respx.post(_DATASET_URL).mock(
            return_value=httpx.Response(200, json={"status": "success", "data": []})
        )
        items = await fetch_land_cover(
            geometry=_POLYGON, api_key="test-key", base_url=_BASE_URL
        )

    assert items == []
