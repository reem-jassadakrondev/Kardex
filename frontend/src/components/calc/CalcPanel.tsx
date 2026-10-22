import { useEffect, useRef, useState } from 'react';
import type { StatsScope } from '../../api/dtGrid';
import { useCalc } from '../../hooks/useCalc';
import { ColorGrid } from '../dtGrid/ColorGrid';
import { CALC_COLORS, COLOR_META, JOKER_META, toCalc, type CalcColor } from '../dtGrid/colors';
import { MatchPicker } from '../dtGrid/MatchPicker';
import { Rates } from '../dtGrid/Rates';

const MAX_CELLS = 60;
const NO_PENDING: never[] = [];
const META: Record<CalcColor, { label: string; bg: string; fg: string }> = { R: COLOR_META.R, B: COLOR_META.B, J: JOKER_META };

const patternKey = (code: string) => `kardex-calc-${code}`;

function loadPattern(code: string): string {
  try {
    const raw = localStorage.getItem(patternKey(code)) || '';
    return /^[RBJ-]{0,60}$/.test(raw) ? raw : '';
  } catch {
    return '';
  }
}

interface CalcPanelProps {
  code: string;
  /** Table version from the table page's polling: a change means new rounds to match against. */
  version: number | null;
  scope: StatsScope;
  windowSize: number;
  onWindowChange: (size: number) => void;
  /** The row being recorded on the main grid (with queued taps), for "ใช้แถวปัจจุบัน". */
  currentRow: string;
  /** Shown together with the recording grid: no window chips (shared above), smaller grid. */
  split: boolean;
  /** Keyboard shortcuts go to this panel (calc mode on its own). */
  keyboard: boolean;
}

/**
 * Calc mode (หน้าคำนวณ): type a hypothetical row in 3 colors (red, blue, Joker) and see which recorded
 * rounds match its latest cells and what came next. The typed row is kept on this device only and is
 * never sent to the database.
 */
