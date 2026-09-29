// Builder check of the AI paths against a mock OpenAI-compatible endpoint served by the driver.
// Usage (outside the Bash sandbox): node e2e/l3-ai-drive.mjs
import { launch, sleep } from './lib/cdp.mjs';

const mode = { sort: 'ok', delaySort: 0, answer: 'ok', expand: 'ok', auth: false };
const reply = (res, obj, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const completion = (json) => ({ choices: [{ message: { content: typeof json === 'string' ? json : JSON.stringify(json) } }] });

const b = await launch({
  apiHandler: async (req, res, body) => {
    if (mode.auth) { reply(res, { error: { message: 'bad key' } }, 401); return; }
    const sys = JSON.parse(body).messages[0].content;
    if (sys.startsWith('You sort one')) {
      if (mode.delaySort) await sleep(mode.delaySort);
      if (mode.sort === 'bad') { reply(res, completion('this is not json')); return; }
      // "remind me to pay rent" comes back as an ambiguous reminder without a time; anything else is a clear idea
      const note = JSON.parse(body).messages[1].content;
      if (/pay rent/.test(note)) reply(res, completion({ type: 'reminder', alt_type: 'task', confidence: 0.9, title: 'Pay rent', tags: ['rent'], due_at: null }));
      else reply(res, completion({ type: 'idea', alt_type: null, confidence: 0.95, title: 'AI title', tags: ['ai'], due_at: null }));
    } else if (sys.startsWith('You update how')) {
      reply(res, completion({ type: 'task', title: 'Pay rent (task)', tags: ['rent'], due_at: null }));
    } else if (sys.startsWith('You help develop')) {
      if (mode.expand === 'bad') { reply(res, completion('nope')); return; }
      reply(res, completion({ next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'] }));
    } else reply(res, { error: 'unknown' }, 400);
  },
});
const out = {};
const q = (s) => `document.querySelector(${JSON.stringify(s)})`;
const submit = (text) => b.ev(`(() => { const f = document.getElementById('thought-text'); f.value = ${JSON.stringify(text)}; f.dispatchEvent(new Event('input')); f.form.requestSubmit(); })()`);

await b.load(`${b.base}/`);
await b.ev(`(() => {
  localStorage.setItem('thought-catcher.ai.provider', JSON.stringify('openai'));
  localStorage.setItem('thought-catcher.ai.base_url', JSON.stringify(location.origin + '/v1'));
  localStorage.setItem('thought-catcher.ai.model', JSON.stringify('mock'));
  localStorage.setItem('thought-catcher.ai-key', 'sk-test-KEY-123');
})()`);
await b.load(`${b.base}/#/capture`);

// 1. AI sort + one question, answered by text (case 2 with a time parses locally, so answer with a word first)
const t0 = Date.now();
await submit('remind me to pay rent');
out.savedMs = await b.until(`document.getElementById('capture-status').textContent.startsWith('Saved')`) ? Date.now() - t0 : null;
out.questionShown = await b.until(`${q('.clarify')} && !${q('.clarify')}.hidden`);
out.question = await b.ev(`${q('.clarify-q')}?.textContent`);
out.skipVisible = await b.ev(`Boolean(${q('#clarify-skip')})`);
await b.ev(`(() => { const i = document.getElementById('clarify-answer'); i.value = 'tomorrow at 9am'; i.form.requestSubmit(); })()`);
await b.until(`${q('.clarify')}.hidden`);
out.afterAnswer = await b.ev(`document.getElementById('capture-status').textContent`);

// 2. clear idea: no question, AI sort applied
await submit('what if the app let people share lists');
await b.until(`document.getElementById('capture-status').textContent.startsWith('Sorted by AI')`);
out.ideaStatus = await b.ev(`document.getElementById('capture-status').textContent`);
out.ideaQuestion = await b.ev(`!${q('.clarify')}.hidden`);

// 2b. slow provider (AC-M3.5): the thought is stored within 1 s while the AI is still thinking
mode.delaySort = 4000;
const t1 = Date.now();
await submit('what if we had a shared shopping list');
out.slowSavedMs = await b.until(`document.getElementById('capture-status').textContent.startsWith('Saved')`, 3000) ? Date.now() - t1 : null;
out.slowStoredNow = await b.ev(`new Promise((res) => { const r = indexedDB.open('thought-catcher'); r.onsuccess = () => { const g = r.result.transaction('thoughts').objectStore('thoughts').getAll(); g.onsuccess = () => res(g.result.filter((t) => t.text.includes('shared shopping list')).map((t) => t.sort.by)); }; })`);
await b.until(`document.getElementById('capture-status').textContent.startsWith('Sorted by AI')`, 6000);
mode.delaySort = 0;
out.slowAfterAi = await b.ev(`document.getElementById('capture-status').textContent`);

// 3. malformed AI reply: saved rule-sorted, thought not lost
mode.sort = 'bad';
await submit('buy bread tomorrow');
await sleep(800);
mode.sort = 'ok';
out.malformedStatus = await b.ev(`document.getElementById('capture-status').textContent`);

// 4. 401 shows "key rejected" once, thought still saved
mode.auth = true;
await submit('call the dentist');
await sleep(800);
out.authStatus1 = await b.ev(`document.getElementById('capture-status').textContent`);
await submit('call the plumber');
await sleep(800);
out.authStatus2 = await b.ev(`document.getElementById('capture-status').textContent`);
mode.auth = false;

// 5. expand on the idea: gate, result, persisted after reload, error keeps the idea
await b.ev(`location.hash = '#/type/idea'`); await sleep(500);
await b.ev(`${q('.thought-title a')}.click()`); await sleep(500);
await b.ev(`${q('[data-kind=expand]')}.click()`);
out.expandShown = await b.until(`document.body.innerText.includes('Questions to answer')`);
await b.load(`${b.base}/#/type/idea`);
await b.ev(`${q('.thought-title a')}.click()`); await sleep(500);
out.expandAfterReload = await b.ev(`document.body.innerText.includes('Questions to answer') && document.body.innerText.includes('Regenerate')`);
mode.expand = 'bad';
await b.ev(`${q('[data-kind=expand]')}.click()`);
await b.until(`${q('.capture-status')}.textContent.startsWith('Could not')`);
out.expandError = await b.ev(`${q('.capture-status')}.textContent`);
out.expandStillThere = await b.ev(`document.body.innerText.includes('Questions to answer')`);

// 6. what left the machine: only the mock host, key only in that host's Authorization header
out.apiCalls = b.requests.filter((r) => r.method === 'POST').length;
out.bodyHasKey = b.requests.some((r) => (r.body ?? '').includes('sk-test-KEY-123'));
out.nonLocal = b.network.filter((u) => !u.startsWith(b.base) && !/^(data|blob):/.test(u));

// 7. no key: the same controls show the gate
// a local base URL needs no key (AC-M8.1), so "no key" means no provider here
await b.ev(`localStorage.removeItem('thought-catcher.ai-key'); localStorage.setItem('thought-catcher.ai.provider', JSON.stringify('none'))`);
await b.send('Page.reload'); await sleep(900);
await b.ev(`location.hash = '#/type/idea'`); await sleep(500);
await b.ev(`${q('.thought-title a')}.click()`); await sleep(500);
out.noKeyExpand = await b.ev(`${q('.detail .section button')}.textContent`);
console.log(JSON.stringify(out, null, 2));
console.log('PROBLEMS', JSON.stringify(b.problems, null, 2));
await b.close();
process.exit(0);
