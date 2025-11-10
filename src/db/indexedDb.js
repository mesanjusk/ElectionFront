// client/src/db/indexedDb.js
import Dexie from 'dexie';

export const db = new Dexie('voter_search_db');

db.version(1).stores({
  voters: `
    _id,
    voter_id,
    name,
    updatedAt,
    mobile,
    booth,
    part,
    serial,
    __raw
  `,
  outbox: `
    ++id,
    _id,
    op,
    payload,
    updatedAt
  `,
  meta: `
    key
  `,
});

export async function getLastSync() {
  const row = await db.meta.get('lastSync');
  return row?.value || null;
}

export async function setLastSync(value) {
  await db.meta.put({ key: 'lastSync', value });
}
