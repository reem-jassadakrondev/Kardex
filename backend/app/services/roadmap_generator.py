from __future__ import annotations

from typing import Optional


def build_big_road(rounds: list[dict]) -> list[list[Optional[str]]]:
    matrix: list[list[Optional[str]]] = []
    current_row: list[Optional[str]] = []
    current_col = 0

    for round_record in rounds:
        result = round_record.get("result")
        if result not in {"player", "banker", "tie"}:
            continue
        entry = "P" if result == "player" else "B" if result == "banker" else "T"
        if not matrix:
            matrix.append([entry])
            continue

        last_row = matrix[-1]
        if len(last_row) < 6 and not any(cell == entry for cell in last_row):
            last_row.append(entry)
            continue

        # simple workflow: new row when current row is full and continue with new column
        matrix.append([entry])

    return matrix


def build_bead_plate(rounds: list[dict]) -> list[list[Optional[str]]]:
    rows: list[list[Optional[str]]] = [[] for _ in range(6)]
    for index, round_record in enumerate(rounds):
        result = round_record.get("result")
        if result not in {"player", "banker", "tie"}:
            continue
        row_index = index % 6
        rows[row_index].append("P" if result == "player" else "B" if result == "banker" else "T")
    return rows
