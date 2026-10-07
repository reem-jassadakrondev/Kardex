from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id: Mapped[str] = mapped_column(ForeignKey("game_sessions.id"), nullable=False)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    player_cards: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    banker_cards: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    player_score: Mapped[int] = mapped_column(Integer, nullable=False)
    banker_score: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    is_player_pair: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_banker_pair: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_natural: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    session: Mapped["GameSession"] = relationship(back_populates="rounds")
