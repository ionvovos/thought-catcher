import test from 'node:test';
import assert from 'node:assert/strict';
import { llmRow, embedRow, keyRow, assistantFoot, listenLabel, daysLabel, UNSUPPORTED, STOPPED } from '../src/ui/settings/status.js';
import { voiceRows, voiceSub } from '../src/ui/onboarding/voices.js';

const st = (llm, embed = { state: 'ready' }, extra = {}) => ({ llm, embed, key: 'none', online: true, engine: 'rules', ...extra });

test('AC-B2.2: not downloaded shows the size and offers a download; nothing starts by itself', () => {
  const r = llmRow(st({ state: 'not-downloaded', bytes: 870000000 }));
  assert.equal(r.action, 'download');
  assert.match(r.sub, /About 870 MB, Wi-Fi recommended/);
});

test('downloading shows the spike line with percent and size, and a Cancel action with a progress value', () => {
  const r = llmRow(st({ state: 'downloading', pct: 42, bytes: 870000000 }));
  assert.equal(r.sub, 'Getting the assistant ready: 42% of 870 MB. You can keep using the app.');
  assert.deepEqual([r.action, r.pct], ['cancel', 42]);
});

test('AC-B2.4: unsupported says plainly that simple rules are used, with no download action', () => {
  const r = llmRow(st({ state: 'not-supported', reason: 'no-webgpu' }));
  assert.equal(r.action, null);
  assert.match(r.sub, /can't run the on-device assistant/);
  assert.match(r.sub, /simple rules/);
  assert.equal(r.sub, UNSUPPORTED);
});

test('a failed assistant says what happened and offers Try again; offline names the cause', () => {
  const r = llmRow(st({ state: 'error', code: 'load-failed', message: 'x' }));
  assert.deepEqual([r.action, r.sub], ['retry', STOPPED]);
  assert.match(llmRow(st({ state: 'error', code: 'offline', message: 'x' })).sub, /offline/);
});

test('ready and loading states', () => {
  assert.equal(llmRow(st({ state: 'ready' })).tone, 'ok');
  assert.equal(llmRow(st({ state: 'loading', pct: 30 })).pct, 30);
});

test('search by meaning: ready 22 MB, not supported, downloading, error', () => {
  assert.equal(embedRow(st({ state: 'ready' }, { state: 'ready' })).sub, 'Ready, 22 MB');
  assert.equal(embedRow(st({ state: 'ready' }, { state: 'not-supported' })).action, null);
  assert.equal(embedRow(st({ state: 'ready' }, { state: 'downloading', pct: 10, bytes: 29000000 })).action, 'cancel');
  assert.equal(embedRow(st({ state: 'ready' }, { state: 'error', code: 'x', message: 'y' })).action, 'retry');
  assert.match(embedRow(st({ state: 'ready' }, { state: 'not-downloaded', bytes: 29000000 })).sub, /About 29 MB/);
});

test('own key row: off, on and rejected show only fixed wording, never provider text', () => {
  assert.equal(keyRow(st({ state: 'ready' }, undefined, { key: 'none' }), {}, 'Anthropic').value, 'Off');
  assert.equal(keyRow(st({ state: 'ready' }, undefined, { key: 'set' }), {}, 'Anthropic').sub, 'Using your Anthropic key.');
  const rej = keyRow(st({ state: 'ready' }, undefined, { key: 'rejected' }), {}, 'Anthropic');
  assert.equal(rej.value, 'Key rejected');
  assert.equal(rej.tone, 'warn');
});

test('footer and labels', () => {
  assert.equal(assistantFoot(st({ state: 'ready' })), null);
  assert.match(assistantFoot(st({ state: 'not-downloaded' })), /Nothing downloads without your tap/);
  assert.equal(listenLabel('whisper'), 'On this phone');
  assert.equal(listenLabel('ask'), 'Ask me');
  assert.equal(daysLabel(1), '1 day');
  assert.equal(daysLabel(3), '3 days');
});

test('AC-X9.4 and review F3: voices are English, on-phone only, de-duplicated, capped, with a plain subtitle', () => {
  const voices = [
    { name: 'Zoe', lang: 'en-GB', localService: false },
    { name: 'Daniel', lang: 'en-GB', localService: true },
    { name: 'Amélie', lang: 'fr-CA', localService: true },
    { name: 'Samantha', lang: 'en-US', localService: true },
    { name: 'Samantha', lang: 'en-US', localService: true },
  ];
  const rows = voiceRows(voices);
  assert.deepEqual(rows.map((r) => r.name), ['Daniel', 'Samantha']);
  assert.equal(rows[0].sub, 'System voice, English (UK)');
  assert.equal(voiceRows(voices, 1).length, 1);
  assert.deepEqual(voiceRows(undefined), []);
  assert.equal(voiceSub('en_US'), 'System voice, English (US)');
  assert.equal(voiceSub(''), 'System voice');
});
