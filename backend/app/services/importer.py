"""Import rounds from the customer's spreadsheets (.xlsx or .csv) into a table, replacing its data.

Expected layout (the customer's Excel, sheet "DAI LY"): one row per round, column A = game number,
the next 60 columns = plays S1…S60 coded 1 แดง R · 2 น้ำเงิน B · 3 เหลือง Y · 4 ดำ K · 5 เขียว G.
Letters R/B/Y/K/G and "-" (skipped play) are accepted too. Rows whose first column is not a number
(headers) and rows without any play are ignored. A blank cell between plays becomes "-"; blank cells
after the last play end the round early. Any other value aborts the import and is reported by cell.

.xlsx is read with the standard library (cached cell values), so no extra package is needed on the
customer's machine.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

from sqlalchemy import delete, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dt import DtBlockCount, DtPlayEvent, DtRound
from app.models.game_table import GameTable
from app.services.dt_grid import COLORS, COMPLETE, ENDED_EARLY, SKIP, block_of

CODES = {"1": "R", "2": "B", "3": "Y", "4": "K", "5": "G"}
MAX_PLAYS = 60
_MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_PKG_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"


class ImportProblem(Exception):
    """The file can't be imported; `problems` lists what to fix (Thai, one line each)."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("\n".join(problems))
        self.problems = problems


@dataclass
class ParsedFile:
    rounds: list[str]  # results strings in file order
    games: list[str] = field(default_factory=list)  # first-column value of each round (for messages)
    sheet: str | None = None

    def summary(self) -> dict:
        lengths = Counter(len(r) for r in self.rounds)
        colors = Counter(v for r in self.rounds for v in r)
        return {
            "rounds": len(self.rounds),
            "games": f"{self.games[0]}–{self.games[-1]}" if self.games else "-",
            "lengths": dict(sorted(lengths.items())),
            "colors": {c: colors.get(c, 0) for c in (*COLORS, SKIP)},
        }


def column_name(index: int) -> str:
    """1 → A, 27 → AA."""
    name = ""
    while index:
        index, rest = divmod(index - 1, 26)
        name = chr(65 + rest) + name
    return name


def _column_index(ref: str) -> int:
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):  # type: ignore[union-attr]
        n = n * 26 + ord(ch) - 64
    return n


def _cell_value(raw: str) -> str:
    """Normalize one cell: '2', '2.0', ' b ' → '2' / 'B'; blank → ''."""
    value = raw.strip().upper()
    if re.fullmatch(r"\d+\.0+", value):
        value = value.split(".")[0]
    return value


def parse_rows(rows: list[tuple[int, list[str]]], sheet: str | None = None) -> ParsedFile:
    """`rows` = (spreadsheet row number, cell texts from column A on)."""
    parsed = ParsedFile(rounds=[], sheet=sheet)
    problems: list[str] = []
    for row_no, cells in rows:
        game = _cell_value(cells[0]) if cells else ""
        if not re.fullmatch(r"\d+", game):
            continue  # header / notes
        values = [_cell_value(c) for c in cells[1:]]
        while values and values[-1] == "":
            values.pop()
        if not values:
            continue  # game number without plays yet
        if len(values) > MAX_PLAYS:
            problems.append(f"แถว {row_no} (Game {game}): มี {len(values)} ช่อง เกิน {MAX_PLAYS}")
            continue
        results = []
        for offset, value in enumerate(values):
            if value == "":
                results.append(SKIP)
            elif value in CODES:
                results.append(CODES[value])
            elif value in COLORS or value == SKIP:
                results.append(value)
            else:
                cell = f"{column_name(offset + 2)}{row_no}"
                problems.append(f"เซลล์ {cell} (Game {game}, S{offset + 1}): ค่า '{value}' ไม่ใช่ 1–5")
                results.append("?")
        parsed.rounds.append("".join(results))
        parsed.games.append(game)
    if problems:
        raise ImportProblem(problems)
    if not parsed.rounds:
        raise ImportProblem(["ไม่พบแถวข้อมูล (คอลัมน์ A ต้องเป็นเลข Game และคอลัมน์ถัดไปเป็นผล 1–5)"])
    return parsed


def read_csv(data: bytes) -> list[tuple[int, list[str]]]:
    text = data.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return [(i, row) for i, row in enumerate(csv.reader(io.StringIO(text), dialect), start=1)]


