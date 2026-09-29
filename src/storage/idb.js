// IndexedDB store: the frozen `ctx.store` API (architecture section 5), same interface as memory.js. Browser only.
// Version 2 adds `embeddings`, `quarantine` and the `by_origin` index, and upgrades every v1 row inside the single
// versionchange transaction (architecture 3.3). A failed upgrade aborts, IndexedDB keeps version 1 untouched, and the
// store opens that v1 database read-only so the person can still export.
import { upgradeThought, planMigration } from '../core/migrate.js';

const DB_NAME = 'thought-catcher';
const DB_VERSION = 2;
const UNAVAILABLE = 'Storage is not available in this browser mode.';

// Resolves { db, migration }. Rejects with the request's error when the upgrade aborted, or with Error(UNAVAILABLE).
function openV2(idbFactory, upgrade) {
  return new Promise((resolve, reject) => {
    if (!idbFactory) { reject(new Error(UNAVAILABLE)); return; }
    let req;
    try { req = idbFactory.open(DB_NAME, DB_VERSION); } catch { reject(new Error(UNAVAILABLE)); return; }
    const migration = { state: 'none', count: 0, quarantined: 0, readOnly: false };
    let upgradeError = null;
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;
      const old = ev.oldVersion;
      if (old < 1) {
        const s = db.createObjectStore('thoughts', { keyPath: 'id' });
        s.createIndex('by_type', 'type');
        s.createIndex('by_created', 'created_at');
        s.createIndex('by_due', 'due_at');
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      const thoughts = tx.objectStore('thoughts');
      if (!db.objectStoreNames.contains('embeddings')) db.createObjectStore('embeddings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('quarantine')) db.createObjectStore('quarantine', { keyPath: 'id' });
      if (!thoughts.indexNames.contains('by_origin')) thoughts.createIndex('by_origin', 'origin.id');
      if (old === 1) {
        const all = thoughts.getAll();
        all.onsuccess = () => {
          try {
            const { upgraded, quarantined } = planMigration(all.result, upgrade);
            const quarantineStore = tx.objectStore('quarantine');
            for (const row of upgraded) thoughts.put(row);
            for (const row of quarantined) {
              quarantineStore.put(row);
              thoughts.delete(row.id);
            }
            migration.state = 'migrated';
            migration.count = upgraded.length;
            migration.quarantined = quarantined.length;
          } catch (err) {
            upgradeError = err;
            try { tx.abort(); } catch { /* already aborting */ }
          }
        };
      }
    };
    req.onsuccess = () => resolve({ db: req.result, migration });
    req.onerror = () => reject(upgradeError ?? req.error ?? new Error(UNAVAILABLE));
    // req.onblocked: another tab still holds version 1 open; that tab's onversionchange closes it, so the open just waits
  });
}

// After an aborted upgrade the database is still version 1. Open it as it is.
function openAsIs(idbFactory) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = idbFactory.open(DB_NAME); } catch { reject(new Error(UNAVAILABLE)); return; }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(UNAVAILABLE));
  });
}

// opts.upgrade: row upgrader, only to let a test force a failing migration.
export async function createIdbStore(idbFactory, { upgrade = upgradeThought } = {}) {
  let db;
  let migration;
  try {
    ({ db, migration } = await openV2(idbFactory, upgrade));
  } catch (err) {
    if (err?.message === UNAVAILABLE) throw err;
    db = await openAsIs(idbFactory);
    migration = { state: 'failed', count: 0, quarantined: 0, readOnly: true, error: String(err?.message ?? err) };
  }
  db.onversionchange = () => db.close();
  const readOnly = migration.readOnly;
  const has = (name) => db.objectStoreNames.contains(name);
  const listeners = new Set();
  const emit = (kind, ids) => { for (const fn of [...listeners]) { try { fn({ kind, ids }); } catch { /* a listener must not break a write */ } } };

  const write = (names, fn) => new Promise((resolve, reject) => {
    if (readOnly) { reject(new Error('read-only')); return; }
    const tx = db.transaction(names, 'readwrite');
    fn(...names.map((n) => tx.objectStore(n)));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Storage write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage write aborted.'));
  });
  const read = (name, fn) => new Promise((resolve, reject) => {
    if (!has(name)) { resolve(undefined); return; }
    const req = fn(db.transaction(name, 'readonly').objectStore(name));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Storage read failed.'));
  });
  const check = (t) => {
    if (!t || typeof t.id !== 'string' || !t.id) throw new TypeError('thought needs a string id');
  };
  const embeddingsToo = () => (has('embeddings') ? ['thoughts', 'embeddings'] : ['thoughts']);

  const store = {
    get migration() { return { ...migration }; },
    getAll: async () => (await read('thoughts', (s) => s.getAll())) ?? [],
    get: (id) => read('thoughts', (s) => s.get(id)),
    async put(t) { check(t); await write(['thoughts'], (s) => { s.put(t); }); emit('put', [t.id]); },
    async putMany(list) {
      list.forEach(check);
      await write(['thoughts'], (s) => { for (const t of list) s.put(t); });
      if (list.length) emit('put', list.map((t) => t.id));
    },
    async delete(id) {
      await write(embeddingsToo(), (s, e) => { s.delete(id); e?.delete(id); });
      emit('delete', [id]);
    },
    async deleteMany(ids) {
      await write(embeddingsToo(), (s, e) => { for (const id of ids) { s.delete(id); e?.delete(id); } });
      if (ids.length) emit('delete', ids);
    },
    async clear() {
      const names = ['thoughts', 'embeddings', 'quarantine'].filter(has);
      await write(names, (...stores) => { for (const s of stores) s.clear(); });
      emit('clear', []);
    },
    async getByOrigin(originId) {
      const rows = has('thoughts') && db.transaction('thoughts').objectStore('thoughts').indexNames.contains('by_origin')
        ? await read('thoughts', (s) => s.index('by_origin').getAll(IDBKeyRange.only(originId)))
        : (await store.getAll()).filter((t) => t.origin?.id === originId);
      return (rows ?? []).sort((a, b) => a.origin.index - b.origin.index);
    },
    getQuarantined: async () => (await read('quarantine', (s) => s.getAll())) ?? [],
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async getSetting(key, fallback) {
      const row = await read('settings', (s) => s.get(key));
      return row === undefined ? fallback : row.value;
    },
    async setSetting(key, value) { await write(['settings'], (s) => { s.put({ key, value }); }); },
    // embedding rows { id, model, hash, vec }: brain only
    getEmbedding: (id) => read('embeddings', (s) => s.get(id)),
    async putEmbedding(row) { if (has('embeddings')) await write(['embeddings'], (s) => { s.put(row); }); },
    async deleteEmbedding(id) { if (has('embeddings')) await write(['embeddings'], (s) => { s.delete(id); }); },
    getAllEmbeddings: async () => (await read('embeddings', (s) => s.getAll())) ?? [],
  };

  if (!readOnly && (await store.getSetting('schema.version', undefined)) !== 2) await store.setSetting('schema.version', 2);
  return store;
}
