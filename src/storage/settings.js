// Settings and the AI key on this device (S4). Keys are prefixed `thought-catcher.` in localStorage.
// The AI key lives in its own entry, `thought-catcher.ai-key`, and is never part of getSettings() or an export.

export const PREFIX = 'thought-catcher.';
export const KEY_ENTRY = `${PREFIX}ai-key`;

export const DEFAULTS = Object.freeze({
  'ai.provider': 'none',
  'ai.model': '',
  'ai.base_url': null,
  'speech.engine': 'ask',
  'review.days': 3,
  'review.last_shown_date': null,
  'review.left_unresolved': false,
});

export const SPEECH_ENGINES = Object.freeze(['ask', 'whisper', 'browser', 'typing']);

function clean(patchKey, value) {
  if (patchKey === 'review.days') {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(30, Math.max(1, n)) : DEFAULTS['review.days'];
  }
  if (patchKey === 'speech.engine') return SPEECH_ENGINES.includes(value) ? value : DEFAULTS['speech.engine'];
  if (patchKey === 'ai.provider') return ['none', 'anthropic', 'openai'].includes(value) ? value : 'none';
  if (patchKey === 'ai.model') return String(value ?? '').trim();
  if (patchKey === 'ai.base_url') {
    const v = String(value ?? '').trim();
    return v || null;
  }
  if (patchKey === 'review.left_unresolved') return Boolean(value);
  return value;
}

// storage: anything with getItem/setItem/removeItem (localStorage, or a Map wrapper in tests).
// If storage throws (private mode, blocked), values live in memory for the session.
export function createSettingsApi(storage) {
  const memory = new Map();
  const read = (name) => {
    try {
      if (storage) return storage.getItem(name) ?? null;
    } catch { /* storage blocked: use the session copy */ }
    return memory.has(name) ? memory.get(name) : null;
  };
  const write = (name, value) => {
    memory.set(name, value);
    try { storage?.setItem(name, value); } catch { /* memory copy stays */ }
  };
  const remove = (name) => {
    memory.delete(name);
    try { storage?.removeItem(name); } catch { /* nothing to remove */ }
  };

  return {
    getSettings() {
      const out = { ...DEFAULTS };
      for (const k of Object.keys(DEFAULTS)) {
        const raw = read(PREFIX + k);
        if (raw === null) continue;
        try { out[k] = clean(k, JSON.parse(raw)); } catch { /* keep default */ }
      }
      return out;
    },
    setSettings(patch) {
      for (const [k, v] of Object.entries(patch ?? {})) {
        if (!(k in DEFAULTS)) continue;
        write(PREFIX + k, JSON.stringify(clean(k, v)));
      }
      return this.getSettings();
    },
    getKey() {
      const v = read(KEY_ENTRY);
      return v ? v : null;
    },
    setKey(k) {
      const v = String(k ?? '').trim();
      if (!v) { remove(KEY_ENTRY); return; }
      write(KEY_ENTRY, v);
    },
    removeKey() { remove(KEY_ENTRY); },
    hasKey() { return Boolean(this.getKey()); },
    // Removes every entry this app wrote, key included (delete all data).
    clearAll() {
      for (const k of Object.keys(DEFAULTS)) remove(PREFIX + k);
      remove(KEY_ENTRY);
    },
  };
}

// Resolved on each call; throws when localStorage is missing or blocked so createSettingsApi uses its session copy.
function browserStorage() {
  const s = globalThis.localStorage;
  if (!s) throw new Error('localStorage is not available');
  return s;
}

const api = createSettingsApi({
  getItem: (k) => browserStorage().getItem(k),
  setItem: (k, v) => browserStorage().setItem(k, v),
  removeItem: (k) => browserStorage().removeItem(k),
});

export const getSettings = () => api.getSettings();
export const setSettings = (patch) => api.setSettings(patch);
export const getKey = () => api.getKey();
export const setKey = (k) => api.setKey(k);
export const removeKey = () => api.removeKey();
export const hasKey = () => api.hasKey();
export const clearAll = () => api.clearAll();
