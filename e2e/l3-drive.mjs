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
console.log(JSON.stringify(out, null, 2));
console.log('PROBLEMS', JSON.stringify(b.problems, null, 2));
console.log('NON-LOCAL', JSON.stringify(b.network.filter((u) => !u.startsWith(b.base) && !/^(data|blob):/.test(u))));
console.log('404s', JSON.stringify(b.requests.filter((r) => r.status === 404).map((r) => r.url)));
await b.close();
process.exit(b.problems.length ? 1 : 0);
