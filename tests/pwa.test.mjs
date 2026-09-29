import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel)); else out.push(rel);
  }
  return out;
}

test('manifest: required fields for install (AC-M1.2, AC-Q.6)', () => {
  assert.equal(manifest.name, 'Thought Catcher');
  assert.ok(manifest.short_name.length > 0 && manifest.short_name.length <= 12);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './?capture=1');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.id, './');
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.equal(manifest.background_color, manifest.theme_color, 'design.md 4: one value for both');
  assert.deepEqual(manifest.shortcuts.map((x) => x.name), ['Speak a thought', 'Type a thought']);
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.deepEqual(manifest.shortcuts.map((s) => s.url), ['./?capture=1&record=1', './?capture=1&type=1']);
});

test('manifest: every icon path is relative, exists, is a PNG of the declared size', () => {
  for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons ?? [])]) {
    assert.equal(icon.src.startsWith('/'), false, icon.src);
    const buf = fs.readFileSync(path.join(root, icon.src));
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.equal(buf.readUInt32BE(16), w, icon.src);
    assert.equal(buf.readUInt32BE(20), h, icon.src);
  }
  const apple = fs.readFileSync(path.join(root, 'icons/apple-touch-icon-180.png'));
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple[25], 2, 'opaque RGB: iOS fills transparent pixels with black');
});

test('.nojekyll exists and is empty', () => {
  assert.equal(fs.statSync(path.join(root, '.nojekyll')).size, 0);
});

