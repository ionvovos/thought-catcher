// Embedding host (architecture 2.1): drives embed.worker.js. Browser only, importable in Node.
// Interface used by core.js: { check(), load({ onProgress }), embed(texts) -> Float32Array[], cancel(), loaded() }.
import { normalize } from '../core/vector.js';

export const STALL_MS = 60000;
const codeError = (code, message) => Object.assign(new Error(message), { code });

// deps (optional, for tests): { createWorker(), stallMs }
export function createEmbedHost(deps = {}) {
  const createWorker = deps.createWorker ?? (() => new Worker(new URL('./embed.worker.js', import.meta.url), { type: 'module' }));
  const stallMs = deps.stallMs ?? STALL_MS;
  let worker = null;
  let ready = false;
  let seq = 0;
  const waiting = new Map();
  let onProgressCb = null;
  let stallTimer = null;

  const fail = (err) => { for (const [, w] of waiting) w.reject(err); waiting.clear(); };
  const arm = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => { const w = worker; worker = null; ready = false; try { w?.terminate(); } catch { /* gone */ } fail(codeError('watchdog', 'The search model did not start in time.')); }, stallMs);
  };
  const call = (msg) => new Promise((resolve, reject) => {
    seq += 1;
    waiting.set(seq, { resolve, reject });
    worker.postMessage({ id: seq, ...msg });
  });
  const spawn = () => {
    worker = createWorker();
    worker.addEventListener('message', ({ data }) => {
      if (data.type === 'progress') { arm(); onProgressCb?.(data.pct); return; }
      const w = waiting.get(data.id);
      if (!w) return;
      waiting.delete(data.id);
      if (data.type === 'error') w.reject(new Error(data.message));
      else w.resolve(data);
    });
    worker.addEventListener('error', (e) => fail(new Error(String(e?.message ?? 'The search model could not start.'))));
  };

  return {
    model: 'Xenova/all-MiniLM-L6-v2',
    async check() {
      return typeof WebAssembly === 'object' ? null : { state: 'not-supported', reason: 'no-wasm' };
    },
    loaded: () => ready,
    async load({ onProgress } = {}) {
      if (ready) return;
      onProgressCb = onProgress ?? null;
      if (!worker) spawn();
      arm();
      try {
        await call({ type: 'load' });
        ready = true;
      } catch (err) {
        try { worker?.terminate(); } catch { /* gone */ }
        worker = null;
        throw err;
      } finally {
        clearTimeout(stallTimer);
      }
    },
    async embed(texts) {
      if (!ready) throw new Error('The search model is not loaded.');
      const res = await call({ type: 'embed', texts });
      return res.vecs.map((v) => normalize(Float32Array.from(v)));
    },
    cancel() {
      clearTimeout(stallTimer);
      const w = worker;
      worker = null;
      ready = false;
      try { w?.terminate(); } catch { /* gone */ }
      fail(codeError('load-failed', 'cancelled'));
    },
  };
}
