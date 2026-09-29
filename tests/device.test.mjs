import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceHost, WATCHDOG_MS } from '../src/brain/device.js';
import { createEmbedHost } from '../src/brain/embedder.js';

const adapter = (features = ['shader-f16']) => ({ features: new Set(features) });
const nav = (over = {}) => ({ gpu: { requestAdapter: async () => adapter() }, deviceMemory: 8, storage: { persist: async () => true }, ...over });
const fakeWorker = () => { const w = { terminated: 0, listeners: {}, terminate() { w.terminated += 1; }, addEventListener(t, fn) { w.listeners[t] = fn; } }; return w; };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

test('the watchdog is 30 s', () => { assert.equal(WATCHDOG_MS, 30000); });

test('capability check: adapter, shader-f16 and memory decide, with the reason (architecture 2.6)', async () => {
  assert.equal(await createDeviceHost({ nav: nav() }).check(), null);
  assert.deepEqual(await createDeviceHost({ nav: {} }).check(), { state: 'not-supported', reason: 'no-webgpu' });
  assert.deepEqual(await createDeviceHost({ nav: nav({ gpu: { requestAdapter: async () => null } }) }).check(), { state: 'not-supported', reason: 'no-webgpu' });
  assert.deepEqual(await createDeviceHost({ nav: nav({ gpu: { requestAdapter: async () => { throw new Error('x'); } } }) }).check(), { state: 'not-supported', reason: 'no-webgpu' });
  assert.deepEqual(await createDeviceHost({ nav: nav({ gpu: { requestAdapter: async () => adapter([]) } }) }).check(), { state: 'not-supported', reason: 'no-f16' });
  assert.deepEqual(await createDeviceHost({ nav: nav({ deviceMemory: 2 }) }).check(), { state: 'not-supported', reason: 'memory' });
  assert.equal(await createDeviceHost({ nav: nav({ deviceMemory: undefined }) }).check(), null, 'Safari does not expose deviceMemory');
});

