import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrain } from '../src/brain/index.js';
import { createBrainCore, refineItem, coverageGuard, assignQuestions, clarifyQuestionFor, whenFromAnswer, LLM_FLAG, STOPPED_MESSAGE } from '../src/brain/core.js';
import { createMemoryStore } from '../src/storage/memory.js';
import { createSettingsApi } from '../src/storage/settings.js';
import { newThought } from '../src/core/model.js';
import { AiError } from '../src/core/ai/http.js';
import { RAMBLES, NOW } from './fixtures/rambles.js';
import { THOUGHTS, QUESTIONS_LEXICAL, RELATED_PAIRS, TOPIC_IDEAS, TOPIC_EXPECTED } from './fixtures/corpus.js';

// ---- helpers ----
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const mkSettings = (patch = {}) => { const s = createSettingsApi(memoryStorage()); s.setSettings(patch); return s; };
const json = (o) => JSON.stringify(o);
const modelItems = (r) => ({ items: r.items.map(({ text, type, title, when }) => ({ text, type, title, when })) });

// A model stub: `reply(messages)` returns the raw text; calls are recorded.
function stubLlm(reply) {
  const calls = [];
  return { calls, model: 'stub-model', generate: async (messages, opts) => { calls.push({ messages, opts }); return typeof reply === 'function' ? reply(messages, calls.length) : reply; } };
}
const rambleLlm = () => stubLlm((messages) => {
  const note = messages.at(-1).content;
  const r = RAMBLES.find((x) => x.note === note);
  return r ? json(modelItems(r)) : '{"items":[]}';
});
const mkBrain = (opts = {}) => {
  const store = opts.store ?? createMemoryStore();
  const settings = opts.settings ?? mkSettings();
  const brain = createBrain({ store, settings, now: () => NOW, llm: null, embedder: null, ...opts, store, settings });
  return { brain, store, settings };
};
const statuses = (brain) => { const out = []; brain.addEventListener('status', (e) => out.push(e.detail)); return out; };
const stored = (id, type, text, extra = {}) => ({
  ...newThought({ text, id, now: NOW, sortResult: { type, title: text.slice(0, 50), tags: [], confidence: 0.9, alt_type: null, due_at: null } }), ...extra,
});

// ---- AC-X3.1, X3.2: the mocked model on the ramble set ----
test('AC-X3.1: with a mocked model every ramble splits to the expected count and item types', async () => {
  const { brain } = mkBrain({ llm: rambleLlm() });
  for (const r of RAMBLES) {
    const items = await brain.split(r.note, { source: 'typed' });
    assert.equal(items.length, r.items.length, r.note);
    assert.deepEqual(items.map((i) => i.type), r.items.map((i) => i.type), r.note);
    assert.ok(items.every((i) => i.by === 'device'), 'model items carry by: device');
  }
});

test('AC-X3.2: the reminder date comes from parseWhen under the fixed clock, never from the model', async () => {
  const llm = stubLlm(json({ items: [{ type: 'reminder', title: 'Send the invoice to Maria', text: 'Remind me on Friday at 6pm to send the invoice to Maria', when: 'Friday at 6pm', due_at: '1999-01-01T00:00:00Z' }] }));
  const { brain } = mkBrain({ llm });
  const [item] = await brain.split('Remind me on Friday at 6pm to send the invoice to Maria');
  const d = new Date(item.due_at);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 2);
  assert.equal(d.getHours(), 18);
});

test('refinement: a reminder cue or a timed appointment overrides the model type; tags and title are code-owned', () => {
  const a = refineItem({ type: 'task', title: 'Book the car service', text: 'remind me Monday at 9 to book the car service', when: 'Monday at 9' }, NOW, 'device');
  assert.equal(a.type, 'reminder');
  const b = refineItem({ type: 'task', title: 'Call the dentist', text: 'call the dentist at 3pm', when: null }, NOW, 'device');
  assert.equal(b.type, 'reminder');
  const c = refineItem({ type: 'idea', title: 'x'.repeat(10), text: 'what if the gym app showed a streak calendar', when: null }, NOW, 'key');
  assert.equal(c.type, 'idea');
  assert.equal(c.by, 'key');
  assert.equal(c.due_at, null, 'ideas carry no date');
  assert.ok(c.tags.length <= 5 && c.tags.every((t) => t === t.toLowerCase()));
});

test('refinement confidence: agreement 0.9, no rule cue 0.8, disagreement 0.6 with the rules type as alt_type', () => {
  assert.equal(refineItem({ type: 'idea', title: 't', text: 'what if we could share lists', when: null }, NOW, 'device').confidence, 0.9);
  assert.equal(refineItem({ type: 'idea', title: 't', text: 'the harbour light at dusk', when: null }, NOW, 'device').confidence, 0.8);
  const d = refineItem({ type: 'task', title: 'Call the dentist', text: 'call the dentist tomorrow', when: 'tomorrow' }, NOW, 'device');
  assert.equal(d.confidence, 0.6);
  assert.equal(d.alt_type, 'reminder');
});

test('a disagreement between model and rules fires question case 1 with chips (architecture 2.4)', async () => {
  const llm = stubLlm(json({ items: [{ type: 'task', title: 'Call the dentist', text: 'call the dentist tomorrow', when: 'tomorrow' }] }));
  const { brain } = mkBrain({ llm });
  const [item] = await brain.split('call the dentist tomorrow');
  assert.equal(item.question?.case, 1);
  assert.deepEqual(item.question.chips, ['Task', 'Reminder']);
  assert.ok(item.question.text.split(/\s+/).length <= 20);
  assert.equal(item.best_guess, false);
});

