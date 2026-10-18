import { apiDelete, apiGet, apiPost } from './client';

/** Mirrors backend/app/schemas/dt.py */
export type Color = 'R' | 'B' | 'Y' | 'K' | 'G';
export type PlayValue = Color | '-';
export type RoundStatus = 'open' | 'complete' | 'ended_early';

export interface Cursor {
  round_no: number;
  position: number;
}

export interface GridStats {
  mode: 'column' | 'row' | 'none';
  round_no: number;
  position: number;
  range: { from_round: number | null; to_round: number | null };
  sample_size: number;
  counts: Record<Color, number>;
  percentages: Record<Color, number>;
}

export interface GridRound {
  round_no: number;
  results: string;
  status: RoundStatus;
}

export interface TableState {
  table: { code: string; name: string; plays_per_round: number };
  version: number;
  total_rounds: number;
  cursor: Cursor;
  last_round_status: RoundStatus | null;
  stats: GridStats;
}

export interface GridPage {
  version: number;
  rounds: GridRound[];
  has_more: boolean;
}

export interface WriteResult extends TableState {
  round: GridRound | null;
  removed_round_no: number | null;
}

/** Either a fixed round range or the newest `last_rounds` rounds (resolved on the server). */
export interface StatsScope {
  from_round?: number;
  to_round?: number;
  last_rounds?: number;
}

const DEVICE_KEY = 'kardex-device-id';

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

const headers = () => ({ 'X-Device-Id': deviceId() });
const base = (code: string) => `/tables/${encodeURIComponent(code)}`;

export const dtGridApi = {
  state: (code: string, scope: StatsScope) => apiGet<TableState>(base(code), { ...scope }),
  grid: (code: string, beforeRound?: number, limit = 50) =>
    apiGet<GridPage>(`${base(code)}/grid`, { before_round: beforeRound, limit }),
  add: (code: string, value: PlayValue, version: number, scope: StatsScope) =>
    apiPost<WriteResult>(`${base(code)}/plays`, { value, version }, { ...scope }, headers()),
  deleteLast: (code: string, version: number, scope: StatsScope) =>
    apiDelete<WriteResult>(`${base(code)}/plays/last`, { ...scope, version }, headers()),
  endRound: (code: string, version: number, scope: StatsScope) =>
    apiPost<WriteResult>(`${base(code)}/rounds/current/end`, { version }, { ...scope }, headers()),
  discardRound: (code: string, version: number, scope: StatsScope) =>
    apiDelete<WriteResult>(`${base(code)}/rounds/current`, { ...scope, version }, headers()),
};
