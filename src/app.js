// Entry: open the store (which runs the v1 migration), create the brain, apply settings, run the first-run gate, mount the
// assistant and start the router. The shell builds `ctx` once and hands it to every screen (architecture section 5).
import { openIdbStore } from './storage/idb.js';
import { createMemoryStore } from './storage/memory.js';
import { settingsApi } from './storage/settings.js';
import { createBrain } from './brain/index.js';
import { createWebSpeechEngine } from './speech/webspeech.js';
import { createWhisperEngine } from './speech/whisper.js';
import { resolveStale } from './core/clarify.js';
import { startRouter, createNav } from './ui/router.js';
import { createAssistant } from './ui/conversation/screen.js';
import { createToaster } from './ui/components/toast.js';
import { openSheet } from './ui/components/sheet.js';
import { el } from './ui/dom.js';

const rootEl = document.getElementById('root');
const appSlot = document.getElementById('app');
const pageSlot = document.getElementById('page');

// S3's screens are loaded on demand from their folders; a missing module gives a plain note instead of a crash.
async function load(path) {
  try { return await import(path); } catch (err) { if (!/Failed to fetch|Cannot find|Failed to load|404|error loading/i.test(String(err?.message))) console.error(err); return null; }
}

// S3's applyTheme (Settings, Appearance) when it is there; otherwise the same two lines.
let themeFn = null;
function applyAppearance(settings) {
  const theme = settings.getSettings().theme;
  if (themeFn) { themeFn(theme); return; }
  const html = document.documentElement;
  if (theme === 'light' || theme === 'dark') html.dataset.theme = theme; else delete html.dataset.theme;
}

function fail(message) {
  appSlot.replaceChildren(el('p', { class: 'empty', role: 'alert' }, message));
}

async function main() {
  const settings = settingsApi;
  const settingsUi = await load('./ui/settings/index.js');
  themeFn = settingsUi?.applyTheme ?? null;
  applyAppearance(settings);
  window.addEventListener('storage', () => applyAppearance(settings));

  const params = new URLSearchParams(window.location.search);
  const now = () => new Date();
  const nav = createNav();

  const fixtureName = params.get('fixture');
  if (fixtureName) {
    const fx = await import('./dev/fixtures.js');
    await load('./dev/fixtures-s3.js');
    pageSlot.hidden = true;
    await fx.runFixture(fixtureName, appSlot);
    document.body.dataset.fixture = fixtureName;
    return;
  }

  // openIdbStore returns at once; a capture made while the v1 migration runs is queued, not lost (G27). Only when storage
  // itself is unavailable (ready rejects) does the app fall back to a memory store and say so.
  let store = openIdbStore(globalThis.indexedDB);
  let storeNote = null;
  const opened = await Promise.race([store.ready.then(() => true, () => false), new Promise((r) => { setTimeout(() => r(true), 2000); })]);
  if (!opened) {
    store = createMemoryStore();
    storeNote = 'Storage is not available in this browser mode. Thoughts will be lost when you close this tab.';
  }

  const brain = createBrain({ store, settings, now });
  const toaster = createToaster(rootEl);
  const ctx = { store, brain, settings, now, nav, toast: (text, opts) => toaster.toast(text, opts), status: () => brain.getStatus() };

  // A question left open when the app was closed is never asked again (AC-M4.8).
  // Not awaited: during a migration getAll waits for the store, and the assistant must be on screen meanwhile.
  (async () => {
    try {
      const stale = resolveStale(await store.getAll(), now());
      if (stale.length) await store.putMany(stale);
    } catch (err) { console.error(err); }
  })();

  const [library, detail, ask, review, onboarding, about] = await Promise.all([
    load('./ui/library/index.js'), load('./ui/detail/index.js'), load('./ui/ask/index.js'), load('./ui/review/index.js'),
    load('./ui/onboarding/index.js'), load('./ui/about/index.js'),
  ]);
  const s3 = {
    renderAnswer: ask?.renderAnswer ?? detail?.renderAnswer,
    renderReviewCard: review?.renderReviewCard,
    offerModel: onboarding?.offerModel ?? settingsUi?.offerModel ?? review?.offerModel ?? detail?.offerModel,
  };

  const engines = [createWebSpeechEngine(window), createWhisperEngine({ win: window })];
  const speech = { engine: settings.getSettings()['speech.engine'], failed: new Set() };

  const assistant = createAssistant(ctx, { engines, speech, s3 });
  appSlot.replaceChildren(assistant.el);
  if (storeNote) ctx.toast(storeNote);

  // The library sheet over the assistant (A6). Opening pushes #/library; Back or the close button pops it.
  let sheet = null;
  let mounted = null;
  const libraryHost = {
    open() {
      if (sheet) return;
      sheet = openSheet({ host: assistant.el, title: 'Library', onClose: () => nav.close('#/') });
      // S3's library asks for the full detent when its search field is focused, and hands a question to the conversation.
      sheet.el.addEventListener('sheet-detent', (e) => { if (e.detail === 'full' || e.detail === 'half') sheet.setDetent(e.detail); });
      sheet.el.addEventListener('tc-ask', (e) => {
        e.preventDefault();
        const text = e.detail?.text;
        nav.close('#/');
        if (text) setTimeout(() => assistant.sendText(text), 0);
      });
      if (library?.mountLibrary) {
        try { mounted = library.mountLibrary(sheet.body, ctx); } catch (err) { console.error(err); }
      } else {
        sheet.body.append(el('p', { class: 'empty' }, 'The library is coming soon.'));
      }
      store.getAll().then((all) => sheet?.setCount(all.length)).catch(() => {});
    },
    close() {
      if (!sheet) return;
      try { mounted?.destroy?.(); } catch (err) { console.error(err); }
      mounted = null;
      sheet.destroy();
      sheet = null;
    },
  };

  const missing = (name) => (root) => root.append(el('p', { class: 'empty' }, `${name} is coming soon.`));
  const pages = {
    thought: (root, c, p) => (detail?.renderThought ? detail.renderThought(p.id, root, c) : missing('This thought view')(root)),
    settings: (root, c, p) => (settingsUi?.renderSettings ? settingsUi.renderSettings(root, c, p) : missing('Settings')(root)),
    about: (root, c) => (about?.renderAbout ? about.renderAbout(root, c) : missing('About')(root)),
  };

  const launch = params.get('type') === '1' ? 'type' : params.get('record') === '1' ? 'record' : null;
  const begin = () => {
    startRouter({ pageRoot: pageSlot, ctx, pages, library: libraryHost });
    if (launch) assistant.focusForLaunch(launch);
  };

  // First run: onboarding before the assistant, only when S3's screen exists. Nothing is downloaded or asked before it ends.
  if (!settings.getSettings()['onboarding.done'] && onboarding?.showOnboarding) {
    pageSlot.hidden = false;
    onboarding.showOnboarding(pageSlot, ctx, {
      onDone: () => { settings.setSettings({ 'onboarding.done': true }); pageSlot.hidden = true; pageSlot.replaceChildren(); begin(); },
    });
  } else {
    begin();
  }
}

main().catch((err) => {
  console.error(err);
  fail(`Thought Catcher could not start: ${err.message}`);
});

if ('serviceWorker' in navigator && !new URLSearchParams(window.location.search).has('fixture')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
