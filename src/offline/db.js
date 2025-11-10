// src/offline/db.js
const DB_NAME = 'voter-cache';
const DB_VERSION = 1;
const STORE_VOTERS = 'voters';
const STORE_META = 'meta';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_VOTERS)) {
        const os = db.createObjectStore(STORE_VOTERS, { keyPath: 'id' });
        // Optional indexes (not full-text; useful for prefix filters)
        os.createIndex('name_lower', 'name_lower', { unique: false });
        os.createIndex('voter_id_lower', 'voter_id_lower', { unique: false });
        os.createIndex('Booth', 'Booth', { unique: false });
        os.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMeta(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMeta(key, defaultVal = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : defaultVal);
    req.onerror = () => reject(req.error);
  });
}

function normalizeRecord(r) {
  // Try to build a stable 'id'
  const id = r?.id || r?._id || r?.voter_id || crypto.randomUUID();
  const name = r?.name ?? r?.Name ?? r?.__raw?.Name ?? r?.__raw?.['नाव'] ?? '';
  const EPIC = r?.voter_id ?? r?.EPIC ?? r?.__raw?.EPIC ?? r?.__raw?.['कार्ड नं'] ?? '';
  return {
    ...r,
    id,
    name_lower: String(name).toLowerCase(),
    voter_id_lower: String(EPIC).toLowerCase(),
    updatedAt: r?.updatedAt || r?.updated_at || Date.now()
  };
}

export async function upsertVoters(array) {
  if (!array || !array.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOTERS, 'readwrite');
    const store = tx.objectStore(STORE_VOTERS);
    for (const item of array) {
      store.put(normalizeRecord(item));
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearVoters() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOTERS, 'readwrite');
    tx.objectStore(STORE_VOTERS).clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Simple offline search (case-insensitive "includes" on name/EPIC; optional booth filter).
export async function searchOffline({ q = '', booth = '', page = 1, limit = 20 }) {
  const db = await openDB();
  const needle = String(q).trim().toLowerCase();
  const boothFilter = String(booth || '').trim();
  const start = (page - 1) * limit;
  let matched = 0;
  const results = [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOTERS, 'readonly');
    const store = tx.objectStore(STORE_VOTERS);
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve({ items: results, page, limit, offline: true });
        return;
      }
      const val = cursor.value;
      const hay1 = val.name_lower || '';
      const hay2 = val.voter_id_lower || '';
      const boothOk = boothFilter ? String(val?.Booth ?? '') === boothFilter : true;
      const ok =
        boothOk &&
        (!needle ||
          hay1.includes(needle) ||
          hay2.includes(needle));

      if (ok) {
        if (matched >= start && results.length < limit) {
          results.push(val);
        }
        matched++;
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VOTERS, 'readonly');
    const req = tx.objectStore(STORE_VOTERS).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
}
