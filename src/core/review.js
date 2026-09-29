// Daily review: which ideas and reminders come back, and how each action changes a thought (architecture section 8).
// Pure: `now` is always a parameter. settings is the flat object from getSettings() ('review.days', ...).

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const DEFAULT_DAYS = 3;

export function reviewDays(settings) {
  const n = Math.round(Number(settings?.['review.days']));
  return Number.isFinite(n) ? Math.min(30, Math.max(1, n)) : DEFAULT_DAYS;
}

// Local calendar date as YYYY-MM-DD.
export function localDate(now) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const ms = (iso) => Date.parse(iso);

export function isIdeaDue(t, days, now) {
  if (t.type !== 'idea') return false;
  const r = t.review ?? {};
  const at = r.snoozed_until ? ms(r.snoozed_until) : ms(r.last_reviewed_at ?? t.created_at) + days * DAY_MS;
  return now.getTime() >= at;
}

export function isReminderDue(t, now) {
  if (t.type !== 'reminder' || !t.due_at || t.done) return false;
  const r = t.review ?? {};
  if (r.dismissed) return false;
  if (ms(t.due_at) > now.getTime()) return false;
  return !r.snoozed_until || ms(r.snoozed_until) <= now.getTime();
}

// Returns { items: [{ kind: 'idea'|'reminder', thought }], count }. Reminders first, oldest due first; then ideas, oldest first.
export function computeReview(thoughts, settings, now) {
  const days = reviewDays(settings);
  const reminders = thoughts.filter((t) => isReminderDue(t, now)).sort((a, b) => ms(a.due_at) - ms(b.due_at));
  const ideas = thoughts.filter((t) => isIdeaDue(t, days, now)).sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const items = [
    ...reminders.map((thought) => ({ kind: 'reminder', thought })),
    ...ideas.map((thought) => ({ kind: 'idea', thought })),
  ];
  return { items, count: items.length };
}

const touch = (t, review, now) => ({ ...t, review: { ...t.review, ...review }, updated_at: now.toISOString() });

// Idea reviewed: leaves the review, its clock restarts.
export function markReviewed(t, now) {
  return touch(t, { last_reviewed_at: now.toISOString(), snoozed_until: null }, now);
}

// Keep (idea or reminder): comes back N days from now.
export function keepThought(t, settings, now) {
  return touch(t, { snoozed_until: new Date(now.getTime() + reviewDays(settings) * DAY_MS).toISOString() }, now);
}

// Dismiss (reminder): never resurfaces.
export function dismissReminder(t, now) {
  return touch(t, { dismissed: true }, now);
}

// Show on open when items exist and (not shown today, or the last review was left with items unresolved).
export function shouldAutoShow(count, settings, now) {
  if (count <= 0) return false;
  return settings?.['review.last_shown_date'] !== localDate(now) || settings?.['review.left_unresolved'] === true;
}

// Settings patch to store when the review screen is closed (AC-M7.4).
export function shownPatch(remaining, now) {
  return { 'review.last_shown_date': localDate(now), 'review.left_unresolved': remaining > 0 };
}
