// Screenshots every mockup into design/screens/ at true phone viewports.
// Run outside the Bash sandbox: node design/tools/shoot.mjs [name ...]
// Uses CDP device emulation, not --window-size: headless Chrome keeps a minimum window width of
// about 500 px, so a 390 px --window-size screenshot is a crop of a wider layout.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from '../../e2e/lib/cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const all = JSON.parse(readFileSync(join(root, 'tools', 'screens.json'), 'utf8')).map(s => s.name);
const only = process.argv.slice(2);
const names = only.length ? only : all;
const KEY = ['assistant-idle', 'assistant-filed', 'library-half', 'thought-detail', 'onboarding-1'];

const b = await launch();
const report = [];
for (const n of names) {
  for (const theme of ['light', 'dark']) {
    const sizes = [[390, 844]];
    if (KEY.includes(n)) sizes.push([360, 800]);
    for (const [w, h] of sizes) {
      await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await b.load(`${b.base}/design/mockups/${n}.html`, 1400);
      const overflow = await b.ev('document.documentElement.scrollWidth - innerWidth');
      const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const png = join(root, 'screens', `${n}-${w}x${h}-${theme}.png`);
      (await import('node:fs')).writeFileSync(png, Buffer.from(shot.result.data, 'base64'));
      report.push({ png: png.slice(root.length + 1), overflowX: overflow });
    }
  }
}
await sleep(100);
const external = b.network.filter(u => !u.startsWith(b.base) && !u.startsWith('data:'));
await b.close();
const bad = report.filter(r => r.overflowX > 0);
console.log(`${report.length} screenshots; horizontal overflow on ${bad.length}; external requests ${external.length}; console problems ${b.problems.length}`);
for (const r of bad) console.log('OVERFLOW', r.png, r.overflowX);
for (const p of b.problems) console.log('PROBLEM', p);
for (const u of external) console.log('EXTERNAL', u);
