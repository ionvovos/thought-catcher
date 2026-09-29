// Hash router. Views are loaded with dynamic import() so a missing module shows a note, not a crash.
import { el, clear } from './dom.js';

export const ROUTE_NAMES = ['capture', 'inbox', 'type', 'thought', 'review', 'settings', 'about'];

const VIEW_MODULES = {
  capture: './views/capture.js',
  inbox: './views/list.js',
  type: './views/list.js',
  thought: './views/detail.js',
  review: './views/review.js',
  settings: './views/settings.js',
  about: './views/about.js',
};

export function parseHash(hash) {
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = parts[0];
  if (name === 'inbox') return { name, params: {} };
  if (name === 'type' && parts[1]) return { name, params: { type: decodeURIComponent(parts[1]) } };
  if (name === 'thought' && parts[1]) return { name, params: { id: decodeURIComponent(parts[1]) } };
  if (name === 'review' || name === 'settings' || name === 'about') return { name, params: {} };
  return { name: 'capture', params: {} };
}

export function startRouter({ root, nav, ctx, win = window, modules = VIEW_MODULES }) {
  let cleanup = null;
  let token = 0;
  let stopped = false;

  const markNav = (name, hash) => {
    if (!nav) return;
    const current = hash && hash !== '#' && hash !== '#/' ? hash : '#/capture';
    for (const a of nav.querySelectorAll('a')) {
      if (a.getAttribute('href') === current || (name === 'thought' && a.dataset.route === 'inbox')) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  };

  async function show() {
    if (stopped) return;
    const mine = ++token;
    const { name, params } = parseHash(win.location.hash);
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (err) { console.error(err); }
    }
    cleanup = null;
    clear(root);
    markNav(name, win.location.hash);
    let render;
    try {
      ({ default: render } = await import(modules[name]));
    } catch {
      if (mine === token) root.appendChild(el('p', { class: 'empty', text: 'This screen is coming soon.' }));
      return;
    }
    if (mine !== token) return;
    try {
      const result = await render(root, { ...ctx, params });
      if (mine !== token) {
        if (typeof result === 'function') result();
        return;
      }
      cleanup = typeof result === 'function' ? result : null;
    } catch (err) {
      console.error(err);
      if (mine === token) root.appendChild(el('p', { class: 'error', text: `Something went wrong: ${err.message}` }));
    }
    if (mine === token) win.scrollTo?.(0, 0);
  }

  win.addEventListener('hashchange', show);
  show();
  return {
    stop() {
      stopped = true;
      win.removeEventListener('hashchange', show);
      if (typeof cleanup === 'function') cleanup();
    },
  };
}
