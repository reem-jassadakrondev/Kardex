"""Import rounds from a spreadsheet into a table, replacing all of that table's data.

    python -m app.cli.import_rounds FILE [--table dt-1] [--sheet "DAI LY"]            # check only
    python -m app.cli.import_rounds FILE [--table dt-1] [--sheet "DAI LY"] --replace  # write

On the customer's machine use deploy\\windows\\import-rounds.bat (backs up first). Exit codes:
0 ok, 2 the file has problems (listed), 3 the table was not found.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from app.core.database import SessionLocal, engine
from app.services import importer
from app.services.dt_grid import COLORS, SKIP, last_round

COLOR_NAMES = {"R": "แดง", "B": "น้ำเงิน", "Y": "เหลือง", "K": "ดำ", "G": "เขียว", SKIP: "ข้าม"}


def show(parsed: importer.ParsedFile) -> None:
    s = parsed.summary()
    print(f"  sheet: {parsed.sheet}" if parsed.sheet else "  file: csv")
    print(f"  rounds: {s['rounds']:,} (Game {s['games']})")
    print("  plays per round: " + ", ".join(f"{n} ช่อง × {k:,} รอบ" for n, k in s["lengths"].items()))
    print("  colors: " + ", ".join(f"{c} {COLOR_NAMES[c]} {s['colors'][c]:,}" for c in (*COLORS, SKIP) if s["colors"][c]))
    print(f"  first round: {parsed.rounds[0]}")
    print(f"  last round:  {parsed.rounds[-1]}")


async def run(args: argparse.Namespace) -> int:
    try:
        parsed = importer.parse_file(Path(args.file), args.sheet)
    except importer.ImportProblem as problem:
        print("ไฟล์มีปัญหา — แก้แล้วลองใหม่ (ยังไม่ได้เปลี่ยนข้อมูลใดๆ):")
        for line in problem.problems:
            print(f"  - {line}")
        return 2
    except FileNotFoundError:
        print(f"ไม่พบไฟล์: {args.file}")
        return 2

    print(f"File {args.file}")
    show(parsed)
    try:
        async with SessionLocal() as db:
            table = await importer.find_table(db, args.table)
            longest = max(len(r) for r in parsed.rounds)
            if longest > table.plays_per_round:
                print(f"มีรอบยาว {longest} ช่อง แต่โต๊ะนี้มี {table.plays_per_round} ช่อง/รอบ")
                return 2
            last = await last_round(db, table.id)
            print(f"Table {table.code} '{table.name}': has {last.round_no if last else 0:,} rounds now -> will have {len(parsed.rounds):,}")
            if not args.replace:
                print("Check only (add --replace to write).")
                return 0
            await importer.replace_rounds(db, table, parsed.rounds, Path(args.file).name)
            print(f"Imported {len(parsed.rounds):,} rounds into '{table.name}' (old data of this table removed).")
            return 0
    except importer.ImportProblem as problem:
        print(problem.problems[0])
        return 3
    finally:
        await engine.dispose()


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Thai text in the Windows console
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file")
    parser.add_argument("--table", default="dt-1", help="table code or exact name (default dt-1 = โต๊ะ 1)")
    parser.add_argument("--sheet", help="xlsx sheet name (default: the first sheet)")
    parser.add_argument("--replace", action="store_true", help="write: delete the table's data, then import")
    sys.exit(asyncio.run(run(parser.parse_args())))


if __name__ == "__main__":
    main()
