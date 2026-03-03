from datetime import datetime
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator


class PointGeometry(BaseModel):
    type: Literal["Point"]
    coordinates: list[float]

    @field_validator("coordinates")
    @classmethod
    def must_have_two_ordinates(cls, v: list[float]) -> list[float]:
        if len(v) != 2:
            raise ValueError("Point coordinates must have exactly 2 values [lon, lat]")
        return v


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[list[float]]]

    @field_validator("coordinates")
    @classmethod
    def rings_must_have_min_four_positions(
        cls, v: list[list[list[float]]]
    ) -> list[list[list[float]]]:
        for ring in v:
            if len(ring) < 4:
                raise ValueError(
                    "Each polygon ring must have at least 4 positions (first = last)"
                )
        return v


Geometry = Annotated[
    Union[PointGeometry, PolygonGeometry],
    Field(discriminator="type"),
]


class AnalyseRequest(BaseModel):
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [28.9, -1.5],
                                [29.0, -1.5],
                                [29.0, -1.4],
                                [28.9, -1.4],
                                [28.9, -1.5],
                            ]
                        ],
                    }
                },
                {
                    "geometry": {"type": "Point", "coordinates": [28.95, -1.45]},
                    "buffer_km": 5.0,
                },
            ]
        }
    }

    geometry: Geometry
    buffer_km: float | None = None

    @field_validator("buffer_km")
    @classmethod
    def buffer_must_be_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("buffer_km must be greater than 0")
        return v


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
    alerts_live: bool
    alerts_fetched_at: datetime
