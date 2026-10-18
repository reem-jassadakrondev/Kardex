"""Benchmark Dragon Tiger stats on a large synthetic table.

    venv/bin/python -m scripts.bench_dt --rounds 1000000                      # temp SQLite DB
    venv/bin/python -m scripts.bench_dt --database-url postgresql+asyncpg://… # existing PostgreSQL

SQLite: a fresh DB in a temp dir (never touches DATABASE_URL).
PostgreSQL: seeds a throwaway table `bench-<timestamp>` in the given (already migrated) DB and deletes
all of its rows afterwards; other tables are not touched.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sqlite3
import tempfile
import time
from collections import Counter
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

from alembic import command
from sqlalchemy import delete, insert, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import build_engine
from app.models.dt import DtBlockCount, DtPlayEvent, DtRound
from app.models.game_table import GameTable
from app.services import dt_grid
from tests.test_migrations import alembic_config

PLAYS = 60


def synthetic_rounds(table_id: int, rounds: int, counts: Counter) -> Iterator[tuple]:
    """Yield dt_rounds rows of random colors, accumulating the matching block counts."""
    rng = random.Random(42)
    now = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for round_no in range(1, rounds + 1):
        results = "".join(rng.choices(dt_grid.COLORS, k=PLAYS))
        block = (round_no - 1) // dt_grid.BLOCK_SIZE
        for position, color in enumerate(results, start=1):
            counts[(position, block, color)] += 1
        yield (table_id, round_no, results, "complete", now, now)


def seed_sqlite(db_path: Path, rounds: int) -> str:
    counts: Counter = Counter()
    with sqlite3.connect(db_path) as conn:
        table_id = conn.execute("SELECT id FROM game_tables WHERE code = 'dt-1'").fetchone()[0]
        rows = (row[:4] + (row[4].isoformat(), row[5].isoformat()) for row in synthetic_rounds(table_id, rounds, counts))
        conn.executemany("INSERT INTO dt_rounds VALUES (?, ?, ?, ?, ?, ?)", rows)
        conn.executemany(
            "INSERT INTO dt_block_counts (table_id, position, block_no, color, count) VALUES (?, ?, ?, ?, ?)",
            [(table_id, p, b, c, n) for (p, b, c), n in counts.items()],
        )
    return "dt-1"


async def seed_postgres(engine: AsyncEngine, rounds: int) -> tuple[str, int]:
    code = f"bench-{int(time.time())}"
    async with engine.begin() as conn:
        table_id = (
            await conn.execute(
                insert(GameTable)
                .values(code=code, name="benchmark", game_code="dragon_tiger", plays_per_round=PLAYS, version=0, created_at=datetime.now(timezone.utc))
                .returning(GameTable.id)
            )
        ).scalar_one()

    counts: Counter = Counter()
    async with engine.connect() as conn:
        driver = (await conn.get_raw_connection()).driver_connection
        await driver.copy_records_to_table(
            "dt_rounds",
            records=list(synthetic_rounds(table_id, rounds, counts)),
            columns=["table_id", "round_no", "results", "status", "created_at", "updated_at"],
        )
        await driver.copy_records_to_table(
            "dt_block_counts",
            records=[(table_id, p, b, c, n) for (p, b, c), n in counts.items()],
            columns=["table_id", "position", "block_no", "color", "count"],
        )
        await conn.execute(text("ANALYZE dt_rounds"))
        await conn.execute(text("ANALYZE dt_block_counts"))
        await conn.commit()
    return code, table_id


async def cleanup_postgres(engine: AsyncEngine, table_id: int) -> None:
    async with engine.begin() as conn:
        for model in (DtPlayEvent, DtBlockCount, DtRound):
            await conn.execute(delete(model).where(model.table_id == table_id))
        await conn.execute(delete(GameTable).where(GameTable.id == table_id))


async def timed(label: str, coro_factory, repeat: int = 5) -> None:
    best = float("inf")
    for _ in range(repeat):
        start = time.perf_counter()
        result = await coro_factory()
        best = min(best, time.perf_counter() - start)
    print(f"  {label:<44} {best * 1000:8.1f} ms   {result}")


async def measure(engine: AsyncEngine, code: str, rounds: int) -> None:
    sessions = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with sessions() as db:
        table = await dt_grid.get_table(db, code)

        async def stats(lo, hi):
            last = await dt_grid.last_round(db, table.id)
            s = await dt_grid.compute_stats(db, table, last, lo, hi)
            return f"n={s.sample_size} mode={s.mode}"

        print("stats for next cell:")
        await timed("all rounds", lambda: stats(None, None))
        await timed(f"rounds {rounds // 2:,}–{rounds - 1:,}", lambda: stats(rounds // 2, rounds - 1))
        await timed("last 1,000 rounds", lambda: stats(rounds - 999, None))
        await timed("rounds 123,457–123,999 (edge scan only)", lambda: stats(123_457, 123_999))

        print("writes (each includes version bump, counts upsert, event log, commit):")

        async def add():
            out = await dt_grid.add_play(db, code, "R", table.version)
            table.version = out.table.version
            return f"round {out.round.round_no} pos {len(out.round.results)}"

        async def undo():
            out = await dt_grid.delete_last(db, code, table.version)
            table.version = out.table.version
            return f"round {out.round.round_no if out.round else out.removed_round_no}"

        await timed("add_play", add, repeat=3)
        await timed("delete_last", undo, repeat=3)


async def run_postgres(url: str, rounds: int) -> None:
    engine = build_engine(url)
    start = time.perf_counter()
    code, table_id = await seed_postgres(engine, rounds)
    try:
        print(f"seeded {rounds:,} rounds into table {code} in {time.perf_counter() - start:.1f}s")
        async with engine.connect() as conn:
            size = (await conn.execute(text("SELECT pg_total_relation_size('dt_rounds') + pg_total_relation_size('dt_block_counts')"))).scalar()
        print(f"dt_rounds + dt_block_counts size: {size / 1_000_000:.0f} MB")
        await measure(engine, code, rounds)
    finally:
        await cleanup_postgres(engine, table_id)
        print(f"removed table {code} and its rows")
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=1_000_000)
    parser.add_argument("--database-url", help="PostgreSQL URL (already migrated); default: temp SQLite")
    args = parser.parse_args()

    if args.database_url:
        asyncio.run(run_postgres(args.database_url, args.rounds))
        return

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "bench.db"
        command.upgrade(alembic_config(db_path), "head")
        start = time.perf_counter()
        code = seed_sqlite(db_path, args.rounds)
        size_mb = db_path.stat().st_size / 1_000_000
        print(f"seeded {args.rounds:,} rounds in {time.perf_counter() - start:.1f}s, db size {size_mb:.0f} MB")
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
        asyncio.run(measure(engine, code, args.rounds))


if __name__ == "__main__":
    main()
