import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newThought } from '../src/core/model.js';
import { sortByRules } from '../src/core/sorter.js';
import { createMemoryStore } from '../src/storage/memory.js';
import { buildExport, parseImport, mergeImport, exportFileName, importSummary, EXPORT_FORMAT } from '../src/core/exportImport.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const make = (text, id) => newThought({ text, sortResult: sortByRules(text, NOW), now: NOW, id });
const THOUGHTS = [make('buy milk tomorrow', 'a'), make('what if the app let people share lists', 'b'), make('today was tiring but good', 'c')];
THOUGHTS[1].expansion = { next_steps: ['x'], questions: ['y'], outline: ['z'], generated_at: NOW.toISOString(), model: 'm' };
const SETTINGS = { 'review.days': 5, 'speech.engine': 'browser', 'ai.provider': 'anthropic', 'ai.model': 'm', 'ai.base_url': null, 'review.last_shown_date': '2026-09-29' };
const KEY = 'sk-ant-SECRET-KEY-123';

test('export shape, and the key never appears in the serialized output', () => {
  const ex = buildExport(THOUGHTS, { ...SETTINGS, 'ai.key': KEY, key: KEY }, NOW);
  assert.equal(ex.format, EXPORT_FORMAT);
  assert.equal(ex.version, 2);
  assert.equal(ex.exported_at, NOW.toISOString());
  assert.equal(ex.thoughts.length, 3);
  assert.deepEqual(Object.keys(ex.settings).sort(), ['ai.base_url', 'ai.model', 'ai.provider', 'review.days', 'speech.engine', 'theme', 'voice.name', 'voice.speak']);
  const text = JSON.stringify(ex);
  assert.equal(text.includes(KEY), false);
  assert.equal(text.includes('SECRET'), false);
  assert.equal(text.includes('review.last_shown_date'), false);
});

test('round trip: export, clear all data, import, records deep-equal', async () => {
  const store = createMemoryStore();
  await store.putMany(THOUGHTS);
  const before = (await store.getAll()).sort((x, y) => x.id.localeCompare(y.id));
  const text = JSON.stringify(buildExport(before, SETTINGS, NOW));
  await store.clear();
  assert.equal((await store.getAll()).length, 0);
  const parsed = parseImport(text);
  assert.equal(parsed.ok, true);
  const merged = mergeImport(await store.getAll(), parsed.data.thoughts);
  await store.putMany(merged.toAdd);
  const after = (await store.getAll()).sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(after, before);
  assert.equal(merged.added, 3);
  assert.equal(merged.skipped, 0);
});

test('merge by id: adds new, skips existing, summary text', () => {
  const merged = mergeImport([THOUGHTS[0]], THOUGHTS);
  assert.equal(merged.added, 2);
  assert.equal(merged.skipped, 1);
  assert.deepEqual(merged.toAdd.map((t) => t.id), ['b', 'c']);
  assert.equal(importSummary(merged), 'Added 2, skipped 1.');
  const dup = mergeImport([], [THOUGHTS[0], THOUGHTS[0]]);
  assert.equal(dup.added, 1);
  assert.equal(dup.skipped, 1);
});

test('imported thoughts keep their clarify state', () => {
  const t = { ...THOUGHTS[0], clarify: { state: 'skipped', case: 1, question: 'q', answer: null } };
  const parsed = parseImport(JSON.stringify(buildExport([t], SETTINGS, NOW)));
  assert.equal(parsed.data.thoughts[0].clarify.state, 'skipped');
});

test('invalid files are rejected with a message and no thoughts', () => {
  const good = buildExport(THOUGHTS, SETTINGS, NOW);
  const cases = {
    'not JSON': 'this is not json',
    'null': 'null',
    'array': '[]',
    'wrong format': JSON.stringify({ ...good, format: 'other' }),
    'wrong version': JSON.stringify({ ...good, version: 3 }),
    'missing version': JSON.stringify({ ...good, version: undefined }),
    'thoughts not an array': JSON.stringify({ ...good, thoughts: {} }),
    'thoughts missing': JSON.stringify({ ...good, thoughts: undefined }),
    'one bad thought': JSON.stringify({ ...good, thoughts: [good.thoughts[0], { ...good.thoughts[1], type: 'nope' }] }),
    'thought missing id': JSON.stringify({ ...good, thoughts: [{ ...good.thoughts[0], id: '' }] }),
  };
  for (const [name, text] of Object.entries(cases)) {
    const r = parseImport(text);
    assert.equal(r.ok, false, name);
    assert.equal(typeof r.error, 'string', name);
    assert.ok(r.error.length > 10, name);
    assert.equal('data' in r, false, name);
  }
});

test('file name uses the local date', () => {
  assert.equal(exportFileName(new Date(2026, 8, 5, 23, 59)), 'thought-catcher-2026-09-05.json');
});

// v1 files (build a999310): rows are upgraded on import; a row that fails validation is skipped and counted (G19).
const v1Row = (t) => { const r = structuredClone(t); delete r.origin; delete r.best_guess; delete r.plan; delete r.v; return r; };

test('a version 1 export is read: rows are upgraded and an unreadable row is skipped and counted', () => {
  const rows = [v1Row(THOUGHTS[0]), { ...v1Row(THOUGHTS[1]), type: 'nope' }, { ...v1Row(THOUGHTS[2]), sort: { ...THOUGHTS[2].sort, by: 'ai' } }];
  const file = JSON.stringify({ format: EXPORT_FORMAT, version: 1, exported_at: NOW.toISOString(), app_version: '1.0.1', settings: {}, thoughts: rows });
  const r = parseImport(file);
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.data.thoughts.map((t) => t.id), ['a', 'c']);
  assert.equal(r.data.thoughts[0].v, 2);
  assert.equal(r.data.thoughts[0].origin, null);
  assert.equal(r.data.thoughts[1].sort.by, 'key', "v1 'ai' reads as 'key'");
});

test('a version 2 export carries quarantined rows and import ignores them', () => {
  const ex = buildExport(THOUGHTS, SETTINGS, NOW, { quarantined: [{ id: 'bad', junk: true }] });
  assert.deepEqual(ex.quarantined, [{ id: 'bad', junk: true }]);
  const r = parseImport(JSON.stringify(ex));
  assert.equal(r.ok, true);
  assert.equal('quarantined' in r.data, false);
  assert.equal(r.data.thoughts.length, 3);
  assert.equal(r.skipped, 0);
});
