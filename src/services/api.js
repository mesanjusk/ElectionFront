// client/src/services/api.js
import { clearToken, lockSession } from '../auth';
import { markActivationRevoked } from './activation';

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
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const data = await res.json();
      message = data?.error || data?.message || message;
    } catch (err) {
      // swallow JSON parse errors and keep fallback message
    }
    if (res.status === 401 || res.status === 403) {
      authToken = null;
      clearToken();
      lockSession();
      markActivationRevoked('Your session expired. Reactivate with your credentials.');
    }
    if (res.status === 409) {
      authToken = null;
      clearToken();
      lockSession();
      markActivationRevoked('You signed in on another device. Reactivate here to resume.');
    }
    throw new Error(message);
  }
  return res.json();
}

export async function apiLogin({ email, password, deviceId, userType }) {
  return http('POST', '/api/auth/login', { email, password, deviceId, userType });
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
