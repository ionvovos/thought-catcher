// Builder check of the on-device speech path in real Chrome with a fake microphone (a beep, not speech).
// Downloads the Whisper model (about 60 MB) from the pinned CDN and Hugging Face on first run: needs the network.
// Usage (outside the Bash sandbox): node e2e/l3-whisper-drive.mjs
import { launch, sleep } from './lib/cdp.mjs';

const b = await launch({ chromeArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const out = {};
const q = (s) => `document.querySelector(${JSON.stringify(s)})`;
await b.load(`${b.base}/#/capture`);
out.consentBefore = await b.ev(`Boolean(${q('.consent')})`);
await b.ev(`${q('.record-btn')}.click()`);
await sleep(300);
out.consentChoices = await b.ev(`Array.from(document.querySelectorAll('.consent-choice')).map((e) => e.textContent)`);
out.noAudioBeforeChoice = await b.ev(`document.querySelector('.record-btn').getAttribute('aria-pressed')`);
await b.ev(`${q('[data-choice=whisper]')}.click()`);
const states = [];
for (let i = 0; i < 600; i += 1) {   // up to 5 min for the first download
  const st = await b.ev(`document.getElementById('capture-status').textContent`);
  if (states[states.length - 1] !== st) states.push(st);
  if (st.startsWith('Listening')) break;
  await sleep(500);
}
out.statesUntilListening = states.slice(0, 6);
await sleep(2500);
await b.ev(`${q('.record-btn')}.click()`);   // stop
for (let i = 0; i < 240; i += 1) {
  const st = await b.ev(`document.getElementById('capture-status').textContent`);
  if (states[states.length - 1] !== st) states.push(st);
  if (!/Listening|Turning your voice|Getting/.test(st)) break;
  await sleep(500);
}
out.statesAfterStop = states.slice(-4);
out.field = await b.ev(`document.getElementById('thought-text').value`);
out.saved = await b.ev(`localStorage.getItem('thought-catcher.speech.engine')`);
out.nonLocalHosts = [...new Set(b.network.filter((u) => !u.startsWith(b.base) && !/^(data|blob):/.test(u)).map((u) => new URL(u).host))];
console.log(JSON.stringify(out, null, 2));
console.log('PROBLEMS', JSON.stringify(b.problems.slice(0, 8), null, 2));
await b.close();
