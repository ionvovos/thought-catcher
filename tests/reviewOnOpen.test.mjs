import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/memory.js';
import { newThought } from '../src/core/model.js';
import { checkReview, reviewCardData, watchNewDay } from '../src/core/reviewOnOpen.js';

const DAY = 86400000;
const NOW = new Date(2026, 8, 29, 10, 0, 0);
const idea = (id, ageDays) => newThought({
  text: `idea ${id}`, id, now: new Date(NOW.getTime() - ageDays * DAY),
  sortResult: { type: 'idea', title: `Idea ${id}`, tags: [], confidence: 1, alt_type: null, due_at: null },
});
const S = { 'review.days': 3, 'review.last_shown_date': null, 'review.left_unresolved': false };

async function setup(thoughts) {
  const store = createMemoryStore();
  await store.putMany(thoughts);
  return store;
}

test('due items and not yet shown today: the card shows (AC-X8.3)', async () => {
  const store = await setup([idea('a', 4)]);
  const r = await checkReview({ store, getSettings: () => S, now: () => NOW });
  assert.deepEqual(r, { count: 1, autoShow: true });
});

test('nothing due: never shown', async () => {
  const store = await setup([idea('a', 1)]);
  const r = await checkReview({ store, getSettings: () => S, now: () => NOW });
  assert.equal(r.count, 0);
  assert.equal(r.autoShow, false);
});

test('the card lists at most five items and counts the rest (AC-X8.3)', async () => {
  const store = await setup(Array.from({ length: 8 }, (_, i) => idea(`n${i}`, 4 + i)));
  const d = await reviewCardData({ store, getSettings: () => S, now: () => NOW });
  assert.equal(d.count, 8);
  assert.equal(d.shown.length, 5);
  assert.equal(d.more, 3);
  assert.equal(d.autoShow, true);
});

test('an idea 3 days old is on the card and one 2 days old is not; the threshold comes from settings (AC-X8.1, AC-X8.5)', async () => {
  const store = await setup([idea('three', 3), idea('two', 2)]);
  assert.deepEqual((await reviewCardData({ store, getSettings: () => S, now: () => NOW })).shown.map((i) => i.thought.id), ['three']);
  const d = await reviewCardData({ store, getSettings: () => ({ ...S, 'review.days': 2 }), now: () => NOW });
  assert.deepEqual(d.shown.map((i) => i.thought.id).sort(), ['three', 'two']);
});

test('already shown today and nothing left unresolved: not shown again; left unresolved: shown', async () => {
  const store = await setup([idea('a', 4)]);
  const shownToday = { ...S, 'review.last_shown_date': '2026-09-29' };
  assert.equal((await checkReview({ store, getSettings: () => shownToday, now: () => NOW })).autoShow, false);
  assert.equal((await checkReview({ store, getSettings: () => ({ ...shownToday, 'review.left_unresolved': true }), now: () => NOW })).autoShow, true);
});

test('watchNewDay runs only when the page turns visible on a different local day', () => {
  let clock = NOW;
  const listeners = [];
  const doc = { visibilityState: 'visible', addEventListener: (t, f) => listeners.push(f), removeEventListener: (t, f) => listeners.splice(listeners.indexOf(f), 1) };
  let runs = 0;
  const stop = watchNewDay(doc, () => clock, () => { runs += 1; });
  listeners[0]();
  assert.equal(runs, 0, 'same day');
  clock = new Date(NOW.getTime() + DAY);
  doc.visibilityState = 'hidden';
  listeners[0]();
  assert.equal(runs, 0, 'hidden');
  doc.visibilityState = 'visible';
  listeners[0]();
  assert.equal(runs, 1, 'new day');
  listeners[0]();
  assert.equal(runs, 1, 'same new day again');
  stop();
  assert.equal(listeners.length, 0);
});
