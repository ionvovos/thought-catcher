import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeThought, planMigration } from '../src/core/migrate.js';
import { validateThought } from '../src/core/model.js';
import { v1Thought, V1_NOW as NOW } from './fixtures/v1.js';

test('upgradeThought adds the four v2 fields and leaves every v1 field equal', () => {
  const v1 = v1Thought('buy milk tomorrow', 'a', { done: true, done_at: NOW.toISOString(), expansion: { next_steps: ['x'], questions: ['y'], outline: ['z'], generated_at: NOW.toISOString(), model: 'm' } });
  const v2 = upgradeThought(v1);
  assert.equal(v2.v, 2);
  assert.equal(v2.origin, null);
  assert.equal(v2.plan, null);
  assert.equal(v2.best_guess, false);
  const { origin, best_guess, plan, v, ...rest } = v2;
  void origin; void best_guess; void plan; void v;
  assert.deepEqual(rest, v1);
  assert.deepEqual(validateThought(v2), { ok: true, errors: [] });
});

test("sort.by 'ai' becomes 'key'", () => {
  const v1 = v1Thought('what if we shared lists', 'b');
  v1.sort = { ...v1.sort, by: 'ai', model: 'claude-x' };
  assert.equal(upgradeThought(v1).sort.by, 'key');
  assert.equal(upgradeThought(v1).sort.model, 'claude-x');
});

test('the input is not mutated, and a v2 row upgrades to itself', () => {
  const v1 = v1Thought('call mum', 'c');
  const copy = structuredClone(v1);
  const v2 = upgradeThought(v1);
  assert.deepEqual(v1, copy);
  assert.deepEqual(upgradeThought(v2), v2);
});

test('a row that fails v1 validation gives null; a non-object throws', () => {
  assert.equal(upgradeThought(v1Thought('x thing', 'd', { type: 'note' })), null);
  assert.equal(upgradeThought({ id: 'e' }), null);
  assert.throws(() => upgradeThought(null), TypeError);
  assert.throws(() => upgradeThought('row'), TypeError);
});

test('planMigration splits rows into upgraded and quarantined and lets a throwing upgrader propagate', () => {
  const rows = [v1Thought('buy milk', 'a'), v1Thought('bad one', 'b', { title: '' }), v1Thought('call mum', 'c')];
  const { upgraded, quarantined } = planMigration(rows);
  assert.deepEqual(upgraded.map((t) => t.id), ['a', 'c']);
  assert.deepEqual(quarantined.map((t) => t.id), ['b']);
  assert.throws(() => planMigration(rows, () => { throw new Error('boom'); }), /boom/);
});
