// Browser smoke test for Thought Catcher. Zero dependencies: node:http static server, headless Chrome over the DevTools protocol.
// Run outside the Bash sandbox (Chrome cannot create its profile inside it):  node e2e/smoke.mjs
// Exit code 0 = every check passed. Environment: CHROME (binary path), SMOKE_ALLOW_PENDING=1 (a view that still shows
// "coming soon" is reported as PENDING instead of failing; used while the build is in progress).
import { startServer, openChrome, check, pending, finish, sleep, ALLOW_PENDING, isFavicon } from './l4-harness.mjs';

const server = await startServer();
const { base, origin, requests } = server;

const VIEWS = ['#/capture', '#/inbox', '#/type/idea', '#/type/task', '#/type/journal', '#/type/reminder', '#/review', '#/settings', '#/about'];
const noHScroll = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';
const mainText = 'document.getElementById("app").innerText.trim()';

async function pass(label, viewport) {
  console.log(`\n== ${label} ${viewport.width}x${viewport.height} ==`);
  const p = await openChrome();
  try {
    await p.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: viewport.mobile ? 2 : 1, mobile: !!viewport.mobile });
    await p.goto(`${base}/?capture=1`);
    const ready = await p.waitFor('!!document.querySelector(".record-btn")');
    check(`${label}: capture screen opens from the start URL without another tap`, ready);
    if (!ready) return;

    const rec = await p.ev('(() => { const r = document.querySelector(".record-btn").getBoundingClientRect(); return { w: r.width, h: r.height }; })()');
    check(`${label}: record button at least 96x96 CSS px`, rec.w >= 96 && rec.h >= 96, `${Math.round(rec.w)}x${Math.round(rec.h)}`);
    check(`${label}: record button is focused by ?capture=1`, await p.ev('document.activeElement === document.querySelector(".record-btn")'));
    check(`${label}: text field present on capture screen`, await p.ev('!!document.getElementById("thought-text")'));
    check(`${label}: shortcut hint visible on capture screen`, await p.ev('/\\bR\\b/.test(document.querySelector(".hint")?.textContent ?? "")'));
    check(`${label}: every button and field has an accessible name`, await p.ev(`[...document.querySelectorAll('button, input, textarea, select, a')].every((n) => (n.getAttribute('aria-label') || n.textContent.trim() || (n.labels && n.labels.length && n.labels[0].textContent.trim()) || n.getAttribute('title')))`));

    // empty and whitespace-only thought is not stored
    await p.ev(`(() => { const f = document.getElementById('thought-text'); f.value = '   '; f.form.requestSubmit(); })()`);
    await sleep(200);
    const n0 = await p.ev(`(async () => (await (await import('/src/storage/idb.js')).createIdbStore(indexedDB)).getAll().then((a) => a.length))()`);
    check(`${label}: empty thought is not stored`, n0 === 0, `stored=${n0}`);
    await p.ev(`document.getElementById('thought-text').value = ''`);

    // type a thought with real key events, save with Enter
    await p.ev(`document.getElementById('thought-text').focus()`);
    await p.send('Input.insertText', { text: 'buy milk tomorrow' });
    const typedValue = await p.ev(`document.getElementById('thought-text').value`);
    check(`${label}: typed text lands in the field`, typedValue === 'buy milk tomorrow', JSON.stringify(typedValue));
    await p.key('Enter', { text: '\r', vk: 13, code: 'Enter' });
    const saved = await p.waitFor(`/^Saved as /.test(document.getElementById('capture-status').textContent)`);
    check(`${label}: Enter saves the thought and shows the sorted type`, saved, await p.ev(`document.getElementById('capture-status').textContent`));
    check(`${label}: field is cleared after save`, (await p.ev(`document.getElementById('thought-text').value`)) === '');

    // second thought through the Save control
    await p.ev(`(() => { const f = document.getElementById('thought-text'); f.value = 'what if the app let people share lists'; f.form.querySelector('button[type=submit]').click(); })()`);
    await p.waitFor(`/idea/.test(document.getElementById('capture-status').textContent)`);

    // shortcut R: the first press asks how voice should work (consent panel); with "type instead" the field takes focus.
    await p.ev('document.activeElement && document.activeElement.blur()');
    await p.key('r', { text: 'r', vk: 82 });
    await sleep(300);
    const afterR = await p.ev(`({ recording: document.querySelector('.record-btn').classList.contains('is-recording'), fieldFocused: document.activeElement === document.getElementById('thought-text'), consent: !!document.querySelector('.consent'), choices: [...document.querySelectorAll('.consent [data-choice]')].map((b) => b.dataset.choice) })`);
    check(`${label}: R starts recording, asks for the voice choice, or focuses the field`, afterR.recording || afterR.fieldFocused || afterR.consent, JSON.stringify(afterR));
    if (afterR.consent) {
      check(`${label}: voice choice offers typing and names the cost of each engine`, afterR.choices.includes('typing') && /Google or Apple/.test(await p.ev(`document.querySelector('.consent').textContent`)), afterR.choices.join(','));
      await p.click('.consent [data-choice="typing"]');
      await sleep(200);
      check(`${label}: choosing "type instead" closes the panel and focuses the field`, await p.ev(`!document.querySelector('.consent') && document.activeElement === document.getElementById('thought-text')`));
      check(`${label}: the voice choice is saved`, (await p.ev(`localStorage.getItem('thought-catcher.speech.engine')`)) === '"typing"');
    }
    await p.key('Escape', { vk: 27, code: 'Escape' });
    await sleep(200);
    const afterEsc = await p.ev(`({ recording: document.querySelector('.record-btn').classList.contains('is-recording'), label: document.querySelector('.record-btn').getAttribute('aria-label') })`);
    check(`${label}: Escape leaves recording state`, !afterEsc.recording, JSON.stringify(afterEsc));
    // microphone denied or speech API absent: field stays usable
    await p.ev(`document.getElementById('thought-text').focus()`);
    await p.send('Input.insertText', { text: 'still typing' });
    check(`${label}: text field usable after a record attempt`, (await p.ev(`document.getElementById('thought-text').value`)).includes('still typing'));
    await p.ev(`document.getElementById('thought-text').value = ''`);

    // inbox: newest first, type badge, tags, date
    await p.route('#/inbox');
    check(`${label}: inbox lists both thoughts`, await p.waitFor(`document.querySelectorAll('.thought-item').length === 2`), await p.ev(`document.querySelectorAll('.thought-item').length`));
    const inbox = await p.ev(`[...document.querySelectorAll('.thought-item')].map((li) => ({ title: li.querySelector('.thought-title')?.textContent, badge: li.querySelector('.badge')?.textContent, time: li.querySelector('time')?.getAttribute('datetime') }))`);
    check(`${label}: each inbox row has a type badge, title and date`, inbox.length === 2 && inbox.every((r) => r.badge && r.title && r.time), JSON.stringify(inbox.map((r) => `${r.badge}:${r.title}`)));
    check(`${label}: inbox newest first`, inbox.length === 2 && Date.parse(inbox[0].time) >= Date.parse(inbox[1].time));
    check(`${label}: count line matches rows`, /^2 thoughts/.test(await p.ev(`document.querySelector('.count').textContent`)));

    // reload: still there
    await p.goto(`${base}/#/inbox`);
    check(`${label}: thoughts survive a reload`, await p.waitFor(`document.querySelectorAll('.thought-item').length === 2`));

    // search
    await p.ev(`(() => { const s = document.getElementById('search'); s.value = 'MILK'; s.dispatchEvent(new Event('input')); })()`);
    check(`${label}: search is case-insensitive and live`, await p.waitFor(`document.querySelectorAll('.thought-item').length === 1`));
    await p.ev(`(() => { const s = document.getElementById('search'); s.value = 'zzzz-no-match'; s.dispatchEvent(new Event('input')); })()`);
    check(`${label}: search with no match shows an empty-state message`, await p.waitFor(`document.querySelectorAll('.thought-item').length === 0 && /No thoughts match/.test(document.querySelector('.list-box').textContent)`));

    // type views show only their type; the counts match
    await p.route('#/type/task');
    await p.waitFor(`document.querySelector('.count')?.textContent`);
    const taskView = await p.ev(`({ rows: document.querySelectorAll('.thought-item').length, badges: [...document.querySelectorAll('.thought-item .badge')].map((b) => b.textContent), count: document.querySelector('.count').textContent })`);
    check(`${label}: task view lists only tasks and the count matches`, taskView.rows === 1 && taskView.badges.every((b) => b === 'Task') && /^1 /.test(taskView.count), JSON.stringify(taskView));
    const doneBox = await p.ev(`(() => { const c = document.querySelector('.done-toggle input'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
    check(`${label}: task has a done control`, !!doneBox);
    await p.ev(`document.querySelector('.done-toggle input').click()`);
    check(`${label}: marking a task done shows the done state`, await p.waitFor(`!!document.querySelector('.thought-item.is-done')`));
    await p.goto(`${base}/#/type/task`);
    check(`${label}: done state persists after reload`, await p.waitFor(`!!document.querySelector('.thought-item.is-done')`));
    await p.ev(`document.querySelector('.done-toggle input').click()`);
    check(`${label}: marking done again reopens the task`, await p.waitFor(`!document.querySelector('.thought-item.is-done')`));
    await p.route('#/type/reminder');
    check(`${label}: empty type view points to capture`, await p.waitFor(`/No reminders yet/.test(document.querySelector('.list-box')?.textContent ?? '') && !!document.querySelector('.list-box a[href="#/capture"]')`));

    // 500 thoughts (desktop pass only): open the inbox in under 1 s
    if (!viewport.mobile) {
      const seeded = await p.ev(`(async () => {
        const { newThought } = await import('/src/core/model.js');
        const { sortByRules } = await import('/src/core/sorter.js');
        const { createIdbStore } = await import('/src/storage/idb.js');
        const store = await createIdbStore(indexedDB);
        const now = new Date();
        const rows = Array.from({ length: 500 }, (_, i) => { const text = 'bulk thought number ' + i + ' buy something'; return newThought({ text, source: 'typed', sortResult: sortByRules(text, now), now: new Date(now.getTime() - i * 60000) }); });
        await store.putMany(rows);
        return (await store.getAll()).length;
      })()`);
      check(`${label}: 500 thoughts seeded`, seeded === 502, `stored=${seeded}`);
      const t0 = Date.now();
      await p.goto(`${base}/#/inbox`);
      const ok500 = await p.waitFor(`document.querySelectorAll('.thought-item').length === 502`, 6000);
      const ms = Date.now() - t0;
      check(`${label}: inbox with 502 thoughts renders in under 1 s`, ok500 && ms < 1000, `${ms} ms incl. page load`);
      await p.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); await (await createIdbStore(indexedDB)).clear(); })()`);
    }

    // every view: renders, no console problem, no horizontal scroll
    for (const w of viewport.mobile ? [viewport.width, 360] : [viewport.width]) {
      if (w !== viewport.width) {
        await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: viewport.height, deviceScaleFactor: 2, mobile: true });
        await sleep(150);
      }
      for (const hash of VIEWS) {
        await p.route(hash);
        await p.waitFor(`${mainText}.length > 0`);
        await sleep(150);
        const text = await p.ev(mainText);
        if (/coming soon/i.test(text)) {
          if (ALLOW_PENDING) pending(`${label}: ${hash} renders`, 'still "coming soon"');
          else check(`${label}: ${hash} renders`, false, 'shows "coming soon"');
        } else {
          check(`${label}: ${hash} renders`, text.length > 0 && !/Something went wrong/.test(text), text.slice(0, 50).replace(/\n/g, ' | '));
        }
        check(`${label}: ${hash} no horizontal scroll at ${w}px`, await p.ev(noHScroll));
      }
    }

    // session-level checks
    const isPendingView = (x) => ALLOW_PENDING && /\/src\/ui\/views\/(review|settings|about|detail)\.js/.test(x);
    const problems = p.problems.filter((x) => !isFavicon(x) && !isPendingView(x));
    check(`${label}: no exception or console error in the whole session`, problems.length === 0, problems.slice(0, 3).join(' ; '));
    check(`${label}: favicon request does not log a console error`, !p.problems.some(isFavicon), 'GET /favicon.ico 404 (no <link rel="icon">)');
    const foreign = [...p.hosts].filter((h) => h !== origin);
    check(`${label}: no request to another host`, foreign.length === 0, foreign.join(', '));
    const notFound = requests.filter((r) => r.status === 404 && !isFavicon(r.url) && !isPendingView(r.url)).map((r) => r.url);
    check(`${label}: no 404 from the static server`, notFound.length === 0, [...new Set(notFound)].join(', '));
    requests.length = 0;
  } finally {
    p.close();
  }
}

try {
  await pass('desktop', { width: 1280, height: 800 });
  await pass('phone', { width: 390, height: 844, mobile: true });
} catch (err) {
  check('smoke run completed', false, err.stack ?? String(err));
}
finish(server);
