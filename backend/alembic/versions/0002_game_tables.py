"""Add game_tables with a default Dragon Tiger table.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-18
"""
from __future__ import annotations

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    game_tables = op.create_table(
        "game_tables",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("game_code", sa.String(50), sa.ForeignKey("games.code"), nullable=False),
        sa.Column("plays_per_round", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.bulk_insert(
        game_tables,
        [
            {
                "code": "dt-1",
                "name": "โต๊ะ 1",
                "game_code": "dragon_tiger",
                "plays_per_round": 60,
                "created_at": datetime.now(timezone.utc),
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("game_tables")
