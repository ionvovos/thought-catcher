// Daily review card (X8): shown above the orb on open. Returns null when nothing is due or it was already shown today
// (AC-X8.3). The card never blocks the orb (AC-X8.4). Every action writes the thought, then the card redraws from the store.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Button, IconButton } from '../components/button.js';
import { typeMeta } from '../typeMeta.js';
import { reviewCardData } from '../../core/reviewOnOpen.js';
import {
  markReviewed, keepThought, letGoIdea, markReminderDone, snoozeToTomorrow, reviewLede, ideaAge, reviewDays, shownPatch,
} from '../../core/review.js';
import { dueLabel, dayDiff } from '../library/view.js';

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export async function renderReviewCard(ctx) {
  const settingsApi = ctx.settings;
  const dataFor = () => reviewCardData({ store: ctx.store, getSettings: () => settingsApi.getSettings(), now: ctx.now });
  const first = await dataFor();
  if (!first.autoShow) return null;
  // Shown today. Items left over bring it back on the next open (AC-X8.3); Close dismisses it for the day.
  settingsApi.setSettings(shownPatch(first.count, ctx.now()));

  const card = el('article', { class: 'review review--compact no-scrollbar', role: 'region', 'aria-label': 'Daily review' });
  const live = el('p', { class: 'sr-only', role: 'status' });
  let busy = false;
  let closed = false;

  function close() {
    closed = true;
    settingsApi.setSettings(shownPatch(0, ctx.now()));
    card.dispatchEvent(new CustomEvent('review-closed', { bubbles: true }));
    card.remove();
  }

  async function act(thought, make, said) {
    if (busy) return;
    busy = true;
    try {
      await ctx.store.put(make(thought));
      live.textContent = said;
    } catch (err) {
      live.textContent = `Could not save: ${err.message}`;
    }
    busy = false;
    await draw();
  }

  function itemRow({ kind, thought }) {
    const meta = typeMeta(thought.type);
    const now = ctx.now();
    const days = reviewDays(settingsApi.getSettings());
    const at = dueLabel(thought.due_at ?? thought.created_at, now).replace(/^(Today|Tomorrow|Yesterday) /, '$1 at ');
    const sub = kind === 'reminder' ? (dayDiff(new Date(thought.due_at), now) < 0 ? `Was due ${at}` : at) : ideaAge(thought, now);
    const open = el('button', { type: 'button', class: 'ritem__title', onclick: () => ctx.nav.go(`#/thought/${encodeURIComponent(thought.id)}`) }, thought.title);
    const acts = kind === 'reminder'
      ? [
        Button({ label: 'Done', kind: 'tinted', icon: 'check', onClick: () => act(thought, (t) => markReminderDone(t, ctx.now()), `${thought.title} done.`) }),
        Button({ label: 'Tomorrow', kind: 'secondary', onClick: () => act(thought, (t) => snoozeToTomorrow(t, ctx.now()), `${thought.title} moved to tomorrow.`) }),
      ]
      : [
        Button({
          label: 'Expand', kind: 'tinted', icon: 'sparkles',
          onClick: async () => { await ctx.store.put(markReviewed(thought, ctx.now())).catch(() => {}); ctx.nav.go(`#/thought/${encodeURIComponent(thought.id)}`); },
        }),
        Button({ label: 'Keep', kind: 'secondary', ariaLabel: `Keep for ${days} ${days === 1 ? 'day' : 'days'}`, onClick: () => act(thought, (t) => keepThought(t, settingsApi.getSettings(), ctx.now()), `Kept for ${days} ${days === 1 ? 'day' : 'days'}.`) }),
        Button({ label: 'Let go', kind: 'secondary', ariaLabel: `Let go of ${thought.title}`, onClick: () => act(thought, (t) => letGoIdea(t, ctx.now()), `${thought.title} let go. It stays in your library.`) }),
      ];
    return el('div', { class: `ritem ${meta.cls}` }, [
      el('span', { class: 'ticon', 'aria-hidden': 'true' }, icon(meta.icon)),
      el('div', { class: 'ritem__main' }, [open, el('p', { class: 'ritem__sub' }, sub)]),
      el('div', { class: 'ritem__acts' }, acts),
    ]);
  }

  async function draw() {
    const d = await dataFor();
    if (closed) return;
    const head = el('div', { class: 'review__head' }, [
      el('div', {}, [el('div', { class: 'review__eyebrow' }, DAY.format(ctx.now())), el('h1', {}, 'Your quiet minute')]),
      IconButton({ name: 'x', label: 'Close review', onClick: close, className: 'review__close' }),
    ]);
    const kids = [head, el('p', { class: 'review__lede' }, d.count ? reviewLede(d.items) : 'All clear for today.')];
    if (d.count === 0) {
      kids.push(el('div', { class: 'review__clear' }, [icon('check'), 'Nothing is waiting for you.']));
    } else {
      kids.push(...d.shown.map(itemRow));
      if (d.more) kids.push(el('p', { class: 'review__more' }, `and ${d.more} more ${d.more === 1 ? 'is' : 'are'} waiting`));
    }
    kids.push(live);
    card.replaceChildren(...kids);
  }

  await draw();
  return card;
}
