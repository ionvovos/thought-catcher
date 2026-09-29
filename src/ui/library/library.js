// Library sheet content (X4): search, filters, thoughts grouped by type. S1's openSheet owns the frame (grabber, title and
// count, close, detents, Back); this fills sheet.body. Focusing the search field asks for the full detent through a bubbling
// `sheet-detent` event (detail: 'full'). Text from thoughts only ever reaches the DOM as text nodes.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Button } from '../components/button.js';
import { Chip } from '../components/chip.js';
import { typeMeta } from '../typeMeta.js';
import { TYPE_ORDER, TYPE_PLURAL, libraryView, countsOf, whenLabel, snippetOf, highlightParts, topicLine } from './view.js';
import { renderAnswer } from '../ask/index.js';

const marked = (text, q) => highlightParts(text, q).map((p) => (p.hit ? el('mark', {}, p.text) : p.text));

function thoughtCard(t, ctx, q) {
  const meta = typeMeta(t.type);
  const when = whenLabel(t, ctx.now());
  const snip = snippetOf(t);
  const node = el('button', {
    type: 'button',
    class: `tcard ${meta.cls}${t.done ? ' tcard--done' : ''}`,
    'aria-label': `${meta.label}${t.done ? ', done' : ''}: ${t.title}. ${when.text}. Open`,
    onclick: () => ctx.nav.go(`#/thought/${encodeURIComponent(t.id)}`),
  }, [
    el('span', { class: 'ticon', 'aria-hidden': 'true' }, icon(meta.icon)),
    el('p', { class: 'tcard__title' }, marked(t.title, q)),
    el('span', { class: `tcard__when${when.due ? ' tcard__when--due' : ''}` }, when.text),
    snip ? el('p', { class: 'tcard__snip' }, marked(snip, q)) : null,
    t.tags?.length ? el('span', { class: 'tags' }, t.tags.map((g) => el('span', { class: 'tag' }, `#${g}`))) : null,
  ]);
  return node;
}

