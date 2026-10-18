from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GameTable(Base):
    """A physical/virtual table whose rounds are recorded (Dragon Tiger color grid from phase 1)."""

    __tablename__ = "game_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    game_code: Mapped[str] = mapped_column(ForeignKey("games.code"), nullable=False)
    plays_per_round: Mapped[int] = mapped_column(SmallInteger, default=60, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
