import json
import os
import uuid
from datetime import date

import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.footprint import Base

TEST_DB_URL = os.getenv("TEST_DATABASE_URL") or os.environ["DATABASE_URL"]


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
        await session.rollback()  # undo all test writes; never commit

    await engine.dispose()


async def seed_land_cover(
    session: AsyncSession,
    geojson_dict: dict,
    cover_type: str,
    source: str = "esa_worldcover",
    year: int = 2021,
) -> None:
    await session.execute(
        text("""
            INSERT INTO land_cover_polygons (id, geometry, cover_type, source, year)
            VALUES (
                :id,
                ST_SetSRID(ST_GeomFromGeoJSON(:geojson), 4326),
                :cover_type, :source, :year
            )
        """),
        {
            "id": str(uuid.uuid4()),
            "geojson": json.dumps(geojson_dict),
            "cover_type": cover_type,
            "source": source,
            "year": year,
        },
    )


async def seed_alert(
    session: AsyncSession,
    lon: float,
    lat: float,
    area_ha: float,
    confidence: str,
    alert_date: date | None = None,
    source: str = "glad",
) -> None:
    await session.execute(
        text("""
            INSERT INTO deforestation_alerts (id, geometry, alert_date, confidence, area_ha, source)
            VALUES (
                :id,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                :alert_date, :confidence, :area_ha, :source
            )
        """),
        {
            "id": str(uuid.uuid4()),
            "lon": lon,
            "lat": lat,
            "alert_date": alert_date or date(2023, 6, 15),
            "confidence": confidence,
            "area_ha": area_ha,
            "source": source,
        },
    )
