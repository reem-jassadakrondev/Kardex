import { useCallback, useEffect, useRef, useState } from 'react';
import { dtGridApi, type MatchesResult, type StatsScope, type TableState } from '../api/dtGrid';

/** Wait after the last change before asking the server (taps arrive in bursts). */
const DEBOUNCE_MS = 150;

/**
 * Matching rounds for the current round's last `size` cells. Re-fetched whenever the table version,
 * window size or range changes, but only while no taps are waiting to be saved (`paused`), so the
 * extra query never slows recording down.
 */
export function useMatches(code: string, state: TableState | null, size: number, scope: StatsScope, paused: boolean) {
  const [data, setData] = useState<MatchesResult | null>(null);
  const [dataKey, setDataKey] = useState(''); // window size + range the data was fetched for
  const [loading, setLoading] = useState(false);
  const scopeRef = useRef(scope);
  const scopeKey = JSON.stringify(scope);
  const version = state ? state.version : null;
  const requestKey = `${size}|${scopeKey}`;

  useEffect(() => {
    scopeRef.current = scope;
  });

  useEffect(() => {
    if (version === null || paused) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      dtGridApi
        .matches(code, size, scopeRef.current)
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setDataKey(requestKey);
        })
        .catch(() => undefined) // offline: keep the last result, polling reports the connection
        .then(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, version, size, scopeKey, requestKey, paused]);

  const loadMore = useCallback(async () => {
    if (!data || !data.rounds.length) return;
    const page = await dtGridApi.matches(code, size, scopeRef.current, data.rounds[0].round_no);
    if (page.version !== data.version) return; // table changed meanwhile; the next refresh replaces it
    setData({ ...data, rounds: [...page.rounds, ...data.rounds], has_more: page.has_more });
  }, [code, size, data]);

  const stale =
    loading || !data || !state || dataKey !== requestKey || data.version !== state.version || data.position !== state.cursor.position || data.round_no !== state.cursor.round_no;

  return { data, stale, loadMore };
}
