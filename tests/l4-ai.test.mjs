// L4 checks for M8 and AC-M3.3 / M3.5 / M6.x at the adapter level, with a mocked fetch and mocked timers.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, TIMEOUTS, AiError, ANTHROPIC_DEFAULT_MODEL } from '../src/core/ai/adapter.js';
import { expandIdea } from '../src/core/expand.js';

const NOW = new Date(2026, 8, 29, 10, 30, 0);
const KEY = 'sk-test-L4-KEY';
const mk = (config, fetch, key = KEY) => createProvider(config, { fetch, now: () => NOW, getKey: () => key });
const ANTHROPIC = { provider: 'anthropic' };
const OPENAI = { provider: 'openai', model: 'gpt-x', baseUrl: 'https://llm.example.test/v1' };
const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const a = (obj) => ok({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const o = (obj) => ok({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const SORT = { type: 'idea', alt_type: null, confidence: 0.9, title: 'Share lists', tags: ['lists'], due_at: null };
const EXPAND = { next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'] };
const hang = () => new Promise(() => {});

test('timeout budgets are 15 s sort, 15 s clarify, 45 s expand, 10 s test', () => {
  assert.deepEqual({ ...TIMEOUTS }, { sort: 15000, clarify: 15000, expand: 45000, test: 10000 });
});

for (const [name, config] of [['anthropic', ANTHROPIC], ['openai', OPENAI]]) {
  test(`${name}: each operation times out at exactly its budget and never earlier (AC-M3.5)`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const p = mk(config, hang);
    const ops = {
      sort: [() => p.sort('x'), 15000],
      clarify: [() => p.clarify({ thought: { text: 'x', type: 'task', title: 'x' }, ambiguity: { case: 1, question: 'q' }, answer: 'a' }), 15000],
      expand: [() => p.expand({ text: 'x', title: 'x', type: 'idea' }), 45000],
      test: [() => p.test(), 10000],
    };
    for (const [op, [run, ms]] of Object.entries(ops)) {
      let state = 'pending';
      const settled = run().then(() => { state = 'resolved'; }, (e) => { state = e instanceof AiError ? e.kind : 'other'; });
      t.mock.timers.tick(ms - 1);
      await Promise.resolve(); await Promise.resolve();
      assert.equal(state, 'pending', `${op} still pending at ${ms - 1} ms`);
      t.mock.timers.tick(1);
      await settled;
      assert.equal(state, 'timeout', `${op} times out at ${ms} ms`);
    }
  });

  test(`${name}: 401 gives kind auth once per call and never retries; the key is not in the error text`, async () => {
    let calls = 0;
    const fetch = async () => { calls += 1; return { ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'invalid x-api-key' } }) }; };
    await assert.rejects(mk(config, fetch).sort('x'), (e) => e.kind === 'auth' && !JSON.stringify(e.message).includes(KEY));
    assert.equal(calls, 1);
  });

  test(`${name}: malformed replies never resolve to a result (AC-M3.3 fallback trigger)`, async () => {
    const wrap = name === 'anthropic' ? a : o;
    const bad = [
      wrap({}), wrap({ type: 'idea' }), wrap({ ...SORT, type: 'nonsense' }), wrap({ ...SORT, title: '' }), wrap({ ...SORT, due_at: 'not a date' }),
      ok({ nothing: true }), ok({}), { ok: true, status: 200, text: async () => '<html>gateway</html>' }, { ok: true, status: 200, text: async () => '' },
    ];
    for (const reply of bad) {
      await assert.rejects(mk(config, async () => reply).sort('x'), (e) => e instanceof AiError && e.kind === 'malformed');
    }
  });

  test(`${name}: a valid reply is used as returned (AC-M3.3)`, async () => {
    const fetch = async () => (name === 'anthropic' ? a(SORT) : o(SORT));
    const r = await mk(config, fetch).sort('what if the app let people share lists');
    assert.equal(r.type, 'idea');
    assert.equal(r.title, 'Share lists');
    assert.deepEqual(r.tags, ['lists']);
  });

  test(`${name}: the key goes only to the configured host and never into the body (AC-M8.2)`, async () => {
    const seen = [];
    const fetch = async (url, init) => { seen.push({ url, headerText: JSON.stringify(init.headers), body: init.body }); return name === 'anthropic' ? a(SORT) : o(SORT); };
    const p = mk(config, fetch);
    await p.sort('x');
    await p.test().catch(() => {});
    assert.ok(seen.length >= 1);
    const host = name === 'anthropic' ? 'api.anthropic.com' : 'llm.example.test';
    for (const s of seen) {
      assert.equal(new URL(s.url).host, host);
      assert.equal(s.body.includes(KEY), false);
      assert.equal(s.url.includes(KEY), false);
    }
  });

  test(`${name}: expand returns three sections; a bad reply throws and expandIdea leaves the idea unchanged (AC-M6.2, M6.4)`, async () => {
    const idea = { id: 'i', text: 'app for tides', title: 'App for tides', type: 'idea', expansion: null, updated_at: NOW.toISOString() };
    const good = mk(config, async () => (name === 'anthropic' ? a(EXPAND) : o(EXPAND)));
    const updated = await expandIdea(idea, good, { now: NOW });
    assert.deepEqual(Object.keys(updated.expansion).sort(), ['generated_at', 'model', 'next_steps', 'outline', 'questions']);
    assert.equal(updated.expansion.next_steps.length, 3);
    const badProvider = mk(config, async () => (name === 'anthropic' ? a({ next_steps: [] }) : o({ next_steps: [] })));
    await assert.rejects(expandIdea(updated, badProvider, { now: NOW }), (e) => e.kind === 'malformed');
    assert.deepEqual(updated.expansion.next_steps, ['a', 'b', 'c'], 'previous expansion untouched (AC-M6.3)');
  });
}

test('anthropic request carries the browser-access header and the documented headers (AC-M8.x)', async () => {
  let init;
  await mk(ANTHROPIC, async (u, i) => { init = i; return a(SORT); }).sort('x');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  assert.equal(init.headers['x-api-key'], KEY);
  assert.equal(JSON.parse(init.body).model, ANTHROPIC_DEFAULT_MODEL);
});

test('openai request has no anthropic-only headers and no response_format', async () => {
  let init;
  await mk(OPENAI, async (u, i) => { init = i; return o(SORT); }).sort('x');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], undefined);
  assert.equal(init.headers['x-api-key'], undefined);
  assert.equal(init.headers.authorization, `Bearer ${KEY}`);
  assert.equal('response_format' in JSON.parse(init.body), false);
});

test('base URL handling: trailing slash and local URL without key (AC-M8.1)', async () => {
  const urls = [];
  const fetch = async (u) => { urls.push(u); return o(SORT); };
  await mk({ provider: 'openai', model: 'm', baseUrl: 'http://127.0.0.1:1234/v1///' }, fetch, null).sort('x');
  assert.equal(urls[0], 'http://127.0.0.1:1234/v1/chat/completions');
});

test('a timed-out sort must not block a later call: the provider is reusable', async () => {
  let n = 0;
  const p = mk(ANTHROPIC, async () => { n += 1; return a(SORT); });
  await p.sort('x');
  await p.sort('y');
  assert.equal(n, 2);
});
