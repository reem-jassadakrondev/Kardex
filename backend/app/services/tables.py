"""Managing tables (โต๊ะ): list, create, rename, move to the trash, restore, purge.

Every table records its own rounds; play data never mixes because all of it is keyed by table_id.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dt import DtBlockCount, DtPlayEvent, DtRound
from app.models.game_table import GameTable

GAME_CODE = "dragon_tiger"  # internal game type of the color grid
PLAYS_PER_ROUND = 60  # same for every table (customer, 2026-10-21)
NAME_MAX = 50


class TableError(Exception):
    status_code = 400


class NameTaken(TableError):
    status_code = 409

    def __init__(self, name: str) -> None:
        super().__init__(f"มีโต๊ะชื่อ '{name}' อยู่แล้ว")


class NotFound(TableError):
    status_code = 404

    def __init__(self, code: str) -> None:
        super().__init__(f"Table not found: {code}")


class ConfirmMismatch(TableError):
    status_code = 422

    def __init__(self) -> None:
        super().__init__("ชื่อโต๊ะที่พิมพ์ยืนยันไม่ตรง")


@dataclass
class TableSummary:
    table: GameTable
    total_rounds: int


def clean_name(name: str) -> str:
    name = " ".join(name.split())
    if not name or len(name) > NAME_MAX:
        raise TableError(f"ชื่อโต๊ะต้องมี 1–{NAME_MAX} ตัวอักษร")
    return name


def _total_rounds():
    # Correlated MAX over the (table_id, round_no) primary key: one index lookup per table.
    return (
        select(func.coalesce(func.max(DtRound.round_no), 0))
        .where(DtRound.table_id == GameTable.id)
        .correlate(GameTable)
        .scalar_subquery()
    )


async def list_tables(db: AsyncSession, deleted: bool = False) -> list[TableSummary]:
    stmt = select(GameTable, _total_rounds())
    if deleted:
        stmt = stmt.where(GameTable.deleted_at.is_not(None)).order_by(GameTable.deleted_at.desc())
    else:
        stmt = stmt.where(GameTable.deleted_at.is_(None)).order_by(GameTable.id)
    return [TableSummary(table, total) for table, total in (await db.execute(stmt)).all()]


async def _summary(db: AsyncSession, table: GameTable) -> TableSummary:
    total = (await db.execute(select(func.coalesce(func.max(DtRound.round_no), 0)).where(DtRound.table_id == table.id))).scalar_one()
    return TableSummary(table, total)


async def _find(db: AsyncSession, code: str, deleted: bool) -> GameTable:
    cond = GameTable.deleted_at.is_not(None) if deleted else GameTable.deleted_at.is_(None)
    table = (await db.execute(select(GameTable).where(GameTable.code == code, cond))).scalar_one_or_none()
    if table is None:
        raise NotFound(code)
    return table


async def _ensure_name_free(db: AsyncSession, name: str, except_id: int | None = None) -> None:
    """Names are unique among active tables (case-insensitive), so the home list is unambiguous."""
    stmt = select(GameTable.id).where(GameTable.deleted_at.is_(None), func.lower(GameTable.name) == name.lower())
    if except_id is not None:
        stmt = stmt.where(GameTable.id != except_id)
    if (await db.execute(stmt.limit(1))).first() is not None:
        raise NameTaken(name)


async def _new_code(db: AsyncSession) -> str:
    while True:
        code = f"t-{secrets.token_hex(3)}"
        if (await db.execute(select(GameTable.id).where(GameTable.code == code))).first() is None:
            return code


async def create_table(db: AsyncSession, name: str) -> TableSummary:
    name = clean_name(name)
    await _ensure_name_free(db, name)
    table = GameTable(code=await _new_code(db), name=name, game_code=GAME_CODE, plays_per_round=PLAYS_PER_ROUND, version=0)
    db.add(table)
    await db.commit()
    return TableSummary(table, 0)


async def rename_table(db: AsyncSession, code: str, name: str) -> TableSummary:
    name = clean_name(name)
    table = await _find(db, code, deleted=False)
    await _ensure_name_free(db, name, except_id=table.id)
    table.name = name
    await db.commit()
    return await _summary(db, table)


async def trash_table(db: AsyncSession, code: str) -> TableSummary:
    """Hide the table; its data stays and it can be restored. Writes from open pages then get 404."""
    table = await _find(db, code, deleted=False)
    table.deleted_at = datetime.now(timezone.utc)
    table.version += 1  # devices still showing the table reload and see it is gone
    await db.commit()
    return await _summary(db, table)


async def restore_table(db: AsyncSession, code: str) -> TableSummary:
    table = await _find(db, code, deleted=True)
    await _ensure_name_free(db, table.name, except_id=table.id)
    table.deleted_at = None
    await db.commit()
    return await _summary(db, table)


async def purge_table(db: AsyncSession, code: str, confirm_name: str) -> None:
    """Delete a trashed table and all of its rounds, counts and log for good."""
    table = await _find(db, code, deleted=True)
    if " ".join(confirm_name.split()) != table.name:
        raise ConfirmMismatch()
    for model in (DtPlayEvent, DtBlockCount, DtRound):
        await db.execute(delete(model).where(model.table_id == table.id))
    await db.delete(table)
    await db.commit()
