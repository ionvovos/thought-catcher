// The filed group (design.md 2.3): one card per capture, one row per thought. One-tap corrections: the type badge opens a
// four-option menu, the date chip a date menu, the pencil edits the title in place. Header (2 or more thoughts): Keep as
// one (AC-X3.4) and Undo all. Rows come from stored thoughts, so an edit shows at once.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { TYPE_META, TYPE_ORDER, typeMeta } from '../typeMeta.js';
import { formatWhen } from '../../core/reply.js';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "Tomorrow 09:00", "Fri 18:00", "Today 18:00".
export function whenLabel(iso, now) {
  return iso ? cap(formatWhen(iso, now)).replace(/(\s)0(\d:\d\d)$/, '$1$2') : '';
}

// thoughts: stored rows. handlers: { onType(thought, anchor), onDate(thought, anchor), onTitle(thought, title), onUndoAll(), onKeepOne() }.
export function renderFiledCard({ thoughts, now, handlers, animate = true }) {
  const n = thoughts.length;
  const rows = thoughts.map((t, i) => fileRow(t, i, { now, handlers, many: n > 1, animate }));
  const kids = [];
  if (n > 1) {
    kids.push(el('div', { class: 'filed__head' }, [
      el('span', { class: 'filed__title' }, [icon('check'), `Filed ${n}`]),
      el('span', { class: 'filed__acts' }, [
        el('button', { type: 'button', class: 'btn btn--plain', onclick: () => handlers.onKeepOne?.() }, 'Keep as one'),
        el('button', { type: 'button', class: 'btn btn--plain', onclick: () => handlers.onUndoAll?.() }, 'Undo all'),
      ]),
    ]));
  }
  return el('div', { class: 'filed', role: 'group', 'aria-label': 'Filed thoughts' }, [...kids, ...rows]);
}

function fileRow(t, i, { now, handlers, many, animate }) {
  const meta = typeMeta(t.type);
  const title = el('p', { class: 'fitem__title' }, t.title);
  const metaRow = el('div', { class: 'fitem__meta' });
  const badge = el('button', { type: 'button', class: `badge ${meta.cls} badge--btn`, 'aria-label': `Type: ${meta.label}. Change type`, 'aria-haspopup': 'menu', onclick: (e) => handlers.onType?.(t, e.currentTarget) }, [icon(meta.icon), meta.label, icon('down', 'i--sm')]);
  metaRow.append(badge);
  if (t.due_at) {
    const label = whenLabel(t.due_at, now);
    metaRow.append(el('button', { type: 'button', class: 'chipdate', 'aria-label': `Change date: ${label}`, 'aria-haspopup': 'menu', onclick: (e) => handlers.onDate?.(t, e.currentTarget) }, [icon('calendar'), label]));
  } else if (t.type === 'reminder') {
    metaRow.append(el('button', { type: 'button', class: 'chipdate', 'aria-label': 'Add a date', 'aria-haspopup': 'menu', onclick: (e) => handlers.onDate?.(t, e.currentTarget) }, [icon('calendar'), 'Add date']));
  }
  if (t.sort?.by === 'rules' || t.sort?.by === undefined) {
    metaRow.append(el('span', { class: 'by' }, [icon('list'), many ? 'split by rules' : 'sorted by rules']));
  }
  if (t.best_guess) metaRow.append(el('span', { class: 'by by--guess' }, 'best guess'));

  const main = el('div', { class: 'fitem__main' }, [title, metaRow]);
  const edit = el('button', { type: 'button', class: 'iconbtn', 'aria-label': `Edit ${t.title}`, onclick: () => beginEdit() }, icon('pencil'));

  function beginEdit() {
    const input = el('input', { class: 'fitem__edit', type: 'text', value: t.title, maxlength: '60', 'aria-label': 'Title' });
    let finished = false;
    const finish = (save) => {
      if (finished) return;
      finished = true;
      const next = input.value.trim();
      input.replaceWith(title);
      if (save && next && next !== t.title) { title.textContent = next; handlers.onTitle?.(t, next); }
      edit.focus();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    title.replaceWith(input);
    input.focus();
    input.select();
  }

  const row = el('div', { class: 'fitem', 'data-id': t.id }, [el('span', { class: `ticon ${meta.cls}`, 'aria-hidden': 'true' }, icon(meta.icon)), main, edit]);
  row.style.setProperty('--i', String(i));
  if (!animate) row.style.animation = 'none';
  return row;
}

export const typeMenuOptions = (current) => TYPE_ORDER.map((type) => ({ value: type, label: TYPE_META[type].label, icon: TYPE_META[type].icon, cls: TYPE_META[type].cls, checked: type === current }));
