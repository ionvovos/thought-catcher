// S3 fixtures: every screen and state S3 builds, mounted with stub data so the visual check can reach it (AC-D5.1).
// Each entry is fixture(root) -> void|Promise. The fixture builds its own deterministic ctx and ignores the app's, so the
// pictures do not depend on what is stored on the machine. S1's `?fixture=<name>` route calls these through registerAll().
import { el } from '../ui/dom.js';
import { createMemoryStore } from '../storage/memory.js';
import { createSettingsApi, DEFAULTS } from '../storage/settings.js';
import { newThought } from '../core/model.js';

// Tue 29 Sep 2026, 14:30 local: the clock every fixture runs on.
export const NOW = new Date(2026, 8, 29, 14, 30);
const at = (d, h = 10, m = 0) => new Date(2026, 8, d, h, m);

export function sampleThought(id, type, title, text, o = {}) {
  const t = newThought({
    text: text || title, id, now: o.created ?? at(28), source: o.source ?? 'typed', by: o.by ?? 'device',
    sortResult: { type, title, tags: o.tags ?? [], confidence: 0.9, alt_type: null, due_at: o.due ? o.due.toISOString() : null },
  });
  if (o.done) { t.done = true; t.done_at = at(28, 12).toISOString(); }
  if (o.expansion) t.expansion = o.expansion;
  if (o.plan) t.plan = o.plan;
  if (o.review) t.review = { ...t.review, ...o.review };
  return t;
}

// 24 thoughts: 8 ideas, 6 tasks (one done), 6 journal, 4 reminders (the design's library-half numbers).
export function sampleThoughts() {
  const S = sampleThought;
  return [
    S('r1', 'reminder', 'Pick up the dry cleaning', '', { due: at(29, 18), created: at(28, 9) }),
    S('r2', 'reminder', 'Call the dentist about the crown', '', { due: at(30, 9), created: at(29, 8) }),
    S('r3', 'reminder', 'Pack gym bag the night before', '', { due: at(29, 21, 30), created: at(25) }),
    S('r4', 'reminder', 'Water the plants', 'Remind me to water the plants on Sunday', { due: new Date(2026, 9, 4, 9), created: at(27) }),
    S('t1', 'task', 'Book the car service', 'Book the car service before the 10th, ask about the rear brakes too.', { tags: ['car'], due: new Date(2026, 9, 10, 9), created: at(29, 8, 5) }),
    S('t2', 'task', 'Send Maria the photos from Sunday', '', { created: at(29, 8, 6), tags: ['family'] }),
    S('t3', 'task', 'Renew gym membership', 'Runs out on 12 October. Ask about the off-peak price.', { tags: ['fitness'], due: new Date(2026, 9, 12, 9), created: at(27) }),
    S('t4', 'task', 'Buy stamps and post the tax form', '', { created: at(29, 13) }),
    S('t5', 'task', 'Call the insurance company', '', { done: true, created: at(24) }),
    S('t6', 'task', 'Order new running shoes', 'Order new running shoes, size 43, before the weekend.', { done: false, created: at(23), tags: ['fitness'] }),
    S('i1', 'idea', 'Gym plan: three short sessions instead of two long ones', 'Mon, Wed, Fri, 35 minutes each. Easier to keep than two long gym days, and it fits before work.', { tags: ['fitness'], created: at(26, 9), source: 'voice' }),
    S('i2', 'idea', 'Weekend bread-baking workshop', 'A weekend bread-baking workshop for the neighbours.', { created: at(25) }),
    S('i3', 'idea', 'Grocery list that learns what runs out', 'A grocery list that learns what we run out of.', { created: at(28, 14) }),
    S('i4', 'idea', 'Monthly photo book of the kids', '', { tags: ['family'], created: at(22) }),
    S('i5', 'idea', 'Standing desk for the small room', '', { created: at(21) }),
    S('i6', 'idea', 'Try cold showers for a week', '', { tags: ['fitness'], created: at(20) }),
    S('i7', 'idea', 'A quiet hour with no phone every evening', '', { created: at(19) }),
    S('i8', 'idea', 'Swap the car for a bike on short trips', '', { tags: ['car'], created: at(18) }),
    S('j1', 'journal', 'Good run by the sea this morning', '6 km without stopping. Felt easier than the treadmill at the gym.', { created: at(27, 8), tags: ['fitness'] }),
    S('j2', 'journal', 'Slept badly, too much coffee after 4', 'Skipped training. Pattern: late coffee, bad sleep, no workout.', { created: at(24, 7), tags: ['fitness'] }),
    S('j3', 'journal', 'Dinner at Maria\'s was lovely', '', { created: at(23), tags: ['family'] }),
    S('j4', 'journal', 'Rain all day, read instead', '', { created: at(22) }),
    S('j5', 'journal', 'Finally fixed the shelf', '', { created: at(21) }),
    S('j6', 'journal', 'Call with mum, she sounds well', '', { created: at(20), tags: ['family'] }),
  ];
}

