"""Dragon Tiger color grid: dt_rounds, dt_block_counts, dt_play_events, game_tables.version.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-18
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("game_tables") as batch:
        batch.add_column(sa.Column("version", sa.Integer(), server_default="0", nullable=False))

    op.create_table(
        "dt_rounds",
        sa.Column("table_id", sa.Integer(), sa.ForeignKey("game_tables.id"), primary_key=True),
        sa.Column("round_no", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("results", sa.String(60), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "dt_block_counts",
        sa.Column("table_id", sa.Integer(), sa.ForeignKey("game_tables.id"), primary_key=True),
        sa.Column("position", sa.SmallInteger(), primary_key=True, autoincrement=False),
        sa.Column("block_no", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("color", sa.String(1), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
    )
    op.create_table(
        "dt_play_events",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True, autoincrement=True),
        sa.Column("table_id", sa.Integer(), sa.ForeignKey("game_tables.id"), nullable=False),
        sa.Column("round_no", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("value", sa.String(60), nullable=True),
        sa.Column("device_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_dt_play_events_table_id", "dt_play_events", ["table_id"])


def downgrade() -> None:
    op.drop_index("ix_dt_play_events_table_id", table_name="dt_play_events")
    op.drop_table("dt_play_events")
    op.drop_table("dt_block_counts")
    op.drop_table("dt_rounds")
    with op.batch_alter_table("game_tables") as batch:
        batch.drop_column("version")
