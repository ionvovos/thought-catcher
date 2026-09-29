import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/memory.js';

const th = (id, extra = {}) => ({ id, text: `t ${id}`, tags: ['a'], ...extra });

test('put/get round trip, copies are isolated', async () => {
  const s = createMemoryStore();
  await s.put(th('1'));
  const got = await s.get('1');
  assert.deepEqual(got, th('1'));
  got.tags.push('mutated');
  assert.deepEqual((await s.get('1')).tags, ['a']);
});

test('putMany, replace, delete, missing id', async () => {
  const s = createMemoryStore();
  await s.putMany([th('1'), th('2'), th('3')]);
  assert.equal((await s.getAll()).length, 3);
  await s.put(th('1', { text: 'new' }));
  assert.equal((await s.get('1')).text, 'new');
  assert.equal((await s.getAll()).length, 3);
  await s.delete('2');
  assert.equal(await s.get('2'), undefined);
  assert.equal(await s.get('nope'), undefined);
});

test('clear empties thoughts and keeps settings', async () => {
  const s = createMemoryStore();
  await s.put(th('1'));
  await s.setSetting('review.days', 5);
  await s.clear();
  assert.deepEqual(await s.getAll(), []);
  assert.equal(await s.getSetting('review.days', 3), 5);
});

test('settings fallback and falsy values', async () => {
  const s = createMemoryStore();
  assert.equal(await s.getSetting('x', 7), 7);
  await s.setSetting('x', false);
  assert.equal(await s.getSetting('x', 7), false);
});

test('put without id rejects', async () => {
  const s = createMemoryStore();
  await assert.rejects(() => s.put({}), TypeError);
});
