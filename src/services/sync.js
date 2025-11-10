// client/src/services/sync.js
import { db, getLastSync, setLastSync } from '../db/indexedDb';
import { apiExport, apiBulkUpsert } from './api';

export async function pullAll({ onProgress } = {}) {
  let since = await getLastSync();
  let page = 1;
  const limit = 5000;
  let total = 0;

  while (true) {
    const { items = [], hasMore = false, serverTime } = await apiExport({ page, limit, since });
    if (items.length) {
      await db.voters.bulkPut(items);
      total += items.length;
      onProgress?.({ page, batch: items.length, total });
    }
    if (!hasMore) {
      if (serverTime) await setLastSync(serverTime);
      break;
    }
    page += 1;
  }
  return total;
}

export async function pushOutbox() {
  const queued = await db.outbox.toArray();
  if (!queued.length) return { pushed: 0 };

  const changes = queued.map(({ _id, op, payload, updatedAt }) => ({
    _id, op, payload, updatedAt,
  }));

  const res = await apiBulkUpsert(changes);
  const successSet = new Set(res.successIds || []);
  const toDelete = queued.filter(q => successSet.has(q._id)).map(q => q.id);
  if (toDelete.length) await db.outbox.bulkDelete(toDelete);

  return { pushed: successSet.size, failed: res.failed || [] };
}

export async function updateVoterLocal(_id, patch) {
  const now = new Date().toISOString();
  const voter = await db.voters.get(_id);
  const updated = { ...(voter || { _id }), ...patch, updatedAt: now };
  await db.voters.put(updated);
  await db.outbox.put({
    _id,
    op: 'upsert',
    payload: patch,
    updatedAt: now,
  });
}

export async function searchLocal({ q = '', limit = 50, offset = 0 } = {}) {
  const term = q.trim().toLowerCase();
  if (!term) {
    return db.voters.orderBy('name').offset(offset).limit(limit).toArray();
    // Alternatively: return db.voters.toCollection().limit(limit).toArray();
  }
  const batch = await db.voters
    .toCollection()
    .offset(0)
    .limit(10000)
    .toArray();

  const matches = batch.filter(r => {
    const name = (r.name || r.__raw?.Name || '').toLowerCase();
    const epic = (r.voter_id || r.__raw?.EPIC || '').toLowerCase();
    return name.includes(term) || epic.includes(term);
  });

  return matches.slice(0, limit);
}
