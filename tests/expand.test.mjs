import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newThought } from '../src/core/model.js';
import { sortByRules } from '../src/core/sorter.js';
import { expandIdea, canExpand } from '../src/core/expand.js';
import { AiError } from '../src/core/ai/adapter.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const make = (text) => newThought({ text, sortResult: sortByRules(text, NOW), now: NOW, id: text });
const GOOD = { next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'] };

test('valid reply is stored with time and model; the input thought is not mutated', async () => {
  const idea = make('what if the app let people share lists');
  assert.equal(idea.type, 'idea');
  const out = await expandIdea(idea, { model: 'm', expand: async () => GOOD }, { now: NOW });
  assert.deepEqual(out.expansion.next_steps, ['a', 'b', 'c']);
  assert.equal(out.expansion.generated_at, NOW.toISOString());
  assert.equal(out.expansion.model, 'm');
  assert.equal(idea.expansion, null);
});

test('regenerate replaces only on a valid reply; a failure leaves the old expansion', async () => {
  const idea = make('what if the app let people share lists');
  const first = await expandIdea(idea, { expand: async () => GOOD }, { now: NOW });
  await assert.rejects(expandIdea(first, { expand: async () => { throw new AiError('malformed', 'bad'); } }, { now: NOW }));
  assert.deepEqual(first.expansion.questions, ['q1', 'q2', 'q3']);
  const second = await expandIdea(first, { expand: async () => ({ ...GOOD, questions: ['new'] }) }, { now: NOW });
  assert.deepEqual(second.expansion.questions, ['new']);
});

test('only ideas can be expanded, and a provider is required', async () => {
  const task = make('buy milk');
  assert.equal(canExpand(task), false);
  await assert.rejects(expandIdea(task, { expand: async () => GOOD }));
  const idea = make('what if the app let people share lists');
  assert.equal(canExpand(idea), true);
  await assert.rejects(expandIdea(idea, null));
});
