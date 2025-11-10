// src/services/api.js
const API_BASE = import.meta.env.VITE_API_BASE || 'https://electionserver.onrender.com';
let authToken = null;

export function setAuthToken(token) { authToken = token; }

export async function apiSearch({ q = '', page = 1, limit = 20, since = null, signal, offlinePreferred = true }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (since) params.set('since', String(since));
  const url = `${API_BASE}/api/voters/search?${params.toString()}`;

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(url, { headers, signal });
  if (!res.ok) {
    // Let caller decide to fallback to offline
    throw new Error(`API ${res.status}`);
  }
  const data = await res.json();
  // Normalize shapes:
  // Accept {items: [...]} OR {data: [...]} OR direct array […]
  let items = data?.items || data?.data || (Array.isArray(data) ? data : []);
  return { items, total: data?.total ?? undefined, page, limit };
}