export const STATUS = {
  ready: { llm: { state: 'ready', model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'none', online: true, engine: 'device' },
  first: { llm: { state: 'not-downloaded', bytes: 870000000 }, embed: { state: 'not-downloaded', bytes: 29000000 }, key: 'none', online: true, engine: 'rules' },
  downloading: { llm: { state: 'downloading', pct: 42, bytes: 870000000 }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'none', online: true, engine: 'rules' },
  unsupported: { llm: { state: 'not-supported', reason: 'no-webgpu' }, embed: { state: 'not-downloaded', bytes: 29000000 }, key: 'none', online: true, engine: 'rules' },
  failed: { llm: { state: 'error', code: 'load-failed', message: 'The assistant stopped working, so I\'m using simple rules for now. Try again in Settings.' }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'none', online: true, engine: 'rules' },
  rules: { llm: { state: 'not-supported', reason: 'no-webgpu' }, embed: { state: 'not-supported' }, key: 'none', online: true, engine: 'rules' },
};

// A stub brain: only what S3 calls. Every method is async like the real one, and the test can read `calls`.
export function makeBrain(status = STATUS.ready, over = {}) {
  const brain = new EventTarget();
  brain.status = structuredClone(status);
  brain.calls = [];
  const rec = (name, ...args) => brain.calls.push([name, ...args]);
  Object.assign(brain, {
    getStatus() { return structuredClone(brain.status); },
    setStatus(next) { brain.status = structuredClone(next); brain.dispatchEvent(new CustomEvent('status', { detail: brain.getStatus() })); },
    async prepare(o) { rec('prepare', o); },
    cancel() { rec('cancel'); },
    intent(text) { return { kind: /\?\s*$/.test(text) ? 'ask' : 'capture', text }; },
    async ask(q) {
      rec('ask', q);
      return { answer: 'You want three short sessions a week, and the membership runs out on 12 October.', sources: [
        { id: 'i1', score: 0.71, title: 'Gym plan: three short sessions', type: 'idea' },
        { id: 't3', score: 0.66, title: 'Renew gym membership', type: 'task' },
      ], mode: 'meaning', by: 'device' };
    },
    async related() { return []; },
    async topics() { return []; },
    async classify(text) { rec('classify', text); return { text, type: 'idea', alt_type: null, confidence: 0.9, title: text.slice(0, 60), tags: [], due_at: null, by: 'device', question: null, best_guess: false }; },
    async expand() { rec('expand'); throw Object.assign(new Error('unavailable'), { kind: 'unavailable' }); },
    async plan() { rec('plan'); throw Object.assign(new Error('unavailable'), { kind: 'unavailable' }); },
    async merge() {},
    ...over,
  });
  return brain;
}

// A ctx like the shell's (architecture 5), with recorded navigation and toasts.
export async function makeCtx({ thoughts = sampleThoughts(), status = STATUS.ready, settings = {}, brain: brainOver = {}, store: storeOpts = {} } = {}) {
  const store = createMemoryStore(storeOpts);
  await store.putMany(thoughts);
  const mem = new Map();
  const api = createSettingsApi({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) });
  api.setSettings({ ...settings });
  const brain = makeBrain(status, brainOver);
  const log = { nav: [], toasts: [], back: 0 };
  const ctx = {
    store, brain, settings: api, now: () => new Date(NOW), log,
    nav: { go: (h) => { log.nav.push(h); }, back: () => { log.back += 1; } },
    toast: (t) => { log.toasts.push(t); },
    status: () => brain.getStatus(),
  };
  return ctx;
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
export const settle = (ms = 60) => sleep(ms);

// ---- frames --------------------------------------------------------------------------------------------------------

// The assistant screen behind a sheet: only a greeting, enough for the scrim to sit on something.
function assistantBehind() {
  return [
    el('header', { class: 'topbar' }, [el('span', { class: 'pill' }, [el('span', { class: 'pill__dot' }), 'On this phone'])]),
    el('section', { class: 'stage' }, [el('h1', { class: 'greeting' }, 'Good afternoon'), el('p', { class: 'hint' }, 'Tap to talk.')]),
  ];
}

function sheetFrame(root, kind) {
  const sheet = el('section', { class: `sheet sheet--${kind}`, role: 'dialog', 'aria-label': 'Library' }, [el('span', { class: 'grabber', role: 'button', 'aria-label': 'Resize library' })]);
  root.replaceChildren(...assistantBehind(), el('div', { class: 'scrim' }), sheet);
  return sheet;
}

export async function libraryFixture(root, o = {}) {
  const { mountLibrary } = await import('../ui/library/index.js');
  const ctx = await makeCtx(o.ctx);
  const sheet = sheetFrame(root, o.full ? 'full' : 'half');
  const handle = mountLibrary(sheet, ctx);
  await settle();
  if (o.query !== undefined) {
    const input = sheet.querySelector('input');
    input.value = o.query;
    input.dispatchEvent(new Event('input'));
    await settle();
  }
  return { ctx, sheet, handle };
}

export const FIXTURES = {
  'library-half': (root) => libraryFixture(root),
  'library-full-search': (root) => libraryFixture(root, { full: true, query: 'gym' }),
  'library-empty': (root) => libraryFixture(root, { ctx: { thoughts: [] } }),
  'library-search-empty': (root) => libraryFixture(root, { full: true, query: 'passport' }),
};

// Adds a screen module's fixtures. Screens append here as they land.
export function addFixtures(map) { Object.assign(FIXTURES, map); }

export function registerAll(registerFixture) {
  for (const [name, fn] of Object.entries(FIXTURES)) registerFixture(name, (root) => fn(root));
}

// Register with the shell's registry when it exists; the standalone visual check imports FIXTURES directly.
try {
  const mod = await import('./fixtures.js');
  if (typeof mod.registerFixture === 'function') registerAll(mod.registerFixture);
} catch { /* the shell's fixtures.js is not loaded (unit test or standalone harness) */ }
