// Screenshots of every S3 fixture at true phone size (CDP device emulation, safe-area insets), light and dark.
// Run outside the Bash sandbox: node e2e/visual-states-s3.mjs [name ...] [--size=390x844] [--theme=light|dark]
// Output: e2e/.out/s3/<name>-<w>x<h>-<theme>.png and a JSON line per shot with horizontal overflow and hit areas under 44 px.
import fs from 'node:fs';
import path from 'node:path';
import { launch, repo, sleep } from './lib/cdp.mjs';

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const only = args.filter((a) => !a.startsWith('--'));
const sizes = opt('size') ? [opt('size').split('x').map(Number)] : [[390, 844], [360, 800]];
const themes = opt('theme') ? [opt('theme')] : ['light', 'dark'];
const outDir = path.join(repo, 'e2e/.out/s3');
fs.mkdirSync(outDir, { recursive: true });

const CSS_ORDER = ['tokens', 'app', 'shell', 'components', 'orb', 'conversation', 'library', 'detail', 'review', 'onboarding', 'settings'];

// The page is built in the browser: navigate to a same-origin 404, then add the stylesheets and import the fixtures.
const mountScript = (name) => `(async () => {
  document.title = 'fixture';
  const meta = document.createElement('meta'); meta.name = 'viewport'; meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  document.head.append(meta);
  document.body.replaceChildren();
  const cssList = ${JSON.stringify(CSS_ORDER)};
  await Promise.all(cssList.map((n) => new Promise((res) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/' + n + '.css';
    l.onload = res; l.onerror = res; document.head.append(l);
  })));
  const root = document.createElement('main'); root.className = 'app'; root.id = 'root';
  document.body.append(root);
  const { FIXTURES } = await import('/src/dev/fixtures-s3.js');
  if (!FIXTURES[${JSON.stringify(name)}]) return 'no such fixture';
  window.__fx = await FIXTURES[${JSON.stringify(name)}](root);
  await new Promise((r) => setTimeout(r, 350));
  return 'ok';
})()`;

const audit = `(() => {
  const small = [];
  const sel = 'button, a[href], input, [role=button], [role=radio], [role=checkbox], [role=tab], [role=switch], select, textarea, summary';
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden' || e.closest('[hidden]')) continue;
    let w = r.width, h = r.height;
    const a = getComputedStyle(e, '::after');
    if (a.content !== 'none' && a.position === 'absolute') {
      const px = (v) => parseFloat(v) || 0;
      w = r.width - px(a.left) - px(a.right); h = r.height - px(a.top) - px(a.bottom);
      if (a.left === 'auto' || a.top === 'auto') { w = px(a.width) || r.width; h = px(a.height) || r.height; }
    }
    if (w < 43.5 || h < 43.5) small.push((e.className || e.tagName) + ' ' + Math.round(w) + 'x' + Math.round(h) + ' "' + (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24) + '"');
  }
  return { overflowX: document.documentElement.scrollWidth - innerWidth, small };
})()`;

const b = await launch();
const names = only.length ? only : await (async () => {
  await b.load(`${b.base}/__s3host`, 200);
  return b.ev("import('/src/dev/fixtures-s3.js').then((m) => Object.keys(m.FIXTURES))");
})();
const report = [];
for (const name of names) {
  for (const theme of themes) {
    for (const [w, h] of sizes) {
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await b.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } }).catch(() => {});
      await b.load(`${b.base}/__s3host`, 150);
      const res = await b.ev(mountScript(name));
      if (res !== 'ok') { report.push({ name, error: res }); continue; }
      const a = await b.ev(audit);
      const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const png = path.join(outDir, `${name}-${w}x${h}-${theme}.png`);
      fs.writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
      report.push({ name, size: `${w}x${h}`, theme, overflowX: a.overflowX, small: a.small, png: path.relative(repo, png) });
    }
  }
}
await sleep(100);
const external = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:'));
const problems = [...b.problems];
await b.close();
for (const r of report) console.log(JSON.stringify(r));
console.log(JSON.stringify({ shots: report.length, problems, external }));
