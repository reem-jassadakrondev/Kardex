from __future__ import annotations

import asyncio
import io
import sqlite3
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.services import dt_grid, importer
from app.services.importer import ImportProblem, parse_rows, read_csv, read_xlsx

HEADER = ["Game"] + [f"S{i}" for i in range(1, 61)]


def test_codes_headers_blanks() -> None:
    rows = [
        (1, HEADER),
        (2, ["1", "1", "2", "3", "4", "5"]),
        (3, ["2", "r", " b ", "", "2.0", "-", "", ""]),  # letters, blank in the middle = skip, trailing blanks
        (4, ["3"]),  # game without plays yet
        (5, ["note", "x"]),  # not a game row
    ]
    parsed = parse_rows(rows, "DAI LY")
    assert parsed.rounds == ["RBYKG", "RB-B-"]
    assert parsed.games == ["1", "2"]
    assert parsed.summary()["lengths"] == {5: 2}


def test_bad_values_are_reported_by_cell() -> None:
    row = ["137"] + ["1"] * 39 + ["23"] + ["1"] * 20
    with pytest.raises(ImportProblem) as error:
        parse_rows([(138, row), (139, ["138"] + ["1"] * 61)])
    assert error.value.problems == [
        "เซลล์ AO138 (Game 137, S40): ค่า '23' ไม่ใช่ 1–5",
        "แถว 139 (Game 138): มี 61 ช่อง เกิน 60",
    ]
    with pytest.raises(ImportProblem):
        parse_rows([(1, HEADER)])  # no data at all


def test_csv_with_bom_and_semicolons() -> None:
    data = "﻿Game;S1;S2;S3\n1;1;2;3\n2;5;4;\n".encode("utf-8")
    assert parse_rows(read_csv(data)).rounds == ["RBY", "GK"]


def make_xlsx(sheets: dict[str, list[list[object]]]) -> bytes:
    """A minimal workbook: strings via sharedStrings, numbers inline."""
    strings: list[str] = []
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        sheet_entries, rels = [], []
        for n, (name, rows) in enumerate(sheets.items(), start=1):
            xml_rows = []
            for r, row in enumerate(rows, start=1):
                cells = []
                for c, value in enumerate(row, start=1):
                    ref = f"{importer.column_name(c)}{r}"
                    if isinstance(value, str):
                        strings.append(value)
                        cells.append(f'<c r="{ref}" t="s"><v>{len(strings) - 1}</v></c>')
                    elif value is not None:
                        cells.append(f'<c r="{ref}"><v>{value}</v></c>')
                xml_rows.append(f'<row r="{r}">{"".join(cells)}</row>')
            z.writestr(
                f"xl/worksheets/sheet{n}.xml",
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
                + "".join(xml_rows)
                + "</sheetData></worksheet>",
            )
            sheet_entries.append(f'<sheet name="{name}" sheetId="{n}" r:id="rId{n}"/>')
            rels.append(f'<Relationship Id="rId{n}" Type="worksheet" Target="worksheets/sheet{n}.xml"/>')
        z.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
            + "".join(sheet_entries)
            + "</sheets></workbook>",
        )
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(rels) + "</Relationships>",
        )
        z.writestr(
            "xl/sharedStrings.xml",
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            + "".join(f"<si><t>{s}</t></si>" for s in strings)
            + "</sst>",
        )
    return buf.getvalue()


def test_xlsx_first_or_named_sheet() -> None:
    data = make_xlsx(
        {
            "DAI LY": [["Game", "S1", "S2"], [1, 1, 2], [2, 3, None, 5], [3]],
            "3DAY": [["Game", "S1"], [1, 4]],
        }
    )
    rows, name = read_xlsx(data)
    assert name == "DAI LY"
    assert parse_rows(rows).rounds == ["RB", "Y-G"]
    rows, name = read_xlsx(data, "3day")
    assert name == "3DAY" and parse_rows(rows).rounds == ["K"]
    with pytest.raises(ImportProblem):
        read_xlsx(data, "nope")
    with pytest.raises(ImportProblem) as error:
        read_xlsx(data[: len(data) // 2])  # truncated copy (what happened with 012022.xlsx)
    assert "เสียหรือไม่ครบ" in error.value.problems[0]


def test_replace_rounds(client: TestClient, db_path: Path) -> None:
    # Existing data on dt-1 and on another table.
    version = client.get("/api/v1/tables/dt-1").json()["version"]
    for value in "RRRR":
        version = client.post("/api/v1/tables/dt-1/plays", json={"value": value, "version": version}).json()["version"]
    other = client.post("/api/v1/tables", json={"name": "อื่น"}).json()["code"]
    client.post(f"/api/v1/tables/{other}/plays", json={"value": "G", "version": 0})

    rounds = ["RBYKG" * 12, "BBRB-R", "Y" * 60] + ["RB" * 30] * 1200  # crosses a 1000-round block
    imported = [*rounds]

    async def run() -> list:
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", poolclass=NullPool)
        async with async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)() as db:
            table = await importer.find_table(db, "โต๊ะ 1")  # by name
            await importer.replace_rounds(db, table, imported, "012022.xlsx")
            mismatches = await dt_grid.verify_counts(db, table.id)
        await engine.dispose()
        return mismatches

    assert asyncio.run(run()) == []

    state = client.get("/api/v1/tables/dt-1").json()
    assert state["version"] == version + 1  # open pages reload
    assert state["total_rounds"] == len(rounds)
    assert state["cursor"] == {"round_no": len(rounds) + 1, "position": 1}
    assert state["stats"]["counts"]["R"] == 1 + 1200  # column 1: R from round 1 and the 1200 RB rounds
    page = client.get("/api/v1/tables/dt-1/grid", params={"before_round": 4, "limit": 3}).json()["rounds"]
    assert [(r["results"], r["status"]) for r in page] == [
        (rounds[0], "complete"),
        ("BBRB-R", "ended_early"),
        ("Y" * 60, "complete"),
    ]
    # Recording continues after the imported rounds; matching sees them.
    client.post("/api/v1/tables/dt-1/plays", json={"value": "B", "version": state["version"]})
    match = client.get("/api/v1/tables/dt-1/matches", params={"window": 0}).json()
    assert match["total_matches"] == 1 and match["counts"]["B"] == 1  # only "BBRB-R" starts with B

    with sqlite3.connect(db_path) as conn:
        events = conn.execute(
            "SELECT action, value FROM dt_play_events e JOIN game_tables t ON t.id = e.table_id WHERE t.code = 'dt-1' ORDER BY e.id"
        ).fetchall()
    assert events[0] == ("import", f"{len(rounds)} rounds: 012022.xlsx") and len(events) == 2
    assert client.get(f"/api/v1/tables/{other}/grid").json()["rounds"][0]["results"] == "G"  # untouched


def test_find_table_unknown(engine) -> None:
    async def run() -> None:
        async with async_sessionmaker(bind=engine, class_=AsyncSession)() as db:
            await importer.find_table(db, "ไม่มี")

    with pytest.raises(ImportProblem):
        asyncio.run(run())
