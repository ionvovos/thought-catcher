import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/memory.js';
import { newThought } from '../src/core/model.js';
import { checkReview, reviewOnOpen, showReviewCount, watchNewDay } from '../src/core/reviewOnOpen.js';

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

test('due items and not yet shown today: navigates to the review', async () => {
  const store = await setup([idea('a', 4)]);
  const nav = [];
  const r = await reviewOnOpen({ store, getSettings: () => S, now: () => NOW, navigate: (h) => nav.push(h) });
  assert.deepEqual(r, { count: 1, autoShow: true, shown: true });
  assert.deepEqual(nav, ['#/review']);
});

test('nothing due: never shown', async () => {
  const store = await setup([idea('a', 1)]);
  const nav = [];
  const r = await reviewOnOpen({ store, getSettings: () => S, now: () => NOW, navigate: (h) => nav.push(h) });
  assert.equal(r.count, 0);
  assert.equal(r.shown, false);
  assert.deepEqual(nav, []);
});

test('already shown today and nothing left unresolved: not shown again; left unresolved: shown', async () => {
  const store = await setup([idea('a', 4)]);
  const shownToday = { ...S, 'review.last_shown_date': '2026-09-29' };
  assert.equal((await checkReview({ store, getSettings: () => shownToday, now: () => NOW })).autoShow, false);
  assert.equal((await checkReview({ store, getSettings: () => ({ ...shownToday, 'review.left_unresolved': true }), now: () => NOW })).autoShow, true);
});

test('interrupt false (home-screen capture launch): counted and autoShow true but no navigation', async () => {
  const store = await setup([idea('a', 4)]);
  const nav = [];
  const r = await reviewOnOpen({ store, getSettings: () => S, now: () => NOW, navigate: (h) => nav.push(h), interrupt: false });
  assert.equal(r.autoShow, true);
  assert.equal(r.shown, false);
  assert.deepEqual(nav, []);
});

test('showReviewCount labels the nav link', () => {
  const link = { textContent: 'Review', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const nav = { querySelector: (sel) => (sel === 'a[data-route="review"]' ? link : null) };
  showReviewCount(nav, 3);
  assert.equal(link.textContent, 'Review (3)');
  assert.equal(link.attrs['aria-label'], 'Review, 3 due');
  showReviewCount(nav, 0);
  assert.equal(link.textContent, 'Review');
  assert.equal('aria-label' in link.attrs, false);
  assert.doesNotThrow(() => showReviewCount(null, 2));
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
