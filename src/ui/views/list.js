// Inbox and per-type views with live search, counts, empty states and the task done toggle.
import { el } from '../dom.js';
import { TYPES } from '../../core/model.js';
import { searchThoughts } from '../../core/search.js';

const LABELS = { idea: 'Ideas', task: 'Tasks', journal: 'Journal', reminder: 'Reminders' };
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function markers(t) {
  const out = [];
  if (t.clarify?.state === 'unavailable') out.push('needs a key to clarify');
  else if (t.clarify?.state === 'pending') out.push('unresolved');
  if (t.sort?.by === 'rules') out.push('sorted by rules');
  return out;
}

export default async function renderList(root, ctx) {
  let alive = true;
  const type = TYPES.includes(ctx.params?.type) ? ctx.params.type : null;
  const heading = type ? LABELS[type] : 'Inbox';
  const formatter = fmt();

  const search = el('input', { type: 'search', id: 'search', class: 'search', autocomplete: 'off', placeholder: 'Search title, text or tags' });
  const count = el('p', { class: 'count', role: 'status' });
  const listBox = el('div', { class: 'list-box' });

  const tabs = el('nav', { class: 'type-tabs', 'aria-label': 'Views' }, [
    el('a', { href: '#/inbox', 'aria-current': type ? null : 'page' }, 'All'),
    ...TYPES.map((t) => el('a', { href: `#/type/${t}`, 'aria-current': type === t ? 'page' : null }, LABELS[t])),
  ]);

  root.append(
    el('h2', {}, heading),
    tabs,
    el('label', { for: 'search', class: 'visually-hidden' }, 'Search thoughts'),
    search, count, listBox,
  );

  let all;
  try {
    all = await ctx.store.getAll();
  } catch (err) {
    listBox.append(el('p', { class: 'error', text: `Could not load thoughts: ${err.message}` }));
    return () => { alive = false; };
  }
  if (!alive) return () => {};

  const byNewest = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at);

  async function toggleDone(t, checked) {
    const now = ctx.now().toISOString();
    const updated = { ...t, done: checked, done_at: checked ? now : null, updated_at: now };
    await ctx.store.put(updated);
    all = all.map((x) => (x.id === t.id ? updated : x));
    draw();
  }

  function item(t) {
    const when = el('time', { datetime: t.created_at }, formatter.format(new Date(t.created_at)));
    const body = el('div', { class: 'thought-main' }, [
      el('h3', { class: 'thought-title' }, [
        el('a', { href: `#/thought/${encodeURIComponent(t.id)}`, class: t.done ? 'is-done' : '' }, t.title),
      ]),
      el('p', { class: 'thought-meta' }, [
        el('span', { class: `badge badge--${t.type}` }, capitalise(t.type)),
        t.tags.length ? el('ul', { class: 'tag-list', 'aria-label': 'Tags' }, t.tags.map((g) => el('li', { class: 'tag' }, g))) : null,
        when,
      ]),
      t.due_at ? el('p', { class: 'due' }, `Due ${formatter.format(new Date(t.due_at))}`) : null,
      markers(t).length ? el('p', { class: 'marker' }, markers(t).join(' · ')) : null,
    ]);
    const done = t.type === 'task'
      ? el('label', { class: 'done-toggle' }, [
        el('input', {
          type: 'checkbox', checked: t.done,
          onchange: (e) => { toggleDone(t, e.target.checked).catch((err) => { e.target.checked = !e.target.checked; console.error(err); }); },
        }),
        el('span', {}, 'Done'),
      ])
      : null;
    return el('li', { class: `thought-item${t.done ? ' is-done' : ''}` }, [done, body]);
  }

  function draw() {
    if (!alive) return;
    listBox.replaceChildren();
    const scoped = (type ? all.filter((t) => t.type === type) : all).slice().sort(byNewest);
    const query = search.value.trim();
    const shown = query ? searchThoughts(scoped, query).slice().sort(byNewest) : scoped;
    if (!scoped.length) {
      count.textContent = '';
      listBox.append(
        el('p', { class: 'empty' }, type ? `No ${LABELS[type].toLowerCase()} yet.` : 'No thoughts yet.'),
        el('a', { href: '#/capture', class: 'btn' }, 'Catch your first thought'),
      );
      return;
    }
    count.textContent = `${shown.length} ${shown.length === 1 ? 'thought' : 'thoughts'}`;
    if (!shown.length) {
      listBox.append(el('p', { class: 'empty' }, `No thoughts match "${query}".`));
      return;
    }
    listBox.append(el('ul', { class: 'thought-list' }, shown.map(item)));
  }

  search.addEventListener('input', draw);
  draw();
  return () => { alive = false; };
}
