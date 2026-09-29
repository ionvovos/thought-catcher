import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, makeTitle, normalizeTags, newThought, validateThought } from '../src/core/model.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0);
const sortResult = { type: 'task', title: 'Buy milk', tags: ['milk'], confidence: 0.67, alt_type: 'reminder', due_at: null };

test('TYPES', () => {
  assert.deepEqual([...TYPES], ['idea', 'task', 'journal', 'reminder']);
});

test('makeTitle examples', () => {
  assert.equal(makeTitle('remind me to call mum at 6pm'), 'Call mum at 6pm');
  assert.equal(makeTitle('I think the garden needs work. More later'), 'The garden needs work');
  assert.equal(makeTitle('so what if we moved'), 'What if we moved');
  assert.equal(makeTitle('So.'), 'So');
});

test('makeTitle does not split on 10.30 or 6:30', () => {
  assert.equal(makeTitle('meet at 10.30 sharp'), 'Meet at 10.30 sharp');
});

test('makeTitle cuts long text at a word boundary, hard-cuts a long word', () => {
  const long = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau';
  const t = makeTitle(long);
  assert.ok(t.length <= 60);
  assert.ok(long.toLowerCase().startsWith(t.toLowerCase()));
  assert.ok(long.slice(t.length).startsWith(' '));
  assert.equal(makeTitle('x'.repeat(80)).length, 60);
});

test('normalizeTags', () => {
  assert.deepEqual(normalizeTags([' Milk ', 'milk', 'HOME', '', 'a', 'b', 'c', 'd']), ['milk', 'home', 'a', 'b', 'c']);
  assert.deepEqual(normalizeTags(null), []);
});

test('newThought shape', () => {
  const t = newThought({ text: '  buy milk  ', sortResult, now: NOW });
  assert.deepEqual(Object.keys(t).sort(), [
    'best_guess', 'clarify', 'created_at', 'done', 'done_at', 'due_at', 'expansion', 'id', 'origin', 'plan', 'review',
    'sort', 'source', 'tags', 'text', 'title', 'type', 'updated_at', 'v',
  ]);
  assert.equal(t.v, 2);
  assert.equal(t.origin, null);
  assert.equal(t.plan, null);
  assert.equal(t.best_guess, false);
  assert.match(t.id, /^[0-9a-f]{8}-[0-9a-f]{4}-/);
  assert.equal(t.text, 'buy milk');
  assert.equal(t.created_at, NOW.toISOString());
  assert.equal(t.updated_at, NOW.toISOString());
  assert.equal(t.sort.by, 'rules');
  assert.equal(t.sort.model, null);
  assert.equal(t.clarify.state, 'none');
  assert.deepEqual(validateThought(t), { ok: true, errors: [] });
  assert.throws(() => newThought({ text: '   ', sortResult, now: NOW }), TypeError);
  assert.throws(() => newThought({ text: 'x', sortResult, now: 'nope' }), TypeError);
});

test('validateThought rejects bad records', () => {
  const good = newThought({ text: 'buy milk', sortResult, now: NOW });
  const bad = (patch) => validateThought({ ...good, ...patch });
  for (const [name, r] of Object.entries({
    type: bad({ type: 'note' }),
    longTitle: bad({ title: 'x'.repeat(61) }),
    emptyTitle: bad({ title: '' }),
    sixTags: bad({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    upperTag: bad({ tags: ['Milk'] }),
    date: bad({ created_at: 'not a date' }),
    noId: bad({ id: undefined }),
    nul: validateThought(null),
  })) {
    assert.equal(r.ok, false, name);
    assert.ok(r.errors.length > 0, name);
  }
});
