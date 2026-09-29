// Service worker: makes the app open offline. Lives at the site root so its scope is the whole app.
// Bump VERSION on every release: the old shell cache is deleted on activate and the new files are fetched fresh.
const VERSION = 'tc-v3';
const CDN_CACHE = 'tc-cdn'; // pinned, immutable files from cdn.jsdelivr.net (speech and language model runtimes); survives releases

// Every file the browser loads. tests/pwa.test.mjs fails when a file under src/, css/ or icons/ is missing from this list.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/components.css',
  './css/conversation.css',
  './css/detail.css',
  './css/library.css',
  './css/onboarding.css',
  './css/orb.css',
  './css/review.css',
  './css/settings.css',
  './css/shell.css',
  './css/tokens.css',
  './icons/apple-touch-icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './src/app.js',
  './src/brain/core.js',
  './src/brain/device.js',
  './src/brain/embed.worker.js',
  './src/brain/embedder.js',
  './src/brain/index.js',
  './src/brain/llm.worker.js',
  './src/brain/prompts.js',
  './src/brain/validate.js',
  './src/core/aboutText.js',
  './src/core/ai/adapter.js',
  './src/core/ai/anthropic.js',
  './src/core/ai/http.js',
  './src/core/ai/openai.js',
  './src/core/ambiguity.js',
  './src/core/clarify.js',
  './src/core/expand.js',
  './src/core/exportImport.js',
  './src/core/intent.js',
  './src/core/migrate.js',
  './src/core/model.js',
  './src/core/reply.js',
  './src/core/review.js',
  './src/core/reviewOnOpen.js',
  './src/core/search.js',
  './src/core/sorter.js',
  './src/core/splitter.js',
  './src/core/timeparse.js',
  './src/core/vector.js',
  './src/dev/fixtures-s3.js',
  './src/dev/fixtures.js',
  './src/speech/consent.js',
  './src/speech/select.js',
  './src/speech/webspeech.js',
  './src/speech/whisper.js',
  './src/storage/idb.js',
  './src/storage/memory.js',
  './src/storage/queued.js',
  './src/storage/settings.js',
  './src/ui/about/about.js',
  './src/ui/about/index.js',
  './src/ui/ask/answer.js',
  './src/ui/ask/index.js',
  './src/ui/components/button.js',
  './src/ui/components/chip.js',
  './src/ui/components/menu.js',
  './src/ui/components/sheet.js',
  './src/ui/components/statusLine.js',
  './src/ui/components/toast.js',
  './src/ui/conversation/composer.js',
  './src/ui/conversation/dates.js',
  './src/ui/conversation/filedCard.js',
  './src/ui/conversation/machine.js',
  './src/ui/conversation/screen.js',
  './src/ui/conversation/speak.js',
  './src/ui/conversation/view.js',
  './src/ui/detail/detail.js',
  './src/ui/detail/index.js',
  './src/ui/detail/menu.js',
  './src/ui/dom.js',
  './src/ui/icons.js',
  './src/ui/library/index.js',
  './src/ui/library/library.js',
  './src/ui/library/view.js',
  './src/ui/onboarding/index.js',
  './src/ui/onboarding/offerModel.js',
  './src/ui/onboarding/onboarding.js',
  './src/ui/onboarding/radio.js',
  './src/ui/onboarding/voices.js',
  './src/ui/orb/level.js',
  './src/ui/orb/orb.js',
  './src/ui/review/card.js',
  './src/ui/review/index.js',
  './src/ui/router.js',
  './src/ui/settings/data.js',
  './src/ui/settings/index.js',
  './src/ui/settings/ownKey.js',
  './src/ui/settings/settings.js',
  './src/ui/settings/status.js',
  './src/ui/typeMeta.js',
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
    // Only old app-shell caches go. The model caches (webllm/*, transformers-cache) and the jsDelivr cache are never touched.
    for (const name of await caches.keys()) {
      if (name.startsWith('tc-') && name !== VERSION && name !== CDN_CACHE) await caches.delete(name);
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
