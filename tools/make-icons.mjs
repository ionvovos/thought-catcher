// The v2 icons are drawn by the design phase (design/tools/icons.mjs renders design/icons/*.svg). This script copies the
// four PNGs the manifest and index.html use into icons/. Run: node tools/make-icons.mjs
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon-180.png']) {
  copyFileSync(join(root, 'design', 'icons', name), join(root, 'icons', name));
  console.log(`icons/${name}`);
}
