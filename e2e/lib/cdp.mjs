// Zero-dependency helper: static server for the repo (plus an optional API handler), headless Chrome, DevTools protocol.
// Run scripts that use it outside the Bash sandbox (Chrome cannot create its profile socket inside it).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const repo = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

// apiHandler(req, res, body) returns true when it handled the request (used for a mock AI endpoint under /v1).
export async function launch({ apiHandler, chromeArgs = [] } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (req.method !== 'GET' && apiHandler) {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { requests.push({ method: req.method, url: u, body }); apiHandler(req, res, body); });
      return;
    }
    const f = path.join(repo, u === '/' ? 'index.html' : u);
    if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { requests.push({ method: 'GET', url: u, status: 404 }); res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', ...chromeArgs, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i += 1) {
    await sleep(100);
    try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* not yet */ }
  }
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
    if (d.method === 'Runtime.exceptionThrown') problems.push(`exception: ${d.params.exceptionDetails.exception?.description}`);
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) problems.push(`console.${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) problems.push(`log.${d.params.entry.level}: ${d.params.entry.text} ${d.params.entry.url ?? ''}`);
    if (d.method === 'Network.requestWillBeSent') network.push(d.params.request.url);
  };
  const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
    return r.result.result.value;
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable');
  return {
    base, requests, problems, network, send, ev,
    async load(url, wait = 900) { await send('Page.navigate', { url }); await sleep(wait); },
    // wait until `expression` is truthy, up to ms
    async until(expression, ms = 5000) {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (await ev(expression)) return true; await sleep(100); }
      return false;
    },
    async close() { ws.close(); chrome.kill(); server.close(); },
  };
}
