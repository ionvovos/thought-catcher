// v2 brain, headless Chrome (architecture section 7). Run outside the Bash sandbox, with network for the model checks:
//   node e2e/v2-brain.mjs            migration, no-WebGPU status, embeddings (real MiniLM: AC-X5.1, X6.1, X6.2)
//   node e2e/v2-brain.mjs --real-model   also loads the on-device language model with WebGPU (870 MB, one load, last)
// Its own launcher: the shared helper passes --disable-gpu, which removes the WebGPU adapter (spike-b2.md section 1).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const realModel = process.argv.includes('--real-model');
const GPU_FLAGS = ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'];

// profile: a fixed folder name under the temp dir, kept between runs (model weights stay cached); port: fixed so the origin is stable.
async function launch({ gpu = false, profile = null, port: fixedPort = 0 } = {}) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(repo, u === '/' ? 'LICENSE' : u);
    if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'text/plain' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => { server.listen(fixedPort, '127.0.0.1', r); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = profile ? path.join(os.tmpdir(), profile) : fs.mkdtempSync(path.join(os.tmpdir(), 'tc-brain-'));
  fs.mkdirSync(dir, { recursive: true });
  try { fs.unlinkSync(path.join(dir, 'DevToolsActivePort')); } catch { /* none */ }
  const flags = ['--headless=new', ...(gpu ? GPU_FLAGS : ['--disable-gpu']), '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'];
  const chrome = spawn(CHROME, flags, { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i += 1) { await sleep(100); try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* not yet */ } }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pending = new Map();
  const problems = [];
  const network = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
    if (d.method === 'Network.requestWillBeSent') network.push(d.params.request.url);
    if (d.method === 'Runtime.exceptionThrown') problems.push(`exception: ${d.params.exceptionDetails.exception?.description}`);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push(`console.error: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon\.ico/.test(d.params.entry.url ?? '')) problems.push(`log.error: ${d.params.entry.text} ${d.params.entry.url ?? ''}`);
  };
  const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
  return {
    base, problems, network, send,
    async ev(expression, timeout = 60000) {
      const r = await Promise.race([send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), sleep(timeout).then(() => ({ result: { exceptionDetails: { exception: { description: `timeout after ${timeout} ms` } } } }))]);
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
      return r.result.result.value;
    },
    async load(p) { await send('Page.navigate', { url: `${base}${p}` }); await sleep(500); },
    async close() { try { await send('Browser.close'); } catch { /* already closing */ } ws.close(); chrome.kill(); server.close(); await sleep(800); if (!profile) { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* a temp profile left behind is harmless */ } } },
  };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

// A v1 database exactly as build a999310 created it: version 1, `thoughts` with three indexes, `settings`.
const SEED_V1 = `(async (rows) => {
  await new Promise((res) => { const d = indexedDB.deleteDatabase('thought-catcher'); d.onsuccess = d.onerror = d.onblocked = () => res(); });
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('thought-catcher', 1);
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore('thoughts', { keyPath: 'id' });
      s.createIndex('by_type', 'type'); s.createIndex('by_created', 'created_at'); s.createIndex('by_due', 'due_at');
      r.result.createObjectStore('settings', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => { const tx = db.transaction(['thoughts', 'settings'], 'readwrite'); for (const t of rows) tx.objectStore('thoughts').put(t); tx.objectStore('settings').put({ key: 'schema.version', value: 1 }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return rows.length;
})`;

const v1Row = (i, patch = {}) => ({
  id: `t${i}`, text: `thought number ${i} about the gym`, type: ['idea', 'task', 'journal', 'reminder'][i % 4], title: `Thought ${i}`, tags: ['gym'],
  created_at: `2026-09-2${i}T09:00:00.000Z`, updated_at: `2026-09-2${i}T09:00:00.000Z`, source: i % 2 ? 'voice' : 'typed',
  sort: { by: i === 2 ? 'ai' : 'rules', confidence: 0.8, alt_type: null, model: i === 2 ? 'claude-x' : null },
  due_at: i % 4 === 3 ? '2026-10-02T15:00:00.000Z' : null, done: i === 1, done_at: i === 1 ? '2026-09-28T10:00:00.000Z' : null,
  clarify: { state: 'none', case: null, question: null, answer: null },
  expansion: i % 4 === 0 ? { next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'], generated_at: '2026-09-27T09:00:00.000Z', model: 'claude-x' } : null,
  review: { last_reviewed_at: i === 3 ? '2026-09-28T09:00:00.000Z' : null, snoozed_until: null, dismissed: i === 3 },
  ...patch,
});

async function migrationChecks() {
  const c = await launch();
  try {
    await c.load('/LICENSE');
    const good = Array.from({ length: 6 }, (_, i) => v1Row(i));
    const corrupt = v1Row(9, { type: 'note', title: '' });

    // AC-X10.1: success, N equals the v1 count, every v1 field kept, the unreadable row set aside
    await c.ev(`${SEED_V1}(${JSON.stringify([...good, corrupt])})`);
    const ok = await c.ev(`(async () => {
      const { createIdbStore } = await import('/src/storage/idb.js');
      const store = await createIdbStore(indexedDB);
      const all = (await store.getAll()).sort((a, b) => a.id.localeCompare(b.id));
      const q = await store.getQuarantined();
      const dbs = await indexedDB.databases();
      return { migration: store.migration, all, quarantined: q, version: dbs.find((d) => d.name === 'thought-catcher').version,
        idx: await new Promise((res) => { const r = indexedDB.open('thought-catcher'); r.onsuccess = () => { const t = r.result.transaction('thoughts'); const names = [...t.objectStore('thoughts').indexNames]; const stores = [...r.result.objectStoreNames]; r.result.close(); res({ names, stores }); }; }) };
    })()`);
    check('X10.1 migrated state, N = v1 count, one row set aside', ok.migration.state === 'migrated' && ok.migration.count === 6 && ok.migration.quarantined === 1 && !ok.migration.readOnly, JSON.stringify(ok.migration));
    check('X10.1 database is version 2 with embeddings, quarantine and by_origin', ok.version === 2 && ok.idx.stores.includes('embeddings') && ok.idx.stores.includes('quarantine') && ok.idx.names.includes('by_origin'), JSON.stringify(ok.idx));
    const same = ok.all.length === 6 && ok.all.every((t, i) => {
      const before = good[i];
      const { origin, best_guess: bg, plan, v, ...rest } = t;
      const expected = structuredClone(before);
      if (expected.sort.by === 'ai') expected.sort.by = 'key';
      return origin === null && bg === false && plan === null && v === 2 && JSON.stringify(rest) === JSON.stringify(expected);
    });
    check('X10.1 every v1 field kept (id, type, title, tags, dates, done, expansion, review); sort.by ai read as key', same);
    check('X10.1 the corrupt row is kept whole in quarantine and left out of thoughts', ok.quarantined.length === 1 && ok.quarantined[0].id === 't9' && !ok.all.some((t) => t.id === 't9'));

    // export carries quarantined, import ignores it
    const exp = await c.ev(`(async () => {
      const { createIdbStore } = await import('/src/storage/idb.js');
      const { buildExport, parseImport } = await import('/src/core/exportImport.js');
      const store = await createIdbStore(indexedDB);
      const file = JSON.stringify(buildExport(await store.getAll(), {}, new Date(), { quarantined: await store.getQuarantined() }));
      const parsed = parseImport(file);
      await store.clear();
      return { version: JSON.parse(file).version, quarantined: JSON.parse(file).quarantined.length, ok: parsed.ok, n: parsed.data.thoughts.length, after: (await store.getAll()).length, qAfter: (await store.getQuarantined()).length };
    })()`);
    check('X10.3 export v2 carries the quarantined row, import reads it back, clear() empties thoughts and quarantine', exp.version === 2 && exp.quarantined === 1 && exp.ok && exp.n === 6 && exp.after === 0 && exp.qAfter === 0, JSON.stringify(exp));

    // a version 1 export file imports in v2
    const v1file = await c.ev(`(async () => {
      const { parseImport } = await import('/src/core/exportImport.js');
      const rows = ${JSON.stringify([...good, corrupt])};
      const r = parseImport(JSON.stringify({ format: 'thought-catcher-export', version: 1, exported_at: '2026-09-28T10:00:00.000Z', app_version: '1.0.1', settings: {}, thoughts: rows }));
      return { ok: r.ok, n: r.data.thoughts.length, skipped: r.skipped };
    })()`);
    check('X10.3 a v1 export file imports (6 rows read, 1 unreadable row skipped and counted)', v1file.ok && v1file.n === 6 && v1file.skipped === 1, JSON.stringify(v1file));

    // AC-X10.2: a failing upgrade leaves v1 untouched, read-only, export still works
    await c.ev(`${SEED_V1}(${JSON.stringify(good)})`);
    const failed = await c.ev(`(async () => {
      const { createIdbStore } = await import('/src/storage/idb.js');
      const { upgradeThought } = await import('/src/core/migrate.js');
      const { buildExport } = await import('/src/core/exportImport.js');
      const store = await createIdbStore(indexedDB, { upgrade: (row) => { if (row.id === 't3') throw new Error('injected request failure'); return upgradeThought(row); } });
      const dbs = await indexedDB.databases();
      const all = (await store.getAll()).sort((a, b) => a.id.localeCompare(b.id));
      let writeError = null;
      try { await store.put({ id: 'x', text: 'x' }); } catch (e) { writeError = e.message; }
      const exported = buildExport(all, {}, new Date());
      return { migration: store.migration, version: dbs.find((d) => d.name === 'thought-catcher').version, all, writeError, exportedCount: exported.thoughts.length };
    })()`);
    check('X10.2 failed upgrade: state failed and read-only', failed.migration.state === 'failed' && failed.migration.readOnly === true, JSON.stringify(failed.migration));
    check('X10.2 database stays at version 1 with every row byte-equal', failed.version === 1 && JSON.stringify(failed.all) === JSON.stringify(good), `version ${failed.version}`);
    check('X10.2 writes reject with read-only; export still works on the v1 rows', failed.writeError === 'read-only' && failed.exportedCount === 6, `${failed.writeError}, exported ${failed.exportedCount}`);

    // and a later launch with a healthy upgrader migrates it (nothing was lost by the abort)
    const retry = await c.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); return { m: s.migration, n: (await s.getAll()).length }; })()`);
    check('X10.2 the next launch migrates the same database', retry.m.state === 'migrated' && retry.n === 6, JSON.stringify(retry));

    // embedding rows live in the same database: stored as Float32Array, removed with their thought, emptied by clear()
    const emb = await c.ev(`(async () => {
      const { createIdbStore } = await import('/src/storage/idb.js');
      const s = await createIdbStore(indexedDB);
      const events = []; const off = s.onChange((e) => events.push(e.kind + ':' + e.ids.join('+')));
      await s.putEmbedding({ id: 't1', model: 'm', hash: 'h', vec: Float32Array.from([0.5, 0.25]) });
      await s.putEmbedding({ id: 't2', model: 'm', hash: 'h', vec: Float32Array.from([1, 0]) });
      const row = await s.getEmbedding('t1');
      await s.delete('t1');
      const afterDelete = (await s.getAllEmbeddings()).map((r) => r.id);
      await s.deleteMany(['t2']);
      await s.putMany([{ id: 'x', text: 'x' }]);
      await s.clear();
      off();
      return { isF32: row.vec instanceof Float32Array, len: row.vec.length, afterDelete, afterClear: (await s.getAllEmbeddings()).length, events };
    })()`);
    check('embedding rows: Float32Array round trip, removed with their thought, emptied by clear(); onChange fires after each write', emb.isF32 && emb.len === 2 && JSON.stringify(emb.afterDelete) === '["t2"]' && emb.afterClear === 0 && emb.events.join(',') === 'delete:t1,delete:t2,put:x,clear:', JSON.stringify(emb));

    // a brand new profile
    await c.ev(`new Promise((res) => { const d = indexedDB.deleteDatabase('thought-catcher'); d.onsuccess = d.onerror = d.onblocked = () => res(); })`);
    const fresh = await c.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); await s.put({ id: 'a', text: 'a', origin: { id: 'o', index: 1, count: 2 } }); await s.put({ id: 'b', text: 'b', origin: { id: 'o', index: 0, count: 2 } }); return { m: s.migration, byOrigin: (await s.getByOrigin('o')).map((t) => t.id) }; })()`);
    check('fresh install: state none, getByOrigin sorted by index', fresh.m.state === 'none' && JSON.stringify(fresh.byOrigin) === '["b","a"]', JSON.stringify(fresh));
    check('migration flows: no console error or exception', c.problems.length === 0, c.problems.join(' | '));
  } finally { await c.close(); }
}

async function noWebGpuChecks() {
  const c = await launch({ gpu: false });
  try {
    await c.load('/LICENSE');
    const r = await c.ev(`(async () => {
      const { createBrain } = await import('/src/brain/index.js');
      const { createMemoryStore } = await import('/src/storage/memory.js');
      const { createSettingsApi } = await import('/src/storage/settings.js');
      const brain = createBrain({ store: createMemoryStore(), settings: createSettingsApi(localStorage) });
      const events = []; brain.addEventListener('status', (e) => events.push(e.detail.llm.state));
      await brain.ready;
      const status = brain.getStatus();
      const items = await brain.split('Remind me on Friday at 6pm to send the invoice to Maria. Buy milk.');
      return { status, items: items.map((i) => [i.type, i.by]), events, gpu: !!navigator.gpu };
    })()`);
    check('B2.4 with WebGPU off the model is not-supported (no-webgpu), engine is rules, embeddings are offered', r.status.llm.state === 'not-supported' && r.status.llm.reason === 'no-webgpu' && r.status.engine === 'rules' && r.status.embed.state === 'not-downloaded', JSON.stringify(r.status));
    check('B1.1 split works with no model and no key in the browser', r.items.length === 2 && r.items.every(([, by]) => by === 'rules'), JSON.stringify(r.items));
    check('no-WebGPU flow: no console error', c.problems.length === 0, c.problems.join(' | '));
  } finally { await c.close(); }
}

async function embeddingChecks() {
  const c = await launch({ gpu: false });
  try {
    await c.load('/LICENSE');
    const { THOUGHTS, QUESTIONS_MEANING, RELATED_PAIRS, TOPIC_IDEAS, TOPIC_EXPECTED } = await import('../tests/fixtures/corpus.js');
    const out = await c.ev(`(async () => {
      const { createBrain } = await import('/src/brain/index.js');
      const { createMemoryStore } = await import('/src/storage/memory.js');
      const { createSettingsApi } = await import('/src/storage/settings.js');
      const { newThought } = await import('/src/core/model.js');
      const NOW = new Date(2026, 8, 29, 10, 0, 0);
      const mk = (t) => newThought({ text: t.text, id: t.id, now: NOW, sortResult: { type: t.type, title: t.text.slice(0, 50), tags: [], confidence: 0.9, alt_type: null, due_at: null } });
      const settings = createSettingsApi(localStorage);
      const store = createMemoryStore();
      const brain = createBrain({ store, settings, now: () => NOW });
      await brain.ready;
      await store.putMany(${JSON.stringify(THOUGHTS)}.map(mk));
      const states = []; brain.addEventListener('status', (e) => states.push(e.detail.embed.state + (e.detail.embed.pct !== undefined ? ':' + e.detail.embed.pct : '')));
      const t0 = performance.now();
      await brain.prepare({ embed: true });
      const loadMs = Math.round(performance.now() - t0);
      const status = brain.getStatus();
      await brain.reindex();
      const rows = await store.getAllEmbeddings();
      const asks = [];
      for (const [q, relevant] of ${JSON.stringify(QUESTIONS_MEANING)}) {
        const s = performance.now();
        const a = await brain.ask(q);
        asks.push({ q, relevant, got: a.sources.map((x) => [x.id, +x.score.toFixed(3)]), mode: a.mode, ms: Math.round(performance.now() - s), answer: a.answer });
      }
      const none = await brain.ask('what is the capital of Australia and who founded it?');
      const rel = [];
      for (const [a, b] of ${JSON.stringify(RELATED_PAIRS)}) rel.push({ a, b, got: (await brain.related(a, 3)).map((x) => [x.id, +x.score.toFixed(3)]) });
      const self = (await brain.related('g1', 3)).some((x) => x.id === 'g1');
      // topics on a separate store
      const store2 = createMemoryStore();
      const brain2 = createBrain({ store: store2, settings, now: () => NOW });
      await brain2.ready;
      await brain2.prepare({ embed: true });
      await store2.putMany(${JSON.stringify(TOPIC_IDEAS)}.map((t) => ({ ...mk(t), type: 'idea' })));
      await brain2.reindex();
      const topics = await brain2.topics();
      // score ladder for tuning
      return { loadMs, status, states, rows: rows.length, dims: rows[0]?.vec.length, asks, none: { answer: none.answer, sources: none.sources }, rel, self, topics };
    })()`, 240000);
    check('B2.2/B2.3 embeddings load after prepare({ embed: true }): downloading with progress, then ready', out.status.embed.state === 'ready' && out.states.some((s) => s.startsWith('downloading')) , `load ${out.loadMs} ms; ${[...new Set(out.states)].join(', ')}`);
    check('embedding rows exist for every thought, 384 dims', out.rows === THOUGHTS.length && out.dims === 384, `${out.rows} rows, ${out.dims} dims`);
    const hits = out.asks.filter((a) => a.got.some(([id]) => a.relevant.includes(id)));
    check('AC-X5.1 real MiniLM: relevant thought in the top 3 for at least 8 of 10 questions', hits.length >= 8, `${hits.length}/10`);
    for (const a of out.asks) if (!a.got.some(([id]) => a.relevant.includes(id))) console.log('  miss:', a.q, JSON.stringify(a.got), 'wanted', a.relevant.join(','));
    check('AC-X5.2 an unrelated question cites nothing and says so', out.none.sources.length === 0 && out.none.answer === "I couldn't find anything about that.", JSON.stringify(out.none));
    const relHits = out.rel.filter((r) => r.got.some(([id]) => id === r.b));
    check('AC-X6.1 real MiniLM: partner in the top 3 related for at least 80% of pairs; never itself', relHits.length / out.rel.length >= 0.8 && !out.self, `${relHits.length}/${out.rel.length}`);
    for (const r of out.rel) if (!r.got.some(([id]) => id === r.b)) console.log('  miss:', r.a, '->', r.b, JSON.stringify(r.got));
    const groups = out.topics.map((t) => t.ids.slice().sort().join(','));
    const wanted = TOPIC_EXPECTED.map((g) => g.slice().sort().join(','));
    check('AC-X6.2 real MiniLM: the 3 topics are formed, nothing unrelated inside, each has a label', out.topics.length === 3 && wanted.every((w) => groups.includes(w)) && out.topics.every((t) => t.label), JSON.stringify(out.topics));
    console.log('  ask timings (ms):', out.asks.map((a) => a.ms).join(' '));
    console.log('  ask scores:', out.asks.map((a) => `${a.q} => ${a.got.map((g) => g.join(':')).join(' ')}`).join('\n              '));
    check('embedding flow: no console error', c.problems.length === 0, c.problems.join(' | '));
  } finally { await c.close(); }
}


// Tuning aid for src/core/vector.js constants: raw cosine scores with the real model, no thresholds. `--only=probe`.
async function probeScores() {
  const c = await launch({ gpu: false });
  try {
    await c.load('/LICENSE');
    const { THOUGHTS, QUESTIONS_MEANING, QUESTIONS_LEXICAL, RELATED_PAIRS, TOPIC_IDEAS, TOPIC_EXPECTED } = await import('../tests/fixtures/corpus.js');
    const out = await c.ev(`(async () => {
      const { createEmbedHost } = await import('/src/brain/embedder.js');
      const { cosine, embedText } = await import('/src/core/vector.js');
      const { makeTitle } = await import('/src/core/model.js');
      const host = createEmbedHost();
      await host.load({});
      const th = ${JSON.stringify(THOUGHTS)}.map((t) => ({ ...t, title: makeTitle(t.text) }));
      const vecs = await host.embed(th.map(embedText));
      const byId = Object.fromEntries(th.map((t, i) => [t.id, vecs[i]]));
      const qs = [...${JSON.stringify(QUESTIONS_MEANING)}, ...${JSON.stringify(QUESTIONS_LEXICAL)}, ['what is the capital of Australia?', []], ['how do I bake bread?', []], ['tell me about quantum physics', []]];
      const qv = await host.embed(qs.map((q) => q[0]));
      const asks = qs.map(([q, rel], i) => ({ q, rel, top: th.map((t, j) => [t.id, +cosine(qv[i], vecs[j]).toFixed(3)]).sort((a, b) => b[1] - a[1]).slice(0, 5) }));
      const pairs = ${JSON.stringify(RELATED_PAIRS)}.map(([a, b]) => ({ a, b, score: +cosine(byId[a], byId[b]).toFixed(3), otherTop: th.filter((t) => t.id !== a).map((t) => [t.id, +cosine(byId[a], byId[t.id]).toFixed(3)]).sort((x, y) => y[1] - x[1]).slice(0, 4) }));
      const ti = ${JSON.stringify(TOPIC_IDEAS)}.map((t) => ({ ...t, title: makeTitle(t.text) }));
      const tv = await host.embed(ti.map(embedText));
      const groupOf = (id) => ${JSON.stringify(TOPIC_EXPECTED)}.findIndex((g) => g.includes(id));
      let inMin = 1; let outMax = -1; const inAll = []; const outTop = [];
      for (let i = 0; i < ti.length; i += 1) for (let j = i + 1; j < ti.length; j += 1) {
        const sc = cosine(tv[i], tv[j]); const gi = groupOf(ti[i].id); const gj = groupOf(ti[j].id);
        if (gi >= 0 && gi === gj) { inMin = Math.min(inMin, sc); inAll.push(+sc.toFixed(3)); } else { outMax = Math.max(outMax, sc); outTop.push([ti[i].id, ti[j].id, +sc.toFixed(3)]); }
      }
      outTop.sort((a, b) => b[2] - a[2]);
      return { asks, pairs, topic: { inMin: +inMin.toFixed(3), outMax: +outMax.toFixed(3), inAll: inAll.sort(), outTop: outTop.slice(0, 6) } };
    })()`, 240000);
    for (const a of out.asks) console.log(`ASK ${a.q}  [want ${a.rel.join(',')}]  ${a.top.map((t) => t.join(':')).join(' ')}`);
    for (const p of out.pairs) console.log(`PAIR ${p.a}-${p.b} ${p.score}   ${p.a} top: ${p.otherTop.map((t) => t.join(':')).join(' ')}`);
    console.log('TOPIC', JSON.stringify(out.topic));
  } finally { await c.close(); }
}

const MODEL_PROFILE = 'tc-brain-model-profile'; // kept between runs: WebLLM caches the weights in this profile
const MODEL_PORT = 47831; // fixed: Cache Storage and localStorage belong to the origin, port included

async function realModelChecks() {
  const { RAMBLES } = await import('../tests/fixtures/rambles.js');
  const rambles = RAMBLES.map((r) => ({ note: r.note, n: r.items.length, types: r.items.map((i) => i.type) }));
  const setup = `
      const { createBrain } = await import('/src/brain/index.js');
      const { createDeviceHost } = await import('/src/brain/device.js');
      const { createMemoryStore } = await import('/src/storage/memory.js');
      const { createSettingsApi } = await import('/src/storage/settings.js');
      const NOW = new Date(2026, 8, 29, 10, 0, 0);
      const host = createDeviceHost();
      const raw = []; const g = host.generate.bind(host);
      host.generate = async (m, o) => { const t = await g(m, o); raw.push(t); return t; };
      const brain = createBrain({ store: createMemoryStore(), settings: createSettingsApi(localStorage), now: () => NOW, llm: host });
      const states = []; brain.addEventListener('status', (e) => states.push(e.detail.llm.state));
  `;
  const runRambles = `
      const runs = [];
      for (const r of ${JSON.stringify(rambles)}) {
        const s = performance.now(); const before = raw.length;
        const items = await brain.split(r.note, { source: 'typed' });
        runs.push({ n: r.n, types: r.types, raw: raw.slice(before), got: items.map((i) => [i.type, i.by, i.confidence, i.title, i.due_at && i.due_at.slice(0, 16), i.question && i.question.case]), ms: Math.round(performance.now() - s) });
      }
  `;
  const otherCalls = `
      const timed = async (fn) => { const s = performance.now(); try { const v = await fn(); return { ok: true, v, ms: Math.round(performance.now() - s) }; } catch (e) { return { ok: false, err: (e.kind ?? '') + ' ' + e.message, ms: Math.round(performance.now() - s) }; } };
      const { newThought } = await import('/src/core/model.js');
      const mk = (id, type, text) => newThought({ text, id, now: NOW, sortResult: { type, title: text.slice(0, 50), tags: [], confidence: 0.9, alt_type: null, due_at: null } });
      const idea = mk('i1', 'idea', 'a gym app that shows a streak calendar and rewards a full week');
      const task = mk('t1', 'task', 'pay the electricity bill before the 5th');
      const other = {};
      other.classify = await Promise.all(['what if we made a shared shopping list for the flat', 'remind me tomorrow at 9 to send the invoice to Maria', 'felt really tired today but the walk helped', 'buy dog food'].map((t) => timed(() => brain.classify(t).then((i) => [i.type, i.by, i.confidence, i.title, i.due_at && i.due_at.slice(0, 16)]))));
      other.expand = await timed(() => brain.expand(idea));
      other.plan = await timed(() => brain.plan(task));
      const store = createMemoryStore();
      const brain2 = createBrain({ store, settings: createSettingsApi(localStorage), now: () => NOW, llm: host });
      await brain2.ready;
      await store.putMany([mk('a', 'journal', 'go back to the gym, I keep skipping it and I feel worse'), mk('b', 'idea', 'gym app streak calendar'), mk('c', 'task', 'pay the electricity bill before the 5th')]);
      await brain2.prepare({ embed: true });
      other.ask = await timed(() => brain2.ask('what did I say about the gym?'));
      other.askNone = await timed(() => brain2.ask('what did I say about my holiday in Japan?'));
  `;
  // launch 1: consent, download, load, ten rambles
  const c = await launch({ gpu: true, profile: MODEL_PROFILE, port: MODEL_PORT });
  try {
    await c.load('/LICENSE');
    const out = await c.ev(`(async () => {
      ${setup}
      await brain.ready;
      const first = brain.getStatus();
      await c.__noop;
      const t0 = performance.now();
      await brain.prepare({ llm: true });
      const loadMs = Math.round(performance.now() - t0);
      const status = brain.getStatus();
      ${runRambles}
      ${otherCalls}
      return { first, loadMs, status, states: [...new Set(states)], runs, other };
    })()`.replace('await c.__noop;', ''), 900000);
    const wasCached = out.first.llm.state !== 'not-downloaded';
    check('B2 real model: capability ok, prepare downloads (first launch) and reaches ready', out.status.llm.state === 'ready' && (out.states.includes('downloading') || out.states.includes('loading')), `first ${out.first.llm.state}; load ${Math.round(out.loadMs / 1000)} s; states ${out.states.join(',')}${wasCached ? ' (profile already cached)' : ''}`);
    const counted = out.runs.filter((r) => r.got.length === r.n);
    const modelUsed = out.runs.filter((r) => r.got.some(([, by]) => by === 'device'));
    const typed = out.runs.flatMap((r) => (r.got.length === r.n ? r.got.map(([t], i) => t === r.types[i]) : []));
    check('B2 real model: at least 8 of 10 rambles give the expected item count', counted.length >= 8, `${counted.length}/${out.runs.length}; model answered ${modelUsed.length}; item types right ${typed.filter(Boolean).length}/${typed.length} in the counted rambles`);
    out.runs.forEach((r, i) => {
      const bad = r.got.length !== r.n;
      console.log(`  ${bad ? 'MISS' : 'ok  '} #${i + 1} ${r.ms} ms want ${r.n} ${r.types.join('/')} got ${JSON.stringify(r.got)}`);
      if (bad || process.argv.includes('--raw')) console.log(`        raw: ${r.raw.join(' || ').replace(/\s+/g, ' ').slice(0, 900)}`);
    });
    const o = out.other;
    const line = (name, r) => console.log(`  ${name}: ${r.ok ? JSON.stringify(r.v).slice(0, 700) : `ERROR ${r.err}`} (${r.ms} ms)`);
    o.classify.forEach((r, i) => line(`classify ${i + 1}`, r));
    line('expand', o.expand); line('plan', o.plan); line('ask', o.ask); line('ask (nothing)', o.askNone);
    check('B2 real model: classify, expand and plan return valid results', o.classify.every((r) => r.ok) && o.expand.ok && o.plan.ok, `classify ${o.classify.filter((r) => r.ok).length}/4, expand ${o.expand.ok}, plan ${o.plan.ok}`);
    check('B2/X5 real model + real embeddings: ask cites the gym thoughts with a model-written answer; a question with no match cites nothing', o.ask.ok && o.ask.v.mode === 'meaning' && o.ask.v.sources.length >= 1 && o.ask.v.by === 'device' && o.askNone.ok && o.askNone.v.sources.length === 0, o.ask.ok ? `by ${o.ask.v.by}, ${o.ask.v.sources.length} sources` : o.ask.err);
    check('real-model flow: no console error', c.problems.length === 0, c.problems.join(' | '));
  } finally { await c.close(); }

  // launch 2 (AC-B2.3): same profile, the model was downloaded and agreed to: it loads from cache by itself, with no model request
  const d = await launch({ gpu: true, profile: MODEL_PROFILE, port: MODEL_PORT });
  try {
    await d.load('/LICENSE');
    const t0 = Date.now();
    const out = await d.ev(`(async () => {
      ${setup}
      await brain.ready;
      const status = brain.getStatus();
      const items = await brain.split('Buy milk tomorrow and remind me at 6pm to call mum', { source: 'typed' });
      return { status, states: [...new Set(states)], by: items.map((i) => [i.type, i.by]) };
    })()`, 300000);
    const hosts = d.network.map((u) => new URL(u).host).filter((h) => !h.startsWith('127.0.0.1'));
    const modelHosts = hosts.filter((h) => /huggingface|hf\.co|githubusercontent/.test(h));
    check('B2.3 second launch: loads from cache without asking, no request to the model hosts', out.status.llm.state === 'ready' && out.states.includes('loading') && modelHosts.length === 0, `${out.states.join(',')}; ${Math.round((Date.now() - t0) / 1000)} s; model-host requests ${modelHosts.length}; other hosts ${[...new Set(hosts)].join(', ')}`);
    check('B2 second launch: the model answers the split', out.by.some(([, by]) => by === 'device'), JSON.stringify(out.by));
    check('second-launch flow: no console error', d.problems.length === 0, d.problems.join(' | '));
  } finally { await d.close(); }
}


