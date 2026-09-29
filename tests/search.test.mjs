import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchThoughts } from '../src/core/search.js';

const T = [
  { id: '1', title: 'Buy milk', text: 'buy milk tomorrow', tags: ['milk', 'shop'] },
  { id: '2', title: 'App idea', text: 'Share lists with friends', tags: ['app'] },
  { id: '3', title: 'Walk', text: 'Long walk by the river', tags: [] },
];
const ids = (q) => searchThoughts(T, q).map((t) => t.id);

test('matches title, text and tags, case-insensitive', () => {
  assert.deepEqual(ids('MILK'), ['1']);
  assert.deepEqual(ids('friends'), ['2']);
  assert.deepEqual(ids('river'), ['3']);
  assert.deepEqual(ids('shop'), ['1']);
  assert.deepEqual(ids('App'), ['2']);
});

test('all words must match; no match returns an empty list; empty query returns everything', () => {
  assert.deepEqual(ids('share friends'), ['2']);
  assert.deepEqual(ids('share river'), []);
  assert.deepEqual(ids('zzz'), []);
  assert.deepEqual(ids('   '), ['1', '2', '3']);
  assert.deepEqual(ids(undefined), ['1', '2', '3']);
});

test('does not mutate or reorder the input', () => {
  const copy = JSON.stringify(T);
  searchThoughts(T, 'a');
  assert.equal(JSON.stringify(T), copy);
});
