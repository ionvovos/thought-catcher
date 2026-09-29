import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newThought } from '../src/core/model.js';
import { sortByRules } from '../src/core/sorter.js';
import { canAsk, startClarify, markUnavailable, skipClarify, resolveStale, applyAnswer, needsKeyMarker, isUnresolved } from '../src/core/clarify.js';
import { AiError } from '../src/core/ai/adapter.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const LATER = new Date(2026, 8, 29, 10, 5, 0);
const make = (text, source = 'typed') => newThought({ text, source, sortResult: sortByRules(text, NOW), now: NOW, id: `id-${text}` });
const Q1 = { case: 1, question: 'Task to do, or a reminder at a specific time?' };
const Q2 = { case: 2, question: 'When should I remind you?' };

test('pending -> answered by a provider patch; the original object is untouched', async () => {
  const t = startClarify(make('call mum'), Q1, NOW);
  assert.equal(t.clarify.state, 'pending');
  const provider = { model: 'm1', clarify: async () => ({ type: 'reminder', title: 'Call mum', tags: ['mum'], due_at: '2026-09-29T15:00:00.000Z' }) };
  const out = await applyAnswer(t, Q1, 'a reminder at 6', provider, { now: LATER });
  assert.equal(out.clarify.state, 'answered');
  assert.equal(out.clarify.answer, 'a reminder at 6');
  assert.equal(out.type, 'reminder');
  assert.equal(out.due_at, '2026-09-29T15:00:00.000Z');
  assert.equal(out.sort.by, 'ai');
  assert.equal(out.sort.model, 'm1');
  assert.equal(out.updated_at, LATER.toISOString());
  assert.equal(t.clarify.state, 'pending');
});

test('case 2 answers are parsed locally first: the provider is not called', async () => {
  const t = startClarify(make('remind me to pay rent'), Q2, NOW);
  let called = 0;
  const provider = { clarify: async () => { called += 1; throw new Error('should not run'); } };
  const out = await applyAnswer(t, Q2, 'tomorrow at 9am', provider, { now: NOW });
  assert.equal(called, 0);
  assert.equal(out.type, 'reminder');
  assert.equal(new Date(out.due_at).getHours(), 9);
  assert.equal(out.clarify.state, 'answered');
});

test('case 2 falls back to the provider when the answer has no time', async () => {
  const t = startClarify(make('remind me to pay rent'), Q2, NOW);
  const provider = { clarify: async () => ({ type: 'reminder', title: 'Pay rent', tags: [], due_at: '2026-10-01T09:00:00.000Z' }) };
  const out = await applyAnswer(t, Q2, 'on the first of the month', provider, { now: NOW });
  assert.equal(out.due_at, '2026-10-01T09:00:00.000Z');
});

test('a failing provider throws and the caller keeps the pending thought', async () => {
  const t = startClarify(make('call mum'), Q1, NOW);
  const provider = { clarify: async () => { throw new AiError('malformed', 'bad'); } };
  await assert.rejects(applyAnswer(t, Q1, 'reminder', provider, { now: NOW }), (e) => e.kind === 'malformed');
  assert.equal(t.clarify.state, 'pending');
});

test('skip, and no second question ever: state never returns to pending', () => {
  const t0 = make('call mum');
  assert.equal(canAsk(t0), true);
  const t1 = startClarify(t0, Q1, NOW);
  assert.equal(canAsk(t1), false);
  assert.throws(() => startClarify(t1, Q1, NOW));
  const t2 = skipClarify(t1, LATER);
  assert.equal(t2.clarify.state, 'skipped');
  assert.equal(isUnresolved(t2), true);
  assert.equal(canAsk(t2), false);
  assert.throws(() => startClarify(t2, Q1, NOW));
  assert.throws(() => skipClarify(t2, NOW));
});

test('answered thoughts cannot be asked again', async () => {
  const t = startClarify(make('remind me to pay rent'), Q2, NOW);
  const out = await applyAnswer(t, Q2, 'tomorrow', null, { now: NOW });
  assert.equal(canAsk(out), false);
  assert.throws(() => startClarify(out, Q2, NOW));
});

test('no key: unavailable marker, and it stays', () => {
  const t = markUnavailable(make('call mum'), Q1, NOW);
  assert.equal(t.clarify.state, 'unavailable');
  assert.equal(needsKeyMarker(t), true);
  assert.equal(canAsk(t), false);
});

test('app closed with a question open: on load it is skipped and never asked again', () => {
  const open = startClarify(make('call mum'), Q1, NOW);
  const done = skipClarify(startClarify(make('buy milk'), Q1, NOW), NOW);
  const fixed = resolveStale([open, done, make('a walk')], LATER);
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].clarify.state, 'skipped');
  assert.equal(canAsk(fixed[0]), false);
});

test('imported thoughts are never asked', () => {
  assert.equal(canAsk(make('call mum', 'import')), false);
});

test('empty answer and no provider are refused', async () => {
  const t = startClarify(make('call mum'), Q1, NOW);
  await assert.rejects(applyAnswer(t, Q1, '  ', {}, { now: NOW }));
  await assert.rejects(applyAnswer(t, Q1, 'task', null, { now: NOW }));
});
