// Service worker: makes the app open offline. Lives at the site root so its scope is the whole app.
// Bump VERSION on every release: the old shell cache is deleted on activate and the new files are fetched fresh.
const VERSION = 'tc-v1';
const CDN_CACHE = 'tc-cdn'; // pinned, immutable files from cdn.jsdelivr.net (speech model runtime); survives releases
const KEEP = new Set([VERSION, CDN_CACHE, 'transformers-cache']);

// Every file the browser loads. tests/pwa.test.mjs fails when a file under src/, css/ or icons/ is missing from this list.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './src/app.js',
  './src/features.js',
  './src/core/aboutText.js',
  './src/core/ai/adapter.js',
  './src/core/ai/anthropic.js',
  './src/core/ai/http.js',
  './src/core/ai/openai.js',
  './src/core/ambiguity.js',
  './src/core/clarify.js',
  './src/core/expand.js',
  './src/core/exportImport.js',
  './src/core/model.js',
  './src/core/review.js',
  './src/core/reviewOnOpen.js',
  './src/core/search.js',
  './src/core/sorter.js',
  './src/core/timeparse.js',
  './src/speech/select.js',
  './src/speech/webspeech.js',
  './src/speech/whisper.js',
  './src/storage/idb.js',
  './src/storage/memory.js',
  './src/storage/settings.js',
  './src/ui/aiFlow.js',
  './src/ui/consent.js',
  './src/ui/dom.js',
  './src/ui/router.js',
  './src/ui/voice.js',
  './src/ui/views/about.js',
  './src/ui/views/capture.js',
  './src/ui/views/detail.js',
  './src/ui/views/list.js',
  './src/ui/views/review.js',
  './src/ui/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // One file at a time: a file that fails to load must not stop the rest from being cached.
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch { /* fetched on first use instead */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (!KEEP.has(name)) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith((async () => {
        const cached = await caches.match('./index.html', { ignoreSearch: true });
        return cached || fetch(req);
      })());
      return;
    }
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') (await caches.open(VERSION)).put(req, res.clone());
      return res;
    })());
    return;
  }

  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith((async () => {
      const cache = await caches.open(CDN_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
  }
  // Everything else, including every AI provider request, is not intercepted.
});
