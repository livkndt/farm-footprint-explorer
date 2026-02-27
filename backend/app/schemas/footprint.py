from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


class PointGeometry(BaseModel):
    type: Literal["Point"]
    coordinates: list[float]


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[list[float]]]


Geometry = Annotated[
    Union[PointGeometry, PolygonGeometry],
    Field(discriminator="type"),
]


class AnalyseRequest(BaseModel):
    geometry: Geometry
    buffer_km: float | None = None


class LandCoverItem(BaseModel):
    type: str
    percentage: float


class DeforestationAlerts(BaseModel):
    count: int
    area_ha: float
    period: str


class AnalyseResponse(BaseModel):
    area_ha: float
    land_cover: list[LandCoverItem]
    deforestation_alerts: DeforestationAlerts
    centroid: list[float]  # [lon, lat]
