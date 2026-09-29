import test from 'node:test';
import assert from 'node:assert/strict';
import { splitByRules, splitTexts, startsAction } from '../src/core/splitter.js';
import { RAMBLES, SINGLES, NOW } from './fixtures/rambles.js';

test('AC-X3.1: the rule splitter gets at least 70% of the 10 rambles to the right item count', () => {
  assert.ok(RAMBLES.length >= 10);
  const right = RAMBLES.filter((r) => splitByRules(r.note, NOW).length === r.items.length);
  assert.ok(right.length / RAMBLES.length >= 0.7, `${right.length}/${RAMBLES.length}`);
});

test('AC-X3.3: single sentences are not over-split (at least 9 of 10)', () => {
  const kept = SINGLES.filter((s) => splitByRules(s, NOW).length === 1);
  assert.ok(kept.length / SINGLES.length >= 0.9, `${kept.length}/${SINGLES.length}`);
});

test('the spec ramble: two tasks, an idea and a reminder, with the reminder dated', () => {
  const items = splitByRules(RAMBLES[0].note, NOW);
  assert.deepEqual(items.map((i) => i.type), ['task', 'task', 'idea', 'reminder']);
  const reminder = items[3];
  assert.equal(new Date(reminder.due_at).getDay(), 5, 'Friday');
  assert.equal(new Date(reminder.due_at).getHours(), 18);
});

test('every part is sorted on its own: type, title of 60 or fewer characters, at most 5 tags', () => {
  for (const r of RAMBLES) {
    for (const it of splitByRules(r.note, NOW)) {
      assert.ok(['idea', 'task', 'journal', 'reminder'].includes(it.type));
      assert.ok(it.title.length >= 1 && it.title.length <= 60, it.title);
      assert.ok(it.tags.length <= 5);
      assert.equal('scores' in it, false);
    }
  }
});

test('line breaks and list markers split a typed list', () => {
  assert.deepEqual(splitTexts('- buy milk\n- call mum tomorrow at 5\n3) fix the tap'), ['buy milk', 'call mum tomorrow at 5', 'fix the tap']);
});

test('connectors: and also, oh and, and then, plus a reminder cue', () => {
  assert.equal(splitTexts('I need to email Nick and also book the car').length, 2);
  assert.equal(splitTexts('I went for a run, oh and I bought bread').length, 2);
  assert.equal(splitTexts('email Sam and then call Ana').length, 2);
  assert.equal(splitTexts('I should sort the paperwork, remind me tomorrow at 9 to send it').length, 2);
});

test('lists of nouns and single actions are not cut', () => {
  assert.equal(splitTexts('buy milk, eggs and bread').length, 1);
  assert.equal(splitTexts('pick up milk and eggs').length, 1);
  assert.equal(splitTexts('meet Sam at 6, the one from work').length, 1);
});

test('adjacent journal sentences read as one entry; a pronoun sentence continues the previous one', () => {
  assert.equal(splitByRules('I felt tired all day. I am grateful for the walk.', NOW).length, 1);
  assert.equal(splitByRules('The gym app should show streaks. It could also have a calendar.', NOW).length, 1);
});

test('a ramble never yields more than 8 items, and empty input yields none', () => {
  const many = Array.from({ length: 12 }, (_, i) => `Buy item${i} number${i}.`).join(' ');
  assert.ok(splitByRules(many, NOW).length <= 8);
  assert.deepEqual(splitByRules('   ', NOW), []);
});

test('startsAction sees verbs through lead-ins', () => {
  assert.equal(startsAction('tomorrow I need to call the dentist'), true);
  assert.equal(startsAction('please buy milk'), true);
  assert.equal(startsAction('remind me on Friday'), true);
  assert.equal(startsAction('the meeting went badly'), false);
});
