// Review check when the app opens or becomes visible on a new day (M7). app.js calls these; nothing here reads the DOM
// except the two small helpers that take an element or document as a parameter.

import { computeReview, shouldAutoShow, localDate } from './review.js';

// deps: { store, getSettings(), now(): Date }. Returns { count, autoShow }.
export async function checkReview({ store, getSettings, now }) {
  const at = now();
  const { count } = computeReview(await store.getAll(), getSettings(), at);
  return { count, autoShow: shouldAutoShow(count, getSettings(), at) };
}

// Runs the check and, when the review should show, navigates to it unless `interrupt` is false (a home-screen capture
// launch should stay on the capture screen). Returns { count, autoShow, shown }.
export async function reviewOnOpen({ store, getSettings, now, navigate, interrupt = true }) {
  const result = await checkReview({ store, getSettings, now });
  const shown = result.autoShow && interrupt;
  if (shown) navigate('#/review');
  return { ...result, shown };
}

// Puts the due count on the Review link in the navigation, for example "Review (3)".
export function showReviewCount(nav, count) {
  const link = nav?.querySelector('a[data-route="review"]');
  if (!link) return;
  link.textContent = count > 0 ? `Review (${count})` : 'Review';
  if (count > 0) link.setAttribute('aria-label', `Review, ${count} due`);
  else link.removeAttribute('aria-label');
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
