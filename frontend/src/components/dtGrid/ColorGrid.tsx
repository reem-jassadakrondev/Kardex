import { memo, useEffect, useRef } from 'react';
import type { Cursor, GridRound, PlayValue } from '../../api/dtGrid';
import { cellMeta } from './colors';

export interface ColumnWindow {
  from: number;
  to: number;
}

interface ColorGridProps {
  /** Earlier rounds to show (all of them, or only the matching ones), oldest first. */
  rounds: GridRound[];
  /** The round being recorded; pinned at the bottom, right above the color buttons. */
  current: GridRound;
  cursor: Cursor;
  playsPerRound: number;
  /** Queued taps not yet confirmed by the server, drawn faded from the cursor onward. */
  pending: PlayValue[];
  /** Columns compared when matching (highlighted); null when not filtering. */
  window: ColumnWindow | null;
  /** Shown instead of rows when `rounds` is empty. */
  emptyText: string;
  stale: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  /** Row header of the pinned row (default: its round number). */
  currentLabel?: string;
  /** How a stored cell is shown (the calc page shows green/yellow/black as Joker). */
  mapValue?: (value: string) => string;
}

const identity = (value: string) => value;

const NO_PENDING: PlayValue[] = [];

const STATUS_MARK: Record<GridRound['status'], string> = { open: '', complete: '', ended_early: '⏹' };

function Cell({ value, className, pending }: { value: string; className: string; pending: string | null }) {
  const shown = pending || value;
  const meta = cellMeta(shown);
  return (
    <td className={pending ? `${className} dtg-cell--pending` : className}>
      {meta ? (
        <span className="dtg-dot" style={{ backgroundColor: meta.bg, color: meta.fg }}>
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
  /** Highlighted columns: compared window and the next column (0 = none). */
  windowFrom: number;
  windowTo: number;
  nextColumn: number;
  /** Current row only: the next free cell and the queued values from the server cursor on. */
  cursorPosition: number;
  pending: PlayValue[];
  label?: string;
  mapValue: (value: string) => string;
}

const Row = memo(function Row({ round, columns, windowFrom, windowTo, nextColumn, cursorPosition, pending, label, mapValue }: RowProps) {
  const cells = [];
  const nextFree = cursorPosition ? cursorPosition + pending.length : 0;
  for (let position = 1; position <= columns; position += 1) {
    const queued = cursorPosition && position >= cursorPosition ? pending[position - cursorPosition] : undefined;
    let className = 'dtg-cell';
    if (position === nextFree) className += ' dtg-cell--cursor';
    else if (position === nextColumn) className += ' dtg-cell--next';
    else if (position >= windowFrom && position <= windowTo) className += ' dtg-cell--win';
    cells.push(<Cell key={position} value={mapValue(round.results.charAt(position - 1))} className={className} pending={queued || null} />);
  }
  return (
    <tr className={cursorPosition ? 'dtg-row--current' : undefined}>
      <th className="dtg-rowhead" scope="row">
        {label || round.round_no.toLocaleString()}
        {STATUS_MARK[round.status] ? <span className="dtg-rowmark" title="จบรอบก่อนครบ">{STATUS_MARK[round.status]}</span> : null}
      </th>
      {cells}
    </tr>
  );
});

/**
 * The 60-column grid: earlier rounds (newest at the bottom) and, pinned below them, the round being
 * recorded with its next cell highlighted. While matching, the compared columns and the next column
 * of every matching round are highlighted so the operator sees what came next.
 */
export function ColorGrid({
  rounds,
  current,
  cursor,
  playsPerRound,
  pending,
  window,
  emptyText,
  stale,
  hasMore,
  onLoadMore,
  currentLabel,
  mapValue = identity,
}: ColorGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextPosition = cursor.position + pending.length;
  const windowFrom = window ? window.from : 0;
  const windowTo = window ? window.to : 0;
  const nextColumn = window ? cursor.position : 0;
  const listKey = `${rounds.length ? rounds[0].round_no : 0}-${rounds.length ? rounds[rounds.length - 1].round_no : 0}-${rounds.length}-${windowFrom}-${windowTo}`;

  // Horizontally: keep the next cell centered.
  useEffect(() => {
    const box = scrollRef.current;
    const cell = box ? (box.querySelector('.dtg-cell--cursor') as HTMLElement | null) : null;
    if (!box || !cell) return;
    const cellLeft = cell.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollLeft = Math.max(0, cellLeft - box.clientWidth / 2);
  }, [cursor.round_no, nextPosition]);

  // Vertically: show the newest rounds (just above the pinned current row) whenever the list changes.
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [listKey]);

  const headers = [];
  for (let position = 1; position <= playsPerRound; position += 1) {
    let className = 'dtg-colhead';
    if (position === nextPosition) className += ' dtg-colhead--cursor';
    else if (position >= windowFrom && position <= windowTo) className += ' dtg-colhead--win';
    headers.push(
      <th key={position} className={className} scope="col">
        {position}
      </th>,
    );
  }

  return (
    <div className={stale ? 'dtg-gridbox dtg-gridbox--stale' : 'dtg-gridbox'} ref={scrollRef}>
      {hasMore ? (
        <button type="button" className="dtg-loadmore" onClick={onLoadMore}>
          โหลดแถวก่อนหน้า
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
          {rounds.length ? (
            rounds.map((round) => (
              <Row
                key={round.round_no}
                round={round}
                columns={playsPerRound}
                windowFrom={windowFrom}
                windowTo={windowTo}
                nextColumn={nextColumn}
                cursorPosition={0}
                pending={NO_PENDING}
                mapValue={mapValue}
              />
            ))
          ) : (
            <tr>
              <th className="dtg-rowhead" scope="row" />
              <td className="dtg-empty" colSpan={playsPerRound}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <Row
            round={current}
            columns={playsPerRound}
            windowFrom={windowFrom}
            windowTo={windowTo}
            nextColumn={0}
            cursorPosition={cursor.position}
            pending={pending}
            label={currentLabel}
            mapValue={mapValue}
          />
        </tfoot>
      </table>
    </div>
  );
}
