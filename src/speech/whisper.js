// On-device speech to text: Whisper (tiny) through transformers.js, loaded from a pinned CDN URL on first use.
// Audio never leaves the device and is never stored: it is recorded in memory, converted to text, then dropped.
import { SpeechError } from './select.js';

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';
export const WHISPER_MODEL = 'onnx-community/whisper-tiny';
// Pinned to a commit, not to `main` (build gate G1).
export const WHISPER_REVISION = 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
const SAMPLE_RATE = 16000;
const MIN_SECONDS = 0.4;
const SILENCE_RMS = 0.004; // below this the recording is silence; Whisper would invent words for it

async function defaultLoadPipeline(onProgress) {
  const { pipeline } = await import(TRANSFORMERS_URL);
  // The runtime remembers a backend that failed to start, so a failed WebGPU attempt cannot be retried on
  // WebAssembly. Ask for a GPU adapter first and use WebGPU only when one really exists.
  let adapter = null;
  try { adapter = await globalThis.navigator?.gpu?.requestAdapter(); } catch { /* no usable GPU */ }
  return pipeline('automatic-speech-recognition', WHISPER_MODEL, {
    revision: WHISPER_REVISION, device: adapter ? 'webgpu' : 'wasm', dtype: 'q8', progress_callback: onProgress,
  });
}

// Blob of recorded audio -> 16 kHz mono Float32Array.
async function toMono16k(blob, win) {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.ceil(decoded.duration * SAMPLE_RATE);
    if (length < SAMPLE_RATE * MIN_SECONDS) return null;
    const offline = new win.OfflineAudioContext(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally {
    ctx.close?.();
  }
}

// Records until `stop` aborts. Resolves with the audio Blob, or null when nothing was captured.
async function record(win, stop) {
  let stream;
  try {
    stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new SpeechError('not-allowed');
  }
  try {
    const recorder = new win.MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const finished = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start();
    if (stop.aborted) recorder.stop();
    else stop.addEventListener('abort', () => { if (recorder.state !== 'inactive') recorder.stop(); }, { once: true });
    await finished;
    return chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

export function createWhisperEngine({ win = globalThis, loadPipeline = defaultLoadPipeline } = {}) {
  let asr = null; // Promise of the loaded pipeline
  let loaded = false;

  const load = (onProgress) => {
    if (!asr) {
      asr = loadPipeline(onProgress).then((p) => { loaded = true; return p; }, (err) => { asr = null; throw err; });
    }
    return asr;
  };

  return {
    id: 'whisper',
    isLoaded: () => loaded,
    isAvailable() {
      return Boolean(win.MediaRecorder && win.navigator?.mediaDevices?.getUserMedia && (win.AudioContext || win.webkitAudioContext) && win.OfflineAudioContext);
    },
    // opts: { stop: AbortSignal, onState(kind, detail) } with kind 'loading' (detail: 0-100), 'listening', 'transcribing'.
    async transcribe(_input, { stop = new AbortController().signal, onState } = {}) {
      // 1. Load the model first, so a failure here happens before the person has spoken and the next engine can take over.
      // Files join the download one after another, so the average can dip; the bar only moves forward.
      const files = new Map();
      let shown = 0;
      const progress = (p) => {
        if (p?.status === 'progress' && p.file) files.set(p.file, p.progress ?? 0);
        const values = [...files.values()];
        if (!values.length) return;
        shown = Math.max(shown, Math.round(values.reduce((a, b) => a + b, 0) / values.length));
        onState?.('loading', shown);
      };
      if (!loaded) onState?.('loading', 0);
      let pipe;
      try {
        pipe = await load(progress);
      } catch {
        throw new SpeechError('failed');
      }
      if (stop.aborted) return '';

      // 2. Record. From here on the audio exists only here, so a later failure must not silently retry elsewhere.
      onState?.('listening');
      const blob = await record(win, stop);
      if (!blob) return '';
      onState?.('transcribing');
      try {
        const audio = await toMono16k(blob, win);
        if (!audio) return '';
        let sum = 0;
        for (let i = 0; i < audio.length; i += 1) sum += audio[i] * audio[i];
        if (Math.sqrt(sum / audio.length) < SILENCE_RMS) return '';
        const out = await pipe(audio, { language: 'english', task: 'transcribe' });
        return String(out?.text ?? '').trim();
      } catch {
        const err = new SpeechError('failed');
        err.fatal = true;
        throw err;
      }
    },
  };
}
