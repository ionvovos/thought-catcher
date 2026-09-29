// Thought detail (X4 edit and done, X6 related, X7 expand and plan). Route #/thought/<id>.
// Every write goes through validateThought; user text reaches the DOM only as text nodes.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Button, IconButton } from '../components/button.js';
import { typeMeta, TYPE_META } from '../typeMeta.js';
import { LIMITS, normalizeTags, makeTitle, validateThought } from '../../core/model.js';
import { describeAiError } from '../../core/ai/http.js';
import { openMenu } from './menu.js';
import {
  whenLabel, dueLabel, dateLabel, SOURCE_LABEL, snippetOf, topicLine, relatedReason, aiAvailable, TYPE_ORDER,
} from '../library/view.js';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const TABS = [['next_steps', 'Next steps'], ['questions', 'Questions'], ['outline', 'Outline']];
const NEEDS_AI = {
  expand: ['Expand this idea', 'Download the assistant or add a key'],
  plan: ['Break into steps', 'Download the assistant or add a key'],
};

export async function renderThought(id, root, ctx) {
  let alive = true;
  let current;
  let editing = false;
  let tab = 'next_steps';
  let busy = null; // 'expand' | 'plan' | null
  let aiError = '';
  let explain = null; // 'expand' | 'plan' while the "needs AI" explanation is open
  let confirmDelete = false;
  let related = { list: [], topic: null };

  root.replaceChildren();
  const frame = el('div', { class: 'detail' });
  root.append(frame);

  try {
    current = await ctx.store.get(id);
  } catch {
    current = undefined;
  }
  if (!alive) return;
  if (!current) {
    frame.append(
      navbar(),
      el('section', { class: 'scroll no-scrollbar' }, el('div', { class: 'empty', role: 'status' }, [
        icon('search'), el('strong', {}, 'This thought is not here any more'), 'It may have been deleted.',
        Button({ label: 'Back to library', kind: 'tinted', pill: true, onClick: () => ctx.nav.go('#/library') }),
      ])),
    );
    return;
  }

  const live = el('p', { class: 'sr-only', role: 'status' });

  function navbar(actions = []) {
    return el('header', { class: 'navbar' }, [
      el('button', { type: 'button', class: 'navbar__back', onclick: () => ctx.nav.go('#/library') }, [icon('back'), 'Library']),
      el('div', { class: 'navbar__acts' }, actions),
    ]);
  }

  async function persist(updated) {
    const check = validateThought(updated);
    if (!check.ok) throw new Error(check.errors.join('; '));
    await ctx.store.put(updated);
    current = updated;
  }
  const stamp = () => ctx.now().toISOString();
  const say = (text) => { live.textContent = text; };

  async function changeType(type) {
    if (type === current.type) return;
    try {
      await persist({ ...current, type, updated_at: stamp(), sort: { ...current.sort, alt_type: null } });
      say(`Type changed to ${TYPE_META[type].label}.`);
    } catch (err) { aiError = `Could not save: ${err.message}`; }
    draw();
  }

  async function toggleDone() {
    const on = !current.done;
    const now = stamp();
    try {
      await persist({ ...current, done: on, done_at: on ? now : null, updated_at: now });
      say(on ? 'Marked done.' : 'Reopened.');
    } catch (err) { aiError = `Could not save: ${err.message}`; }
    draw();
  }

  async function remove() {
    try {
      await ctx.store.delete(current.id);
      alive = false;
      ctx.toast?.('Thought deleted');
      ctx.nav.go('#/library');
    } catch (err) {
      confirmDelete = false;
      aiError = `Could not delete: ${err.message}`;
      draw();
    }
  }

  async function share() {
    const text = `${current.title}\n\n${current.text}`;
    try { await navigator.share({ title: current.title, text }); } catch { /* cancelled */ }
  }

  // ---- AI sections ---------------------------------------------------------------------------------------------

  async function generate(kind) {
    if (busy) return;
    busy = kind;
    aiError = '';
    draw();
    try {
      const result = await ctx.brain[kind](current);
      const now = stamp();
      // The brain never writes: the result replaces the stored one only after it came back valid.
      await persist({ ...current, [kind === 'expand' ? 'expansion' : 'plan']: result, updated_at: now });
      say(kind === 'expand' ? 'Expanded.' : 'Plan made.');
    } catch (err) {
      aiError = err?.kind === 'auth' ? 'Key rejected.' : `${describeAiError(err)}${/unchanged|saved/.test(describeAiError(err)) ? '' : ' Your thought is unchanged.'}`;
    }
    busy = null;
    draw();
  }

  function needsAi(kind) {
    const [title, sub] = NEEDS_AI[kind];
    const box = [el('button', {
      type: 'button', class: 'needs-ai', 'aria-disabled': 'true', 'aria-expanded': String(explain === kind),
      onclick: () => { explain = explain === kind ? null : kind; draw(); },
    }, [icon('sparkles'), el('span', {}, [el('strong', {}, title), sub]), el('span', { class: 'pilltag' }, 'needs AI')])];
    if (explain === kind) {
      box.push(el('div', { class: 'notice detail__explain', role: 'status' }, [
        el('span', { class: 'notice__icon notice__icon--info' }, icon('info')),
        el('div', {}, [
          el('h3', {}, 'Two ways to get AI'),
          el('p', {}, 'Download the assistant: it runs on this phone and needs about 870 MB once. Or add your own AI key, which sends only the text of this thought to your provider.'),
        ]),
        el('div', { class: 'notice__actions' }, [
          Button({ label: 'Open Settings', kind: 'tinted', pill: true, onClick: () => ctx.nav.go('#/settings') }),
        ]),
      ]));
    }
    return box;
  }

  function genNote(by) {
    if (by !== 'device' && by !== 'key') return null;
    return el('div', { class: 'gen-note' }, [icon('chip', 'i--sm'), by === 'device' ? 'Made on this phone' : 'Made with your key']);
  }

  function regenerate(kind, has) {
    return el('button', {
      type: 'button', class: 'mini-btn', disabled: busy !== null, 'aria-busy': busy === kind ? 'true' : null,
      onclick: () => generate(kind),
    }, busy === kind ? 'Working…' : has ? 'Regenerate' : (kind === 'expand' ? 'Expand' : 'Plan'));
  }

  function loading(kind) {
    return el('div', { class: 'panel gen-loading', role: 'status' }, el('p', { class: 'shimmer' }, kind === 'expand' ? 'Expanding this idea' : 'Making a plan'));
  }

  function checkRow(text, done, onToggle) {
    const box = el('button', {
      type: 'button', class: `check${done ? ' check--on' : ''}`, role: 'checkbox', 'aria-checked': String(done), 'aria-label': text, onclick: onToggle,
    }, done ? icon('check') : null);
    return el('li', { class: `step${done ? ' step--done' : ''}` }, [box, el('span', { class: 'step__text' }, text)]);
  }

  function expandSection() {
    const ex = current.expansion;
    const kids = [el('div', { class: 'section-h' }, [el('h2', {}, [icon('sparkles'), 'Expand']), aiAvailable(ctx.status()) || ex ? regenerate('expand', Boolean(ex)) : null])];
    if (busy === 'expand') { kids.push(loading('expand')); return kids; }
    if (ex) {
      const done = new Set(ex.done_steps ?? []);
      kids.push(el('div', { class: 'seg', role: 'tablist', 'aria-label': 'Expansion' }, TABS.map(([key, label]) => el('button', {
        type: 'button', role: 'tab', 'aria-selected': String(tab === key), onclick: () => { tab = key; draw(); },
      }, label))));
      const rows = (ex[tab] ?? []).map((text, i) => (tab === 'next_steps'
        ? checkRow(text, done.has(i), async () => {
          const next = new Set(done);
          if (next.has(i)) next.delete(i); else next.add(i);
          try { await persist({ ...current, expansion: { ...ex, done_steps: [...next].sort((a, b) => a - b) }, updated_at: stamp() }); } catch (err) { aiError = `Could not save: ${err.message}`; }
          draw();
        })
        : el('li', { class: 'step' }, [el('span', { class: 'step__mark', 'aria-hidden': 'true' }, tab === 'questions' ? '?' : String(i + 1)), el('span', { class: 'step__text' }, text)])));
      kids.push(el('div', { class: 'panel', role: 'tabpanel' }, [el('ul', { class: 'steps' }, rows), genNote(ex.by)]));
    } else if (!aiAvailable(ctx.status())) {
      kids.push(...needsAi('expand'));
    } else {
      kids.push(el('p', { class: 'd-hint' }, 'Turn this idea into next steps, questions to answer and an outline.'));
    }
    return kids;
  }

  function planSection() {
    const plan = current.plan;
    const kids = [el('div', { class: 'section-h' }, [el('h2', {}, [icon('list'), 'Plan']), aiAvailable(ctx.status()) || plan ? regenerate('plan', Boolean(plan)) : null])];
    if (busy === 'plan') { kids.push(loading('plan')); return kids; }
    if (plan) {
      const rows = plan.steps.map((s, i) => checkRow(s.text, s.done, async () => {
        const steps = plan.steps.map((x, j) => (j === i ? { ...x, done: !x.done } : x));
        try { await persist({ ...current, plan: { ...plan, steps }, updated_at: stamp() }); } catch (err) { aiError = `Could not save: ${err.message}`; }
        draw();
      }));
      kids.push(el('div', { class: 'panel' }, [el('ul', { class: 'steps' }, rows), genNote(plan.by)]));
    } else if (!aiAvailable(ctx.status())) {
      kids.push(...needsAi('plan'));
    } else {
      kids.push(el('p', { class: 'd-hint' }, 'Break this task into small steps you can tick off.'));
    }
    return kids;
  }

  // ---- related (X6) --------------------------------------------------------------------------------------------

  async function loadRelated() {
    try {
      const [list, topics] = await Promise.all([ctx.brain.related(id, 3), current.type === 'idea' ? ctx.brain.topics() : []]);
      const all = await ctx.store.getAll();
      const byId = new Map(all.map((t) => [t.id, t]));
      const items = list.map((s) => byId.get(s.id)).filter(Boolean);
      const topic = topics.find((tp) => tp.ids.includes(id));
      related = { list: items, topic: topic ? { label: topic.label, members: topic.ids.map((i) => byId.get(i)).filter(Boolean) } : null };
    } catch {
      related = { list: [], topic: null };
    }
    draw();
  }

  function relatedSection() {
    const kids = [el('div', { class: 'section-h' }, el('h2', {}, [icon('link'), 'Related']))];
    if (!related.list.length && !related.topic) {
      kids.push(el('div', { class: 'empty empty--flat' }, [icon('link'), el('strong', {}, 'No related thoughts yet'), 'Thoughts with shared words or tags show up here.']));
      return kids;
    }
    if (related.topic) {
      const t = related.topic;
      kids.push(el('div', { class: 'topic' }, [icon('hash'), el('div', {}, [el('strong', {}, t.label.charAt(0).toUpperCase() + t.label.slice(1)), el('span', {}, topicLine(t.members))])]));
    }
    kids.push(el('div', { class: 'cards' }, related.list.map((t) => {
      const meta = typeMeta(t.type);
      const when = whenLabel(t, ctx.now());
      return el('button', {
        type: 'button', class: `tcard ${meta.cls}${t.done ? ' tcard--done' : ''}`, 'aria-label': `${meta.label}: ${t.title}. ${relatedReason(current, t)}. Open`,
        onclick: () => ctx.nav.go(`#/thought/${encodeURIComponent(t.id)}`),
      }, [
        el('span', { class: 'ticon', 'aria-hidden': 'true' }, icon(meta.icon)),
        el('p', { class: 'tcard__title' }, t.title),
        el('span', { class: 'tcard__when' }, when.text),
        el('span', { class: 'rel-why' }, [icon('link'), relatedReason(current, t)]),
      ]);
    })));
    return kids;
  }

  // ---- edit ----------------------------------------------------------------------------------------------------

  function editForm() {
    const title = el('input', { type: 'text', id: 'f-title', class: 'field__input', maxlength: LIMITS.TITLE_MAX, value: current.title, autocomplete: 'off' });
    const text = el('textarea', { id: 'f-text', class: 'field__input field__input--area', rows: 5 });
    text.value = current.text;
    const tags = el('input', { type: 'text', id: 'f-tags', class: 'field__input', value: current.tags.join(', '), autocomplete: 'off', autocapitalize: 'off', 'aria-describedby': 'f-tags-hint' });
    const due = el('input', { type: 'datetime-local', id: 'f-due', class: 'field__input', value: toLocalInput(current.due_at) });
    const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
    const field = (idf, label, control, hint) => el('div', { class: 'field' }, [el('label', { for: idf, class: 'field__label' }, label), control, hint ? el('p', { class: 'field__hint', id: `${idf}-hint` }, hint) : null]);
    const form = el('form', { class: 'edit-form' }, [
      field('f-title', 'Title', title),
      field('f-text', 'Text', text),
      field('f-tags', 'Tags', tags, 'Separate with commas. Up to 5.'),
      current.type === 'reminder' || current.type === 'task' ? field('f-due', 'Due (optional)', due) : null,
      error,
      el('div', { class: 'edit-form__acts' }, [
        Button({ label: 'Cancel', kind: 'secondary', onClick: () => { editing = false; draw(); } }),
        Button({ label: 'Save changes', kind: 'primary', type: 'submit' }),
      ]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = text.value.trim();
      if (!body) { error.textContent = 'The text cannot be empty.'; error.hidden = false; return; }
      try {
        await persist({
          ...current,
          text: body,
          title: title.value.trim() || makeTitle(body),
          tags: normalizeTags(tags.value.split(',')),
          due_at: due.value ? new Date(due.value).toISOString() : (current.type === 'reminder' || current.type === 'task' ? null : current.due_at),
          updated_at: stamp(),
        });
        editing = false;
        say('Saved.');
        draw();
      } catch (err) { error.textContent = `Could not save: ${err.message}`; error.hidden = false; }
    });
    return form;
  }

  // ---- page ----------------------------------------------------------------------------------------------------

  function typeBadge() {
    const meta = typeMeta(current.type);
    const btn = el('button', {
      type: 'button', class: `badge badge--btn ${meta.cls}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `Type: ${meta.label}. Change type`,
    }, [icon(meta.icon), meta.label, icon('down', 'i--sm')]);
    btn.addEventListener('click', () => openMenu(btn, TYPE_ORDER.map((ty) => ({ value: ty, label: TYPE_META[ty].label, icon: TYPE_META[ty].icon, selected: ty === current.type })), {
      label: 'Change type', onPick: changeType,
    }));
    return btn;
  }

  function moreMenu(btn) {
    const items = [{ value: 'edit', label: 'Edit', icon: 'pencil' }];
    if (current.type === 'task' || current.type === 'reminder') items.push({ value: 'done', label: current.done ? 'Reopen' : 'Mark done', icon: 'check' });
    items.push({ value: 'delete', label: 'Delete', icon: 'trash', danger: true });
    openMenu(btn, items, {
      label: 'More', align: 'end',
      onPick: (v) => {
        if (v === 'edit') { editing = true; draw(); }
        else if (v === 'done') toggleDone();
        else if (v === 'delete') { confirmDelete = true; draw(); }
      },
    });
  }

  function actionbar() {
    if (confirmDelete) {
      return el('footer', { class: 'actionbar actionbar--confirm', role: 'alert' }, [
        el('p', { class: 'actionbar__q' }, 'Delete this thought for good?'),
        Button({ label: 'Cancel', kind: 'secondary', onClick: () => { confirmDelete = false; draw(); } }),
        Button({ label: 'Delete', kind: 'danger', icon: 'trash', onClick: remove }),
      ]);
    }
    // Ideas and journal notes have nothing to tick off: their Delete lives in the More menu.
    if (current.type !== 'task' && current.type !== 'reminder') return null;
    const acts = [];
    acts.push(Button({ label: current.done ? 'Reopen' : 'Mark done', kind: 'tinted', icon: 'check', onClick: toggleDone }));
    acts.push(Button({ label: 'Delete', kind: 'secondary', icon: 'trash', onClick: () => { confirmDelete = true; draw(); } }));
    return el('footer', { class: 'actionbar' }, acts);
  }

  function meta() {
    const bits = [`${SOURCE_LABEL[current.source] ?? 'Captured'}, ${dateLabel(current.created_at)}`];
    if (current.due_at) bits.push(`Due ${dueLabel(current.due_at, ctx.now(), { clock: current.type === 'reminder' })}`);
    if (current.tags.length) bits.push(current.tags.map((g) => `#${g}`).join(' '));
    const nodes = [];
    bits.forEach((b, i) => { if (i) nodes.push(el('span', { 'aria-hidden': 'true' }, '·')); nodes.push(el('span', {}, b)); });
    return el('div', { class: 'd-meta' }, nodes);
  }

  function draw() {
    if (!alive || !frame.isConnected) return;
    const moreBtn = IconButton({ name: 'more', label: 'More' });
    moreBtn.setAttribute('aria-haspopup', 'menu');
    moreBtn.addEventListener('click', () => moreMenu(moreBtn));
    const acts = [];
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') acts.push(IconButton({ name: 'share', label: 'Share', onClick: share }));
    acts.push(moreBtn);

    const badges = [typeBadge()];
    if (current.sort?.by === 'rules') badges.push(el('span', { class: 'by' }, [icon('list'), 'sorted by rules']));
    if (current.best_guess) badges.push(el('span', { class: 'by by--guess' }, 'best guess'));

    const body = [];
    if (editing) {
      body.push(editForm());
    } else {
      body.push(el('div', { class: 'd-badges' }, badges), el('h1', { class: 'd-title' }, current.title), meta());
      const extra = snippetOf(current, 4000, { keepWording: true });
      if (extra) body.push(el('p', { class: 'd-body' }, extra));
      if (aiError) body.push(el('p', { class: 'field-error', role: 'alert' }, [icon('info'), aiError]));
      if (current.type === 'idea') body.push(...expandSection());
      if (current.type === 'task') body.push(...planSection());
      body.push(...relatedSection());
    }
    // replaceChildren turns a null argument into the text "null", so absent parts are filtered out first.
    frame.replaceChildren(...[
      navbar(acts),
      el('section', { class: 'scroll no-scrollbar', 'aria-label': 'Thought' }, [...body, live]),
      editing ? null : actionbar(),
    ].filter(Boolean));
  }

  draw();
  loadRelated();
}
