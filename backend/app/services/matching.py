"""Pattern matching ("จับคู่แถว"): earlier rounds whose cells match the current round's last N cells.

With the current round filled up to column p-1, the window is columns max(1, p-N) … p-1 (N = 0: the
whole row so far). An earlier round matches when every window cell has the same color; a skipped cell
("-") on either side matches any color, and a round that ended before the window's last column does
not match. The colors those rounds had at column p are the "next cell" counts.

No index can serve a sliding window with wildcards, so this scans the rounds in range (newest table
rows are read through the primary key). It runs after a write, never inside it.

The calc page (หน้าคำนวณ, `match_pattern`) runs the same matching on a hypothetical row typed by the
user and never written, in 3 colors: red R, blue B and Joker J. Joker is a wildcard, and every stored
cell that is not R or B (G, and Y/K from older data) counts as Joker.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dt import DtRound
from app.models.game_table import GameTable
from app.services.dt_grid import COLORS, OPEN, SKIP, column_counts, cursor_of, stats_range

JOKER = "J"
CALC_COLORS = ("R", "B", JOKER)
WILD_STORED = (SKIP, "G", "Y", "K")  # stored cells that match anything on the calc page


def calc_color(value: str) -> str | None:
    """Stored cell → calc-page color (R / B / J); None for skipped or missing cells."""
    if value in ("R", "B"):
        return value
    return JOKER if value in ("G", "Y", "K") else None


@dataclass
class Matches:
    round_no: int  # current round / next cell
    position: int
    window_from: int | None  # None: nothing filled in the current round yet → no filtering
    window_to: int | None
    pattern: str  # the current round's cells in the window
    range_from: int | None
    range_to: int | None
    total: int | None = None  # matching rounds; None when not filtering
    counts: dict[str, int] = field(default_factory=dict)  # colors at the next cell among the matches
    rounds: list[DtRound] = field(default_factory=list)  # one page, oldest first
    has_more: bool = False
    palette: tuple[str, ...] = COLORS
    all_counts: dict[str, int] = field(default_factory=dict)  # next column over every round in range (calc page)

    @property
    def sample_size(self) -> int:
        return sum(self.counts.values())

    @property
    def percentages(self) -> dict[str, float]:
        n = self.sample_size
        return {color: round(self.counts.get(color, 0) * 100 / n, 1) if n else 0.0 for color in self.palette}


def window_of(position: int, size: int) -> tuple[int, int] | None:
    """Columns compared for the next cell at `position`; size 0 = from column 1."""
    if position <= 1:
        return None
    start = max(1, position - size) if size > 0 else 1
    return start, position - 1


async def find_matches(
    db: AsyncSession,
    table: GameTable,
    last: DtRound | None,
    size: int,
    from_round: int | None = None,
    to_round: int | None = None,
    last_rounds: int | None = None,
    before_round: int | None = None,
    limit: int = 50,
) -> Matches:
    cursor = cursor_of(last)
    current = last.results if last is not None and last.status == OPEN else ""
    lo, hi = stats_range(last, from_round, to_round, last_rounds)
    hi = min(hi, cursor.round_no - 1)  # never match the current round against itself
    window = window_of(cursor.position, size)
    result = Matches(
        round_no=cursor.round_no,
        position=cursor.position,
        window_from=window[0] if window else None,
        window_to=window[1] if window else None,
        pattern=current[window[0] - 1 : window[1]] if window else "",
        range_from=lo if lo <= hi else None,
        range_to=hi if lo <= hi else None,
    )
    if window is None:
        return result
    result.total = 0
    result.counts = {color: 0 for color in COLORS}
    if lo > hi:
        return result

    start, end = window
    conds = [DtRound.table_id == table.id, DtRound.round_no.between(lo, hi), func.length(DtRound.results) >= end]
    for column in range(start, end + 1):
        value = current[column - 1]
        if value != SKIP:
            conds.append(func.substr(DtRound.results, column, 1).in_((value, SKIP)))
    await _collect(db, result, and_(*conds), lambda value: value if value in COLORS else None, before_round, limit)
    return result


async def _collect(db: AsyncSession, result: Matches, where, classify, before_round: int | None, limit: int) -> None:
    """Fill total/counts (next column, through `classify`) and one page of rounds matching `where`."""
    nxt = func.substr(DtRound.results, result.position, 1)
    for value, total in (await db.execute(select(nxt, func.count()).where(where).group_by(nxt))).all():
        result.total = (result.total or 0) + int(total)
        color = classify(value)
        if color is not None:
            result.counts[color] = result.counts.get(color, 0) + int(total)
    await _page(db, result, where, before_round, limit)


async def _page(db: AsyncSession, result: Matches, where, before_round: int | None, limit: int) -> None:
    page = select(DtRound).where(where)
    if before_round is not None:
        page = page.where(DtRound.round_no < before_round)
    rows = list((await db.execute(page.order_by(DtRound.round_no.desc()).limit(limit + 1))).scalars())
    result.has_more = len(rows) > limit
    result.rounds = list(reversed(rows[:limit]))


async def match_pattern(
    db: AsyncSession,
    table: GameTable,
    last: DtRound | None,
    pattern: str,
    size: int,
    from_round: int | None = None,
    to_round: int | None = None,
    last_rounds: int | None = None,
    before_round: int | None = None,
    limit: int = 50,
) -> Matches:
    """Calc page: match a typed row of R / B / J / - (never stored) against every round in range.

    Unlike `find_matches`, the round being recorded on the main page is included: the typed row is not
    one of the table's rounds. With nothing typed yet, the page lists the newest rounds unfiltered.
    """
    position = len(pattern) + 1
    lo, hi = stats_range(last, from_round, to_round, last_rounds)
    window = window_of(position, size)
    result = Matches(
        round_no=0,
        position=position,
        window_from=window[0] if window else None,
        window_to=window[1] if window else None,
        pattern=pattern[window[0] - 1 : window[1]] if window else "",
        range_from=lo if lo <= hi else None,
        range_to=hi if lo <= hi else None,
        palette=CALC_COLORS,
    )
    result.counts = {color: 0 for color in CALC_COLORS}
    result.all_counts = {color: 0 for color in CALC_COLORS}
    if lo > hi:
        if window is not None:
            result.total = 0
        return result

    if position <= table.plays_per_round:
        for color, count in (await column_counts(db, table.id, position, lo, hi)).items():
            mapped = calc_color(color)
            if mapped is not None:
                result.all_counts[mapped] += count

    in_range = [DtRound.table_id == table.id, DtRound.round_no.between(lo, hi)]
    if window is None:
        await _page(db, result, and_(*in_range), before_round, limit)
        return result

    start, end = window
    conds = [*in_range, func.length(DtRound.results) >= end]
    for column in range(start, end + 1):
        value = pattern[column - 1]
        if value in ("R", "B"):  # J and - match anything
            conds.append(func.substr(DtRound.results, column, 1).in_((value, *WILD_STORED)))
    result.total = 0
    await _collect(db, result, and_(*conds), calc_color, before_round, limit)
    return result
