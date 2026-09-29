// IndexedDB store: same interface as memory.js (architecture 5.1, 5.2). Browser only.

const DB_NAME = 'thought-catcher';
const DB_VERSION = 1;
const UNAVAILABLE = 'Storage is not available in this browser mode.';

function openDb(idbFactory) {
  return new Promise((resolve, reject) => {
    if (!idbFactory) { reject(new Error(UNAVAILABLE)); return; }
    let req;
    try { req = idbFactory.open(DB_NAME, DB_VERSION); } catch { reject(new Error(UNAVAILABLE)); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('thoughts')) {
        const s = db.createObjectStore('thoughts', { keyPath: 'id' });
        s.createIndex('by_type', 'type');
        s.createIndex('by_created', 'created_at');
        s.createIndex('by_due', 'due_at');
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(UNAVAILABLE));
    req.onblocked = () => reject(new Error(UNAVAILABLE));
  });
}

export async function createIdbStore(idbFactory) {
  const db = await openDb(idbFactory);
  db.onversionchange = () => db.close();

  const write = (storeName, fn) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    fn(store);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Storage write failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage write aborted.'));
  });
  const read = (storeName, fn) => new Promise((resolve, reject) => {
    const req = fn(db.transaction(storeName, 'readonly').objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Storage read failed.'));
  });
  const check = (t) => {
    if (!t || typeof t.id !== 'string' || !t.id) throw new TypeError('thought needs a string id');
  };

  const store = {
    getAll: () => read('thoughts', (s) => s.getAll()),
    get: (id) => read('thoughts', (s) => s.get(id)),
    async put(t) { check(t); await write('thoughts', (s) => { s.put(t); }); },
    async putMany(list) { list.forEach(check); await write('thoughts', (s) => { for (const t of list) s.put(t); }); },
    delete: (id) => write('thoughts', (s) => { s.delete(id); }),
    clear: () => write('thoughts', (s) => { s.clear(); }),
    async getSetting(key, fallback) {
      const row = await read('settings', (s) => s.get(key));
      return row === undefined ? fallback : row.value;
    },
    setSetting: (key, value) => write('settings', (s) => { s.put({ key, value }); }),
  };

  if ((await store.getSetting('schema.version', undefined)) === undefined) await store.setSetting('schema.version', 1);
  return store;
}
