import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const srcFiles = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js'));

test('index.html shell', () => {
  const html = read('index.html');
  assert.match(html, /<script type="module" src="\.\/src\/app\.js">/);
  assert.match(html, /<meta name="viewport"/);
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /(src|href)="\//);
});

test('no unsafe DOM writes, no inline style, relative imports only', () => {
  for (const f of srcFiles) {
    const s = readFileSync(f, 'utf8');
    const name = relative(ROOT, f);
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
      // dom.js names them once, to refuse them
      if (name.endsWith('ui/dom.js')) continue;
      assert.ok(!s.includes(bad), `${name} uses ${bad}`);
    }
    assert.doesNotMatch(s, /setAttribute\(\s*['"]style['"]/, name);
    for (const m of s.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      assert.match(m[1], /^\.{1,2}\//, `${name}: non-relative import ${m[1]}`);
    }
  }
});

const PURE = ['src/storage/memory.js', 'src/speech/select.js'];
test('pure modules avoid the DOM and the clock, and import in Node', async () => {
  const pure = [...walk(join(ROOT, 'src/core')).map((f) => relative(ROOT, f)), ...PURE].filter((f) => f.endsWith('.js'));
  for (const f of pure) {
    const s = read(f);
    // an injectable default (`now = new Date()`, `now = () => new Date()`) is allowed; any other clock read is not
    const noDefaults = s.replace(/\bnow\s*=\s*(\(\)\s*=>\s*)?new Date\(\)/g, '');
    assert.doesNotMatch(s, /\b(window|document|navigator|indexedDB)\./, f);
    assert.ok(!noDefaults.includes('Date.now('), `${f} reads the clock`);
    assert.doesNotMatch(noDefaults, /new Date\(\)/, `${f} reads the clock`);
    await import(pathToFileURL(join(ROOT, f)).href);
  }
});

test('the v2 shell: CSP with same-origin workers, no v1 nav, tokens first', () => {
  const html = read('index.html');
  assert.match(html, /worker-src 'self' blob:;/);
  assert.match(html, /font-src 'self'/);
  assert.match(html, /script-src 'self' https:\/\/cdn\.jsdelivr\.net\/npm\/@mlc-ai\/web-llm@0\.2\.85\/ .*'wasm-unsafe-eval' blob:/);
  assert.doesNotMatch(html, /app-nav|app-header/);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#F5F5F7">/);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#0A0A0C">/);
});

test('the orb is at least 64px docked and 184px on the stage (design.md 2.1)', () => {
  const css = read('css/orb.css');
  assert.match(css, /\.orb \{[^}]*--size: 184px/);
  assert.match(css, /\.orb--dock \{ --size: 64px/);
});

test('retired v1 UI files are gone', () => {
  for (const f of ['src/ui/views/capture.js', 'src/ui/aiFlow.js', 'src/ui/voice.js', 'src/ui/consent.js', 'src/features.js']) {
    assert.throws(() => read(f), f);
  }
});
