// Builder check in a real browser (no key): capture -> inbox -> detail edit/done/delete -> reload, console problems.
// Usage (outside the Bash sandbox): node e2e/l3-drive.mjs
import { launch, sleep } from './lib/cdp.mjs';

const b = await launch();
const out = {};
const q = (s) => `document.querySelector(${JSON.stringify(s)})`;

await b.load(`${b.base}/?capture=1`);
out.title = await b.ev('document.title');
out.recordBtn = await b.ev(`(() => { const e = ${q('.record-btn')}; const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, focused: document.activeElement === e }; })()`);
await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await sleep(200);
out.hScroll360 = await b.ev('document.documentElement.scrollWidth > document.documentElement.clientWidth');

const submit = (text) => b.ev(`(() => { const f = document.getElementById('thought-text'); f.value = ${JSON.stringify(text)}; f.dispatchEvent(new Event('input')); f.form.requestSubmit(); })()`);
await submit('remind me to pay rent');           // reminder, no time -> case 2, no key -> marker
await sleep(400);
out.status = await b.ev(`document.getElementById('capture-status').textContent`);
out.questionBoxHidden = await b.ev(`${q('.clarify')}.hidden`);
await submit('buy milk tomorrow');
await sleep(300);
await submit('what if the app let people share lists');
await sleep(300);
await submit('   ');
out.emptyStatus = await b.ev(`document.getElementById('capture-status').textContent`);

await b.ev(`location.hash = '#/inbox'`); await sleep(500);
out.inbox = await b.ev(`${q('.app-main')}.innerText`);
out.searchHits = await b.ev(`(() => { const s = document.getElementById('search'); s.value = 'MILK'; s.dispatchEvent(new Event('input')); return document.querySelectorAll('.thought-item').length; })()`);
out.searchNone = await b.ev(`(() => { const s = document.getElementById('search'); s.value = 'zzzz'; s.dispatchEvent(new Event('input')); return ${q('.empty')}.textContent; })()`);

// task done toggle from the list
await b.ev(`location.hash = '#/type/task'`); await sleep(400);
await b.ev(`${q('.done-toggle input')}.click()`); await sleep(300);
out.taskDone = await b.ev(`${q('.thought-item')}.classList.contains('is-done')`);

// detail: edit, expand gate, delete
await b.ev(`location.hash = '#/type/idea'`); await sleep(400);
await b.ev(`${q('.thought-title a')}.click()`); await sleep(500);
out.detailHead = await b.ev(`${q('.detail h2')}.textContent`);
out.expandGate = await b.ev(`${q('.detail .section button')}.textContent`);
await b.ev(`(() => { const t = document.getElementById('f-title'); t.value = 'Shared lists'; const g = document.getElementById('f-tags'); g.value = 'Lists, sharing, LISTS'; t.form.requestSubmit(); })()`);
await sleep(400);
await b.load(`${b.base}/#/inbox`);
out.afterEditReload = await b.ev(`Array.from(document.querySelectorAll('.thought-item')).map((e) => e.innerText.replace(/\\n+/g, ' | '))`);
await b.ev(`location.hash = '#/type/idea'`); await sleep(400);
await b.ev(`${q('.thought-title a')}.click()`); await sleep(400);
await b.ev(`${q('.btn--danger')}.click()`); await sleep(100);
await b.ev(`${q('[data-kind=confirm-delete]')}.click()`); await sleep(500);
out.afterDelete = await b.ev(`location.hash + ' / ' + document.querySelectorAll('.thought-item').length`);
for (const h of ['#/settings', '#/about', '#/review']) {
  await b.ev(`location.hash = '${h}'`); await sleep(400);
  out[h] = (await b.ev(`${q('.app-main')}.innerText`)).slice(0, 60).replace(/\n/g, ' | ');
}
// review on open (M7): an old idea is due; a plain open shows the review, a home-screen launch stays on capture
await b.ev(`new Promise((res) => { const r = indexedDB.open('thought-catcher'); r.onsuccess = () => {
  const tx = r.result.transaction('thoughts', 'readwrite'); const st = tx.objectStore('thoughts');
  const old = new Date(Date.now() - 5 * 86400000).toISOString();
  st.put({ id: 'old-idea', text: 'an old idea about gardens', type: 'idea', title: 'Old garden idea', tags: [], created_at: old, updated_at: old, source: 'typed',
    sort: { by: 'rules', confidence: 1, alt_type: null, model: null }, due_at: null, done: false, done_at: null,
    clarify: { state: 'none', case: null, question: null, answer: null }, expansion: null, review: { last_reviewed_at: null, snoozed_until: null, dismissed: false } });
  tx.oncomplete = () => res(true); }; })`);
