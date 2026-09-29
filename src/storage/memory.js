// In-memory store: reference implementation of the store interface (architecture 5.2). Pure.

export function createMemoryStore() {
  const thoughts = new Map();
  const settings = new Map();
  const check = (t) => {
    if (!t || typeof t.id !== 'string' || !t.id) throw new TypeError('thought needs a string id');
  };
  return {
    async getAll() { return [...thoughts.values()].map((t) => structuredClone(t)); },
    async get(id) { return thoughts.has(id) ? structuredClone(thoughts.get(id)) : undefined; },
    async put(t) { check(t); thoughts.set(t.id, structuredClone(t)); },
    async putMany(list) {
      list.forEach(check);
      for (const t of list) thoughts.set(t.id, structuredClone(t));
    },
    async delete(id) { thoughts.delete(id); },
    async clear() { thoughts.clear(); },
    async getSetting(key, fallback) { return settings.has(key) ? structuredClone(settings.get(key)) : fallback; },
    async setSetting(key, value) { settings.set(key, structuredClone(value)); },
  };
}
