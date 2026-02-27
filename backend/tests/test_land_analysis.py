from tests.conftest import seed_alert, seed_land_cover
from app.services.land_analysis import analyse_footprint

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
