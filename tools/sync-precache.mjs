// Rewrites the SHELL list in sw.js from the files on disk: every file under src/, css/ and icons/ plus the shell files.
// Run after any shard adds a file the browser loads: node tools/sync-precache.mjs   (tests/pwa.test.mjs checks the list).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((n) => {
  const rel = `${dir}/${n}`;
  return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
});
const files = ['index.html', 'manifest.webmanifest', ...['css', 'fonts', 'icons', 'src'].flatMap((d) => { try { return walk(d); } catch { return []; } })]
  .filter((f) => !f.endsWith('.DS_Store'))
  .sort((a, b) => (a.includes('/') === b.includes('/') ? a.localeCompare(b) : a.includes('/') ? 1 : -1));
const list = ['./', ...files.map((f) => `./${f}`)];
const body = `const SHELL = [\n${list.map((f) => `  '${f}',`).join('\n')}\n];`;
const path = join(root, 'sw.js');
const sw = readFileSync(path, 'utf8');
const next = sw.replace(/const SHELL = \[[\s\S]*?\n\];/, body);
if (next !== sw) writeFileSync(path, next);
console.log(`${list.length} entries in the precache list${next === sw ? ' (unchanged)' : ''}`);
