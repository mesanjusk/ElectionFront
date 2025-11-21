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
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }
}

async function http(method, path, body, { signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  // Always include device header
  try {
    const deviceId = getDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
  } catch (_) {
    /* ignore */
  }

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

    // 🔁 Normal expiry / auth error: just lock the session
    if (res.status === 401 || res.status === 403) {
      authToken = null;
      clearToken();
      lockSession();
      // ⛔ DO NOT markActivationRevoked here.
      // We want the device to stay activated so PIN login continues to work.
    } else if (res.status === 409) {
      // Logged in somewhere else → ask for reactivation
      authToken = null;
      clearToken();
      lockSession();
      markActivationRevoked(
        'You signed in on another device. Reactivate here to resume.'
      );
    } else if (res.status === 423) {
      // Device bound on another device → real activation conflict
      authToken = null;
      clearToken();
      lockSession();
      markActivationRevoked(
        'This account is activated on another device. Ask admin to reset device binding.'
      );
    }

    throw new Error(message);
  }

  return res.json();
}

/* =========================
   AUTH (username-only)
   ========================= */
// deviceId is optional here; header already carries X-Device-Id
export async function apiLogin({ username, password, deviceId, userType }) {
  return http('POST', '/api/auth/login', {
    username,
    password,
    deviceId,
    userType,
  });
}

export async function apiPinLogin({ username, pin, deviceId }) {
  return http('POST', '/api/auth/pin-login', { username, pin, deviceId });
}

/* =========================
   VOTERS
   ========================= */
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

export async function apiBulkUpsert({ changes, databaseId } = {}) {
  const body = { changes };
  if (databaseId) body.databaseId = databaseId;
  return http('POST', '/api/voters/bulk-upsert', body);
}

/* =========================
   ADMIN – USERS & DBs
   ========================= */
export async function adminListUsers() {
  const res = await http('GET', '/api/admin/users');
  return res?.users || [];
}

export async function adminCreateUser({
  username,
  password,
  role = 'user',
  allowedDatabaseIds = [],
}) {
  return http('POST', '/api/admin/users', {
    username,
    password,
    role,
    allowedDatabaseIds,
  });
}

export async function adminDeleteUser(id) {
  return http('DELETE', `/api/admin/users/${id}`);
}

export async function adminUpdateUserRole(id, role) {
  return http('PATCH', `/api/admin/users/${id}/role`, { role });
}

export async function adminUpdateUserPassword(id, password) {
  return http('PATCH', `/api/admin/users/${id}/password`, { password });
}

export async function adminUpdateUserDatabases(id, allowedDatabaseIds) {
  return http('PATCH', `/api/admin/users/${id}/databases`, {
    allowedDatabaseIds,
  });
}

export async function adminListDatabases() {
  const res = await http('GET', '/api/admin/databases');
  return res?.databases || [];
}
