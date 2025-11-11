// client/src/services/api.js
import { clearToken, lockSession } from '../auth';
import { markActivationRevoked, getDeviceId } from './activation';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let authToken = null;

// pick up token if app stored it earlier
const stored = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
if (stored) authToken = stored;

export function setAuthToken(token) {
  authToken = token;
}

async function http(method, path, body, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  // Always include device header
  try {
    const deviceId = getDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
  } catch (_) { /* ignore */ }

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
    } catch (_) {}

    if (res.status === 401 || res.status === 403) {
      authToken = null;
      clearToken();
      lockSession();
      markActivationRevoked('Your session expired. Reactivate with your credentials.');
    } else if (res.status === 409) {
      authToken = null;
      clearToken();
      lockSession();
      markActivationRevoked('You signed in on another device. Reactivate here to resume.');
    } else if (res.status === 423) {
      // device-bound on another device
      authToken = null;
      clearToken();
      lockSession();
      markActivationRevoked('This account is activated on another device. Ask admin to reset device binding.');
    }

    throw new Error(message);
  }
  return res.json();
}

// ⬇️ Updated: use username (not email)
export async function apiLogin({ username, password, deviceId, userType }) {
  // deviceId is optional here; header already carries X-Device-Id
  return http('POST', '/api/auth/login', { username, password, deviceId, userType });
}

export async function apiExport({ page = 1, limit = 5000, since = null, databaseId = null, signal } = {}) {
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
