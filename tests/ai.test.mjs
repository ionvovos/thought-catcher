import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProvider, extractJson, validateSortResult, validateClarifyResult, validateExpansion,
  configFromSettings, isAiConfigured, describeAiError, AiError, formatLocalIso, ANTHROPIC_DEFAULT_MODEL,
} from '../src/core/ai/adapter.js';

const NOW = new Date(2026, 8, 29, 10, 30, 0);
const SORT_JSON = { type: 'task', alt_type: 'reminder', confidence: 0.8, title: 'Buy milk', tags: ['Milk', 'shop'], due_at: null };

function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
}
function recorder(handler) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return handler(calls.length); };
  return { fetch, calls };
}
const anthropicOk = (obj) => reply(200, { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] });
const openaiOk = (obj) => reply(200, { choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }] });
const mk = (config, fetch, key = 'sk-test-KEY') => createProvider(config, { fetch, now: () => NOW, getKey: () => key });

test('extractJson: plain, fenced, wrapped in prose, braces inside strings', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! {"a":"x } y","b":{"c":2}} hope that helps'), { a: 'x } y', b: { c: 2 } });
});

test('extractJson: rejects empty, no object, cut off, invalid', () => {
  for (const bad of ['', 'no json here', '{"a":', '{a:1}', undefined]) {
    assert.throws(() => extractJson(bad), (e) => e instanceof AiError && e.kind === 'malformed');
  }
});