test('coverage guard: an item the model dropped comes back as a rule-sorted extra, in spoken order', async () => {
  const note = 'Email Anna about the venue. Send the invoice to Maria before the contract expires. Renew the passport, it expires in March.';
  const llm = stubLlm(json({ items: [{ type: 'task', title: 'Email Anna', text: 'Email Anna about the venue', when: null }] }));
  const { brain } = mkBrain({ llm });
  const items = await brain.split(note);
  assert.equal(items.length, 3);
  assert.match(items[1].text.toLowerCase(), /invoice/);
  assert.match(items[2].text.toLowerCase(), /passport/);
  assert.deepEqual(items.map((i) => i.by), ['device', 'rules', 'rules']);
});

test('coverage guard does nothing when the model covers the note; never more than 8 items', () => {
  const items = [{ text: 'buy milk and bread', type: 'task', alt_type: null, confidence: 0.9, title: 'Buy milk', tags: [], due_at: null, by: 'device', question: null, best_guess: false }];
  assert.equal(coverageGuard('buy milk and bread', items, NOW).length, 1);
  const eight = Array.from({ length: 12 }, (_, i) => ({ ...items[0], text: `item${i}` }));
  assert.ok(coverageGuard('anything', eight, NOW).length <= 8);
});

test('an item the model invented (words not in the note) is dropped; if nothing is left the rules split runs', async () => {
  const llm = stubLlm(json({ items: [{ type: 'idea', title: 'Podcast about old Athens bars', text: 'a podcast about old Athens bars', when: null }] }));
  const { brain } = mkBrain({ llm });
  const items = await brain.split('Buy milk and eggs on the way home');
  assert.equal(items.length, 1);
  assert.equal(items[0].by, 'rules');
  assert.equal(items[0].type, 'task');
});

// ---- B1: no model, no key ----
test('AC-B1.1: with no model and no key split, classify, reply, question, ask and search all work on rules', async () => {
  const { brain, store } = mkBrain();
  await brain.ready;
  const items = await brain.split(RAMBLES[0].note);
  assert.equal(items.length, 4);
  assert.ok(items.every((i) => i.by === 'rules'));
  assert.match(brain.reply(items), /^Filed 2 tasks, an idea and a reminder for Fri 18:00\.$/);
  assert.equal((await brain.classify('buy milk')).type, 'task');
  await store.putMany(THOUGHTS.slice(0, 5).map((t) => stored(t.id, t.type, t.text)));
  const a = await brain.ask('what did I say about the gym?');
  assert.equal(a.mode, 'keyword');
  assert.ok(a.sources.length >= 1 && a.sources.every((s) => ['g1', 'g2', 'g3'].includes(s.id)));
  assert.equal(brain.getStatus().engine, 'rules');
});

test('empty input gives no items and classify rejects it', async () => {
  const { brain } = mkBrain();
  assert.deepEqual(await brain.split('   '), []);
  await assert.rejects(brain.classify('  '), TypeError);
});

test('splitRules is the sync rule split S1 saves before any AI call (AC-X2.5)', () => {
  const { brain } = mkBrain();
  const items = brain.splitRules('buy milk and call mum tomorrow at 5');
  assert.ok(items.length >= 1 && items.every((i) => i.by === 'rules'));
});

// ---- AC-B1.4, B2.5: failures fall to rules and never lose the thought ----
for (const [name, reply] of Object.entries({
  'malformed JSON': 'here you go: {"items": [',
  'zero items': json({ items: [] }),
  'no items list': json({ answer: 'x' }),
  'unknown type': json({ items: [{ type: 'note', title: 't', text: 'buy milk', when: null }] }),
  'prose only': 'Sure! I split it for you.',
})) {
  test(`model output "${name}" gives the rules result and is never stored as is`, async () => {
    const { brain } = mkBrain({ llm: stubLlm(reply) });
    const items = await brain.split('buy milk and call mum tomorrow at 5');
    assert.ok(items.length >= 1);
    assert.ok(items.every((i) => i.by === 'rules'), name);
    assert.equal(brain.getStatus().llm.state, 'ready', 'a bad reply is not a model failure');
  });
}

test('AC-B2.5: a throwing model gives rules, no rejection, and an error status', async () => {
  const llm = { model: 'm', generate: async () => { throw new Error('gpu lost'); } };
  const { brain } = mkBrain({ llm });
  const seen = statuses(brain);
  const items = await brain.split('buy milk');
  assert.equal(items[0].by, 'rules');
  assert.equal(brain.getStatus().llm.state, 'error');
  assert.equal(brain.getStatus().llm.code, 'run-failed');
  assert.equal(brain.getStatus().engine, 'rules');
  assert.ok(seen.some((s) => s.llm.state === 'error'));
});

test('a model that takes too long gives rules within the timeout and an error status', async () => {
  const llm = { model: 'm', generate: () => new Promise(() => {}) };
  const { brain } = mkBrain({ llm, timeouts: { split: 30 } });
  const started = Date.now();
  const items = await brain.split('buy milk');
  assert.ok(Date.now() - started < 1000);
  assert.equal(items[0].by, 'rules');
  assert.equal(brain.getStatus().llm.state, 'error');
});

// ---- B3: own key ----
const stubProvider = (over = {}) => {
  const calls = [];
  const rec = (name, fn) => async (...a) => { calls.push(name); return fn(...a); };
  return {
    calls, model: 'provider-model',
    split: rec('split', async () => [{ type: 'task', title: 'Buy milk', text: 'buy milk', when: null }]),
    classify: rec('classify', async () => ({ type: 'task', title: 'Buy milk', when: null })),
    expand: rec('expand', async () => ({ next_steps: ['a', 'b', 'c'], questions: ['q', 'r', 's'], outline: ['o', 'p', 'q'] })),
    plan: rec('plan', async () => ({ steps: [{ text: 'a', done: false }, { text: 'b', done: false }, { text: 'c', done: false }] })),
    answer: rec('answer', async () => 'You said to buy milk.'),
    ...over,
  };
};

