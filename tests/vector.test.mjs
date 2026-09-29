import test from 'node:test';
import assert from 'node:assert/strict';
import { cosine, dot, normalize, topK, fnv1a, embedHash, relatedByWords, topicsFor, topicLabel, jaccard, ASK_MIN, RELATED_MIN, TOPIC_LINK } from '../src/core/vector.js';

const v = (...a) => normalize(Float32Array.from(a));

test('constants are the values tuned against the real model on the fixtures (see the note in vector.js)', () => {
  assert.equal(ASK_MIN, 0.27);
  assert.equal(RELATED_MIN, 0.30);
  assert.equal(TOPIC_LINK, 0.40);
});

test('cosine, dot and normalize', () => {
  assert.ok(Math.abs(cosine(v(1, 0), v(1, 0)) - 1) < 1e-6);
  assert.ok(Math.abs(cosine(v(1, 0), v(0, 1))) < 1e-6);
  assert.ok(Math.abs(cosine([3, 4], [6, 8]) - 1) < 1e-6);
  assert.ok(Math.abs(dot(v(3, 4), v(3, 4)) - 1) < 1e-6);
  assert.equal(cosine([0, 0], [1, 1]), 0);
});

test('topK orders by score, applies the minimum, excludes ids and limits k', () => {
  const rows = [{ id: 'a', vec: v(1, 0) }, { id: 'b', vec: v(1, 1) }, { id: 'c', vec: v(0, 1) }, { id: 'd', vec: v(1, 0.2) }];
  assert.deepEqual(topK(v(1, 0), rows, 3).map((r) => r.id), ['a', 'd', 'b']);
  assert.deepEqual(topK(v(1, 0), rows, 3, { min: 0.9 }).map((r) => r.id), ['a', 'd']);
  assert.deepEqual(topK(v(1, 0), rows, 2, { exclude: ['a'] }).map((r) => r.id), ['d', 'b']);
});

test('fnv1a is stable and changes with the text', () => {
  assert.equal(fnv1a('a'), 'e40c292c');
  assert.notEqual(embedHash({ title: 'x', text: 'y' }), embedHash({ title: 'x', text: 'z' }));
});

test('no-embeddings related: shared tags and words, never the thought itself', () => {
  const t = (id, title, tags) => ({ id, title, text: title, tags });
  const all = [t('1', 'gym streak calendar', ['gym']), t('2', 'go back to the gym', ['gym']), t('3', 'paint the hallway', ['paint'])];
  const rel = relatedByWords(all[0], all, 3);
  assert.deepEqual(rel.map((r) => r.id), ['2']);
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
});

test('topics: vectors link at TOPIC_LINK and keep clusters of 3+; label = most common tag, else word', () => {
  const ideas = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, tags: id < 'd' ? ['gym'] : [], title: `${id} thing`, text: `${id} thing` }));
  const vecs = new Map([['a', v(1, 0, 0)], ['b', v(1, 0.1, 0)], ['c', v(0.9, 0.1, 0)], ['d', v(0, 1, 0)], ['e', v(0, 0, 1)]]);
  const topics = topicsFor(ideas, vecs);
  assert.equal(topics.length, 1);
  assert.deepEqual(topics[0].ids.sort(), ['a', 'b', 'c']);
  assert.equal(topics[0].label, 'gym');
  assert.equal(topicLabel([{ tags: [], title: 'harbour walk', text: 'harbour walk' }, { tags: [], title: 'harbour trip', text: 'harbour trip' }]), 'harbour');
});

test('topics without vectors use shared tags (3 or more ideas)', () => {
  const idea = (id, tags) => ({ id, tags, title: id, text: id });
  const topics = topicsFor([idea('1', ['app']), idea('2', ['app']), idea('3', ['app']), idea('4', ['x']), idea('5', ['y'])], null);
  assert.deepEqual(topics, [{ label: 'app', ids: ['1', '2', '3'] }]);
});