export function CalcPanel({ code, version, scope, windowSize, onWindowChange, currentRow, split, keyboard }: CalcPanelProps) {
  const [pattern, setPattern] = useState<string>(() => loadPattern(code));
  const [confirmClear, setConfirmClear] = useState(false);
  const calc = useCalc(code, pattern, windowSize, scope, version);
  const data = calc.data;

  useEffect(() => {
    try {
      localStorage.setItem(patternKey(code), pattern);
    } catch {
      /* storage blocked: the typed row just won't survive a reload */
    }
  }, [code, pattern]);

  const full = pattern.length >= MAX_CELLS;
  const fromCurrent = currentRow.split('').map(toCalc).join('').slice(0, MAX_CELLS);
  const type = (value: CalcColor | '-') => {
    setConfirmClear(false);
    setPattern((current) => (current.length >= MAX_CELLS ? current : current + value));
  };
  const undo = () => setPattern((current) => current.slice(0, -1));

  const handlers = useRef({ type, undo, keyboard });
  useEffect(() => {
    handlers.current = { type, undo, keyboard };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!handlers.current.keyboard) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = (event.key || '').toUpperCase(); // event.key is undefined on iOS < 10.1
      if (key === 'R' || key === 'B') handlers.current.type(key);
      else if (key === 'J' || key === 'G') handlers.current.type('J');
      else if (key === '-' || key === 'S') handlers.current.type('-');
      else if (event.key === 'Backspace' || event.keyCode === 8) {
        event.preventDefault();
        handlers.current.undo();
      } else if (event.key === 'Escape') setConfirmClear(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtering = pattern.length > 0;
  const match = data && data.window_from !== null ? data : null;
  const position = pattern.length + 1;

  return (
    <div className="calc">
      {split ? (
        <h2 className="calc__title">
          หน้าคำนวณ <span>3 สี · ไม่บันทึก · Joker = เขียว เหลือง ดำ (ตรงทุกสี)</span>
        </h2>
      ) : null}
      <MatchPicker
        size={windowSize}
        match={filtering ? match : null}
        stale={calc.stale}
        onChange={onWindowChange}
        showChips={!split}
        hint="กรอกสีช่องแรกแล้วตารางจะเหลือเฉพาะแถวจริงที่ตรงกัน (เขียว เหลือง ดำ = Joker)"
      />

      <ColorGrid
        rounds={data ? data.rounds : []}
        current={{ round_no: 0, results: pattern, status: 'open' }}
        currentLabel="ทดลอง"
        cursor={{ round_no: 0, position: Math.min(position, MAX_CELLS + 1) }}
        playsPerRound={MAX_CELLS}
        pending={NO_PENDING}
        window={filtering && match && match.window_from !== null && match.window_to !== null ? { from: match.window_from, to: match.window_to } : null}
        emptyText={!data ? 'กำลังโหลด…' : filtering ? (calc.stale ? 'กำลังค้นหาแถวที่ตรงกัน…' : 'ไม่มีแถวที่ตรงกัน — ลองลดจำนวนช่องที่จับคู่') : 'ยังไม่มีรอบในโต๊ะนี้'}
        stale={calc.stale}
        hasMore={!!data && data.has_more}
        onLoadMore={() => void calc.loadMore()}
        mapValue={toCalc}
      />

      {confirmClear ? (
        <div className="dtg-confirm">
          <span>ล้างแถวทดลองทั้งหมด ({pattern.length} ช่อง)?</span>
          <span className="dtg-confirm__buttons">
            <button type="button" className="dtg-btn" onClick={() => setConfirmClear(false)}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="dtg-btn dtg-btn--danger"
              onClick={() => {
                setPattern('');
                setConfirmClear(false);
              }}
            >
              ล้าง
            </button>
          </span>
        </div>
      ) : null}

      <div className="dtg-cols">
        <div className="dtg-col">
          <section className="dtg-panel">
            <div className="dtg-pad">
              {CALC_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="dtg-colorbtn"
                  style={{ backgroundColor: META[color].bg, color: META[color].fg }}
                  disabled={full}
                  onClick={() => type(color)}
                  aria-label={META[color].label}
                >
                  <span className="dtg-colorbtn__key">{color}</span>
                  <span className="dtg-colorbtn__label">{META[color].label}</span>
                </button>
              ))}
            </div>
            <div className="dtg-actions">
              <button type="button" className="dtg-btn" disabled={!pattern} onClick={undo}>
                ↶ ลบตัวท้าย
              </button>
              <button type="button" className="dtg-btn" disabled={full} onClick={() => type('-')}>
                ⏭ ข้ามช่อง
              </button>
              <button type="button" className="dtg-btn dtg-btn--danger" disabled={!pattern} onClick={() => setConfirmClear(true)}>
                ✕ เคลียร์รอบ
              </button>
              <button
                type="button"
                className="dtg-btn dtg-btn--copy"
                disabled={!fromCurrent || fromCurrent === pattern}
                onClick={() => {
                  setConfirmClear(false);
                  setPattern(fromCurrent);
                }}
              >
                ⇩ ใช้แถวปัจจุบัน
              </button>
            </div>
            <p className="dtg-hint">
              {full ? 'แถวเต็ม 60 ช่องแล้ว — ลบตัวท้ายหรือเคลียร์รอบ · ' : ''}
              "ใช้แถวปัจจุบัน" = คัดลอกแถวที่กำลังบันทึก (เขียว เหลือง ดำ → J){keyboard ? ' · แป้นพิมพ์: R B J (G = J) · − = ข้าม · Backspace = ลบ' : ''}
            </p>
          </section>
        </div>

        <div className="dtg-col">
          <section className={calc.stale ? 'dtg-panel dtg-panel--stale' : 'dtg-panel'}>
            <div className="dtg-panel__head">
              <h2 className="dtg-panel__title">อัตราการออก (คำนวณ)</h2>
              <span className="dtg-panel__sub">ช่องถัดไป: คอลัมน์ {Math.min(position, MAX_CELLS)}</span>
            </div>
            {full ? <p className="dtg-panel__empty">แถวเต็มแล้ว ไม่มีช่องถัดไป</p> : null}
            {!full && filtering && match ? (
              <div className="dtg-matchstats">
                <p className="dtg-mode dtg-mode--match">
                  แถวที่ตรงกัน (ช่อง {match.window_from}–{match.window_to}) · {(match.total_matches || 0).toLocaleString()} แถว
                </p>
                {match.sample_size ? (
                  <Rates keys={CALC_COLORS} counts={match.counts} percentages={match.percentages} size="lg" />
                ) : (
                  <p className="dtg-panel__empty">ไม่มีแถวที่ตรงกัน — ลองลดจำนวนช่องที่จับคู่</p>
                )}
              </div>
            ) : null}
            {!full && data ? (
              <>
                <p className="dtg-mode dtg-mode--column">
                  ทุกแถว · คอลัมน์ {position} · {data.all_sample_size.toLocaleString()} รอบ
                </p>
                <Rates keys={CALC_COLORS} counts={data.all_counts} percentages={data.all_percentages} size={filtering ? 'sm' : 'lg'} />
              </>
            ) : null}
            <p className="dtg-panel__foot">
              {data && data.range.from_round !== null && data.range.to_round !== null
                ? `ช่วงรอบ ${data.range.from_round.toLocaleString()} – ${data.range.to_round.toLocaleString()} · `
                : ''}
              J = Joker (เขียว เหลือง ดำ) · สถิติความถี่ที่ผ่านมา ไม่ใช่การทำนาย
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