test('AC-B3.3: with a key set every language task uses the provider and the on-device model is never called', async () => {
  const llm = stubLlm('{"items":[]}');
  const provider = stubProvider();
  const { brain, store } = mkBrain({ llm, provider });
  assert.equal(brain.getStatus().engine, 'key');
  assert.equal(brain.getStatus().key, 'set');
  const [item] = await brain.split('buy milk');
  assert.equal(item.by, 'key');
  await brain.classify('buy milk');
  const ex = await brain.expand(stored('i', 'idea', 'an idea'));
  assert.equal(ex.by, 'key');
  assert.equal(ex.model, 'provider-model');
  const pl = await brain.plan(stored('t', 'task', 'a task'));
  assert.equal(pl.by, 'key');
  await store.put(stored('m1', 'task', 'buy milk'));
  const ans = await brain.ask('milk');
  assert.equal(ans.by, 'key');
  assert.equal(llm.calls.length, 0);
  assert.deepEqual([...new Set(provider.calls)].sort(), ['answer', 'classify', 'expand', 'plan', 'split']);
});

test('AC-B3.5 / architecture 2.2: a 401 marks the key rejected once, falls to the device model, and is not retried', async () => {
  const provider = stubProvider({ split: async () => { throw new AiError('auth', 'Key rejected.', { status: 401 }); } });
  const llm = stubLlm(json({ items: [{ type: 'task', title: 'Buy milk', text: 'buy milk', when: null }] }));
  const { brain } = mkBrain({ llm, provider });
  const seen = statuses(brain);
  const [item] = await brain.split('buy milk');
  assert.equal(item.by, 'device', 'the thought is still filed, by the next rung');
  assert.equal(brain.getStatus().key, 'rejected');
  assert.equal(brain.getStatus().engine, 'device');
  assert.ok(seen.some((s) => s.key === 'rejected'));
  let called = 0;
  provider.split = async () => { called += 1; return []; };
  await brain.split('buy eggs');
  assert.equal(called, 0, 'a rejected key is not sent again');
});

test('a provider failure or offline falls to the device model when ready, else rules, with the thought kept', async () => {
  const provider = stubProvider({ split: async () => { throw new AiError('network', 'x'); } });
  const { brain } = mkBrain({ provider });
  const [item] = await brain.split('buy milk');
  assert.equal(item.by, 'rules');
  assert.equal(brain.getStatus().lastError.engine, 'key');
  const offline = mkBrain({ provider: stubProvider(), llm: stubLlm(json({ items: [{ type: 'task', title: 'Buy milk', text: 'buy milk', when: null }] })), online: () => false });
  const [second] = await offline.brain.split('buy milk');
  assert.equal(second.by, 'device');
  assert.equal(offline.brain.getStatus().online, false);
});


test('AC-B3.3: with a key the provider words the reply and the question; failures keep the templates', async () => {
  const items = Object.assign([{ type: 'task', title: 'Call the dentist', text: 'call the dentist tomorrow', when: 'tomorrow' }], { reply: 'Got it, the dentist call is on your list.' });
  const provider = stubProvider({ split: async () => items, word: async (q) => `Friendly: ${q}` });
  const llm = stubLlm('{}');
  const { brain } = mkBrain({ provider, llm });
  const out = await brain.split('call the dentist tomorrow');
  assert.equal(brain.reply(out), 'Got it, the dentist call is on your list.');
  assert.equal(out[0].question?.case, 1);
  assert.match(out[0].question.text, /^Friendly: Task to do, or a reminder/);
  assert.deepEqual(out[0].question.chips, ['Task', 'Reminder'], 'code still owns the case and the chips');
  assert.equal(llm.calls.length, 0);
  const failing = mkBrain({ provider: stubProvider({ split: async () => items, word: async () => { throw new AiError('timeout', 't'); } }) });
  const again = await failing.brain.split('call the dentist tomorrow');
  assert.match(again[0].question.text, /^Task to do, or a reminder/);
  const plain = mkBrain();
  const rules = await plain.brain.split('buy milk');
  assert.match(plain.brain.reply(rules), /^Filed as a task/);
});

test('AC-B3.4 through the brain: a saved key goes only to its provider host, and a provider switch to another address sends nothing', async () => {
  const settings = mkSettings({ 'ai.provider': 'anthropic' });
  const binding = { provider: 'anthropic', host: 'api.anthropic.com' };
  settings.setKey('sk-ant-SECRET', binding);
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url, key: init.headers['x-api-key'] ?? init.headers.authorization ?? null });
    return { ok: true, status: 200, text: async () => JSON.stringify({ content: [{ type: 'text', text: json({ items: [{ type: 'task', title: 'Buy milk', text: 'buy milk', when: null }] }) }] }) };
  };
  const { brain } = mkBrain({ settings, fetch, provider: undefined });
  assert.equal(brain.getStatus().engine, 'key');
  assert.equal((await brain.split('buy milk'))[0].by, 'key');
  assert.ok(sent.length >= 1 && sent.every((s) => s.url.startsWith('https://api.anthropic.com/') && s.key === 'sk-ant-SECRET'));
  const before = sent.length;
  settings.setSettings({ 'ai.provider': 'openai', 'ai.model': 'gpt-x', 'ai.base_url': 'https://other.example.test/v1' });
  assert.equal(brain.getStatus().key, 'none', 'a key entered for another host is not used');
  assert.equal((await brain.split('buy eggs'))[0].by, 'rules');
  assert.equal(sent.length, before, 'nothing was sent to the new address');
  settings.removeKey();
  settings.setSettings({ 'ai.provider': 'none' });
  assert.equal(brain.getStatus().key, 'none');
});

