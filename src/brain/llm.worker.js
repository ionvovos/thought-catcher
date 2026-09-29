// Module worker that hosts the WebLLM engine off the main thread (architecture 2.6). The library is imported after the
// first message, so a blocked or slow CDN shows up as a missing progress event, which the host's watchdog catches.
const WEBLLM_URL = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
let handlerReady = null;

self.onmessage = (msg) => {
  if (!handlerReady) handlerReady = import(WEBLLM_URL).then((lib) => new lib.WebWorkerMLCEngineHandler());
  handlerReady.then((handler) => handler.onmessage(msg)).catch((err) => {
    self.postMessage({ kind: 'worker-error', message: String(err?.message ?? err) });
  });
};