// Prints raw model replies for prompt work (cached model profile). `--real-model --only=rawprompts`.
async function rawPrompts() {
  const c = await launch({ gpu: true, profile: MODEL_PROFILE, port: MODEL_PORT });
  try {
    await c.load('/LICENSE');
    const out = await c.ev(`(async () => {
      const { createDeviceHost } = await import('/src/brain/device.js');
      const P = await import('/src/brain/prompts.js');
      const host = createDeviceHost();
      await host.load({});
      const run = async (p, max = 400) => host.generate(P.asMessages(p), { maxTokens: max, timeoutMs: 40000 });
      const tasks = ['pay the electricity bill before the 5th', 'book flights to Berlin for March', 'renew my passport', 'clean the flat before the guests arrive on Saturday'];
      const res = { plan: [], classify: [] };
      for (const t of tasks) res.plan.push(await run(P.planPrompt({ text: t, title: t }), 600));
      for (const t of ['felt really tired today but the walk helped', 'buy dog food', 'what if we made a shared shopping list']) res.classify.push(await run(P.classifyPrompt(t), 200));
      return res;
    })()`, 600000);
    console.log(JSON.stringify(out, null, 1));
  } finally { await c.close(); }
}

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
const steps = { migration: migrationChecks, gpu: noWebGpuChecks, embed: embeddingChecks };
if (only === 'probe') await probeScores();
else for (const [name, fn] of Object.entries(steps)) if (!only || only === name) await fn();
if (realModel && only === 'rawprompts') await rawPrompts();
else if (realModel && (!only || only === 'model')) await realModelChecks();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
