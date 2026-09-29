// Shared harness for the browser checks (e2e/smoke.mjs, e2e/flows.mjs): a node:http static server, headless Chrome over the
// DevTools protocol, a check log. Zero dependencies. Chrome only starts outside the Bash sandbox.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const ALLOW_PENDING = process.env.SMOKE_ALLOW_PENDING === '1';
export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// ---- check log ----
export const results = [];
export function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  return !!ok;
}
export function pending(name, detail) {
  results.push({ name, ok: true, pending: true, detail });
  console.log(`PEND  ${name}  (${detail})`);
}
export function finish(server) {
  server?.close();
  const failed = results.filter((r) => !r.ok);
  const pend = results.filter((r) => r.pending);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${failed.length} failed, ${pend.length} pending`);
  process.exit(failed.length ? 1 : 0);
}

// ---- static server over the repo root; records every request ----
export async function startServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(repo, u === '/' ? 'index.html' : u);
    if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      requests.push({ url: u, status: 404 });
      res.writeHead(404); res.end('not found'); return;
    }
    requests.push({ url: u, status: 200 });
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, origin: new URL(base).host, requests, close: () => server.close() };
}

// ---- one headless Chrome page ----
export async function openChrome() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; set CHROME`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-e2e-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 150 && !port; i += 1) {
    await sleep(100);
    try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* not ready */ }
  }
  if (!port) { proc.kill(); throw new Error('Chrome did not open a DevTools port (run outside the sandbox)'); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let id = 0;
  const waiting = new Map();
  const page = { problems: [], hosts: new Set(), urls: [], dir };
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); return; }
    const p = d.params;
    if (d.method === 'Runtime.exceptionThrown') page.problems.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`);
    else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(p.type)) page.problems.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    else if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(p.entry.level)) page.problems.push(`log.${p.entry.level}: ${p.entry.text} ${p.entry.url ?? ''}`);
    else if (d.method === 'Network.requestWillBeSent') {
      const u = p.request.url;
      page.urls.push(u);
      if (!/^(data|blob|about|chrome-extension):/.test(u)) page.hosts.add(new URL(u).host);
    }
  };
  page.send = (method, params = {}) => new Promise((r) => { const n = (id += 1); waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  page.ev = async (expression) => {
    const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result?.result?.value;
  };
  page.waitFor = async (expression, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await page.ev(expression)) return true; } catch { /* page navigating */ }
      await sleep(50);
    }
    return false;
  };
  // Always leave the page first: navigating to the same URL with another hash would only fire hashchange, not a load.
  page.goto = async (url) => {
    await page.send('Page.navigate', { url: 'about:blank' });
    await page.waitFor('location.href === "about:blank"');
    await page.send('Page.navigate', { url });
    await page.waitFor(`location.href.startsWith(${JSON.stringify(url.split('#')[0])}) && document.readyState === "complete"`);
  };
  page.route = async (hash) => { await page.ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(80); };
  page.key = async (key, opts = {}) => {
    const k = { key, code: opts.code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key), windowsVirtualKeyCode: opts.vk ?? key.toUpperCase().charCodeAt(0) };
    await page.send('Input.dispatchKeyEvent', { type: opts.text ? 'keyDown' : 'rawKeyDown', ...k, ...(opts.text ? { text: opts.text } : {}), ...(opts.modifiers ? { modifiers: opts.modifiers } : {}) });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
  };
  // Focus a field by selector and type into it with real input events.
  page.type = async (selector, text) => {
    await page.ev(`(() => { const n = document.querySelector(${JSON.stringify(selector)}); n.focus(); if (n.select) n.select(); })()`);
    await page.send('Input.insertText', { text });
  };
  page.click = (selector) => page.ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  page.exists = (selector) => page.ev(`!!document.querySelector(${JSON.stringify(selector)})`);
  page.text = (selector) => page.ev(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  // Run this script in every new document before the app's own scripts.
  page.addInit = (source) => page.send('Page.addScriptToEvaluateOnNewDocument', { source });
  page.viewport = (v) => page.send('Emulation.setDeviceMetricsOverride', { ...v, deviceScaleFactor: v.mobile ? 2 : 1, mobile: !!v.mobile });
  page.offline = (on) => page.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  page.setFiles = async (selector, files) => {
    const doc = await page.send('DOM.getDocument', { depth: 0 });
    const q = await page.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector });
    await page.send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files });
  };
  page.idbAll = () => page.ev(`(async () => (await (await import('/src/storage/idb.js')).createIdbStore(indexedDB)).getAll())()`);
  page.close = () => { try { ws.close(); } catch { /* closed */ } proc.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
  await page.send('Runtime.enable'); await page.send('Log.enable'); await page.send('Network.enable'); await page.send('Page.enable'); await page.send('DOM.enable');
  return page;
}

export const isFavicon = (x) => /favicon\.ico/.test(x);
