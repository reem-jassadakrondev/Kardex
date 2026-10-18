from __future__ import annotations

import asyncio
import random
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.services import dt_grid
from app.services.dt_grid import COLORS, split_range

BASE = "/api/v1/tables"


class Grid:
    """Thin client that tracks the table version like the frontend will."""

    def __init__(self, client: TestClient, code: str = "t4", **scope: int) -> None:
        self.client = client
        self.code = code
        self.scope = scope
        self.version = client.get(f"{BASE}/{code}").json()["version"]

    def _done(self, response):
        assert response.status_code == 200, response.text
        body = response.json()
        self.version = body["version"]
        return body

    def add(self, value: str):
        return self._done(self.client.post(f"{BASE}/{self.code}/plays", params=self.scope, json={"value": value, "version": self.version}))

    def delete_last(self):
        return self._done(self.client.delete(f"{BASE}/{self.code}/plays/last", params={**self.scope, "version": self.version}))

    def end(self):
        return self._done(self.client.post(f"{BASE}/{self.code}/rounds/current/end", params=self.scope, json={"version": self.version}))

    def discard(self):
        return self._done(self.client.delete(f"{BASE}/{self.code}/rounds/current", params={**self.scope, "version": self.version}))

    def state(self, **scope: int):
        return self.client.get(f"{BASE}/{self.code}", params=scope or self.scope).json()

    def rounds(self):
        return self.client.get(f"{BASE}/{self.code}/grid", params={"limit": 500}).json()["rounds"]


# --- split_range ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("lo", "hi", "expected"),
    [
        (1, 999, (None, [(1, 999)])),
        (1, 1000, ((0, 0), [])),
        (1, 1001, ((0, 0), [(1001, 1001)])),
        (500_000, 999_999, ((500, 998), [(500_000, 500_000), (999_001, 999_999)])),
        (1001, 3000, ((1, 2), [])),
        (1500, 1600, (None, [(1500, 1600)])),
    ],
)
def test_split_range(lo: int, hi: int, expected) -> None:
    assert split_range(lo, hi) == expected


def test_split_range_covers_every_round_exactly_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(dt_grid, "BLOCK_SIZE", 3)
    for lo in range(1, 15):
        for hi in range(lo, 20):
            blocks, edges = split_range(lo, hi)
            covered = [r for a, b in edges for r in range(a, b + 1)]
            if blocks:
                covered += [r for blk in range(blocks[0], blocks[1] + 1) for r in range(blk * 3 + 1, blk * 3 + 4)]
            assert sorted(covered) == list(range(lo, hi + 1)), (lo, hi)


# --- recording --------------------------------------------------------------------------------


def test_default_table_starts_empty(client: TestClient) -> None:
    state = client.get(f"{BASE}/dt-1").json()
    assert state["table"] == {"code": "dt-1", "name": "โต๊ะ 1", "plays_per_round": 60}
    assert state["total_rounds"] == 0
    assert state["cursor"] == {"round_no": 1, "position": 1}
    assert state["stats"]["mode"] == "none"
    assert state["stats"]["sample_size"] == 0


def test_unknown_table_is_404(client: TestClient) -> None:
    assert client.get(f"{BASE}/nope").status_code == 404


def test_add_fills_row_then_starts_next_round(client: TestClient) -> None:
    grid = Grid(client)
    for value in "RBB":
        grid.add(value)
    body = grid.add("Y")
    assert body["round"] == {"round_no": 1, "results": "RBBY", "status": "complete"}
    assert body["cursor"] == {"round_no": 2, "position": 1}

    body = grid.add("G")
    assert body["round"] == {"round_no": 2, "results": "G", "status": "open"}
    assert body["total_rounds"] == 2


def test_writes_to_unknown_table_are_404(client: TestClient) -> None:
    assert client.post(f"{BASE}/nope/plays", json={"value": "R", "version": 0}).status_code == 404
    assert client.delete(f"{BASE}/nope/plays/last", params={"version": 0}).status_code == 404


