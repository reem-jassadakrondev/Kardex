"""Tables can be created/renamed/deleted by users: game_tables.deleted_at (soft delete, restorable).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("game_tables") as batch:
        batch.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("game_tables") as batch:
        batch.drop_column("deleted_at")