test('load reports progress, keeps the engine, generates with temperature 0 and stream false, and requests persistence', async () => {
  let persisted = 0;
  const seen = [];
  let request = null;
  const engine = { chat: { completions: { create: async (r) => { request = r; return { choices: [{ message: { content: '{"items":[]}' } }] }; } } } };
  const host = createDeviceHost({
    nav: nav({ storage: { persist: async () => { persisted += 1; return true; } } }), createWorker: fakeWorker,
    loadLib: async () => ({ CreateWebWorkerMLCEngine: async (w, model, { initProgressCallback }) => { initProgressCallback({ progress: 0.25, text: 'a' }); initProgressCallback({ progress: 1, text: 'b' }); assert.equal(model, 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'); return engine; } }),
  });
  assert.equal(host.loaded(), false);
  await host.load({ onProgress: (p, t) => seen.push([p, t]) });
  assert.deepEqual(seen, [[25, 'a'], [100, 'b']]);
  assert.equal(host.loaded(), true);
  assert.equal(persisted, 1);
  assert.equal(await host.generate([{ role: 'user', content: 'x' }], { maxTokens: 123 }), '{"items":[]}');
  assert.equal(request.temperature, 0);
  assert.equal(request.stream, false);
  assert.equal(request.max_tokens, 123);
});

test('watchdog: no progress event for the window rejects with code watchdog and terminates the worker (spike: a CSP block hangs silently)', async () => {
  const w = fakeWorker();
  const host = createDeviceHost({ nav: nav(), watchdogMs: 30, createWorker: () => w, loadLib: async () => ({ CreateWebWorkerMLCEngine: () => new Promise(() => {}) }) });
  await assert.rejects(host.load(), (e) => e.code === 'watchdog');
  assert.equal(w.terminated >= 1, true);
  assert.equal(host.loaded(), false);
});

test('watchdog: a library that never loads is caught too; a slow load with steady progress is not', async () => {
  const stuck = createDeviceHost({ nav: nav(), watchdogMs: 30, createWorker: fakeWorker, loadLib: () => new Promise(() => {}) });
  await assert.rejects(stuck.load(), (e) => e.code === 'watchdog');
  const slow = createDeviceHost({
    nav: nav(), watchdogMs: 40, createWorker: fakeWorker,
    loadLib: async () => ({ CreateWebWorkerMLCEngine: async (w, m, { initProgressCallback }) => { for (let i = 1; i <= 5; i += 1) { await sleep(20); initProgressCallback({ progress: i / 5, text: '' }); } return { chat: {} }; } }),
  });
  await slow.load();
  assert.equal(slow.loaded(), true, 'five events 20 ms apart under a 40 ms watchdog');
});

test('a worker error during load rejects with load-failed; cancel terminates the worker and rejects the load', async () => {
  const w = fakeWorker();
  const host = createDeviceHost({ nav: nav(), watchdogMs: 1000, createWorker: () => w, loadLib: async () => ({ CreateWebWorkerMLCEngine: () => new Promise(() => {}) }) });
  const p = host.load();
  await sleep(10);
  w.listeners.error({ message: 'blocked by CSP' });
  await assert.rejects(p, (e) => e.code === 'load-failed' && /CSP/.test(e.message));
  const w2 = fakeWorker();
  const h2 = createDeviceHost({ nav: nav(), watchdogMs: 1000, createWorker: () => w2, loadLib: async () => ({ CreateWebWorkerMLCEngine: () => new Promise(() => {}) }) });
  const p2 = h2.load();
  await sleep(10);
  h2.cancel();
  await assert.rejects(p2, (e) => e.message === 'cancelled');
  assert.ok(w2.terminated >= 1);
});

test('generate: not loaded throws; a run past the timeout is interrupted', async () => {
  const idle = createDeviceHost({ nav: nav() });
  await assert.rejects(idle.generate([]), /not loaded/);
  let interrupted = 0;
  const engine = { interruptGenerate: () => { interrupted += 1; }, chat: { completions: { create: () => sleep(60).then(() => ({ choices: [{ message: { content: 'late' } }] })) } } };
  const host = createDeviceHost({ nav: nav(), createWorker: fakeWorker, loadLib: async () => ({ CreateWebWorkerMLCEngine: async () => engine }) });
  await host.load();
  await host.generate([], { timeoutMs: 20 });
  assert.equal(interrupted, 1);
});

// ---- embedding host over a fake worker ----
function embedWorker({ answer = true } = {}) {
  const w = { terminated: 0, sent: [], listeners: {} };
  w.terminate = () => { w.terminated += 1; };
  w.addEventListener = (t, fn) => { w.listeners[t] = fn; };
  w.postMessage = (m) => {
    w.sent.push(m);
    if (!answer) return;
    queueMicrotask(() => {
      if (m.type === 'load') { w.listeners.message({ data: { id: m.id, type: 'progress', pct: 40 } }); w.listeners.message({ data: { id: m.id, type: 'loaded' } }); }
      if (m.type === 'embed') w.listeners.message({ data: { id: m.id, type: 'result', vecs: m.texts.map(() => [3, 4]) } });
    });
  };
  return w;
}

test('embed host: check needs WebAssembly, load reports progress, embed returns normalised Float32Arrays', async () => {
  const w = embedWorker();
  const host = createEmbedHost({ createWorker: () => w });
  assert.equal(await host.check(), null);
  const pcts = [];
  await host.load({ onProgress: (p) => pcts.push(p) });
  assert.deepEqual(pcts, [40]);
  assert.equal(host.loaded(), true);
  const [v] = await host.embed(['hello']);
  assert.ok(v instanceof Float32Array);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
  await assert.rejects(createEmbedHost({ createWorker: () => w }).embed(['x']), /not loaded/);
});

test('embed host: a worker that never answers trips the stall timer; cancel terminates', async () => {
  const w = embedWorker({ answer: false });
  const host = createEmbedHost({ createWorker: () => w, stallMs: 30 });
  await assert.rejects(host.load(), (e) => e.code === 'watchdog');
  assert.ok(w.terminated >= 1);
  const w2 = embedWorker({ answer: false });
  const h2 = createEmbedHost({ createWorker: () => w2, stallMs: 1000 });
  const p = h2.load();
  await sleep(5);
  h2.cancel();
  await assert.rejects(p, (e) => e.message === 'cancelled');
});
