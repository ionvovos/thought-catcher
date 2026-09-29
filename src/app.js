// Entry point: open the store, build the shared context, start the router.
import { createIdbStore } from './storage/idb.js';
import { createMemoryStore } from './storage/memory.js';
import { createWebSpeechEngine } from './speech/webspeech.js';
import { startRouter } from './ui/router.js';

const banner = document.getElementById('banner');
function showBanner(message) {
  banner.textContent = message;
  banner.hidden = false;
}

async function main() {
  let store;
  try {
    store = await createIdbStore(globalThis.indexedDB);
  } catch {
    store = createMemoryStore();
    showBanner('Storage is not available in this browser mode. Thoughts will be lost when you close this tab.');
  }

  const engines = [createWebSpeechEngine(window)];
  const speech = { engine: await store.getSetting('speech.engine', 'ask'), failed: new Set() };

  const q = new URLSearchParams(window.location.search);
  let initialFocus = q.get('type') === '1' ? 'text' : q.get('capture') === '1' ? 'record' : null;

  const ctx = {
    store,
    engines,
    speech,
    now: () => new Date(),
    navigate: (hash) => { window.location.hash = hash; },
    showBanner,
    consumeInitialFocus: () => { const f = initialFocus; initialFocus = null; return f; },
  };

  startRouter({
    root: document.getElementById('app'),
    nav: document.querySelector('.app-nav'),
    ctx,
  });
}

main().catch((err) => {
  console.error(err);
  showBanner(`Thought Catcher could not start: ${err.message}`);
});
