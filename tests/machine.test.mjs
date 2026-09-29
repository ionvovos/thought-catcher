import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, firstQuestion } from '../src/ui/conversation/machine.js';

const run = (state, ...events) => events.reduce((acc, e) => { const r = transition(acc.state, e); return { state: r.state, effects: [...acc.effects, ...r.effects] }; }, { state, effects: [] });
const types = (effects) => effects.map((e) => e.type);
const Q = { case: 2, text: 'When?', chips: ['Tonight'] };

test('idle: tap or hold starts listening and speech', () => {
  const a = transition(initialState(), { type: 'TAP_ORB' });
  assert.equal(a.state.name, 'listening');
  assert.deepEqual(types(a.effects), ['startSpeech']);
  assert.equal(transition(initialState(), { type: 'HOLD_START' }).effects[0].hold, true);
});

test('listening: tap or hold end moves to transcribing and stops speech', () => {
  const l = { ...initialState(), name: 'listening' };
  for (const type of ['TAP_ORB', 'HOLD_END']) {
    const r = transition(l, { type });
    assert.equal(r.state.name, 'transcribing');
    assert.deepEqual(types(r.effects), ['stopSpeech']);
  }
});

test('listening: LEVEL stays and sets the orb level; errors go to error state', () => {
  const l = { ...initialState(), name: 'listening' };
  const r = transition(l, { type: 'LEVEL', rms: 0.4 });
  assert.equal(r.state.name, 'listening');
  assert.deepEqual(r.effects, [{ type: 'orbLevel', rms: 0.4 }]);
  const e = transition(l, { type: 'SPEECH_ERROR', code: 'not-allowed' });
  assert.equal(e.state.name, 'error');
  assert.equal(e.state.error, 'not-allowed');
  assert.deepEqual(types(e.effects), ['showError']);
});

test('transcribing: transcript becomes a message and a routed capture; nothing heard returns to idle', () => {
  const t = { ...initialState(), name: 'transcribing' };
  const r = transition(t, { type: 'TRANSCRIPT', text: '  buy milk ' });
  assert.equal(r.state.name, 'thinking');
  assert.equal(r.state.source, 'voice');
  assert.deepEqual(types(r.effects), ['showUserMessage', 'route']);
  assert.equal(r.effects[1].text, 'buy milk');
  const n = transition(t, { type: 'NOTHING_HEARD' });
  assert.equal(n.state.name, 'idle');
  assert.equal(n.effects[0].text, 'Nothing heard');
  assert.equal(transition(t, { type: 'TRANSCRIPT', text: '   ' }).state.name, 'idle');
});

test('idle: a typed message goes through route (intent decides), empty text does nothing', () => {
  const r = transition(initialState(), { type: 'SEND_TEXT', text: 'what did I say about the gym?' });
  assert.equal(r.state.name, 'thinking');
  assert.deepEqual(types(r.effects), ['showUserMessage', 'route']);
  assert.equal(transition(initialState(), { type: 'SEND_TEXT', text: '  ' }).state.name, 'idle');
});

test('thinking: capture intent saves rule items first, then asks the brain (AC-X2.5)', () => {
  const t = transition(initialState(), { type: 'SEND_TEXT', text: 'buy milk' }).state;
  const r = transition(t, { type: 'INTENT', kind: 'capture', text: 'buy milk' });
  assert.deepEqual(types(r.effects), ['saveRules', 'brainSplit']);
  assert.equal(r.state.name, 'thinking');
});

test('thinking: ask, expand, plan and done intents', () => {
  const t = transition(initialState(), { type: 'SEND_TEXT', text: 'x' }).state;
  assert.deepEqual(types(transition(t, { type: 'INTENT', kind: 'ask', text: 'q' }).effects), ['brainAsk']);
  assert.deepEqual(transition(t, { type: 'INTENT', kind: 'expand', text: 'e' }).effects[0], { type: 'runOnLast', what: 'expand', text: 'e' });
  assert.deepEqual(transition(t, { type: 'INTENT', kind: 'plan', text: 'p' }).effects[0], { type: 'runOnLast', what: 'plan', text: 'p' });
  const d = transition(t, { type: 'INTENT', kind: 'done', text: 'done' });
  assert.equal(d.state.name, 'idle');
});

