import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryView, whenLabel, dueLabel, agoLabel, snippetOf, highlightParts, topTags, TYPE_ORDER } from '../src/ui/library/view.js';

const NOW = new Date(2026, 8, 29, 14, 30); // Tue 29 Sep 2026, 14:30 local

function th(over) {
  const d = over.created ?? new Date(2026, 8, 28, 10, 0);
  return {
    id: over.id, text: over.text ?? over.title, title: over.title, type: over.type, tags: over.tags ?? [],
    created_at: d.toISOString(), updated_at: d.toISOString(), source: 'typed',
    sort: { by: 'rules', confidence: 0.9, alt_type: null, model: null },
    due_at: over.due ?? null, done: over.done ?? false, done_at: null,
    clarify: { state: 'none', case: null, question: null, answer: null }, expansion: null,
    review: { last_reviewed_at: null, snoozed_until: null, dismissed: false },
  };
}

const SET = [
  th({ id: 'a', type: 'idea', title: 'Gym plan', text: 'Three short sessions at the gym', tags: ['fitness'], created: new Date(2026, 8, 26) }),
  th({ id: 'b', type: 'task', title: 'Renew gym membership', tags: ['fitness'], due: new Date(2026, 9, 12, 9, 0).toISOString() }),
  th({ id: 'c', type: 'task', title: 'Book the car service', tags: ['car'], done: true }),
  th({ id: 'd', type: 'journal', title: 'Good run by the sea', created: new Date(2026, 8, 27) }),
  th({ id: 'e', type: 'reminder', title: 'Pick up the dry cleaning', due: new Date(2026, 8, 29, 18, 0).toISOString() }),
  th({ id: 'f', type: 'idea', title: 'Bread workshop', created: new Date(2026, 8, 20) }),
];

test('groups follow the type order, newest first, and each count equals the number listed', () => {
  const v = libraryView(SET);
  assert.deepEqual(v.groups.map((g) => g.type), ['reminder', 'task', 'idea', 'journal']);
  assert.deepEqual(TYPE_ORDER, ['reminder', 'task', 'idea', 'journal']);
  const ideas = v.groups.find((g) => g.type === 'idea').items.map((t) => t.id);
  assert.deepEqual(ideas, ['a', 'f']);
  assert.equal(v.shown, SET.length);
  assert.equal(v.counts.all, 6);
  assert.equal(v.counts.task, 2);
});

test('reminders are listed by due time, soonest first, undated last', () => {
  const rs = [
    th({ id: 'x', type: 'reminder', title: 'later', due: new Date(2026, 9, 2, 9).toISOString() }),
    th({ id: 'y', type: 'reminder', title: 'undated' }),
    th({ id: 'z', type: 'reminder', title: 'sooner', due: new Date(2026, 8, 30, 9).toISOString() }),
  ];
  assert.deepEqual(libraryView(rs).groups[0].items.map((t) => t.id), ['z', 'x', 'y']);
});

test('search matches title, body and tags case-insensitively and counts follow the search', () => {
  const v = libraryView(SET, { q: 'GYM' });
  assert.deepEqual(v.groups.flatMap((g) => g.items.map((t) => t.id)).sort(), ['a', 'b']);
  assert.equal(v.counts.idea, 1);
  assert.equal(libraryView(SET, { q: 'fitness' }).shown, 2);
  assert.equal(libraryView(SET, { q: 'passport' }).shown, 0);
  assert.equal(libraryView(SET, { q: 'passport' }).groups.length, 0);
});

test('type, tag and open/done filters combine with search', () => {
  assert.equal(libraryView(SET, { type: 'task' }).shown, 2);
  assert.equal(libraryView(SET, { tag: 'fitness' }).shown, 2);
  assert.equal(libraryView(SET, { tag: 'fitness', type: 'idea' }).shown, 1);
  assert.deepEqual(libraryView(SET, { state: 'open' }).groups.flatMap((g) => g.items.map((t) => t.id)), ['b']);
  assert.deepEqual(libraryView(SET, { state: 'done' }).groups.flatMap((g) => g.items.map((t) => t.id)), ['c']);
  assert.equal(libraryView(SET, { q: 'gym', state: 'open' }).shown, 1);
  // chip counts ignore the type filter
  assert.equal(libraryView(SET, { type: 'idea' }).counts.task, 2);
});

test('a topic (a list of ids) narrows the library to its members and combines with search', () => {
  const v = libraryView(SET, { ids: ['a', 'b', 'd'] });
  assert.equal(v.shown, 3);
  assert.equal(v.filtered, true);
  assert.equal(libraryView(SET, { ids: ['a', 'b', 'd'], q: 'gym' }).shown, 2);
  assert.equal(libraryView(SET, { ids: [] }).shown, 0);
});

test('the filtered flag is false for the plain library and true when anything narrows it', () => {
  assert.equal(libraryView(SET).filtered, false);
  assert.equal(libraryView(SET, { q: ' ' }).filtered, false);
  assert.equal(libraryView(SET, { tag: 'car' }).filtered, true);
});

test('an empty library has no groups and total 0', () => {
  const v = libraryView([]);
  assert.equal(v.total, 0);
  assert.deepEqual(v.groups, []);
  assert.equal(v.counts.all, 0);
});

