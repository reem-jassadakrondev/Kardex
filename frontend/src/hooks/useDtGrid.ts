import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  dtGridApi,
  type GridRound,
  type PlayValue,
  type StatsScope,
  type TableState,
  type WriteResult,
} from '../api/dtGrid';

const POLL_MS = 4000;
/** Rounds kept in memory; older ones are re-fetched with "load more". */
const MAX_ROUNDS = 200;

export type Notice = { tone: 'info' | 'error'; text: string } | null;

/** A write waiting to be sent. Taps are queued so the operator never waits for the network. */
export type Op = { kind: 'add'; value: PlayValue } | { kind: 'undo' } | { kind: 'end' } | { kind: 'discard' };

/** Unsent taps beyond this are ignored (protects against a stuck connection). */
const MAX_QUEUE = 30;

function mergeRound(rounds: GridRound[], result: WriteResult): GridRound[] {
  let next = rounds;
  if (result.removed_round_no !== null) {
    next = next.filter((r) => r.round_no !== result.removed_round_no);
  }
  const changed = result.round;
  if (changed) {
    const index = next.findIndex((r) => r.round_no === changed.round_no);
    next = index >= 0 ? next.map((r, i) => (i === index ? changed : r)) : [...next, changed];
  }
  return next.length > MAX_ROUNDS ? next.slice(next.length - MAX_ROUNDS) : next;
}

function stripWrite(result: WriteResult): TableState {
  return {
    table: result.table,
    version: result.version,
    total_rounds: result.total_rounds,
    cursor: result.cursor,
    last_round_status: result.last_round_status,
    stats: result.stats,
  };
}

/**
 * Server-backed state for one color-grid table: initial load, polling for other devices' changes,
 * and a write queue sent one op at a time, each guarded by the table version.
 */
