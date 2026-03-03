import uuid

from geoalchemy2 import Geometry
from sqlalchemy import Column, Date, DateTime, Float, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class LandCoverPolygon(Base):
    __tablename__ = "land_cover_polygons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    geometry = Column(Geometry(geometry_type="POLYGON", srid=4326), nullable=False)
    cover_type = Column(String, nullable=False)
    source = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DeforestationAlert(Base):
    __tablename__ = "deforestation_alerts"
    __table_args__ = (
        UniqueConstraint(
            "longitude",
            "latitude",
            "alert_date",
            "source",
            name="uq_deforestation_alerts_location_date_source",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    geometry = Column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    alert_date = Column(Date, nullable=False)
    confidence = Column(String, nullable=False)
    area_ha = Column(Float, nullable=False)
    source = Column(String, nullable=False)
    longitude = Column(Float, nullable=True)
    latitude = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
