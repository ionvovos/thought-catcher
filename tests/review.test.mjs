import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newThought } from '../src/core/model.js';
import {
  computeReview, markReviewed, keepThought, dismissReminder, shouldAutoShow, shownPatch, localDate, reviewDays,
} from '../src/core/review.js';

const DAY = 86400000;
const NOW = new Date(2026, 8, 29, 10, 0, 0);
const ago = (days) => new Date(NOW.getTime() - days * DAY);
const S = { 'review.days': 3, 'review.last_shown_date': null, 'review.left_unresolved': false };

function make(id, type, createdAt, extra = {}) {
  const t = newThought({
    text: `${type} ${id}`, id, now: createdAt,
    sortResult: { type, title: `${type} ${id}`, tags: [], confidence: 1, alt_type: null, due_at: null },
  });
  return { ...t, ...extra };
}
const ids = (r) => r.items.map((i) => i.thought.id);

test('idea created 3 days ago and not reviewed is due; 2 days ago is not', () => {
  const r = computeReview([make('old', 'idea', ago(3)), make('new', 'idea', ago(2))], S, NOW);
  assert.deepEqual(ids(r), ['old']);
  assert.equal(r.items[0].kind, 'idea');
  assert.equal(r.count, 1);
});

test('threshold N comes from settings and is clamped to 1-30', () => {
  const t = [make('a', 'idea', ago(5))];
  assert.equal(computeReview(t, { ...S, 'review.days': 7 }, NOW).count, 0);
  assert.equal(computeReview(t, { ...S, 'review.days': 5 }, NOW).count, 1);
  assert.equal(reviewDays({ 'review.days': 0 }), 1);
  assert.equal(reviewDays({ 'review.days': 99 }), 30);
  assert.equal(reviewDays({}), 3);
});

test('reminder: due when its time has passed; future and dismissed and done are not', () => {
  const past = make('p', 'reminder', ago(1), { due_at: ago(0.1).toISOString() });
  const future = make('f', 'reminder', ago(1), { due_at: new Date(NOW.getTime() + DAY).toISOString() });
  const noTime = make('n', 'reminder', ago(1));
  const dismissed = make('d', 'reminder', ago(1), { due_at: ago(0.5).toISOString(), review: { last_reviewed_at: null, snoozed_until: null, dismissed: true } });
  const done = make('x', 'reminder', ago(1), { due_at: ago(0.5).toISOString(), done: true });
  const r = computeReview([past, future, noTime, dismissed, done], S, NOW);
  assert.deepEqual(ids(r), ['p']);
  assert.equal(r.items[0].kind, 'reminder');
});

test('tasks and journal entries never appear', () => {
  const t = [make('t', 'task', ago(10), { due_at: ago(1).toISOString() }), make('j', 'journal', ago(10))];
  assert.equal(computeReview(t, S, NOW).count, 0);
});

test('reviewed idea leaves the review and its clock restarts', () => {
  const idea = make('a', 'idea', ago(4));
  const done = markReviewed(idea, NOW);
  assert.equal(done.review.last_reviewed_at, NOW.toISOString());
  assert.equal(done.review.snoozed_until, null);
  assert.equal(computeReview([done], S, NOW).count, 0);
  assert.equal(computeReview([done], S, new Date(NOW.getTime() + 2 * DAY)).count, 0);
  assert.equal(computeReview([done], S, new Date(NOW.getTime() + 3 * DAY)).count, 1);
  assert.equal(idea.review.last_reviewed_at, null, 'input untouched');
});

test('kept idea comes back N days from now', () => {
  const kept = keepThought(make('a', 'idea', ago(9)), S, NOW);
  assert.equal(kept.review.snoozed_until, new Date(NOW.getTime() + 3 * DAY).toISOString());
  assert.equal(computeReview([kept], S, new Date(NOW.getTime() + 3 * DAY - 1000)).count, 0);
  assert.equal(computeReview([kept], S, new Date(NOW.getTime() + 3 * DAY)).count, 1);
});

test('a kept reminder stays hidden until snoozed_until', () => {
  const rem = make('r', 'reminder', ago(2), { due_at: ago(1).toISOString() });
  assert.equal(computeReview([rem], S, NOW).count, 1);
  const kept = keepThought(rem, S, NOW);
  assert.equal(computeReview([kept], S, NOW).count, 0);
  assert.equal(computeReview([kept], S, new Date(NOW.getTime() + 2 * DAY)).count, 0);
  assert.equal(computeReview([kept], S, new Date(NOW.getTime() + 3 * DAY)).count, 1);
});

test('dismissed reminder never returns', () => {
  const rem = dismissReminder(make('r', 'reminder', ago(2), { due_at: ago(1).toISOString() }), NOW);
  assert.equal(rem.review.dismissed, true);
  assert.equal(computeReview([rem], S, new Date(NOW.getTime() + 60 * DAY)).count, 0);
});

test('order: reminders first (oldest due first), then ideas (oldest first)', () => {
  const t = [
    make('i2', 'idea', ago(5)), make('i1', 'idea', ago(8)),
    make('r2', 'reminder', ago(1), { due_at: ago(0.2).toISOString() }), make('r1', 'reminder', ago(1), { due_at: ago(0.5).toISOString() }),
  ];
  assert.deepEqual(ids(computeReview(t, S, NOW)), ['r1', 'r2', 'i1', 'i2']);
});

test('auto-show: nothing due means never; once per local day unless items were left unresolved', () => {
  assert.equal(shouldAutoShow(0, S, NOW), false);
  assert.equal(shouldAutoShow(0, { ...S, 'review.left_unresolved': true }, NOW), false);
  assert.equal(shouldAutoShow(2, S, NOW), true);
  const shownToday = { ...S, 'review.last_shown_date': localDate(NOW) };
  assert.equal(shouldAutoShow(2, shownToday, NOW), false);
  assert.equal(shouldAutoShow(2, { ...shownToday, 'review.left_unresolved': true }, NOW), true);
  assert.equal(shouldAutoShow(2, shownToday, new Date(NOW.getTime() + DAY)), true);
});

test('closing the review records the date and whether items remain', () => {
  assert.deepEqual(shownPatch(2, NOW), { 'review.last_shown_date': '2026-09-29', 'review.left_unresolved': true });
  assert.deepEqual(shownPatch(0, NOW), { 'review.last_shown_date': '2026-09-29', 'review.left_unresolved': false });
});

test('now is a parameter: same input, same result', () => {
  const t = [make('a', 'idea', ago(4))];
  assert.deepEqual(computeReview(t, S, NOW), computeReview(t, S, NOW));
});
