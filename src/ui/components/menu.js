// Small popover menu (type change, date change on a filed card). Positioned under its anchor inside `host`
// (a position: relative container). Closes on Escape, on an outside tap, and after a pick.
import { el } from '../dom.js';
import { icon } from '../icons.js';

// options: [{ value, label, icon?, cls?, checked? }]. onPick(value). Returns close().
export function openMenu({ host, anchor, options, label, onPick }) {
  const items = options.map((o) => el('button', {
    type: 'button', role: 'menuitemradio', 'aria-checked': String(Boolean(o.checked)), class: 'menu__item',
    onclick: () => { close(); onPick(o.value); },
  }, [o.icon ? el('span', { class: `ticon ${o.cls ?? ''}`, 'aria-hidden': 'true' }, icon(o.icon)) : null, o.label]));
  const menu = el('div', { class: 'menu', role: 'menu', 'aria-label': label }, items);
  host.append(menu);

  const h = host.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(a.left - h.left, h.width - m.width - 8));
  const below = a.bottom - h.top + 6;
  const top = below + m.height > h.height - 8 ? Math.max(8, a.top - h.top - m.height - 6) : below;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  items.find((i) => i.getAttribute('aria-checked') === 'true')?.focus() ?? items[0]?.focus();

  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus?.(); } };
  const onDown = (e) => { if (!menu.contains(e.target)) close(); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  function close() {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    menu.remove();
  }
  return close;
}
