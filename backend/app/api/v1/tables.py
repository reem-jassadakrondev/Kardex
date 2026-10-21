"""Table management (โต๊ะ): list / create / rename / trash / restore / purge. Grid endpoints live in dt_tables.py."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.dt import TableNameIn, TableSummaryOut
from app.services import tables
from app.services.tables import TableSummary

router = APIRouter(prefix="/tables", tags=["tables"])


def summary_out(summary: TableSummary) -> TableSummaryOut:
    table = summary.table
    return TableSummaryOut(
        code=table.code,
        name=table.name,
        plays_per_round=table.plays_per_round,
        total_rounds=summary.total_rounds,
        created_at=table.created_at,
        deleted_at=table.deleted_at,
    )


def table_error(error: tables.TableError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"detail": str(error)})


@router.get("", response_model=list[TableSummaryOut])
async def list_tables(deleted: bool = Query(False, description="true = tables in the trash"), db: AsyncSession = Depends(get_db)):
    return [summary_out(s) for s in await tables.list_tables(db, deleted)]


@router.post("", response_model=TableSummaryOut, status_code=201)
async def create_table(body: TableNameIn, db: AsyncSession = Depends(get_db)):
    try:
        return summary_out(await tables.create_table(db, body.name))
    except tables.TableError as error:
        return table_error(error)


@router.patch("/{code}", response_model=TableSummaryOut)
async def rename_table(code: str, body: TableNameIn, db: AsyncSession = Depends(get_db)):
    try:
        return summary_out(await tables.rename_table(db, code, body.name))
    except tables.TableError as error:
        return table_error(error)


@router.delete("/{code}", response_model=TableSummaryOut)
async def trash_table(code: str, db: AsyncSession = Depends(get_db)):
    try:
        return summary_out(await tables.trash_table(db, code))
    except tables.TableError as error:
        return table_error(error)


@router.post("/{code}/restore", response_model=TableSummaryOut)
async def restore_table(code: str, db: AsyncSession = Depends(get_db)):
    try:
        return summary_out(await tables.restore_table(db, code))
    except tables.TableError as error:
        return table_error(error)


@router.delete("/{code}/permanent", status_code=204)
async def purge_table(code: str, confirm_name: str = Query(..., description="exact table name"), db: AsyncSession = Depends(get_db)):
    try:
        await tables.purge_table(db, code, confirm_name)
    except tables.TableError as error:
        return table_error(error)
    return Response(status_code=204)
