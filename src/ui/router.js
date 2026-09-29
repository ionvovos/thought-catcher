// Hash router (architecture A6): #/ assistant, #/library sheet over it, #/thought/<id>, #/settings, #/about.
// The assistant stays mounted under the other routes so a conversation survives opening the library or a thought.
// All URLs are relative; there is no server-side routing.
import { el, clear } from './dom.js';

export function parseHash(hash) {
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0];
  if (name === 'library') return { name: 'library', params: {} };
  if (name === 'thought' && parts[1]) return { name: 'thought', params: { id: decodeURIComponent(parts[1]) } };
  if (name === 'settings') return { name: 'settings', params: { section: parts[1] ?? null } };
  if (name === 'about') return { name: 'about', params: {} };
  return { name: 'assistant', params: {} }; // '', '#/', and v1 hashes (#/capture, #/inbox, #/review, #/type/x)
}

const PAGES = new Set(['thought', 'settings', 'about']);

// pages: { thought(root, ctx, params), settings(root, ctx, params), about(root, ctx, params) }, each returning
// nothing, a cleanup function or a promise of either. library: { open(ctx), close() } shown while the route is #/library.
export function startRouter({ pageRoot, ctx, pages, library, win = window }) {
  let cleanup = null;
  let token = 0;
  let stopped = false;
  let libraryOpen = false;

  async function show() {
    if (stopped) return;
    const mine = ++token;
    const { name, params } = parseHash(win.location.hash);

    if (name === 'library') {
      if (!libraryOpen) { libraryOpen = true; library.open(); }
    } else if (libraryOpen) {
      libraryOpen = false;
      library.close();
    }

    if (typeof cleanup === 'function') { try { cleanup(); } catch (err) { console.error(err); } }
    cleanup = null;

    if (!PAGES.has(name)) {
      pageRoot.hidden = true;
      clear(pageRoot);
      return;
    }
    clear(pageRoot);
    pageRoot.hidden = false;
    try {
      const result = await pages[name](pageRoot, ctx, params);
      if (mine !== token) { if (typeof result === 'function') result(); return; }
      cleanup = typeof result === 'function' ? result : null;
    } catch (err) {
      console.error(err);
      if (mine === token) pageRoot.append(el('p', { class: 'empty' }, `Something went wrong: ${err.message}`));
    }
    if (mine === token) pageRoot.querySelector('h1, h2, [tabindex]')?.focus?.();
  }

  win.addEventListener('hashchange', show);
  show();
  return {
    stop() {
      stopped = true;
      win.removeEventListener('hashchange', show);
      if (typeof cleanup === 'function') cleanup();
    },
    refresh: show,
  };
}

export function createNav(win = window) {
  const fire = () => win.dispatchEvent(new HashChangeEvent('hashchange'));
  return {
    // Pushes a history entry marked as ours, so Back returns to the previous screen inside the app.
    go(hash) { win.history.pushState({ tc: true }, '', hash); fire(); },
    back() { win.history.back(); },
    replace(hash) { win.history.replaceState({ tc: true }, '', hash === '#/' ? `${win.location.pathname}${win.location.search}` : hash); fire(); },
    // Closing a sheet or page: Back when it was pushed by the app, else replace with the target.
    close(target = '#/') { if (win.history.state?.tc) win.history.back(); else this.replace(target); },
  };
}
