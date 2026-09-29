// L4 checks for M9 (export/import, no key, no audio) and M7 (review boundaries with a fixed clock).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByRules } from '../src/core/sorter.js';
import { newThought, validateThought } from '../src/core/model.js';
import { buildExport, parseImport, mergeImport, importSummary } from '../src/core/exportImport.js';
import { createSettingsApi } from '../src/storage/settings.js';
import { createMemoryStore } from '../src/storage/memory.js';
import {
  computeReview, isIdeaDue, isReminderDue, markReviewed, keepThought, dismissReminder, shouldAutoShow, shownPatch, reviewDays, localDate,
} from '../src/core/review.js';

const DAY = 86400000;
const NOW = new Date(2026, 8, 29, 12, 0, 0);
const make = (text, overrides = {}, at = NOW, id) => ({ ...newThought({ text, sortResult: sortByRules(text, at), now: at, id }), ...overrides });

// ---------- export / import ----------

test('AC-M8.5 / M9.3: a real settings store holding a key exports without the key, in any field', () => {
  const backing = new Map();
  const api = createSettingsApi({ getItem: (k) => backing.get(k) ?? null, setItem: (k, v) => backing.set(k, v), removeItem: (k) => backing.delete(k) });
  const KEY = 'sk-ant-api03-DEADBEEFDEADBEEF';
  api.setSettings({ 'ai.provider': 'anthropic', 'ai.model': 'm' });
  api.setKey(KEY);
  const text = JSON.stringify(buildExport([make('buy milk', {}, NOW, 'a')], api.getSettings(), NOW));
  assert.equal(text.includes(KEY), false);
  assert.equal(/api[-_ ]?key|sk-ant|x-api-key/i.test(text), false);
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, 1);
  assert.ok(Date.parse(parsed.exported_at));
  assert.equal(parsed.thoughts.length, 1);
});

test('AC-M2.6: a saved thought has no audio field; the export carries only text', () => {
  const t = newThought({ text: 'said out loud', source: 'voice', sortResult: sortByRules('said out loud', NOW), now: NOW });
  const keys = Object.keys(t).sort();
  assert.deepEqual(keys, ['clarify', 'created_at', 'done', 'done_at', 'due_at', 'expansion', 'id', 'review', 'sort', 'source', 'tags', 'text', 'title', 'type', 'updated_at']);
  const text = JSON.stringify(buildExport([t], {}, NOW));
  assert.equal(/audio|blob|wav|webm|base64|data:/i.test(text), false);
});

test('AC-M9.6: round trip through the memory store is deep-equal, including edits, done state and expansion', async () => {
  const idea = make('what if the app let people share lists', { expansion: { next_steps: ['a'], questions: ['b'], outline: ['c'], generated_at: NOW.toISOString(), model: 'm' } }, NOW, 'i1');
  const task = make('buy milk tomorrow', { done: true, done_at: NOW.toISOString(), title: 'Edited title', tags: ['edited'] }, NOW, 't1');
  const rem = make('remind me to call mum at 6pm', { review: { last_reviewed_at: null, snoozed_until: new Date(NOW.getTime() + DAY).toISOString(), dismissed: true } }, NOW, 'r1');
  const store = createMemoryStore();
  await store.putMany([idea, task, rem]);
  const before = (await store.getAll()).sort((a, b) => a.id.localeCompare(b.id));
  const file = JSON.stringify(buildExport(before, {}, NOW));
  await store.clear();
  const p = parseImport(file);
  assert.equal(p.ok, true);
  await store.putMany(mergeImport(await store.getAll(), p.data.thoughts).toAdd);
  assert.deepEqual((await store.getAll()).sort((a, b) => a.id.localeCompare(b.id)), before);
});

test('AC-M9.4: importing into a non-empty store merges by id, never duplicates, reports added and skipped', async () => {
  const a = make('buy milk', {}, NOW, 'a');
  const b = make('call the plumber', {}, NOW, 'b');
  const store = createMemoryStore();
  await store.put(a);
  const merged = mergeImport(await store.getAll(), buildExport([a, b], {}, NOW).thoughts);
  await store.putMany(merged.toAdd);
  assert.equal((await store.getAll()).length, 2);
  assert.equal(importSummary(merged), 'Added 1, skipped 1.');
  const again = mergeImport(await store.getAll(), [a, b]);
  assert.equal(again.added, 0);
  assert.equal(again.skipped, 2);
});

