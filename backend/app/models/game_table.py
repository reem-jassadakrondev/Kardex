from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GameTable(Base):
    """A physical table whose rounds are recorded on the color grid. Each table's data is separate."""

    __tablename__ = "game_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    game_code: Mapped[str] = mapped_column(ForeignKey("games.code"), nullable=False)
    plays_per_round: Mapped[int] = mapped_column(SmallInteger, default=60, nullable=False)
    # Bumped on every grid write; clients send the version they saw (optimistic lock across devices).
    version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    # Soft delete: set = in the trash (hidden, read-only, restorable). Purging removes the rows for good.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
