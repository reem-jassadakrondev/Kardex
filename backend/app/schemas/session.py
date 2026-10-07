from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ShoeState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_cards_remaining: int = 416
    cards_remaining: dict[str, int] = Field(default_factory=dict)
    probability: dict[str, float] = Field(default_factory=dict)


class SessionCreateResponse(BaseModel):
    session_id: UUID
    shoe: ShoeState


class RoundCreatePayload(BaseModel):
    round_number: Optional[int] = None
    player_cards: Optional[list[str]] = None
    banker_cards: Optional[list[str]] = None
    result: Optional[str] = None
    player_score: Optional[int] = None
    banker_score: Optional[int] = None


class RoundRecord(BaseModel):
    id: UUID
    session_id: UUID
    round_number: int
    player_cards: list[str]
    banker_cards: list[str]
    player_score: int
    banker_score: int
    result: str
    is_player_pair: bool
    is_banker_pair: bool
    is_natural: bool
    created_at: Any


class SessionDetail(BaseModel):
    id: UUID
    game_code: str
    deck_count: int
    total_initial_cards: int
    total_cards_remaining: int
    cards_remaining: dict[str, int]
    probability: dict[str, float]
    status: str
