// client/src/offline.js
const DB_NAME = 'voter_offline_db';
const STORE = 'voters';
const VER = 1;

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: '_id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('voter_id', 'voter_id', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function bulkImport(rows = []) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const r of rows) {
      const name = r.name || r.Name || r['Full Name'] || r['FULL NAME'] || r['नाम'] || r['Voter Name'];
      const voter_id = r.voter_id || r['Voter Id'] || r['VoterID'] || r['EPIC'] || r['EPIC_NO'] || r['EPIC NO'];
      const doc = { ...r, __raw: r.__raw || r, name: name ? String(name) : undefined, voter_id: voter_id ? String(voter_id) : undefined };
      store.add(doc);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function importFromUrl(url = '/voters.seed.json') {
  const res = await fetch(url);
  const data = await res.json();
  await clearAll();
  await bulkImport(data);
  localStorage.setItem('offlineSeeded', '1');
  return data.length;
}

/**
 * Offline search with pagination & generic equals filters
 * @param q string
 * @param page number >=1
 * @param limit number
 * @param filters object, e.g., { Booth: "12" }
 */
export async function searchIndexed({ q = '', page = 1, limit = 20, filters = {} }) {
  const db = await openDB();
  const out = [];
  const qLower = String(q).toLowerCase();
  let total = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) {
        const start = (page - 1) * limit;
        const results = out.slice(start, start + limit);
        return resolve({ results, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
      }
      const v = cur.value;

      // Simple equals filters on top-level or __raw
      let pass = true;
      for (const [k, val] of Object.entries(filters || {})) {
        if (val === undefined || val === '') continue;
        const a = v[k] ?? v.__raw?.[k];
        if (String(a ?? '').toLowerCase() !== String(val).toLowerCase()) {
          pass = false;
          break;
        }
      }

      if (pass) {
        if (!qLower) {
          out.push(v);
          total++;
        } else {
          const name = (v.name || '').toLowerCase();
          const epic = (v.voter_id || '').toLowerCase();
          const raw = JSON.stringify(v.__raw || v).toLowerCase();
          if (name.includes(qLower) || epic.includes(qLower) || raw.includes(qLower)) {
            out.push(v);
            total++;
          }
        }
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}
