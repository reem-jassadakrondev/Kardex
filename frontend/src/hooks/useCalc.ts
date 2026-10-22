import { useCallback, useEffect, useRef, useState } from 'react';
import { dtGridApi, type CalcResult, type StatsScope } from '../api/dtGrid';

const DEBOUNCE_MS = 150;

/**
 * Calc mode data: matches for the typed row. Re-fetched when the row, window or range changes, and when
 * the table changes (`version` comes from the table page's own polling, so no extra polling here).
 */
export function useCalc(code: string, pattern: string, size: number, scope: StatsScope, version: number | null) {
  const [data, setData] = useState<CalcResult | null>(null);
  const [dataKey, setDataKey] = useState('');
  const scopeRef = useRef(scope);
  const scopeKey = JSON.stringify(scope);
  const requestKey = `${pattern}|${size}|${scopeKey}`;

  useEffect(() => {
    scopeRef.current = scope;
  });

  useEffect(() => {
    if (version === null) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      dtGridApi
        .calc(code, pattern, size, scopeRef.current)
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setDataKey(requestKey);
        })
        .catch(() => undefined); // the table page reports offline / missing table
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, pattern, size, scopeKey, version, requestKey]);

  const loadMore = useCallback(async () => {
    if (!data || !data.rounds.length) return;
    const page = await dtGridApi.calc(code, pattern, size, scopeRef.current, data.rounds[0].round_no);
    if (page.version !== data.version) return;
    setData({ ...data, rounds: [...page.rounds, ...data.rounds], has_more: page.has_more });
  }, [code, pattern, size, data]);

  const stale = !data || dataKey !== requestKey || data.version !== version;
  return { data, stale, loadMore };
}
