"""add longitude/latitude columns and unique constraint to deforestation_alerts

Revision ID: 0002
Revises: 0001
Create Date: 2026-03-02
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deforestation_alerts", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("deforestation_alerts", sa.Column("latitude", sa.Float(), nullable=True))
    op.create_unique_constraint(
        "uq_deforestation_alerts_location_date_source",
        "deforestation_alerts",
        ["longitude", "latitude", "alert_date", "source"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_deforestation_alerts_location_date_source",
        "deforestation_alerts",
        type_="unique",
    )
    op.drop_column("deforestation_alerts", "latitude")
    op.drop_column("deforestation_alerts", "longitude")
