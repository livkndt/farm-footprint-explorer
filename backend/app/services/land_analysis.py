from app.schemas.footprint import (
    AnalyseRequest,
    AnalyseResponse,
    DeforestationAlerts,
    LandCoverItem,
)


def analyse(request: AnalyseRequest) -> AnalyseResponse:
    """Stub: returns hardcoded values with the correct shape. Real logic in Step 4."""
    return AnalyseResponse(
        area_ha=100.0,
        land_cover=[
            LandCoverItem(type="Forest", percentage=60.0),
            LandCoverItem(type="Cropland", percentage=40.0),
        ],
        deforestation_alerts=DeforestationAlerts(
            count=3,
            area_ha=5.2,
            period="2023-01-01/2024-01-01",
        ),
        centroid=[0.5, 0.5],
    )
