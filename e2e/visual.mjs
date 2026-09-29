// Screenshots of every screen and state through ?fixture=<state>, at 390x844 and 360x800, light and dark, by CDP device
// emulation (a plain --window-size shot is a crop of a wider layout). Also reports horizontal overflow and any control
// whose hit area is under 44x44 CSS px (a ::after extension counts). Run outside the Bash sandbox: node e2e/visual.mjs [state ...]
// Output: reports/visual/<state>-<w>x<h>-<light|dark>.png and reports/visual/report.json. DPR=2 halves the file size.
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep, repo } from './lib/cdp.mjs';

export const STATES_S1 = [
  'assistant-first-run', 'assistant-consent', 'assistant-downloading', 'assistant-idle', 'assistant-listening', 'assistant-thinking',
  'assistant-question', 'assistant-filed', 'assistant-speaking', 'assistant-model-failed', 'composer-keyboard', 'error-offline',
  'no-webgpu-fallback', 'migration-running', 'migration-failed',
];
const SIZES = [[390, 844], [360, 800]];
const THEMES = ['light', 'dark'];
const DPR = Number(process.env.DPR ?? 3);

let states = [...STATES_S1];
const only = process.argv.slice(2);

const out = path.join(repo, 'reports', 'visual');
fs.mkdirSync(out, { recursive: true });

// Runs in the page: overflow, and controls smaller than 44x44 once their ::after extension is counted.
const MEASURE = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const small = [];
  for (const e of document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="checkbox"], [role="radio"], [role="tab"], [role="switch"]')) {
    if (!vis(e) || e.closest('[aria-hidden="true"]') || e.matches('.sr-only')) continue;
    const r = e.getBoundingClientRect();
    let l = r.left, t = r.top, rr = r.right, b = r.bottom;
    for (const pseudo of ['::after', '::before']) {
      const cs = getComputedStyle(e, pseudo);
      if (cs.content === 'none' || cs.position !== 'absolute') continue;
      const pw = parseFloat(cs.width), ph = parseFloat(cs.height), pl = parseFloat(cs.left), pt = parseFloat(cs.top);
      if ([pw, ph, pl, pt].some(Number.isNaN)) continue;
      l = Math.min(l, r.left + pl); t = Math.min(t, r.top + pt); rr = Math.max(rr, r.left + pl + pw); b = Math.max(b, r.top + pt + ph);
    }
    const w = rr - l, h = b - t;
    if (w < 43.5 || h < 43.5) small.push({ el: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : ''), label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40), w: Math.round(w), h: Math.round(h) });
  }
  return { overflowX: document.documentElement.scrollWidth - innerWidth, small };
})()`;

const b = await launch();
// Every fixture the app registered (S1's and S3's) is a state; a name on the command line picks some of them.
await b.load(`${b.base}/?fixture=assistant-idle`, 800);
await b.until('!!document.body.dataset.fixture', 5000);
const registered = await b.ev(`import('/src/dev/fixtures.js').then((m) => m.fixtureNames())`).catch(() => []);
states = only.length ? only : [...new Set([...STATES_S1, ...registered])];
const report = [];
for (const state of states) {
  for (const theme of THEMES) {
    for (const [w, h] of SIZES) {
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: DPR, mobile: true });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await b.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } }).catch(() => {});
      b.problems.length = 0;
      await b.load(`${b.base}/?fixture=${state}`, 700);
      const ready = await b.until('!!document.body.dataset.fixture', 5000);
      await sleep(1000);
      const m = ready ? await b.ev(MEASURE) : { overflowX: null, small: [] };
      const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = `${state}-${w}x${h}-${theme}.png`;
      fs.writeFileSync(path.join(out, file), Buffer.from(shot.result.data, 'base64'));
      report.push({ state, w, h, theme, file, ready, overflowX: m.overflowX, smallTargets: m.small, problems: [...b.problems] });
    }
  }
}
await b.close();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));

const bad = report.filter((r) => !r.ready || r.overflowX > 0 || r.smallTargets.length || r.problems.length);
console.log(`${report.length} screenshots in reports/visual/; ${states.length} states; problems in ${bad.length}`);
for (const r of bad) {
  console.log(`- ${r.file}${r.ready ? '' : ' NOT READY'}${r.overflowX > 0 ? ` overflowX=${r.overflowX}` : ''}`);
  for (const s of r.smallTargets.slice(0, 6)) console.log(`    small ${s.w}x${s.h} ${s.el} "${s.label}"`);
  for (const p of r.problems.slice(0, 3)) console.log(`    ${p}`);
}
process.exit(bad.length ? 1 : 0);
