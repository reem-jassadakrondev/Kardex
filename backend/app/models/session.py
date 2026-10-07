from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class GameSession(Base):
    __tablename__ = "game_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    game_code: Mapped[str] = mapped_column(ForeignKey("games.code"), nullable=False)
    deck_count: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    total_initial_cards: Mapped[int] = mapped_column(Integer, default=416, nullable=False)
    cards_remaining: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    total_cards_remaining: Mapped[int] = mapped_column(Integer, default=416, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    rounds: Mapped[list["Round"]] = relationship(back_populates="session")
    game: Mapped["Game"] = relationship("Game", backref="sessions")
