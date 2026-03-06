from unittest.mock import AsyncMock, patch

from app.config import Settings
from app.schemas.footprint import AnalyseResponse
from app.services.land_analysis import _to_gfw_polygon, analyse_footprint
from tests.conftest import seed_alert, seed_land_cover


def _test_settings() -> Settings:
    return Settings(
        gfw_api_key="test-key",
        gfw_api_base_url="https://example.com",
        gfw_alerts_lookback_days=365,
    )

ANALYSIS_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0.0, 5.0], [0.1, 5.0], [0.1, 5.1], [0.0, 5.1], [0.0, 5.0]]],
}
OVERLAP_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0.05, 5.0], [0.15, 5.0], [0.15, 5.1], [0.05, 5.1], [0.05, 5.0]]],
}


async def test_analyse_returns_nonzero_area(db_session):
    result = await analyse_footprint(ANALYSIS_POLYGON, db_session)
    assert result.area_ha > 0


async def test_analyse_land_cover_types(db_session):
    await seed_land_cover(db_session, ANALYSIS_POLYGON, "tree_cover")
    await seed_land_cover(db_session, OVERLAP_POLYGON, "cropland")
    result = await analyse_footprint(ANALYSIS_POLYGON, db_session)
    types = {item.type for item in result.land_cover}
    assert "tree_cover" in types
    assert "cropland" in types
    total_pct = sum(item.percentage for item in result.land_cover)
    assert abs(total_pct - 100.0) < 1.0


async def test_analyse_deforestation_count(db_session):
    await seed_alert(db_session, 0.05, 5.05, 2.5, "high")  # inside
    await seed_alert(db_session, 10.0, 10.0, 99.0, "low")  # outside
    result = await analyse_footprint(ANALYSIS_POLYGON, db_session)
    assert result.deforestation_alerts.count == 1
    assert abs(result.deforestation_alerts.area_ha - 2.5) < 0.01


async def test_analyse_point_with_buffer(db_session):
    await seed_land_cover(db_session, ANALYSIS_POLYGON, "tree_cover")
    point = {"type": "Point", "coordinates": [0.05, 5.05]}
    result = await analyse_footprint(point, db_session, buffer_km=10.0)
    assert result.area_ha > 0
    assert len(result.land_cover) > 0


async def test_analyse_empty_area_returns_safe_defaults(db_session):
    result = await analyse_footprint(ANALYSIS_POLYGON, db_session)
    assert result.area_ha > 0
    assert result.land_cover == []
    assert result.deforestation_alerts.count == 0
    assert result.deforestation_alerts.area_ha == 0.0
    assert isinstance(result.deforestation_alerts.period, str)


# --- Phase 6: GFW integration tests ---


async def test_analyse_footprint_calls_ingest(db_session):
    with patch(
        "app.services.land_analysis.ingest_alerts_for_geometry",
        new_callable=AsyncMock,
        return_value=(0, True),
    ) as mock_ingest:
        result = await analyse_footprint(
            geometry=ANALYSIS_POLYGON,
            db=db_session,
            settings=_test_settings(),
        )
        mock_ingest.assert_called_once()

    assert isinstance(result, AnalyseResponse)
    assert result.alerts_live is True


async def test_analyse_footprint_falls_back_to_cached_data(db_session):
    await seed_alert(db_session, 0.05, 5.05, 1.0, "high")

    with patch(
        "app.services.alert_ingestion.fetch_deforestation_alerts",
        new_callable=AsyncMock,
        side_effect=RuntimeError("GFW API down"),
    ):
        result = await analyse_footprint(
            geometry=ANALYSIS_POLYGON,
            db=db_session,
            settings=_test_settings(),
        )

    assert result.alerts_live is False
    assert result.deforestation_alerts.count == 1


# ---------------------------------------------------------------------------
# _to_gfw_polygon — pure unit tests (no DB required)
# ---------------------------------------------------------------------------

_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]],
}
_POINT = {"type": "Point", "coordinates": [10.0, 20.0]}


def test_to_gfw_polygon_returns_polygon_unchanged_when_no_buffer():
    result = _to_gfw_polygon(_POLYGON, buffer_km=None)
    assert result is _POLYGON


def test_to_gfw_polygon_buffers_point_to_polygon():
    result = _to_gfw_polygon(_POINT, buffer_km=None)
    assert result["type"] == "Polygon"
    lons = [c[0] for c in result["coordinates"][0]]
    lats = [c[1] for c in result["coordinates"][0]]
    assert min(lons) < 10.0 < max(lons)
    assert min(lats) < 20.0 < max(lats)


def test_to_gfw_polygon_buffers_polygon_when_buffer_km_given():
    result = _to_gfw_polygon(_POLYGON, buffer_km=10.0)
    assert result["type"] == "Polygon"
    lons = [c[0] for c in result["coordinates"][0]]
    lats = [c[1] for c in result["coordinates"][0]]
    assert min(lons) < 0.0  # extends beyond original west edge
    assert max(lons) > 1.0  # extends beyond original east edge


def test_to_gfw_polygon_larger_buffer_produces_larger_polygon():
    def bbox_area(geom: dict) -> float:
        coords = geom["coordinates"][0]
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        return (max(lons) - min(lons)) * (max(lats) - min(lats))

    small = _to_gfw_polygon(_POINT, buffer_km=1.0)
    large = _to_gfw_polygon(_POINT, buffer_km=10.0)
    assert bbox_area(large) > bbox_area(small)
