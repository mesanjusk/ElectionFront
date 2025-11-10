// src/offline/sync.js
import { upsertVoters, putMeta, getMeta, getCount } from '../db';
import { apiSearch } from '../services/api';

const META_LAST_SYNC = 'lastSyncTs';
const PAGE_SIZE = 1000; // tune based on your API limits

export async function initialSyncIfNeeded() {
  // Skip if we already have a cache
  const count = await getCount();
  if (count > 0) return;
  await fullSync();
}

export async function fullSync(signal) {
  // Fetch all voters in pages; store into IDB
  let page = 1;
  let fetched = 0;
  // Store a soft "lastSync" marker
  const startedAt = Date.now();

  // If your backend supports "changes since", you can pass &since=<lastSync>
  // For now, we fetch all.
  while (true) {
    const res = await apiSearch({ q: '', page, limit: PAGE_SIZE, offlinePreferred: false, signal });
    const items = res?.items || res?.data || [];
    if (!items.length) break;
    await upsertVoters(items);
    fetched += items.length;
    page += 1;
    // If caller aborted
    if (signal?.aborted) break;
  }
  await putMeta(META_LAST_SYNC, startedAt);
  return fetched;
}

// Optional incremental update (depends on your backend offering "since").
// If your /search returns updatedAt and supports since, enable below:
// export async function syncSinceLast(signal) {
//   const since = await getMeta(META_LAST_SYNC, 0);
//   let page = 1;
//   let fetched = 0;
//   while (true) {
//     const res = await apiSearch({ q: '', page, limit: PAGE_SIZE, since, offlinePreferred: false, signal });
//     const items = res?.items || [];
//     if (!items.length) break;
//     await upsertVoters(items);
//     fetched += items.length;
//     page += 1;
//     if (signal?.aborted) break;
//   }
//   if (fetched) await putMeta(META_LAST_SYNC, Date.now());
//   return fetched;
// }
