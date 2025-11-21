// client/src/services/sync.js
import { db, getLastSync, setLastSync, clearLastSync } from "../db/indexedDb";
import api, { apiExport } from "./api";
import { getActiveDatabase } from "../auth";

/**
 * Pull all voters from server into IndexedDB for the active database.
 * Uses incremental sync via `since` + per-database `lastSync` key.
 */
export async function pullAll({
  onProgress,
  databaseId: explicitDatabaseId,
} = {}) {
  const activeDatabase = explicitDatabaseId || getActiveDatabase();
  const syncKey = activeDatabase ? `lastSync:${activeDatabase}` : "lastSync";

  let since = await getLastSync(syncKey);
  let page = 1;
  const limit = 5000;
  let total = 0;
  let lastServerTime = since || null;

  console.log("[SYNC] pullAll start", { activeDatabase, syncKey, since, limit });

  while (true) {
    let response;
    try {
      response = await apiExport({
        page,
        limit,
        since,
        databaseId: activeDatabase || undefined,
      });
    } catch (e) {
      console.error("[SYNC] pullAll apiExport error", e?.response || e);
      throw e;
    }

    const { items = [], hasMore = false, serverTime } = response || {};
    console.log("[SYNC] pullAll batch", {
      page,
      batch: items.length,
      hasMore,
      serverTime,
    });

    if (items.length) {
      await db.voters.bulkPut(items);
      total += items.length;
      onProgress?.({ page, batch: items.length, total });
    }

    if (serverTime && (!lastServerTime || serverTime > lastServerTime)) {
      lastServerTime = serverTime;
    }

    if (!hasMore) break;
    page += 1;
  }

  if (lastServerTime) {
    await setLastSync(lastServerTime, syncKey);
    console.log("[SYNC] pullAll setLastSync", { syncKey, lastServerTime });
  }

  console.log("[SYNC] pullAll done", {
    activeDatabase,
    total,
    lastServerTime,
  });

  // Return rich object but still compatible with old callers that treat it as a number
  return { pulled: total, lastSync: lastServerTime, databaseId: activeDatabase };
}

/**
 * Clears all local voters + outbox + lastSync markers for a DB.
 */
export async function resetSyncState(databaseId) {
  console.log("[SYNC] resetSyncState", { databaseId });
  await db.voters.clear();
  await db.outbox.clear();
  if (databaseId) {
    await clearLastSync(`lastSync:${databaseId}`);
  } else {
    await clearLastSync("lastSync");
  }
}

/**
 * Push queued outbox changes to server for a specific voter database.
 * - Accepts { databaseId } but also falls back to getActiveDatabase() for old callers.
 * - Sends databaseId both in body and as ?databaseId=... query param.
 * - On success, removes successfully synced entries from `db.outbox`.
 */
export async function pushOutbox({ databaseId: explicitDatabaseId } = {}) {
  const activeDatabase = explicitDatabaseId || getActiveDatabase();

  if (!activeDatabase) {
    throw new Error("Missing databaseId for pushOutbox");
  }

  const queued = await db.outbox.toArray();
  console.log("[SYNC] pushOutbox start", {
    activeDatabase,
    queued: queued.length,
  });

  if (!queued.length) return { pushed: 0, failed: [] };

  const changes = queued.map(({ _id, op, payload, updatedAt }) => ({
    _id,
    op,
    payload,
    updatedAt,
  }));

  let res;
  try {
    res = await api.post(
      "/api/voters/bulk-upsert",
      {
        databaseId: activeDatabase,
        changes,
      },
      {
        params: { databaseId: activeDatabase },
      }
    );
  } catch (e) {
    console.error("[SYNC] pushOutbox api error", e?.response || e);
    throw e;
  }

  const data = res?.data || {};
  const successIds = data.successIds || [];
  const failed = data.failed || [];

  console.log("[SYNC] pushOutbox result", {
    activeDatabase,
    success: successIds.length,
    failed: failed.length,
  });

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
 * Update one voter in local IndexedDB and enqueue an outbox entry.
 * Used by Search.jsx editors (mobile, caste, interest, etc.).
 */
export async function updateVoterLocal(_id, patch) {
  const now = new Date().toISOString();
  const voter = await db.voters.get(_id);
  const updated = { ...(voter || { _id }), ...patch, updatedAt: now };

  await db.voters.put(updated);

  await db.outbox.put({
    _id,
    op: "upsert",
    payload: patch,
    updatedAt: now,
  });

  console.log("[SYNC] updateVoterLocal", {
    _id,
    patchKeys: Object.keys(patch || {}),
  });

  return updated;
}

/**
 * Simple local search helper – not used in your main Search page, but kept for compatibility.
 */
export async function searchLocal({ q = "", limit = 50, offset = 0 } = {}) {
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
