// End-to-end flows for Thought Catcher: AI (mocked provider), settings, export/import, detail, review, About, PWA/offline,
// accessibility approximations. Zero dependencies. Run outside the Bash sandbox: node e2e/flows.mjs
// The provider is mocked in the page (window.fetch is replaced for api.anthropic.com before any app script runs), so no
// request leaves the machine and no real key is used. Each section is independent: one failing section does not stop the rest.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, openChrome, check, pending, finish, sleep, isFavicon } from './l4-harness.mjs';

const server = await startServer();
const { base, origin } = server;
const KEY = 'sk-ant-SMOKE-TEST-KEY-0000';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-flows-'));

const MOCK = `(() => {
  const M = window.__mock = { calls: [], mode: 'ok', delay: 0, expandMode: 'ok', sortReply: null };
  const real = window.fetch.bind(window);
  const reply = (obj) => new Response(JSON.stringify({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }), { status: 200 });
  window.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!/^https:\\/\\/api\\.anthropic\\.com\\//.test(u)) return real(url, init);
    const body = JSON.parse(init.body);
    const user = body.messages[0].content;
    const kind = body.max_tokens === 8 ? 'test' : user.startsWith('Idea:') ? 'expand' : user.includes('Answer:') ? 'clarify' : 'sort';
    M.calls.push({ url: u, kind, key: init.headers['x-api-key'], bodyHasKey: init.body.includes(init.headers['x-api-key'] || '\\u0000'), direct: init.headers['anthropic-dangerous-direct-browser-access'] });
    if (M.delay) await new Promise((r) => setTimeout(r, M.delay));
    if (M.mode === '401') return new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status: 401 });
    if (M.mode === 'malformed') return reply('I cannot help with that.');
    if (kind === 'test') return reply('ok');
    if (kind === 'expand') return M.expandMode === 'bad' ? reply({ next_steps: [] }) : reply({ next_steps: ['Sketch it', 'Ask three people', 'Build a demo'], questions: ['Who is it for?', 'What exists?', 'What is the cost?'], outline: ['Problem', 'Idea', 'Plan'] });
    if (kind === 'clarify') return reply({ type: 'reminder', title: 'Call the dentist', tags: ['dentist'], due_at: new Date(Date.now() + 86400000).toISOString() });
    return reply(M.sortReply || { type: 'idea', alt_type: null, confidence: 0.9, title: 'AI sorted title', tags: ['ai'], due_at: null });
  };
})();`;

const SPEECH = `(() => {
  const S = window.__speech = { mode: 'text', transcript: 'buy oat milk tomorrow', starts: 0 };
  class FakeRecognition {
    start() {
      S.starts += 1;
      if (S.mode === 'denied') { setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 30); return; }
      if (S.mode === 'text') setTimeout(() => this.onresult?.({ results: [[{ transcript: S.transcript }]] }), 60);
    }
    stop() { setTimeout(() => this.onend?.(), 20); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
})();`;

const mock = (p, patch) => p.ev(`Object.assign(window.__mock, ${JSON.stringify(patch)})`);
const calls = (p, kind) => p.ev(`window.__mock.calls.filter((c) => ${kind ? `c.kind === ${JSON.stringify(kind)}` : 'true'}).length`);
const hasKey = (p) => p.ev(`localStorage.getItem('thought-catcher.ai-key')`);

async function capture(p, text) {
  await p.route('#/capture');
  await p.waitFor(`!!document.getElementById('thought-text')`);
  await p.ev(`(() => { const f = document.getElementById('thought-text'); f.value = ${JSON.stringify(text)}; f.dispatchEvent(new Event('input')); f.form.requestSubmit(); })()`);
  // The status line can already show the AI result, so wait for the stored record instead.
  return p.waitFor(`(async () => (await (await import('/src/storage/idb.js')).createIdbStore(indexedDB).then((s) => s.getAll())).some((t) => t.text === ${JSON.stringify(text)}))()`);
}
async function openDetail(p, titlePart) {
  await p.route('#/inbox');
  await p.waitFor(`document.querySelectorAll('.thought-item').length > 0`);
  const ok = await p.ev(`(() => { const a = [...document.querySelectorAll('.thought-title a')].find((x) => x.textContent.toLowerCase().includes(${JSON.stringify(titlePart.toLowerCase())})); if (!a) return false; a.click(); return true; })()`);
  await p.waitFor(`!!document.querySelector('.detail')`);
  return ok;
}
const buttonWith = (p, re) => p.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => ${re}.test(x.textContent)); return b ? { text: b.textContent, disabled: b.disabled, aria: b.getAttribute('aria-disabled'), busy: b.getAttribute('aria-busy') } : null; })()`);
const clickButton = (p, re) => p.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => ${re}.test(x.textContent)); b.click(); return !!b; })()`);

async function section(name, fn) {
  try { await fn(); } catch (err) { check(`${name}: section ran to the end`, false, (err.stack ?? String(err)).split('\n').slice(0, 2).join(' | ')); }
}

