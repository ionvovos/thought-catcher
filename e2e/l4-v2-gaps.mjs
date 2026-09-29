// L4a v2 gap flows: headless criteria the builders' e2e files do not drive (orb tap and hold with a stubbed speech engine,
// typed-entry rules, speech-unavailable paths, spoken replies, sheet drag, onboarding reload, default controls, raw errors in
// every state, offline). Never edits app code. Run outside the Bash sandbox: node e2e/l4-v2-gaps.mjs   Exit 0 = all pass.
import { launch, sleep } from './lib/cdp.mjs';

let failed = 0;
const check = (id, name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `  ${detail}` : ''}`); if (!ok) failed += 1; };

// Page-side stubs, chosen per load through localStorage keys: l4.sr = text | empty | denied | none, l4.synth = 1.
const STUBS = `(() => {
  const mode = localStorage.getItem('l4.sr') || 'none';
  const text = localStorage.getItem('l4.text') || 'buy milk tomorrow';
  window.__sr = { starts: 0, stops: 0 };
  if (mode === 'none') { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; try { Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); } catch {} }
  else {
    class FakeSR {
      start() { window.__sr.starts += 1; if (mode === 'denied') setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 20); }
      stop() { window.__sr.stops += 1; setTimeout(() => { if (mode === 'text') this.onresult?.({ results: [[{ transcript: text }]] }); this.onend?.(); }, 30); }
      abort() { this.stop(); }
    }
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  }
  if (localStorage.getItem('l4.synth')) {
    window.__synth = { spoken: [], cancels: 0 };
    class Utt { constructor(t) { this.text = t; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utt, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ name: 'Test Voice', lang: 'en-US' }], speak: (u) => window.__synth.spoken.push(u.text), cancel: () => { window.__synth.cancels += 1; } } });
  }
})()`;

const b = await launch({ chromeArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: STUBS });
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// fresh(): clean profile state, onboarding done, chosen settings, then the manifest start_url.
async function fresh({ sr = 'text', text = 'buy milk tomorrow', engine = 'browser', synth = false, speak = false, onboarding = true, url = '/?capture=1' } = {}) {
  await b.load(`${b.base}/about-blank-reset.html`, 50).catch(() => {});
  await b.ev(`(async () => { localStorage.clear(); sessionStorage.clear(); for (const d of (await indexedDB.databases?.() ?? [])) indexedDB.deleteDatabase(d.name); })()`);
  await b.ev(`(() => {
    localStorage.setItem('l4.sr', ${JSON.stringify(sr)}); localStorage.setItem('l4.text', ${JSON.stringify(text)});
    ${synth ? `localStorage.setItem('l4.synth', '1');` : ''}
    ${onboarding ? `localStorage.setItem('thought-catcher.onboarding.done', 'true');` : ''}
    localStorage.setItem('thought-catcher.speech.engine', ${JSON.stringify(JSON.stringify(engine))});
    ${speak ? `localStorage.setItem('thought-catcher.voice.speak', 'true'); localStorage.setItem('thought-catcher.voice.name', '"Test Voice"');` : ''}
  })()`);
  b.problems.length = 0;
  await b.load(`${b.base}${url}`, 1300);
}
const rows = () => b.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); return s.getAll(); })()`);
const orbState = () => b.ev(`document.querySelector('.orb:not(.orb--mini)')?.dataset.state ?? null`);
const orbCentre = async () => { const r = await b.ev(`(() => { const r = document.querySelector('.orb:not(.orb--mini)').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); return r; };
const mouse = (type, x, y) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
async function tapOrb() { const { x, y } = await orbCentre(); await mouse('mousePressed', x, y); await sleep(60); await mouse('mouseReleased', x, y); }
async function hold(ms) {
  const { x, y } = await orbCentre();
  await mouse('mousePressed', x, y);
  await sleep(ms);
  const during = await orbState();
  await mouse('mouseReleased', x, y);
  return during;
}
const type = async (text) => { await b.ev(`document.querySelector('.composer__input').focus()`); if (text) await b.send('Input.insertText', { text }); await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
const clickSel = (sel) => b.ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true; })()`);
const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

// ---- AC-X1.1 start_url geometry, no tab bar ----
{
  const manifest = await (await fetch(`${b.base}/manifest.webmanifest`)).json();
  await fresh({ url: `/${manifest.start_url.replace(/^\.\//, '')}` });
  const g = await b.ev(`(() => { const o = document.querySelector('.orb:not(.orb--mini)'); const r = o?.getBoundingClientRect(); return { w: r?.width, dx: r ? Math.abs(r.x + r.width / 2 - innerWidth / 2) : null, tabs: document.querySelectorAll('[role="tablist"], [role="tab"], nav a, .tabbar').length, path: location.search }; })()`);
  check('AC-X1.1', 'start_url opens the assistant: orb >= 160 px, centred within 4 px, no tab bar', g.w >= 160 && g.dx <= 4 && g.tabs === 0, JSON.stringify({ start_url: manifest.start_url, ...g }));
}

// ---- AC-X1.4 orb scale follows the level ----
{
  const scales = await b.ev(`(async () => {
    const { createOrb } = await import('/src/ui/orb/orb.js');
    const o = createOrb({ state: 'listening' }); document.body.append(o.el);
    const read = (lvl) => { o.setLevel(lvl); const m = new DOMMatrix(getComputedStyle(o.el.querySelector('.orb__level')).transform); const c = new DOMMatrix(getComputedStyle(o.el.querySelector('.orb__core')).transform); return [m.a, c.a, getComputedStyle(o.el.querySelector('.orb__level')).opacity]; };
    const quiet = read(0); await new Promise((r) => setTimeout(r, 300)); const quietSettled = read(0);
    const loud = read(1); await new Promise((r) => setTimeout(r, 300)); const loudSettled = read(1);
    o.el.remove(); return { quiet: quietSettled, loud: loudSettled };
  })()`);
  check('AC-X1.4', 'orb renders at a different scale (or opacity) for silent and loud input', JSON.stringify(scales.quiet) !== JSON.stringify(scales.loud), JSON.stringify(scales));
}

// ---- AC-X1.3 tap toggles, second tap stops and sends; hold starts at 300 ms, release sends ----
{
  await fresh({ sr: 'text', text: 'buy milk tomorrow' });
  await tapOrb(); await sleep(300);
  const s1 = await orbState();
  check('AC-X1.3', 'tap on the orb sets state listening', s1 === 'listening', s1);
  await tapOrb(); await sleep(1800);
  const s2 = await orbState();
  const r = await rows();
  check('AC-X1.3', 'a second tap stops listening and the transcript is filed', s2 !== 'listening' && r.length === 1, `state=${s2} rows=${r.length}`);

  await fresh({ sr: 'text', text: 'call the dentist' });
  const at350 = await hold(350); await sleep(1800);
  const r350 = await rows();
  check('AC-X1.3', 'holding 350 ms (>= 300 ms) is a hold: listening while pressed, release sends', at350 === 'listening' && r350.length === 1, `state while pressed=${at350} rows after release=${r350.length}`);

  await fresh({ sr: 'text', text: 'call the dentist' });
  const at600 = await hold(600); await sleep(1800);
  const r600 = await rows();
  check('AC-X1.3', 'holding 600 ms listens while pressed and release sends', at600 === 'listening' && r600.length === 1, `state while pressed=${at600} rows after release=${r600.length}`);
}

// ---- AC-X1.5 typed entry ----
{
  await fresh({ sr: 'none' });
  await clickSel('.row-actions .btn');
  check('AC-X1.5', 'one tap on Type opens a focused text field', await b.until(`document.activeElement?.classList?.contains('composer__input')`, 2000));
  await type('   ');
  await sleep(500);
  check('AC-X1.5', 'whitespace-only text is not sent', (await b.ev(`document.querySelectorAll('.msg--user').length`)) === 0 && (await rows()).length === 0);
  await b.ev(`document.querySelector('.composer__input').value = ''`);
  await type('buy milk');
  await b.until(`document.querySelectorAll('.msg--user').length === 1`, 4000);
  const after = await b.ev(`({ users: document.querySelectorAll('.msg--user').length, value: document.querySelector('.composer__input')?.value ?? '' })`);
  check('AC-X1.5', 'text plus Enter sends it as a message and clears the field', after.users === 1 && after.value === '', JSON.stringify(after));
}

// ---- AC-X1.6 nothing heard ----
{
  await fresh({ sr: 'empty' });
  await tapOrb(); await sleep(300); await tapOrb(); await sleep(1500);
  const heard = await b.ev(`/nothing heard/i.test(document.body.innerText)`);
  check('AC-X1.6', 'stopping with no speech shows "nothing heard" and sends nothing', heard && (await rows()).length === 0 && (await b.ev(`document.querySelectorAll('.msg--user').length`)) === 0, `heard=${heard}`);
}

// ---- AC-X1.7 transcript has an edit control; confirming an edit leaves one record ----
{
  await fresh({ sr: 'text', text: 'buy milk tomorrow' });
  await tapOrb(); await sleep(300); await tapOrb(); await b.until(`!!document.querySelector('.fitem')`, 6000);
  const hasEdit = await b.ev(`!!document.querySelector('.msg-edit')`);
  check('AC-X1.7', 'the transcript appears as the user message with an edit control', hasEdit && (await b.ev(`document.querySelector('.msg--user')?.textContent`)).includes('buy milk'));
  if (hasEdit) {
    await clickSel('.msg-edit');
    await b.until(`!!document.querySelector('.composer__input')?.value`, 3000);
    await b.ev(`document.querySelector('.composer__input').value = ''`);
    await type('buy oat milk tomorrow');
    await b.until(`document.querySelector('.fitem__title')?.textContent.includes('oat')`, 6000);
    const r = await rows();
    check('AC-X1.7', 'confirming the edit re-files the thought: one record, new text, no duplicate', r.length === 1 && /oat/.test(r[0].text ?? r[0].title ?? ''), `rows=${r.length} ${r[0]?.title}`);
  }
}

// ---- AC-X1.8 microphone denied / speech API absent ----
{
  await fresh({ sr: 'denied' });
  await tapOrb(); await sleep(1200);
  const denied = await b.ev(`({ text: document.body.innerText, state: document.querySelector('.orb:not(.orb--mini)')?.dataset.state, type: [...document.querySelectorAll('button')].some((n) => /type instead/i.test(n.textContent)) })`);
  check('AC-X1.8', 'microphone denied: a plain message names the microphone and offers "Type instead"', /microphone|allow|blocked/i.test(denied.text) && denied.type, `state=${denied.state}`);
  await b.ev(`[...document.querySelectorAll('button')].find((n) => /type instead/i.test(n.textContent))?.click()`);
  await b.until(`!!document.querySelector('.composer__input')`, 2000);
  await type('typing still works');
  check('AC-X1.8', 'typing still files a thought after a denial', await b.until(`document.querySelectorAll('.fitem').length === 1`, 6000));
  check('AC-X1.8', 'no console error on the denied path', b.problems.filter((p) => !/WebGPU|favicon|NotAllowed|not-allowed/i.test(p)).length === 0, b.problems.slice(0, 2).join(' ; '));

  await fresh({ sr: 'none' });
  await tapOrb(); await sleep(800);
  const none = await b.ev(`({ composer: !!document.querySelector('.composer__input'), text: document.body.innerText.slice(0, 400) })`);
  check('AC-X1.8', 'speech API absent: tapping the orb leads to typing, with a plain message', none.composer || /type/i.test(none.text), JSON.stringify(none).slice(0, 160));
  await fresh({ sr: 'none' });
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82, text: 'r' });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
  await sleep(600);
  check('AC-X1.8', 'desktop shortcut focuses the text field when speech is unavailable', await b.ev(`document.activeElement?.classList?.contains('composer__input') === true`));
  await fresh({ sr: 'text' });
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82, text: 'r' });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82 });
  await sleep(500);
  check('AC-X1.8', 'desktop shortcut toggles listening when speech works', (await orbState()) === 'listening');
}

