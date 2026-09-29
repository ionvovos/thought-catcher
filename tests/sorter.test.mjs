import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByRules } from '../src/core/sorter.js';
import { newThought, validateThought } from '../src/core/model.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const s = (text) => sortByRules(text, NOW);

test('worked checks (architecture 6.4)', () => {
  let r = s('buy milk tomorrow');
  assert.deepEqual(r.scores, { reminder: 1, task: 2, idea: 0, journal: 0 });
  assert.equal(r.type, 'task');
  assert.equal(r.alt_type, 'reminder');
  assert.equal(r.confidence, 0.67);
  assert.equal(r.due_at, new Date(2026, 8, 30, 9, 0).toISOString());

  r = s('call mum');
  assert.deepEqual(r.scores, { reminder: 2, task: 2, idea: 0, journal: 0 });
  assert.equal(r.type, 'reminder');
  assert.equal(r.alt_type, 'task');
  assert.equal(r.confidence, 0.5);
  assert.equal(r.due_at, null);

  r = s('call mum at 6pm');
  assert.deepEqual(r.scores, { reminder: 4, task: 2, idea: 0, journal: 0 });
  assert.equal(r.type, 'reminder');
  assert.equal(r.alt_type, 'task');
  assert.equal(r.confidence, 0.67);
  assert.ok(r.due_at);

  r = s('remind me to call mum at 6pm');
  assert.deepEqual(r.scores, { reminder: 5, task: 0, idea: 0, journal: 0 });
  assert.equal(r.type, 'reminder');
  assert.equal(r.alt_type, null);
  assert.equal(r.confidence, 1);
  assert.ok(r.due_at);
  assert.equal(r.title, 'Call mum at 6pm');

  r = s('I keep thinking we should move to a smaller place');
  assert.deepEqual(r.scores, { reminder: 0, task: 0, idea: 1, journal: 1 });
  assert.equal(r.type, 'idea');
  assert.equal(r.alt_type, 'journal');
  assert.equal(r.confidence, 0.5);
  assert.equal(r.due_at, null);
});

test('no cues gives journal with confidence 0', () => {
  const r = s('the sky over the harbour');
  assert.equal(r.type, 'journal');
  assert.equal(r.alt_type, null);
  assert.equal(r.confidence, 0);
});

test('tags and titles', () => {
  assert.deepEqual(s('pay the electricity bill').tags, ['electricity', 'bill']);
  for (const [text] of LABELLED) {
    const r = s(text);
    assert.ok(r.tags.length <= 3);
    assert.ok(r.tags.every((t) => t === t.toLowerCase()));
    assert.ok(r.title.length >= 1 && r.title.length <= 60);
  }
});

const LABELLED = [
  ['buy milk tomorrow', 'task'], ['pay the electricity bill', 'task'], ['I need to fix the bike brakes', 'task'],
  ['email the landlord about the leak', 'task'], ['renew car insurance before it expires', 'task'],
  ['remind me to call mum at 6pm', 'reminder'], ["don't forget the dentist appointment on friday", 'reminder'],
  ['reminder: team meeting at 10:30', 'reminder'], ['call the plumber tomorrow at 9am', 'reminder'],
  ['remember to take the bins out at 8pm', 'reminder'],
  ['what if the app let people share lists', 'idea'], ['idea: a podcast about local history', 'idea'],
  ['we could turn the spare room into a studio', 'idea'], ['an app that reminds you to drink water', 'idea'],
  ['imagine a bike lane along the whole seafront', 'idea'],
  ['today was tiring but good', 'journal'], ['I felt really happy after the long walk yesterday', 'journal'],
  ['grateful for a quiet morning with coffee', 'journal'], ['I feel tired and a bit sad tonight', 'journal'],
  ['the kids were so funny at dinner', 'journal'],
];

test('labelled set: at least 80% correct (20 thoughts, 5 per type)', () => {
  const misses = LABELLED.filter(([text, want]) => s(text).type !== want)
    .map(([text, want]) => `${text} (want ${want}, got ${s(text).type})`);
  assert.ok(LABELLED.length - misses.length >= 16, `misses: ${misses.join('; ')}`);
});

test('sorted results build valid thoughts', () => {
  for (const [text] of LABELLED) {
    const t = newThought({ text, sortResult: s(text), now: NOW });
    assert.deepEqual(validateThought(t), { ok: true, errors: [] }, text);
  }
});
