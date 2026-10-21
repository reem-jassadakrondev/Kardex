import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface TableSummary {
  code: string;
  name: string;
  plays_per_round: number;
  total_rounds: number;
  created_at: string;
  deleted_at: string | null;
}

const LAST_TABLE_KEY = 'kardex-last-table';

export const tablesApi = {
  list: (deleted = false) => apiGet<TableSummary[]>('/tables', deleted ? { deleted: 'true' } : undefined),
  create: (name: string) => apiPost<TableSummary>('/tables', { name }),
  rename: (code: string, name: string) => apiPatch<TableSummary>(`/tables/${encodeURIComponent(code)}`, { name }),
  /** Moves the table to the trash (restorable). */
  trash: (code: string) => apiDelete<TableSummary>(`/tables/${encodeURIComponent(code)}`),
  restore: (code: string) => apiPost<TableSummary>(`/tables/${encodeURIComponent(code)}/restore`, {}),
  /** Deletes a trashed table and all its data for good; `confirmName` must equal the table name. */
  purge: (code: string, confirmName: string) =>
    apiDelete<void>(`/tables/${encodeURIComponent(code)}/permanent`, { confirm_name: confirmName }),
};

/** The table this device opened last (highlighted on the home page). */
export function lastTable(): string | null {
  try {
    return localStorage.getItem(LAST_TABLE_KEY);
  } catch {
    return null;
  }
}

export function rememberTable(code: string): void {
  try {
    localStorage.setItem(LAST_TABLE_KEY, code);
  } catch {
    /* storage blocked */
  }
}
