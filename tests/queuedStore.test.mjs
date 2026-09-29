import test from 'node:test';
import assert from 'node:assert/strict';
import { queueUntilReady, MIGRATING } from '../src/storage/queued.js';
import { createMemoryStore } from '../src/storage/memory.js';

const th = (id) => ({ id, text: `t ${id}` });

test('G27: writes and reads made while the store is still opening wait for it and then succeed', async () => {
  let open;
  const store = queueUntilReady(new Promise((r) => { open = r; }));
  assert.deepEqual(store.migration, MIGRATING);
  const writes = [store.put(th('a')), store.putMany([th('b'), th('c')])];
  const read = store.getAll();
  let settled = false;
  read.then(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(settled, false, 'nothing runs before the store is open');
  const real = createMemoryStore({ migration: { state: 'migrated', count: 5, quarantined: 1 } });
  open(real);
  await Promise.all(writes);
  assert.deepEqual((await read).map((t) => t.id).sort(), ['a', 'b', 'c']);
  assert.deepEqual((await store.getAll()).map((t) => t.id).sort(), ['a', 'b', 'c']);
  assert.equal(store.migration.state, 'migrated');
  assert.equal(store.migration.count, 5);
});

test('onChange listeners added early are attached when the store opens, and can be removed', async () => {
  let open;
  const store = queueUntilReady(new Promise((r) => { open = r; }));
  const seen = [];
  const off = store.onChange((e) => seen.push(e.kind));
  const removed = store.onChange(() => seen.push('removed'));
  removed();
  open(createMemoryStore());
  await store.ready;
  await store.put(th('a'));
  assert.deepEqual(seen, ['put']);
  off();
  await store.put(th('b'));
  assert.deepEqual(seen, ['put']);
});

test('a store that cannot open rejects every waiting call and `ready`, without an unhandled rejection', async () => {
  const store = queueUntilReady(Promise.reject(new Error('Storage is not available in this browser mode.')));
  await assert.rejects(store.put(th('a')), /not available/);
  await assert.rejects(store.ready, /not available/);
  assert.equal(store.migration.state, 'migrating');
});