// ---- status events ----
function fakeHost({ check = null, load } = {}) {
  const host = { model: 'fake-model', calls: [], loadedFlag: false, check: async () => check, loaded: () => host.loadedFlag, cancel() { host.calls.push('cancel'); }, generate: async () => '{}',
    load: async (o) => { host.calls.push('load'); await load?.(o, host); host.loadedFlag = true; } };
  return host;
}
const settle = () => new Promise((r) => setTimeout(r, 5));

test('status: not-supported carries the reason (AC-B2.4)', async () => {
  for (const reason of ['no-webgpu', 'no-f16', 'memory']) {
    const { brain } = mkBrain({ llm: fakeHost({ check: { state: 'not-supported', reason } }) });
    await brain.ready;
    assert.deepEqual(brain.getStatus().llm, { state: 'not-supported', reason });
    assert.equal(brain.getStatus().engine, 'rules');
  }
});

test('status: not-downloaded, downloading with progress, ready, then the engine is the device (AC-B2.2)', async () => {
  const host = fakeHost({ load: async ({ onProgress }) => { onProgress(10); onProgress(60); onProgress(100); } });
  const { brain, settings } = mkBrain({ llm: host });
  await brain.ready;
  assert.deepEqual(brain.getStatus().llm, { state: 'not-downloaded', bytes: 870000000 });
  const seen = statuses(brain);
  await brain.prepare({ llm: true });
  const states = seen.map((s) => s.llm.state + (s.llm.pct !== undefined ? `:${s.llm.pct}` : ''));
  assert.deepEqual(states.filter((x, i) => states.indexOf(x) === i), ['downloading:0', 'downloading:10', 'downloading:60', 'downloading:100', 'ready']);
  assert.deepEqual(brain.getStatus().llm, { state: 'ready', model: 'fake-model' });
  assert.equal(brain.getStatus().engine, 'device');
  assert.equal(settings.getSettings()[LLM_FLAG], null, 'the crash flag is cleared on ready');
  assert.equal(settings.getSettings()['brain.llm_consent'], 'yes');
});

test('status: a later launch loads from cache ("loading") and starts by itself only after a completed download and consent, with no key', async () => {
  const settings = mkSettings({ 'brain.llm_consent': 'yes', 'brain.llm_ready_once': true });
  const host = fakeHost({ load: async ({ onProgress }) => { onProgress(50); } });
  const { brain } = mkBrain({ llm: host, settings });
  const seen = statuses(brain);
  await brain.ready;
  assert.ok(seen.some((s) => s.llm.state === 'loading' && s.llm.pct === 50));
  assert.equal(brain.getStatus().llm.state, 'ready');
  const keyed = mkBrain({ llm: fakeHost(), settings, provider: stubProvider() });
  await keyed.brain.ready;
  assert.equal(keyed.brain.getStatus().llm.state, 'not-downloaded', 'AC-B3.3: never loaded when a key is set');
  const fresh = mkBrain({ llm: fakeHost(), settings: mkSettings() });
  await fresh.brain.ready;
  assert.equal(fresh.brain.getStatus().llm.state, 'not-downloaded', 'no consent, no download');
});

test('status: watchdog, offline and other load errors; the app keeps working on rules', async () => {
  for (const [err, code] of [[Object.assign(new Error('w'), { code: 'watchdog' }), 'watchdog'], [Object.assign(new Error('o'), { code: 'offline' }), 'offline'], [new Error('boom'), 'load-failed']]) {
    const { brain, settings } = mkBrain({ llm: fakeHost({ load: async () => { throw err; } }) });
    await brain.ready;
    await brain.prepare({ llm: true });
    assert.equal(brain.getStatus().llm.state, 'error');
    assert.equal(brain.getStatus().llm.code, code);
    assert.equal(brain.getStatus().engine, 'rules');
    assert.equal(settings.getSettings()[LLM_FLAG], null, 'a handled error clears the crash flag');
    assert.equal((await brain.split('buy milk'))[0].by, 'rules');
  }
});

test('status: cancel during a download returns to not-downloaded and calls the host', async () => {
  let release;
  const host = fakeHost({ load: () => new Promise((r) => { release = r; }) });
  const { brain } = mkBrain({ llm: host });
  await brain.ready;
  const p = brain.prepare({ llm: true });
  await settle();
  assert.equal(brain.getStatus().llm.state, 'downloading');
  brain.cancel();
  assert.equal(brain.getStatus().llm.state, 'not-downloaded');
  assert.ok(host.calls.includes('cancel'));
  release();
  await p;
  assert.equal(brain.getStatus().llm.state, 'not-downloaded', 'a cancelled load does not flip the state when it settles');
});

test('crash-loop flag (architecture 2.6): a flag left set means load-failed, nothing loads by itself, only prepare retries', async () => {
  const settings = mkSettings({ 'brain.llm_consent': 'yes', 'brain.llm_ready_once': true, [LLM_FLAG]: '2026-09-29T09:00:00.000Z' });
  const host = fakeHost();
  const { brain } = mkBrain({ llm: host, settings });
  await brain.ready;
  assert.equal(brain.getStatus().llm.state, 'error');
  assert.equal(brain.getStatus().llm.code, 'load-failed');
  assert.equal(brain.getStatus().llm.message, STOPPED_MESSAGE);
  assert.equal(host.calls.includes('load'), false);
  assert.ok(settings.getSettings()[LLM_FLAG], 'the flag stays until the user retries');
  await brain.prepare({ llm: true });
  assert.equal(host.calls.includes('load'), true);
  assert.equal(brain.getStatus().llm.state, 'ready');
  assert.equal(settings.getSettings()[LLM_FLAG], null);
});