test('validateSortResult coerces safe things and rejects unsafe ones', () => {
  const ok = validateSortResult({ ...SORT_JSON, title: `  ${'x'.repeat(80)} `, tags: ['A', 'a', 'b', 'c', 'd', 'e', 'f'], confidence: 7, due_at: '2026-09-30T18:00:00+03:00' });
  assert.equal(ok.title.length, 60);
  assert.deepEqual(ok.tags, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(ok.confidence, 1);
  assert.equal(ok.due_at, '2026-09-30T15:00:00.000Z');
  assert.equal(validateSortResult({ ...SORT_JSON, alt_type: 'task' }).alt_type, null);
  assert.equal(validateSortResult({ ...SORT_JSON, alt_type: 'bogus' }).alt_type, null);
  assert.equal(validateSortResult({ ...SORT_JSON, confidence: '0.5' }).confidence, 0.5);
  for (const patch of [{ type: 'note' }, { type: undefined }, { title: '  ' }, { title: undefined }, { confidence: 'high' }, { due_at: 'soon' }, { tags: 'a,b' }]) {
    assert.throws(() => validateSortResult({ ...SORT_JSON, ...patch }), (e) => e.kind === 'malformed', JSON.stringify(patch));
  }
  assert.throws(() => validateSortResult(null), (e) => e.kind === 'malformed');
});

test('validateClarifyResult and validateExpansion', () => {
  assert.deepEqual(validateClarifyResult({ type: 'reminder', title: 'Call mum', tags: [], due_at: null }), { type: 'reminder', title: 'Call mum', tags: [], due_at: null });
  assert.throws(() => validateClarifyResult({ type: 'x', title: 'a' }), (e) => e.kind === 'malformed');
  const exp = validateExpansion({ next_steps: ['a', 'b', 'c', 'd', 'e', 'f'], questions: ['q'], outline: ['1', '2', '3', '4', '5', '6', '7', '8'] });
  assert.equal(exp.next_steps.length, 5);
  assert.equal(exp.outline.length, 7);
  for (const bad of [{ next_steps: [], questions: ['q'], outline: ['o'] }, { next_steps: ['a'], questions: ['q'] }, { next_steps: ['a'], questions: [' '], outline: ['o'] }]) {
    assert.throws(() => validateExpansion(bad), (e) => e.kind === 'malformed');
  }
});

test('anthropic sort: URL, headers, body shape, validated result', async () => {
  const { fetch, calls } = recorder(() => anthropicOk(SORT_JSON));
  const p = mk({ provider: 'anthropic' }, fetch);
  const res = await p.sort('buy milk');
  assert.equal(res.type, 'task');
  assert.deepEqual(res.tags, ['milk', 'shop']);
  const c = calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers['x-api-key'], 'sk-test-KEY');
  assert.equal(c.init.headers['anthropic-version'], '2023-06-01');
  assert.equal(c.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(c.init.headers['content-type'], 'application/json');
  assert.equal(c.body.model, ANTHROPIC_DEFAULT_MODEL);
  assert.equal(typeof c.body.max_tokens, 'number');
  assert.match(c.body.system, /one JSON object only, no prose/);
  assert.ok(c.body.system.includes(formatLocalIso(NOW)));
  assert.deepEqual(c.body.messages, [{ role: 'user', content: 'Note: buy milk' }]);
  assert.equal(p.model, ANTHROPIC_DEFAULT_MODEL);
});

test('openai sort: URL, auth header, body shape, no response_format', async () => {
  const { fetch, calls } = recorder(() => openaiOk(`Here you go:\n\`\`\`json\n${JSON.stringify(SORT_JSON)}\n\`\`\``));
  const p = mk({ provider: 'openai', model: 'gpt-x', baseUrl: 'https://example.test/v1/' }, fetch);
  const res = await p.sort('buy milk');
  assert.equal(res.title, 'Buy milk');
  const c = calls[0];
  assert.equal(c.url, 'https://example.test/v1/chat/completions');
  assert.equal(c.init.headers.authorization, 'Bearer sk-test-KEY');
  assert.equal(c.body.model, 'gpt-x');
  assert.equal(c.body.temperature, 0);
  assert.equal(c.body.messages[0].role, 'system');
  assert.equal(c.body.messages[1].role, 'user');
  assert.equal('response_format' in c.body, false);
});

test('openai: no key is fine for a local URL and sends no authorization header', async () => {
  const { fetch, calls } = recorder(() => openaiOk(SORT_JSON));
  const p = mk({ provider: 'openai', model: 'llama3', baseUrl: 'http://localhost:11434/v1' }, fetch, null);
  await p.sort('x');
  assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal('authorization' in calls[0].init.headers, false);
});

test('anthropic without a key does not call the network', async () => {
  const { fetch, calls } = recorder(() => anthropicOk(SORT_JSON));
  await assert.rejects(mk({ provider: 'anthropic' }, fetch, null).sort('x'), (e) => e.kind === 'auth');
  assert.equal(calls.length, 0);
});

test('malformed replies throw AiError malformed', async () => {
  for (const handler of [() => anthropicOk('I cannot do that.'), () => anthropicOk({ type: 'idea' }), () => reply(200, 'not json'), () => reply(200, { content: [] })]) {
    const { fetch } = recorder(handler);
    await assert.rejects(mk({ provider: 'anthropic' }, fetch).sort('x'), (e) => e instanceof AiError && e.kind === 'malformed');
  }
});

test('401 and 403 are auth with only "Key rejected."; 429 is rate; 500 is provider with its message', async () => {
  const cases = [[401, 'auth'], [403, 'auth'], [429, 'rate'], [500, 'provider']];
  for (const [status, kind] of cases) {
    const { fetch } = recorder(() => reply(status, { error: { message: `boom ${status}` } }));
    // an auth error never carries the provider's text (some providers repeat part of the key); the others keep it
    await assert.rejects(mk({ provider: 'anthropic' }, fetch).sort('x'), (e) => e.kind === kind && e.status === status
      && (kind === 'auth' ? e.message === 'Key rejected.' : e.message.includes(`boom ${status}`)));
  }
  assert.equal(describeAiError(new AiError('auth', 'x')), 'Key rejected.');
  assert.equal(describeAiError(new AiError('provider', 'model not found')), 'model not found');
  assert.match(describeAiError(new Error('x')), /went wrong/);
});

test('network failure is kind network', async () => {
  const fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(mk({ provider: 'anthropic' }, fetch).sort('x'), (e) => e.kind === 'network');
});

test('timeout: a fetch that never answers is aborted and reported as timeout', async () => {
  // Uses the exported timeout helper through the provider with a tiny limit by way of test()'s path.
  const { postJson } = await import('../src/core/ai/http.js');
  let aborted = false;
  const fetch = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
  });
  await assert.rejects(postJson(fetch, 'https://x.test', { headers: {}, body: {}, timeoutMs: 20 }), (e) => e.kind === 'timeout');
  assert.equal(aborted, true);
  // A fetch that ignores the abort signal still times out.
  const stubborn = () => new Promise(() => {});
  await assert.rejects(postJson(stubborn, 'https://x.test', { headers: {}, body: {}, timeoutMs: 20 }), (e) => e.kind === 'timeout');
});

