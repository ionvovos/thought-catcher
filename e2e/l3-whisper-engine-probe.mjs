// Runs src/speech/whisper.js directly in headless Chrome with a fake microphone and prints states, text or the error.
// Usage (outside the Bash sandbox, needs the network): node e2e/l3-whisper-engine-probe.mjs
import { launch } from './lib/cdp.mjs';

const b = await launch({ chromeArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
await b.send('Browser.grantPermissions', { permissions: ['audioCapture'], origin: b.base });
await b.load(`${b.base}/#/about`);
console.log(await b.ev(`(async () => {
  const { createWhisperEngine } = await import('./src/speech/whisper.js');
  const e = createWhisperEngine({ win: window });
  const log = [];
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 12000);
  try {
    const text = await e.transcribe(null, { stop: ac.signal, onState: (k, d) => { if (k !== 'loading' || d === 100) log.push(k + (d ?? '')); } });
    return JSON.stringify({ ok: true, text, log, available: e.isAvailable() });
  } catch (err) { return JSON.stringify({ ok: false, code: err.code, msg: err.message, stack: String(err.stack).slice(0, 300), log }); }
})()`));
console.log('PROBLEMS', JSON.stringify(b.problems.slice(0, 12)));
await b.close();
