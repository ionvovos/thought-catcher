// In-memory store: reference implementation of the frozen `ctx.store` API (architecture section 5). Pure.
// idb.js implements the same interface; the brain also uses the embedding rows.

const NO_MIGRATION = Object.freeze({ state: 'none', count: 0, quarantined: 0, readOnly: false });

// opts: { migration, quarantined: raw rows, readOnly } for tests that need those states.
export function createMemoryStore(opts = {}) {
  const thoughts = new Map();
  const settings = new Map();
  const embeddings = new Map();
  let quarantine = (opts.quarantined ?? []).map((r) => structuredClone(r));
  const listeners = new Set();
  const migration = { ...NO_MIGRATION, ...(opts.migration ?? {}), readOnly: Boolean(opts.readOnly ?? opts.migration?.readOnly) };
  const check = (t) => {
    if (!t || typeof t.id !== 'string' || !t.id) throw new TypeError('thought needs a string id');
  };
  const writable = () => { if (migration.readOnly) throw new Error('read-only'); };
  const emit = (kind, ids) => { for (const fn of [...listeners]) { try { fn({ kind, ids }); } catch { /* a listener must not break a write */ } } };
  const originOf = (t) => t.origin?.id;

  return {
    get migration() { return { ...migration }; },
    async getAll() { return [...thoughts.values()].map((t) => structuredClone(t)); },
    async get(id) { return thoughts.has(id) ? structuredClone(thoughts.get(id)) : undefined; },
    async put(t) { writable(); check(t); thoughts.set(t.id, structuredClone(t)); emit('put', [t.id]); },
    async putMany(list) {
      writable();
      list.forEach(check);
      for (const t of list) thoughts.set(t.id, structuredClone(t));
      if (list.length) emit('put', list.map((t) => t.id));
    },
    async delete(id) {
      writable();
      const had = thoughts.delete(id);
      embeddings.delete(id);
      if (had) emit('delete', [id]);
    },
    async deleteMany(ids) {
      writable();
      const gone = ids.filter((id) => thoughts.delete(id));
      for (const id of ids) embeddings.delete(id);
      if (gone.length) emit('delete', gone);
    },
    async clear() {
      writable();
      thoughts.clear();
      embeddings.clear();
      quarantine = [];
      emit('clear', []);
    },
    async getByOrigin(originId) {
      return [...thoughts.values()]
        .filter((t) => originOf(t) === originId)
        .sort((a, b) => a.origin.index - b.origin.index)
        .map((t) => structuredClone(t));
    },
    async getQuarantined() { return quarantine.map((r) => structuredClone(r)); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async getSetting(key, fallback) { return settings.has(key) ? structuredClone(settings.get(key)) : fallback; },
    async setSetting(key, value) { settings.set(key, structuredClone(value)); },
    // embedding rows: { id, model, hash, vec: Float32Array } (brain only)
    async getEmbedding(id) { return embeddings.has(id) ? structuredClone(embeddings.get(id)) : undefined; },
    async putEmbedding(row) { writable(); embeddings.set(row.id, structuredClone(row)); },
    async deleteEmbedding(id) { writable(); embeddings.delete(id); },
    async getAllEmbeddings() { return [...embeddings.values()].map((r) => structuredClone(r)); },
  };
}
