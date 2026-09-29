import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aboutSections, SPEECH_STATEMENT, CODE_URL, AUTHOR } from '../src/core/aboutText.js';

const flat = (features) => JSON.stringify(aboutSections(features));

test('AC-M10.2: what it is, install steps for both phones, privacy, author, code link', () => {
  const s = aboutSections({ onDeviceSpeech: true });
  const headings = s.map((x) => x.heading);
  for (const h of ['What it is', 'Put it on your phone', 'Your data', 'Speech', 'AI (optional)', 'Who made it']) assert.ok(headings.includes(h), h);
  const install = s.find((x) => x.heading === 'Put it on your phone');
  assert.deepEqual(install.groups.map((g) => g.label), ['iPhone', 'Android']);
  for (const g of install.groups) assert.ok(g.steps.length <= 3);
  assert.match(install.groups[0].steps.join(' '), /Safari.*Share.*Add to Home Screen/);
  assert.match(install.groups[1].steps.join(' '), /Chrome.*menu.*Install app/);
  const who = s.find((x) => x.heading === 'Who made it');
  assert.ok(who.paragraphs[0].includes(AUTHOR));
  assert.equal(AUTHOR, 'Ion Vovos / Nexa Systems');
  assert.equal(who.link.href, 'https://github.com/ionvovos/thought-catcher');
  assert.equal(CODE_URL, who.link.href);
});

test('AC-M2.4: speech statement names which engine keeps audio on the device and who gets it otherwise', () => {
  const withModel = flat({ onDeviceSpeech: true });
  assert.ok(withModel.includes(JSON.stringify(SPEECH_STATEMENT).slice(1, -1)));
  assert.match(SPEECH_STATEMENT, /never sent anywhere/);
  assert.match(SPEECH_STATEMENT, /Google for Chrome, Apple for Safari/);
  const without = flat({ onDeviceSpeech: false });
  assert.match(without, /Google for Chrome, Apple for Safari/);
  assert.match(without, /not in this release/);
  assert.equal(without.includes('If you choose the on-device model'), false);
});

test('AC-M10.4 and AC-M7.6: limits of v1 and reminders only on open', () => {
  const t = flat();
  assert.match(t, /no notifications/i);
  assert.match(t, /do not sync/);
  assert.match(t, /English only/);
  assert.match(t, /no App Store or Play Store/);
  assert.match(t, /Reminders appear only when you open the app/);
});

test('AC-M10.5: no unexplained technical term', () => {
  const t = flat({ onDeviceSpeech: true });
  for (const term of ['IndexedDB', 'PWA', 'API key', 'localStorage', 'Whisper', 'transformers', 'JSON', 'CORS', 'service worker']) {
    assert.equal(t.includes(term), false, term);
  }
  assert.match(t, /a password that lets this app use your account/);
});

test('AC-M1.3: the desktop shortcut is documented, and export and backup advice is present', () => {
  const t = flat();
  assert.match(t, /Press R to start and stop recording/);
  assert.match(t, /Escape/);
  assert.match(t, /Export in Settings/);
  assert.match(t, /iOS removing data/);
  assert.match(t, /spending limit/);
});
