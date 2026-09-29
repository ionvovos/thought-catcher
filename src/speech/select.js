// Speech engine selection and fallback (architecture 4.2, AC-M2.1). Pure: engines are injected.
//
// Engine contract: { id, isAvailable() -> boolean, transcribe(input, { stop, onInterim }) -> Promise<string> }
// `stop` is an AbortSignal: aborting ends listening and resolves with the text heard so far.
// Resolving '' means nothing heard (not a failure). Rejecting means failure.

export class SpeechError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = 'SpeechError';
    this.code = code;
  }
}

export const ENGINE_ORDER = Object.freeze({
  ask: ['whisper', 'browser'],
  whisper: ['whisper', 'browser'],
  browser: ['browser'],
  typing: [],
});

const MESSAGES = {
  'not-allowed': 'Microphone blocked. Allow it in your browser settings, or type instead.',
  network: 'Voice input could not reach the speech service. Check your connection, or type instead.',
  unavailable: 'Voice input is not available in this browser. Type your thought instead.',
  typing: 'Voice is off. Type your thought.',
  failed: 'Voice input failed. Type your thought instead.',
};

export function speechMessage(code) {
  return MESSAGES[code] ?? MESSAGES.failed;
}

function candidates(engines, prefs) {
  const pref = prefs?.engine;
  const order = ENGINE_ORDER[pref] ?? ENGINE_ORDER.ask;
  const failed = new Set(prefs?.failed ?? []);
  const list = [];
  for (const id of order) {
    const e = engines.find((x) => x.id === id);
    if (e && e.isAvailable() && !failed.has(id)) list.push(e);
  }
  return { list, typing: pref === 'typing' };
}

export function selectEngine(engines, prefs) {
  const { list, typing } = candidates(engines, prefs);
  if (typing) return { engine: null, reason: 'typing' };
  if (list.length) return { engine: list[0], reason: null };
  return { engine: null, reason: 'unavailable' };
}

export async function transcribeWithFallback(engines, prefs, input, opts) {
  const { list, typing } = candidates(engines, prefs);
  const errors = [];
  if (typing) return { text: null, engine: null, errors, reason: 'typing' };
  for (const e of list) {
    try {
      const text = await e.transcribe(input, opts);
      return { text, engine: e.id, errors };
    } catch (err) {
      errors.push({ engine: e.id, code: err?.code ?? 'failed' });
      // A failure after audio was already captured cannot be replayed to another engine: report it, do not re-listen.
      if (err?.fatal) break;
    }
  }
  return { text: null, engine: null, errors, reason: errors.length ? errors[errors.length - 1].code : 'unavailable' };
}