const p = await openChrome();
try {
  await p.viewport({ width: 1280, height: 800 });
  await p.addInit(MOCK);
  await p.addInit(SPEECH);
  await p.goto(`${base}/?capture=1`);
  await p.waitFor(`!!document.querySelector('.record-btn')`);
  // choose "type instead" once so the voice panel does not get in the way
  await p.ev(`localStorage.setItem('thought-catcher.speech.engine', '"typing"')`);

  // ---------- F1: no key ----------
  await section('no key', async () => {
    check('no key: capture saves a thought', await capture(p, 'call the dentist'));
    await sleep(400);
    check('AC-M4.6: no key, no question is shown', await p.ev(`document.querySelector('.clarify')?.hidden !== false`));
    await capture(p, 'what if the app let people share lists');
    await capture(p, 'buy milk tomorrow');
    await capture(p, 'today was tiring but good');
    await p.route('#/inbox');
    await p.waitFor(`document.querySelectorAll('.thought-item').length === 4`);
    const markers = await p.ev(`[...document.querySelectorAll('.thought-item')].map((li) => li.querySelector('.marker')?.textContent ?? '')`);
    check('AC-M4.6: the ambiguous thought shows "needs a key to clarify" in the inbox', markers.some((m) => /needs a key to clarify/.test(m)), JSON.stringify(markers));
    check('AC-M8 no key: thoughts are marked "sorted by rules"', markers.every((m) => /sorted by rules/.test(m)), JSON.stringify(markers));
    check('AC-M8.3: with no key no request goes to any provider', (await calls(p)) === 0);

    await openDetail(p, 'share lists');
    const ex = await buttonWith(p, '/Expand/');
    check('AC-M6.5: Expand on an idea is visible, marked "needs a key", not hidden', !!ex && /needs a key/.test(ex.text), JSON.stringify(ex));
    await clickButton(p, '/Expand/');
    await sleep(200);
    check('AC-M6.5: pressing it opens Settings', (await p.ev('location.hash')) === '#/settings');
    const rs = await (async () => { await openDetail(p, 'share lists'); return buttonWith(p, '/Re-sort/'); })();
    check('re-sort with AI is visible and marked "needs a key" without a key', !!rs && /needs a key/.test(rs.text), JSON.stringify(rs));
    await openDetail(p, 'buy milk');
    check('AC-M6.1: no Expand control on a task', (await buttonWith(p, '/Expand/')) === null);
    await openDetail(p, 'tiring');
    check('AC-M6.1: no Expand control on a journal entry', (await buttonWith(p, '/Expand/')) === null);
  });

  // ---------- F2: settings ----------
  await section('settings', async () => {
    await p.route('#/settings');
    await p.waitFor(`!!document.getElementById('s-provider')`);
    const f = await p.ev(`({ provider: !!document.getElementById('s-provider'), keyType: document.getElementById('s-key')?.type, model: !!document.getElementById('s-model'), baseHidden: document.getElementById('s-base')?.closest('.field')?.hidden, options: [...document.getElementById('s-provider').options].map((o) => o.value) })`);
    check('AC-M8.1: provider choice, masked key field, model field', f.provider && f.keyType === 'password' && f.model, JSON.stringify(f));
    check('AC-M8.1: base URL field is hidden for Anthropic and offered for OpenAI-compatible', f.baseHidden === true && (await (async () => {
      await p.ev(`(() => { const s = document.getElementById('s-provider'); s.value = 'openai'; s.dispatchEvent(new Event('change')); })()`);
      const shown = await p.ev(`document.getElementById('s-base').closest('.field').hidden === false`);
      await p.ev(`(() => { const s = document.getElementById('s-provider'); s.value = 'anthropic'; s.dispatchEvent(new Event('change')); })()`);
      return shown;
    })()));
    await p.ev(`(() => { const s = document.getElementById('s-provider'); s.value = 'anthropic'; s.dispatchEvent(new Event('change')); })()`);
    await p.type('#s-key', KEY);
    await p.ev(`document.querySelector('#s-provider').form.requestSubmit()`);
    await sleep(200);
    check('AC-M8.2: saving stores the key on the device', (await hasKey(p)) === KEY);
    await p.goto(`${base}/#/settings`);
    await p.waitFor(`!!document.getElementById('s-provider')`);
    const after = await p.ev(`({ provider: document.getElementById('s-provider').value, keyField: document.getElementById('s-key').value, keyKept: !!localStorage.getItem('thought-catcher.ai-key') })`);
    check('AC-M8.2: settings persist after reload and the key is not written back into the page', after.provider === 'anthropic' && after.keyField === '' && after.keyKept, JSON.stringify({ ...after, keyField: after.keyField ? '<set>' : '' }));
    const idbText = JSON.stringify(await p.idbAll());
    const sess = await p.ev(`JSON.stringify(Object.assign({}, sessionStorage))`);
    check('AC-M8.2: the key is only in localStorage, not in IndexedDB thoughts or sessionStorage', !idbText.includes(KEY) && !sess.includes(KEY));
    await p.ev(`Object.assign(window.__mock || {}, {})`);
  });

  // ---------- F3: AI sort, question, answer, skip ----------
  await section('ai sort and question', async () => {
    await mock(p, { mode: 'ok', sortReply: { type: 'reminder', alt_type: null, confidence: 0.9, title: 'Call the dentist', tags: ['dentist'], due_at: null } });
    const t0 = Date.now();
    await capture(p, 'call the dentist please');
    const savedMs = Date.now() - t0;
    check('AC-M3.5 / M3 flow: the rule-sorted thought is stored at once', (await p.idbAll()).some((t) => t.text === 'call the dentist please') && savedMs < 1000, `${savedMs} ms`);
    check('AC-M4.1: the AI sort result is applied to the record (AC-M3.3)', await p.waitFor(`(async () => (await (await import('/src/storage/idb.js')).createIdbStore(indexedDB).then((s) => s.getAll())).some((t) => t.text === 'call the dentist please' && t.sort.by === 'ai' && t.type === 'reminder'))()`));
    const q = await p.waitFor(`document.getElementById('clarify-q') && !document.querySelector('.clarify').hidden`);
    const qText = await p.text('#clarify-q');
    check('AC-M4.1: an ambiguous thought gets a question after save', q, qText);
    check('AC-M4.7: the question is one sentence of at most 20 words', !!qText && qText.trim().split(/\s+/).length <= 20 && /\?$/.test(qText.trim()), qText);
    check('AC-M4.3: Skip is visible with the question', await p.ev(`(() => { const b = document.getElementById('clarify-skip'); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`));
    check('AC-M4.5: a Speak control is offered next to the text answer', !!(await buttonWith(p, '/Speak/')));
    await p.type('#clarify-answer', 'tomorrow at 9am');
    await p.ev(`document.getElementById('clarify-answer').form.requestSubmit()`);
    check('AC-M4.4: a text answer updates the record', await p.waitFor(`(async () => (await (await import('/src/storage/idb.js')).createIdbStore(indexedDB).then((s) => s.getAll())).some((t) => t.text === 'call the dentist please' && t.clarify.state === 'answered' && t.due_at))()`), (await p.idbAll()).filter((t) => t.text === 'call the dentist please').map((t) => `${t.clarify.state}/${t.due_at}`).join());
    check('AC-M4.2: after the answer no second question appears', await p.ev(`document.querySelector('.clarify').hidden === true`));

    await capture(p, 'call the dentist again');
    await p.waitFor(`document.getElementById('clarify-skip')`);
    await p.click('#clarify-skip');
    await sleep(300);
    const skipped = (await p.idbAll()).find((t) => t.text === 'call the dentist again');
    check('AC-M4.3: Skip stores the thought with the best guess and closes the question', skipped.clarify.state === 'skipped' && (await p.ev(`document.querySelector('.clarify').hidden`)) === true, skipped.clarify.state);
    await sleep(600);
    check('AC-M4.2: after Skip no second question appears', await p.ev(`document.querySelector('.clarify').hidden === true`));

    await capture(p, 'call the dentist third');
    await p.waitFor(`document.getElementById('clarify-skip')`);
    await p.route('#/inbox');
    await p.goto(`${base}/#/inbox`);
    await p.waitFor(`document.querySelectorAll('.thought-item').length > 0`);
    const third = (await p.idbAll()).find((t) => t.text === 'call the dentist third');
    check('AC-M4.8: leaving with a question open keeps the thought; on reopen it is unresolved and not asked again', !!third && ['skipped'].includes(third.clarify.state) && /unresolved/.test(await p.ev(`document.body.innerText`)), third?.clarify.state);
    await p.route('#/capture');
    await sleep(500);
    check('AC-M4.8: no question box after reopening the capture screen', await p.ev(`document.querySelector('.clarify')?.hidden !== false`));
  });

  // ---------- F4: 401, malformed, hang ----------
  await section('ai failures', async () => {
    await p.goto(`${base}/?capture=1`);
    await p.waitFor(`!!document.getElementById('thought-text')`);
    await mock(p, { mode: '401', delay: 0 });
    await capture(p, 'buy bread today');
    check('AC-M8.6: a 401 shows "key rejected"', await p.waitFor(`/key rejected/.test(document.getElementById('capture-status').textContent)`));
    check('AC-M8.6: the thought is still saved, rule-sorted', (await p.idbAll()).some((t) => t.text === 'buy bread today' && t.sort.by === 'rules'));
    await capture(p, 'buy eggs today');
    await sleep(700);
    check('AC-M8.6: "key rejected" is shown once, not on every save', !/key rejected/.test(await p.text('#capture-status')), await p.text('#capture-status'));

    await mock(p, { mode: 'malformed' });
    await capture(p, 'what if we built a lighthouse game');
    await sleep(700);
    const mal = (await p.idbAll()).find((t) => t.text === 'what if we built a lighthouse game');
    check('AC-M3.3: a malformed AI reply keeps the rule result and the thought', !!mal && mal.sort.by === 'rules' && mal.title.length > 0, mal?.sort.by);
    check('AC-M3.3: the user is told the reply was not usable', /not usable|unchanged|went wrong/i.test(await p.text('#capture-status')), await p.text('#capture-status'));

    await mock(p, { mode: 'ok', delay: 10000 });
    const t0 = Date.now();
    await capture(p, 'pay the electricity bill now');
    const stored = (await p.idbAll()).some((t) => t.text === 'pay the electricity bill now');
    const ms = Date.now() - t0;
    check('AC-M3.5: with a 10 s provider delay the thought is saved within 1 s', stored && ms < 1000, `${ms} ms`);
    check('AC-M3.5: capture stays usable while the AI call is pending', await p.ev(`!document.querySelector('button[type=submit]').disabled && !document.getElementById('thought-text').disabled`));
    await capture(p, 'send the invoice to Anna');
    check('AC-M3.5: a second thought saves while the first AI call is still pending', (await p.idbAll()).some((t) => t.text === 'send the invoice to Anna'));
    await mock(p, { delay: 0, mode: 'ok' });
  });

  // ---------- F5: expand ----------
  await section('expand', async () => {
    await p.goto(`${base}/#/inbox`);
    await p.waitFor(`document.querySelectorAll('.thought-item').length > 0`);
    await mock(p, { mode: 'ok', delay: 700, expandMode: 'ok' });
    await openDetail(p, 'share lists');
    check('AC-M6.1: Expand appears on an idea when a key is set', !!(await buttonWith(p, '/^Expand$/')));
    await clickButton(p, '/^Expand$/');
    await sleep(120);
    const busy = await buttonWith(p, '/Working/');
    check('AC-M6.6: a loading state is shown and the control is disabled while waiting', !!busy && busy.disabled && busy.busy === 'true', JSON.stringify(busy));
    const done = await p.waitFor(`document.querySelectorAll('.detail h4').length === 3`, 4000);
    const heads = await p.ev(`[...document.querySelectorAll('.detail h4')].map((h) => h.textContent)`);
    check('AC-M6.2: three labelled sections: next steps, questions to answer, outline', done && heads.join('|') === 'Next steps|Questions to answer|Outline', heads.join('|'));
    check('AC-M6.2: the result is stored on the record', (await p.idbAll()).some((t) => t.text.includes('share lists') && t.expansion?.next_steps?.length === 3));
    await p.ev(`window.__mock.calls.length = 0`);
    await p.goto(`${base}/#/inbox`);
    await openDetail(p, 'share lists');
    check('AC-M6.2: after reload the expansion is shown again without a new call', (await p.ev(`document.querySelectorAll('.detail h4').length`)) === 3 && (await calls(p, 'expand')) === 0);
    check('AC-M6.3: pressing Expand again is offered as Regenerate', !!(await buttonWith(p, '/^Regenerate$/')));
    const before = JSON.stringify((await p.idbAll()).find((t) => t.text.includes('share lists')).expansion);
    await mock(p, { mode: 'ok', delay: 0, expandMode: 'bad' });
    await clickButton(p, '/^Regenerate$/');
    check('AC-M6.4: a bad reply shows an error message', await p.waitFor(`/Could not do that/.test(document.querySelector('.detail .capture-status')?.textContent ?? '')`), await p.text('.detail .capture-status'));
    check('AC-M6.3 / M6.4: the stored expansion is unchanged after a failed regenerate and the idea is intact', JSON.stringify((await p.idbAll()).find((t) => t.text.includes('share lists')).expansion) === before);
    check('AC-M6.4: the user can retry', !!(await buttonWith(p, '/Retry/')));
    await mock(p, { expandMode: 'ok' });
    await clickButton(p, '/Retry/');
    check('AC-M6.4: retry succeeds', await p.waitFor(`/Expanded/.test(document.querySelector('.detail .capture-status')?.textContent ?? '')`));
    await mock(p, { mode: 'ok', delay: 0, expandMode: 'ok', sortReply: null });
  });

  // ---------- F6: test connection ----------
  await section('test connection', async () => {
    await p.route('#/settings');
    await p.waitFor(`!!document.getElementById('s-provider')`);
    await mock(p, { mode: 'ok', delay: 0 });
    await clickButton(p, '/Test connection/');
    check('AC-M8.4: Test connection shows success', await p.waitFor(`/Connection works/.test(document.getElementById('s-ai-status').textContent)`), await p.text('#s-ai-status'));
    await mock(p, { mode: '401' });
    await clickButton(p, '/Test connection/');
    check('AC-M8.4: Test connection shows the provider error', await p.waitFor(`/Key rejected/.test(document.getElementById('s-ai-status').textContent)`), await p.text('#s-ai-status'));
    const all = await p.ev(`window.__mock.calls`);
    check('AC-M8.2: every provider request went to api.anthropic.com with the key in the header only', all.length > 0 && all.every((c) => c.url.startsWith('https://api.anthropic.com/') && c.key === KEY && !c.bodyHasKey && c.direct === 'true'), `${all.length} calls`);
    await mock(p, { mode: 'ok' });
  });

  // ---------- F7: export / import / delete ----------
  await section('data', async () => {
    await p.goto(`${base}/#/settings`);
    await p.waitFor(`!!document.getElementById('s-import')`);
    await p.ev(`window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push(this.download); }; window.__blobs = []; const orig = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return orig(b); };`);
    const before = (await p.idbAll()).sort((a, b) => a.id.localeCompare(b.id));
    await clickButton(p, '/Export all thoughts/');
    await p.waitFor(`window.__blobs.length === 1`);
    const text = await p.ev(`window.__blobs[0].text()`);
    check('AC-M9.3 / M8.5: the export contains no key', !text.includes(KEY) && !/sk-ant/.test(text));
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = null; }
    check('AC-M9.3: one JSON file with format, version, timestamp and all thoughts intact', !!parsed && parsed.format === 'thought-catcher-export' && parsed.version === 1 && !!Date.parse(parsed.exported_at) && JSON.stringify([...parsed.thoughts].sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(before), `${parsed?.thoughts?.length} of ${before.length}`);
    const dl = await p.ev(`window.__dl`);
    check('AC-M9.3: the download is named thought-catcher-YYYY-MM-DD.json', dl.length === 1 && /^thought-catcher-\d{4}-\d{2}-\d{2}\.json$/.test(dl[0]), JSON.stringify(dl));
    const file = path.join(tmp, 'export.json');
    fs.writeFileSync(file, text);

    // cancel keeps data
    await clickButton(p, '/Delete all data/');
    await clickButton(p, '/^Cancel$/');
    check('AC-M9.7: cancelling the confirmation keeps everything', (await p.idbAll()).length === before.length);
    await clickButton(p, '/Delete all data/');
    check('AC-M9.7: delete all asks for confirmation', await p.ev(`/cannot be undone/.test(document.body.innerText)`));
    await clickButton(p, '/Yes, delete everything/');
    await p.waitFor(`/All data deleted/.test(document.body.innerText)`);
    check('AC-M9.7: delete all empties the store and removes the key and settings', (await p.idbAll()).length === 0 && (await hasKey(p)) === null && (await p.ev(`Object.keys(localStorage).filter((k) => k.startsWith('thought-catcher.')).length`)) === 0);

    await p.setFiles('#s-import', [file]);
    check('AC-M9.4 / M9.6: import restores every thought', await p.waitFor(`/Added ${before.length}, skipped 0/.test(document.body.innerText)`), await p.text('#s-import + .hint, .hint[role=status]'));
    const restored = (await p.idbAll()).sort((a, b) => a.id.localeCompare(b.id));
    check('AC-M9.6: round trip through the real UI: record set deep-equals the original', JSON.stringify(restored) === JSON.stringify(before), `${restored.length}/${before.length}`);
    await p.setFiles('#s-import', [file]);
    check('AC-M9.4: importing into a non-empty store merges without duplicates and reports counts', await p.waitFor(`/Added 0, skipped ${before.length}/.test(document.body.innerText)`) && (await p.idbAll()).length === before.length);

    const bad = [['notjson.json', 'this is not json'], ['wrongversion.json', JSON.stringify({ ...parsed, version: 2 })], ['missing.json', JSON.stringify({ ...parsed, thoughts: [{ id: 'x' }] })]];
    for (const [name, body] of bad) {
      const f = path.join(tmp, name); fs.writeFileSync(f, body);
      await p.setFiles('#s-import', [f]);
      check(`AC-M9.5: invalid file (${name}) shows an error and changes nothing`, await p.waitFor(`/Nothing was imported/.test(document.body.innerText)`) && (await p.idbAll()).length === before.length);
      await p.ev(`(() => { const h = document.querySelector('.hint[role=status]'); })()`);
    }
    // put the key back for later sections
    await p.ev(`localStorage.setItem('thought-catcher.ai-key', ${JSON.stringify(KEY)}); localStorage.setItem('thought-catcher.ai.provider', '"anthropic"'); localStorage.setItem('thought-catcher.speech.engine', '"typing"')`);
  });

  // ---------- F8: key removal ----------
  await section('key removal', async () => {
    await p.goto(`${base}/#/settings`);
    await p.waitFor(`!!document.getElementById('s-provider')`);
    await clickButton(p, '/Remove key/');
    await sleep(150);
    check('AC-M8.3: Remove key deletes it from storage', (await hasKey(p)) === null);
    await p.route('#/capture');
    await p.waitFor(`!!document.getElementById('thought-text')`);
    await p.ev(`window.__mock.calls.length = 0`);
    await capture(p, 'buy bread again');
    await sleep(500);
    const t = (await p.idbAll()).find((x) => x.text === 'buy bread again');
    check('AC-M8.3: after removal a sort uses the rule path and makes no provider call', !!t && t.sort.by === 'rules' && (await calls(p)) === 0);
    await p.ev(`localStorage.setItem('thought-catcher.ai-key', ${JSON.stringify(KEY)})`);
  });

  // ---------- F9: detail edit, delete, done ----------
  await section('detail', async () => {
    await p.goto(`${base}/#/inbox`);
    await p.waitFor(`document.querySelectorAll('.thought-item').length > 0`);
    await openDetail(p, 'invoice');
    await p.ev(`(() => { const t = document.getElementById('f-type'); t.value = 'reminder'; t.dispatchEvent(new Event('change')); })()`);
    await p.type('#f-title', 'Invoice for Anna');
    await p.type('#f-tags', 'Money, Anna, work');
    await p.ev(`document.querySelector('.edit-form').requestSubmit()`);
    await p.waitFor(`/Saved\\./.test(document.querySelector('.detail .capture-status')?.textContent ?? '')`);
    await p.goto(`${base}/#/inbox`);
    await p.waitFor(`document.querySelectorAll('.thought-item').length > 0`);
    const edited = (await p.idbAll()).find((t) => t.title === 'Invoice for Anna');
    check('AC-M3.4 / M5.4: edited type, title and tags persist after reload', !!edited && edited.type === 'reminder' && edited.tags.join() === 'money,anna,work', JSON.stringify(edited && [edited.type, edited.tags]));
    await openDetail(p, 'Invoice for Anna');
    await clickButton(p, '/^Delete$/');
    await clickButton(p, '/^Cancel$/');
    check('AC-M5.5: cancelling the delete confirmation keeps the thought', (await p.idbAll()).some((t) => t.title === 'Invoice for Anna') && (await p.exists('.detail')));
    await clickButton(p, '/^Delete$/');
    check('AC-M5.5: delete asks for confirmation', await p.ev(`/Delete this thought for good/.test(document.body.innerText)`));
    await clickButton(p, '/Yes, delete/');
    await p.waitFor(`location.hash === '#/inbox'`);
    await p.goto(`${base}/#/inbox`);
    await p.waitFor(`!!document.querySelector('.thought-list')`);
    check('AC-M5.5: the thought is absent after delete and reload', !(await p.idbAll()).some((t) => t.title === 'Invoice for Anna') && !(await p.ev(`document.body.innerText.includes('Invoice for Anna')`)));
    // task done in detail
    await openDetail(p, 'buy milk');
    await p.click('#f-done');
    await p.waitFor(`/Marked done/.test(document.querySelector('.detail .capture-status')?.textContent ?? '')`);
    await p.goto(`${base}/#/type/task`);
    await p.waitFor(`!!document.querySelector('.thought-item.is-done')`);
    check('AC-M5.6: done from the detail view persists and the task shows as done', await p.exists('.thought-item.is-done'));
  });

  // ---------- F10: review ----------
  await section('review', async () => {
    const seeded = await p.ev(`(async () => {
      const { newThought } = await import('/src/core/model.js');
      const { sortByRules } = await import('/src/core/sorter.js');
      const { createIdbStore } = await import('/src/storage/idb.js');
      const store = await createIdbStore(indexedDB);
      await store.clear();
      const H = 3600000, D = 24 * H, now = new Date();
      const mk = (text, ageMs, extra = {}) => ({ ...newThought({ text, sortResult: sortByRules(text, now), now: new Date(now.getTime() - ageMs), id: crypto.randomUUID() }), ...extra });
      const rows = [
        mk('what if we sold handmade candles online', 3 * D + H),
        mk('what if we built a rooftop garden club', 2 * D),
        mk('remind me to call mum at 6pm', D, { due_at: new Date(now.getTime() - H).toISOString() }),
        mk('remind me to book the boat at 6pm', D, { due_at: new Date(now.getTime() + 5 * H).toISOString() }),
      ];
      await store.putMany(rows);
      localStorage.removeItem('thought-catcher.review.last_shown_date'); localStorage.removeItem('thought-catcher.review.left_unresolved'); localStorage.setItem('thought-catcher.review.days', '3');
      return rows.length;
    })()`);
    await p.goto(`${base}/`);
    const auto = await p.waitFor(`location.hash === '#/review'`, 4000);
    check('AC-M7.4: on open with items due, the review is shown', auto, await p.ev('location.hash'));
    await p.waitFor(`document.querySelectorAll('.thought-item').length > 0`);
    const titles = await p.ev(`[...document.querySelectorAll('.thought-item .thought-title')].map((n) => n.textContent)`);
    check('AC-M7.1 / M7.2: a 3-day-old idea and a due reminder appear; a 2-day-old idea and a future reminder do not', titles.length === 2 && titles.some((t) => /candles/i.test(t)) && titles.some((t) => /call mum/i.test(t)), JSON.stringify(titles));
    check('AC-M7.x: the navigation shows the due count', /\(2\)/.test(await p.ev(`document.querySelector('a[data-route=review]').textContent`)), await p.ev(`document.querySelector('a[data-route=review]').textContent`));
    check('AC-M7.6: the review screen says reminders appear only when the app is opened', await p.ev(`/only when you open the app/i.test(document.getElementById('app').innerText)`));
    await clickButton(p, '/^Reviewed$/');
    await clickButton(p, '/^Dismiss$/');
    await sleep(200);
    check('AC-M7.3: reviewing an idea and dismissing a reminder clear the review', await p.ev(`/All done/.test(document.getElementById('app').innerText)`));
    const st = await p.idbAll();
    check('AC-M7.3: the actions are stored (idea clock restarted, reminder dismissed)', st.some((t) => /candles/.test(t.text) && t.review.last_reviewed_at) && st.some((t) => /call mum/.test(t.text) && t.review.dismissed));
    await p.goto(`${base}/`);
    await sleep(700);
    check('AC-M7.4: opening again the same day does not show the review', (await p.ev('location.hash')) !== '#/review', await p.ev('location.hash'));
    await p.route('#/settings');
    await p.waitFor(`!!document.getElementById('s-days')`);
    await p.type('#s-days', '1');
    await p.ev(`document.getElementById('s-days').dispatchEvent(new Event('change'))`);
    await sleep(150);
    await p.route('#/review');
    await p.waitFor(`!!document.querySelector('h2')`);
    check('AC-M7.5: with the threshold set to 1 day the 2-day-old idea is due on the next review', await p.ev(`[...document.querySelectorAll('.thought-item .thought-title')].some((n) => /rooftop/i.test(n.textContent))`), await p.ev(`document.getElementById('app').innerText.slice(0, 80)`));
    await p.route('#/settings');
    await p.waitFor(`!!document.getElementById('s-days')`);
    await p.type('#s-days', '99');
    await p.ev(`document.getElementById('s-days').dispatchEvent(new Event('change'))`);
    check('AC-M7.5: the threshold is limited to 1-30', (await p.ev(`document.getElementById('s-days').value`)) === '30');
    await p.type('#s-days', '3');
    await p.ev(`document.getElementById('s-days').dispatchEvent(new Event('change'))`);
    await p.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); await (await createIdbStore(indexedDB)).clear(); })()`);
  });

  // ---------- F11: About ----------
  await section('about', async () => {
    await p.goto(`${base}/?capture=1`);
    await p.waitFor(`!!document.querySelector('a[data-route=about]')`);
    await p.click('a[data-route=about]');
    await p.waitFor(`/Who made it/.test(document.getElementById('app').innerText)`);
    check('AC-M10.1: About is one tap from the main navigation', true);
    const t = await p.ev(`document.getElementById('app').innerText`);
    check('AC-M2.4: About names which engine keeps audio on the device and which sends it to a named party', /on your phone and never sent anywhere/.test(t) && /Google/.test(t) && /Apple/.test(t), '');
    check('AC-M10.2: iPhone steps (Safari, Share, Add to Home Screen)', /Safari/.test(t) && /Share/.test(t) && /Add to Home Screen/.test(t));
    check('AC-M10.2: Android steps (Chrome menu, Install app)', /Chrome menu/.test(t) && /Install app/.test(t));
    check('AC-M10.2: author Ion Vovos / Nexa Systems', /Ion Vovos \/ Nexa Systems/.test(t));
    check('AC-M10.3: the code link points to https://github.com/ionvovos/thought-catcher', await p.ev(`[...document.querySelectorAll('#app a')].some((a) => a.getAttribute('href') === 'https://github.com/ionvovos/thought-catcher')`));
    check('AC-M10.4: limits of v1 are stated (no push, no sync, English only, no store app, no account)', /notifications/.test(t) && /sync/.test(t) && /English/.test(t) && /App Store/.test(t));
    check('AC-M7.6: About says reminders appear only when the app is opened', /Reminders appear only when you open the app/.test(t));
    check('AC-M9.8: About recommends periodic export and names the eviction risk', /iOS removing data/.test(t) && /Export/.test(t));
    check('AC-M10.5: no unexplained technical term (IndexedDB, PWA, API key, localStorage, CORS)', !/IndexedDB|\bPWA\b|API key|localStorage|\bCORS\b|\bJSON\b|\bOLLAMA_ORIGINS\b/.test(t), (t.match(/IndexedDB|\bPWA\b|API key|localStorage|\bCORS\b|\bJSON\b/g) ?? []).join());
  });

  // ---------- F12: PWA and offline ----------
  await section('pwa', async () => {
    await p.goto(`${base}/?capture=1`);
    await p.waitFor(`!!document.querySelector('.record-btn')`);
    const html = await p.ev(`document.documentElement.outerHTML`);
    const linked = await p.ev(`(() => { const l = document.querySelector('link[rel=manifest]'); return l ? l.getAttribute('href') : null; })()`);
    check('AC-M1.2 / Q.6: index.html links the manifest', !!linked, String(linked));
    check('iOS: apple-touch-icon and apple-mobile-web-app-capable are present', /apple-touch-icon/.test(html) && /apple-mobile-web-app-capable/.test(html));
    check('CSP: a Content-Security-Policy meta tag is present with script-src limited to self and the pinned CDN', await p.ev(`(() => { const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'); return !!m && /script-src 'self' https:\\/\\/cdn\\.jsdelivr\\.net/.test(m.content); })()`));
    const man = await p.ev(`fetch('./manifest.webmanifest').then((r) => r.json()).catch(() => null)`);
    check('AC-M1.2: manifest start_url opens capture and display is standalone', !!man && man.start_url === './?capture=1' && man.display === 'standalone', JSON.stringify(man && [man.start_url, man.display]));
    const icons = await p.ev(`(async () => { const m = await (await fetch('./manifest.webmanifest')).json(); return Promise.all(m.icons.map((i) => fetch(new URL(i.src, location.href)).then((r) => [i.sizes, r.status, r.headers.get('content-type')]))); })()`);
    check('AC-Q.6: manifest icons (192, 512, maskable) load as PNG', icons.length >= 3 && icons.every(([, s, ct]) => s === 200 && /png/.test(ct)), JSON.stringify(icons));
    const reg = await p.ev(`(async () => { if (!navigator.serviceWorker) return 'none'; try { await Promise.race([navigator.serviceWorker.ready, new Promise((_, j) => setTimeout(() => j(new Error('no sw')), 5000))]); return 'ready'; } catch (e) { return e.message; } })()`);
    check('AC-Q.6: a service worker registers and becomes ready', reg === 'ready', reg);
    if (reg === 'ready') {
      await p.goto(`${base}/?capture=1`);
      await p.waitFor(`navigator.serviceWorker.controller !== null`, 4000);
      await p.route('#/inbox'); await p.route('#/settings'); await p.route('#/about'); await p.route('#/review'); await p.route('#/type/task'); await p.route('#/capture');
      await p.offline(true);
      await p.goto(`${base}/?capture=1`);
      check('AC-Q.2: offline, the app still opens on the capture screen', await p.waitFor(`!!document.querySelector('.record-btn')`, 5000));
      check('AC-Q.2: offline, capture with typed input saves and sorts by rules', await capture(p, 'offline thought buy tea tomorrow'));
      await p.route('#/inbox');
      check('AC-Q.2: offline, the inbox lists the new thought', await p.waitFor(`/offline thought/i.test(document.body.innerText)`));
      for (const h of ['#/settings', '#/about', '#/review', '#/type/task']) {
        await p.route(h); await sleep(300);
        check(`AC-Q.2: offline, ${h} renders`, !/coming soon|Something went wrong/i.test(await p.ev(`document.getElementById('app').innerText`)) && (await p.ev(`document.getElementById('app').innerText.trim().length`)) > 0);
      }
      await openDetail(p, 'offline thought');
      const off = await buttonWith(p, '/Re-sort/');
      check('AC-Q.2: offline, AI controls show "offline"', !!off && /offline/.test(off.text), JSON.stringify(off));
      await p.offline(false);
    }
  });

  // ---------- F13: accessibility approximations ----------
  await section('accessibility', async () => {
    await p.goto(`${base}/?capture=1`);
    await p.waitFor(`!!document.querySelector('.record-btn')`);
    const seq = [];
    for (let i = 0; i < 14; i += 1) {
      await p.key('Tab', { vk: 9, code: 'Tab' });
      seq.push(await p.ev(`(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) + ':' + (a.getAttribute('aria-label') || a.textContent.trim().slice(0, 12)) : 'none'; })()`));
    }
    check('AC-Q.3: the record button, text field and Save are reachable by keyboard', seq.some((s) => /record-btn/.test(s)) && seq.some((s) => /thought-text/.test(s)) && seq.some((s) => /Save/.test(s)), seq.join(' > ').slice(0, 200));
    check('AC-Q.3: a visible focus indicator on the focused control', await p.ev(`(() => { const a = document.activeElement; const s = getComputedStyle(a); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none'; })()`));

    const contrastFn = `(() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (n) => { let layers = []; for (let e = n; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] === 1) break; } } let base = [255, 255, 255]; if (!layers.length || layers[layers.length - 1][3] < 1) { const scheme = getComputedStyle(document.documentElement).colorScheme; base = matchMedia('(prefers-color-scheme: dark)').matches && /dark/.test(scheme) ? [18, 18, 18] : [255, 255, 255]; } for (const l of layers.reverse()) base = base.map((v, i) => l[i] * l[3] + v * (1 - l[3])); return base; };
      const bad = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set();
      while (walker.nextNode()) {
        const tn = walker.currentNode; if (!tn.textContent.trim()) continue;
        const e = tn.parentElement; if (!e || seen.has(e)) continue; seen.add(e);
        const r = e.getBoundingClientRect(); const st = getComputedStyle(e);
        if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') continue;
        if (e.closest('[hidden]')) continue;
        const fg = rgba(st.color); const bg = bgOf(e);
        const a = fg[3]; const mixed = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
        const L1 = lum(mixed), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const size = parseFloat(st.fontSize), bold = parseInt(st.fontWeight, 10) >= 700;
        const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
        if (ratio < need) bad.push(e.tagName.toLowerCase() + '.' + (e.className || '') + ' "' + tn.textContent.trim().slice(0, 24) + '" ' + ratio.toFixed(2) + '<' + need);
      }
      return bad;
    })()`;
    const seedAndView = async (hash) => { await p.route(hash); await sleep(250); return p.ev(contrastFn); };
    for (const scheme of ['light', 'dark']) {
      await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await capture(p, 'what if we sold candles online');
      const offenders = [];
      for (const h of ['#/capture', '#/inbox', '#/settings', '#/about', '#/review', '#/type/idea']) offenders.push(...(await seedAndView(h)).map((x) => `${h} ${x}`));
      await openDetail(p, 'candles');
      offenders.push(...(await p.ev(contrastFn)).map((x) => `detail ${x}`));
      check(`AC-Q.3: text contrast at least 4.5:1 (3:1 for large text) in ${scheme} mode, computed`, offenders.length === 0, offenders.slice(0, 4).join(' ; '));
    }
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

    // tap targets on a phone
    await p.viewport({ width: 390, height: 844, mobile: true });
    const small = [];
    for (const h of ['#/capture', '#/inbox', '#/settings', '#/about', '#/review']) {
      await p.route(h); await sleep(300);
      small.push(...(await p.ev(`[...document.querySelectorAll('a, button, input, select, textarea')].filter((n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !n.closest('[hidden]') && !n.closest('p, li > p'); }).map((n) => { const box = n.type === 'checkbox' || n.type === 'radio' ? (n.closest('label') ?? n) : n; const r = box.getBoundingClientRect(); return { h: ${JSON.stringify('')} + (n.id || n.className || n.tagName) + ':' + (n.getAttribute('aria-label') || n.textContent.trim().slice(0, 14)), w: Math.round(r.width), ht: Math.round(r.height) }; }).filter((x) => x.w < 44 || x.ht < 44).map((x) => x.h + ' ' + x.w + 'x' + x.ht)`)).map((x) => `${h} ${x}`));
    }
    const groups = {};
    for (const x of small) { const k = x.replace(/ [^ ]+ \d+x\d+$/, '').replace(/^(#\/[a-z/]+) (\w+):.*/, '$1 $2'); groups[k] = (groups[k] ?? 0) + 1; }
    check('AC-Q.5 (H part): interactive controls are at least 44 CSS px in both directions on a phone', small.length === 0, `${small.length} too small: ${Object.entries(groups).map(([k, n]) => `${k} x${n}`).join(', ')}; ${[...new Set(small)].slice(0, 6).join(' ; ')}`);
    await p.viewport({ width: 1280, height: 800 });
  });


  // ---------- F14: voice with a fake browser speech engine ----------
  await section('voice', async () => {
    await p.ev(`localStorage.setItem('thought-catcher.speech.engine', '"browser"'); localStorage.removeItem('thought-catcher.ai-key')`);
    await p.goto(`${base}/?capture=1`);
    await p.waitFor(`!!document.querySelector('.record-btn')`);
    await p.click('.record-btn');
    await sleep(200);
    const rec = await p.ev(`({ pressed: document.querySelector('.record-btn').getAttribute('aria-pressed'), cls: document.querySelector('.record-btn').classList.contains('is-recording'), label: document.querySelector('.record-btn').getAttribute('aria-label') })`);
    check('AC-M2.3: while recording the button shows a distinct state', rec.pressed === 'true' && rec.cls && /Stop/.test(rec.label), JSON.stringify(rec));
    await p.click('.record-btn');
    await p.waitFor(`document.getElementById('thought-text').value !== ''`);
    check('AC-M2.3: a second press stops recording', await p.ev(`document.querySelector('.record-btn').getAttribute('aria-pressed') === 'false'`));
    check('AC-M2.2: the transcript is put in the text field for review, not saved yet', (await p.ev(`document.getElementById('thought-text').value`)) === 'buy oat milk tomorrow' && !(await p.idbAll()).some((t) => /oat milk/.test(t.text)));
    await p.ev(`document.getElementById('thought-text').focus()`);
    await p.key('End', { vk: 35, code: 'End' });
    await p.send('Input.insertText', { text: ' and honey' });
    await p.key('Enter', { text: '\r', vk: 13, code: 'Enter' });
    await p.waitFor(`(async () => (await (await import('/src/storage/idb.js')).createIdbStore(indexedDB).then((st) => st.getAll())).some((t) => /honey/.test(t.text)))()`);
    const voiceRow = (await p.idbAll()).find((t) => /honey/.test(t.text));
    check('AC-M2.2: the user can edit the transcript and saving stores the edited text, source voice', !!voiceRow && voiceRow.text === 'buy oat milk tomorrow and honey' && voiceRow.source === 'voice', JSON.stringify(voiceRow && [voiceRow.text, voiceRow.source]));

    await p.ev(`window.__speech.mode = 'silent'`);
    await p.click('.record-btn'); await sleep(150); await p.click('.record-btn');
    check('AC-M2.3: stopping with no speech leaves the field empty and shows "nothing heard"', await p.waitFor(`document.getElementById('capture-status').textContent === 'nothing heard'`) && (await p.ev(`document.getElementById('thought-text').value`)) === '');

    await p.ev(`window.__speech.mode = 'denied'`);
    await p.click('.record-btn');
    check('AC-M1.5: with microphone permission denied the button shows a message', await p.waitFor(`/Microphone blocked/.test(document.getElementById('capture-status').textContent)`), await p.text('#capture-status'));
    await p.type('#thought-text', 'typed anyway');
    check('AC-M1.5: the text field stays usable after a denied microphone', (await p.ev(`document.getElementById('thought-text').value`)) === 'typed anyway');
    await p.ev(`document.getElementById('thought-text').value = ''; `);
    await p.goto(`${base}/?capture=1`);
    await p.waitFor(`!!document.querySelector('.record-btn')`);
    await p.ev(`delete window.webkitSpeechRecognition; delete window.SpeechRecognition`);
    await p.click('.record-btn');
    check('AC-M1.5: with the speech API absent the button shows a message', await p.waitFor(`/not available|Type your thought/.test(document.getElementById('capture-status').textContent)`), await p.text('#capture-status'));
    check('AC-M1.5: with the speech API absent the text field takes focus', await p.ev(`document.activeElement === document.getElementById('thought-text')`));

    // voice answer to a clarifying question (AC-M4.5)
    await p.ev(`localStorage.setItem('thought-catcher.ai-key', ${JSON.stringify(KEY)}); localStorage.setItem('thought-catcher.ai.provider', '"anthropic"')`);
    await p.goto(`${base}/?capture=1`);
    await p.waitFor(`!!document.querySelector('.record-btn')`);
    await mock(p, { mode: 'ok', delay: 0, sortReply: { type: 'reminder', alt_type: null, confidence: 0.9, title: 'Call the vet', tags: ['vet'], due_at: null } });
    await p.ev(`window.__speech.mode = 'text'; window.__speech.transcript = 'tomorrow at 9am'`);
    await capture(p, 'call the vet for the dog');
    await p.waitFor(`!!document.getElementById('clarify-answer') && !document.querySelector('.clarify').hidden`);
    await clickButton(p, '/Speak/');
    await sleep(250);
    await clickButton(p, '/^Stop$/');
    await p.waitFor(`document.getElementById('clarify-answer').value !== ''`);
    const stillPending = (await p.idbAll()).find((t) => t.text === 'call the vet for the dog');
    check('AC-M4.5: a spoken answer goes into the answer field before it is submitted', (await p.ev(`document.getElementById('clarify-answer').value`)) === 'tomorrow at 9am' && stillPending.clarify.state === 'pending', stillPending.clarify.state);
    await mock(p, { sortReply: null });
  });

  // ---------- F15: views, counts, empty states, store parity ----------
  await section('views and stores', async () => {
    await p.ev(`localStorage.setItem('thought-catcher.speech.engine', '"typing"')`);
    await p.goto(`${base}/#/inbox`);
    await p.waitFor(`!!document.querySelector('.list-box')`);
    // mixed data
    await p.ev(`(async () => {
      const { newThought } = await import('/src/core/model.js'); const { sortByRules } = await import('/src/core/sorter.js'); const { createIdbStore } = await import('/src/storage/idb.js');
      const store = await createIdbStore(indexedDB); await store.clear(); const now = new Date();
      const texts = ['buy milk tomorrow', 'send the invoice to Anna', 'finish the quarterly report', 'what if we sold candles online', 'imagine a library in a train station', 'today was tiring but good', 'remind me to call mum at 6pm', 'remember to lock the door at 10pm', 'remind me to water the plants at 7pm'];
      await store.putMany(texts.map((text, i) => newThought({ text, sortResult: sortByRules(text, now), now: new Date(now.getTime() - i * 1000), id: 'v' + i })));
    })()`);
    const want = { task: 3, idea: 2, journal: 1, reminder: 3 };
    for (const [type, n] of Object.entries(want)) {
      await p.route(`#/type/${type}`);
      await p.waitFor(`document.querySelectorAll('.thought-item').length > 0`);
      const v = await p.ev(`({ rows: document.querySelectorAll('.thought-item').length, badges: [...new Set([...document.querySelectorAll('.thought-item .badge')].map((b) => b.textContent.toLowerCase()))], count: document.querySelector('.count').textContent })`);
      check(`AC-M5.2: ${type} view shows only ${type} and the count matches`, v.rows === n && v.badges.length === 1 && v.badges[0] === type && v.count.startsWith(`${n} `), JSON.stringify(v));
    }
    await p.route('#/inbox');
    await p.waitFor(`document.querySelectorAll('.thought-item').length === 9`);
    check('AC-M5.1: the inbox lists all thoughts with title, badge, tags area and date', await p.ev(`[...document.querySelectorAll('.thought-item')].every((li) => li.querySelector('.thought-title') && li.querySelector('.badge') && li.querySelector('time'))`));
    await p.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); await (await createIdbStore(indexedDB)).clear(); })()`);
    for (const h of ['#/inbox', '#/type/idea', '#/type/task', '#/type/journal', '#/type/reminder']) {
      await p.route('#/capture'); await p.route(h); await sleep(150);
      check(`AC-M5.7: ${h} with zero thoughts shows an empty state that points to capture`, await p.waitFor(`/^No /.test(document.querySelector('.empty')?.textContent ?? '') && !!document.querySelector('.list-box a[href="#/capture"]')`), await p.ev(`document.querySelector('.empty')?.textContent ?? ''`));
    }

    // interface parity: the same operations on the memory store and the IndexedDB store give the same answers
    const parity = await p.ev(`(async () => {
      const { createIdbStore } = await import('/src/storage/idb.js'); const { createMemoryStore } = await import('/src/storage/memory.js');
      const { newThought } = await import('/src/core/model.js'); const { sortByRules } = await import('/src/core/sorter.js');
      const now = new Date(2026, 8, 29, 10, 0, 0);
      const mk = (text, id) => newThought({ text, sortResult: sortByRules(text, now), now, id });
      const idb = await createIdbStore(indexedDB); await idb.clear();
      const mem = createMemoryStore();
      const names = ['getAll', 'get', 'put', 'putMany', 'delete', 'clear', 'getSetting', 'setSetting'];
      const iface = names.map((n) => [n, typeof idb[n], typeof mem[n]]).filter(([, a, b]) => a !== 'function' || b !== 'function');
      const run = async (s) => {
        const out = [];
        const sortById = (a) => a.slice().sort((x, y) => x.id.localeCompare(y.id));
        await s.put(mk('buy milk', 'a')); await s.putMany([mk('what if we sold candles', 'b'), mk('today was tiring', 'c')]);
        out.push(sortById(await s.getAll()).map((t) => t.id));
        out.push((await s.get('b'))?.text); out.push(await s.get('zzz'));
        await s.put({ ...(await s.get('a')), title: 'Edited' }); out.push((await s.get('a')).title);
        await s.delete('b'); out.push(sortById(await s.getAll()).map((t) => t.id));
        out.push(await s.getSetting('k', 'fallback')); await s.setSetting('k', { n: 1 }); out.push(await s.getSetting('k', 'fallback'));
        await s.clear(); out.push((await s.getAll()).length); out.push(await s.getSetting('k', 'fallback'));
        return JSON.stringify(out);
      };
      const a = await run(mem); const b = await run(idb);
      await idb.clear();
      const stores = await new Promise((res) => { const r = indexedDB.open('thought-catcher'); r.onsuccess = () => { const names = [...r.result.objectStoreNames]; r.result.close(); res(names); }; });
      return { iface, same: a === b, a, b, stores };
    })()`);
    check('AC-M9.1 / storage parity: the IndexedDB store has the same interface as the memory store', parity.iface.length === 0, JSON.stringify(parity.iface));
    check('AC-M9.1 / storage parity: the same operations give the same results on both stores', parity.same, parity.same ? '' : `${parity.a} vs ${parity.b}`);
    check('AC-M2.6: the database holds only thoughts and settings stores, no audio store', parity.stores.slice().sort().join() === 'settings,thoughts', parity.stores.join());
  });

  // ---------- session ----------
  const problems = p.problems.filter((x) => !isFavicon(x));
  check('no exception or console error across all flows', problems.length === 0, problems.slice(0, 3).join(' ; '));
  check('favicon request does not log a console error', !p.problems.some(isFavicon), 'GET /favicon.ico');
  const foreign = [...p.hosts].filter((h) => h !== origin);
  check('AC-M9.2: no network request to any host other than the app origin (provider is mocked in the page)', foreign.length === 0, foreign.join(', '));
} catch (err) {
  check('flows completed', false, err.stack ?? String(err));
} finally {
  p.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
}
finish(server);
