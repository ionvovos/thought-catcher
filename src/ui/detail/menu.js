// A small popover menu next to a button (type change, More). Closes on choice, Escape, or a tap outside; focus returns
// to the button. Positioned with CSSOM properties (the CSP has no inline style attributes).
import { el } from '../dom.js';
import { icon } from '../icons.js';

// items: [{ label, icon?, value, danger?, selected? }]. onPick(value). Returns close().
export function openMenu(anchor, items, { onPick, label = 'Menu', align = 'start' } = {}) {
  const frame = anchor.closest('.app') ?? document.body;
  const host = anchor.getBoundingClientRect();
  const hostFrame = frame.getBoundingClientRect();
  const layer = el('div', { class: 'amenu-layer' });
  const menu = el('div', { class: 'amenu', role: 'menu', 'aria-label': label }, items.map((it) => el('button', {
    type: 'button', role: 'menuitemradio', class: `amenu__item${it.danger ? ' amenu__item--danger' : ''}`,
    'aria-checked': it.selected === undefined ? null : String(Boolean(it.selected)),
    onclick: () => { close(); onPick?.(it.value); },
  }, [it.icon ? icon(it.icon) : null, el('span', {}, it.label), it.selected ? icon('check', 'amenu__check') : null])));
  layer.append(menu);
  frame.append(layer);

  const top = host.bottom - hostFrame.top + 6;
  menu.style.setProperty('top', `${Math.max(8, top)}px`);
  if (align === 'end') menu.style.setProperty('right', `${Math.max(8, hostFrame.right - host.right)}px`);
  else menu.style.setProperty('left', `${Math.max(8, host.left - hostFrame.left)}px`);

  function close() {
    layer.remove();
    document.removeEventListener('keydown', onKey, true);
    anchor.setAttribute('aria-expanded', 'false');
    anchor.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const all = [...menu.querySelectorAll('button')];
      const i = all.indexOf(document.activeElement);
      all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus();
    }
  }
  layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
  document.addEventListener('keydown', onKey, true);
  anchor.setAttribute('aria-expanded', 'true');
  (menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('button'))?.focus();
  return close;
}
