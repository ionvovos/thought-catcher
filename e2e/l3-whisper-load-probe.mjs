// Loads the Whisper pipeline in headless Chrome, trying webgpu first and then wasm, and prints each outcome or error.
// Usage (outside the Bash sandbox, needs the network): node e2e/l3-whisper-load-probe.mjs [wasm|webgpu-then-wasm]
import { launch } from './lib/cdp.mjs';

const mode = process.argv[2] ?? 'webgpu-then-wasm';
const b = await launch();
await b.load(`${b.base}/#/about`);
console.log(await b.ev(`(async () => {
  const out = [];
  const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0');
  const make = (device) => pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', { device, dtype: 'q8' });
  const order = ${JSON.stringify(mode)} === 'wasm' ? ['wasm'] : ['webgpu', 'wasm'];
  for (const d of order) {
    try {
      const t0 = Date.now();
      const asr = await make(d);
      const r = await asr(new Float32Array(16000), { language: 'english', task: 'transcribe' });
      out.push('ok ' + d + ' ' + (Date.now() - t0) + 'ms ' + JSON.stringify(r.text));
      break;
    } catch (e) { out.push('ERR ' + d + ': ' + String(e && (e.message || e)).slice(0, 300)); }
  }
  return out.join('\\n');
})()`));
await b.close();
