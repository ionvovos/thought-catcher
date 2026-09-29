// What the Assistant group of Settings says for each brain state (design.md 3.1, spike-b2 section 5). Pure.
// Each row: { sub, tone: 'ok'|'warn'|null, action: 'download'|'cancel'|'retry'|null, pct: number|null }.

const mb = (bytes, fallback) => Math.round((bytes ?? fallback) / 1e6);
export const LLM_MB = 870;
export const EMBED_MB = 29;
export const STOPPED = "The assistant stopped working, so I'm using simple rules for now.";
export const UNSUPPORTED = "This phone can't run the on-device assistant. I'll sort your thoughts with simple rules. You can add your own AI key below.";

export function llmRow(status) {
  const llm = status?.llm ?? { state: 'not-downloaded' };
  switch (llm.state) {
    case 'not-supported': return { sub: UNSUPPORTED, tone: 'warn', action: null, pct: null };
    case 'downloading': return { sub: `Getting the assistant ready: ${Math.round(llm.pct ?? 0)}% of ${mb(llm.bytes, 870000000)} MB. You can keep using the app.`, tone: null, action: 'cancel', pct: Math.round(llm.pct ?? 0) };
    case 'loading': return { sub: 'Getting the assistant ready. This takes a few seconds.', tone: null, action: null, pct: Math.round(llm.pct ?? 0) };
    case 'ready': return { sub: 'Ready. It runs on this phone.', tone: 'ok', action: null, pct: null };
    case 'error': return { sub: llm.code === 'offline' ? 'You are offline, so the download paused. Connect and try again.' : STOPPED, tone: 'warn', action: 'retry', pct: null };
    default: return { sub: `Not downloaded. About ${mb(llm.bytes, 870000000)} MB, Wi-Fi recommended.`, tone: null, action: 'download', pct: null };
  }
}

export function embedRow(status) {
  const e = status?.embed ?? { state: 'not-downloaded' };
  switch (e.state) {
    case 'not-supported': return { sub: 'Not available in this browser. Search uses your words instead.', tone: 'warn', action: null, pct: null };
    case 'downloading': return { sub: `Downloading: ${Math.round(e.pct ?? 0)}% of ${mb(e.bytes, 29000000)} MB.`, tone: null, action: 'cancel', pct: Math.round(e.pct ?? 0) };
    case 'loading': return { sub: 'Getting ready.', tone: null, action: null, pct: Math.round(e.pct ?? 0) };
    case 'ready': return { sub: 'Ready, 22 MB', tone: 'ok', action: null, pct: null };
    case 'error': return { sub: 'It stopped working. Search uses your words instead.', tone: 'warn', action: 'retry', pct: null };
    default: return { sub: `Not downloaded. About ${mb(e.bytes, 29000000)} MB. Search uses your words until then.`, tone: null, action: 'download', pct: null };
  }
}

// The own-key row: value and sub from the brain's key state and the saved provider.
export function keyRow(status, settings, providerName) {
  const set = status?.key === 'set' || status?.key === 'rejected';
  if (status?.key === 'rejected') return { value: 'Key rejected', sub: 'Open it to replace the key.', tone: 'warn' };
  if (set) return { value: 'On', sub: `Using your ${providerName} key.`, tone: 'ok' };
  return { value: 'Off', sub: 'Optional. Sharper answers, uses the internet.', tone: null };
}

// The line under the Assistant group.
export function assistantFoot(status) {
  const s = status?.llm?.state;
  if (s === 'downloading') return 'Until it is ready, thoughts are sorted with simple rules. Cancel stops the download; you can start it again here.';
  if (s === 'not-downloaded') return 'Until you download it, thoughts are sorted with simple rules. Nothing downloads without your tap.';
  if (s === 'ready') return null;
  return 'Thoughts are sorted with simple rules while the assistant is not running.';
}

export const listenLabel = (v) => ({ whisper: 'On this phone', browser: "Phone's speech service", typing: 'Typing only', ask: 'Ask me' }[v] ?? 'Ask me');
export const daysLabel = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
