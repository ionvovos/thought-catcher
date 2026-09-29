// On-device language model host (architecture 2.6, spike-b2.md). Browser only, but importable in Node: nothing runs at import.
// Model: WebLLM 0.2.85, Qwen2.5-1.5B-Instruct q4f16_1, in a module worker, loaded only after the user agreed to the download.
import { LLM_MODEL } from './core.js';

export const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
// The weights and the model library are pinned to commits, not to `main`: the library is a WebAssembly file that runs in the
// worker with the app's origin, so a change on the publisher's branch must not reach a download unreviewed (security review F2).
// The WebLLM 0.2.85 entry for this model, with `model` and `model_lib` replaced by commit URLs (both verified 200).
export const MODEL_APP_CONFIG = Object.freeze({
  model_list: Object.freeze([Object.freeze({
    model: 'https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC/resolve/9bd564b064631febf14deadcac492efb761d60c3/',
    model_id: LLM_MODEL,
    model_lib: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/025bcaf3780fa8254f5e5efd3bfea0a5397248f4/web-llm-models/v0_2_84/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm',
    vram_required_MB: 1629.75,
    low_resource_required: true,
    overrides: Object.freeze({ context_window_size: 4096 }),
  })]),
});
export const WATCHDOG_MS = 30000;
export const MIN_DEVICE_MEMORY_GB = 4;

const codeError = (code, message) => Object.assign(new Error(message), { code });

// deps (all optional, for tests): { nav, createWorker(), loadLib(), watchdogMs, model, storage }
export function createDeviceHost(deps = {}) {
  const nav = deps.nav ?? globalThis.navigator;
  const model = deps.model ?? LLM_MODEL;
  const watchdogMs = deps.watchdogMs ?? WATCHDOG_MS;
  const createWorker = deps.createWorker ?? (() => new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' }));
  const loadLib = deps.loadLib ?? (() => import(/* webpackIgnore: true */ WEBLLM_URL));
  let worker = null;
  let engine = null;
  let abort = null;

  return {
    model,
    // null when the device can run the model, else a not-supported LlmStatus. Cheap: no download, no worker.
    async check() {
      if (!nav?.gpu) return { state: 'not-supported', reason: 'no-webgpu' };
      let adapter = null;
      try { adapter = await nav.gpu.requestAdapter(); } catch { adapter = null; }
      if (!adapter) return { state: 'not-supported', reason: 'no-webgpu' };
      if (!adapter.features?.has('shader-f16')) return { state: 'not-supported', reason: 'no-f16' };
      if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < MIN_DEVICE_MEMORY_GB) return { state: 'not-supported', reason: 'memory' };
      return null;
    },

    loaded: () => engine !== null,

    // Resolves when the engine is ready. Rejects with err.code 'watchdog' after watchdogMs without a progress event.
    async load({ onProgress } = {}) {
      if (engine) return;
      let timer = null;
      let done = false;
      const stall = new Promise((_, reject) => { abort = (err) => { if (!done) reject(err); }; });
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          try { worker?.terminate(); } catch { /* already gone */ }
          worker = null;
          abort?.(codeError('watchdog', 'The assistant did not start in time.'));
        }, watchdogMs);
      };
      arm();
      try {
        await Promise.race([
          (async () => {
            const lib = await loadLib();
            arm();
            worker = createWorker();
            worker.addEventListener?.('error', (e) => abort?.(codeError('load-failed', String(e?.message ?? 'The assistant could not start.'))));
            worker.addEventListener?.('message', (e) => { if (e?.data?.kind === 'worker-error') abort?.(codeError('load-failed', e.data.message)); });
            const created = await lib.CreateWebWorkerMLCEngine(worker, model, {
              appConfig: MODEL_APP_CONFIG,
              initProgressCallback: (p) => { arm(); onProgress?.(Math.round((p?.progress ?? 0) * 100), p?.text ?? ''); },
            });
            engine = created;
          })(),
          stall,
        ]);
        try { await nav?.storage?.persist?.(); } catch { /* persistence is a request, not a need */ }
      } catch (err) {
        try { worker?.terminate(); } catch { /* already gone */ }
        worker = null;
        engine = null;
        throw err;
      } finally {
        done = true;
        clearTimeout(timer);
        abort = null;
      }
    },

    async generate(messages, { maxTokens = 400, timeoutMs = 20000 } = {}) {
      if (!engine) throw new Error('The assistant is not loaded.');
      const timer = setTimeout(() => { try { engine.interruptGenerate?.(); } catch { /* nothing running */ } }, timeoutMs);
      try {
        const res = await engine.chat.completions.create({ messages, temperature: 0, max_tokens: maxTokens, stream: false });
        const text = res?.choices?.[0]?.message?.content;
        if (typeof text !== 'string') throw new Error('The assistant returned no text.');
        return text;
      } finally {
        clearTimeout(timer);
      }
    },

    cancel() {
      abort?.(codeError('load-failed', 'cancelled'));
      try { worker?.terminate(); } catch { /* already gone */ }
      worker = null;
      engine = null;
    },
  };
}
