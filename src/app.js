// Entry point: open the store, build the shared context, start the router.
import { createIdbStore } from './storage/idb.js';
import { createMemoryStore } from './storage/memory.js';
import { createWebSpeechEngine } from './speech/webspeech.js';
import { createWhisperEngine } from './speech/whisper.js';
import { FEATURES } from './features.js';
import { startRouter } from './ui/router.js';
import { createAiFlow } from './ui/aiFlow.js';
import { getSettings } from './storage/settings.js';
import { resolveStale } from './core/clarify.js';
import { reviewOnOpen, showReviewCount, watchNewDay } from './core/reviewOnOpen.js';

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
  if (FEATURES.onDeviceSpeech) engines.unshift(createWhisperEngine({ win: window }));
  const speech = { engine: getSettings()['speech.engine'], failed: new Set() };
  const now = () => new Date();

  // A question left open when the app was closed is never asked again (AC-M4.8).
  try {
    const stale = resolveStale(await store.getAll(), now());
    if (stale.length) await store.putMany(stale);
  } catch (err) {
    console.error(err);
  }

  const q = new URLSearchParams(window.location.search);
  let initialFocus = q.get('type') === '1' ? 'text' : q.get('capture') === '1' ? 'record' : null;

  let reviewCount = 0;
  const ctx = {
    store,
    engines,
    speech,
    now,
    navigate: (hash) => { window.location.hash = hash; },
    showBanner,
    getReviewCount: () => reviewCount,
    consumeInitialFocus: () => { const f = initialFocus; initialFocus = null; return f; },
  };

  ctx.ai = createAiFlow({ store, now, engines, speech });
  ctx.afterSave = ctx.ai.afterSave;

  const nav = document.querySelector('.app-nav');

  // Review check (M7). A home-screen launch (?capture=1) stays on capture: the count shows in the navigation and
  // on the capture screen instead of taking over the screen.
  const runReview = async (interrupt) => {
    try {
      const r = await reviewOnOpen({ store, getSettings, now, navigate: ctx.navigate, interrupt });
      reviewCount = r.count;
      showReviewCount(nav, r.count);
    } catch (err) {
      console.error(err);
    }
  };
  const launchedToCapture = initialFocus !== null;
  // The review check reads the store before the first screen, so an auto-shown review replaces capture at once.
  await runReview(!launchedToCapture);

  startRouter({ root: document.getElementById('app'), nav, ctx });
  watchNewDay(document, now, () => runReview(true));
}

main().catch((err) => {
  console.error(err);
  showBanner(`Thought Catcher could not start: ${err.message}`);
});
