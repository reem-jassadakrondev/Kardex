from __future__ import annotations

import random
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.services.dt_grid import COLORS
from app.services.matching import window_of

URL = "/api/v1/tables/dt-1/matches"


def seed(db_path: Path, rows: list[str], current: str | None) -> None:
    """Earlier rounds 1..n (ended early unless 60 long) plus an open current round."""
    with sqlite3.connect(db_path) as conn:
        table_id = conn.execute("SELECT id FROM game_tables WHERE code = 'dt-1'").fetchone()[0]
        all_rows = [(r, "complete" if len(r) == 60 else "ended_early") for r in rows]
        if current is not None:
            all_rows.append((current, "open"))
        conn.executemany(
            "INSERT INTO dt_rounds (table_id, round_no, results, status, created_at, updated_at) VALUES (?, ?, ?, ?, '2026-01-01', '2026-01-01')",
            [(table_id, i, r, status) for i, (r, status) in enumerate(all_rows, start=1)],
        )


def matched(client: TestClient, **params) -> tuple[list[int], dict]:
    body = client.get(URL, params=params).json()
    return [r["round_no"] for r in body["rounds"]], body


# The customer's sketch (first 12 columns): current row B R B R B R → only row 3 matches.
SKETCH = ["RBBRBYKBBGGB", "BRBRBBKBBGBB", "BRBRBRBBBYBB"]


def test_customer_example_whole_row(client: TestClient, db_path: Path) -> None:
    seed(db_path, SKETCH, "BRBRBR")
    rounds, body = matched(client, window=0)
    assert rounds == [3]
    assert (body["round_no"], body["position"]) == (4, 7)
    assert (body["window_from"], body["window_to"], body["pattern"]) == (1, 6, "BRBRBR")
    assert body["total_matches"] == 1
    assert body["counts"]["B"] == 1 and body["percentages"]["B"] == 100.0  # row 3, column 7


def test_customer_example_first_cell(client: TestClient, db_path: Path) -> None:
    seed(db_path, SKETCH, "B")
    rounds, body = matched(client, window=5)
    assert rounds == [2, 3]  # row 1 starts with R
    assert body["counts"]["R"] == 2 and body["sample_size"] == 2


def test_last_n_window(client: TestClient, db_path: Path) -> None:
    seed(db_path, SKETCH, "BRBRBR")
    _, body = matched(client, window=3)
    assert (body["window_from"], body["window_to"], body["pattern"]) == (4, 6, "RBR")
    # columns 4-6: row1 R B Y, row2 R B B, row3 R B R
    assert [r["round_no"] for r in body["rounds"]] == [3]
    _, body = matched(client, window=1)  # column 6 = R
    assert [r["round_no"] for r in body["rounds"]] == [3]
    _, body = matched(client, window=2)  # columns 5-6 = B R
    assert [r["round_no"] for r in body["rounds"]] == [3]


def test_skip_matches_any_color(client: TestClient, db_path: Path) -> None:
    seed(db_path, ["RB-K", "RYYK", "-BYK", "GBYK"], "R-Y")
    rounds, body = matched(client, window=0)
    # current R ? Y: col1 R or -, col2 anything, col3 Y or -
    assert rounds == [1, 2, 3]
    assert body["counts"]["K"] == 3


def test_short_rounds_never_match_past_their_end(client: TestClient, db_path: Path) -> None:
    seed(db_path, ["RB", "RBY", "RBYG"], "RBY")
    rounds, body = matched(client, window=0)
    assert rounds == [2, 3]
    # row 2 has no column 4: it matches but adds no color at the next cell
    assert body["total_matches"] == 2 and body["sample_size"] == 1 and body["counts"]["G"] == 1


def test_no_filter_before_the_first_cell(client: TestClient, db_path: Path) -> None:
    seed(db_path, SKETCH, None)  # last round ended → next cell is column 1 of round 4
    rounds, body = matched(client, window=5)
    assert body["window_from"] is None and body["total_matches"] is None and rounds == []


def test_range_and_paging(client: TestClient, db_path: Path) -> None:
    seed(db_path, ["RB"] * 120, "R")
    rounds, body = matched(client, window=5, limit=50)
    assert body["total_matches"] == 120 and rounds == list(range(71, 121)) and body["has_more"]
    rounds, body = matched(client, window=5, limit=50, before_round=71)
    assert rounds == list(range(21, 71)) and body["has_more"]
    rounds, body = matched(client, window=5, limit=50, before_round=21)
    assert rounds == list(range(1, 21)) and not body["has_more"]
    rounds, body = matched(client, window=5, last_rounds=10)
    # newest 10 rounds = 112..121; 121 is the current round itself and is excluded
    assert rounds == list(range(112, 121)) and body["total_matches"] == 9
    rounds, body = matched(client, window=5, from_round=5, to_round=7)
    assert rounds == [5, 6, 7]


def test_matches_brute_force(client: TestClient, db_path: Path) -> None:
    rng = random.Random(7)
    alphabet = "RRRBBBYKG-"
    rows = ["".join(rng.choices(alphabet, k=rng.choice([60, 60, 60, rng.randint(1, 59)]))) for _ in range(400)]
    current = "".join(rng.choices("RB-", k=9))
    seed(db_path, rows, current)
    position = len(current) + 1

    for size in (0, 1, 3, 5, 8, 10):
        start, end = window_of(position, size)
        expected = [
            i
            for i, row in enumerate(rows, start=1)
            if len(row) >= end
            and all(current[c - 1] == "-" or row[c - 1] in (current[c - 1], "-") for c in range(start, end + 1))
        ]
        counts = {color: sum(1 for i in expected if len(rows[i - 1]) >= position and rows[i - 1][position - 1] == color) for color in COLORS}
        body = client.get(URL, params={"window": size, "limit": 500}).json()
        assert [r["round_no"] for r in body["rounds"]] == expected, size
        assert body["total_matches"] == len(expected)
        assert body["counts"] == counts
