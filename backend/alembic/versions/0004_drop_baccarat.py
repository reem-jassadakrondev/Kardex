"""Drop the Baccarat prototype: game_sessions, rounds, and every game except dragon_tiger.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-18
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

OTHER_GAMES = [
    {"code": "baccarat", "name": "Baccarat", "is_active": True, "rules_config": {"min_deck_count": 1, "max_deck_count": 12}},
    {"code": "pokdeng", "name": "โพกเด้ง", "is_active": False, "rules_config": {"min_deck_count": 1, "max_deck_count": 6}},
    {"code": "sic_bo", "name": "Sic Bo", "is_active": False, "rules_config": {"min_deck_count": 1, "max_deck_count": 4}},
]


def upgrade() -> None:
    op.drop_table("rounds")
    op.drop_table("game_sessions")
    op.execute(sa.text("DELETE FROM games WHERE code <> 'dragon_tiger'"))


def downgrade() -> None:
    games = sa.table(
        "games",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("rules_config", sa.JSON),
    )
    op.bulk_insert(games, OTHER_GAMES)
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
