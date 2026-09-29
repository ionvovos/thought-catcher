// Daily review (M7): ideas not looked at for N days and reminders that are due.
import { el } from '../dom.js';
import { getSettings, setSettings } from '../../storage/settings.js';
import {
  computeReview, markReviewed, keepThought, dismissReminder, shownPatch, reviewDays,
} from '../../core/review.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const snippet = (s) => (s.length > 160 ? `${s.slice(0, 160).trim()}…` : s);

export default async function renderReview(root, ctx) {
  const settings = getSettings();
  const days = reviewDays(settings);
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const { items } = computeReview(await ctx.store.getAll(), settings, ctx.now());
  const startedWith = items.length;
  let remaining = items.length;
  let recorded = false;

  const status = el('p', { class: 'count', role: 'status', tabindex: '-1' });
  const list = el('ul', { class: 'thought-list' });
  const note = el('p', { class: 'hint' }, 'Reminders appear only when you open the app. There are no notifications.');

  function describe() {
    status.textContent = remaining === 0
      ? (startedWith === 0 ? 'Nothing to review right now.' : 'All done for now.')
      : `${remaining} to review.`;
  }

  function record() {
    if (recorded || startedWith === 0) return;
    recorded = true;
    setSettings(shownPatch(remaining, ctx.now()));
  }

  async function act(li, thought, make) {
    const updated = make(thought, ctx.now());
    await ctx.store.put(updated);
    li.remove();
    remaining -= 1;
    describe();
    status.focus();
  }

  function card({ kind, thought }) {
    const li = el('li', { class: 'thought-item' });
    const busy = (btn, make) => async () => {
      btn.disabled = true;
      try {
        await act(li, thought, make);
      } catch (err) {
        btn.disabled = false;
        status.textContent = `Could not save: ${err.message}`;
      }
    };
    const buttons = [];
    if (kind === 'idea') {
      const reviewed = el('button', { type: 'button' }, 'Reviewed');
      reviewed.addEventListener('click', busy(reviewed, (t, now) => markReviewed(t, now)));
      buttons.push(reviewed);
    }
    const keep = el('button', { type: 'button' }, `Keep for ${days} ${days === 1 ? 'day' : 'days'}`);
    keep.addEventListener('click', busy(keep, (t, now) => keepThought(t, getSettings(), now)));
    buttons.push(keep);
    if (kind === 'reminder') {
      const dismiss = el('button', { type: 'button' }, 'Dismiss');
      dismiss.addEventListener('click', busy(dismiss, (t, now) => dismissReminder(t, now)));
      buttons.push(dismiss);
    }
    li.append(el('div', { class: 'thought-main' }, [
      el('h3', { class: 'thought-title' }, el('a', { href: `#/thought/${encodeURIComponent(thought.id)}` }, thought.title)),
      el('p', { class: 'thought-meta' }, [
        el('span', { class: `badge badge--${thought.type}` }, cap(thought.type)),
        kind === 'reminder' && thought.due_at ? el('span', {}, `Was due ${fmt.format(new Date(thought.due_at))}`) : null,
      ]),
      el('p', {}, snippet(thought.text)),
      el('div', { class: 'row' }, buttons),
    ]));
    return li;
  }

  root.append(el('h2', {}, 'Review'), status, list);
  if (items.length === 0) {
    root.append(el('a', { href: '#/capture', class: 'btn' }, 'Back to capture'));
  } else {
    list.append(...items.map(card));
    const done = el('button', { type: 'button', class: 'btn--primary' }, 'Done for today');
    done.addEventListener('click', () => { record(); ctx.navigate('#/capture'); });
    root.append(el('div', { class: 'row' }, done));
  }
  root.append(note);
  describe();
  return record;
}