await b.load(`${b.base}/?capture=1`);
out.captureLaunchHash = await b.ev(`location.hash || '(none)'`);
out.captureLaunchNudge = await b.ev(`${q('.review-nudge')}?.innerText ?? null`);
out.navReview = await b.ev(`${q('a[data-route=review]')}.textContent`);
await b.ev(`localStorage.removeItem('thought-catcher.review.last_shown_date')`);
await b.load(`${b.base}/`);
out.plainOpenHash = await b.ev(`location.hash`);
out.plainOpenText = (await b.ev(`${q('.app-main')}.innerText`)).slice(0, 60).replace(/\n/g, ' | ');
// G5: the manifest shortcut "Record a thought" (?capture=1&record=1) focuses the record button and says to tap it
await b.load(`${b.base}/?capture=1&record=1`);
await b.until(`Boolean(document.getElementById('capture-status'))`);
out.recordShortcut = await b.ev(`({ focused: document.activeElement === ${q('.record-btn')}, status: document.getElementById('capture-status').textContent })`);
// G1: a key saved for Anthropic is removed when the person switches provider and saves without typing a new key
await b.ev(`localStorage.setItem('thought-catcher.ai-key', 'sk-ant-SWITCH-TEST'); localStorage.setItem('thought-catcher.ai-key-binding', JSON.stringify({ provider: 'anthropic', host: 'api.anthropic.com' })); localStorage.setItem('thought-catcher.ai.provider', JSON.stringify('anthropic'))`);
await b.ev(`localStorage.setItem('thought-catcher.review.last_shown_date', JSON.stringify(new Date().toLocaleDateString('en-CA')))`); // keep the daily review out of the way
await b.load(`${b.base}/#/settings`, 900);
out.hintSameProvider = await b.ev(`document.getElementById('s-key-hint').textContent.slice(0, 60)`);
await b.ev(`(() => { const p = document.getElementById('s-provider'); p.value = 'openai'; p.dispatchEvent(new Event('change')); })()`);
out.hintAfterSwitch = await b.ev(`document.getElementById('s-key-hint').textContent.slice(0, 90)`);
await b.ev(`(() => { document.getElementById('s-model').value = 'm'; document.getElementById('s-base').value = 'https://openrouter.ai/api/v1'; document.getElementById('s-provider').form.requestSubmit(); })()`);
await sleep(300);
out.afterSave = await b.ev(`({ key: localStorage.getItem('thought-catcher.ai-key'), binding: localStorage.getItem('thought-catcher.ai-key-binding'), status: document.getElementById('s-ai-status').textContent })`);
// the words "null" and "undefined" must never appear as page text on any screen
const leaks = [];
for (const h of ['#/capture', '#/inbox', '#/type/idea', '#/type/task', '#/review', '#/settings', '#/about']) {
  await b.ev(`location.hash = '${h}'`); await sleep(400);
  if (await b.ev(`/\\b(null|undefined)\\b/.test(${q('.app-main')}.innerText)`)) leaks.push(h);
}
out.nullTextOn = leaks;
console.log(JSON.stringify(out, null, 2));
console.log('PROBLEMS', JSON.stringify(b.problems, null, 2));
console.log('NON-LOCAL', JSON.stringify(b.network.filter((u) => !u.startsWith(b.base) && !/^(data|blob):/.test(u))));
console.log('404s', JSON.stringify(b.requests.filter((r) => r.status === 404).map((r) => r.url)));
await b.close();
process.exit(b.problems.length || leaks.length ? 1 : 0);
