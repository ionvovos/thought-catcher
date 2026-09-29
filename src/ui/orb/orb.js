// The voice orb (design.md 2.1): a <button class="orb" data-state> built from the design's layers. All look and motion
// come from css/orb.css and the tokens; this file sets data-state, the label and the --level custom property.
// Tap starts and stops; press and hold records until release (a press of 300 ms or more switches to hold mode).
import { el } from '../dom.js';

export const HOLD_MS = 300; // AC-X1.3: a press of 300 ms or more is a hold

export const ORB_LABELS = Object.freeze({
  idle: 'Tap to talk',
  listening: 'Listening. Tap to finish',
  thinking: 'Thinking. Tap to stop',
  speaking: 'Speaking. Tap to stop',
  basic: 'Tap to talk',
});

const layer = (cls) => el('span', { class: cls });
const blobs = () => el('span', { class: 'orb__swirl' }, [layer('orb__blob'), layer('orb__blob'), layer('orb__blob'), layer('orb__blob')]);

// The 24 px assistant avatar next to a message. Decorative.
export function miniOrb() {
  return el('span', { class: 'orb orb--mini', 'data-state': 'idle', 'aria-hidden': 'true' }, [el('span', { class: 'orb__core' }, [blobs()])]);
}

// size: 'stage' | 'dock'. handlers: { onTap, onHoldStart, onHoldEnd }.
export function createOrb({ size = 'stage', state = 'idle', onTap = null, onHoldStart = null, onHoldEnd = null, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const node = el('button', { type: 'button', class: size === 'dock' ? 'orb orb--dock' : 'orb', 'data-state': state, 'aria-label': ORB_LABELS[state] ?? ORB_LABELS.idle }, [
    layer('orb__halo'), layer('orb__level'), layer('orb__ring'), layer('orb__ring'), layer('orb__ring'), layer('orb__spinner'),
    el('span', { class: 'orb__core' }, [blobs(), layer('orb__gloss')]),
  ]);
  node.style.setProperty('--level', '0');

  let timer = null;
  let holding = false;
  let suppressClick = false;
  const clearHold = () => { if (timer) { clearTimer(timer); timer = null; } };

  node.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    holding = false;
    clearHold();
    if (node.dataset.state !== 'idle' && node.dataset.state !== 'basic') return; // hold only starts a recording from rest
    timer = setTimer(() => {
      timer = null; holding = true; suppressClick = true;
      document.addEventListener('pointerup', endHold);
      document.addEventListener('pointercancel', endHold);
      onHoldStart?.();
    }, HOLD_MS);
  });
  const release = () => {
    clearHold();
    if (holding) { holding = false; onHoldEnd?.(); }
  };
  // Once a hold starts, the release is heard on the document: the orb may move to another place in the layout meanwhile.
  const endHold = () => { document.removeEventListener('pointerup', endHold); document.removeEventListener('pointercancel', endHold); release(); };
  node.addEventListener('pointerup', release);
  node.addEventListener('pointercancel', () => { clearHold(); holding = false; });
  node.addEventListener('contextmenu', (e) => e.preventDefault());
  node.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    onTap?.();
  });

  return {
    el: node,
    getState: () => node.dataset.state,
    // Sets data-state and the state's label. `basic` is a look, not a step: pass it when the brain is in rules mode.
    setState(next, { basic = false } = {}) {
      const s = next === 'idle' && basic ? 'basic' : next;
      node.dataset.state = s;
      node.setAttribute('aria-label', ORB_LABELS[s] ?? ORB_LABELS.idle);
      if (s !== 'listening') node.style.setProperty('--level', '0');
    },
    setLevel(v) { node.style.setProperty('--level', String(Math.max(0, Math.min(1, v)).toFixed(3))); },
    destroy() { clearHold(); node.remove(); },
  };
}
