// src/services/api.js
const API_BASE = (import.meta.env.VITE_API_BASE || 'https://electionserver.onrender.com').replace(/\/+$/, '');
let authToken = null;

/* ---------------------------- auth token helpers ---------------------------- */
export function setAuthToken(token) { authToken = token; }
export function clearAuthToken() { authToken = null; }
export function getAuthToken() { return authToken; }

/* -------------------------------- core fetch -------------------------------- */
async function request(path, { method = 'GET', body, signal } = {}) {
  if (!API_BASE) throw new Error('VITE_API_BASE is not set');
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  // Try to parse response body even on errors
  const text = await res.text().catch(() => '');
  const asJson = (() => { try { return text ? JSON.parse(text) : null; } catch { return null; } })();

  if (!res.ok) {
    const msg = (asJson && (asJson.error || asJson.message)) || text || res.statusText;
    throw new Error(`API ${res.status}: ${msg}`);
  }

  return asJson ?? {};
}

function toParams(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  return p;
}

/* --------------------------------- auth api --------------------------------- */
export async function login({ email, password }) {
  const data = await request('/api/auth/login', { method: 'POST', body: { email, password } });
  if (data?.token) setAuthToken(data.token);
  return data; // { token, user }
}

/* ------------------------------- voters search ------------------------------ */
/**
 * apiSearch({ q, page, limit, filters, fields, signal })
 * - filters: { Booth: 12 } becomes filters[Booth]=12
 * - fields: ['name','voter_id'] -> fields=name,voter_id
 */
export async function apiSearch({
  q = '',
  page = 1,
  limit = 20,
  filters = {},
  fields = [],
  since = null,              // kept for compatibility; backend ignores unless you add it
  signal,
  offlinePreferred = true,   // kept for compatibility; not used here
} = {}) {
  const params = toParams({ q, page, limit, since });

  // generic equals filters -> filters[field]=value
  for (const [k, v] of Object.entries(filters || {})) {
    if (v !== undefined && v !== null && String(v) !== '') {
      params.set(`filters[${k}]`, String(v));
    }
  }

  if (Array.isArray(fields) && fields.length) {
    params.set('fields', fields.join(','));
  }

  const data = await request(`/api/voters/search?${params.toString()}`, { signal });

  // normalize shapes from server: prefer `results`, fallback to `items`/`data`/array
  const items =
    (Array.isArray(data?.results) && data.results) ||
    (Array.isArray(data?.items) && data.items) ||
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data) ? data : []);

  return {
    items,
    total: data?.total ?? items.length,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    pages: data?.pages ?? (data?.total ? Math.max(1, Math.ceil(data.total / (data.limit || limit))) : undefined),
  };
}

/* ------------------------------- mobile update ------------------------------ */
export async function updateMobileById(id, mobileOrBody) {
  // accept string or object { mobile: '9xxxxxxxxx' }
  const body = typeof mobileOrBody === 'string' ? { mobile: mobileOrBody } : (mobileOrBody || {});
  return request(`/api/voters/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export async function updateMobileByEPIC(epic, mobileOrBody) {
  const body = typeof mobileOrBody === 'string' ? { mobile: mobileOrBody } : (mobileOrBody || {});
  return request(`/api/voters/by-epic/${encodeURIComponent(epic)}`, { method: 'PATCH', body });
}

/* -------------------------------- convenience ------------------------------- */
export async function health() {
  return request('/api/health');
}
