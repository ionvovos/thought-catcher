// Review check when the app opens or becomes visible on a new day (X8). The review is a card on the assistant screen
// (AC-X8.4), never a page, so nothing here navigates. Pure except watchNewDay, which takes the document as a parameter.

import { computeReview, shouldAutoShow, localDate, visibleItems } from './review.js';

// deps: { store, getSettings(), now(): Date }. Returns { count, autoShow }.
export async function checkReview({ store, getSettings, now }) {
  const at = now();
  const { count } = computeReview(await store.getAll(), getSettings(), at);
  return { count, autoShow: shouldAutoShow(count, getSettings(), at) };
}

// What renderReviewCard needs: the items to list (at most five), how many more there are, and whether to show at all.
export async function reviewCardData({ store, getSettings, now }) {
  const at = now();
  const settings = getSettings();
  const { items, count } = computeReview(await store.getAll(), settings, at);
  const { shown, more } = visibleItems(items);
  return { items, shown, more, count, autoShow: shouldAutoShow(count, settings, at) };
}

// Calls `run` when the page becomes visible on a different local calendar day than the last check.
export function watchNewDay(doc, now, run) {
  let last = localDate(now());
  const onVisible = () => {
    if (doc.visibilityState !== 'visible') return;
    const today = localDate(now());
    if (today === last) return;
    last = today;
    run();
  };
  doc.addEventListener('visibilitychange', onVisible);
  return () => doc.removeEventListener('visibilitychange', onVisible);
}