test('topTags is by use, then alphabetical, and capped', () => {
  assert.deepEqual(topTags(SET), ['fitness', 'car']);
  const many = Array.from({ length: 12 }, (_, i) => th({ id: `t${i}`, type: 'idea', title: `x${i}`, tags: [`tag${String(i).padStart(2, '0')}`] }));
  assert.equal(topTags(many).length, 8);
});

test('500 thoughts are grouped well under a second', () => {
  const big = Array.from({ length: 500 }, (_, i) => th({ id: `n${i}`, type: ['idea', 'task', 'journal', 'reminder'][i % 4], title: `Thought number ${i}`, tags: [`t${i % 7}`] }));
  const t0 = Date.now();
  const v = libraryView(big, { q: 'number' });
  assert.equal(v.shown, 500);
  assert.ok(Date.now() - t0 < 300);
});

test('due labels are local time: today, tomorrow, yesterday, then the date', () => {
  assert.equal(dueLabel(new Date(2026, 8, 29, 18, 0).toISOString(), NOW), 'Today 18:00');
  assert.equal(dueLabel(new Date(2026, 8, 30, 9, 5).toISOString(), NOW), 'Tomorrow 9:05');
  assert.equal(dueLabel(new Date(2026, 8, 28, 9, 0).toISOString(), NOW), 'Yesterday 9:00');
  assert.equal(dueLabel(new Date(2026, 9, 10, 9, 0).toISOString(), NOW), 'Sat 10 Oct');
});

test('card labels: a reminder due today is marked due, a done one is not, tasks show the due date, others show age', () => {
  assert.deepEqual(whenLabel(SET[4], NOW), { text: 'Today 18:00', due: true });
  assert.equal(whenLabel({ ...SET[4], done: true }, NOW).due, false);
  assert.deepEqual(whenLabel(SET[1], NOW), { text: 'Due 12 Oct', due: false });
  assert.equal(whenLabel(SET[0], NOW).text, '3 days ago');
  assert.equal(whenLabel(SET[5], NOW).text, 'Sun 20 Sep');
  assert.equal(agoLabel(new Date(2026, 8, 29, 8, 0).toISOString(), NOW), 'Today');
  assert.equal(agoLabel(new Date(2026, 8, 28, 8, 0).toISOString(), NOW), 'Yesterday');
  assert.equal(agoLabel(new Date(2026, 8, 25, 8, 0).toISOString(), NOW), '4 days ago');
});

test('snippet is empty when the body repeats the title and cut at the limit otherwise', () => {
  assert.equal(snippetOf({ title: 'Buy milk', text: 'buy milk' }), '');
  assert.equal(snippetOf({ title: 'A', text: 'x'.repeat(300) }).length, 161);
  assert.equal(snippetOf({ title: 'A', text: 'two   spaces\nnewline' }), 'two spaces newline');
});

test('highlightParts marks every match, keeps all the text and never treats it as markup', () => {
  const parts = highlightParts('Gym day, gym <b>night</b>', 'gym');
  assert.equal(parts.map((p) => p.text).join(''), 'Gym day, gym <b>night</b>');
  assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.text), ['Gym', 'gym']);
  assert.deepEqual(highlightParts('plain', ''), [{ text: 'plain', hit: false }]);
});

import { dueLabel as dueLabelG5, whenLabel as whenLabelG5 } from '../src/ui/library/view.js';
test('G5: a reminder beyond tomorrow shows its clock; a task does not', () => {
  const now = new Date(2026, 8, 29, 10, 0);
  const iso = new Date(2026, 9, 2, 10, 0).toISOString();
  assert.equal(dueLabelG5(iso, now), 'Fri 2 Oct');
  assert.equal(dueLabelG5(iso, now, { clock: true }), 'Fri 2 Oct 10:00');
  assert.equal(whenLabelG5({ type: 'reminder', due_at: iso, done: false, created_at: iso }, now).text, 'Fri 2 Oct 10:00');
  assert.equal(whenLabelG5({ type: 'task', due_at: iso, created_at: iso }, now).text, 'Due 2 Oct');
});

import { snippetOf as snippetG9 } from '../src/ui/library/view.js';
import { sortByRules as sortG9 } from '../src/core/sorter.js';
test('G9: a second sentence is never hidden; only a body that repeats the title with capture wording is', () => {
  const now = new Date(2026, 8, 29, 10, 0);
  const t = (text) => ({ text, title: sortG9(text, now).title });
  for (const text of ['Pay the water bill. It is 84 euros.', 'Call Anna. She moved to Lyon last week.', 'Pay the electricity bill. It is 84 euros.', 'Call the dentist. Ask about the crown too.', 'Renew passport. Photos first!', 'Buy milk. The oat one, not soy.']) {
    assert.ok(snippetG9(t(text)).length > 0, `library hides: ${text}`);
    assert.ok(snippetG9(t(text), 4000, { keepWording: true }).length > 0, `detail hides: ${text}`);
  }
  assert.equal(snippetG9(t('Remind me on Friday at 10 to renew the car insurance')), '');
  assert.equal(snippetG9(t('I need to call the dentist tomorrow at 9')), '');
  assert.equal(snippetG9(t('Buy milk')), '');
  assert.ok(snippetG9(t('Remind me on Friday at 10 to renew the car insurance'), 4000, { keepWording: true }).length > 0, 'the detail shows what was said');
});
