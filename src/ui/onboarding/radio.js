// A radio group of buttons (role=radio, roving tabindex, arrow keys). Used by onboarding and Settings.
import { el } from '../dom.js';

// items: [{ value, label, sub?, extra?: Node }]. Returns { el, set(value) }.
export function radioGroup(items, { value, onChange, label, className = 'seg-list' }) {
  let current = value;
  const rows = items.map((it) => {
    const dot = el('span', { class: 'radio', 'aria-hidden': 'true' });
    const pick = el('button', { type: 'button', class: 'vrow__pick', role: 'radio', 'aria-checked': 'false', tabindex: '-1' }, [
      el('span', { class: 'vrow__name' }, [it.label, it.sub ? el('small', {}, it.sub) : null]),
      dot,
    ]);
    const row = el('div', { class: `vrow${it.extra ? ' vrow--extra' : ''}` }, [pick, it.extra ?? null].filter(Boolean));
    return { it, pick, row };
  });
  const group = el('div', { class: className, role: 'radiogroup', 'aria-label': label }, rows.map((r) => r.row));

  function paint() {
    const any = rows.some((r) => r.it.value === current);
    rows.forEach((r, i) => {
      const on = r.it.value === current;
      r.pick.setAttribute('aria-checked', String(on));
      r.pick.tabIndex = on || (!any && i === 0) ? 0 : -1;
    });
  }
  function choose(v, focus = false) {
    current = v;
    paint();
    if (focus) rows.find((r) => r.it.value === v)?.pick.focus();
    onChange?.(v);
  }
  rows.forEach((r, i) => {
    r.pick.addEventListener('click', () => choose(r.it.value));
    r.pick.addEventListener('keydown', (e) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      choose(rows[(i + step + rows.length) % rows.length].it.value, true);
    });
  });
  paint();
  return { el: group, set(v) { current = v; paint(); } };
}
