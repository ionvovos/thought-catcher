// L4 independent checks for AC-M3.1 / AC-M3.2: a labelled set written separately from tests/sorter.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByRules } from '../src/core/sorter.js';
import { newThought, validateThought } from '../src/core/model.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);

const HELD_OUT = [
  ['send the invoice to Anna', 'task'], ['finish the quarterly report', 'task'], ['order new running shoes', 'task'],
  ['I must clean the garage', 'task'], ['need to pick up the parcel', 'task'],
  ['remind me to water the plants at 7pm', 'reminder'], ["don't forget mum's birthday on saturday", 'reminder'],
  ['reminder to submit the form tomorrow', 'reminder'], ['remember to lock the door at 10pm', 'reminder'],
  ['remind me about the meeting next week', 'reminder'],
  ['what if we made a game about tides', 'idea'], ["wouldn't it be cool to have a rooftop garden", 'idea'],
  ['an app that tracks how much sunlight I get', 'idea'], ['imagine a library inside a train station', 'idea'],
  ['we could sell handmade candles online', 'idea'],
  ['yesterday I felt grateful for my sister', 'journal'], ['today I was happy with the way the presentation went', 'journal'],
  ['the walk home was quiet and I felt tired', 'journal'], ['I feel sad about the news tonight', 'journal'],
  ['we were laughing all evening', 'journal'],
];

test('held-out labelled set: 20 thoughts, 5 per type, at least 80% correct', () => {
  const counts = HELD_OUT.reduce((m, [, t]) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {});
  assert.deepEqual(counts, { task: 5, reminder: 5, idea: 5, journal: 5 });
  const misses = HELD_OUT.map(([text, want]) => [text, want, sortByRules(text, NOW).type]).filter(([, want, got]) => want !== got);
  const correct = HELD_OUT.length - misses.length;
  assert.ok(correct / HELD_OUT.length >= 0.8, `${correct}/20 correct; misses: ${misses.map(([t, w, g]) => `"${t}" want ${w} got ${g}`).join('; ')}`);
});

test('AC-M3.1 invariants hold for every sample and for edge inputs', () => {
  const edge = ['a', 'x'.repeat(500), 'ÄÖÜ ünïcode thought 🙂', 'buy\nmilk\ttomorrow', '   spaced   out   ', '!!!', '12345', 'REMIND ME TO CALL MUM AT 6PM'];
  for (const text of [...HELD_OUT.map(([t]) => t), ...edge]) {
    const r = sortByRules(text, NOW);
    const t = newThought({ text, sortResult: r, now: NOW });
    assert.ok(['idea', 'task', 'journal', 'reminder'].includes(t.type), text);
    assert.ok(t.title.length >= 1 && t.title.length <= 60, `title length for "${text.slice(0, 30)}": ${t.title.length}`);
    assert.ok(t.tags.length <= 5 && t.tags.every((g) => g === g.toLowerCase() && g.length > 0), text);
    assert.deepEqual(validateThought(t), { ok: true, errors: [] }, text);
  }
});

test('the four example thoughts from AC-M3.2 sort as the requirement names them', () => {
  const want = { 'buy milk tomorrow': 'task', 'remind me to call mum at 6pm': 'reminder', 'what if the app let people share lists': 'idea', 'today was tiring but good': 'journal' };
  for (const [text, type] of Object.entries(want)) assert.equal(sortByRules(text, NOW).type, type, text);
});

test('sorting is deterministic and reads the passed clock, not the system clock', () => {
  const a = sortByRules('buy milk tomorrow', NOW);
  const b = sortByRules('buy milk tomorrow', new Date(NOW.getTime()));
  assert.deepEqual(a, b);
  const later = sortByRules('buy milk tomorrow', new Date(2027, 0, 5, 10, 0, 0));
  assert.notEqual(a.due_at, later.due_at, 'due_at is relative to the passed clock');
});
