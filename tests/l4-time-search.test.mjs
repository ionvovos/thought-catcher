// L4 checks for AC-M5.3 (search) and the time parser behind reminders (AC-M3.1 due_at, M4.4, M7.2).
// Tests marked todo document a gap found in L4; they are reported but do not fail the run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByRules } from '../src/core/sorter.js';
import { newThought } from '../src/core/model.js';
import { searchThoughts } from '../src/core/search.js';
import { parseWhen } from '../src/core/timeparse.js';

const NOW = new Date(2026, 8, 29, 19, 0, 0); // Tuesday 19:00 local
const make = (text, id, over = {}) => ({ ...newThought({ text, sortResult: sortByRules(text, NOW), now: NOW, id }), ...over });
const due = (text) => parseWhen(text, NOW)?.due_at ?? null;
const local = (iso) => new Date(iso);

test('AC-M5.3: search matches title, body and tags, ignores case, and returns nothing for no match', () => {
  const rows = [
    make('Buy milk. Also remember the zebra stickers', 'a'),
    make('what if we sold candles online', 'b'),
    make('today was tiring but good', 'c', { tags: ['gratitude'], title: 'A good day' }),
  ];
  assert.deepEqual(searchThoughts(rows, 'ZEBRA').map((t) => t.id), ['a'], 'body text');
  assert.deepEqual(searchThoughts(rows, 'A GOOD DAY').map((t) => t.id), ['c'], 'title, case-insensitive');
  assert.deepEqual(searchThoughts(rows, 'gratitude').map((t) => t.id), ['c'], 'tag');
  assert.deepEqual(searchThoughts(rows, 'no-such-word-anywhere'), []);
  assert.equal(searchThoughts(rows, '').length, 3, 'empty query keeps everything');
  assert.equal(searchThoughts(rows, '   ').length, 3, 'blank query keeps everything');
});

test('search treats regex characters as plain text', () => {
  const rows = [make('cost is 5+5 (approx) [maybe]', 'a'), make('plain thought', 'b')];
  for (const q of ['5+5', '(approx)', '[maybe]', '.*', '\\']) assert.doesNotThrow(() => searchThoughts(rows, q), q);
  assert.deepEqual(searchThoughts(rows, '5+5').map((t) => t.id), ['a']);
  assert.deepEqual(searchThoughts(rows, '.*'), []);
});

test('clock times and day words resolve to a future local time', () => {
  assert.deepEqual([local(due('remind me at 6pm')).getDate(), local(due('remind me at 6pm')).getHours()], [30, 18], '6pm has passed today, so tomorrow');
  const inTwoHours = local(due('in 2 hours'));
  assert.equal(inTwoHours.getTime(), NOW.getTime() + 2 * 3600000);
  const tomorrow = local(due('tomorrow at 9am'));
  assert.deepEqual([tomorrow.getDate(), tomorrow.getHours(), tomorrow.getMinutes()], [30, 9, 0]);
  const fri = local(due('friday at 5pm'));
  assert.deepEqual([fri.getDay(), fri.getHours()], [5, 17]);
  assert.ok(local(due('on friday')).getTime() > NOW.getTime());
  assert.ok(local(due('next week')).getTime() > NOW.getTime());
  assert.equal(local(due('at 18:30')).getMinutes(), 30);
});

test('impossible times are not parsed', () => {
  for (const t of ['at 25:00', 'at 13pm', 'at 99:99', 'buy milk', '']) assert.equal(due(t), null, t);
});

test('a parsed due time is never in the past relative to the clock passed in', () => {
  for (const t of ['at 6pm', 'at 7pm', 'at 12am', 'at 12pm', 'noon', 'midnight', 'friday', 'monday', 'tuesday', 'next monday', 'in 30 minutes']) {
    const d = due(t);
    if (d) assert.ok(Date.parse(d) >= NOW.getTime(), `${t} -> ${d}`);
  }
});

test('the same phrase parses the same way at another clock (relative to the passed date)', () => {
  const other = new Date(2027, 0, 5, 8, 0, 0);
  const a = parseWhen('tomorrow at 9am', NOW).due_at;
  const b = parseWhen('tomorrow at 9am', other).due_at;
  assert.notEqual(a, b);
  assert.equal(new Date(b).getDate(), 6);
});

test('L4 gap F-time-1: "tonight", "this evening" and "today at ..." are common reminder words and give a time', { todo: 'not parsed: a "remind me tonight" thought becomes a reminder with no time and never resurfaces' }, () => {
  for (const t of ['remind me tonight', 'this evening', 'today at 8pm']) assert.ok(due(t), t);
});

test('L4 gap F-time-2: "yesterday at 5pm" is not scheduled for tomorrow', { todo: 'yesterday is ignored and "at 5pm" rolls forward to tomorrow' }, () => {
  const d = due('yesterday at 5pm');
  assert.ok(d === null || Date.parse(d) <= NOW.getTime() || new Date(d).getDate() === 29, String(d));
});
