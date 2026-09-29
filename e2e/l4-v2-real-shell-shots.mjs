// L4a v2: screenshots through the REAL shell (not ?fixture=), because fixture roots may not fill the viewport.
// Onboarding pages, thought detail (task and idea), settings, about, library. 390x844 and 360x800, light and dark, CDP device
// emulation with safe-area insets. Output reports/visual-real/<name>-<w>x<h>-<theme>.png. Run outside the sandbox.
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep, repo } from './lib/cdp.mjs';

const out = path.join(repo, 'reports', 'visual-real');
fs.mkdirSync(out, { recursive: true });
const b = await launch({});
const SIZES = [[390, 844], [360, 800]];
const rowsForSeed = `(async () => { const m = await import('/src/dev/fixtures.js'); return m.SAMPLE_THOUGHTS; })()`;
const seed = async () => {
  await b.load(`${b.base}/x-seed.html`, 50);
  await b.ev(`(async () => { localStorage.clear(); for (const d of (await indexedDB.databases?.() ?? [])) indexedDB.deleteDatabase(d.name); })()`);
  await b.ev(`localStorage.setItem('thought-catcher.onboarding.done','true'); localStorage.setItem('thought-catcher.speech.engine','"typing"')`);
  await b.load(`${b.base}/?capture=1`, 1200);
  await b.ev(`(async () => { const rows = await ${rowsForSeed}; const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); await s.putMany(rows); })()`);
};
const shot = async (name, w, h, theme, url, wait = 1200) => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await b.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } }).catch(() => {});
  await b.load(url, wait);
  const r = await b.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(out, `${name}-${w}x${h}-${theme}.png`), Buffer.from(r.result.data, 'base64'));
};
// onboarding: first launch (nothing stored), pages 1-3 by clicking Continue
for (const theme of ['light', 'dark']) for (const [w, h] of SIZES) {
  await b.load(`${b.base}/x-seed.html`, 50);
  await b.ev(`(async () => { localStorage.clear(); for (const d of (await indexedDB.databases?.() ?? [])) indexedDB.deleteDatabase(d.name); })()`);
  await shot('real-onboarding-1', w, h, theme, `${b.base}/?capture=1`, 1400);
  for (const n of [2, 3]) {
    await b.ev(`[...document.querySelectorAll('button')].find((x) => /^continue$/i.test(x.textContent.trim()))?.click()`);
    await sleep(700);
    const r = await b.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, `real-onboarding-${n}-${w}x${h}-${theme}.png`), Buffer.from(r.result.data, 'base64'));
  }
}
await seed();
for (const theme of ['light', 'dark']) for (const [w, h] of SIZES) {
  await shot('real-detail-task', w, h, theme, `${b.base}/?capture=1#/thought/a3`);
  await shot('real-detail-idea', w, h, theme, `${b.base}/?capture=1#/thought/a5`);
  await shot('real-library', w, h, theme, `${b.base}/?capture=1#/library`);
  await shot('real-settings', w, h, theme, `${b.base}/?capture=1#/settings`);
  await shot('real-about', w, h, theme, `${b.base}/?capture=1#/about`);
  await shot('real-assistant-review', w, h, theme, `${b.base}/?capture=1`, 1800);
}
console.log('problems:', b.problems.filter((p) => !/WebGPU|favicon|404/.test(p)));
await b.close();
console.log(fs.readdirSync(out).length, 'files in', out);
