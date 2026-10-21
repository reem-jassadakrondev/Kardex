/**
 * Same-origin by default: the backend serves this app (on-premise) and `npm run dev` proxies /api.
 * Set VITE_API_BASE_URL only when the API lives elsewhere (e.g. frontend on Netlify).
 */
const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** Non-2xx response. `body` is the parsed JSON error (FastAPI: `{ detail, ... }`) when available. */
export class ApiError extends Error {
  status: number;
  body: Record<string, unknown> | null;

  constructor(status: number, message: string, body: Record<string, unknown> | null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Query = Record<string, string | number | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const parts = Object.keys(query)
    .filter((key) => query[key] !== null && query[key] !== undefined)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`);
  return parts.length ? `${path}?${parts.join('&')}` : path;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    const text = await response.text();
    let body: Record<string, unknown> | null;
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    throw new ApiError(response.status, text || `Request failed: ${response.status}`, body);
  }

  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Server response was not valid JSON.');
  }
}

export async function apiGet<T>(path: string, query?: Query, headers?: Record<string, string>): Promise<T> {
  return requestJson<T>(withQuery(path, query), headers ? { headers } : undefined);
}

export async function apiPost<T>(path: string, payload: unknown, query?: Query, headers?: Record<string, string>): Promise<T> {
  return requestJson<T>(withQuery(path, query), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

export async function apiDelete<T>(path: string, query?: Query, headers?: Record<string, string>): Promise<T> {
  return requestJson<T>(withQuery(path, query), { method: 'DELETE', headers });
}

export async function apiPatch<T>(path: string, payload: unknown, headers?: Record<string, string>): Promise<T> {
  return requestJson<T>(path, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

/** The server's `detail` message for an ApiError, or a fallback. */
export function errorDetail(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body.detail === 'string') return error.body.detail;
  return fallback;
}
