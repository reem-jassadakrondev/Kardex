import { useState } from 'react';
import type { RangePreset } from './range';

const LAST_OPTIONS = [100, 1000, 10000];

function parseRound(text: string): number | undefined {
  const n = Number(text.replace(/[^\d]/g, ''));
  return n >= 1 ? Math.floor(n) : undefined;
}

interface RangePickerProps {
  value: RangePreset;
  totalRounds: number;
  onChange: (next: RangePreset) => void;
}

/** Limits which rounds the hit rates are computed from (e.g. rounds 500,000–999,999). */
export function RangePicker({ value, totalRounds, onChange }: RangePickerProps) {
  const [from, setFrom] = useState(value.kind === 'custom' && value.from ? String(value.from) : '');
  const [to, setTo] = useState(value.kind === 'custom' && value.to ? String(value.to) : '');
  const [editing, setEditing] = useState(value.kind === 'custom');

  const fromValue = parseRound(from);
  const toValue = parseRound(to);
  const invalid = fromValue !== undefined && toValue !== undefined && fromValue > toValue;

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button key={label} type="button" className={active ? 'dtg-chip dtg-chip--active' : 'dtg-chip'} onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className="dtg-range">
      <span className="dtg-range__label">คำนวณจาก</span>
      {chip('ทุกรอบ', value.kind === 'all' && !editing, () => {
        setEditing(false);
        onChange({ kind: 'all' });
      })}
      {LAST_OPTIONS.map((count) =>
        chip(`${count.toLocaleString()} รอบล่าสุด`, value.kind === 'last' && value.count === count && !editing, () => {
          setEditing(false);
          onChange({ kind: 'last', count });
        }),
      )}
      {chip('กำหนดช่วง', editing, () => setEditing(true))}

      {editing ? (
        <form
          className="dtg-range__custom"
          onSubmit={(event) => {
            event.preventDefault();
            if (!invalid) onChange({ kind: 'custom', from: fromValue, to: toValue });
          }}
        >
          <input
            className="dtg-input"
            inputMode="numeric"
            placeholder="จากรอบ (1)"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <span className="dtg-range__dash">–</span>
          <input
            className="dtg-input"
            inputMode="numeric"
            placeholder={`ถึงรอบ (${totalRounds.toLocaleString()})`}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <button type="submit" className="dtg-btn dtg-btn--dark" disabled={invalid}>
            ใช้ช่วงนี้
          </button>
          {invalid ? <span className="dtg-range__error">รอบเริ่มต้องไม่มากกว่ารอบสุดท้าย</span> : null}
        </form>
      ) : null}
    </div>
  );
}