def read_xlsx(data: bytes, sheet: str | None = None) -> tuple[list[tuple[int, list[str]]], str]:
    """Cell values of one worksheet (default: the first). Returns (rows, sheet name)."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise ImportProblem(["ไฟล์ .xlsx เสียหรือไม่ครบ (อาจ copy ไม่เสร็จ) — เปิดใน Excel แล้ว Save ใหม่ หรือ Save As .csv"]) from error
    shared: list[str] = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ElementTree.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{_MAIN_NS}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{_MAIN_NS}t")))
    workbook = ElementTree.fromstring(z.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target", "") for r in rels.iter(f"{_PKG_REL_NS}Relationship")}
    sheets = [(s.get("name", ""), targets.get(s.get(f"{_REL_NS}id"), "")) for s in workbook.iter(f"{_MAIN_NS}sheet")]
    if not sheets:
        raise ImportProblem(["ไม่พบ sheet ในไฟล์"])
    if sheet is None:
        name, target = sheets[0]
    else:
        match = [s for s in sheets if s[0].strip().lower() == sheet.strip().lower()]
        if not match:
            raise ImportProblem([f"ไม่พบ sheet '{sheet}' (มี: {', '.join(s[0] for s in sheets)})"])
        name, target = match[0]
    path = target.lstrip("/")
    path = path if path.startswith("xl/") else f"xl/{path}"

    rows: list[tuple[int, list[str]]] = []
    for row in ElementTree.fromstring(z.read(path)).iter(f"{_MAIN_NS}row"):
        cells: dict[int, str] = {}
        for c in row.iter(f"{_MAIN_NS}c"):
            v = c.find(f"{_MAIN_NS}v")
            if v is not None and v.text is not None:
                value = shared[int(v.text)] if c.get("t") == "s" else v.text
            else:
                inline = c.find(f"{_MAIN_NS}is")
                value = "".join(t.text or "" for t in inline.iter(f"{_MAIN_NS}t")) if inline is not None else ""
            cells[_column_index(c.get("r", "A"))] = value
        if cells:
            rows.append((int(row.get("r", "0")), [cells.get(i, "") for i in range(1, max(cells) + 1)]))
    return rows, name


def parse_file(path: Path, sheet: str | None = None) -> ParsedFile:
    data = path.read_bytes()
    if path.suffix.lower() == ".xlsx":
        rows, name = read_xlsx(data, sheet)
        return parse_rows(rows, name)
    if path.suffix.lower() in (".csv", ".txt"):
        return parse_rows(read_csv(data))
    raise ImportProblem([f"รองรับเฉพาะ .xlsx และ .csv (ได้ {path.suffix or 'ไม่มีนามสกุล'})"])


async def find_table(db: AsyncSession, table: str) -> GameTable:
    """By code (dt-1) or by exact name (โต๊ะ 1), active tables only."""
    for cond in (GameTable.code == table, GameTable.name == table):
        found = (await db.execute(select(GameTable).where(cond, GameTable.deleted_at.is_(None)))).scalars().all()
        if len(found) == 1:
            return found[0]
    raise ImportProblem([f"ไม่พบโต๊ะ '{table}'"])


async def replace_rounds(db: AsyncSession, table: GameTable, rounds: list[str], source: str) -> None:
    """Delete all of the table's rounds, counts and log, then write `rounds` as rounds 1..N — one transaction.

    The version bump makes every open page reload the new data.
    """
    now = datetime.now(timezone.utc)
    table_id = table.id
    await db.execute(update(GameTable).where(GameTable.id == table_id).values(version=GameTable.version + 1))
    for model in (DtPlayEvent, DtBlockCount, DtRound):
        await db.execute(delete(model).where(model.table_id == table_id))

    round_rows = [
        {
            "table_id": table_id,
            "round_no": round_no,
            "results": results,
            "status": COMPLETE if len(results) >= table.plays_per_round else ENDED_EARLY,
            "created_at": now,
            "updated_at": now,
        }
        for round_no, results in enumerate(rounds, start=1)
    ]
    counts: Counter[tuple[int, int, str]] = Counter()
    for round_no, results in enumerate(rounds, start=1):
        for position, value in enumerate(results, start=1):
            if value in COLORS:
                counts[(position, block_of(round_no), value)] += 1
    count_rows = [
        {"table_id": table_id, "position": p, "block_no": b, "color": c, "count": n} for (p, b, c), n in counts.items()
    ]
    for rows, model in ((round_rows, DtRound), (count_rows, DtBlockCount)):
        for start in range(0, len(rows), 5000):
            await db.execute(insert(model), rows[start : start + 5000])
    db.add(
        DtPlayEvent(
            table_id=table_id,
            round_no=len(rounds),
            position=None,
            action="import",
            value=f"{len(rounds)} rounds: {source}"[:60],
            device_id="import",
            created_at=now,
        )
    )
    await db.commit()
