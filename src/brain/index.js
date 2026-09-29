// The brain's public entry (architecture 2.2): createBrain() wires the workers, the own-key provider, the store and the
// settings into src/brain/core.js. Everything a screen needs is on the returned object; see architecture.md section 2.2.
import { createBrainCore } from './core.js';
import { createDeviceHost } from './device.js';
import { createEmbedHost } from './embedder.js';
import { resolveProvider, keyBinding } from '../core/ai/adapter.js';
import * as defaultSettings from '../storage/settings.js';

// llm, embedder and provider are injectable for tests: pass a stub, or null for "not available".
// provider may be an object or a function returning one.
export function createBrain({ store, settings = defaultSettings, now = () => new Date(), fetch = globalThis.fetch, llm, embedder, provider, online } = {}) {
  if (!store) throw new TypeError('createBrain needs a store');
  const canWork = typeof Worker === 'function';
  const llmHost = llm !== undefined ? llm : (canWork ? createDeviceHost() : null);
  const embedHost = embedder !== undefined ? embedder : (canWork ? createEmbedHost() : null);

  // The own-key provider for the current settings. The same object is returned while nothing that matters has changed,
  // so a "key rejected" mark stays with that key and a new key or provider starts clean.
  let cached = null;
  let cachedFingerprint = null;
  const fromSettings = () => {
    const s = settings.getSettings();
    const binding = keyBinding(s);
    const key = binding ? settings.getKeyFor(binding) : null;
    const fingerprint = JSON.stringify([s['ai.provider'], s['ai.model'], s['ai.base_url'], key]);
    if (fingerprint !== cachedFingerprint) {
      cachedFingerprint = fingerprint;
      cached = resolveProvider(s, { getKeyFor: (b) => settings.getKeyFor(b) }, { fetch: (...a) => fetch(...a), now });
    }
    return cached;
  };
  const getProvider = provider === undefined ? fromSettings : (typeof provider === 'function' ? provider : () => provider);

  const brain = createBrainCore({ store, settings, now, llm: llmHost, embedder: embedHost, getProvider, online });

  const g = globalThis;
  if (typeof g.addEventListener === 'function') {
    g.addEventListener('online', () => brain.refresh());
    g.addEventListener('offline', () => brain.refresh());
    g.addEventListener('storage', () => brain.refresh());
  }
  return brain;
}

export { LLM_MODEL, EMBED_MODEL } from './core.js';
