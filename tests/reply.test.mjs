import test from 'node:test';
import assert from 'node:assert/strict';
import { replyFor, formatWhen, answerTemplate, limitWords } from '../src/core/reply.js';

const NOW = new Date(2026, 8, 29, 10, 0, 0); // Tuesday
const it = (type, title, due = null) => ({ type, title, due_at: due });
const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).toISOString(); // d counts from 1 September, so 32 is Friday 2 October
const words = (s) => s.split(/\s+/).length;

test('several items, grouped in spoken order, a single reminder carries its time', () => {
  const items = [it('task', 'Buy milk'), it('task', 'Call mum'), it('idea', 'App'), it('reminder', 'Invoice', at(32, 18))];
  assert.equal(replyFor(items, { now: NOW }), 'Filed 2 tasks, an idea and a reminder for Fri 18:00.');
});

test('one item names its type, title and time', () => {
  assert.equal(replyFor([it('task', 'Buy milk')], { now: NOW }), 'Filed as a task: Buy milk.');
  assert.equal(replyFor([it('reminder', 'Call mum', at(30, 9))], { now: NOW }), 'Filed as a reminder: Call mum, tomorrow 09:00.');
  assert.equal(replyFor([it('journal', 'Rough day')], { now: NOW }), 'Filed as a journal note: Rough day.');
});

test('two dated reminders are counted, not both dated; nothing gives a fixed line', () => {
  assert.equal(replyFor([it('reminder', 'a', at(32, 9)), it('reminder', 'b', at(33, 9))], { now: NOW }), 'Filed 2 reminders.');
  assert.equal(replyFor([], { now: NOW }), "I didn't catch anything to file.");
});

test('replies never exceed 40 words', () => {
  const long = it('task', 'word '.repeat(59).trim());
  assert.ok(words(replyFor([long], { now: NOW })) <= 40);
  assert.ok(words(limitWords('a '.repeat(80))) <= 40);
});

test('formatWhen: today, tomorrow and a weekday, in 24-hour local time', () => {
  assert.equal(formatWhen(at(29, 18, 5), NOW), 'today 18:05');
  assert.equal(formatWhen(at(30, 9), NOW), 'tomorrow 09:00');
  assert.equal(formatWhen(at(34, 7, 30), NOW), 'Sun 07:30');
  assert.equal(formatWhen('garbage', NOW), '');
});

test('answer templates', () => {
  assert.equal(answerTemplate(0), "I couldn't find anything about that.");
  assert.equal(answerTemplate(1), 'I found one thought about that.');
  assert.equal(answerTemplate(3), 'I found 3 thoughts about that.');
});
