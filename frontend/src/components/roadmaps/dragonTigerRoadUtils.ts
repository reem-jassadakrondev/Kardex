import type { DragonTigerRound, DragonTigerSide } from '../../types/dragonTiger';

export function toSide(result: string): DragonTigerSide | null {
  if (result === 'banker' || result === 'dragon') return 'dragon';
  if (result === 'player' || result === 'tiger') return 'tiger';
  if (result === 'tie') return 'tie';
  return null;
}

/** Standard Big Road columns: ties do not advance the column; dragon/tiger only. */
export function buildBigRoadGrid(rounds: DragonTigerRound[]): Array<Array<{ side: DragonTigerSide; natural?: boolean } | null>> {
  const columns: Array<Array<{ side: DragonTigerSide; natural?: boolean } | null>> = [];
  let col = -1;
  let row = 0;
  let lastSide: DragonTigerSide | null = null;

  for (const round of rounds) {
    if (round.result === 'tie') continue;

    if (lastSide !== round.result) {
      col += 1;
      row = 0;
      lastSide = round.result;
      if (!columns[col]) columns[col] = [];
      columns[col][row] = { side: round.result, natural: round.natural };
      continue;
    }

    row += 1;
    if (row >= 6) {
      col += 1;
      row = 0;
    }
    if (!columns[col]) columns[col] = [];
    columns[col][row] = { side: round.result, natural: round.natural };
  }

  const maxCols = Math.max(columns.length, 24);
  const maxRows = 6;
  const grid: Array<Array<{ side: DragonTigerSide; natural?: boolean } | null>> = [];
  for (let r = 0; r < maxRows; r += 1) {
    const line: Array<{ side: DragonTigerSide; natural?: boolean } | null> = [];
    for (let c = 0; c < maxCols; c += 1) {
      line.push(columns[c]?.[r] ?? null);
    }
    grid.push(line);
  }
  return grid;
}

export function buildBeadPlateRows(rounds: DragonTigerRound[], rowCount = 6): DragonTigerSide[][] {
  const rows: DragonTigerSide[][] = Array.from({ length: rowCount }, () => []);
  rounds.forEach((round, index) => {
    rows[index % rowCount].push(round.result);
  });
  return rows;
}

export function computeRoundStats(rounds: DragonTigerRound[]) {
  return {
    dragon: rounds.filter((r) => r.result === 'dragon').length,
    tiger: rounds.filter((r) => r.result === 'tiger').length,
    tie: rounds.filter((r) => r.result === 'tie').length,
    flush: rounds.filter((r) => r.flush).length,
    flushTie: rounds.filter((r) => r.flushTie).length,
    total: rounds.length,
  };
}

export function computeWinRates(rounds: DragonTigerRound[]) {
  const dragon = rounds.filter((r) => r.result === 'dragon').length;
  const tiger = rounds.filter((r) => r.result === 'tiger').length;
  const decisive = dragon + tiger;
  if (decisive === 0) {
    return { dragon: 50, tiger: 50 };
  }
  return {
    dragon: Math.round((dragon / decisive) * 100),
    tiger: Math.round((tiger / decisive) * 100),
  };
}