def test_tap_uses_few_queries(client: TestClient, engine) -> None:
    """Latency to a remote DB is per round-trip, so keep the statements per tap fixed and small."""
    grid = Grid(client)
    grid.add("R")
    statements: list[str] = []

    def count(conn, cursor, statement, *args) -> None:
        statements.append(statement.split()[0])

    event.listen(engine.sync_engine, "before_cursor_execute", count)
    try:
        grid.add("B")
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", count)

    # UPDATE..RETURNING version, SELECT last round, upsert count, UPDATE round, INSERT event, SELECT stats
    assert len(statements) == 6, statements


def test_invalid_value_is_rejected(client: TestClient) -> None:
    grid = Grid(client)
    response = client.post(f"{BASE}/t4/plays", json={"value": "X", "version": grid.version})
    assert response.status_code == 422


def test_stale_version_conflicts(client: TestClient) -> None:
    grid = Grid(client)
    grid.add("R")
    response = client.post(f"{BASE}/t4/plays", json={"value": "B", "version": 0})
    assert response.status_code == 409
    assert response.json()["current_version"] == 1
    assert grid.rounds() == [{"round_no": 1, "results": "R", "status": "open"}]


def test_delete_last_walks_back_across_rounds(client: TestClient) -> None:
    grid = Grid(client)
    for value in "RBYKG":
        grid.add(value)

    body = grid.delete_last()  # removes G → round 2 becomes empty and is removed
    assert body["round"] is None and body["removed_round_no"] == 2
    assert body["cursor"] == {"round_no": 2, "position": 1}  # round 1 is complete → next is a new round
    assert body["last_round_status"] == "complete"

    body = grid.delete_last()  # reopens round 1
    assert body["round"] == {"round_no": 1, "results": "RBY", "status": "open"}
    assert body["cursor"] == {"round_no": 1, "position": 4}

    for _ in range(3):
        grid.delete_last()
    assert grid.rounds() == []
    response = client.delete(f"{BASE}/t4/plays/last", params={"version": grid.version})
    assert response.status_code == 409


def test_skip_keeps_columns_aligned(client: TestClient) -> None:
    grid = Grid(client)
    for value in "R-BY":
        grid.add(value)
    body = grid.add("-")
    assert body["round"]["results"] == "-"
    body = grid.add("K")  # round 2 = "-K"; the skip kept K in column 2
    assert body["round"]["results"] == "-K"
    assert body["cursor"] == {"round_no": 2, "position": 3}
    assert body["stats"]["mode"] == "column"  # column 3 has round 1's B
    assert body["stats"]["counts"]["B"] == 1


def test_end_round_and_discard(client: TestClient) -> None:
    grid = Grid(client)
    grid.add("R")
    grid.add("B")
    body = grid.end()
    assert body["round"]["status"] == "ended_early"
    assert body["cursor"] == {"round_no": 2, "position": 1}

    grid.add("G")
    body = grid.discard()
    assert body["removed_round_no"] == 2
    assert body["cursor"] == {"round_no": 2, "position": 1}
    assert body["stats"]["counts"]["G"] == 0
    assert body["stats"]["counts"]["R"] == 1  # column 1 still has round 1's R

    response = client.post(f"{BASE}/t4/rounds/current/end", json={"version": grid.version})
    assert response.status_code == 409


# --- stats ------------------------------------------------------------------------------------


def test_stats_match_sketch(client: TestClient) -> None:
    """Column 1 = R, B, B → next cell in column 1: R 33.3%, B 66.7%."""
    grid = Grid(client)
    for row in ("RBYK", "BRBB", "BRBB"):
        for value in row:
            body = grid.add(value)
    stats = body["stats"]
    assert stats["mode"] == "column" and stats["position"] == 1 and stats["sample_size"] == 3
    assert stats["percentages"] == {"R": 33.3, "B": 66.7, "Y": 0.0, "K": 0.0, "G": 0.0}


def test_row_mode_when_column_has_no_data(client: TestClient) -> None:
    grid = Grid(client)
    grid.add("R")
    grid.add("R")
    body = grid.add("B")
    assert body["stats"]["mode"] == "row"
    assert body["stats"]["counts"] == {"R": 2, "B": 1, "Y": 0, "K": 0, "G": 0}


