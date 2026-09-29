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

test('Your data: says what else leaves the device, and names the model download only when the model ships', () => {
  const withModel = aboutSections({ onDeviceSpeech: true }).find((x) => x.heading === 'Your data').paragraphs.join(' ');
  assert.match(withModel, /Nothing else leaves your device, apart from what the Speech, Assistant and AI sections below describe\./);
  assert.match(withModel, /downloaded once from public servers \(jsDelivr and Hugging Face\), which see your internet address but none of your thoughts/);
  assert.equal(/Nothing is uploaded unless/.test(withModel), false);
  const without = aboutSections({ onDeviceSpeech: false }).find((x) => x.heading === 'Your data').paragraphs.join(' ');
  assert.match(without, /Nothing else leaves your device/);
  assert.equal(/jsDelivr|Hugging Face/.test(without), false);
});

test('AC-B4.2, AC-X10.7: the About text lists every host the app contacts and explains the on-device assistant', () => {
  const sections = aboutSections({ onDeviceSpeech: true });
  const hosts = sections.find((x) => x.heading === 'Where the app connects').hosts.map((h) => h.host).join(' ');
  for (const h of ['ionvovos.github.io', 'cdn.jsdelivr.net', 'huggingface.co', 'raw.githubusercontent.com']) assert.ok(hosts.includes(h), h);
  assert.match(hosts, /address you saved a key for/);
  assert.match(hosts, /speech service/);
  const assistant = sections.find((x) => x.heading === 'Assistant').paragraphs.join(' ');
  assert.match(assistant, /870 MB/);
  assert.match(assistant, /29 MB/);
  assert.match(assistant, /after you agree/);
  assert.match(assistant, /Not now/);
});

test('the v2 default describes the on-device speech model', () => {
  assert.equal(JSON.stringify(aboutSections()), JSON.stringify(aboutSections({ onDeviceSpeech: true })));
});
