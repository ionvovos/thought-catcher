// G1 (V2): a saved key is bound to the provider and host it was entered for and is never sent anywhere else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsApi, BINDING_ENTRY, KEY_ENTRY } from '../src/storage/settings.js';
import { keyBinding, resolveProvider } from '../src/core/ai/adapter.js';

const OLD_KEY = 'sk-ant-OLD-KEY-DO-NOT-LEAK';
const NEW_KEY = 'sk-new-typed-key';
const NOW = new Date(2026, 8, 29, 10, 0, 0);

const memoryStorage = () => {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

const ANTHROPIC = { 'ai.provider': 'anthropic', 'ai.model': '', 'ai.base_url': null };
const TARGETS = {
  'openai, no base URL (api.openai.com)': { 'ai.provider': 'openai', 'ai.model': 'gpt-x', 'ai.base_url': null },
  'openai, http://localhost:11434/v1': { 'ai.provider': 'openai', 'ai.model': 'llama3', 'ai.base_url': 'http://localhost:11434/v1' },
  'openai, https://openrouter.ai/api/v1': { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.base_url': 'https://openrouter.ai/api/v1' },
};

// A fetch that records every request and answers with a valid sort reply.
const recorder = () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ type: 'idea', alt_type: null, confidence: 0.9, title: 't', tags: [], due_at: null }) } }],
      content: [{ type: 'text', text: JSON.stringify({ type: 'idea', alt_type: null, confidence: 0.9, title: 't', tags: [], due_at: null }) }],
    }), { status: 200 });
  };
  return { calls, fetch };
};
const carriesKey = (calls, key) => calls.some((c) => JSON.stringify(c).includes(key));

const withAnthropicKey = () => {
  const api = createSettingsApi(memoryStorage());
  api.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  return api;
};

test('keyBinding names provider and host, using the default host when the base URL is empty', () => {
  assert.deepEqual(keyBinding(ANTHROPIC), { provider: 'anthropic', host: 'api.anthropic.com' });
  assert.deepEqual(keyBinding(TARGETS['openai, no base URL (api.openai.com)']), { provider: 'openai', host: 'api.openai.com' });
  assert.deepEqual(keyBinding(TARGETS['openai, http://localhost:11434/v1']), { provider: 'openai', host: 'localhost:11434' });
  assert.equal(keyBinding({ 'ai.provider': 'none' }), null);
});

test('positive control: the key goes to the provider and host it was saved for', async () => {
  const api = withAnthropicKey();
  const { calls, fetch } = recorder();
  await resolveProvider(ANTHROPIC, api, { fetch, now: () => NOW }).sort('buy milk');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].headers['x-api-key'], OLD_KEY);
});

for (const [name, settings] of Object.entries(TARGETS)) {
  test(`AI-call and Test paths: an Anthropic key is never sent after switching to ${name}`, async () => {
    const api = withAnthropicKey();
    const { calls, fetch } = recorder();
    const provider = resolveProvider(settings, api, { fetch, now: () => NOW }); // the path aiFlow and Test connection use
    if (provider) {
      await provider.sort('buy milk'); // a local address needs no key, so it may run: without the old key
      await provider.test();
    }
    assert.equal(carriesKey(calls, OLD_KEY), false, `${name}: old key leaked`);
    if (name.includes('api.openai.com') || name.includes('openrouter')) assert.equal(provider, null, 'no key for this host: no request at all');
    assert.equal(calls.every((c) => !c.headers.authorization), true);
  });

  test(`Save path: switching to ${name} removes the old key and asks for a new one`, () => {
    const st = memoryStorage();
    const api = createSettingsApi(st);
    api.setKey(OLD_KEY, keyBinding(ANTHROPIC));
    assert.equal(api.reconcileKey(keyBinding(settings)), 'removed');
    assert.equal(api.getKey(), null);
    assert.equal(st.m.has(KEY_ENTRY), false);
    assert.equal(st.m.has(BINDING_ENTRY), false);
  });

  test(`a key typed for ${name} is sent only there`, async () => {
    const api = withAnthropicKey();
    const { calls, fetch } = recorder();
    const provider = resolveProvider(settings, api, { fetch, now: () => NOW, typedKey: NEW_KEY }); // Test connection before saving
    await provider.test();
    assert.equal(carriesKey(calls, OLD_KEY), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers.authorization, `Bearer ${NEW_KEY}`);
    assert.ok(calls[0].url.startsWith(settings['ai.base_url'] || 'https://api.openai.com/v1'));
  });
}

test('saving with the same provider and host keeps the key; a different host on the same provider does not', () => {
  const api = createSettingsApi(memoryStorage());
  const a = { 'ai.provider': 'openai', 'ai.model': 'm', 'ai.base_url': 'https://api.openai.com/v1' };
  api.setKey(NEW_KEY, keyBinding(a));
  assert.equal(api.reconcileKey(keyBinding({ ...a, 'ai.base_url': 'https://api.openai.com/v2' })), 'kept'); // same host
  assert.equal(api.reconcileKey(keyBinding({ ...a, 'ai.base_url': 'https://example.com/v1' })), 'removed');
  assert.equal(api.getKey(), null);
});

test('a key with no binding is never handed out; removing the key removes the binding; delete-all clears both', () => {
  const st = memoryStorage();
  const api = createSettingsApi(st);
  api.setKey(OLD_KEY); // unbound
  assert.equal(api.getKeyFor(keyBinding(ANTHROPIC)), null);
  api.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  assert.equal(api.getKeyFor(keyBinding(ANTHROPIC)), OLD_KEY);
  api.removeKey();
  assert.equal(st.m.has(BINDING_ENTRY), false);
  api.setKey(OLD_KEY, keyBinding(ANTHROPIC));
  api.clearAll();
  assert.equal(st.m.has(KEY_ENTRY) || st.m.has(BINDING_ENTRY), false);
});

test('the binding is not part of settings or exports', () => {
  const api = withAnthropicKey();
  assert.equal(JSON.stringify(api.getSettings()).includes('binding'), false);
  assert.equal(JSON.stringify(api.getSettings()).includes(OLD_KEY), false);
});
