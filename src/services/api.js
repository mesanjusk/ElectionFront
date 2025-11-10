// client/src/services/api.js
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let authToken = null;

const stored = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
if (stored) authToken = stored;

export function setAuthToken(token) {
  authToken = token;
}

async function http(method, path, body, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function apiLogin({ email, password }) {
  return http('POST', '/api/auth/login', { email, password });
}

export async function apiExport({
  page = 1,
  limit = 5000,
  since = null,
  databaseId = null,
  signal,
} = {}) {
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  if (since) qs.set('since', since);
  if (databaseId) qs.set('databaseId', databaseId);
  return http('GET', `/api/voters/export?${qs}`, null, { signal });
}

export async function apiBulkUpsert(changes) {
  return http('POST', '/api/voters/bulk-upsert', { changes });
}
