const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (window.location.hostname === 'localhost' ? 'http://localhost:8000/api/v1' : '');

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('Backend is not configured. Set VITE_API_BASE_URL in the deployment environment.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
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

export async function apiGet<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

export async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
