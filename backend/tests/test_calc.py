from __future__ import annotations

import random
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.services.matching import window_of
from tests.test_matching import seed

URL = "/api/v1/tables/dt-1/calc"


def calc(client: TestClient, pattern: str, **params) -> dict:
    res = client.get(URL, params={"pattern": pattern, **params})
    assert res.status_code == 200, res.text
    return res.json()


def ids(body: dict) -> list[int]:
    return [r["round_no"] for r in body["rounds"]]


def test_joker_is_wild_both_ways(client: TestClient, db_path: Path) -> None:
    seed(db_path, ["RBR", "RYR", "RGB", "RKY", "BBR", "R-R", "RRR"], None)
    # typed R B: column 2 must be B or a stored joker (G/Y/K) or skip
    body = calc(client, "RB", window=0)
    assert ids(body) == [1, 2, 3, 4, 6]
    assert (body["window_from"], body["window_to"], body["position"]) == (1, 2, 3)
    # next column 3: R, R, B, Y→J, R
    assert body["counts"] == {"R": 3, "B": 1, "J": 1} and body["total_matches"] == 5
    assert body["percentages"] == {"R": 60.0, "B": 20.0, "J": 20.0}
    # typed J matches every color
    assert ids(calc(client, "JJ", window=0)) == [1, 2, 3, 4, 5, 6, 7]
    assert ids(calc(client, "B-", window=0)) == [5]


def test_all_rows_counts_and_empty_pattern(client: TestClient, db_path: Path) -> None:
    seed(db_path, ["RBR", "RYR", "GGB", "KKY"], "BB")  # the main page's open round counts too
    body = calc(client, "")
    assert body["total_matches"] is None and body["window_from"] is None
    assert ids(body) == [1, 2, 3, 4, 5]  # newest rounds, unfiltered, including the open one
    assert body["all_counts"] == {"R": 2, "B": 1, "J": 2}  # column 1: R R G K B
    body = calc(client, "R")
    assert body["all_counts"] == {"R": 0, "B": 2, "J": 3}  # column 2: B Y G K B
    assert ids(body) == [1, 2, 3, 4]  # column 1 is R or a joker (G, K); round 5 starts with B


def test_validation_and_read_only(client: TestClient, db_path: Path) -> None:
    seed(db_path, ["RBR"], None)
    before = client.get("/api/v1/tables/dt-1").json()["version"]
    assert client.get(URL, params={"pattern": "RX"}).status_code == 422
    assert client.get(URL, params={"pattern": "Y"}).status_code == 422  # only R B J - on this page
    assert client.get(URL, params={"pattern": "R" * 61}).status_code == 422
    calc(client, "R" * 60)  # full row: no next column, still answers
    calc(client, "RBJ-", window=3)
    assert client.get("/api/v1/tables/dt-1").json()["version"] == before
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT count(*) FROM dt_play_events").fetchone() == (0,)


def test_calc_brute_force(client: TestClient, db_path: Path) -> None:
    rng = random.Random(11)
    rows = ["".join(rng.choices("RRRBBBYKG-", k=rng.choice([60, 60, rng.randint(1, 59)]))) for _ in range(300)]
    seed(db_path, rows, None)
    to3 = {"R": "R", "B": "B", "G": "J", "Y": "J", "K": "J"}
    for typed in ("R", "RB", "RBJR", "BB-RB", "JRBRB"):
        position = len(typed) + 1
        for size in (0, 3, 5):
            start, end = window_of(position, size)
            expected = [
                i
                for i, row in enumerate(rows, start=1)
                if len(row) >= end
                and all(typed[c - 1] in "J-" or row[c - 1] in (typed[c - 1], "-", "G", "Y", "K") for c in range(start, end + 1))
            ]
            counts = {"R": 0, "B": 0, "J": 0}
            for i in expected:
                v = rows[i - 1][position - 1] if len(rows[i - 1]) >= position else ""
                if v in to3:
                    counts[to3[v]] += 1
            body = calc(client, typed, window=size, limit=500)
            assert ids(body) == expected, (typed, size)
            assert body["counts"] == counts and body["total_matches"] == len(expected)
