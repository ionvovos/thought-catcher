// The status pill (design.md 3.1) and the strip and notice lines under it. pillFor() is pure: it maps a brain Status
// (architecture 2.2) to the first matching row of the canonical table, in the table's order.
import { el } from '../dom.js';

const MB = 1000000;

export function pillFor(status) {
  const s = status ?? {};
  const llm = s.llm ?? { state: 'not-downloaded' };
  if (s.key === 'rejected') return { text: 'Key rejected', tone: 'warn', label: 'Key rejected. Open settings', opens: 'settings-assistant', row: 'key-rejected' };
  if (s.online === false && s.engine === 'key') return { text: 'Offline', tone: 'off', label: 'Offline', opens: 'settings-assistant', row: 'offline' };
  if (llm.state === 'downloading') return { text: `Setting up ${Math.round(llm.pct ?? 0)}%`, tone: 'ring', pct: Math.round(llm.pct ?? 0), label: `Setting up the assistant, ${Math.round(llm.pct ?? 0)} percent`, opens: 'settings-assistant', row: 'downloading' };
  if (llm.state === 'loading') return { text: 'Getting ready', tone: 'ring', pct: Math.round(llm.pct ?? 0), label: 'Getting the assistant ready', opens: 'settings-assistant', row: 'loading' };
  if (llm.state === 'error') return { text: 'Assistant paused', tone: 'warn', label: 'Assistant paused. Open settings', opens: 'settings-assistant', row: 'error' };
  if (llm.state === 'not-downloaded') return { text: 'Set up assistant', tone: 'off', label: 'Set up assistant. Opens the download offer', opens: 'consent', row: 'not-downloaded' };
  if (llm.state === 'not-supported' || s.engine === 'rules') return { text: 'Basic mode', tone: 'warn', label: 'Basic mode. Open settings', opens: 'settings-assistant', row: 'basic' };
  if (s.engine === 'key') return { text: 'Your key', tone: 'ok', label: 'Assistant uses your own key. Open settings', opens: 'settings-assistant', row: 'key' };
  return { text: 'On this phone', tone: 'ok', label: 'Assistant runs on this phone. Open settings', opens: 'settings-assistant', row: 'device' };
}

// The orb shows `basic` for the rows the canonical table marks so.
export function orbStateFor(status) {
  const p = pillFor(status);
  return p.row === 'basic' || p.row === 'error' ? 'basic' : 'normal';
}

// The one-line hint under the orb while the model downloads (spike-b2 section 5, word for word).
export function downloadLine(status) {
  const llm = status?.llm;
  if (llm?.state !== 'downloading') return null;
  const total = Math.round((llm.bytes ?? 870000000) / MB);
  return `Getting the assistant ready: ${Math.round(llm.pct ?? 0)}% of ${total} MB. You can keep using the app.`;
}

export function StatusPill(status, { onClick = null } = {}) {
  const p = pillFor(status);
  const lead = p.tone === 'ring'
    ? el('span', { class: 'pill__ring' })
    : el('span', { class: 'pill__dot' });
  if (p.tone === 'ring') lead.style.setProperty('--p', String(p.pct ?? 0));
  const cls = ['pill', p.tone === 'warn' ? 'pill--warn' : '', p.tone === 'off' ? 'pill--off' : ''].filter(Boolean).join(' ');
  const node = el('button', { type: 'button', class: cls, 'aria-label': p.label, onclick: onClick }, [lead, p.text]);
  node.dataset.row = p.row;
  return node;
}

export const Strip = (iconNode, text) => el('div', { class: 'strip', role: 'status' }, [iconNode, text]);