test('clarify and expand go through the same validation', async () => {
  const { fetch, calls } = recorder((n) => (n === 1
    ? anthropicOk({ type: 'reminder', title: 'Call mum', tags: ['mum'], due_at: '2026-09-29T18:00:00+03:00' })
    : anthropicOk({ next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'] })));
  const p = mk({ provider: 'anthropic' }, fetch);
  const thought = { text: 'call mum', type: 'task', title: 'Call mum' };
  const patch = await p.clarify({ thought, ambiguity: { case: 1, question: 'Task to do, or a reminder at a specific time?' }, answer: 'at 6pm' });
  assert.equal(patch.type, 'reminder');
  assert.equal(patch.due_at, '2026-09-29T15:00:00.000Z');
  assert.match(calls[0].body.messages[0].content, /Answer: at 6pm/);
  const exp = await p.expand({ text: 'app idea', title: 'App idea', type: 'idea' });
  assert.equal(exp.next_steps.length, 3);
  assert.match(calls[1].body.messages[0].content, /Idea: app idea/);
});

test('test(): one minimal request, ok true; provider error text surfaces', async () => {
  const { fetch, calls } = recorder(() => anthropicOk('ok'));
  assert.deepEqual(await mk({ provider: 'anthropic' }, fetch).test(), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.max_tokens, 8);
  const bad = recorder(() => reply(404, { error: { message: 'model: nope not found' } }));
  await assert.rejects(mk({ provider: 'anthropic' }, bad.fetch).test(), (e) => e.message.includes('nope not found'));
});

test('the key never appears in a prompt body', async () => {
  const { fetch, calls } = recorder(() => anthropicOk(SORT_JSON));
  await mk({ provider: 'anthropic' }, fetch).sort('buy milk');
  assert.equal(JSON.stringify(calls[0].body).includes('sk-test-KEY'), false);
});

test('configFromSettings and isAiConfigured', () => {
  const base = { 'ai.provider': 'none', 'ai.model': '', 'ai.base_url': null };
  assert.equal(isAiConfigured(base, 'k'), false);
  assert.equal(isAiConfigured({ ...base, 'ai.provider': 'anthropic' }, null), false);
  assert.equal(configFromSettings({ ...base, 'ai.provider': 'anthropic' }, 'k').model, ANTHROPIC_DEFAULT_MODEL);
  assert.equal(isAiConfigured({ ...base, 'ai.provider': 'openai' }, 'k'), false, 'needs a model');
  assert.equal(isAiConfigured({ ...base, 'ai.provider': 'openai', 'ai.model': 'm' }, null), false, 'default OpenAI URL needs a key');
  assert.equal(isAiConfigured({ ...base, 'ai.provider': 'openai', 'ai.model': 'm', 'ai.base_url': 'http://localhost:11434/v1' }, null), true);
  assert.equal(isAiConfigured({ ...base, 'ai.provider': 'openai', 'ai.model': 'm', 'ai.base_url': 'https://api.x.test/v1' }, 'k'), true);
});

// ---- v2 calls (architecture 2.2): split, classify, plan, answer, question wording ----
const SPLIT_JSON = { reply: 'Filed two things for you.', items: [{ type: 'task', title: 'Buy milk', text: 'buy milk', when: null }, { type: 'reminder', title: 'Call mum', text: 'remind me at 6pm to call mum', when: '6pm' }] };

test('v2 calls on both providers: validated, with the note in the prompt and the key never in the body', async () => {
  for (const [config, ok] of [[{ provider: 'anthropic' }, anthropicOk], [{ provider: 'openai', model: 'gpt-x', baseUrl: 'https://api.openai.com/v1' }, openaiOk]]) {
    const { fetch, calls } = recorder((n) => ok([SPLIT_JSON, { type: 'idea', title: 'Gym app', when: null }, { steps: ['a', 'b', 'c'] }, { answer: 'You said to buy milk.' }, { question: 'Task, or a reminder at a set time?' }][n - 1]));
    const p = mk(config, fetch);
    const items = await p.split('buy milk and remind me at 6pm to call mum');
    assert.deepEqual(items.map((i) => i.type), ['task', 'reminder']);
    assert.equal(items.reply, 'Filed two things for you.');
    assert.equal(items[1].when, '6pm');
    assert.deepEqual(await p.classify('gym app idea'), { type: 'idea', title: 'Gym app', when: null });
    assert.deepEqual((await p.plan({ text: 'pay bill', title: 'Pay bill' })).steps.map((s) => s.done), [false, false, false]);
    assert.equal(await p.answer('what about milk?', [{ title: 'Buy milk', text: 'buy milk' }]), 'You said to buy milk.');
    assert.equal(await p.word('Task or reminder?', 'call mum'), 'Task, or a reminder at a set time?');
    assert.equal(calls.length, 5);
    assert.match(JSON.stringify(calls[0].body), /buy milk and remind me at 6pm/);
    assert.match(JSON.stringify(calls[0].body), /top-level field \\"reply\\"/, 'the split prompt asks a key provider for the confirmation wording');
    assert.match(JSON.stringify(calls[3].body), /Question: what about milk\?/);
    assert.equal(JSON.stringify(calls.map((c) => c.body)).includes('sk-test-KEY'), false);
  }
});

test('v2 calls: malformed replies throw AiError malformed and nothing is returned', async () => {
  const bad = [{ items: [] }, { items: [{ type: 'note', title: 't', text: 'x' }] }, { nothing: 1 }];
  for (const body of bad) {
    const { fetch } = recorder(() => anthropicOk(body));
    await assert.rejects(mk({ provider: 'anthropic' }, fetch).split('x'), (e) => e.kind === 'malformed');
  }
  const p = mk({ provider: 'anthropic' }, recorder(() => anthropicOk({ steps: ['only one'] })).fetch);
  await assert.rejects(p.plan({ text: 'x', title: 'x' }), (e) => e.kind === 'malformed');
  const q = mk({ provider: 'anthropic' }, recorder(() => anthropicOk({ question: 'not a question' })).fetch);
  await assert.rejects(q.word('a?', 'b'), (e) => e.kind === 'malformed');
  const long = mk({ provider: 'anthropic' }, recorder(() => anthropicOk({ answer: 'w '.repeat(60) })).fetch);
  assert.ok((await long.answer('q', [{ title: 't', text: 't' }])).split(' ').length <= 40);
});
