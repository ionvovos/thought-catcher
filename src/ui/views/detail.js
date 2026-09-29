// One thought: edit type, title, tags, text and due time; done toggle for tasks; delete with confirmation;
// Expand (ideas only); re-sort with AI.
import { el } from '../dom.js';
import { TYPES, LIMITS, normalizeTags, makeTitle, validateThought } from '../../core/model.js';
import { describeAiError } from '../../core/ai/http.js';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function renderDetail(root, ctx) {
  let alive = true;
  let current;
  try {
    current = await ctx.store.get(ctx.params.id);
  } catch (err) {
    root.append(el('p', { class: 'error', text: `Could not load this thought: ${err.message}` }));
    return () => {};
  }
  if (!alive) return () => {};
  if (!current) {
    root.append(el('h2', {}, 'Not found'), el('p', { class: 'empty' }, 'This thought does not exist any more.'), el('a', { href: '#/inbox', class: 'btn' }, 'Back to the inbox'));
    return () => {};
  }

  const status = el('p', { class: 'capture-status', role: 'status', 'aria-live': 'polite' });
  const page = el('div', { class: 'detail' });
  root.append(page);

  const persist = async (updated) => {
    const check = validateThought(updated);
    if (!check.ok) throw new Error(check.errors.join('; '));
    await ctx.store.put(updated);
    current = updated;
  };

  function gatedButton({ label, kind, onRun, busyLabel }) {
    // needs-a-key and offline controls stay visible, look disabled and lead to the fix (never hidden, never silent)
    const st = ctx.ai.status();
    if (st.state !== 'ready') {
      const why = st.state === 'offline' ? 'offline' : 'needs a key';
      return el('button', {
        type: 'button', class: 'btn is-unavailable', 'aria-disabled': 'true',
        onclick: () => { if (st.state === 'nokey') ctx.navigate('#/settings'); },
      }, `${label} (${why})`);
    }
    const b = el('button', { type: 'button', class: 'btn', 'data-kind': kind }, label);
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.setAttribute('aria-busy', 'true');
      b.textContent = busyLabel;
      try {
        await onRun();
      } catch (err) {
        if (!alive) return;
        b.disabled = false;
        b.removeAttribute('aria-busy');
        b.textContent = 'Retry';
        const why = describeAiError(err);
        status.textContent = err?.kind === 'auth'
          ? 'key rejected'
          : `Could not do that: ${why}${why.includes('unchanged') ? '' : ' Your thought is unchanged.'}`;
      }
    });
    return b;
  }

  function expansionSection() {
    if (current.type !== 'idea') return null;
    const box = el('section', { class: 'section', 'aria-labelledby': 'expand-h' }, [el('h3', { id: 'expand-h' }, 'Expand this idea')]);
    const ex = current.expansion;
    if (ex) {
      box.append(
        el('h4', {}, 'Next steps'), el('ol', {}, ex.next_steps.map((s) => el('li', {}, s))),
        el('h4', {}, 'Questions to answer'), el('ul', {}, ex.questions.map((s) => el('li', {}, s))),
        el('h4', {}, 'Outline'), el('ul', {}, ex.outline.map((s) => el('li', {}, s))),
      );
    }
    box.append(gatedButton({
      label: ex ? 'Regenerate' : 'Expand', kind: 'expand', busyLabel: 'Working…',
      onRun: async () => {
        const updated = await ctx.ai.expand(current);
        current = updated;
        if (alive) { status.textContent = 'Expanded.'; draw(); }
      },
    }));
    return box;
  }

  function editForm() {
    const type = el('select', { id: 'f-type' }, TYPES.map((t) => el('option', { value: t, selected: t === current.type ? 'selected' : null }, capitalise(t))));
    type.value = current.type;
    const title = el('input', { type: 'text', id: 'f-title', maxlength: LIMITS.TITLE_MAX, value: current.title });
    const tags = el('input', { type: 'text', id: 'f-tags', value: current.tags.join(', '), 'aria-describedby': 'f-tags-hint' });
    const text = el('textarea', { id: 'f-text', rows: 4, value: current.text });
    const due = el('input', { type: 'datetime-local', id: 'f-due', value: toLocalInput(current.due_at) });
    const save = el('button', { type: 'submit', class: 'btn btn--primary' }, 'Save changes');

    const form = el('form', { class: 'edit-form' }, [
      el('div', { class: 'field' }, [el('label', { for: 'f-type' }, 'Type'), type]),
      el('div', { class: 'field' }, [el('label', { for: 'f-title' }, 'Title'), title]),
      el('div', { class: 'field' }, [el('label', { for: 'f-tags' }, 'Tags'), tags, el('p', { class: 'hint', id: 'f-tags-hint' }, 'Separate with commas. Up to 5.')]),
      el('div', { class: 'field' }, [el('label', { for: 'f-text' }, 'Text'), text]),
      el('div', { class: 'field' }, [el('label', { for: 'f-due' }, 'Due time (optional)'), due]),
      save,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = text.value.trim();
      if (!body) { status.textContent = 'The text cannot be empty.'; return; }
      save.disabled = true;
      try {
        await persist({
          ...current,
          text: body,
          type: type.value,
          title: title.value.trim() || makeTitle(body),
          tags: normalizeTags(tags.value.split(',')),
          due_at: due.value ? new Date(due.value).toISOString() : null,
          updated_at: ctx.now().toISOString(),
        });
        status.textContent = 'Saved.';
        draw();
      } catch (err) {
        status.textContent = `Could not save: ${err.message}`;
      } finally {
        save.disabled = false;
      }
    });
    return form;
  }

  function doneToggle() {
    if (current.type !== 'task') return null;
    const box = el('input', { type: 'checkbox', id: 'f-done', checked: current.done });
    box.addEventListener('change', async () => {
      const on = box.checked;
      const nowIso = ctx.now().toISOString();
      try {
        await persist({ ...current, done: on, done_at: on ? nowIso : null, updated_at: nowIso });
        status.textContent = on ? 'Marked done.' : 'Reopened.';
        draw();
      } catch (err) {
        box.checked = !on;
        status.textContent = `Could not save: ${err.message}`;
      }
    });
    return el('label', { class: 'done-toggle', for: 'f-done' }, [box, el('span', {}, 'Done')]);
  }

  function deleteControl() {
    const holder = el('div', { class: 'row' });
    const ask = el('button', { type: 'button', class: 'btn btn--danger' }, 'Delete');
    ask.addEventListener('click', () => {
      holder.replaceChildren(
        el('span', { role: 'alert' }, 'Delete this thought for good?'),
        el('button', {
          type: 'button', class: 'btn btn--danger', 'data-kind': 'confirm-delete',
          onclick: async () => {
            try { await ctx.store.delete(current.id); ctx.navigate('#/inbox'); } catch (err) { status.textContent = `Could not delete: ${err.message}`; }
          },
        }, 'Yes, delete'),
        el('button', { type: 'button', class: 'btn', onclick: () => { holder.replaceChildren(ask); ask.focus(); } }, 'Cancel'),
      );
    });
    holder.append(ask);
    return holder;
  }

  function draw() {
    if (!alive) return;
    const marks = [];
    if (current.sort.by === 'rules') marks.push('sorted by rules');
    if (current.clarify.state === 'unavailable') marks.push('needs a key to clarify');
    if (current.clarify.state === 'skipped') marks.push('unresolved');
    const resort = gatedButton({
      label: 'Re-sort with AI', kind: 'resort', busyLabel: 'Working…',
      onRun: async () => {
        current = await ctx.ai.resort(current);
        if (alive) { status.textContent = `Sorted by AI as ${current.type}: ${current.title}`; draw(); }
      },
    });
    page.replaceChildren(
      el('p', {}, el('a', { href: '#/inbox' }, '← Inbox')),
      el('h2', {}, current.title),
      el('p', { class: 'thought-meta' }, [
        el('span', { class: `badge badge--${current.type}` }, capitalise(current.type)),
        el('time', { datetime: current.created_at }, new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(current.created_at))),
        marks.length ? el('span', { class: 'marker' }, marks.join(' · ')) : null,
      ]),
      doneToggle(),
      editForm(),
      status,
      expansionSection(),
      el('div', { class: 'row' }, [resort]),
      el('div', { class: 'section' }, [deleteControl()]),
    );
  }

  draw();
  return () => { alive = false; };
}
