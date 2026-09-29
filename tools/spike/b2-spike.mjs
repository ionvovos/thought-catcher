// B2 spike driver: one model per run, headless Chrome with WebGPU, records timings, bytes per host and peak memory.
// Usage (outside the Bash sandbox, needs the network):
//   node tools/spike/b2-spike.mjs <webllm|tjs|embed> <model id> [webgpu|wasm] [dtype] [--fresh] [--no-gpu]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const [lib, model, device = 'webgpu', dtype = 'q4f16'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fresh = process.argv.includes('--fresh');
const rambles = Number(process.argv.find((a) => a.startsWith('--rambles='))?.split('=')[1] ?? 5);
const noGpu = process.argv.includes('--no-gpu');
const page = process.argv.find((a) => a.startsWith('--page='))?.split('=')[1] ?? 'b2.html';
const slug = `${page === 'b2.html' ? '' : 'csp-'}${lib}-${model.replace(/[^\w.-]+/g, '_')}-${device}-${dtype}${noGpu ? '-nogpu' : ''}`;

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(repo, u);
  if (!f.startsWith(repo) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
const base = `http://127.0.0.1:${server.address().port}`;
const profiles = path.join(os.tmpdir(), 'tc-spike-profiles');
fs.mkdirSync(profiles, { recursive: true });
const dir = fresh ? fs.mkdtempSync(path.join(profiles, 'fresh-')) : path.join(profiles, slug);
fs.mkdirSync(dir, { recursive: true });
try { fs.unlinkSync(path.join(dir, 'DevToolsActivePort')); } catch { /* none */ }
const gpuFlags = noGpu ? ['--disable-gpu'] : ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'];
const flags = ['--headless=new', ...gpuFlags, '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'];
const chrome = spawn(CHROME, flags, { stdio: 'ignore' });

// peak resident memory of Chrome's whole process tree (GPU process included), sampled every 500 ms
let peakMb = 0;
const sampler = setInterval(() => {
  try {
    const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss=']).toString().trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number));
    const tree = new Set([chrome.pid]);
    for (let grew = true; grew;) { grew = false; for (const [p, pp] of rows) if (tree.has(pp) && !tree.has(p)) { tree.add(p); grew = true; } }
    const mb = rows.filter(([p]) => tree.has(p)).reduce((a, [, , rss]) => a + rss, 0) / 1024;
    peakMb = Math.max(peakMb, mb);
  } catch { /* ps failed once */ }
}, 500);

let port;
for (let i = 0; i < 100 && !port; i += 1) { await sleep(100); try { port = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
let id = 0;
const pending = new Map();
const reqHost = new Map();
const bytesByHost = {};
const problems = [];
const csp = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
  if (d.method === 'Network.requestWillBeSent') reqHost.set(d.params.requestId, new URL(d.params.request.url).host);
  if (d.method === 'Network.loadingFinished') { const h = reqHost.get(d.params.requestId) ?? '?'; bytesByHost[h] = (bytesByHost[h] ?? 0) + d.params.encodedDataLength; }
  if (d.method === 'Log.entryAdded' && /Content Security Policy|Refused/i.test(d.params.entry.text)) csp.push(d.params.entry.text.slice(0, 200));
  if (d.method === 'Runtime.exceptionThrown') problems.push(d.params.exceptionDetails.exception?.description?.slice(0, 200));
};
const send = (method, params = {}) => new Promise((r) => { id += 1; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Log.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
await send('Page.navigate', { url: `${base}/tools/spike/${page}` });
await sleep(1500);
const t0 = Date.now();
const r = await send('Runtime.evaluate', { expression: `window.runSpike(${JSON.stringify({ lib, model, device, dtype, rambles })})`, awaitPromise: true, returnByValue: true, timeout: 900000 });
const wallMs = Date.now() - t0;
clearInterval(sampler);
const out = {
  lib, model, device, dtype, fresh, noGpu, flags: gpuFlags, wallMs, peakChromeRssMb: Math.round(peakMb),
  downloadedMbByHost: Object.fromEntries(Object.entries(bytesByHost).map(([h, b]) => [h, +(b / 1048576).toFixed(1)])),
  at: new Date().toISOString(),
  result: r.result?.result?.value ?? r.result?.exceptionDetails ?? r, problems: problems.slice(0, 5), cspViolations: csp.slice(0, 5), page,
};
fs.mkdirSync(path.join(repo, 'tools/spike/results'), { recursive: true });
fs.writeFileSync(path.join(repo, `tools/spike/results/${slug}${fresh ? '-cold' : ''}.json`), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, result: { ...out.result, results: out.result?.results?.map((x) => ({ ttftMs: x.ttftMs, totalMs: x.totalMs, tokens: x.tokens, decodeTps: x.decodeTps, validJson: x.validJson, n: x.json?.items?.length })) } }, null, 1));
ws.close(); chrome.kill(); server.close();
await new Promise((r) => { chrome.once("exit", r); setTimeout(r, 3000); });
if (fresh) fs.rmSync(dir, { recursive: true, force: true });
process.exit(0);
