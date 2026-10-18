"""Benchmark Dragon Tiger stats on a large synthetic table (local SQLite only).

    venv/bin/python -m scripts.bench_dt --rounds 1000000

Creates a fresh SQLite DB in a temp dir (never touches DATABASE_URL), seeds N full rounds of random
colors with matching dt_block_counts, then times stats queries and a few writes.
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sqlite3
import tempfile
import time
from collections import Counter
from pathlib import Path

from alembic import command
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.services import dt_grid
from tests.test_migrations import alembic_config

PLAYS = 60


def seed(db_path: Path, rounds: int) -> None:
    rng = random.Random(42)
    counts: Counter[tuple[int, int, str]] = Counter()
    with sqlite3.connect(db_path) as conn:
        table_id = conn.execute("SELECT id FROM game_tables WHERE code = 'dt-1'").fetchone()[0]
        batch = []
        for round_no in range(1, rounds + 1):
            results = "".join(rng.choices(dt_grid.COLORS, k=PLAYS))
            block = (round_no - 1) // dt_grid.BLOCK_SIZE
            for position, color in enumerate(results, start=1):
                counts[(position, block, color)] += 1
            batch.append((table_id, round_no, results, "complete", "2026-01-01", "2026-01-01"))
            if len(batch) == 50_000:
                conn.executemany("INSERT INTO dt_rounds VALUES (?, ?, ?, ?, ?, ?)", batch)
                batch.clear()
        conn.executemany("INSERT INTO dt_rounds VALUES (?, ?, ?, ?, ?, ?)", batch)
        conn.executemany(
            "INSERT INTO dt_block_counts (table_id, position, block_no, color, count) VALUES (?, ?, ?, ?, ?)",
            [(table_id, p, b, c, n) for (p, b, c), n in counts.items()],
        )


async def timed(label: str, coro_factory, repeat: int = 5) -> None:
    best = float("inf")
    for _ in range(repeat):
        start = time.perf_counter()
        result = await coro_factory()
        best = min(best, time.perf_counter() - start)
    print(f"  {label:<44} {best * 1000:8.1f} ms   {result}")


async def run(db_path: Path, rounds: int) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    sessions = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with sessions() as db:
        table = await dt_grid.get_table(db, "dt-1")

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
            row = await dt_grid.add_play(db, table, "R", table.version)
            return f"round {row.round_no} pos {len(row.results)}"

        async def undo():
            row, round_no = await dt_grid.delete_last(db, table, table.version)
            return f"round {round_no}"

        await timed("add_play", add, repeat=3)
        await timed("delete_last", undo, repeat=3)
    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rounds", type=int, default=1_000_000)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "bench.db"
        command.upgrade(alembic_config(db_path), "head")
        start = time.perf_counter()
        seed(db_path, args.rounds)
        size_mb = db_path.stat().st_size / 1_000_000
        print(f"seeded {args.rounds:,} rounds in {time.perf_counter() - start:.1f}s, db size {size_mb:.0f} MB")
        asyncio.run(run(db_path, args.rounds))


if __name__ == "__main__":
    main()
