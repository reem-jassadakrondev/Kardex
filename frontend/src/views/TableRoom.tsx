import { ArrowLeft, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorDetail } from '../api/client';
import type { PlayValue } from '../api/dtGrid';
import { rememberTable, tablesApi } from '../api/tables';
import { CalcPanel } from '../components/calc/CalcPanel';
import { ColorGrid } from '../components/dtGrid/ColorGrid';
import { MatchPicker } from '../components/dtGrid/MatchPicker';
import { isColor } from '../components/dtGrid/colors';
import { InputPad } from '../components/dtGrid/InputPad';
import { RangePicker } from '../components/dtGrid/RangePicker';
import { scopeOf, WINDOW_OPTIONS, type RangePreset } from '../components/dtGrid/range';
import { StatsPanel } from '../components/dtGrid/StatsPanel';
import { useDtGrid } from '../hooks/useDtGrid';
import { useMatches } from '../hooks/useMatches';
import './dragonTiger.css';

const RANGE_KEY = 'kardex-dt-range';
const WINDOW_KEY = 'kardex-match-window';
const DEFAULT_WINDOW = 5;
const MODE_KEY = 'kardex-view-mode';
const SPLIT_KEY = 'kardex-view-split';

/** record = the recording grid (5 colors); calc = หน้าคำนวณ (3 colors, nothing saved). */
export type ViewMode = 'record' | 'calc';