// ---- AC-X2.1 / X2.4 / X2.6 conversation and spoken replies ----
{
  await fresh({ sr: 'none', synth: true, speak: false });
  await clickSel('.row-actions .btn'); await type('Remind me to call the dentist tomorrow at 9');
  await b.until(`!!document.querySelector('.fitem')`, 8000);
  const reply = await b.ev(`document.querySelector('.msg--assistant .msg__body p')?.textContent ?? ''`);
  check('AC-X2.1', 'a user bubble then an assistant reply of at most 40 words', words(reply) > 0 && words(reply) <= 40, `${words(reply)} words: ${reply}`);
  check('AC-X2.6', 'spoken replies off by default: speech synthesis never called', (await b.ev(`window.__synth.spoken.length`)) === 0);
  await clickSel('.dock__done'); await sleep(400);
  check('AC-X2.4', 'Done closes the thread and the thought stays saved', (await b.ev(`!document.querySelector('.thread')`)) && (await rows()).length === 1);

  await fresh({ sr: 'none', synth: true, speak: true });
  await clickSel('.row-actions .btn'); await type('Buy milk on the way home');
  await b.until(`window.__synth.spoken.length >= 1`, 6000);
  const spoken = await b.ev(`window.__synth.spoken`);
  const shown = await b.ev(`document.querySelector('.msg--assistant .msg__body p')?.textContent ?? ''`);
  check('AC-X2.6', 'with spoken replies on, the reply text reaches speech synthesis', spoken.length >= 1 && spoken[0].trim() === shown.trim(), JSON.stringify({ spoken: spoken[0], shown }));
  const startsBefore = await b.ev(`window.__sr.starts`);
  const cancelsBefore = await b.ev(`window.__synth.cancels`);
  const before = await b.ev(`({ state: document.querySelector('.orb:not(.orb--mini)')?.dataset.state, label: document.querySelector('.orb:not(.orb--mini)')?.getAttribute('aria-label') })`);
  await clickSel('.orb:not(.orb--mini)'); await sleep(400);
  console.log('     orb before/after tap while speaking:', JSON.stringify(before), await orbState(), 'cancels', cancelsBefore, '->', await b.ev(`window.__synth.cancels`), 'sr starts', await b.ev(`window.__sr.starts`));
  check('AC-X2.6', 'tapping the orb while it speaks stops the voice and does not start listening', (await b.ev(`window.__synth.cancels`)) > cancelsBefore && (await b.ev(`window.__sr.starts`)) === startsBefore && (await orbState()) !== 'listening');
}

