// Bottom sheet (design.md 2.4): scrim, grabber, title with count, close button. The library uses it at two detents,
// half and full. Back closing is the router's job: the sheet only reports onClose. Escape and the scrim call onClose too.
import { el } from '../dom.js';
import { icon } from '../icons.js';

const SWIPE = 48;

export function openSheet({ host, title, count = null, label = title, detent = 'half', onClose = () => {}, onDetent = () => {} }) {
  const restoreFocus = typeof document !== 'undefined' ? document.activeElement : null;
  const countEl = el('span', { class: 'sheet__count' }, count === null ? '' : String(count));
  const grabber = el('span', { class: 'grabber', role: 'button', tabindex: '0', 'aria-label': 'Resize library' });
  const closeBtn = el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close library', onclick: () => onClose() }, icon('x'));
  const content = el('div', { class: 'sheet__content' });
  const sheet = el('section', { class: `sheet sheet--${detent}`, role: 'dialog', 'aria-label': label, 'aria-modal': 'true' }, [
    grabber,
    el('div', { class: 'sheet__head' }, [el('h2', { class: 'sheet__title' }, [title, countEl]), closeBtn]),
    content,
  ]);
  const scrim = el('div', { class: 'scrim', onclick: () => onClose() });
  host.append(scrim, sheet);

  let current = detent;
  const setDetent = (next) => {
    if (next === current) return;
    current = next;
    sheet.className = `sheet sheet--${next}`;
    onDetent(next);
  };

  // A swipe on the grabber or header moves one detent; a tap on the grabber toggles.
  let startY = null;
  const down = (e) => { startY = e.clientY; };
  const up = (e) => {
    if (startY === null) return;
    const dy = e.clientY - startY;
    startY = null;
    if (dy < -SWIPE) setDetent('full');
    else if (dy > SWIPE) { if (current === 'full') setDetent('half'); else onClose(); }
  };
  for (const n of [grabber, sheet.querySelector('.sheet__head')]) {
    n.addEventListener('pointerdown', down);
    n.addEventListener('pointerup', up);
    n.addEventListener('pointercancel', () => { startY = null; });
    n.style.touchAction = 'none';
  }
  grabber.addEventListener('click', () => setDetent(current === 'half' ? 'full' : 'half'));
  grabber.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetent(current === 'half' ? 'full' : 'half'); } });
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
  document.addEventListener('keydown', onKey);
  closeBtn.focus();

  return {
    el: sheet,
    body: content,
    setCount(n) { countEl.textContent = String(n); },
    setDetent,
    getDetent: () => current,
    destroy() {
      document.removeEventListener('keydown', onKey);
      sheet.remove();
      scrim.remove();
      if (restoreFocus && typeof restoreFocus.focus === 'function' && document.contains(restoreFocus)) restoreFocus.focus();
    },
  };
}
