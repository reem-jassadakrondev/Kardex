from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

PlayValue = Literal["R", "B", "Y", "K", "G", "-"]


class TableInfo(BaseModel):
    code: str
    name: str
    plays_per_round: int


class CursorOut(BaseModel):
    round_no: int
    position: int


class RangeOut(BaseModel):
    from_round: int | None
    to_round: int | None


class StatsOut(BaseModel):
    mode: Literal["column", "row", "none"]
    round_no: int
    position: int
    range: RangeOut
    sample_size: int
    counts: dict[str, int]
    percentages: dict[str, float]


class RoundOut(BaseModel):
    round_no: int
    results: str
    status: Literal["open", "complete", "ended_early"]


class TableState(BaseModel):
    table: TableInfo
    version: int
    total_rounds: int
    cursor: CursorOut
    last_round_status: Literal["open", "complete", "ended_early"] | None
    stats: StatsOut


class GridPage(BaseModel):
    version: int
    rounds: list[RoundOut]
    has_more: bool


class WriteResult(TableState):
    # The round touched by the write after the change; None when it was removed.
    round: RoundOut | None
    removed_round_no: int | None = None


class VersionIn(BaseModel):
    version: int = Field(..., ge=0)


class PlayIn(VersionIn):
    value: PlayValue