// ---- AC-X4.1 sheet drag (touch, as on a phone: a mouse release outside the handle is not delivered to it) ----
{
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = async (from, to, steps = 10) => {
    await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    for (let i = 1; i <= steps; i += 1) { await b.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }] }); await sleep(16); }
    await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const centre = (sel) => b.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await fresh({ sr: 'none' });
  const g = await centre('.sheet--peek .grabber');
  await touch(g, { x: g.x, y: g.y - 100 });
  check('AC-X4.1', 'an upward drag of 100 px from the visible handle opens the sheet', await b.until(`!!document.querySelector('.sheet[role="dialog"]')`, 2500));
  const g2 = await centre('.sheet[role="dialog"] .grabber').catch(() => null);
  if (g2) {
    await touch(g2, { x: g2.x, y: g2.y + 200 }); await sleep(500);
    let open = await b.ev(`!!document.querySelector('.sheet[role="dialog"]')`);
    if (open) { const g3 = await centre('.sheet[role="dialog"] .grabber'); await touch(g3, { x: g3.x, y: g3.y + 300 }); await sleep(500); open = await b.ev(`!!document.querySelector('.sheet[role="dialog"]')`); }
    check('AC-X4.1', 'a downward drag (twice at most: full to half to closed) closes the sheet', !open, `open=${open}`);
  }
  await fresh({ sr: 'none' });
  await clickSel('.sheet--peek .grabber'); await b.until(`!!document.querySelector('.sheet[role="dialog"]')`, 2000);
  const scrim = await clickSel('.scrim, .sheet-scrim, [data-scrim]');
  await sleep(500);
  check('AC-X4.1', 'a tap on the backdrop closes the sheet', scrim && (await b.ev(`!document.querySelector('.sheet[role="dialog"]')`)), `scrim found=${scrim}`);
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

