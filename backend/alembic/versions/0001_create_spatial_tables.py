"""create spatial tables

Revision ID: 0001
Revises:
Create Date: 2026-02-27
"""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("""
        CREATE TABLE land_cover_polygons (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            geometry GEOMETRY(Polygon, 4326) NOT NULL,
            cover_type VARCHAR NOT NULL,
            source VARCHAR NOT NULL,
            year INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX ix_land_cover_polygons_geometry "
        "ON land_cover_polygons USING GIST (geometry)"
    )
    op.execute("""
        CREATE TABLE deforestation_alerts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            geometry GEOMETRY(Point, 4326) NOT NULL,
            alert_date DATE NOT NULL,
            confidence VARCHAR NOT NULL,
            area_ha FLOAT NOT NULL,
            source VARCHAR NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute(
        "CREATE INDEX ix_deforestation_alerts_geometry "
        "ON deforestation_alerts USING GIST (geometry)"
    )


def downgrade() -> None:
    op.drop_table("deforestation_alerts")
    op.drop_table("land_cover_polygons")
