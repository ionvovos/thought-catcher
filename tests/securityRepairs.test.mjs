// Repairs from the v2 security review (reports/thought-catcher/security-review-v2.md): F1, F2, F7, F8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODEL_APP_CONFIG, WEBLLM_URL } from '../src/brain/device.js';
import { TRANSFORMERS_URL } from '../src/speech/whisper.js';
import { LLM_MODEL } from '../src/brain/core.js';
import { AiError, postJson } from '../src/core/ai/http.js';
import * as validate from '../src/brain/validate.js';

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)).split(/\s+/).slice(1);

test('F1: script-src names three exact jsDelivr paths, never the whole host; worker-src has no jsDelivr', () => {
  const scripts = directive('script-src');
  const cdn = scripts.filter((s) => s.includes('cdn.jsdelivr.net'));
  assert.equal(cdn.length, 3);
  assert.ok(cdn.every((s) => /^https:\/\/cdn\.jsdelivr\.net\/npm\/.+/.test(s)), cdn.join(' '));
  assert.ok(cdn.includes(TRANSFORMERS_URL), 'the transformers.js path equals the pinned constant');
  assert.ok(WEBLLM_URL.startsWith(cdn.find((s) => s.includes('web-llm'))), 'the WebLLM path is a prefix of the pinned import URL');
  assert.ok(cdn.some((s) => /onnxruntime-web@[\w.-]+\/$/.test(s)));
  assert.ok(!directive('worker-src').some((s) => s.includes('jsdelivr')));
  assert.ok(scripts.includes("'wasm-unsafe-eval'") && scripts.includes('blob:'), 'blob: is needed by the Whisper path (review)');
});

test('F2: the model weights and the model library are pinned to commits, not main', () => {
  const [m] = MODEL_APP_CONFIG.model_list;
  assert.equal(m.model_id, LLM_MODEL);
  assert.match(m.model, /^https:\/\/huggingface\.co\/mlc-ai\/Qwen2\.5-1\.5B-Instruct-q4f16_1-MLC\/resolve\/[0-9a-f]{40}\/$/);
  assert.match(m.model_lib, /^https:\/\/raw\.githubusercontent\.com\/mlc-ai\/binary-mlc-llm-libs\/[0-9a-f]{40}\/.+\.wasm$/);
  assert.equal(m.vram_required_MB, 1629.75);
  assert.equal(m.low_resource_required, true);
  assert.equal(m.overrides.context_window_size, 4096);
});

test('F7: a reply object with its own toString is rejected as malformed, never a TypeError', () => {
  const hostile = JSON.parse('{"reply":{"toString":1},"answer":{"toString":1},"wording":{"toString":1},"text":{"toString":1}}');
  for (const [name, fn] of Object.entries(validate).filter(([n, f]) => typeof f === 'function' && /^(validate|optionalReply)/.test(n))) {
    try { fn(hostile); } catch (err) { assert.ok(err instanceof AiError, `${name} threw ${err?.name}: ${err?.message}`); }
  }
});

test('F8: a provider body that echoes the key is masked in the message that is kept', async () => {
  const key = 'sk-test-1234567890abcdef';
  for (const status of [429, 500]) {
    const fetchFn = async () => ({ ok: false, status, text: async () => JSON.stringify({ error: { message: `Too many requests for ${key}, slow down` } }) });
    await assert.rejects(postJson(fetchFn, 'https://x.test/v1', { headers: { authorization: `Bearer ${key}` }, body: {}, timeoutMs: 1000 }), (err) => {
      assert.ok(err instanceof AiError);
      assert.ok(!err.message.includes(key), err.message);
      assert.match(err.message, /\[key\]/);
      return true;
    });
  }
  const anthropic = async () => ({ ok: false, status: 500, text: async () => `oops ${key}` });
  await assert.rejects(postJson(anthropic, 'https://x.test/v1', { headers: { 'x-api-key': key }, body: {}, timeoutMs: 1000 }), (err) => !err.message.includes(key));
});

test('build gate G1: the embedding model and the speech model are fetched at a pinned revision, not main', async () => {
  const { WHISPER_REVISION } = await import('../src/speech/whisper.js');
  assert.match(WHISPER_REVISION, /^[0-9a-f]{40}$/);
  const worker = readFileSync(fileURLToPath(new URL('../src/brain/embed.worker.js', import.meta.url)), 'utf8');
  assert.match(worker, /const REVISION = '751bff37182d3f1213fa05d7196b954e230abad9'/);
  assert.match(worker, /revision: REVISION/);
  const whisper = readFileSync(fileURLToPath(new URL('../src/speech/whisper.js', import.meta.url)), 'utf8');
  assert.match(whisper, /revision: WHISPER_REVISION/);
});

test('gate R2-F1: transformers.js requests carry the pinned commit, not main', () => {
  const worker = readFileSync(fileURLToPath(new URL('../src/brain/embed.worker.js', import.meta.url)), 'utf8');
  const whisper = readFileSync(fileURLToPath(new URL('../src/speech/whisper.js', import.meta.url)), 'utf8');
  assert.match(worker, /remotePathTemplate = `\{model\}\/resolve\/\$\{REVISION\}\/`/);
  assert.match(whisper, /remotePathTemplate = `\{model\}\/resolve\/\$\{WHISPER_REVISION\}\/`/);
});
