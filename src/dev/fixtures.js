// Screen fixtures for visual checks: load the app with ?fixture=<state> and the named screen renders with fixed data,
// no store, no network. S3 registers its states through registerFixture() from src/dev/fixtures-s3.js.
import { createMemoryStore } from '../storage/memory.js';
import { createBrain } from '../brain/index.js';
import { settingsApi } from '../storage/settings.js';
import { createNav } from '../ui/router.js';
import { createAssistant } from '../ui/conversation/screen.js';
import { initialState } from '../ui/conversation/machine.js';

const registry = new Map();
export const registerFixture = (name, fn) => { registry.set(name, fn); };
export const fixtureNames = () => [...registry.keys()];

const NOW = new Date(2026, 8, 29, 14, 32, 0);
export const fixtureNow = () => new Date(NOW);

export const STATUS = {
  device: { llm: { state: 'ready', model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'none', online: true, engine: 'device' },
  notDownloaded: { llm: { state: 'not-downloaded', bytes: 870000000 }, embed: { state: 'not-downloaded', bytes: 29000000 }, key: 'none', online: true, engine: 'rules' },
  downloading: { llm: { state: 'downloading', pct: 42, bytes: 870000000 }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'none', online: true, engine: 'rules' },
  notSupported: { llm: { state: 'not-supported', reason: 'no-webgpu' }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'none', online: true, engine: 'rules' },
  error: { llm: { state: 'error', code: 'load-failed', message: 'The assistant stopped working' }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'none', online: true, engine: 'rules' },
  offline: { llm: { state: 'ready', model: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' }, embed: { state: 'ready', model: 'Xenova/all-MiniLM-L6-v2' }, key: 'set', online: false, engine: 'key' },
};

const iso = (d, h, m = 0) => new Date(2026, 8, 29 + d, h, m).toISOString();
const row = (id, type, title, text, extra = {}) => ({
  id, text, type, title, tags: [], created_at: iso(-1, 9), updated_at: iso(-1, 9), source: 'voice', due_at: null, done: false, done_at: null,
  sort: { by: 'device', confidence: 0.9, alt_type: null, model: null }, clarify: { state: 'none', case: null, question: null, answer: null },
  expansion: null, review: { last_reviewed_at: null, snoozed_until: null, dismissed: false }, origin: null, best_guess: false, plan: null, v: 2, ...extra,
});

export const SAMPLE_THOUGHTS = [
  row('a1', 'reminder', 'Pick up the dry cleaning', 'Pick up the dry cleaning at six', { due_at: iso(0, 18) }),
  row('a2', 'reminder', 'Call the dentist about the crown', 'Call the dentist', { due_at: iso(1, 9) }),
  row('a3', 'task', 'Book the car service', 'Book the car service before the tenth', { due_at: iso(11, 10) }),
  row('a4', 'task', 'Send Maria the photos', 'Send Maria the photos'),
  row('a5', 'idea', 'Gym plan: three short sessions', 'Gym plan: three short sessions instead of two long ones'),
  row('a6', 'journal', 'Good run by the sea', 'Good run by the sea this morning'),
];

// The design's library numbers: 8 ideas, 6 tasks, 6 journal notes, 4 reminders.
const WANT = { idea: 8, task: 6, journal: 6, reminder: 4 };
for (const type of Object.keys(WANT)) {
  let n = SAMPLE_THOUGHTS.filter((t) => t.type === type).length;
  while (n < WANT[type]) { SAMPLE_THOUGHTS.push(row(`z-${type}-${n}`, type, `Sample ${type} ${n + 1}`, `Sample ${type} ${n + 1}`, { done: false })); n += 1; }
}

const RAMBLE = 'Okay so tomorrow I need to call the dentist about the crown, and book the car service before the tenth. Also send Maria the photos from Sunday. Oh, and an idea: a grocery list that learns what we run out of.';

export function filedRows() {
  const origin = (i) => ({ id: 'o1', index: i, count: 4 });
  return [
    row('f1', 'reminder', 'Call the dentist about the crown', 'Call the dentist about the crown', { due_at: iso(1, 9), origin: origin(0) }),
    row('f2', 'task', 'Book the car service', 'Book the car service before the tenth', { due_at: iso(11, 10), origin: origin(1) }),
    row('f3', 'task', 'Send Maria the photos from Sunday', 'Send Maria the photos from Sunday', { origin: origin(2) }),
    row('f4', 'idea', 'Grocery list that learns what runs out', 'A grocery list that learns what we run out of', { origin: origin(3), best_guess: true }),
  ];
}

// Builds a ctx for a fixture. `statusPatch` replaces the brain's status for this screen.
export function makeFixtureCtx({ status = STATUS.device, thoughts = SAMPLE_THOUGHTS, migration = null } = {}) {
  const store = createMemoryStore();
  const brain = createBrain({ store, settings: settingsApi, now: fixtureNow, llm: null, embedder: null, provider: null });
  brain.getStatus = () => status;
  if (migration) Object.defineProperty(store, 'migration', { value: migration });
  const toasts = [];
  return { store, brain, settings: settingsApi, now: fixtureNow, nav: createNav(), toast: (t) => toasts.push(t), status: () => status, toasts, thoughts };
}

function assistant(root, opts) {
  const ctx = makeFixtureCtx(opts);
  const a = createAssistant(ctx, { engines: [], speech: { engine: 'typing', failed: new Set() }, s3: opts.s3 ?? {} }, { thoughts: ctx.thoughts, status: ctx.status(), ...opts.snap });
  root.replaceChildren(a.el);
  return { ctx, a };
}

const q2 = { case: 2, text: 'When should I remind you to call the dentist?', chips: ['Tomorrow 9:00', 'Tomorrow 14:00', 'Pick a time'] };
const T = (kind, text) => ({ kind, text });

registerFixture('assistant-first-run', (root) => assistant(root, { status: STATUS.notDownloaded, thoughts: [], snap: { firstRun: true } }));
registerFixture('assistant-idle', (root) => assistant(root, { status: STATUS.device }));
registerFixture('assistant-downloading', (root) => assistant(root, { status: STATUS.downloading }));
registerFixture('no-webgpu-fallback', (root) => assistant(root, { status: STATUS.notSupported }));
registerFixture('assistant-listening', (root) => assistant(root, { status: STATUS.device, snap: { st: { ...initialState(), name: 'listening' }, level: 0.55, transcript: 'Okay so tomorrow I need to call the dentist about the crown, and book the car service before the tenth' } }));
registerFixture('assistant-thinking', (root) => assistant(root, { status: STATUS.device, snap: { st: { ...initialState(), name: 'thinking' }, log: [T('time', 'Today 14:32'), { kind: 'user', text: RAMBLE, editable: true }, { kind: 'thinking', text: 'Sorting your thoughts', by: 'On this phone' }] } }));
registerFixture('assistant-question', (root) => assistant(root, { status: STATUS.device, snap: { st: { ...initialState(), name: 'asking', items: [{}, {}, {}, {}], question: { index: 0, question: q2 } }, log: [T('time', 'Today 14:32'), { kind: 'user', text: RAMBLE, editable: true }, { kind: 'assistant', question: { question: q2, count: 4 } }] } }));
registerFixture('assistant-filed', (root) => {
  const rows = filedRows();
  const { a } = assistant(root, { status: STATUS.device, snap: { st: { ...initialState(), name: 'filed' }, log: [{ kind: 'user', text: '…a grocery list that learns what we run out of.' }, { kind: 'assistant', text: 'Done. Four thoughts, filed.', filed: true }], capture: rows } });
  return a;
});
registerFixture('composer-keyboard', (root) => assistant(root, { status: STATUS.device, snap: { typing: true, log: [T('time', 'Today 15:02'), { kind: 'assistant', text: 'Type your thought. Enter sends it.' }] } }));
registerFixture('assistant-speaking', (root) => assistant(root, { status: STATUS.device, snap: { st: { ...initialState(), name: 'filed', speaking: true }, log: [{ kind: 'user', text: 'Remind me to call mum on Saturday morning', editable: true }, { kind: 'assistant', text: 'Filed as a reminder for Saturday 9:00.', speaking: 'Samantha', filed: true }], capture: [row('s1', 'reminder', 'Call mum', 'Call mum', { due_at: iso(5, 9) })] } }));
registerFixture('assistant-model-failed', (root) => assistant(root, { status: STATUS.error, snap: { st: { ...initialState(), name: 'filed' }, log: [{ kind: 'user', text: 'Idea: a shared calendar for the flat', editable: true }, { kind: 'error', iconName: 'chip', name: 'Assistant stopped', text: "The assistant stopped working, so I'm using simple rules for now. Try again in Settings.", replies: [{ label: 'Open Settings', icon: 'refresh', onClick() {} }] }, { kind: 'assistant', text: 'Filed as an idea.', filed: true }], capture: [row('m1', 'idea', 'Shared calendar for the flat', 'Idea: a shared calendar for the flat', { sort: { by: 'rules', confidence: 0.9, alt_type: null, model: null } })] } }));
registerFixture('error-offline', (root) => assistant(root, { status: STATUS.offline, snap: { st: { ...initialState(), name: 'error', error: 'not-allowed' }, log: [{ kind: 'user', text: 'Remind me to pick up the dry cleaning on Friday' }, { kind: 'assistant', text: 'Filed as a reminder for Friday 18:00.', filed: true }, { kind: 'error', iconName: 'micoff', name: 'Microphone blocked', text: "I couldn't hear you. The browser is blocking the microphone for this app.", replies: [{ label: 'How to allow it', onClick() {} }, { label: 'Type instead', icon: 'keyboard', onClick() {} }] }], capture: [row('e1', 'reminder', 'Pick up the dry cleaning', 'Pick up the dry cleaning', { due_at: iso(2, 18) })] } }));
registerFixture('assistant-consent', (root) => assistant(root, { status: STATUS.notDownloaded, snap: { st: { ...initialState(), name: 'filed' }, log: [{ kind: 'user', text: 'Remind me to water the plants on Sunday', editable: true }, { kind: 'assistant', text: 'Filed as a reminder for Sunday 9:00.', filed: true }, { kind: 'consent', text: 'Want a smarter assistant?' }], capture: [row('c1', 'reminder', 'Water the plants', 'Remind me to water the plants on Sunday', { due_at: iso(5, 9), sort: { by: 'rules', confidence: 0.9, alt_type: null, model: null } })] } }));
registerFixture('migration-running', (root) => assistant(root, { status: STATUS.device, snap: { migrationRun: { done: 38, total: 52 } } }));
registerFixture('migration-failed', (root) => assistant(root, { status: STATUS.device, migration: { state: 'failed', count: 0, quarantined: 0, readOnly: true } }));

export async function runFixture(name, root) {
  const fn = registry.get(name);
  if (!fn) throw new Error(`no fixture named "${name}"`);
  return fn(root, makeFixtureCtx());
}