function loadFlag(key: string, value: string): boolean {
  try {
    return localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

type Confirm = { action: 'undo' | 'end' | 'discard' | 'trash'; text: string } | null;

function loadWindow(): number {
  try {
    const saved = Number(localStorage.getItem(WINDOW_KEY));
    return WINDOW_OPTIONS.indexOf(saved) >= 0 && localStorage.getItem(WINDOW_KEY) !== null ? saved : DEFAULT_WINDOW;
  } catch {
    return DEFAULT_WINDOW;
  }
}

function loadRange(): RangePreset {
  try {
    const raw = localStorage.getItem(RANGE_KEY);
    return raw ? (JSON.parse(raw) as RangePreset) : { kind: 'all' };
  } catch {
    return { kind: 'all' };
  }
}

export function TableRoom({ code, initialMode }: { code: string; initialMode?: ViewMode }) {
  const navigate = useNavigate();
  // Both modes stay mounted while switching, so nothing typed or loaded is lost.
  const [mode, setMode] = useState<ViewMode>(() => initialMode || (loadFlag(MODE_KEY, 'calc') ? 'calc' : 'record'));
  const [split, setSplit] = useState<boolean>(() => loadFlag(SPLIT_KEY, '1'));
  const [range, setRange] = useState<RangePreset>(loadRange);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [windowSize, setWindowSize] = useState<number>(loadWindow);
  const scope = scopeOf(range);
  const grid = useDtGrid(code, scope);
  const { state, queue } = grid;
  const matches = useMatches(code, state, windowSize, scope, queue.length > 0);

  useEffect(() => {
    rememberTable(code);
  }, [code]);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify(range));
      localStorage.setItem(WINDOW_KEY, String(windowSize));
      localStorage.setItem(MODE_KEY, mode);
      localStorage.setItem(SPLIT_KEY, split ? '1' : '0');
    } catch {
      /* storage blocked — the range just won't be remembered */
    }
  }, [range, windowSize, mode, split]);

  const showRecord = split || mode === 'record';
  const showCalc = split || mode === 'calc';

  const saving = queue.length;

  // The round being recorded is pinned under the grid; above it are earlier rounds — all of them, or
  // only those matching its latest cells once it has at least one cell (จับคู่แถว).
  const cursorRound = state ? state.cursor.round_no : 0;
  const current = grid.rounds.filter((r) => r.round_no === cursorRound)[0] || { round_no: cursorRound, results: '', status: 'open' as const };
  const filtering = !!state && state.cursor.position > 1;
  const match = matches.data && matches.data.window_from !== null ? matches.data : null;
  const history = filtering ? (match ? match.rounds : []) : grid.rounds.filter((r) => r.round_no !== cursorRound);
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

  const openSettings = () => {
    if (!state) return;
    setNameDraft(state.table.name);
    setSettingsError('');
    setSettingsOpen(!settingsOpen);
  };

  const saveName = () => {
    if (!state || settingsBusy) return;
    setSettingsBusy(true);
    tablesApi
      .rename(code, nameDraft)
      .then(() => {
        setSettingsOpen(false);
        return grid.reload();
      })
      .catch((error: unknown) => setSettingsError(errorDetail(error, 'เปลี่ยนชื่อไม่สำเร็จ')))
      .then(() => setSettingsBusy(false));
  };

  const trashTable = () => {
    tablesApi
      .trash(code)
      .then(() => navigate('/'))
      .catch((error: unknown) => setSettingsError(errorDetail(error, 'ลบโต๊ะไม่สำเร็จ')));
  };

  const runConfirmed = () => {
    if (!confirm) return;
    setConfirm(null);
    if (confirm.action === 'trash') {
      trashTable();
      return;
    }
    if (confirm.action === 'undo') grid.deleteLast();
    if (confirm.action === 'end') grid.endRound();
    if (confirm.action === 'discard') grid.discardRound();
  };

  // Keyboard shortcuts for desktop / iPad with keyboard.
  const handlers = useRef({ record, requestUndo, active: showRecord });
  useEffect(() => {
    handlers.current = { record, requestUndo, active: showRecord };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!handlers.current.active) return; // calc mode on its own handles the keys
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = (event.key || '').toUpperCase(); // event.key is undefined on iOS < 10.1
      if (isColor(key)) handlers.current.record(key);
      else if (key === '-' || key === 'S') handlers.current.record('-');
      else if (event.key === 'Backspace' || event.keyCode === 8) {
        event.preventDefault();
        handlers.current.requestUndo();
      } else if (event.key === 'Escape') setConfirm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={split ? 'dtg-page dtg-page--split' : 'dtg-page'}>
      <header className="dtg-header">
        <button type="button" className="dtg-btn" onClick={() => navigate('/')}>
          <ArrowLeft className="dtg-icon" />
          หน้าหลัก
        </button>
        <div className="dtg-header__title">
          <h1>ตารางสถิติ · {state ? state.table.name : '…'}</h1>
          <span>{state ? `${state.total_rounds.toLocaleString()} รอบ` : 'กำลังโหลด…'}</span>
        </div>
        <span className="dtg-header__right">
          <span className={grid.online ? 'dtg-status dtg-status--on' : 'dtg-status dtg-status--off'}>
            {grid.online ? (saving ? `กำลังบันทึก… (${saving})` : 'ออนไลน์') : 'ออฟไลน์'}
          </span>
          <button type="button" className="dtg-iconbtn" onClick={openSettings} disabled={!state} aria-label="จัดการโต๊ะ">
            <Settings className="dtg-icon dtg-icon--solo" />
          </button>
        </span>
      </header>

      {settingsOpen && state ? (
        <div className="dtg-settings">
          <label className="dtg-settings__label" htmlFor="table-name">
            ชื่อโต๊ะ
          </label>
          <input
            id="table-name"
            className="dtg-input dtg-input--wide"
            value={nameDraft}
            maxLength={50}
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveName();
            }}
          />
          <button type="button" className="dtg-btn dtg-btn--dark" onClick={saveName} disabled={settingsBusy || !nameDraft.trim()}>
            บันทึกชื่อ
          </button>
          <button type="button" className="dtg-btn" onClick={() => setSettingsOpen(false)}>
            ปิด
          </button>
          <button
            type="button"
            className="dtg-btn dtg-btn--danger dtg-settings__delete"
            onClick={() =>
              setConfirm({
                action: 'trash',
                text: `ย้าย "${state.table.name}" ไปที่โต๊ะที่ลบแล้ว? ข้อมูล ${state.total_rounds.toLocaleString()} รอบยังอยู่ กู้คืนได้จากหน้าหลัก`,
              })
            }
          >
            ลบโต๊ะ
          </button>
          {settingsError ? <span className="dtg-range__error">{settingsError}</span> : null}
          {confirm && confirm.action === 'trash' ? (
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
        </div>
      ) : null}

      {!grid.online ? <div className="dtg-notice dtg-notice--error">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — จะลองใหม่อัตโนมัติ</div> : null}
      {grid.notice ? (
        <div className={`dtg-notice dtg-notice--${grid.notice.tone}`}>
          {grid.notice.text}
          <button type="button" className="dtg-notice__close" onClick={() => grid.setNotice(null)} aria-label="ปิด">
            ×
          </button>
        </div>
      ) : null}

      {grid.missing ? (
        <div className="dtg-notice dtg-notice--error">ไม่พบโต๊ะนี้ — อาจถูกลบไปแล้ว กลับไปเลือกโต๊ะที่หน้าหลัก</div>
      ) : state ? (
        <>
          <div className="dtg-viewbar">
            {split ? null : (
              <span className="dtg-segment">
                <button type="button" className={mode === 'record' ? 'dtg-segment__btn dtg-segment__btn--on' : 'dtg-segment__btn'} onClick={() => setMode('record')}>
                  บันทึก
                </button>
                <button type="button" className={mode === 'calc' ? 'dtg-segment__btn dtg-segment__btn--on' : 'dtg-segment__btn'} onClick={() => setMode('calc')}>
                  คำนวณ
                </button>
              </span>
            )}
            <button type="button" className={split ? 'dtg-chip dtg-chip--active' : 'dtg-chip'} onClick={() => setSplit(!split)}>
              {split ? '✓ ' : ''}แสดงคู่กัน
            </button>
            {split ? <span className="dtg-viewbar__hint">บันทึก (5 สี) ด้านบน · คำนวณ (3 สี) ด้านล่าง · แป้นพิมพ์ใช้กับการบันทึก</span> : null}
          </div>

          <RangePicker value={range} totalRounds={state.total_rounds} onChange={setRange} />
          {showRecord ? (
            <MatchPicker size={windowSize} match={filtering ? matches.data : null} stale={matches.stale} onChange={setWindowSize} />
          ) : null}

          <div className={showRecord ? 'dtg-record' : 'dtg-record dtg-hidden'}>

          <ColorGrid
            rounds={history}
            current={current}
            cursor={state.cursor}
            playsPerRound={state.table.plays_per_round}
            pending={grid.pendingValues}
            window={filtering && match && match.window_from !== null && match.window_to !== null ? { from: match.window_from, to: match.window_to } : null}
            emptyText={
              !filtering ? 'ยังไม่มีรอบก่อนหน้า' : !match || matches.stale ? 'กำลังค้นหาแถวที่ตรงกัน…' : 'ไม่มีแถวที่ตรงกัน — ลองลดจำนวนช่องที่จับคู่'
            }
            stale={filtering && matches.stale}
            hasMore={filtering ? !!match && match.has_more : grid.hasMore}
            onLoadMore={() => void (filtering ? matches.loadMore() : grid.loadMore())}
          />

          {confirm && confirm.action !== 'trash' ? (
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
              <StatsPanel stats={state.stats} saving={saving} match={filtering ? match : null} matchStale={matches.stale} />
            </div>
          </div>
          </div>

          <div className={showCalc ? 'dtg-calcwrap' : 'dtg-calcwrap dtg-hidden'}>
            <CalcPanel
              code={code}
              version={state.version}
              scope={scope}
              windowSize={windowSize}
              onWindowChange={setWindowSize}
              currentRow={current.results.slice(0, state.cursor.position - 1) + grid.pendingValues.join('')}
              split={split}
              keyboard={!split && mode === 'calc'}
            />
          </div>
        </>
      ) : (
        <div className="dtg-notice dtg-notice--info">กำลังโหลดตาราง…</div>
      )}
    </div>
  );
}
