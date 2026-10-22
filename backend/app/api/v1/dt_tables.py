"""Color grid API (one table's rounds, stats and writes). All endpoints accept from_round/to_round or last_rounds to scope the stats."""

from __future__ import annotations

from collections.abc import Awaitable

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.dt import DtRound
from app.models.game_table import GameTable
from app.schemas.dt import (
    CalcOut,
    CursorOut,
    GridPage,
    MatchesOut,
    PlayIn,
    RangeOut,
    RoundOut,
    StatsOut,
    TableInfo,
    TableState,
    VersionIn,
    WriteResult,
)
from app.services import dt_grid, matching

router = APIRouter(prefix="/tables", tags=["tables"])


class StatsRange:
    def __init__(
        self,
        from_round: int | None = Query(None, ge=1),
        to_round: int | None = Query(None, ge=1),
        last_rounds: int | None = Query(None, ge=1, description="Use the newest N rounds instead of from/to"),
    ) -> None:
        if from_round is not None and to_round is not None and from_round > to_round:
            raise HTTPException(status_code=422, detail="from_round must be <= to_round")
        if last_rounds is not None and (from_round is not None or to_round is not None):
            raise HTTPException(status_code=422, detail="Use either last_rounds or from_round/to_round")
        self.from_round = from_round
        self.to_round = to_round
        self.last_rounds = last_rounds


async def load_table(code: str, db: AsyncSession = Depends(get_db)) -> GameTable:
    table = await dt_grid.get_table(db, code)
    if table is None:
        raise HTTPException(status_code=404, detail=f"Table not found: {code}")
    return table


def round_out(row: DtRound) -> RoundOut:
    return RoundOut(round_no=row.round_no, results=row.results, status=row.status)


async def build_state(db: AsyncSession, table: GameTable, scope: StatsRange, last: DtRound | None = None, known_last: bool = False) -> dict:
    """Table state + stats. Pass `known_last=True` when the caller already has the newest round."""
    if not known_last:
        last = await dt_grid.last_round(db, table.id)
    cursor = dt_grid.cursor_of(last)
    stats = await dt_grid.compute_stats(db, table, last, scope.from_round, scope.to_round, scope.last_rounds)
    return {
        "table": TableInfo(code=table.code, name=table.name, plays_per_round=table.plays_per_round),
        "version": table.version,
        "total_rounds": last.round_no if last else 0,
        "cursor": CursorOut(round_no=cursor.round_no, position=cursor.position),
        "last_round_status": last.status if last else None,
        "stats": StatsOut(
            mode=stats.mode,
            round_no=stats.round_no,
            position=stats.position,
            range=RangeOut(from_round=stats.range_from, to_round=stats.range_to),
            sample_size=stats.sample_size,
            counts=stats.counts,
            percentages=stats.percentages,
        ),
    }


def grid_error(error: dt_grid.GridError) -> JSONResponse:
    content: dict = {"detail": str(error)}
    if isinstance(error, dt_grid.VersionConflict):
        content["current_version"] = error.current_version
    return JSONResponse(status_code=error.status_code, content=content)


async def write_response(db: AsyncSession, scope: StatsRange, write: Awaitable[dt_grid.WriteOutcome]):
    try:
        outcome = await write
    except dt_grid.GridError as error:
        return grid_error(error)
    return {
        **await build_state(db, outcome.table, scope, outcome.last, known_last=True),
        "round": round_out(outcome.round) if outcome.round else None,
        "removed_round_no": outcome.removed_round_no,
    }


@router.get("/{code}", response_model=TableState)
async def get_state(
    table: GameTable = Depends(load_table), scope: StatsRange = Depends(), db: AsyncSession = Depends(get_db)
) -> dict:
    return await build_state(db, table, scope)


@router.get("/{code}/grid", response_model=GridPage)
async def get_grid(
    table: GameTable = Depends(load_table),
    before_round: int | None = Query(None, ge=1),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> GridPage:
    rows = await dt_grid.list_rounds(db, table.id, before_round, limit)
    return GridPage(
        version=table.version,
        rounds=[round_out(row) for row in rows],
        has_more=bool(rows) and rows[0].round_no > 1,
    )


@router.get("/{code}/matches", response_model=MatchesOut)
async def get_matches(
    table: GameTable = Depends(load_table),
    scope: StatsRange = Depends(),
    window: int = Query(5, ge=0, le=60, description="compare the last N cells of the current round; 0 = all"),
    before_round: int | None = Query(None, ge=1),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> MatchesOut:
    last = await dt_grid.last_round(db, table.id)
    m = await matching.find_matches(
        db, table, last, window, scope.from_round, scope.to_round, scope.last_rounds, before_round, limit
    )
    return MatchesOut(
        version=table.version,
        round_no=m.round_no,
        position=m.position,
        window_from=m.window_from,
        window_to=m.window_to,
        pattern=m.pattern,
        range=RangeOut(from_round=m.range_from, to_round=m.range_to),
        total_matches=m.total,
        sample_size=m.sample_size,
        counts=m.counts,
        percentages=m.percentages,
        rounds=[round_out(row) for row in m.rounds],
        has_more=m.has_more,
    )


def _percent(counts: dict[str, int]) -> dict[str, float]:
    n = sum(counts.values())
    return {color: round(count * 100 / n, 1) if n else 0.0 for color, count in counts.items()}


@router.get("/{code}/calc", response_model=CalcOut)
async def get_calc(
    table: GameTable = Depends(load_table),
    scope: StatsRange = Depends(),
    pattern: str = Query("", pattern=r"^[RBJ-]{0,60}$", description="typed row: R red, B blue, J joker, - skip"),
    window: int = Query(5, ge=0, le=60, description="compare the last N typed cells; 0 = all"),
    before_round: int | None = Query(None, ge=1),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
) -> CalcOut:
    """Read-only: nothing is written, the typed row only lives on the device."""
    last = await dt_grid.last_round(db, table.id)
    m = await matching.match_pattern(
        db, table, last, pattern, window, scope.from_round, scope.to_round, scope.last_rounds, before_round, limit
    )
    return CalcOut(
        version=table.version,
        position=m.position,
        window_from=m.window_from,
        window_to=m.window_to,
        pattern=m.pattern,
        range=RangeOut(from_round=m.range_from, to_round=m.range_to),
        total_matches=m.total,
        sample_size=m.sample_size,
        counts=m.counts,
        percentages=m.percentages,
        all_sample_size=sum(m.all_counts.values()),
        all_counts=m.all_counts,
        all_percentages=_percent(m.all_counts),
        rounds=[round_out(row) for row in m.rounds],
        has_more=m.has_more,
    )


# Writes take the table code directly: the version-check UPDATE also loads the table (one round-trip).


@router.post("/{code}/plays", response_model=WriteResult)
async def add_play(
    code: str,
    body: PlayIn,
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    return await write_response(db, scope, dt_grid.add_play(db, code, body.value, body.version, x_device_id))


@router.delete("/{code}/plays/last", response_model=WriteResult)
async def delete_last(
    code: str,
    version: int = Query(..., ge=0),
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    return await write_response(db, scope, dt_grid.delete_last(db, code, version, x_device_id))


@router.post("/{code}/rounds/current/end", response_model=WriteResult)
async def end_round(
    code: str,
    body: VersionIn,
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    return await write_response(db, scope, dt_grid.end_round(db, code, body.version, x_device_id))


@router.delete("/{code}/rounds/current", response_model=WriteResult)
async def discard_round(
    code: str,
    version: int = Query(..., ge=0),
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    return await write_response(db, scope, dt_grid.discard_round(db, code, version, x_device_id))