export function useDtGrid(code: string, scope: StatsScope) {
  const [state, setState] = useState<TableState | null>(null);
  const [rounds, setRounds] = useState<GridRound[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [queue, setQueue] = useState<Op[]>([]); // queue[0] is in flight while sending
  const [notice, setNotice] = useState<Notice>(null);
  const [online, setOnline] = useState(true);
  /** The table doesn't exist or was moved to the trash (404). */
  const [missing, setMissing] = useState(false);

  const versionRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const queueRef = useRef<Op[]>([]);
  const scopeRef = useRef(scope);
  const scopeKey = JSON.stringify(scope);

  /** Network/server failure handler shared by loads and polling: a 404 means the table is gone. */
  const onLoadError = useCallback((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) setMissing(true);
    else setOnline(false);
  }, []);

  // Declared first so later effects in the same commit see the new scope.
  useEffect(() => {
    scopeRef.current = scope;
  });

  /** Load state + newest rounds, retrying if another device wrote in between the two requests. */
  const fetchAll = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [nextState, page] = await Promise.all([dtGridApi.state(code, scopeRef.current), dtGridApi.grid(code)]);
      if (page.version === nextState.version || attempt === 2) {
        versionRef.current = nextState.version;
        setState(nextState);
        setRounds(page.rounds);
        setHasMore(page.has_more);
        setOnline(true);
        return;
      }
    }
  }, [code]);

  // Initial load, and reload of the stats whenever the range changes.
  useEffect(() => {
    let cancelled = false;
    const load = versionRef.current === null ? fetchAll() : dtGridApi.state(code, scopeRef.current).then((s) => {
      if (!cancelled) setState(s);
    });
    load.catch((error: unknown) => {
      if (!cancelled) onLoadError(error);
    });
    return () => {
      cancelled = true;
    };
  }, [code, scopeKey, fetchAll, onLoadError]);

  // Poll for changes made on other devices.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (busyRef.current || document.hidden) return;
      dtGridApi
        .state(code, scopeRef.current)
        .then((next) => {
          if (busyRef.current) return undefined;
          setOnline(true);
          if (next.version !== versionRef.current) return fetchAll();
          setState(next);
          return undefined;
        })
        .catch(onLoadError);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [code, fetchAll, onLoadError]);

  const send = useCallback(
    (op: Op, version: number): Promise<WriteResult> => {
      const scopeNow = scopeRef.current;
      if (op.kind === 'add') return dtGridApi.add(code, op.value, version, scopeNow);
      if (op.kind === 'undo') return dtGridApi.deleteLast(code, version, scopeNow);
      if (op.kind === 'end') return dtGridApi.endRound(code, version, scopeNow);
      return dtGridApi.discardRound(code, version, scopeNow);
    },
    [code],
  );

  /** Send queued ops in order. On any failure the rest of the queue is dropped and reported. */
  const pump = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    while (queueRef.current.length && versionRef.current !== null) {
      try {
        const result = await send(queueRef.current[0], versionRef.current);
        versionRef.current = result.version;
        setState(stripWrite(result));
        setRounds((current) => mergeRound(current, result));
        setOnline(true);
        queueRef.current = queueRef.current.slice(1);
        setQueue(queueRef.current);
      } catch (error) {
        const dropped = queueRef.current.length;
        queueRef.current = [];
        setQueue([]);
        const lost = dropped > 1 ? ` · ยกเลิก ${dropped} รายการที่ยังไม่ได้บันทึก กรุณาตรวจสอบตารางแล้วบันทึกใหม่` : '';
        if (error instanceof ApiError && error.status === 409 && error.body && 'current_version' in error.body) {
          await fetchAll().catch(() => undefined);
          setNotice({ tone: 'error', text: `มีการแก้ไขจากอุปกรณ์อื่น — โหลดข้อมูลล่าสุดแล้ว${lost || ' กรุณาตรวจสอบแล้วบันทึกอีกครั้ง'}` });
        } else if (error instanceof ApiError && error.status === 404) {
          setMissing(true);
        } else if (error instanceof ApiError) {
          const detail = error.body && typeof error.body.detail === 'string' ? error.body.detail : error.message;
          setNotice({ tone: 'error', text: `ทำรายการไม่สำเร็จ: ${detail}${lost}` });
        } else {
          setOnline(false);
          setNotice({ tone: 'error', text: `บันทึกไม่สำเร็จ — ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง${lost}` });
        }
      }
    }
    busyRef.current = false;
  }, [send, fetchAll]);

  const enqueue = useCallback(
    (op: Op) => {
      if (versionRef.current === null || queueRef.current.length >= MAX_QUEUE) return;
      queueRef.current = [...queueRef.current, op];
      setQueue(queueRef.current);
      setNotice(null);
      void pump();
    },
    [pump],
  );

  const add = useCallback((value: PlayValue) => enqueue({ kind: 'add', value }), [enqueue]);

  /** Undo the newest tap: drop it from the queue if it hasn't been sent yet, otherwise delete on the server. */
  const deleteLast = useCallback(() => {
    const pendingOps = queueRef.current;
    const last = pendingOps[pendingOps.length - 1];
    if (pendingOps.length > 1 && last.kind === 'add') {
      queueRef.current = pendingOps.slice(0, -1);
      setQueue(queueRef.current);
      return;
    }
    enqueue({ kind: 'undo' });
  }, [enqueue]);

  const endRound = useCallback(() => enqueue({ kind: 'end' }), [enqueue]);
  const discardRound = useCallback(() => enqueue({ kind: 'discard' }), [enqueue]);

  const loadMore = useCallback(async () => {
    if (!rounds.length) return;
    try {
      const page = await dtGridApi.grid(code, rounds[0].round_no);
      setRounds((current) => [...page.rounds, ...current]);
      setHasMore(page.has_more);
    } catch {
      setNotice({ tone: 'error', text: 'โหลดรอบก่อนหน้าไม่สำเร็จ' });
    }
  }, [code, rounds]);

  // Values of queued taps, drawn faded after the server cursor. Empty while another action is in flight.
  const pendingValues: PlayValue[] = [];
  for (const op of queue) {
    if (op.kind !== 'add') break;
    pendingValues.push(op.value);
  }

  return {
    state,
    rounds,
    hasMore,
    queue,
    pendingValues,
    notice,
    online,
    missing,
    add,
    deleteLast,
    endRound,
    discardRound,
    loadMore,
    setNotice,
    /** Reload state + rounds from the server (e.g. after renaming the table). */
    reload: fetchAll,
  };
}
