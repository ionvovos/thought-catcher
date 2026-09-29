// Buttons (design.md 2.x). kind: primary | secondary | tinted | plain | danger. Every button has a visible name or an aria-label.
import { el } from '../dom.js';
import { icon } from '../icons.js';

export function Button({ label, kind = 'secondary', icon: iconName = null, ariaLabel = null, pill = false, large = false, onClick = null, type = 'button', className = '' } = {}) {
  const cls = ['btn', `btn--${kind}`, pill ? 'btn--pill' : '', large ? 'btn--lg' : '', className].filter(Boolean).join(' ');
  const node = el('button', { type, class: cls, 'aria-label': ariaLabel, onclick: onClick }, [iconName ? icon(iconName, 'i--sm') : null, label]);
  return node;
}

export function IconButton({ name, label, filled = false, onClick = null, className = '' } = {}) {
  return el('button', { type: 'button', class: ['iconbtn', filled ? 'iconbtn--filled' : '', className].filter(Boolean).join(' '), 'aria-label': label, onclick: onClick }, icon(name));
}
