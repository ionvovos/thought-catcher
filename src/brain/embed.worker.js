// Module worker for sentence embeddings (architecture A3): transformers.js 4.3.0, Xenova/all-MiniLM-L6-v2 q8, WebAssembly.
// Messages in: { id, type: 'load' } and { id, type: 'embed', texts }. Out: { id, type: 'progress'|'loaded'|'result'|'error', ... }.
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0';
const MODEL = 'Xenova/all-MiniLM-L6-v2';
let extractor = null;
const files = new Map();
const EXPECTED_BYTES = 27000000; // the model, tokenizer and config together: progress never reads 99% before the big file has started

const post = (m) => self.postMessage(m);

function progressOf(p) {
  if (p?.file && typeof p.total === 'number' && p.total > 0) files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) { loaded += f.loaded; total += f.total; }
  return total ? Math.min(99, Math.round((loaded / Math.max(total, EXPECTED_BYTES)) * 100)) : 0;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      const lib = await import(LIB_URL);
      extractor = await lib.pipeline('feature-extraction', MODEL, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (p) => post({ id, type: 'progress', pct: progressOf(p) }),
      });
      post({ id, type: 'loaded' });
    } else if (type === 'embed') {
      if (!extractor) throw new Error('not loaded');
      const out = await extractor(data.texts, { pooling: 'mean', normalize: true });
      post({ id, type: 'result', vecs: out.tolist() });
    }
  } catch (err) {
    post({ id, type: 'error', message: String(err?.message ?? err) });
  }
};
