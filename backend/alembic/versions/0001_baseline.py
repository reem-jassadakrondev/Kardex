"""Baseline: schema previously created by Base.metadata.create_all + default games.

Databases created before Alembic already have these tables: run `alembic stamp 0001` on them
once, then `alembic upgrade head`.

Revision ID: 0001
Revises:
Create Date: 2026-10-18
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    games = op.create_table(
        "games",
        sa.Column("code", sa.String(50), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("rules_config", sa.JSON(), nullable=False),
    )
    op.create_table(
        "game_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("game_code", sa.String(50), sa.ForeignKey("games.code"), nullable=False),
        sa.Column("deck_count", sa.Integer(), nullable=False),
        sa.Column("total_initial_cards", sa.Integer(), nullable=False),
        sa.Column("cards_remaining", sa.JSON(), nullable=False),
        sa.Column("total_cards_remaining", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "rounds",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("game_sessions.id"), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("player_cards", sa.JSON(), nullable=False),
        sa.Column("banker_cards", sa.JSON(), nullable=False),
        sa.Column("player_score", sa.Integer(), nullable=False),
        sa.Column("banker_score", sa.Integer(), nullable=False),
        sa.Column("result", sa.String(20), nullable=False),
        sa.Column("is_player_pair", sa.Boolean(), nullable=False),
        sa.Column("is_banker_pair", sa.Boolean(), nullable=False),
        sa.Column("is_natural", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.bulk_insert(
        games,
        [
            {"code": "baccarat", "name": "Baccarat", "is_active": True, "rules_config": {"min_deck_count": 1, "max_deck_count": 12}},
            {"code": "dragon_tiger", "name": "เสือมังกร", "is_active": True, "rules_config": {"min_deck_count": 1, "max_deck_count": 8}},
            {"code": "pokdeng", "name": "โพกเด้ง", "is_active": False, "rules_config": {"min_deck_count": 1, "max_deck_count": 6}},
            {"code": "sic_bo", "name": "Sic Bo", "is_active": False, "rules_config": {"min_deck_count": 1, "max_deck_count": 4}},
        ],
    )


def downgrade() -> None:
    op.drop_table("rounds")
    op.drop_table("game_sessions")
    op.drop_table("games")