test('thinking: BRAIN_DONE without a question files, with a question asks', () => {
  const t = { ...initialState(), name: 'thinking', kind: 'capture' };
  const plain = transition(t, { type: 'BRAIN_DONE', items: [{ text: 'a', question: null }] });
  assert.equal(plain.state.name, 'filed');
  assert.deepEqual(types(plain.effects), ['replaceRuleItems', 'showReply', 'speakReply']);
  const asked = transition(t, { type: 'BRAIN_DONE', items: [{ text: 'a', question: null }, { text: 'b', question: Q }] });
  assert.equal(asked.state.name, 'asking');
  assert.equal(asked.state.question.index, 1);
  assert.deepEqual(types(asked.effects), ['replaceRuleItems', 'showQuestion']);
});

test('thinking: BRAIN_FAILED keeps the rule items and files', () => {
  const t = { ...initialState(), name: 'thinking', kind: 'capture', items: [] };
  const r = transition(t, { type: 'BRAIN_FAILED', error: { code: 'run-failed' } });
  assert.equal(r.state.name, 'filed');
  assert.deepEqual(types(r.effects), ['showStatus', 'showReply']);
});

test('asking: answer goes back to thinking, skip files, done marks unresolved', () => {
  const a = { ...initialState(), name: 'asking', items: [{ question: Q }], question: { index: 0, question: Q } };
  const ans = transition(a, { type: 'ANSWER', text: 'Tonight' });
  assert.equal(ans.state.name, 'thinking');
  assert.deepEqual(ans.effects[0], { type: 'brainAnswer', index: 0, question: Q, text: 'Tonight' });
  const skip = transition(a, { type: 'SKIP' });
  assert.equal(skip.state.name, 'filed');
  assert.deepEqual(types(skip.effects), ['markSkipped']);
  const done = transition(a, { type: 'DONE' });
  assert.equal(done.state.name, 'idle');
  assert.deepEqual(types(done.effects), ['markUnresolved', 'clearThread']);
});

test('filed: done clears; orb starts a new listen; typed text is routed', () => {
  const f = { ...initialState(), name: 'filed', items: [{}] };
  assert.deepEqual(types(transition(f, { type: 'DONE' }).effects), ['clearThread']);
  const tap = transition(f, { type: 'TAP_ORB' });
  assert.equal(tap.state.name, 'listening');
  assert.deepEqual(types(tap.effects), ['startSpeech']);
  assert.deepEqual(types(transition(f, { type: 'SEND_TEXT', text: 'expand it' }).effects), ['showUserMessage', 'route']);
});

test('tapping the orb while speaking only stops the voice', () => {
  const f = { ...initialState(), name: 'filed', speaking: true };
  const r = transition(f, { type: 'TAP_ORB' });
  assert.equal(r.state.name, 'filed');
  assert.equal(r.state.speaking, false);
  assert.deepEqual(types(r.effects), ['stopSpeaking']);
});

test('error: tap listens again, done clears', () => {
  const e = { ...initialState(), name: 'error', error: 'network' };
  assert.equal(transition(e, { type: 'TAP_ORB' }).state.name, 'listening');
  assert.equal(transition(e, { type: 'DONE' }).state.name, 'idle');
});

test('firstQuestion: first item with a question wins (AC-X3.2)', () => {
  assert.equal(firstQuestion([{ question: null }, { question: Q }, { question: Q }]).index, 1);
  assert.equal(firstQuestion([{ question: null }]), null);
});

test('a full ramble: voice, thinking, question, answer, filed, done', () => {
  const r = run(initialState(),
    { type: 'TAP_ORB' }, { type: 'TAP_ORB' }, { type: 'TRANSCRIPT', text: 'call the dentist and buy milk' },
    { type: 'INTENT', kind: 'capture', text: 'call the dentist and buy milk' },
    { type: 'BRAIN_DONE', items: [{ question: Q }, { question: null }] },
    { type: 'ANSWER', text: 'Tonight' },
    { type: 'BRAIN_DONE', items: [{ question: null }, { question: null }] },
    { type: 'DONE' });
  assert.equal(r.state.name, 'idle');
  assert.ok(types(r.effects).includes('brainAnswer'));
});

import { dateOptions } from '../src/ui/conversation/dates.js';

test('dateOptions: evening only before 18:00, ends with no date, all in the future', () => {
  const morning = new Date(2026, 8, 29, 10, 0);
  const opts = dateOptions(morning);
  assert.equal(opts[0].label, 'Today, evening');
  assert.equal(opts.at(-1).value, null);
  for (const o of opts.filter((x) => x.value)) assert.ok(new Date(o.value) > morning, o.label);
  const late = dateOptions(new Date(2026, 8, 29, 20, 0));
  assert.notEqual(late[0].label, 'Today, evening');
});
