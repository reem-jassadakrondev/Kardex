"""Color grid (ตารางสถิติ): recording plays and computing hit rates ("อัตราการออก").

Every write bumps game_tables.version (optimistic lock) and keeps dt_block_counts in sync inside
the same transaction, so stats never need to scan raw rounds except at the edges of a range.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import NoReturn

from sqlalchemy import delete, func, or_, select, union_all, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dt import DtBlockCount, DtPlayEvent, DtRound
from app.models.game_table import GameTable

COLORS = ("R", "B", "Y", "K", "G")
SKIP = "-"
# Rounds per dt_block_counts block. A range query reads whole blocks from the counts table and scans
# at most 2 * (BLOCK_SIZE - 1) raw rounds at its edges.
BLOCK_SIZE = 1000

OPEN, COMPLETE, ENDED_EARLY = "open", "complete", "ended_early"


class GridError(Exception):
    """Base error; `status_code` maps to the HTTP response."""

    status_code = 400


class VersionConflict(GridError):
    status_code = 409

    def __init__(self, current_version: int) -> None:
        super().__init__(f"Table changed on another device (current version {current_version})")
        self.current_version = current_version


class InvalidAction(GridError):
    status_code = 409


class TableNotFound(GridError):
    status_code = 404

    def __init__(self, code: str) -> None:
        super().__init__(f"Table not found: {code}")


@dataclass
class Cursor:
    """Where the next play will be written."""

    round_no: int
    position: int


@dataclass
class WriteOutcome:
    table: GameTable
    round: DtRound | None  # the round touched by the write, after the change; None if it was removed
    removed_round_no: int | None
    last: DtRound | None  # newest round after the write (feeds cursor/stats without another query)


@dataclass
class Stats:
    mode: str  # column | row | none
    round_no: int
    position: int
    range_from: int | None
    range_to: int | None
    counts: dict[str, int] = field(default_factory=dict)

    @property
    def sample_size(self) -> int:
        return sum(self.counts.values())

    @property
    def percentages(self) -> dict[str, float]:
        n = self.sample_size
        return {color: round(self.counts[color] * 100 / n, 1) if n else 0.0 for color in COLORS}


def block_of(round_no: int) -> int:
    return (round_no - 1) // BLOCK_SIZE


def split_range(lo: int, hi: int) -> tuple[tuple[int, int] | None, list[tuple[int, int]]]:
    """Split rounds [lo, hi] into whole blocks (first_block, last_block) and edge round ranges to scan."""
    first_block = (lo - 1 + BLOCK_SIZE - 1) // BLOCK_SIZE  # first block starting at or after lo
    last_block = hi // BLOCK_SIZE - 1  # last block ending at or before hi
    if first_block > last_block:
        return None, [(lo, hi)]

    edges = []
    if lo <= first_block * BLOCK_SIZE:
        edges.append((lo, first_block * BLOCK_SIZE))
    if (last_block + 1) * BLOCK_SIZE + 1 <= hi:
        edges.append(((last_block + 1) * BLOCK_SIZE + 1, hi))
    return (first_block, last_block), edges


def cursor_of(last: DtRound | None) -> Cursor:
    if last is not None and last.status == OPEN:
        return Cursor(last.round_no, len(last.results) + 1)
    return Cursor((last.round_no + 1) if last else 1, 1)


async def get_table(db: AsyncSession, code: str) -> GameTable | None:
    """The table if it exists and is not in the trash."""
    stmt = select(GameTable).where(GameTable.code == code, GameTable.deleted_at.is_(None))
    return (await db.execute(stmt)).scalar_one_or_none()


async def last_round(db: AsyncSession, table_id: int) -> DtRound | None:
    stmt = select(DtRound).where(DtRound.table_id == table_id).order_by(DtRound.round_no.desc()).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_rounds(db: AsyncSession, table_id: int, before_round: int | None, limit: int) -> list[DtRound]:
    stmt = select(DtRound).where(DtRound.table_id == table_id)
    if before_round is not None:
        stmt = stmt.where(DtRound.round_no < before_round)
    stmt = stmt.order_by(DtRound.round_no.desc()).limit(limit)
    rows = list((await db.execute(stmt)).scalars())
    rows.reverse()
    return rows


# --- writes -----------------------------------------------------------------------------------
# Each write is one transaction: lock + bump the table version, change the round, adjust counts, log.


async def _lock_table(db: AsyncSession, code: str, expected_version: int) -> GameTable:
    """Bump the version if it still equals `expected_version` and return the table, in one statement.

    The conditional UPDATE also row-locks the table until commit, serializing concurrent writers.
    """
    stmt = (
        update(GameTable)
        .where(GameTable.code == code, GameTable.version == expected_version, GameTable.deleted_at.is_(None))
        .values(version=GameTable.version + 1)
        .returning(GameTable)
        .execution_options(synchronize_session=False, populate_existing=True)
    )
    table = (await db.execute(stmt)).scalar_one_or_none()
    if table is not None:
        return table

    await db.rollback()
    current = await get_table(db, code)
    if current is None:
        raise TableNotFound(code)
    raise VersionConflict(current.version)


async def _abort(db: AsyncSession, error: GridError) -> NoReturn:
    await db.rollback()
    raise error


async def _adjust_count(db: AsyncSession, table_id: int, round_no: int, position: int, color: str, delta: int) -> None:
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    stmt = insert(DtBlockCount).values(
        table_id=table_id, position=position, block_no=block_of(round_no), color=color, count=delta
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["table_id", "position", "block_no", "color"],
        set_={"count": DtBlockCount.count + delta},
    )
    await db.execute(stmt)


def _log(db: AsyncSession, table_id: int, round_no: int, position: int | None, action: str, value: str | None, device_id: str | None) -> None:
    db.add(DtPlayEvent(table_id=table_id, round_no=round_no, position=position, action=action, value=value, device_id=device_id))


async def add_play(db: AsyncSession, code: str, value: str, expected_version: int, device_id: str | None = None) -> WriteOutcome:
    """Write a color (or SKIP) into the next cell, starting a new round when needed."""
    if value not in COLORS and value != SKIP:
        raise GridError(f"Invalid value: {value}")
    table = await _lock_table(db, code, expected_version)

    current = await last_round(db, table.id)
    if current is None or current.status != OPEN:
        current = DtRound(table_id=table.id, round_no=(current.round_no + 1) if current else 1, results="", status=OPEN)
        db.add(current)

    current.results += value
    position = len(current.results)
    if position >= table.plays_per_round:
        current.status = COMPLETE
    current.updated_at = datetime.now(timezone.utc)

    if value != SKIP:
        await _adjust_count(db, table.id, current.round_no, position, value, 1)
    _log(db, table.id, current.round_no, position, "skip" if value == SKIP else "add", value, device_id)
    await db.commit()
    return WriteOutcome(table, current, None, current)


async def delete_last(db: AsyncSession, code: str, expected_version: int, device_id: str | None = None) -> WriteOutcome:
    """Remove the last recorded cell. Reopens a finished round; removes a round that becomes empty."""
    table = await _lock_table(db, code, expected_version)

    current = await last_round(db, table.id)
    if current is None:
        await _abort(db, InvalidAction("Nothing to delete"))

    position = len(current.results)
    value = current.results[-1]
    if value != SKIP:
        await _adjust_count(db, table.id, current.round_no, position, value, -1)
    _log(db, table.id, current.round_no, position, "delete", value, device_id)

    current.results = current.results[:-1]
    if current.results:
        current.status = OPEN
        current.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return WriteOutcome(table, current, None, current)

    round_no = current.round_no
    await db.delete(current)
    await db.commit()
    return WriteOutcome(table, None, round_no, await last_round(db, table.id))


async def _require_open_round(db: AsyncSession, table: GameTable) -> DtRound:
    current = await last_round(db, table.id)
    if current is None or current.status != OPEN:
        await _abort(db, InvalidAction("No round in progress"))
    return current


async def end_round(db: AsyncSession, code: str, expected_version: int, device_id: str | None = None) -> WriteOutcome:
    """Close the current round before all plays were recorded; its filled cells still count."""
    table = await _lock_table(db, code, expected_version)
    current = await _require_open_round(db, table)
    current.status = ENDED_EARLY
    current.updated_at = datetime.now(timezone.utc)
    _log(db, table.id, current.round_no, None, "end_round", None, device_id)
    await db.commit()
    return WriteOutcome(table, current, None, current)


async def discard_round(db: AsyncSession, code: str, expected_version: int, device_id: str | None = None) -> WriteOutcome:
    """Delete the current round entirely and remove it from the stats."""
    table = await _lock_table(db, code, expected_version)
    current = await _require_open_round(db, table)

    for position, value in enumerate(current.results, start=1):
        if value != SKIP:
            await _adjust_count(db, table.id, current.round_no, position, value, -1)
    _log(db, table.id, current.round_no, None, "discard_round", current.results, device_id)

    round_no = current.round_no
    await db.delete(current)
    await db.commit()
    return WriteOutcome(table, None, round_no, await last_round(db, table.id))


# --- stats ------------------------------------------------------------------------------------


async def column_counts(db: AsyncSession, table_id: int, position: int, lo: int, hi: int) -> Counter[str]:
    """Color counts at `position` over rounds [lo, hi]: block aggregates plus edge scans, in one query."""
    blocks, edges = split_range(lo, hi)
    parts = []

    if blocks is not None:
        parts.append(
            select(DtBlockCount.color.label("value"), func.sum(DtBlockCount.count).label("total"))
            .where(
                DtBlockCount.table_id == table_id,
                DtBlockCount.position == position,
                DtBlockCount.block_no.between(blocks[0], blocks[1]),
            )
            .group_by(DtBlockCount.color)
        )
    if edges:
        cell = func.substr(DtRound.results, position, 1)
        parts.append(
            select(cell.label("value"), func.count().label("total"))
            .where(DtRound.table_id == table_id, or_(*(DtRound.round_no.between(a, b) for a, b in edges)))
            .group_by(cell)
        )

    stmt = parts[0] if len(parts) == 1 else union_all(*parts)
    counts: Counter[str] = Counter()
    for value, total in (await db.execute(stmt)).all():
        if value in COLORS:
            counts[value] += int(total or 0)
    return counts


def stats_range(last: DtRound | None, from_round: int | None, to_round: int | None, last_rounds: int | None) -> tuple[int, int]:
    """Rounds [lo, hi] the stats use: [from_round, to_round] or the newest `last_rounds`. Empty when lo > hi."""
    max_round = last.round_no if last else 0
    if last_rounds is not None:
        from_round, to_round = max_round - last_rounds + 1, None
    lo = max(1, from_round or 1)
    hi = min(to_round, max_round) if to_round is not None else max_round
    return lo, hi


async def compute_stats(
    db: AsyncSession,
    table: GameTable,
    last: DtRound | None,
    from_round: int | None,
    to_round: int | None,
    last_rounds: int | None = None,
) -> Stats:
    """Hit rates for the next cell: by column over the range, else by the current row, else none.

    The range is [from_round, to_round], or the newest `last_rounds` rounds when that is given.
    """
    cursor = cursor_of(last)
    lo, hi = stats_range(last, from_round, to_round, last_rounds)

    counts = await column_counts(db, table.id, cursor.position, lo, hi) if lo <= hi else Counter()
    mode = "column"
    if not counts:
        row = last.results if last is not None and last.status == OPEN else ""
        counts = Counter(value for value in row if value in COLORS)
        mode = "row" if counts else "none"

    return Stats(
        mode=mode,
        round_no=cursor.round_no,
        position=cursor.position,
        range_from=lo if lo <= hi else None,
        range_to=hi if lo <= hi else None,
        counts={color: counts.get(color, 0) for color in COLORS},
    )


# --- maintenance ------------------------------------------------------------------------------


async def expected_counts(db: AsyncSession, table_id: int) -> Counter[tuple[int, int, str]]:
    """Recompute (position, block_no, color) counts from raw rounds."""
    expected: Counter[tuple[int, int, str]] = Counter()
    stmt = select(DtRound.round_no, DtRound.results).where(DtRound.table_id == table_id).execution_options(yield_per=5000)
    async for round_no, results in await db.stream(stmt):
        block = block_of(round_no)
        for position, value in enumerate(results, start=1):
            if value in COLORS:
                expected[(position, block, value)] += 1
    return expected


async def verify_counts(db: AsyncSession, table_id: int) -> list[tuple[tuple[int, int, str], int, int]]:
    """Return mismatches as (key, stored, expected); empty when dt_block_counts is consistent."""
    expected = await expected_counts(db, table_id)
    stored = {
        (row.position, row.block_no, row.color): row.count
        for row in (await db.execute(select(DtBlockCount).where(DtBlockCount.table_id == table_id))).scalars()
    }
    keys = set(expected) | {key for key, count in stored.items() if count}
    return sorted((key, stored.get(key, 0), expected.get(key, 0)) for key in keys if stored.get(key, 0) != expected.get(key, 0))


async def rebuild_counts(db: AsyncSession, table_id: int) -> int:
    """Replace dt_block_counts for a table with values recomputed from raw rounds. Returns rows written."""
    expected = await expected_counts(db, table_id)
    await db.execute(delete(DtBlockCount).where(DtBlockCount.table_id == table_id))
    rows = [
        {"table_id": table_id, "position": position, "block_no": block, "color": color, "count": count}
        for (position, block, color), count in expected.items()
    ]
    for start in range(0, len(rows), 5000):
        await db.execute(DtBlockCount.__table__.insert(), rows[start : start + 5000])
    await db.commit()
    return len(rows)
