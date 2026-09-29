import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechError, selectEngine, transcribeWithFallback, speechMessage } from '../src/speech/select.js';

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

test('whisper preference falls back when unavailable or failed', async () => {
  const w = stub('whisper', { available: false });
  const b = stub('browser', { result: 'hi' });
  assert.equal(selectEngine([w, b], { engine: 'whisper' }).engine.id, 'browser');
  const r = await transcribeWithFallback([w, b], { engine: 'whisper' }, null, {});
  assert.equal(r.text, 'hi');
  assert.equal(w.calls.length, 0);
  const w2 = stub('whisper');
  assert.equal(selectEngine([w2, b], { engine: 'whisper', failed: new Set(['whisper']) }).engine.id, 'browser');
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
