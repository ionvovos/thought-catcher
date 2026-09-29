// Renders design/icons/*.svg to the PNG sizes the manifest and iOS need.
// Run outside the Bash sandbox: node design/tools/icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../e2e/lib/cdp.mjs';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const jobs = [
  ['icon.svg', 192, 'icon-192.png', false],
  ['icon.svg', 512, 'icon-512.png', false],
  ['icon-maskable.svg', 512, 'icon-maskable-512.png', false],
  ['icon-maskable.svg', 180, 'apple-touch-icon-180.png', false],
];
const b = await launch();
await b.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [src, size, out] of jobs) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  const svg = readFileSync(join(dir, src), 'utf8').replace('width="512" height="512"', `width="${size}" height="${size}"`);
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await b.load(`data:text/html,${encodeURIComponent(html)}`, 600);
  const shot = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(dir, out), Buffer.from(shot.result.data, 'base64'));
  console.log('wrote', out, size);
}
await b.close();
