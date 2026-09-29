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

test('G4: an hour with no am/pm is the next such hour today; tonight means pm; nothing left today gives no time', () => {
  // NOW is Tuesday 10:00
  assert.deepEqual(parseWhen('call at 7', NOW), { due_at: local(8, 29, 19), kind: 'clock' });       // 07:00 has passed, 19:00 has not
  assert.deepEqual(parseWhen('remind me tonight at 7', NOW), { due_at: local(8, 29, 19), kind: 'clock' });
  assert.deepEqual(parseWhen('today at 11', NOW), { due_at: local(8, 29, 11), kind: 'clock' });    // 11:00 is still ahead
  assert.deepEqual(parseWhen('at 7:30', NOW), { due_at: local(8, 29, 19, 30), kind: 'clock' });
  assert.deepEqual(parseWhen('tonight at 9', NOW), { due_at: local(8, 29, 21), kind: 'clock' });
  assert.deepEqual(parseWhen('at 18:00', NOW), { due_at: local(8, 29, 18), kind: 'clock' });      // 24-hour form is unambiguous
  const late = new Date(2026, 8, 29, 22, 30, 0);
  assert.deepEqual(parseWhen('at 7', late), { due_at: null, kind: null });                        // both 7s have passed today
  assert.deepEqual(parseWhen('tonight at 7', late), { due_at: null, kind: null });
  assert.deepEqual(parseWhen('tomorrow', NOW), { due_at: local(8, 30, 9), kind: 'date' });         // no hour: 09:00 default
  assert.deepEqual(parseWhen('tomorrow at 13:30', NOW), { due_at: local(8, 30, 13, 30), kind: 'clock' });
  assert.equal(scanWhen('call the dentist at 7').hasClock, true);
});

test('an unmarked hour on a named day: 7-11 morning, 1-6 afternoon, 12 noon', () => {
  const at = (text) => parseWhen(text, NOW);
  assert.deepEqual(at('tomorrow at 7'), { due_at: local(8, 30, 7), kind: 'clock' });
  assert.deepEqual(at('at 3 tomorrow'), { due_at: local(8, 30, 15), kind: 'clock' });
  assert.deepEqual(at('at 7 on friday'), { due_at: local(9, 2, 7), kind: 'clock' });
  assert.deepEqual(at('tomorrow at 11'), { due_at: local(8, 30, 11), kind: 'clock' });
  assert.deepEqual(at('tomorrow at 6'), { due_at: local(8, 30, 18), kind: 'clock' });
  assert.deepEqual(at('tomorrow at 12'), { due_at: local(8, 30, 12), kind: 'clock' });
  assert.deepEqual(at('tomorrow at 7:30'), { due_at: local(8, 30, 7, 30), kind: 'clock' });
});

import { laterTonight } from '../src/core/timeparse.js';
import { whenFromAnswer } from '../src/brain/core.js';

test('G8: "tonight" after 20:00 means later tonight, at 08:38, 20:38, 21:38 and 23:38', () => {
  const at = (h, m) => new Date(2026, 8, 29, h, m, 0, 0);
  const hm = (iso) => { const d = new Date(iso); return [d.getDate(), d.getHours(), d.getMinutes()]; };
  assert.deepEqual(hm(whenFromAnswer('Tonight', at(8, 38))), [29, 20, 0]);
  assert.deepEqual(hm(whenFromAnswer('Tonight', at(20, 38))), [29, 21, 45]);
  assert.deepEqual(hm(whenFromAnswer('Tonight', at(21, 38))), [29, 22, 45]);
  assert.deepEqual(hm(whenFromAnswer('Tonight', at(23, 38))), [29, 23, 59]);
  assert.deepEqual(hm(whenFromAnswer('this evening', at(20, 38))), [29, 21, 45]);
  assert.deepEqual(hm(parseWhen('remind me tonight', at(22, 10)).due_at), [29, 23, 15]);
  assert.equal(laterTonight(new Date(2026, 8, 29, 23, 59, 30)), null);
});

test('G8: an explicit clock time is not changed by the tonight rule', () => {
  assert.deepEqual(parseWhen('tonight at 7', new Date(2026, 8, 29, 21, 0)), { due_at: null, kind: null });
});
