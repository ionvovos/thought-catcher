import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

test('css/tokens.css is a byte copy of design/tokens.css (AC-D1.1)', () => {
  const a = fs.readFileSync(path.join(root, 'css/tokens.css'));
  const b = fs.readFileSync(path.join(root, 'design/tokens.css'));
  assert.ok(a.equals(b), 'copy design/tokens.css to css/tokens.css unchanged');
});

const LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\bhwb\s*\(|\blab\s*\(|\blch\s*\(|\boklch\s*\(|\bcolor\s*\(/;

test('no CSS file except tokens.css holds a colour literal (AC-D1.1)', () => {
  const dir = path.join(root, 'css');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.css') && n !== 'tokens.css')) {
    // strip comments so prose in a comment is not read as a value
    const css = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    css.split('\n').forEach((line, i) => { if (LITERAL.test(line)) bad.push(`${f}:${i + 1}: ${line.trim()}`); });
  }
  assert.deepEqual(bad, []);
});

test('every stylesheet the shell links exists and tokens.css comes first', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const links = [...html.matchAll(/<link rel="stylesheet" href="\.\/(css\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(links[0], 'css/tokens.css');
  for (const l of links) assert.ok(fs.existsSync(path.join(root, l)), l);
});
