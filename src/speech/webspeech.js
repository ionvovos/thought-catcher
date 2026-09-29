// Browser speech recognition engine (architecture 4.1). Browser only; never touches audio data.
import { SpeechError } from './select.js';

export function createWebSpeechEngine(win = globalThis) {
  const Ctor = () => win.SpeechRecognition || win.webkitSpeechRecognition;
  return {
    id: 'browser',
    isAvailable: () => Boolean(Ctor()),
    transcribe(_input, { stop, onInterim } = {}) {
      return new Promise((resolve, reject) => {
        if (stop?.aborted) { resolve(''); return; }
        const Recognition = Ctor();
        if (!Recognition) { reject(new SpeechError('unavailable')); return; }
        const rec = new Recognition();
        rec.lang = 'en-US';
        rec.interimResults = true;
        rec.continuous = true;
        let text = '';
        let settled = false;
        const done = (fn, value) => {
          if (settled) return;
          settled = true;
          stop?.removeEventListener?.('abort', onAbort);
          fn(value);
        };
        const onAbort = () => { try { rec.stop(); } catch { /* already stopped */ } };
        rec.onresult = (event) => {
          let out = '';
          for (let i = 0; i < event.results.length; i += 1) out += event.results[i][0].transcript;
          text = out.trim();
          onInterim?.(text);
        };
        rec.onend = () => done(resolve, text.trim());
        rec.onerror = (event) => {
          const code = event.error;
          if (code === 'no-speech' || code === 'aborted') done(resolve, text.trim());
          else if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') done(reject, new SpeechError('not-allowed'));
          else if (code === 'network') done(reject, new SpeechError('network'));
          else done(reject, new SpeechError('failed'));
        };
        stop?.addEventListener?.('abort', onAbort);
        try { rec.start(); } catch { done(reject, new SpeechError('failed')); }
      });
    },
  };
}
