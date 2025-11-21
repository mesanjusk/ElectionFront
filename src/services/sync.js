// client/src/services/sync.js
import { db, getLastSync, setLastSync, clearLastSync } from "../db/indexedDb";
import api from "../api"; // axios instance with interceptors
import { apiExport } from "./api"; // keep using your existing wrapper
import { getActiveDatabase } from "../auth";

/**
 * Pull all voters from server into IndexedDB for the active database.
 * Uses incremental sync via `since` + `lastSync` key.
 */
export async function pullAll({
  onProgress,
  databaseId: explicitDatabaseId,
} = {}) {
  const activeDatabase = explicitDatabaseId || getActiveDatabase();
  const syncKey = activeDatabase ? `lastSync:${activeDatabase}` : "lastSync";

  // last sync timestamp
  let since = await getLastSync(syncKey);
  if (!since) {
    // default to midnight of 2020
    since = new Date("2020-01-01T00:00:00Z").toISOString();
  }

  let page = 1;
  const limit = 2000;

  let totalPulled = 0;
  let newestTimestamp = since;

  while (true) {
    const { items = [], hasMore = false, serverTime } = await apiExport({
      page,
      limit,
      since,
      databaseId: activeDatabase || undefined,
    });

    if (!items.length) break;

    await db.voters.bulkPut(items);

    totalPulled += items.length;
    if (serverTime && serverTime > newestTimestamp) {
      newestTimestamp = serverTime;
    }

    if (onProgress) {
      onProgress({ page, pulled: items.length, totalPulled });
    }

    if (!hasMore) break;
    page += 1;
  }

  // if changed, update lastSync
  if (newestTimestamp !== since) {
    await setLastSync(syncKey, newestTimestamp);
  }

  return totalPulled;
}

/**
 * Push local updates (outbox entries) to the server.
 * - Accepts { databaseId } but also falls back to getActiveDatabase() for old callers.
 * - Sends databaseId both in body and as ?databaseId=... query param.
 * - On success, removes successfully synced entries from `db.outbox`.
 */
export async function pushOutbox({ databaseId: explicitDatabaseId } = {}) {
  const activeDatabase = explicitDatabaseId || getActiveDatabase();

  if (!activeDatabase) {
    // This is what backend is complaining about
    throw new Error("Missing databaseId for pushOutbox");
  }

  const queued = await db.outbox.toArray();
  if (!queued.length) return { pushed: 0, failed: [] };

  const changes = queued.map(({ _id, op, payload, updatedAt }) => ({
    _id,
    op,
    payload,
    updatedAt,
  }));

  // ✅ FIXED — correct backend route
  const res = await api.post(
    "/api/voters/bulk-upsert",
    {
      databaseId: activeDatabase,
      changes,
    },
    {
      params: { databaseId: activeDatabase },
    }
  );

  const data = res.data || {};
  const successIds = data.successIds || [];
  const failed = data.failed || [];

  const successSet = new Set(successIds);
  const toDelete = queued
    .filter((q) => successSet.has(q._id))
    .map((q) => q.id);

  if (toDelete.length) {
    await db.outbox.bulkDelete(toDelete);
  }

  return { pushed: successIds.length, failed };
}

/**
 * Update one voter in local IndexedDB, and enqueue an outbox entry.
 * This is used by Search.jsx's MobileEditModal, CasteModal, InterestModal, etc.
 */
export async function updateVoterLocal(_id, patch) {
  const now = new Date().toISOString();
  const voter = await db.voters.get(_id);
  const updated = { ...(voter || { _id }), ...patch, updatedAt: now };

  await db.voters.put(updated);

  // queue in outbox
  await db.outbox.put({
    _id,
    op: "update",
    payload: patch,
    updatedAt: now,
  });

  return updated;
}

export async function searchLocal(q, limit = 50, offset = 0) {
  const term = q.trim().toLowerCase();

  if (!term) {
    return db.voters.orderBy("name").offset(offset).limit(limit).toArray();
  }

  const batch = await db.voters.toCollection().offset(0).limit(10000).toArray();

  const matches = batch.filter((r) => {
    const name = (r.name || r.__raw?.Name || "").toLowerCase();
    const epic = (r.voter_id || r.__raw?.EPIC || "").toLowerCase();
    return name.includes(term) || epic.includes(term);
  });

  return matches.slice(0, limit);
}
