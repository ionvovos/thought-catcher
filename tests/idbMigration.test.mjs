import test from 'node:test';
import assert from 'node:assert/strict';
import { planMigration } from '../src/core/migrate.js';
import { validateThought } from '../src/core/model.js';
import { v1Thought } from './fixtures/v1.js';

// The IndexedDB version bump itself runs in e2e/v2-brain.mjs (headless Chrome, a database seeded with the a999310 schema).
// Here: the row logic it runs inside the versionchange transaction, over a v1 fixture set (AC-X10.1).
const TEXTS = [
  'buy milk tomorrow', 'what if the app let people share lists', 'today was tiring but good', 'remind me to call mum at 6pm',
  'pay the electricity bill before the 5th', 'a podcast about old Athens bars', 'gym app streak calendar', 'dentist on Thursday at 9',
];
const fixtureSet = () => TEXTS.map((t, i) => {
  const row = v1Thought(t, `t${i}`, { done: i % 3 === 0, done_at: i % 3 === 0 ? '2026-09-29T09:00:00.000Z' : null });
  if (i === 1) row.expansion = { next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'], generated_at: '2026-09-29T09:30:00.000Z', model: 'claude-x' };
  if (i === 2) row.review = { last_reviewed_at: '2026-09-28T09:00:00.000Z', snoozed_until: null, dismissed: true };
  if (i === 4) row.sort = { ...row.sort, by: 'ai', model: 'claude-x' };
  return row;
});

test('AC-X10.1: every v1 row keeps id, type, title, tags, dates, done state, expansion and review state', () => {
  const rows = fixtureSet();
  const { upgraded, quarantined } = planMigration(structuredClone(rows));
  assert.equal(quarantined.length, 0);
  assert.equal(upgraded.length, rows.length, 'N equal to the v1 count');
  for (let i = 0; i < rows.length; i += 1) {
    const before = rows[i];
    const after = upgraded[i];
    for (const k of ['id', 'text', 'type', 'title', 'tags', 'created_at', 'updated_at', 'due_at', 'done', 'done_at', 'expansion', 'review', 'clarify', 'source']) {
      assert.deepEqual(after[k], before[k], `${before.id}.${k}`);
    }
    assert.equal(after.sort.by, before.sort.by === 'ai' ? 'key' : before.sort.by);
    assert.deepEqual(validateThought(after), { ok: true, errors: [] });
  }
});

test('an unreadable row is quarantined and the rest migrate; a throwing row aborts (the caller keeps v1)', () => {
  const rows = fixtureSet();
  rows[3] = { ...rows[3], created_at: 'not a date' };
  const { upgraded, quarantined } = planMigration(rows);
  assert.equal(upgraded.length, rows.length - 1);
  assert.deepEqual(quarantined.map((r) => r.id), ['t3']);
  assert.deepEqual(quarantined[0], rows[3], 'the raw row is kept as it was');
  assert.throws(() => planMigration(rows, (row) => { if (row.id === 't5') throw new Error('request failed'); return row; }), /request failed/);
});