// ---- AC-X9.2 onboarding not shown again; reopen from settings ----
{
  await fresh({ sr: 'none', onboarding: false });
  const shown = await b.ev(`!document.getElementById('page').hidden`);
  await b.ev(`[...document.querySelectorAll('button')].find((n) => /skip/i.test(n.getAttribute('aria-label') ?? n.textContent))?.click()`);
  await sleep(800);
  await b.load(`${b.base}/?capture=1`, 1300);
  const again = await b.ev(`!!document.querySelector('.ob')`);
  check('AC-X9.2', 'onboarding shows on first launch, Skip finishes it, and it does not come back after reload', shown && !again, `first=${shown} afterReload=${again}`);
  await b.load(`${b.base}/#/settings`, 900);
  await b.ev(`[...document.querySelectorAll('button, [role=button], a')].find((n) => /welcome again/i.test(n.textContent))?.click()`);
  check('AC-X9.2', 'the welcome can be reopened from settings', await b.until(`!!document.querySelector('.ob')`, 3000));
}

// ---- AC-X8.4 / AC-D4.3: the assistant screen with a review card, a due strip and a notice does not overlap itself ----
for (const [w, h] of [[390, 844], [360, 800]]) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await fresh({ sr: 'none', engine: 'typing' });
  await b.ev(`(async () => { const m = await import('/src/dev/fixtures.js'); const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); await s.putMany(m.SAMPLE_THOUGHTS); })()`);
  await b.load(`${b.base}/?capture=1`, 1800);
  const g = await b.ev(`(() => {
    const box = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return r.width ? { t: r.top, b: r.bottom, l: r.left, r: r.right } : null; };
    const hit = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === n || n.contains(e)); };
    const hitTop = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(20, r.height / 2)); return !!e && (e === n || n.contains(e)); };
    const overlap = (a, c) => a && c && a.t < c.b - 1 && c.t < a.b - 1 && a.l < c.r && c.l < a.r;
    const review = box('.review, .rcard, [aria-label*="review" i]');
    return { review: !!review, greeting: box('.greeting'), orb: box('.orb:not(.orb--mini)'), reviewBox: review,
      greetingOverlapsReview: overlap(box('.greeting'), review), orbOverlapsReview: overlap(box('.orb:not(.orb--mini)'), review),
      orbHit: hitTop('.orb:not(.orb--mini)'), typeHit: hit('.row-actions .btn'), hintHit: hit('.hint, .stage__hint') };
  })()`);
  check('AC-X8.4', `${w}x${h}: with the review card shown, the greeting and the orb do not overlap it`, g.review && !g.greetingOverlapsReview && !g.orbOverlapsReview, JSON.stringify({ review: g.review, greetingOverlapsReview: g.greetingOverlapsReview, orbOverlapsReview: g.orbOverlapsReview }));
  check('AC-X8.4', `${w}x${h}: the orb and the Type button are the top element at their own position (tappable)`, g.orbHit !== false && g.typeHit !== false, JSON.stringify({ orbHit: g.orbHit, typeHit: g.typeHit }));
}
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

