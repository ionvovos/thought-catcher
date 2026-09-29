import test from 'node:test';
import assert from 'node:assert/strict';
import { intent } from '../src/core/intent.js';

const kind = (t) => intent(t).kind;

test('questions about saved thoughts are asks', () => {
  for (const t of ['What did I say about the gym?', 'what did I write about the trip', 'Do I have anything about taxes?', 'show me my ideas about the app',
    'find my notes on the dentist', 'Did I mention the invoice?', "what's on my list", 'anything about Berlin?', 'search for gym']) {
    assert.equal(kind(t), 'ask', t);
  }
});

test('the ask query drops filler and keeps the question', () => {
  assert.equal(intent('hey what did I say about the gym?').text, 'what did I say about the gym?');
});

test('expand, plan and done commands', () => {
  for (const t of ['expand that', 'Please expand this idea', 'flesh it out', 'help me develop that']) assert.equal(kind(t), 'expand', t);
  for (const t of ['plan this', 'plan that task', 'break it down', 'make a plan for it']) assert.equal(kind(t), 'plan', t);
  for (const t of ['done', "That's all", 'thanks', 'ok thanks', 'nothing else']) assert.equal(kind(t), 'done', t);
});

test('ordinary thoughts stay captures, including "what if" ideas and reminders', () => {
  for (const t of ['buy milk', 'what if the app showed a streak calendar', 'remind me to call mum at 6pm', 'I need to plan the trip to Berlin next month',
    'what should I cook tonight?', 'expand the shed next spring', 'the plan is to leave at six', 'find a way to cut costs', '']) {
    assert.equal(kind(t), 'capture', t);
  }
});
