import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhen, scanWhen } from '../src/core/timeparse.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0); // Tuesday
const local = (m, d, h, min = 0) => new Date(2026, m, d, h, min).toISOString();

const cases = [
  ['call mum at 6pm', local(8, 29, 18), 'clock'],
  ['at 18:00', local(8, 29, 18), 'clock'],
  ['6:30pm', local(8, 29, 18, 30), 'clock'],
  ['at 9am', local(8, 30, 9), 'clock'],
  ['noon', local(8, 29, 12), 'clock'],
  ['tomorrow', local(8, 30, 9), 'date'],
  ['tomorrow at 7am', local(8, 30, 7), 'clock'],
  ['friday', local(9, 2, 9), 'date'],
  ['on tuesday', local(9, 6, 9), 'date'],
  ['next week', local(9, 6, 9), 'date'],
  ['in 3 days', local(9, 2, 9), 'date'],
  ['in 2 hours', new Date(NOW.getTime() + 2 * 3600000).toISOString(), 'clock'],
  ['in 30 minutes', new Date(NOW.getTime() + 30 * 60000).toISOString(), 'clock'],
  ['in an hour', new Date(NOW.getTime() + 3600000).toISOString(), 'clock'],
];

for (const [input, due, kind] of cases) {
  test(`parseWhen: ${input}`, () => {
    assert.deepEqual(parseWhen(input, NOW), { due_at: due, kind });
  });
}

test('no time phrase', () => {
  for (const s of ['buy milk', '13pm', '25:00', 'today was good', '6:75']) {
    assert.deepEqual(parseWhen(s, NOW), { due_at: null, kind: null }, s);
  }
});

test('scanWhen and input checks', () => {
  assert.deepEqual(scanWhen('buy milk tomorrow'), { hasClock: false, hasDate: true });
  assert.deepEqual(scanWhen('call at 6pm'), { hasClock: true, hasDate: false });
  assert.throws(() => parseWhen('x', 'nope'), TypeError);
  const before = NOW.getTime();
  parseWhen('tomorrow at 7am', NOW);
  assert.equal(NOW.getTime(), before);
});

test('tonight, this evening and today at ... resolve to today; a past time or yesterday gives no time', () => {
  assert.deepEqual(parseWhen('remind me tonight', NOW), { due_at: local(8, 29, 20), kind: 'clock' });
  assert.deepEqual(parseWhen('this evening', NOW), { due_at: local(8, 29, 20), kind: 'clock' });
  assert.deepEqual(parseWhen('tonight at 9pm', NOW), { due_at: local(8, 29, 21), kind: 'clock' });
  assert.deepEqual(parseWhen('today at 8pm', NOW), { due_at: local(8, 29, 20), kind: 'clock' });
  // NOW is 10:00: 8am today has passed, so no time is parsed (the app asks when) instead of tomorrow
  assert.deepEqual(parseWhen('today at 8am', NOW), { due_at: null, kind: null });
  assert.deepEqual(parseWhen('yesterday at 5pm', NOW), { due_at: null, kind: null });
  assert.deepEqual(parseWhen('yesterday I said remind me tomorrow at 9am', NOW), { due_at: local(8, 30, 9), kind: 'clock' });
  assert.deepEqual(parseWhen('today was good', NOW), { due_at: null, kind: null });
});
