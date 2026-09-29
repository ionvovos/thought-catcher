// Filter chip and quick reply (design.md 2.2, 2.4).
import { el } from '../dom.js';
import { icon } from '../icons.js';

// A toggle chip: aria-pressed carries the state.
export function Chip({ label, count = null, pressed = false, type = null, tag = false, onClick = null } = {}) {
  const cls = ['chip', type ? `t-${type}` : '', tag ? 'chip--tag' : ''].filter(Boolean).join(' ');
  return el('button', { type: 'button', class: cls, 'aria-pressed': String(Boolean(pressed)), onclick: onClick }, [
    type ? el('span', { class: 'dot' }) : null,
    label,
    count === null ? null : el('span', { class: 'n' }, ` ${count}`),
  ]);
}

// A quick reply under an assistant question. variant: accent | quiet | null. index staggers the pop-in by 50 ms.
export function Reply({ label, variant = null, iconName = null, index = 0, onClick = null } = {}) {
  const node = el('button', { type: 'button', class: ['reply', variant ? `reply--${variant}` : ''].filter(Boolean).join(' '), onclick: onClick }, [iconName ? icon(iconName, 'i--sm') : null, label]);
  node.style.setProperty('--i', String(index));
  return node;
}
