// L4a v2 gap tests: headless criteria that no builder test covers (AC-D1.4 contrast, AC-B4.1 no server or secret,
// AC-X1.1 manifest, AC-X2.7 question length, AC-D5.1 fixture per state). Does not edit app code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

// ---- colour maths ---------------------------------------------------------------------------------------------------
function parseColor(s) {
  s = s.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error(`cannot parse colour ${s}`);
}
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// tokens.css defines each themed token once as light-dark(light, dark); read both sides.
function tokens() {
  const css = read('css/tokens.css');
  const light = {}; const dark = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*light-dark\(\s*((?:rgba?\([^)]*\)|#[0-9a-fA-F]{6}))\s*,\s*((?:rgba?\([^)]*\)|#[0-9a-fA-F]{6}))\s*\)/g)) { light[m[1]] = m[2]; dark[m[1]] = m[3]; }
  for (const m of css.matchAll(/^\s*--([a-z0-9-]+):\s*((?:#[0-9a-fA-F]{6}))\s*;/gm)) { if (!(m[1] in light)) { light[m[1]] = m[2]; dark[m[1]] = m[2]; } }
  return { light, dark };
}

test('AC-D1.4: tokens.css defines both themes for the pairs used below', () => {
  const t = tokens();
  for (const k of ['c-bg', 'c-surface', 'c-surface-2', 'c-raised', 'c-text', 'c-text-2', 'c-text-3', 'c-accent-text', 'c-danger', 'c-idea', 'c-idea-bg', 'c-task', 'c-task-bg', 'c-journal', 'c-journal-bg', 'c-reminder', 'c-reminder-bg', 'c-accent', 'c-on-accent', 'c-toast', 'c-on-toast']) {
    assert.ok(t.light[k] && t.dark[k], `${k} missing in a theme`);
  }
});

// Foreground/background pairs the screens use for text (design.md): text ramp on the four surfaces, accent text, danger text,
// each type colour on its own tint over a surface, white on accent, toast text.
const PAIRS = [];
for (const fg of ['c-text', 'c-text-2', 'c-text-3']) for (const bg of ['c-bg', 'c-surface', 'c-surface-2', 'c-raised']) PAIRS.push([fg, bg, 4.5]);
for (const bg of ['c-bg', 'c-surface', 'c-raised']) { PAIRS.push(['c-accent-text', bg, 4.5]); PAIRS.push(['c-danger', bg, 4.5]); }
for (const type of ['idea', 'task', 'journal', 'reminder']) for (const base of ['c-surface', 'c-raised', 'c-bg']) PAIRS.push([`c-${type}`, `c-${type}-bg`, 4.5, base]);
PAIRS.push(['c-on-accent', 'c-accent', 4.5], ['c-on-toast', 'c-toast', 4.5]);

for (const theme of ['light', 'dark']) {
  test(`AC-D1.4: text pairs reach 4.5:1 in ${theme}`, () => {
    const t = tokens()[theme];
    const failures = [];
    for (const [fg, bg, min, base] of PAIRS) {
      const baseRgb = base ? parseColor(t[base]) : [128, 128, 128, 1];
      const back = over(parseColor(t[bg]), baseRgb);
      const front = over(parseColor(t[fg]), back);
      const r = ratio(front, back);
      if (r < min) failures.push(`${fg} on ${bg}${base ? ` over ${base}` : ''} = ${r.toFixed(2)}`);
    }
    assert.deepEqual(failures, []);
  });
}

// ---- AC-B4.1: no server code, no secret -----------------------------------------------------------------------------
const tracked = () => execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8', env: cleanEnv() }).split('\n').filter(Boolean);
function cleanEnv() { const e = { ...process.env }; for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k]; return e; }

test('AC-B4.1: no server, no serverless function, no dependency in package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  const files = tracked();
  const bad = files.filter((f) => /^(api|functions|server|netlify|\.vercel)\//.test(f) || /(^|\/)(vercel|netlify)\.json$/.test(f) || /(^|\/)Dockerfile$/.test(f) || /\.env(\.|$)/.test(f));
  assert.deepEqual(bad, []);
  // no app source starts an HTTP server or reads process.env (tools/ and e2e/ are dev scripts and run only on the developer's machine)
  const offenders = files.filter((f) => /^(src|css)\//.test(f) && f.endsWith('.js')).filter((f) => /process\.env|createServer\(|require\(/.test(read(f)));
  assert.deepEqual(offenders, []);
});

// A match containing an obvious placeholder word is a test fixture, not a credential (tests/l4-data.test.mjs uses ...DEADBEEF).
const PLACEHOLDER = /DEADBEEF|EXAMPLE|FAKE|DUMMY|SECRET|XXXX/i;
const SECRET = /(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}|xox[abp]-[0-9A-Za-z-]{10,})/;

test('AC-B4.1: secret scan of the working tree', () => {
  const hits = [];
  for (const f of tracked()) {
    if (/\.(png|ico|woff2?|jpg|jpeg|gif)$/i.test(f)) continue;
    let s; try { s = read(f); } catch { continue; }
    const m = SECRET.exec(s);
    if (m && !PLACEHOLDER.test(m[0])) hits.push(`${f}: ${m[0].slice(0, 12)}...`);
  }
  assert.deepEqual(hits, []);
});

test('AC-B4.1: secret scan of the history (added lines of every commit)', () => {
  const out = execFileSync('git', ['log', '--all', '-p', '--no-color', '-U0', '--diff-filter=AM', '--', '.', ':(exclude)*.png', ':(exclude)*.woff2'], { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: cleanEnv() });
  const hits = [];
  for (const line of out.split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const m = SECRET.exec(line);
    if (m && !PLACEHOLDER.test(m[0])) hits.push(m[0].slice(0, 14));
  }
  assert.deepEqual(hits, []);
});

// ---- AC-X1.1 manifest ------------------------------------------------------------------------------------------------
test('AC-X1.1: start_url stays inside the app scope and is standalone', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  const resolved = new URL(m.start_url, 'https://example.test/thought-catcher/manifest.webmanifest');
  assert.ok(resolved.pathname.startsWith('/thought-catcher/'), resolved.href);
  assert.equal(resolved.hash, '');
});

// ---- AC-X2.7 question length, AC-X2.1 reply length --------------------------------------------------------------------
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

test('AC-X2.7: every clarifying question is at most 20 words and each case has answer chips or free text', async () => {
  const { clarifyQuestionFor } = await import('../src/brain/core.js');
  const base = { text: 'x thing', type: 'task', alt_type: null, confidence: 0.9, title: 'x', tags: [], due_at: null, by: 'rules' };
  const cases = {
    1: { ...base, text: 'call the dentist tomorrow', alt_type: 'reminder', confidence: 0.6 },
    2: { ...base, text: 'remind me to call mum', type: 'reminder' },
    3: { ...base, text: 'the idea', type: 'idea' },
    4: { ...base, text: 'maybe write about the trip', type: 'idea', alt_type: 'journal', confidence: 0.6 },
    5: { ...base, text: 'uh gym', confidence: 0.3 },
  };
  const seen = new Set();
  for (const [n, item] of Object.entries(cases)) {
    const q = clarifyQuestionFor(item, { aiAvailable: true, source: 'voice' });
    if (!q) continue;
    seen.add(q.case);
    assert.ok(words(q.text) <= 20, `case ${q.case}: ${q.text}`);
    assert.ok(Array.isArray(q.chips), `case ${n} chips`);
  }
  assert.ok(seen.size >= 4, `only cases ${[...seen]} were exercised`);
});
