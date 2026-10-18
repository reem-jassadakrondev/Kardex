"""Importing this package registers every model on Base.metadata (needed by Alembic)."""

from app.models.base import Base
from app.models.dt import DtBlockCount, DtPlayEvent, DtRound
from app.models.game import Game
from app.models.game_table import GameTable

__all__ = ["Base", "DtBlockCount", "DtPlayEvent", "DtRound", "Game", "GameTable"]
