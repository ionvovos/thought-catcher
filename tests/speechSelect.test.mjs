import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechError, selectEngine, transcribeWithFallback, speechMessage, failureMessage, enginesToMarkFailed, ON_DEVICE_FAILED } from '../src/speech/select.js';

function stub(id, { available = true, result = '', error = null } = {}) {
  const calls = [];
  return {
    id, calls,
    isAvailable: () => available,
    async transcribe(input, opts) {
      calls.push({ input, opts });
      if (error) throw error;
      return result;
    },
  };
}

test('typing preference selects nothing and never transcribes', async () => {
  const w = stub('whisper');
  const b = stub('browser');
  assert.deepEqual(selectEngine([w, b], { engine: 'typing' }), { engine: null, reason: 'typing' });
  const r = await transcribeWithFallback([w, b], { engine: 'typing' }, null, {});
  assert.equal(r.text, null);
  assert.equal(r.reason, 'typing');
  assert.equal(w.calls.length + b.calls.length, 0);
});

test('browser preference', () => {
  const w = stub('whisper');
  assert.equal(selectEngine([w, stub('browser')], { engine: 'browser' }).engine.id, 'browser');
  assert.deepEqual(selectEngine([w, stub('browser', { available: false })], { engine: 'browser' }), { engine: null, reason: 'unavailable' });
});

test('whisper preference never falls back to the browser service', async () => {
  const w = stub('whisper', { available: false });
  const b = stub('browser', { result: 'hi' });
  assert.deepEqual(selectEngine([w, b], { engine: 'whisper' }), { engine: null, reason: 'unavailable' });
  const r = await transcribeWithFallback([w, b], { engine: 'whisper' }, null, {});
  assert.equal(r.text, null);
  assert.equal(b.calls.length, 0);
  const failing = stub('whisper', { error: new SpeechError('failed') });
  const r2 = await transcribeWithFallback([failing, b], { engine: 'whisper' }, null, {});
  assert.equal(r2.text, null);
  assert.equal(b.calls.length, 0);
});

test('failure message and session memory for the on-device choice', () => {
  const result = { text: null, engine: null, errors: [{ engine: 'whisper', code: 'failed' }], reason: 'failed' };
  assert.equal(failureMessage({ engine: 'whisper' }, result), ON_DEVICE_FAILED);
  assert.equal(failureMessage({ engine: 'ask' }, result), speechMessage('failed'));
  const mic = { ...result, errors: [{ engine: 'whisper', code: 'not-allowed' }], reason: 'not-allowed' };
  assert.equal(failureMessage({ engine: 'whisper' }, mic), speechMessage('not-allowed'));
  assert.deepEqual(enginesToMarkFailed({ engine: 'whisper' }, result), []);
  assert.deepEqual(enginesToMarkFailed({ engine: 'ask' }, result), ['whisper']);
});

test('ask and unknown preference try whisper first', () => {
  const w = stub('whisper');
  const b = stub('browser');
  assert.equal(selectEngine([w, b], { engine: 'ask' }).engine.id, 'whisper');
  assert.equal(selectEngine([w, b], { engine: 'weird' }).engine.id, 'whisper');
});

test('fallback to the second engine when the first fails', async () => {
  const w = stub('whisper', { error: new SpeechError('failed') });
  const b = stub('browser', { result: 'hello' });
  assert.deepEqual(await transcribeWithFallback([w, b], { engine: 'ask' }, null, {}), {
    text: 'hello', engine: 'browser', errors: [{ engine: 'whisper', code: 'failed' }],
  });
});

test('a fatal failure does not fall back to the next engine', async () => {
  const fatal = new SpeechError('failed');
  fatal.fatal = true;
  const w = stub('whisper', { error: fatal });
  const b = stub('browser', { result: 'never used' });
  const r = await transcribeWithFallback([w, b], { engine: 'ask' }, null, {});
  assert.equal(r.text, null);
  assert.equal(r.reason, 'failed');
  assert.equal(b.calls.length, 0);
});

test('empty transcript is a result, not a failure', async () => {
  const w = stub('whisper', { result: '' });
  const b = stub('browser', { result: 'x' });
  const r = await transcribeWithFallback([w, b], { engine: 'ask' }, null, {});
  assert.equal(r.text, '');
  assert.equal(r.engine, 'whisper');
  assert.equal(b.calls.length, 0);
});

test('all engines fail', async () => {
  const w = stub('whisper', { error: new SpeechError('failed') });
  const b = stub('browser', { error: new SpeechError('not-allowed') });
  const r = await transcribeWithFallback([w, b], { engine: 'ask' }, null, {});
  assert.equal(r.text, null);
  assert.equal(r.errors.length, 2);
  assert.equal(r.reason, 'not-allowed');
});

test('nothing available reports unavailable; input and opts pass through', async () => {
  const none = await transcribeWithFallback([stub('browser', { available: false })], { engine: 'browser' }, null, {});
  assert.equal(none.reason, 'unavailable');
  const b = stub('browser', { result: 'ok' });
  const opts = { stop: new AbortController().signal };
  await transcribeWithFallback([b], { engine: 'browser' }, 'INPUT', opts);
  assert.equal(b.calls[0].input, 'INPUT');
  assert.equal(b.calls[0].opts, opts);
});

test('speechMessage', () => {
  for (const c of ['not-allowed', 'network', 'unavailable', 'typing', 'failed', 'unknown']) {
    assert.ok(speechMessage(c).length > 0);
  }
});
