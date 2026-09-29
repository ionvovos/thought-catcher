import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsApi, DEFAULTS, KEY_ENTRY, PREFIX } from '../src/storage/settings.js';

function fakeStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('defaults, then round trip of settings', () => {
  const s = createSettingsApi(fakeStorage());
  assert.deepEqual(s.getSettings(), DEFAULTS);
  s.setSettings({ 'ai.provider': 'openai', 'ai.model': ' gpt-x ', 'ai.base_url': ' http://localhost:11434/v1 ', 'speech.engine': 'browser', 'review.days': 7 });
  const g = s.getSettings();
  assert.equal(g['ai.provider'], 'openai');
  assert.equal(g['ai.model'], 'gpt-x');
  assert.equal(g['ai.base_url'], 'http://localhost:11434/v1');
  assert.equal(g['speech.engine'], 'browser');
  assert.equal(g['review.days'], 7);
});

test('values are validated: review days clamp, unknown engine and provider fall back, unknown keys ignored', () => {
  const st = fakeStorage();
  const s = createSettingsApi(st);
  s.setSettings({ 'review.days': 99, 'speech.engine': 'telepathy', 'ai.provider': 'bogus', nonsense: 1 });
  const g = s.getSettings();
  assert.equal(g['review.days'], 30);
  assert.equal(g['speech.engine'], 'ask');
  assert.equal(g['ai.provider'], 'none');
  assert.equal('nonsense' in g, false);
  assert.equal([...st.m.keys()].some((k) => k.includes('nonsense')), false);
  s.setSettings({ 'review.days': 0 });
  assert.equal(s.getSettings()['review.days'], 1);
  s.setSettings({ 'ai.base_url': '   ' });
  assert.equal(s.getSettings()['ai.base_url'], null);
});

test('all entries are prefixed thought-catcher.; the key has its own entry and is not in getSettings', () => {
  const st = fakeStorage();
  const s = createSettingsApi(st);
  s.setSettings({ 'review.days': 5 });
  s.setKey('  sk-KEY  ');
  assert.equal(st.m.get(KEY_ENTRY), 'sk-KEY');
  assert.equal(KEY_ENTRY, 'thought-catcher.ai-key');
  assert.ok([...st.m.keys()].every((k) => k.startsWith(PREFIX)));
  assert.equal(s.getKey(), 'sk-KEY');
  assert.equal(s.hasKey(), true);
  assert.equal(JSON.stringify(s.getSettings()).includes('sk-KEY'), false);
});

test('removeKey deletes the entry; empty setKey also removes', () => {
  const st = fakeStorage();
  const s = createSettingsApi(st);
  s.setKey('k');
  s.removeKey();
  assert.equal(st.m.has(KEY_ENTRY), false);
  assert.equal(s.hasKey(), false);
  assert.equal(s.getKey(), null);
  s.setKey('k');
  s.setKey('');
  assert.equal(st.m.has(KEY_ENTRY), false);
});

test('clearAll removes every entry this app wrote, key included', () => {
  const st = fakeStorage();
  const s = createSettingsApi(st);
  s.setSettings({ 'review.days': 5, 'ai.provider': 'anthropic' });
  s.setKey('k');
  st.setItem('other-app.thing', 'keep');
  s.clearAll();
  assert.deepEqual([...st.m.keys()], ['other-app.thing']);
});

test('corrupt stored value falls back to the default', () => {
  const st = fakeStorage();
  st.setItem(`${PREFIX}review.days`, '{oops');
  assert.equal(createSettingsApi(st).getSettings()['review.days'], 3);
});

test('blocked storage: values live in memory for the session and nothing throws', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const s = createSettingsApi(blocked);
  s.setSettings({ 'review.days': 9 });
  s.setKey('k');
  assert.equal(s.getSettings()['review.days'], 9);
  assert.equal(s.getKey(), 'k');
  s.removeKey();
  assert.equal(s.hasKey(), false);
});
