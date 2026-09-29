// L4a v2: the on-device workers under the REAL page CSP (S2 report F2). v2-brain.mjs imports the brain from /LICENSE (a text page
// with no CSP); here it is imported from index.html's own page, so worker-src, script-src and connect-src apply. Own launcher
// (copied from v2-brain.mjs, which keeps WebGPU on and a fixed profile and port; the shared e2e/lib/cdp.mjs passes --disable-gpu).
// Reuses the model profile v2-brain.mjs --real-model leaves in $TMPDIR. Run outside the sandbox: node e2e/l4-v2-csp.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

let failed = 0;
const check = (id, name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `  ${detail}` : ''}`); if (!ok) failed += 1; };
const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const GPU_FLAGS = ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'];

// profile: a fixed folder name under the temp dir, kept between runs (model weights stay cached); port: fixed so the origin is stable.
async function launch({ gpu = false, profile = null, port: fixedPort = 0 } = {}) {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(repo, u === '/' ? 'index.html' : u);
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
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) problems.push(`console.error: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level) && !/favicon\.ico/.test(d.params.entry.url ?? '')) problems.push(`log.error: ${d.params.entry.text} ${d.params.entry.url ?? ''}`);
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


console.log(`model profile present: ${fs.existsSync(path.join(os.tmpdir(), 'tc-brain-model-profile'))}`);
const b = await launch({ gpu: true, profile: 'tc-brain-model-profile', port: 47831 });
await b.load('/index.html?capture=1');
await sleep(1500);
const csp = await b.ev(`document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? null`);
check('AC-B2.x', 'the page under test carries the app CSP', !!csp, (csp ?? 'no CSP').match(/worker-src[^;]*/)?.[0] ?? 'no worker-src');
const r = await b.ev(`(async () => {
  const { createBrain } = await import('/src/brain/index.js');
  const { createMemoryStore } = await import('/src/storage/memory.js');
  const { createSettingsApi } = await import('/src/storage/settings.js');
  const brain = createBrain({ store: createMemoryStore(), settings: createSettingsApi(localStorage), now: () => new Date(2026, 8, 29, 10, 0, 0) });
  await brain.ready;
  const out = {};
  const t0 = performance.now();
  try { await brain.prepare({ llm: true, embed: true }); out.prepared = true; } catch (e) { out.prepared = false; out.err = String(e?.message ?? e); }
  out.ms = Math.round(performance.now() - t0);
  out.status = brain.getStatus();
  try { const items = await brain.split('Call the dentist tomorrow at 9 and buy dog food', { source: 'typed' }); out.items = items.map((i) => [i.type, i.by]); } catch (e) { out.splitErr = String(e?.message ?? e); }
  return out;
})()`, 600000).catch((e) => ({ evalError: String(e.message) }));
console.log(JSON.stringify(r).slice(0, 500));
const cspErrors = b.problems.filter((p) => /Content Security Policy|Refused to|violat/i.test(p));
check('AC-B2.x', 'no Content-Security-Policy violation while both workers start under the page CSP', cspErrors.length === 0, cspErrors.slice(0, 2).join(' | '));
check('AC-B2.x', 'the language model reaches "ready" from the real page and the split uses the device', r?.status?.llm?.state === 'ready' && (r.items ?? []).some((i) => i[1] === 'device'), JSON.stringify({ llm: r?.status?.llm, items: r?.items, err: r?.err ?? r?.evalError }));
check('AC-B2.x', 'the embedder reaches "ready" from the real page', r?.status?.embed?.state === 'ready', JSON.stringify(r?.status?.embed));
await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
