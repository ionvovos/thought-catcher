// Headless Chrome driver used by the builder to check a change in a real browser (zero dependencies).
// Usage (outside the Bash sandbox): node e2e/l3-drive.mjs
// Serves the repo on 127.0.0.1, drives capture -> inbox -> reload, prints console problems and any non-local request.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const seen = [];
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(repo, u === '/' ? 'index.html' : u);
  if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { seen.push(`404 ${u}`); res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let port;
for (let i = 0; i < 100 && !port; i += 1) {
  await new Promise((r) => setTimeout(r, 100));
  try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* not yet */ }
}
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const problems = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') problems.push(`exception: ${d.params.exceptionDetails.exception?.description}`);
  if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) problems.push(`console.${d.params.type}: ${d.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  if (d.method === 'Log.entryAdded' && ['error', 'warning'].includes(d.params.entry.level)) problems.push(`log.${d.params.entry.level}: ${d.params.entry.text} ${d.params.entry.url ?? ''}`);
  if (d.method === 'Network.requestWillBeSent') seen.push(d.params.request.url);
};
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed');
  return r.result.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable');
async function load(url) { await send('Page.navigate', { url }); await sleep(900); }

const out = {};
await load(`${base}/?capture=1`);
out.title = await ev('document.title');
out.recordBtn = await ev(`(() => { const b = document.querySelector('.record-btn'); const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, focused: document.activeElement === b }; })()`);
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await sleep(200);
out.hScroll360 = await ev('document.documentElement.scrollWidth > document.documentElement.clientWidth');
await ev(`(() => { const f = document.getElementById('thought-text'); f.value = 'remind me to call mum at 6pm'; f.dispatchEvent(new Event('input')); f.form.requestSubmit(); })()`);
await sleep(500);
out.status = await ev(`document.getElementById('capture-status').textContent`);
out.fieldAfterSave = await ev(`document.getElementById('thought-text').value`);
await ev(`(() => { const f = document.getElementById('thought-text'); f.value = '   '; f.form.requestSubmit(); })()`);
await sleep(200);
out.emptyStatus = await ev(`document.getElementById('capture-status').textContent`);
await ev(`location.hash = '#/inbox'`); await sleep(500);
out.inbox = await ev(`document.querySelector('.app-main').innerText`);
await load(`${base}/#/inbox`);
out.afterReload = await ev(`document.querySelectorAll('.thought-item').length`);
for (const h of ['#/settings', '#/about', '#/review', '#/type/task', '#/type/reminder']) {
  await ev(`location.hash = '${h}'`); await sleep(500);
  out[h] = (await ev(`document.querySelector('.app-main').innerText`)).slice(0, 80).replace(/\n/g, ' | ');
}
console.log(JSON.stringify(out, null, 2));
console.log('PROBLEMS', JSON.stringify(problems, null, 2));
console.log('NON-LOCAL REQUESTS', JSON.stringify(seen.filter((u) => !u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('404')), null, 2));
console.log('404s', JSON.stringify(seen.filter((u) => u.startsWith('404'))));
ws.close(); chrome.kill(); server.close();
process.exit(problems.length ? 1 : 0);