def test_range_limits_rounds(client: TestClient) -> None:
    grid = Grid(client)
    for row in ("RRRR", "BBBB", "YYYY"):
        for value in row:
            grid.add(value)
    assert grid.state(from_round=2)["stats"]["counts"] == {"R": 0, "B": 1, "Y": 1, "K": 0, "G": 0}
    assert grid.state(to_round=1)["stats"]["counts"]["R"] == 1
    assert grid.state(from_round=2, to_round=2)["stats"]["range"] == {"from_round": 2, "to_round": 2}
    assert client.get(f"{BASE}/t4", params={"from_round": 3, "to_round": 2}).status_code == 422


def test_last_rounds_follows_newest_round(client: TestClient) -> None:
    grid = Grid(client, last_rounds=2)
    for row in ("RRRR", "BBBB", "YYYY"):
        for value in row:
            body = grid.add(value)
    assert body["stats"]["range"] == {"from_round": 2, "to_round": 3}
    assert body["stats"]["counts"] == {"R": 0, "B": 1, "Y": 1, "K": 0, "G": 0}
    assert grid.state(last_rounds=10)["stats"]["range"] == {"from_round": 1, "to_round": 3}
    assert client.get(f"{BASE}/t4", params={"last_rounds": 2, "from_round": 1}).status_code == 422


def test_grid_paging(client: TestClient) -> None:
    grid = Grid(client)
    for _ in range(3 * 4 + 1):
        grid.add("R")
    page = client.get(f"{BASE}/t4/grid", params={"limit": 2}).json()
    assert [r["round_no"] for r in page["rounds"]] == [3, 4] and page["has_more"]
    page = client.get(f"{BASE}/t4/grid", params={"limit": 2, "before_round": 3}).json()
    assert [r["round_no"] for r in page["rounds"]] == [1, 2] and not page["has_more"]


def brute_force_counts(rounds: list[str], position: int, lo: int, hi: int) -> Counter:
    return Counter(
        results[position - 1]
        for round_no, results in enumerate(rounds, start=1)
        if lo <= round_no <= hi and len(results) >= position and results[position - 1] in COLORS
    )


def test_random_operations_match_brute_force(client: TestClient, db_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Hundreds of random writes with tiny blocks; stats must equal a naive recount every step."""
    monkeypatch.setattr(dt_grid, "BLOCK_SIZE", 3)
    rng = random.Random(1234)
    grid = Grid(client)
    rounds: list[str] = []  # reference model
    open_last = False

    for _ in range(400):
        op = rng.choices(["add", "skip", "delete", "end", "discard"], weights=[70, 8, 15, 4, 3])[0]
        if op in ("add", "skip"):
            value = rng.choice(COLORS) if op == "add" else "-"
            grid.add(value)
            if open_last:
                rounds[-1] += value
            else:
                rounds.append(value)
            open_last = len(rounds[-1]) < 4
        elif op == "delete" and rounds:
            grid.delete_last()
            rounds[-1] = rounds[-1][:-1]
            if not rounds[-1]:
                rounds.pop()
                open_last = False  # the previous round (if any) stays finished
            else:
                open_last = True
        elif op == "end" and open_last:
            grid.end()
            open_last = False
        elif op == "discard" and open_last:
            grid.discard()
            rounds.pop()
            open_last = False

        lo = rng.randint(1, max(1, len(rounds)))
        hi = rng.randint(lo, max(lo, len(rounds)))
        stats = grid.state(from_round=lo, to_round=hi)["stats"]
        if stats["mode"] == "column":
            assert stats["counts"] == {c: brute_force_counts(rounds, stats["position"], lo, hi)[c] for c in COLORS}

    assert [r["results"] for r in grid.rounds()] == rounds

    async def check() -> list:
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", poolclass=NullPool)
        async with async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)() as session:
            table_id = (await dt_grid.get_table(session, "t4")).id
            mismatches = await dt_grid.verify_counts(session, table_id)
            await dt_grid.rebuild_counts(session, table_id)
            after_rebuild = await dt_grid.verify_counts(session, table_id)
        await engine.dispose()
        return [mismatches, after_rebuild]

    assert asyncio.run(check()) == [[], []]
