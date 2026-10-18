"""Dragon Tiger color grid (phase 1). See README → แผนเฟส 1 → การออกแบบฐานข้อมูล."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# SQLite only auto-increments INTEGER PRIMARY KEY columns.
BigIntPK = BigInteger().with_variant(Integer(), "sqlite")


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DtRound(Base):
    """One row of the grid: up to plays_per_round results, one character per play."""

    __tablename__ = "dt_rounds"

    table_id: Mapped[int] = mapped_column(ForeignKey("game_tables.id"), primary_key=True)
    # 1..N per table with no gaps (only the last round can ever be removed).
    round_no: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    # 'R' 'B' 'Y' 'K' 'G' per play, '-' for a play that was skipped (not recorded).
    results: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    # open | complete | ended_early
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class DtBlockCount(Base):
    """Pre-aggregated color counts per column for each block of BLOCK_SIZE rounds."""

    __tablename__ = "dt_block_counts"

    # Key order matches the stats query: table + position fixed, range over block_no.
    table_id: Mapped[int] = mapped_column(ForeignKey("game_tables.id"), primary_key=True)
    position: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    block_no: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    color: Mapped[str] = mapped_column(String(1), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class DtPlayEvent(Base):
    """Append-only audit log of every grid change."""

    __tablename__ = "dt_play_events"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("game_tables.id"), index=True, nullable=False)
    round_no: Mapped[int] = mapped_column(BigInteger, nullable=False)
    position: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # add | skip | delete | end_round | discard_round
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    # The color added/removed; for discard_round the discarded results string.
    value: Mapped[str | None] = mapped_column(String(60), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
