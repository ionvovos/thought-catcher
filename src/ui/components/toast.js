// Toast (design.md 2.8): one message, one optional action (Undo), hides after 4 s, role="status".
// While it shows, the host gets --toast-pad so the thread never scrolls under it.
import { el } from '../dom.js';

export function createToaster(host, { duration = 4000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null;
  let timer = null;

  function hide() {
    if (timer) { clearTimer(timer); timer = null; }
    if (current) { current.remove(); current = null; }
    host.style.removeProperty('--toast-pad');
  }

  function toast(text, { action = null } = {}) {
    hide();
    const kids = [el('span', {}, text)];
    if (action) {
      kids.push(el('button', { type: 'button', class: 'btn', onclick: () => { hide(); action.onClick?.(); } }, action.label));
    }
    current = el('div', { class: 'toast', role: 'status' }, kids);
    host.append(current);
    host.style.setProperty('--toast-pad', `${Math.ceil(current.getBoundingClientRect().height || 44) + 16}px`);
    timer = setTimer(hide, duration);
    return hide;
  }

  return { toast, hide };
}