const sw = read('sw.js');
const shell = [...sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL'))).matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);

// Files other shards own may land before `node tools/sync-precache.mjs` runs; they are reported, not failed, unless
// TC_STRICT=1 (release and L4 run strict). S1's own files are always strict.
const OTHER = /^\.\/(src\/(brain|core|storage|ui\/(library|detail|ask|review|onboarding|settings|about|views)|dev\/fixtures-s3)|css\/(library|detail|review|onboarding|settings))/;
const strict = process.env.TC_STRICT !== '0'; // strict by default now that every shard has landed

test('sw.js: precache list has only existing relative files and covers every file the browser loads', (t) => {
  const gone = shell.filter((f) => f !== './' && !fs.existsSync(path.join(root, f)));
  const loaded = [...walk('src'), ...walk('css'), ...walk('icons')].map((f) => `./${f}`);
  const missing = loaded.filter((f) => !shell.includes(f));
  const soft = [...gone, ...missing].filter((f) => OTHER.test(f));
  const hard = [...gone, ...missing].filter((f) => !OTHER.test(f) || strict);
  if (soft.length && !strict) t.diagnostic(`run node tools/sync-precache.mjs: ${soft.join(', ')}`);
  assert.deepEqual(hard, [], `run: node tools/sync-precache.mjs   (${hard.join(', ')})`);
  for (const f of ['./', './index.html', './manifest.webmanifest']) assert.ok(shell.includes(f), f);
  assert.equal(new Set(shell).size, shell.length, 'no duplicates');
});

test('index.html is served offline by the SW and VERSION is set', () => {
  assert.match(sw, /const VERSION = 'tc-v\d+'/);
  assert.ok(fs.existsSync(path.join(root, 'index.html')));
});

// Runs sw.js against stubs and returns the listeners plus what it did.
function loadSw({ cachesInit = {}, fetchImpl } = {}) {
  const listeners = {};
  const stores = new Map(Object.entries(cachesInit).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const log = { skipWaiting: 0, claim: 0, fetched: [] };
  const mkCache = (name) => ({
    async add(req) { const url = typeof req === 'string' ? req : req.url; stores.get(name).set(new URL(url, 'https://x.test/app/').href, { url, body: 'shell' }); },
    async put(req, res) { stores.get(name).set(new URL(req.url ?? req, 'https://x.test/app/').href, res); },
    async match(req) { return stores.get(name).get(new URL(req.url ?? req, 'https://x.test/app/').href); },
  });
  const caches = {
    async open(name) { if (!stores.has(name)) stores.set(name, new Map()); return mkCache(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(req) {
      for (const s of stores.values()) {
        const hit = s.get(new URL(req.url ?? req, 'https://x.test/app/').href) ?? s.get(new URL('./index.html', 'https://x.test/app/').href);
        if (hit && (typeof req === 'string' || req.mode === 'navigate' || s.has(new URL(req.url ?? req, 'https://x.test/app/').href))) return hit;
      }
      return undefined;
    },
  };
  const self = {
    location: { origin: 'https://x.test' },
    skipWaiting: async () => { log.skipWaiting += 1; },
    clients: { claim: async () => { log.claim += 1; } },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const ctx = {
    self, caches, URL,
    Request: class { constructor(url, init) { this.url = new URL(url, 'https://x.test/app/').href; Object.assign(this, init); } },
    fetch: async (req) => { log.fetched.push(req.url ?? req); return fetchImpl ? fetchImpl(req) : { ok: true, type: 'basic', clone() { return this; } }; },
  };
  vm.runInNewContext(sw, ctx);
  return { listeners, stores, log };
}

function fire(listeners, type, extra = {}) {
  let promise;
  const event = { waitUntil: (p) => { promise = p; }, respondWith: (p) => { promise = p; event.responded = true; }, ...extra };
  listeners[type](event);
  return { event, done: promise };
}

test('sw install: caches every shell file, then skipWaiting', async () => {
  const { listeners, stores, log } = loadSw();
  const { done } = fire(listeners, 'install');
  await done;
  assert.equal(log.skipWaiting, 1);
  assert.equal(stores.get('tc-v3').size, shell.length);
});

test('sw activate: deletes only old tc-* shell caches; the model caches and tc-cdn stay', async () => {
  const { listeners, stores, log } = loadSw({ cachesInit: { 'tc-v0': {}, 'tc-v1': {}, 'tc-v2': {}, 'tc-v3': {}, 'tc-cdn': {}, 'transformers-cache': {}, 'webllm/model': {}, 'webllm/wasm': {}, 'webllm/config': {}, other: {} } });
  await fire(listeners, 'activate').done;
  assert.deepEqual([...stores.keys()].sort(), ['other', 'tc-cdn', 'tc-v3', 'transformers-cache', 'webllm/config', 'webllm/model', 'webllm/wasm']);
  assert.equal(log.claim, 1);
});

test('sw fetch: not intercepted for non-GET, AI providers and other hosts', () => {
  const { listeners } = loadSw();
  const cases = [
    { method: 'POST', url: 'https://x.test/app/index.html', mode: 'cors' },
    { method: 'GET', url: 'https://api.anthropic.com/v1/messages', mode: 'cors' },
    { method: 'GET', url: 'https://api.openai.com/v1/chat/completions', mode: 'cors' },
    { method: 'GET', url: 'http://localhost:11434/v1/models', mode: 'cors' },
    { method: 'GET', url: 'https://huggingface.co/onnx-community/whisper-tiny/resolve/main/x.onnx', mode: 'cors' },
    { method: 'GET', url: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/x.wasm', mode: 'cors' },
  ];
  for (const request of cases) {
    const { event } = fire(listeners, 'fetch', { request });
    assert.equal(event.responded, undefined, `${request.method} ${request.url}`);
  }
});

test('sw fetch: navigation gets the cached index.html, same-origin files cache first, jsdelivr cached on first fetch', async () => {
  const { listeners, stores, log } = loadSw();
  await fire(listeners, 'install').done;
  const nav = fire(listeners, 'fetch', { request: { method: 'GET', url: 'https://x.test/app/?capture=1', mode: 'navigate' } });
  assert.equal(nav.event.responded, true);
  assert.equal((await nav.done).body, 'shell');
  assert.deepEqual(log.fetched.filter((u) => u.includes('capture=1')), [], 'no network for the cached shell');

  const asset = fire(listeners, 'fetch', { request: { method: 'GET', url: 'https://x.test/app/src/app.js', mode: 'cors' } });
  assert.equal((await asset.done).body, 'shell');

  const cdnUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/x.js';
  const first = fire(listeners, 'fetch', { request: { method: 'GET', url: cdnUrl, mode: 'cors' } });
  assert.equal(first.event.responded, true);
  await first.done;
  assert.ok(log.fetched.includes(cdnUrl));
  assert.ok(stores.get('tc-cdn').has(cdnUrl));
  const before = log.fetched.length;
  await fire(listeners, 'fetch', { request: { method: 'GET', url: cdnUrl, mode: 'cors' } }).done;
  assert.equal(log.fetched.length, before, 'second load comes from the cache');
});
