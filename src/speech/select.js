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
  whisper: ['whisper'], // chosen for privacy (audio stays on the device): never fall back to a service that receives audio
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

export const ON_DEVICE_FAILED = 'On-device voice could not start. Type, or choose the browser speech service in Settings.';

export function speechMessage(code) {
  return MESSAGES[code] ?? MESSAGES.failed;
}

// The message for a failed transcribeWithFallback result. A failure of the on-device model gets its own text,
// because the person chose it for privacy and the app does not switch to a service that receives audio.
export function failureMessage(prefs, result) {
  const onDevice = prefs?.engine === 'whisper' && result.errors.some((e) => e.engine === 'whisper' && e.code !== 'not-allowed');
  return onDevice ? ON_DEVICE_FAILED : speechMessage(result.reason);
}

// Engines to remember as failed for the rest of the session. The on-device engine is never remembered when it is
// the person's choice, so a temporary problem (network during the first download) can be retried.
export function enginesToMarkFailed(prefs, result) {
  return result.errors.map((e) => e.engine).filter((id) => !(prefs?.engine === 'whisper' && id === 'whisper'));
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
