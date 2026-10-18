import { memo, useEffect, useRef } from 'react';
import type { Cursor, GridRound, PlayValue } from '../../api/dtGrid';
import { COLOR_META, isColor } from './colors';

interface ColorGridProps {
  rounds: GridRound[];
  cursor: Cursor;
  playsPerRound: number;
  /** Queued taps not yet confirmed by the server, drawn faded from the cursor onward. */
  pending: PlayValue[];
  hasMore: boolean;
  onLoadMore: () => void;
}

const NO_PENDING: PlayValue[] = [];

const STATUS_MARK: Record<GridRound['status'], string> = { open: '', complete: '', ended_early: '⏹' };

function Cell({ value, isCursor, pending }: { value: string; isCursor: boolean; pending: PlayValue | null }) {
  const shown = pending || value;
  let className = 'dtg-cell';
  if (isCursor) className += ' dtg-cell--cursor';
  if (pending) className += ' dtg-cell--pending';

  return (
    <td className={className}>
      {isColor(shown) ? (
        <span className="dtg-dot" style={{ backgroundColor: COLOR_META[shown].bg, color: COLOR_META[shown].fg }}>
          {shown}
        </span>
      ) : shown === '-' ? (
        <span className="dtg-skip">–</span>
      ) : null}
    </td>
  );
}

interface RowProps {
  round: GridRound;
  columns: number;
  cursorPosition: number; // 0 when the cursor is not in this row
  pending: PlayValue[]; // queued values starting at cursorPosition
}

const Row = memo(function Row({ round, columns, cursorPosition, pending }: RowProps) {
  const cells = [];
  const nextFree = cursorPosition ? cursorPosition + pending.length : 0;
  for (let position = 1; position <= columns; position += 1) {
    const queued = cursorPosition && position >= cursorPosition ? pending[position - cursorPosition] : undefined;
    cells.push(
      <Cell key={position} value={round.results.charAt(position - 1)} isCursor={position === nextFree} pending={queued || null} />,
    );
  }
  return (
    <tr className={cursorPosition ? 'dtg-row--current' : undefined}>
      <th className="dtg-rowhead" scope="row">
        {round.round_no.toLocaleString()}
        {STATUS_MARK[round.status] ? <span className="dtg-rowmark" title="จบรอบก่อนครบ">{STATUS_MARK[round.status]}</span> : null}
      </th>
      {cells}
    </tr>
  );
});

/** The 60-column grid: one row per round, newest at the bottom, the next cell highlighted. */
export function ColorGrid({ rounds, cursor, playsPerRound, pending, hasMore, onLoadMore }: ColorGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const lastRoundNo = rounds.length ? rounds[rounds.length - 1].round_no : 0;
  const rows: GridRound[] =
    cursor.round_no > lastRoundNo ? [...rounds, { round_no: cursor.round_no, results: '', status: 'open' }] : rounds;

  // Keep the current cell in view (centered horizontally, near the bottom vertically).
  useEffect(() => {
    const box = scrollRef.current;
    const cell = box ? (box.querySelector('.dtg-cell--cursor') as HTMLElement | null) : null;
    if (!box || !cell) return;
    const boxRect = box.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const cellLeft = cellRect.left - boxRect.left + box.scrollLeft;
    const cellTop = cellRect.top - boxRect.top + box.scrollTop;
    box.scrollLeft = Math.max(0, cellLeft - box.clientWidth / 2);
    if (cellTop < box.scrollTop || cellTop + cellRect.height > box.scrollTop + box.clientHeight) {
      box.scrollTop = Math.max(0, cellTop - box.clientHeight + cellRect.height * 2);
    }
  }, [cursor.round_no, cursor.position, pending.length, rows.length]);

  const headers = [];
  const nextPosition = cursor.position + pending.length;
  for (let position = 1; position <= playsPerRound; position += 1) {
    headers.push(
      <th key={position} className={position === nextPosition ? 'dtg-colhead dtg-colhead--cursor' : 'dtg-colhead'} scope="col">
        {position}
      </th>,
    );
  }

  return (
    <div className="dtg-gridbox" ref={scrollRef}>
      {hasMore ? (
        <button type="button" className="dtg-loadmore" onClick={onLoadMore}>
          โหลดรอบก่อนหน้า
        </button>
      ) : null}
      <table className="dtg-grid">
        <thead>
          <tr>
            <th className="dtg-corner" scope="col">
              รอบ
            </th>
            {headers}
          </tr>
        </thead>
        <tbody>
          {rows.map((round) => (
            <Row
              key={round.round_no}
              round={round}
              columns={playsPerRound}
              cursorPosition={round.round_no === cursor.round_no ? cursor.position : 0}
              pending={round.round_no === cursor.round_no ? pending : NO_PENDING}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