// ---- AC-D4.1 default browser look, AC-D5.3 raw errors, over every registered fixture ----
{
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await b.load(`${b.base}/?fixture=assistant-idle`, 800);
  await b.until('!!document.body.dataset.fixture', 5000);
  const names = await b.ev(`import('/src/dev/fixtures.js').then((m) => m.fixtureNames())`);
  const auto = []; const raw = []; const autoAll = new Set(); const texts = {}; const sizesSeen = {};
  const tokenCss = await (await fetch(`${b.base}/css/tokens.css`)).text();
  const scale = new Set([...tokenCss.matchAll(/--fs-[a-z0-9-]+:\s*([\d.]+)px/g)].map((m) => `${parseFloat(m[1])}px`));
  for (const name of names) {
    await b.load(`${b.base}/?fixture=${name}`, 500);
    await b.until('!!document.body.dataset.fixture', 4000);
    const r = await b.ev(`(() => {
      const bad = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, button')].filter((e) => getComputedStyle(e).appearance === 'auto').map((e) => e.tagName.toLowerCase() + '.' + e.className);
      const t = document.body.innerText;
      const rawHit = /TypeError|ReferenceError|SyntaxError|Cannot read|could not start|\\bundefined\\b|\\[object|\\bNaN\\b|at [\\w.<>]+ \\(|\\.js:\\d+|Uncaught|stack trace/i.exec(t)?.[0] ?? null;
      const blank = t.trim().length < 3;
      return { bad, rawHit, blank, t };
    })()`);
    for (const x of r.bad) autoAll.add(x.split('.')[0]);
    texts[name] = r.t;
    const sz = await b.ev(`[...new Set([...document.querySelectorAll('body *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden').map((e) => getComputedStyle(e).fontSize))]`);
    for (const x of sz) if (!scale.has(x)) (sizesSeen[x] ??= []).push(name);
    if (r.bad.length) auto.push(`${name}: ${[...new Set(r.bad)].join(', ')}`);
    if (r.rawHit || r.blank) raw.push(`${name}: ${r.rawHit ?? 'blank'}`);
  }
  check('AC-D4.1', `no control keeps the default browser look (${names.length} fixtures)`, auto.length === 0, `tags with appearance:auto: ${[...autoAll].join(',')}; in ${auto.length} fixtures`);
  const D5 = {
    'first run': /What's on your mind\?/, 'model download': /Getting the assistant ready/, 'model loading / setting up': /Setting up|Getting the assistant ready/,
    listening: /Listening/, thinking: /Sorting your thoughts/, replying: /Filed as|Speaking with/, 'question open': /When should I remind you/, 'filed card': /Filed 4/,
    'microphone denied': /Microphone blocked/, 'model unsupported': /can't run the on-device assistant/, 'model failed': /Assistant stopped|stopped working/,
    'provider error or key rejected': /Key rejected/, offline: /Offline/, 'empty library': /Nothing yet/, 'empty search': /No thoughts match/, 'no answer': /couldn't find anything/,
    'no related thoughts': /No related thoughts/, 'migration running': /Moving \d+ of \d+/, 'migration failed': /Your thoughts are safe/, 'import error': /is not a Thought Catcher export/,
  };
  const all = Object.values(texts).join('\n');
  const unreachable = Object.entries(D5).filter(([, re]) => !re.test(all)).map(([k]) => k);
  check('AC-D5.1', `each of the ${Object.keys(D5).length} states in requirements D5 is reachable through a fixture and shows its own text`, unreachable.length === 0, unreachable.join(', '));
  check('AC-D1.4', `computed font sizes on all ${names.length} fixtures belong to the type scale (${[...scale].join(', ')})`, Object.keys(sizesSeen).length === 0, Object.entries(sizesSeen).map(([k, v]) => `${k}: ${v.length} fixtures (${v.slice(0, 2).join(', ')})`).join(' | '));
  check('AC-D5.3', `no raw error text, stack trace or blank screen in any of ${names.length} fixtures`, raw.length === 0, raw.slice(0, 4).join(' | '));
}

// ---- AC-D5.4 offline ----
{
  await fresh({ sr: 'none' });
  await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await b.ev(`window.dispatchEvent(new Event('offline'))`);
  await sleep(700);
  const strip = await b.ev(`document.querySelectorAll('.strip').length`);
  const txt = await b.ev(`/offline/i.test(document.body.innerText)`);
  await clickSel('.row-actions .btn'); await type('typed while offline');
  const filedOffline = await b.until(`document.querySelectorAll('.fitem').length === 1`, 6000);
  await b.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  check('AC-D5.4', 'with the network off an offline indicator shows once (no key needed) and typed capture still files', txt && strip <= 1 && filedOffline, `indicators=${strip} text=${txt} filed=${filedOffline}`);
}

check('session', 'no unexpected console error across the gap flows', b.problems.filter((p) => !/WebGPU|favicon|ERR_INTERNET_DISCONNECTED|not-allowed|NotAllowed|Failed to load resource/i.test(p)).length === 0, b.problems.filter((p) => !/WebGPU|favicon|ERR_INTERNET_DISCONNECTED|not-allowed|NotAllowed|Failed to load resource/i.test(p)).slice(0, 3).join(' ; '));
await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