export function mountLibrary(sheetBody, ctx) {
  const f = { q: '', type: null, tag: null, state: null, topic: null };
  let thoughts = [];
  let topics = [];
  let alive = true;
  let answerToken = 0;

  const input = el('input', {
    type: 'text', class: 'search__input', placeholder: 'Search or ask', 'aria-label': 'Search thoughts',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', inputmode: 'search',
  });
  const clearBtn = el('button', { type: 'button', class: 'clear', 'aria-label': 'Clear search', hidden: true }, el('span', {}, icon('x')));
  const cancel = Button({ label: 'Cancel', kind: 'plain', onClick: () => { setQuery(''); input.blur(); } });
  cancel.hidden = true;
  const searchRow = el('div', { class: 'searchrow' }, [
    el('label', { class: 'search' }, [icon('search'), input, clearBtn]),
    cancel,
  ]);
  const typeChips = el('div', { class: 'chips no-scrollbar', role: 'toolbar', 'aria-label': 'Filter by type' });
  const tagChips = el('div', { class: 'chips chips--tags no-scrollbar', role: 'toolbar', 'aria-label': 'Filter by tag and state' });
  const list = el('div', { class: 'sheet__body lib__list no-scrollbar' });
  const live = el('p', { class: 'sr-only', role: 'status' });
  const root = el('div', { class: 'lib' }, [searchRow, typeChips, tagChips, list, live]);
  sheetBody.append(root);

  const askText = (text) => ctx.brain?.intent?.(text)?.kind === 'ask';

  function setQuery(q) {
    f.q = q;
    input.value = q;
    answerToken += 1;
    draw();
  }

  async function ask(text) {
    const q = text.trim();
    if (!q) return;
    const handled = !sheetBody.dispatchEvent(new CustomEvent('tc-ask', { bubbles: true, cancelable: true, detail: { text: q } }));
    if (handled) return;
    const mine = ++answerToken;
    list.replaceChildren(el('p', { class: 'results-h', role: 'status' }, 'Looking through your thoughts'));
    let answer;
    try { answer = await ctx.brain.ask(q); } catch { answer = null; }
    if (!alive || mine !== answerToken) return;
    draw();
    if (answer) list.prepend(el('div', { class: 'lib__answer' }, renderAnswer(answer, ctx)));
  }

  function drawChips(view) {
    const all = view.counts;
    typeChips.replaceChildren(
      Chip({ label: 'All', count: all.all, pressed: !f.type, onClick: () => { f.type = null; draw(); } }),
      ...TYPE_ORDER.map((ty) => Chip({
        label: TYPE_PLURAL[ty], count: all[ty], type: ty, pressed: f.type === ty, onClick: () => { f.type = f.type === ty ? null : ty; draw(); },
      })),
    );
    tagChips.replaceChildren(
      Chip({ label: 'Open', tag: true, pressed: f.state === 'open', onClick: () => { f.state = f.state === 'open' ? null : 'open'; if (f.state) f.type = null; draw(); } }),
      Chip({ label: 'Done', tag: true, pressed: f.state === 'done', onClick: () => { f.state = f.state === 'done' ? null : 'done'; if (f.state) f.type = null; draw(); } }),
      ...view.tags.map((g) => Chip({ label: `#${g}`, tag: true, pressed: f.tag === g, onClick: () => { f.tag = f.tag === g ? null : g; draw(); } })),
    );
  }

  function emptyState(view) {
    if (view.total === 0) {
      return el('div', { class: 'empty' }, [icon('stack'), el('strong', {}, 'Nothing yet'), 'Your first thought lands here. Tap the orb and say anything.']);
    }
    if (f.q.trim()) {
      return el('div', { class: 'empty', role: 'status' }, [
        icon('search'),
        el('strong', {}, `No thoughts match "${f.q.trim()}"`),
        'Try other words, or ask the assistant.',
        Button({ label: 'Ask instead', kind: 'tinted', pill: true, icon: 'sparkles', onClick: () => ask(f.q) }),
      ]);
    }
    return el('div', { class: 'empty', role: 'status' }, [
      icon('stack'),
      el('strong', {}, 'Nothing here'),
      'No thoughts match these filters.',
      Button({ label: 'Show all', kind: 'tinted', pill: true, onClick: () => { f.type = null; f.tag = null; f.state = null; draw(); } }),
    ]);
  }

  function draw() {
    if (!alive) return;
    const view = libraryView(thoughts, { ...f, ids: f.topic?.ids ?? null });
    const all = countsOf(thoughts);
    clearBtn.hidden = !f.q;
    const searching = Boolean(f.q) || document.activeElement === input;
    cancel.hidden = !searching;
    typeChips.hidden = tagChips.hidden = thoughts.length === 0 || (view.shown === 0 && Boolean(f.q.trim()));
    if (f.tag && !view.tags.includes(f.tag) && thoughts.length) f.tag = null;
    drawChips(view);
    const kids = [];
    if (f.topic) {
      kids.push(el('div', { class: 'topicbar' }, [
        el('span', {}, [icon('hash'), `Topic: ${f.topic.label}`]),
        el('button', { type: 'button', class: 'mini-btn', onclick: () => { f.topic = null; draw(); } }, 'Show all'),
      ]));
    } else if (!view.filtered) {
      for (const tp of topics.slice(0, 2)) {
        const members = thoughts.filter((t) => tp.ids.includes(t.id));
        if (members.length < 3) continue;
        kids.push(el('button', { type: 'button', class: 'topic', onclick: () => { f.topic = { label: tp.label, ids: tp.ids }; draw(); } }, [
          icon('hash'), el('div', {}, [el('strong', {}, tp.label.charAt(0).toUpperCase() + tp.label.slice(1)), el('span', {}, topicLine(members))]),
        ]));
      }
    }
    if (!view.shown) kids.push(emptyState(view));
    else {
      if (f.q.trim()) kids.push(el('p', { class: 'results-h' }, `${view.shown} ${view.shown === 1 ? 'thought' : 'thoughts'}`));
      for (const g of view.groups) {
        const meta = typeMeta(g.type);
        kids.push(
          el('div', { class: `group-h ${meta.cls}` }, [icon(meta.icon), TYPE_PLURAL[g.type], ' ', el('span', { class: 'n' }, String(g.items.length))]),
          el('div', { class: 'cards' }, g.items.map((t) => thoughtCard(t, ctx, f.q))),
        );
      }
    }
    list.replaceChildren(...kids);
    live.textContent = thoughts.length && (f.q || f.type || f.tag || f.state) ? `${view.shown} of ${all.all} thoughts shown` : '';
  }

  async function load() {
    try { thoughts = await ctx.store.getAll(); } catch { thoughts = []; }
    draw();
    try { topics = (await ctx.brain.topics?.()) ?? []; } catch { topics = []; }
    draw();
  }

  input.addEventListener('input', () => { f.q = input.value; answerToken += 1; draw(); });
  input.addEventListener('focus', () => {
    sheetBody.dispatchEvent(new CustomEvent('sheet-detent', { bubbles: true, detail: 'full' }));
    draw();
  });
  input.addEventListener('blur', () => { if (!f.q) draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && input.value.trim() && askText(input.value)) { e.preventDefault(); ask(input.value); }
    else if (e.key === 'Escape') { setQuery(''); input.blur(); }
  });
  clearBtn.addEventListener('click', () => { setQuery(''); input.focus(); });

  const off = ctx.store.onChange?.(() => { load(); });
  load();

  return {
    refresh: load,
    destroy() { alive = false; off?.(); root.remove(); },
  };
}