test('AC-M9.5: every kind of invalid file is rejected with an error and no data', () => {
  const good = buildExport([make('buy milk', {}, NOW, 'a')], {}, NOW);
  const badThought = (patch) => JSON.stringify({ ...good, thoughts: [{ ...good.thoughts[0], ...patch }] });
  const cases = {
    'empty string': '',
    'html': '<html></html>',
    'truncated json': JSON.stringify(good).slice(0, 40),
    'number': '42',
    'wrong format': JSON.stringify({ ...good, format: 'x' }),
    'version 2': JSON.stringify({ ...good, version: 2 }),
    'version as string': JSON.stringify({ ...good, version: '1' }),
    'thoughts null': JSON.stringify({ ...good, thoughts: null }),
    'title too long': badThought({ title: 'x'.repeat(61) }),
    'empty title': badThought({ title: '' }),
    'six tags': badThought({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    'uppercase tag': badThought({ tags: ['Upper'] }),
    'bad date': badThought({ created_at: 'yesterday' }),
    'bad due_at': badThought({ due_at: 'soon' }),
    'unknown type': badThought({ type: 'note' }),
    'unknown source': badThought({ source: 'telepathy' }),
    'done as string': badThought({ done: 'yes' }),
    'clarify state invalid': badThought({ clarify: { state: 'later', case: null, question: null, answer: null } }),
    'missing sort': badThought({ sort: undefined }),
    'confidence out of range': badThought({ sort: { by: 'rules', confidence: 2, alt_type: null, model: null } }),
    'empty text': badThought({ text: '   ' }),
    'thought is a string': JSON.stringify({ ...good, thoughts: ['x'] }),
  };
  for (const [name, text] of Object.entries(cases)) {
    const r = parseImport(text);
    assert.equal(r.ok, false, name);
    assert.ok(typeof r.error === 'string' && r.error.length > 0, name);
    assert.equal(r.data, undefined, `${name}: no data returned`);
  }
  assert.equal(parseImport(JSON.stringify(good)).ok, true);
});

test('AC-M9.5: all or nothing, one bad thought among valid ones imports none', () => {
  const ok = make('buy milk', {}, NOW, 'a');
  const file = JSON.stringify({ ...buildExport([ok], {}, NOW), thoughts: [ok, { ...ok, id: 'b', type: 'nope' }, { ...ok, id: 'c' }] });
  const r = parseImport(file);
  assert.equal(r.ok, false);
  assert.match(r.error, /Thought 2/);
});

test('imported text is inert data: markup in a thought survives as text and validates', () => {
  const t = make('<img src=x onerror=alert(1)> buy milk', {}, NOW, 'x1');
  assert.equal(validateThought(t).ok, true);
  const back = parseImport(JSON.stringify(buildExport([t], {}, NOW)));
  assert.equal(back.data.thoughts[0].text, t.text);
});

test('AC-M9.7 store: clear() empties thoughts and leaves settings rows alone', async () => {
  const store = createMemoryStore();
  await store.putMany([make('a thought', {}, NOW, 'a'), make('another', {}, NOW, 'b')]);
  await store.setSetting('review.days', 5);
  await store.clear();
  assert.equal((await store.getAll()).length, 0);
  assert.equal(await store.getSetting('review.days', 3), 5);
  assert.equal(await store.get('a'), undefined);
});

// ---------- review with a fixed clock ----------

test('AC-M7.1: an idea created exactly 3 days ago is due, 2 days 23 h 59 min ago is not', () => {
  const at = (ms) => new Date(NOW.getTime() - ms);
  assert.equal(isIdeaDue(make('what if we sold candles', {}, at(3 * DAY), 'i3'), 3, NOW), true);
  assert.equal(isIdeaDue(make('what if we sold candles', {}, at(3 * DAY - 60000), 'i2'), 3, NOW), false);
  assert.equal(isIdeaDue(make('what if we sold candles', {}, at(2 * DAY), 'i2b'), 3, NOW), false);
});

test('AC-M7.1: only ideas come back; tasks and journal entries never do', () => {
  const old = new Date(NOW.getTime() - 30 * DAY);
  const all = [make('what if we sold candles', {}, old, 'idea'), make('buy milk', {}, old, 'task'), make('today was tiring but good', {}, old, 'journal')];
  const r = computeReview(all, { 'review.days': 3 }, NOW);
  assert.deepEqual(r.items.map((i) => i.thought.id), ['idea']);
});

test('AC-M7.2: reminders due in the past appear; future, dismissed, done and no-time reminders do not', () => {
  const past = new Date(NOW.getTime() - 3600000).toISOString();
  const future = new Date(NOW.getTime() + 3600000).toISOString();
  const rem = (id, extra) => make('remind me to call mum at 6pm', { type: 'reminder', ...extra }, NOW, id);
  assert.equal(isReminderDue(rem('a', { due_at: past }), NOW), true);
  assert.equal(isReminderDue(rem('b', { due_at: future }), NOW), false);
  assert.equal(isReminderDue(rem('c', { due_at: past, review: { last_reviewed_at: null, snoozed_until: null, dismissed: true } }), NOW), false);
  assert.equal(isReminderDue(rem('d', { due_at: past, done: true, done_at: past }), NOW), false);
  assert.equal(isReminderDue(rem('e', { due_at: null }), NOW), false);
  assert.equal(isReminderDue(rem('f', { due_at: NOW.toISOString() }), NOW), true, 'due exactly now counts as due');
});

test('AC-M7.3: reviewed restarts an idea clock; keep hides until N days; dismiss is permanent; state survives a store round trip', async () => {
  const idea = make('what if we sold candles', {}, new Date(NOW.getTime() - 5 * DAY), 'i');
  const s = { 'review.days': 4 };
  assert.equal(computeReview([idea], s, NOW).count, 1);
  const reviewed = markReviewed(idea, NOW);
  assert.equal(computeReview([reviewed], s, NOW).count, 0);
  assert.equal(computeReview([reviewed], s, new Date(NOW.getTime() + 4 * DAY - 1)).count, 0);
  assert.equal(computeReview([reviewed], s, new Date(NOW.getTime() + 4 * DAY)).count, 1);
  const kept = keepThought(idea, s, NOW);
  assert.equal(kept.review.snoozed_until, new Date(NOW.getTime() + 4 * DAY).toISOString());
  assert.equal(computeReview([kept], s, new Date(NOW.getTime() + 4 * DAY - 1)).count, 0);
  const rem = make('remind me to call mum at 6pm', { type: 'reminder', due_at: new Date(NOW.getTime() - 1000).toISOString() }, NOW, 'r');
  const dismissed = dismissReminder(rem, NOW);
  assert.equal(computeReview([dismissed], s, new Date(NOW.getTime() + 90 * DAY)).count, 0);
  const store = createMemoryStore();
  await store.put(dismissed);
  assert.equal((await store.get('r')).review.dismissed, true);
  assert.deepEqual(idea.review, { last_reviewed_at: null, snoozed_until: null, dismissed: false }, 'inputs are not mutated');
});

test('AC-M7.4: shown at most once per local day unless items were left unresolved; nothing due means never', () => {
  assert.equal(shouldAutoShow(0, {}, NOW), false);
  assert.equal(shouldAutoShow(0, { 'review.left_unresolved': true }, NOW), false);
  assert.equal(shouldAutoShow(2, { 'review.last_shown_date': null }, NOW), true);
  assert.equal(shouldAutoShow(2, { 'review.last_shown_date': localDate(NOW) }, NOW), false);
  assert.equal(shouldAutoShow(2, { 'review.last_shown_date': localDate(NOW), 'review.left_unresolved': true }, NOW), true);
  assert.equal(shouldAutoShow(2, { 'review.last_shown_date': '2026-09-28' }, NOW), true);
  assert.deepEqual(shownPatch(0, NOW), { 'review.last_shown_date': '2026-09-29', 'review.left_unresolved': false });
  assert.deepEqual(shownPatch(3, NOW), { 'review.last_shown_date': '2026-09-29', 'review.left_unresolved': true });
});

test('AC-M7.5: the threshold is clamped to 1-30 and used by the next review', () => {
  for (const [input, want] of [[0, 1], [-4, 1], [1, 1], [30, 30], [31, 30], [999, 30], ['5', 5], [2.6, 3], [NaN, 3], [undefined, 3], [null, 1]]) {
    assert.equal(reviewDays({ 'review.days': input }), want, String(input));
  }
  const idea = make('what if we sold candles', {}, new Date(NOW.getTime() - 7 * DAY), 'i');
  assert.equal(computeReview([idea], { 'review.days': 7 }, NOW).count, 1);
  assert.equal(computeReview([idea], { 'review.days': 8 }, NOW).count, 0);
});
