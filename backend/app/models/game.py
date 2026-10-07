from __future__ import annotations

from sqlalchemy import Boolean, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Game(Base):
    __tablename__ = "games"

    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rules_config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