test('the flag is set while the engine loads', async () => {
  const settings = mkSettings();
  let during = null;
  const host = fakeHost({ load: async () => { during = settings.getSettings()[LLM_FLAG]; } });
  const { brain } = mkBrain({ llm: host, settings });
  await brain.ready;
  await brain.prepare({ llm: true });
  assert.match(during, /^2026-09-29T/);
});

test('status: embed states and precedence fields (key, online) are reported', async () => {
  const embHost = { calls: 0, check: async () => ({ state: 'not-supported', reason: 'no-wasm' }) };
  const { brain } = mkBrain({ embedder: { ...embHost, load: async () => {}, embed: async () => [] } });
  await brain.ready;
  assert.equal(brain.getStatus().embed.state, 'not-supported');
  const { brain: b2 } = mkBrain({ provider: stubProvider(), online: () => false });
  assert.deepEqual([b2.getStatus().key, b2.getStatus().online, b2.getStatus().engine], ['set', false, 'key']);
});

test('G21: engine "key" wins over "not-downloaded" (with a key set the pill says the key)', async () => {
  const { brain } = mkBrain({ llm: fakeHost(), provider: stubProvider() });
  await brain.ready;
  const s = brain.getStatus();
  assert.equal(s.llm.state, 'not-downloaded');
  assert.equal(s.engine, 'key');
});

// ---- one question: answers ----
test('clarifyQuestion: without any AI only cases 2 and 5 are asked (architecture 2.4)', () => {
  const t = (over) => ({ text: 'x thing', type: 'task', alt_type: null, confidence: 0.9, title: 'x', tags: [], due_at: null, by: 'rules', ...over });
  const c1 = t({ text: 'call the dentist tomorrow', type: 'task', alt_type: 'reminder', confidence: 0.6 });
  assert.equal(clarifyQuestionFor(c1, { aiAvailable: true }).case, 1);
  assert.equal(clarifyQuestionFor(c1, { aiAvailable: false }), null);
  const c2 = t({ text: 'remind me to call mum', type: 'reminder', due_at: null });
  assert.deepEqual(clarifyQuestionFor(c2, { aiAvailable: false }).chips, ['Tonight', 'Tomorrow morning', 'This weekend']);
  const c3 = t({ text: 'the idea', type: 'idea', confidence: 0.9 });
  assert.equal(clarifyQuestionFor(c3, { aiAvailable: true }).case, 3);
  assert.equal(clarifyQuestionFor(c3, { aiAvailable: false }), null);
  const c5 = t({ text: 'uh gym', type: 'task', confidence: 0.3 });
  assert.equal(clarifyQuestionFor(c5, { aiAvailable: false }).case, 5);
  assert.deepEqual(clarifyQuestionFor(c5, { aiAvailable: false }).chips, []);
  assert.equal(clarifyQuestionFor(c1, { source: 'import', aiAvailable: true }), null, 'an imported thought is never questioned');
});

test('in a ramble only the first askable item carries the question; other ambiguous items are best guesses', () => {
  const base = { type: 'reminder', alt_type: null, confidence: 0.9, title: 't', tags: [], due_at: null, by: 'rules', question: null, best_guess: false };
  const items = assignQuestions([
    { ...base, text: 'buy milk', type: 'task', due_at: null },
    { ...base, text: 'remind me to call mum' },
    { ...base, text: 'remind me to email Sam' },
  ], { aiAvailable: false });
  assert.deepEqual(items.map((i) => [i.question?.case ?? null, i.best_guess]), [[null, false], [2, false], [null, true]]);
});

test('answer(): case 2 parses the reply with parseWhen first; chips Tonight, Tomorrow morning, This weekend resolve without a model', async () => {
  const { brain } = mkBrain();
  const thought = stored('r', 'reminder', 'remind me to call mum');
  const q = { case: 2, text: 'When should I remind you?', chips: [] };
  const at = async (reply) => (await brain.answer(thought, q, reply)).due_at;
  assert.equal(new Date(await at('tomorrow at 6pm')).getHours(), 18);
  assert.equal(new Date(await at('Tonight')).getHours(), 20);
  assert.equal(new Date(await at('Tomorrow morning')).getHours(), 9);
  const weekend = new Date(await at('This weekend'));
  assert.equal(weekend.getDay(), 6);
  assert.equal(weekend.getHours(), 10);
  assert.equal(whenFromAnswer('whenever', NOW), null);
});

test('answer(): chips for cases 1 and 4 set the type; free text is re-classified; empty answers change nothing', async () => {
  const { brain } = mkBrain();
  const thought = stored('t', 'task', 'call the dentist tomorrow', { due_at: '2026-09-30T06:00:00.000Z' });
  const p1 = await brain.answer(thought, { case: 1, text: '', chips: ['Task', 'Reminder'] }, 'Reminder');
  assert.equal(p1.type, 'reminder');
  assert.equal(p1.due_at, thought.due_at);
  const p4 = await brain.answer(stored('i', 'idea', 'the harbour at dusk'), { case: 4, text: '', chips: [] }, 'Journal');
  assert.equal(p4.type, 'journal');
  assert.equal(p4.due_at, null);
  const p3 = await brain.answer(stored('x', 'idea', 'good idea'), { case: 3, text: '', chips: [] }, 'a gym app with a streak calendar');
  assert.deepEqual(Object.keys(p3).sort(), ['due_at', 'tags', 'title', 'type']);
  const same = await brain.answer(thought, { case: 3, text: '', chips: [] }, '   ');
  assert.equal(same.type, 'task');
});

