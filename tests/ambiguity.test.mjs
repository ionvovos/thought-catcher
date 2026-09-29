import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAmbiguity, shortQuestion, hasContentWord } from '../src/core/ambiguity.js';
import { sortByRules } from '../src/core/sorter.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const ask = (text, source = 'typed') => detectAmbiguity(sortByRules(text, NOW), text, { source });
const words = (s) => s.split(/\s+/).length;

test('one input per ambiguity case', () => {
  assert.equal(ask('call mum').case, 1);
  assert.equal(ask('call mum').question, 'Task to do, or a reminder at a specific time?');
  assert.equal(ask('remind me to pay rent').case, 2);
  assert.equal(ask('remind me to pay rent').question, 'When should I remind you?');
  assert.equal(ask('what if we did it differently').case, 3);
  assert.equal(ask('what if we did it differently').question, 'What is the idea about?');
  assert.equal(ask('I keep thinking we should move to a smaller place').case, 4);
  assert.equal(ask('I keep thinking we should move to a smaller place').question, 'Is this an idea to develop, or a note for your journal?');
  const c5 = ask('buy milk', 'voice');
  assert.equal(c5.case, 5);
  assert.equal(c5.question, "I only caught 'buy milk'. What did you mean?");
});

test('clear cases ask nothing', () => {
  for (const t of ['buy milk', 'had a long walk', 'remind me to call mum at 6pm', 'what if the app let people share lists', 'today was tiring but good', 'buy milk tomorrow']) {
    assert.equal(ask(t), null, t);
  }
});

test('case 5 rules: typed text is never questioned for length; journal and cue-less are never questioned', () => {
  assert.equal(ask('buy milk', 'typed'), null);
  assert.equal(ask('hmm', 'voice'), null, 'cue-less sorts to journal');
  assert.equal(detectAmbiguity({ type: 'journal', alt_type: null, confidence: 0.2, due_at: null }, 'a b', { source: 'voice' }), null);
});

test('case 5 on low confidence for a non-journal type', () => {
  const r = { type: 'task', alt_type: 'idea', confidence: 0.35, due_at: null };
  assert.equal(detectAmbiguity(r, 'fix the leaking roof soon', { source: 'typed' }).case, 5);
  assert.equal(detectAmbiguity({ ...r, confidence: 0.4 }, 'fix the leaking roof soon', { source: 'typed' }), null);
});

test('AI results: same thresholds; at least one type always counts as scored', () => {
  const r = { type: 'task', alt_type: null, confidence: 0.3, due_at: null };
  assert.equal(detectAmbiguity(r, 'sort out the thing with the bank', { by: 'ai' }).case, 5);
  assert.equal(detectAmbiguity({ type: 'task', alt_type: 'reminder', confidence: 0.6, due_at: null }, 'x y z', { by: 'ai' }).case, 1);
  assert.equal(detectAmbiguity({ type: 'task', alt_type: 'reminder', confidence: 0.61, due_at: null }, 'x y z', { by: 'ai' }), null);
});

test('order: case 1 wins over case 5, first hit only', () => {
  assert.equal(detectAmbiguity({ type: 'reminder', alt_type: 'task', confidence: 0.3, due_at: null }, 'call mum', { source: 'voice' }).case, 1);
});

test('imports are never questioned', () => {
  assert.equal(detectAmbiguity({ type: 'reminder', alt_type: null, confidence: 1, due_at: null }, 'pay rent', { source: 'import' }), null);
});

test('every question is one sentence of at most 20 words, quote cut to 40 chars', () => {
  const long = 'a b c d e f g h i j k l m n o p q r s t u v w x y z';
  const q = shortQuestion(long);
  assert.ok(words(q) <= 20, q);
  const quoted = q.match(/'(.*)'/)[1];
  assert.ok(quoted.length <= 40);
  for (const t of ['call mum', 'remind me to pay rent', 'what if we did it differently']) assert.ok(words(ask(t).question) <= 20);
});

test('hasContentWord ignores stopwords and short words', () => {
  assert.equal(hasContentWord('what if we did it differently'), false);
  assert.equal(hasContentWord('I have an idea'), false);
  assert.equal(hasContentWord('share lists'), true);
});
