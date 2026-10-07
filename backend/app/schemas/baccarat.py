from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class BaccaratCardInput(BaseModel):
    suit: str = Field(..., pattern=r"^[HDSC]$")
    rank: str = Field(..., pattern=r"^[A23456789TJQK]$")


class BaccaratRoundInput(BaseModel):
    player_cards: Optional[list[str]] = None
    banker_cards: Optional[list[str]] = None
    result: Optional[str] = Field(default=None, pattern=r"^(player|banker|tie)$")
    player_score: Optional[int] = None
    banker_score: Optional[int] = None
