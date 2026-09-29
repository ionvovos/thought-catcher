// Ask answer card (X5): the answer text with numbered citations, one source card per citation, a provenance line, and
// (when nothing matches) an honest "couldn't find anything". The brain returns { answer, sources, mode, by } and never
// writes; every cited thought is checked against the store before it is shown (AC-X5.2, AC-X5.3).
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Reply } from '../components/chip.js';
import { typeMeta } from '../typeMeta.js';
import { dateLabel } from '../library/view.js';

const NOTHING = /I couldn't find anything about that\.?$/;

// Text with [1] markers becomes text and citation chips; text without markers gets the chips at the end.
export function citedParts(text, count) {
  const out = [];
  const src = String(text ?? '');
  const re = /\[(\d)\]/g;
  let last = 0;
  let found = false;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const n = Number(m[1]);
    if (n < 1 || n > count) continue;
    found = true;
    if (m.index > last) out.push({ text: src.slice(last, m.index).replace(/\s+$/, '') });
    out.push({ cite: n });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  if (!found) for (let n = 1; n <= count; n += 1) out.push({ cite: n });
  return out;
}

export function provenanceText(answer, shown, total) {
  if (!shown) return `Searched ${total} ${total === 1 ? 'thought' : 'thoughts'} on this phone.`;
  const from = `From ${shown} of your ${total} ${total === 1 ? 'thought' : 'thoughts'}.`;
  if (answer.mode === 'keyword') return `${from} Keyword search.`;
  if (answer.by === 'key') return `${from} Answer written with your key.`;
  return `${from} Searched on this phone.`;
}

export function renderAnswer(answer, ctx) {
  const sources = Array.isArray(answer?.sources) ? answer.sources.slice(0, 3) : [];
  const box = el('div', { class: 'answer', role: 'group', 'aria-label': 'Answer' });
  const text = sources.length === 0 && NOTHING.test(answer?.answer ?? '') ? "I couldn't find anything about that in your thoughts." : answer?.answer ?? '';
  const para = el('p', { class: 'answer__text' }, sources.length
    ? citedParts(text, sources.length).map((p) => (p.cite ? el('span', { class: 'cite', 'aria-label': `Source ${p.cite}` }, String(p.cite)) : p.text))
    : text);
  const list = el('div', { class: 'sources', role: 'list', 'aria-label': 'Sources' });
  const rows = sources.map((s, i) => {
    const meta = typeMeta(s.type);
    const when = el('span', { class: 'src__when' }, meta.label);
    const row = el('button', {
      type: 'button', class: `src ${meta.cls}`, role: 'listitem', 'aria-label': `Source ${i + 1}: ${s.title}. ${meta.label}. Open`,
      onclick: () => ctx.nav.go(`#/thought/${encodeURIComponent(s.id)}`),
    }, [
      el('span', { class: 'cite', 'aria-hidden': 'true' }, String(i + 1)),
      el('span', { class: 'ticon', 'aria-hidden': 'true' }, icon(meta.icon)),
      el('span', {}, [el('span', { class: 'src__title' }, s.title), when]),
    ]);
    list.append(row);
    return { s, row, when, meta };
  });
  const prov = el('div', { class: 'provenance' }, [icon('lock'), provenanceText(answer ?? {}, sources.length, '…')]);
  const acts = el('div', { class: 'answer__acts' });
  box.append(...[para, sources.length ? list : null, prov, acts].filter(Boolean));

  function saveChip() {
    if (!answer?.question || acts.childElementCount) return;
    acts.append(Reply({ label: 'Save this as a thought', variant: 'accent', iconName: 'plus', onClick: () => box.dispatchEvent(new CustomEvent('answer-save', { bubbles: true, detail: { text: answer.question } })) }));
  }

  // Check every cited thought against the store and add its date; a thought that is gone is not shown.
  (async () => {
    let all = [];
    try { all = await ctx.store.getAll(); } catch { /* keep what we have */ }
    const byId = new Map(all.map((t) => [t.id, t]));
    let shown = 0;
    for (const r of rows) {
      const t = byId.get(r.s.id);
      if (!t) { r.row.remove(); continue; }
      shown += 1;
      const due = t.due_at && (t.type === 'task' || t.type === 'reminder');
      r.when.textContent = `${r.meta.label} · ${due ? `due ${dateLabel(t.due_at).replace(/^\w+ /, '')}` : dateLabel(t.created_at)}`;
    }
    prov.replaceChildren(icon('lock'), provenanceText(answer ?? {}, shown, all.length));
    if (sources.length && !shown) para.textContent = "I couldn't find anything about that in your thoughts.";
    if (!shown) saveChip();
  })();
  if (!sources.length) saveChip();
  return box;
}
