"""Dragon Tiger color grid API. All endpoints accept from_round/to_round to scope the stats."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.dt import DtRound
from app.models.game_table import GameTable
from app.schemas.dt import (
    CursorOut,
    GridPage,
    PlayIn,
    RangeOut,
    RoundOut,
    StatsOut,
    TableInfo,
    TableState,
    VersionIn,
    WriteResult,
)
from app.services import dt_grid

router = APIRouter(prefix="/tables", tags=["tables"])


class StatsRange:
    def __init__(
        self,
        from_round: int | None = Query(None, ge=1),
        to_round: int | None = Query(None, ge=1),
    ) -> None:
        if from_round is not None and to_round is not None and from_round > to_round:
            raise HTTPException(status_code=422, detail="from_round must be <= to_round")
        self.from_round = from_round
        self.to_round = to_round


async def load_table(code: str, db: AsyncSession = Depends(get_db)) -> GameTable:
    table = await dt_grid.get_table(db, code)
    if table is None:
        raise HTTPException(status_code=404, detail=f"Table not found: {code}")
    return table


def round_out(row: DtRound) -> RoundOut:
    return RoundOut(round_no=row.round_no, results=row.results, status=row.status)


async def build_state(db: AsyncSession, table: GameTable, scope: StatsRange) -> dict:
    last = await dt_grid.last_round(db, table.id)
    cursor = dt_grid.cursor_of(last)
    stats = await dt_grid.compute_stats(db, table, last, scope.from_round, scope.to_round)
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


@router.post("/{code}/plays", response_model=WriteResult)
async def add_play(
    body: PlayIn,
    table: GameTable = Depends(load_table),
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    try:
        row = await dt_grid.add_play(db, table, body.value, body.version, x_device_id)
    except dt_grid.GridError as error:
        return grid_error(error)
    return {**await build_state(db, table, scope), "round": round_out(row)}


@router.delete("/{code}/plays/last", response_model=WriteResult)
async def delete_last(
    version: int = Query(..., ge=0),
    table: GameTable = Depends(load_table),
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    try:
        row, round_no = await dt_grid.delete_last(db, table, version, x_device_id)
    except dt_grid.GridError as error:
        return grid_error(error)
    return {
        **await build_state(db, table, scope),
        "round": round_out(row) if row else None,
        "removed_round_no": None if row else round_no,
    }


@router.post("/{code}/rounds/current/end", response_model=WriteResult)
async def end_round(
    body: VersionIn,
    table: GameTable = Depends(load_table),
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    try:
        row = await dt_grid.end_round(db, table, body.version, x_device_id)
    except dt_grid.GridError as error:
        return grid_error(error)
    return {**await build_state(db, table, scope), "round": round_out(row)}


@router.delete("/{code}/rounds/current", response_model=WriteResult)
async def discard_round(
    version: int = Query(..., ge=0),
    table: GameTable = Depends(load_table),
    scope: StatsRange = Depends(),
    db: AsyncSession = Depends(get_db),
    x_device_id: str | None = Header(None, max_length=64),
):
    try:
        round_no = await dt_grid.discard_round(db, table, version, x_device_id)
    except dt_grid.GridError as error:
        return grid_error(error)
    return {**await build_state(db, table, scope), "round": None, "removed_round_no": round_no}
