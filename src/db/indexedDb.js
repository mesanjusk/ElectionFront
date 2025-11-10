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

export async function getLastSync(key = 'lastSync') {
  const row = await db.meta.get(key);
  return row?.value || null;
}

export async function setLastSync(value, key = 'lastSync') {
  await db.meta.put({ key, value });
}

export async function clearLastSync(key = 'lastSync') {
  await db.meta.delete(key);
}