// ---- expand and plan ----
test('expand and plan: validated, stamped with by and model, and never written; errors are typed', async () => {
  const llm = stubLlm((m) => (m[0].content.includes('"steps"') ? json({ steps: ['Find the bill', 'Pay it', 'Save the receipt'] }) : json({ next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'] })));
  const { brain, store } = mkBrain({ llm });
  const idea = stored('i', 'idea', 'a gym app');
  await store.put(idea);
  const ex = await brain.expand(idea);
  assert.deepEqual(Object.keys(ex).sort(), ['by', 'generated_at', 'model', 'next_steps', 'outline', 'questions']);
  assert.equal(ex.by, 'device');
  assert.equal(ex.model, 'stub-model');
  const pl = await brain.plan(stored('t', 'task', 'pay the bill'));
  assert.deepEqual(pl.steps, [{ text: 'Find the bill', done: false }, { text: 'Pay it', done: false }, { text: 'Save the receipt', done: false }]);
  assert.equal((await store.get('i')).expansion, null, 'the brain does not write');
  const bad = mkBrain({ llm: stubLlm('not json') });
  await assert.rejects(bad.brain.expand(idea), (e) => e.kind === 'malformed');
  const none = mkBrain();
  await assert.rejects(none.brain.plan(idea), (e) => e.kind === 'unavailable');
});

// ---- ask, related, topics with an embedding stub ----
const AXES = ['g', 'c', 'f', 'h', 'p', 'm', 'w', 't', 's', 'r', 'misc', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
const axisOf = (id) => AXES.indexOf(/^[a-z]/.test(id) ? (AXES.includes(id[0]) ? id[0] : 'misc') : 'misc');
const questionAxis = { 'what did I say about the gym?': 'g', 'what about the dentist?': 'c', 'what about the electricity bill?': 'f', 'what about the balcony?': 'h', 'anything about the Athens podcast?': 'p', "when is mum's birthday?": 'm', 'what about the tracker app?': 'w', 'what about Berlin?': 't' };
function vec(axis, seed = 0) {
  const v = new Float32Array(AXES.length + 8);
  v[AXES.indexOf(axis)] = 1;
  v[AXES.length + (seed % 8)] = 0.15;
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
// maps a stored thought's "title\ntext" or a question back to a vector by topic
function stubEmbedder(items) {
  const byText = new Map(items.map((t) => [t.text, t.axis]));
  const calls = [];
  return {
    calls,
    embed: async (texts) => { calls.push(texts.length); return texts.map((s, i) => { const text = s.includes('\n') ? s.split('\n').slice(1).join('\n') : s; return vec(byText.get(text) ?? questionAxis[s] ?? 'misc', i); }); },
  };
}
const corpus = () => THOUGHTS.map((t) => ({ ...t, axis: t.id[0] === 'g' ? 'g' : AXES.includes(t.id[0]) ? t.id[0] : 'misc' }));

async function withCorpus(extra = {}) {
  const items = corpus();
  const embedder = stubEmbedder(items);
  const { brain, store } = mkBrain({ embedder, ...extra });
  await brain.ready;
  await store.putMany(items.map((t) => stored(t.id, t.type, t.text)));
  await brain.prepare({ embed: true });
  return { brain, store, embedder, items };
}

test('AC-X5.1 wiring: the relevant thought is in the top 3 for at least 8 of 10 questions (stub vectors; the real model runs in e2e/v2-brain.mjs)', async () => {
  const { brain } = await withCorpus();
  let hit = 0;
  for (const [q, relevant] of QUESTIONS_LEXICAL) {
    const a = await brain.ask(q);
    assert.equal(a.mode, 'meaning');
    assert.ok(a.sources.length <= 3);
    if (a.sources.some((s) => relevant.includes(s.id))) hit += 1;
  }
  assert.ok(hit >= Math.ceil(QUESTIONS_LEXICAL.length * 0.8), `${hit}/${QUESTIONS_LEXICAL.length}`);
});

test('AC-X5.2: every cited thought exists; nothing relevant gives the fixed sentence and no sources', async () => {
  const { brain, store } = await withCorpus();
  const a = await brain.ask('what did I say about the gym?');
  for (const s of a.sources) assert.ok(await store.get(s.id));
  assert.ok(a.answer.split(/\s+/).length <= 40);
  const none = await brain.ask('how tall is the moon lander of some faraway mission?');
  assert.equal(none.answer, "I couldn't find anything about that.");
  assert.deepEqual(none.sources, []);
});

test('AC-X5.3: an added, edited or deleted thought is reflected in the next answer without reload', async () => {
  const { brain, store } = await withCorpus();
  const before = (await brain.ask('what did I say about the gym?')).sources.map((s) => s.id);
  assert.ok(before.includes('g1'));
  await store.delete('g1');
  const after = (await brain.ask('what did I say about the gym?')).sources.map((s) => s.id);
  assert.equal(after.includes('g1'), false, 'a deleted thought is never cited');
  await store.put(stored('new1', 'idea', 'gym app streak calendar')); // the stub maps this text to the gym topic
  assert.ok((await brain.ask('what did I say about the gym?')).sources.some((s) => s.id === 'new1'), 'an added thought is cited in the next answer');
  const rows = await store.getAllEmbeddings();
  assert.equal(rows.some((r) => r.id === 'g1'), false, 'unindex removed the row');
});

test('AC-X5.4: without embeddings the same question returns thoughts by keyword, labelled keyword', async () => {
  const { brain, store } = mkBrain();
  await store.putMany(THOUGHTS.map((t) => stored(t.id, t.type, t.text)));
  const a = await brain.ask('what about the tracker app?');
  assert.equal(a.mode, 'keyword');
  assert.ok(a.sources.length >= 1 && a.sources.every((s) => ['w2', 'w3', 'w4'].includes(s.id)));
  assert.equal(a.by, 'rules');
});

test('ask with the model: the answer text comes from the model given only the cited thoughts; over 40 words is cut', async () => {
  const llm = stubLlm((m) => json({ answer: `You said ${'a lot '.repeat(50)}` }));
  const { brain } = await withCorpus({ llm });
  const a = await brain.ask('what did I say about the gym?');
  assert.equal(a.by, 'device');
  assert.ok(a.answer.split(/\s+/).length <= 40);
  const prompt = llm.calls.at(-1).messages.at(-1).content;
  for (const s of a.sources) assert.ok(prompt.includes(s.title.slice(0, 20)));
  assert.equal(prompt.includes('electricity bill'), false, 'thoughts that were not cited are not sent');
});

test('ask never rejects: an embedder that throws falls back to keyword', async () => {
  const items = corpus();
  const embedder = { embed: async () => { throw new Error('wasm crashed'); } };
  const { brain, store } = mkBrain({ embedder });
  await store.putMany(items.map((t) => stored(t.id, t.type, t.text)));
  const a = await brain.ask('what about Berlin?');
  assert.equal(a.mode, 'keyword');
  assert.ok(a.sources.length >= 1);
});

test('AC-X6.1: the partner of a known pair is in the top 3 related for at least 80% of pairs; a thought never lists itself', async () => {
  const { brain } = await withCorpus();
  let hit = 0;
  for (const [a, b] of RELATED_PAIRS) {
    const rel = (await brain.related(a, 3)).map((r) => r.id);
    assert.equal(rel.includes(a), false);
    if (rel.includes(b)) hit += 1;
  }
  assert.ok(hit / RELATED_PAIRS.length >= 0.8, `${hit}/${RELATED_PAIRS.length}`);
});

test('AC-X6.3: no relations shows nothing broken; a deleted thought is never listed; related without embeddings uses tags and words', async () => {
  const { brain, store } = await withCorpus();
  await store.put(stored('lone1', 'idea', 'a thought about nothing else here'));
  await brain.ready;
  assert.deepEqual(await brain.related('lone1', 3), [], 'no relation above the floor');
  assert.deepEqual(await brain.related('does-not-exist'), []);
  await store.delete('g2');
  assert.equal((await brain.related('g1', 3)).some((r) => r.id === 'g2'), false);
  const plain = mkBrain();
  const a = stored('a', 'idea', 'gym app streak calendar', { tags: ['gym', 'streak'] });
  const b = stored('b', 'journal', 'go back to the gym', { tags: ['gym'] });
  await plain.store.putMany([a, b]);
  assert.deepEqual((await plain.brain.related('a', 3)).map((r) => r.id), ['b']);
});

test('AC-X6.2: three topics of ideas are found, with a label each and no unrelated idea inside', async () => {
  const topicAxis = { a: 'g', b: 'p', c: 'w' };
  const items = TOPIC_IDEAS.map((t) => ({ ...t, axis: topicAxis[t.id[0]] ?? t.id }));
  const embedder = stubEmbedder(items);
  const { brain, store } = mkBrain({ embedder });
  await brain.ready;
  await store.putMany(items.map((t) => stored(t.id, 'idea', t.text, { tags: [] })));
  await brain.prepare({ embed: true });
  const topics = await brain.topics();
  assert.equal(topics.length, 3);
  assert.deepEqual(topics.map((t) => t.ids.slice().sort()).sort(), TOPIC_EXPECTED.map((g) => g.slice().sort()).sort());
  assert.ok(topics.every((t) => typeof t.label === 'string' && t.label.length > 0));
});

test('embeddings: indexing is by hash (an unchanged thought is not re-embedded) and rows are rebuilt in the background', async () => {
  const { brain, store, embedder } = await withCorpus();
  await brain.reindex();
  const rows = await store.getAllEmbeddings();
  assert.equal(rows.length, THOUGHTS.length);
  assert.equal(rows[0].vec.length, AXES.length + 8);
  const before = embedder.calls.length;
  await brain.index(await store.get('g1'));
  assert.equal(embedder.calls.length, before, 'same hash, no call');
  await store.put({ ...(await store.get('g1')), text: 'go back to the gym on Monday' });
  await brain.ready;
  await brain.reindex();
  assert.ok(embedder.calls.length > before);
  await assert.rejects(mkBrain().brain.embed(['x']), (e) => e.kind === 'unavailable');
});

test('merge (AC-X3.4): "keep as one" joins the texts in order, re-classifies, deletes the others and drops the origin', async () => {
  const { brain, store } = mkBrain();
  const origin = { id: 'o1', count: 3 };
  await store.putMany([
    stored('a', 'task', 'buy milk', { origin: { ...origin, index: 0 } }),
    stored('b', 'task', 'call mum tomorrow at 5', { origin: { ...origin, index: 1 } }),
    stored('c', 'idea', 'a gym app with a streak calendar', { origin: { ...origin, index: 2 } }),
  ]);
  const kept = await brain.merge('o1');
  assert.equal(kept.id, 'a');
  assert.equal(kept.text, 'buy milk. call mum tomorrow at 5. a gym app with a streak calendar');
  assert.equal(kept.origin, null);
  assert.deepEqual((await store.getAll()).map((t) => t.id), ['a']);
  assert.deepEqual(await store.getByOrigin('o1'), []);
  await assert.rejects(brain.merge('nothing'), /Nothing to merge/);
});

test('intent() is the sync pure rule set and is on the brain', () => {
  const { brain } = mkBrain();
  assert.equal(brain.intent('what did I say about the gym?').kind, 'ask');
  assert.equal(brain.intent('buy milk').kind, 'capture');
});

test('createBrainCore is usable directly with stubs and dispatches status events on every change', async () => {
  const store = createMemoryStore();
  const core = createBrainCore({ store, now: () => NOW, llm: null, embedder: null });
  const seen = [];
  core.addEventListener('status', (e) => seen.push(e.detail.engine));
  core.refresh();
  assert.deepEqual(seen, ['rules']);
});

// ---- real model output (fixtures/model-raw.js): the refinement absorbs shifted titles, swallowed and dropped sentences ----
test('real 1.5B replies: every ramble reaches its expected item count (misaligned items are relabelled by the rule split)', async () => {
  const { REAL_MODEL_RAW } = await import('./fixtures/model-raw.js');
  assert.equal(REAL_MODEL_RAW.length, RAMBLES.length);
  let right = 0;
  for (let i = 0; i < RAMBLES.length; i += 1) {
    const { brain } = mkBrain({ llm: stubLlm(REAL_MODEL_RAW[i]) });
    const items = await brain.split(RAMBLES[i].note);
    if (items.length === RAMBLES[i].items.length) right += 1;
    else assert.fail(`ramble ${i + 1}: ${items.length} items, expected ${RAMBLES[i].items.length}: ${JSON.stringify(items.map((x) => x.text))}`);
  }
  assert.equal(right, RAMBLES.length);
});

test('real 1.5B reply to ramble 1 (titles shifted one item down): four items, right types, the Friday reminder dated', async () => {
  const { REAL_MODEL_RAW } = await import('./fixtures/model-raw.js');
  const { brain } = mkBrain({ llm: stubLlm(REAL_MODEL_RAW[0]) });
  const items = await brain.split(RAMBLES[0].note);
  assert.deepEqual(items.map((i) => i.type), ['task', 'task', 'idea', 'reminder']);
  assert.equal(new Date(items[3].due_at).getDate(), 2);
  assert.equal(items[0].by, 'device', 'the aligned item keeps its model label');
  assert.equal(items[1].by, 'rules', 'the dropped sentence comes back from the rule split');
});

test('a self-consistent model split that covers the note is used as it is, even when the rules would split differently', async () => {
  const note = 'Call Sam and book the venue. Sam knows the caterer.';
  const llm = stubLlm(json({ items: [{ type: 'task', title: 'Call Sam and book the venue', text: 'Call Sam and book the venue', when: null }, { type: 'journal', title: 'Sam knows the caterer', text: 'Sam knows the caterer', when: null }] }));
  const { brain } = mkBrain({ llm });
  const items = await brain.split(note);
  assert.deepEqual(items.map((i) => [i.type, i.by]), [['task', 'device'], ['journal', 'device']]);
});

test('a strong unopposed rule cue beats a model that crosses between doing and thinking; task/reminder stays with the model', () => {
  const buy = refineItem({ type: 'idea', title: 'Buy dog food', text: 'buy dog food on the way home', when: null }, NOW, 'device');
  assert.equal(buy.type, 'task');
  assert.equal(buy.confidence, 0.9);
  const renew = refineItem({ type: 'reminder', title: 'Renew car insurance', text: 'renew car insurance next week', when: 'next week' }, NOW, 'device');
  assert.equal(renew.type, 'reminder', 'task versus reminder is left to the question');
  assert.equal(renew.confidence, 0.6);
  assert.ok(renew.due_at, 'a reminder keeps its parsed date');
  const couch = refineItem({ type: 'task', title: 'New couch', text: 'we should buy a new couch', when: null }, NOW, 'device');
  assert.equal(couch.type, 'task', 'a weak rule cue does not override the model');
});

test('a model title that shares no word with its text is replaced by the rule title', () => {
  const item = refineItem({ type: 'journal', title: 'How to stay energized throughout the day', text: 'felt really tired today but the walk helped', when: null }, NOW, 'device');
  assert.match(item.title, /tired/i);
});

test('plan accepts steps written as { action, description } objects and cuts to 8', async () => {
  const llm = stubLlm(json({ steps: Array.from({ length: 10 }, (_, i) => ({ action: `Step ${i + 1}`, description: 'detail' })) }));
  const { brain } = mkBrain({ llm });
  const plan = await brain.plan(stored('t', 'task', 'clean the flat'));
  assert.equal(plan.steps.length, 8);
  assert.equal(plan.steps[0].text, 'Step 1');
});

test('an on-device answer that is not based on the cited thoughts is replaced by the template (the 1.5B model parroted an example)', async () => {
  const llm = stubLlm(json({ answer: 'You said the boiler needs a service before winter. You also noted to ask the landlord about it.' }));
  const { brain } = await withCorpus({ llm });
  const a = await brain.ask('what did I say about the gym?');
  assert.equal(a.by, 'rules');
  assert.match(a.answer, /^I found (one thought|\d+ thoughts) about that\.$/);
  assert.ok(a.sources.length >= 1, 'the sources are still cited');
  const grounded = stubLlm(json({ answer: 'You keep skipping the gym and feel worse, and you had an idea for a gym streak calendar.' }));
  const ok = await withCorpus({ llm: grounded });
  assert.equal((await ok.brain.ask('what did I say about the gym?')).by, 'device');
});
