import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlayValue } from '../api/dtGrid';
import { ColorGrid } from '../components/dtGrid/ColorGrid';
import { isColor } from '../components/dtGrid/colors';
import { InputPad } from '../components/dtGrid/InputPad';
import { RangePicker } from '../components/dtGrid/RangePicker';
import { scopeOf, type RangePreset } from '../components/dtGrid/range';
import { StatsPanel } from '../components/dtGrid/StatsPanel';
import { useDtGrid } from '../hooks/useDtGrid';
import './dragonTiger.css';

const TABLE_CODE = 'dt-1';
const RANGE_KEY = 'kardex-dt-range';

type Confirm = { action: 'undo' | 'end' | 'discard'; text: string } | null;

function loadRange(): RangePreset {
  try {
    const raw = localStorage.getItem(RANGE_KEY);
    return raw ? (JSON.parse(raw) as RangePreset) : { kind: 'all' };
  } catch {
    return { kind: 'all' };
  }
}

export function DragonTigerRoom() {
  const navigate = useNavigate();
  const [range, setRange] = useState<RangePreset>(loadRange);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const grid = useDtGrid(TABLE_CODE, scopeOf(range));
  const { state, queue } = grid;

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify(range));
    } catch {
      /* storage blocked — the range just won't be remembered */
    }
  }, [range]);

  const saving = queue.length;
  // Colors keep queueing; only another action in the queue (undo/end/discard) moves the cursor unpredictably.
  const actionQueued = queue.some((op) => op.kind !== 'add');
  const colorsEnabled = !!state && !actionQueued;
  const canUndo = !!state && !actionQueued && (saving > 0 || state.total_rounds > 0);
  const canEndOrDiscard = !!state && saving === 0 && state.last_round_status === 'open';

  const record = (value: PlayValue) => {
    if (!colorsEnabled) return;
    setConfirm(null);
    grid.add(value);
  };

  const requestUndo = () => {
    if (!state || !canUndo) return;
    // Nothing queued and cursor at column 1 → the last round is finished: undo reopens it.
    if (saving === 0 && state.cursor.position === 1) {
      setConfirm({
        action: 'undo',
        text: `ลบช่องสุดท้ายของรอบ ${state.total_rounds.toLocaleString()} ซึ่งจบไปแล้ว และเปิดรอบนั้นให้บันทึกต่อ?`,
      });
      return;
    }
    grid.deleteLast();
  };

  const runConfirmed = () => {
    if (!confirm) return;
    setConfirm(null);
    if (confirm.action === 'undo') grid.deleteLast();
    if (confirm.action === 'end') grid.endRound();
    if (confirm.action === 'discard') grid.discardRound();
  };

  // Keyboard shortcuts for desktop / iPad with keyboard.
  const handlers = useRef({ record, requestUndo });
  useEffect(() => {
    handlers.current = { record, requestUndo };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toUpperCase();
      if (isColor(key)) handlers.current.record(key);
      else if (key === '-' || key === 'S') handlers.current.record('-');
      else if (event.key === 'Backspace') {
        event.preventDefault();
        handlers.current.requestUndo();
      } else if (event.key === 'Escape') setConfirm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="dtg-page">
      <header className="dtg-header">
        <button type="button" className="dtg-btn" onClick={() => navigate('/')}>
          <ArrowLeft className="dtg-icon" />
          Lobby
        </button>
        <div className="dtg-header__title">
          <h1>เสือมังกร · {state ? state.table.name : '…'}</h1>
          <span>{state ? `${state.total_rounds.toLocaleString()} รอบ` : 'กำลังโหลด…'}</span>
        </div>
        <span className={grid.online ? 'dtg-status dtg-status--on' : 'dtg-status dtg-status--off'}>
          {grid.online ? (saving ? `กำลังบันทึก… (${saving})` : 'ออนไลน์') : 'ออฟไลน์'}
        </span>
      </header>

      {!grid.online ? <div className="dtg-notice dtg-notice--error">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — จะลองใหม่อัตโนมัติ</div> : null}
      {grid.notice ? (
        <div className={`dtg-notice dtg-notice--${grid.notice.tone}`}>
          {grid.notice.text}
          <button type="button" className="dtg-notice__close" onClick={() => grid.setNotice(null)} aria-label="ปิด">
            ×
          </button>
        </div>
      ) : null}

      {state ? (
        <>
          <RangePicker value={range} totalRounds={state.total_rounds} onChange={setRange} />

          <ColorGrid
            rounds={grid.rounds}
            cursor={state.cursor}
            playsPerRound={state.table.plays_per_round}
            pending={grid.pendingValues}
            hasMore={grid.hasMore}
            onLoadMore={() => void grid.loadMore()}
          />

          {confirm ? (
            <div className="dtg-confirm">
              <span>{confirm.text}</span>
              <span className="dtg-confirm__buttons">
                <button type="button" className="dtg-btn" onClick={() => setConfirm(null)}>
                  ยกเลิก
                </button>
                <button type="button" className="dtg-btn dtg-btn--danger" onClick={runConfirmed}>
                  ยืนยัน
                </button>
              </span>
            </div>
          ) : null}

          <div className="dtg-cols">
            <div className="dtg-col">
              <InputPad
                colorsEnabled={colorsEnabled}
                canUndo={canUndo}
                canEndOrDiscard={canEndOrDiscard}
                onColor={record}
                onSkip={() => record('-')}
                onUndo={requestUndo}
                onEndRound={() =>
                  setConfirm({
                    action: 'end',
                    text: `จบรอบ ${state.cursor.round_no.toLocaleString()} ที่ ${state.cursor.position - 1} ช่อง? ช่องที่บันทึกแล้วยังนับในสถิติ`,
                  })
                }
                onDiscardRound={() =>
                  setConfirm({
                    action: 'discard',
                    text: `ทิ้งรอบ ${state.cursor.round_no.toLocaleString()} ทั้งรอบ (${state.cursor.position - 1} ช่อง)? ข้อมูลรอบนี้จะถูกลบและไม่นับในสถิติ`,
                  })
                }
              />
            </div>
            <div className="dtg-col">
              <StatsPanel stats={state.stats} saving={saving} />
            </div>
          </div>
        </>
      ) : (
        <div className="dtg-notice dtg-notice--info">กำลังโหลดตาราง…</div>
      )}
    </div>
  );
}
