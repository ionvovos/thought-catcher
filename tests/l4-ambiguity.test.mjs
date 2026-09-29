// L4 checks for AC-M4.1 to M4.8: every requirements section 3 example, run through the real rule sorter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByRules } from '../src/core/sorter.js';
import { detectAmbiguity, MAX_QUESTION_WORDS, CONFIDENCE_MARGIN, CONFIDENCE_FLOOR } from '../src/core/ambiguity.js';
import { newThought } from '../src/core/model.js';
import { canAsk, startClarify, skipClarify, applyAnswer, markUnavailable, resolveStale } from '../src/core/clarify.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const ask = (text, opts) => detectAmbiguity(sortByRules(text, NOW), text, opts);
const words = (q) => q.trim().split(/\s+/).length;
const make = (text) => {
  const sr = sortByRules(text, NOW);
  return { base: newThought({ text, sortResult: sr, now: NOW }), amb: detectAmbiguity(sr, text) };
};

test('each ambiguity case has a sample input that produces its question (section 3)', () => {
  assert.equal(ask('call the dentist')?.case, 1);
  assert.equal(ask('remind me to pay rent')?.case, 2);
  assert.equal(ask('what if we did it differently')?.case, 3);
  assert.equal(ask('I have an idea')?.case, 3);
  assert.equal(ask('I keep thinking we should move to a smaller place')?.case, 4);
  assert.equal(ask('buy milk', { source: 'voice' })?.case, 5);
});

test('clear cases produce no question', () => {
  for (const text of ['buy milk', 'buy milk tomorrow', 'remind me to call mum at 6pm', 'call mum at 6pm', 'what if the app let people share lists', 'today was tiring but good', 'had a long walk']) {
    assert.equal(ask(text), null, text);
  }
});

test('an import is never questioned, whatever the text', () => {
  for (const text of ['call the dentist', 'remind me to pay rent', 'what if we did it differently']) assert.equal(ask(text, { source: 'import' }), null, text);
});

test('order: the first applicable case wins and only one question comes back', () => {
  const both = { type: 'reminder', alt_type: 'task', confidence: 0.5, due_at: null }; // case 1 and case 2 both apply
  assert.equal(detectAmbiguity(both, 'call the dentist')?.case, 1);
  const noun = { type: 'idea', alt_type: 'journal', confidence: 0.5, due_at: null }; // case 3 (no content word) before case 4
  assert.equal(detectAmbiguity(noun, 'I have an idea')?.case, 3);
  const r = detectAmbiguity(both, 'call the dentist');
  assert.ok(r && typeof r.question === 'string' && !Array.isArray(r));
});

test('thresholds: margin and floor are as documented and inclusive/exclusive as written', () => {
  assert.equal(CONFIDENCE_MARGIN, 0.6);
  assert.equal(CONFIDENCE_FLOOR, 0.4);
  const at = (confidence) => detectAmbiguity({ type: 'task', alt_type: 'reminder', confidence, due_at: null }, 'buy something useful');
  assert.equal(at(0.6)?.case, 1, 'confidence 0.6 asks (<=)');
  assert.equal(at(0.61), null, 'confidence 0.61 does not ask');
  assert.equal(detectAmbiguity({ type: 'task', alt_type: null, confidence: 0.39, due_at: null }, 'buy something useful')?.case, 5, '0.39 is below the floor');
  assert.equal(detectAmbiguity({ type: 'task', alt_type: null, confidence: 0.4, due_at: null }, 'buy something useful'), null, '0.40 is not below the floor');
});

test('AC-M4.7: every question is one sentence of at most 20 words, including a very long garbled transcript', () => {
  const long = 'blah '.repeat(80).trim();
  const low = { type: 'task', alt_type: null, confidence: 0.2, due_at: null };
  const questions = [
    ask('call the dentist'), ask('remind me to pay rent'), ask('what if we did it differently'),
    ask('I keep thinking we should move to a smaller place'), ask('buy milk', { source: 'voice' }),
    detectAmbiguity(low, long, { source: 'voice' }),
    detectAmbiguity(low, `${'x'.repeat(200)} y z`, { source: 'voice' }),
  ].map((r) => r.question);
  for (const q of questions) {
    assert.ok(words(q) <= MAX_QUESTION_WORDS, `${words(q)} words: ${q}`);
  }
  assert.match(questions[4], /^I only caught 'buy milk'/);
});

test('cue-less short voice and journal entries are not questioned by case 5', () => {
  assert.equal(ask('hmm okay', { source: 'voice' }), null);
  assert.equal(ask('tired', { source: 'voice' }), null);
});

test('AC-M4.2: after the question is asked, answered or skipped, it can never be asked again', () => {
  const { base, amb } = make('call the dentist');
  assert.equal(canAsk(base), true);
  const pending = startClarify(base, amb, NOW);
  assert.equal(pending.clarify.state, 'pending');
  assert.equal(canAsk(pending), false);
  assert.throws(() => startClarify(pending, amb, NOW));
  const skipped = skipClarify(pending, NOW);
  assert.equal(skipped.clarify.state, 'skipped');
  assert.equal(canAsk(skipped), false);
  assert.throws(() => startClarify(skipped, amb, NOW));
  assert.throws(() => skipClarify(skipped, NOW), 'no second skip');
});

test('AC-M4.3: skip keeps the current best guess', () => {
  const { base, amb } = make('call the dentist');
  const skipped = skipClarify(startClarify(base, amb, NOW), NOW);
  for (const k of ['type', 'title', 'tags', 'due_at', 'text']) assert.deepEqual(skipped[k], base[k], k);
});

test('AC-M4.4: a text answer updates the record; case 2 answered locally makes no provider call', async () => {
  const { base, amb } = make('remind me to pay rent');
  const pending = startClarify(base, amb, NOW);
  let calls = 0;
  const provider = { clarify: async () => { calls += 1; throw new Error('must not be called'); } };
  const updated = await applyAnswer(pending, amb, 'tomorrow at 9am', provider, { now: NOW });
  assert.equal(calls, 0);
  assert.ok(updated.due_at, 'due time stored');
  assert.equal(updated.clarify.state, 'answered');
  assert.equal(updated.clarify.answer, 'tomorrow at 9am');
  assert.equal(updated.type, 'reminder');
});

test('a failed AI clarify leaves the thought exactly as it was and it can be retried', async () => {
  const { base, amb } = make('call the dentist');
  const pending = startClarify(base, amb, NOW);
  const snapshot = structuredClone(pending);
  const bad = { clarify: async () => { throw new Error('boom'); } };
  await assert.rejects(applyAnswer(pending, amb, 'a reminder at 5pm', bad, { now: NOW }));
  assert.deepEqual(pending, snapshot);
  const good = { model: 'm', clarify: async () => ({ type: 'reminder', title: 'Call the dentist', tags: ['dentist'], due_at: null }) };
  const ok = await applyAnswer(pending, amb, 'a reminder at 5pm', good, { now: NOW });
  assert.equal(ok.type, 'reminder');
  assert.equal(ok.clarify.state, 'answered');
});

test('AC-M4.6 / M4.8: no key marks unavailable; an open question left at close resolves to skipped and is not asked again', () => {
  const { base, amb } = make('call the dentist');
  const un = markUnavailable(base, amb, NOW);
  assert.equal(un.clarify.state, 'unavailable');
  assert.equal(canAsk(un), false);
  const pending = startClarify(base, amb, NOW);
  const fixed = resolveStale([pending, un, base], NOW);
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].clarify.state, 'skipped');
  assert.equal(canAsk(fixed[0]), false);
});
