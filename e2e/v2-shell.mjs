// Real-browser flows for the v2 shell (S1): onboarding gate, typed capture, thread, filed card corrections, Undo, Done,
// intent routing, orb states, reduced motion, mic level, no console error, requests only to the local server.
// Run outside the Bash sandbox: node e2e/v2-shell.mjs      Exit 0 = every check passed.
import { launch, sleep } from './lib/cdp.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`); if (!ok) failed += 1; };

const b = await launch({ chromeArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const type = async (text) => { await b.ev(`document.querySelector('.composer__input').focus()`); await b.send('Input.insertText', { text }); await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
const rows = () => b.ev(`(async () => { const { createIdbStore } = await import('/src/storage/idb.js'); const s = await createIdbStore(indexedDB); return s.getAll(); })()`);
const click = (sel) => b.ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return false; n.click(); return true; })()`);

// ---- first run: onboarding gate (S3's screen), then the assistant ----
await b.load(`${b.base}/?capture=1`, 1200);
const firstRun = await b.ev(`({ onboarding: !document.getElementById('page').hidden, hasOrb: !!document.querySelector('.orb') })`);
check('first launch shows onboarding first (AC-X9.3: no prompt, download or key before it ends)', firstRun.onboarding, JSON.stringify(firstRun));
await b.ev(`localStorage.setItem('thought-catcher.onboarding.done', 'true'); localStorage.setItem('thought-catcher.speech.engine', '"typing"')`);
await b.load(`${b.base}/?capture=1`, 1200);

const idle = await b.ev(`({ orb: document.querySelector('.orb')?.dataset.state, label: document.querySelector('.orb')?.getAttribute('aria-label'), pill: document.querySelector('.pill')?.textContent, greeting: document.querySelector('.greeting')?.textContent, peek: !!document.querySelector('.sheet--peek'), size: (() => { const r = document.querySelector('.orb').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() })`);
check('idle screen: orb in a resting state with its label', ['idle', 'basic'].includes(idle.orb) && idle.label === 'Tap to talk', JSON.stringify(idle));
check('idle screen: orb is 184 px, greeting, pill and library peek present', idle.size[0] === 184 && !!idle.greeting && !!idle.pill && idle.peek, JSON.stringify(idle));
check('no horizontal scroll on the assistant', (await b.ev('document.documentElement.scrollWidth - innerWidth')) === 0);

// ---- typing is one tap away ----
check('Type button opens the composer', await click('.row-actions .btn') && await b.until(`!!document.querySelector('.composer__input')`, 2000));
await type('Remind me to call the dentist tomorrow at 9');
check('typed message: bubble, then a filed card', await b.until(`!!document.querySelector('.msg--user') && !!document.querySelector('.fitem')`, 8000));
const filed = await b.ev(`({ user: document.querySelector('.msg--user')?.textContent, title: document.querySelector('.fitem__title')?.textContent, badge: document.querySelector('.badge--btn')?.textContent, reply: document.querySelector('.msg--assistant .msg__body p')?.textContent })`);
check('filed card shows type badge and a reply sentence', /Reminder/.test(filed.badge) && /Filed/.test(filed.reply ?? ''), JSON.stringify(filed));
let stored = await rows();
check('the thought is stored once, as a reminder with a due time (AC-X2.5)', stored.length === 1 && stored[0].type === 'reminder' && !!stored[0].due_at, `n=${stored.length}`);

// ---- one-tap correction: change type to Idea ----
await click('.badge--btn');
check('type badge opens a four-option menu', await b.until(`document.querySelectorAll('.menu .menu__item').length === 4`, 2000));
await b.ev(`[...document.querySelectorAll('.menu__item')].find((n) => /Idea/.test(n.textContent)).click()`);
await sleep(400);
stored = await rows();
check('choosing Idea re-files the stored thought', stored[0].type === 'idea', stored[0].type);

// ---- Done clears the thread ----
await click('.dock__done');
check('Done returns to the idle screen', await b.until(`!!document.querySelector('.stage') && !document.querySelector('.thread')`, 2000));
check('the library peek counts the thought', await b.ev(`/1/.test(document.querySelector('.typedots')?.textContent ?? '')`));

// ---- a ramble: several thoughts, keep as one, undo ----
await click('.row-actions .btn');
await b.until(`!!document.querySelector('.composer__input')`, 2000);
await type('Call the dentist about the crown. Buy milk and eggs on the way home. I had an idea for a bread baking workshop.');
check('a ramble files more than one thought', await b.until(`document.querySelectorAll('.fitem').length >= 2`, 8000), `n=${await b.ev(`document.querySelectorAll('.fitem').length`)}`);
const many = await b.ev(`document.querySelectorAll('.fitem').length`);
if (many >= 2) {
  check('group header offers Keep as one and Undo all', await b.ev(`/Keep as one/.test(document.querySelector('.filed__head')?.textContent ?? '') && /Undo all/.test(document.querySelector('.filed__head')?.textContent ?? '')`));
  const before = (await rows()).length;
  await b.ev(`[...document.querySelectorAll('.filed__acts .btn')].find((n) => /Undo all/.test(n.textContent)).click()`);
  await sleep(500);
  const after = (await rows()).length;
  check('Undo all removes the group and a toast offers Undo', after === before - many && await b.ev(`!!document.querySelector('.toast .btn')`), `${before} -> ${after}`);
  await click('.toast .btn');
  await sleep(500);
  check('Undo puts the thoughts back', (await rows()).length === before);
}
await click('.dock__done');
await sleep(300);

// ---- intent routing: a question is not stored as a thought ----
const countBefore = (await rows()).length;
await click('.row-actions .btn');
await b.until(`!!document.querySelector('.composer__input')`, 2000);
await type('what did I say about the dentist?');
check('a question shows an answer in the thread', await b.until(`document.querySelectorAll('.msg--assistant').length >= 1 && !document.querySelector('.shimmer')`, 8000));
check('the question is not stored as a thought', (await rows()).length === countBefore);
await click('.dock__done');

// ---- library sheet: peek opens it, Back closes it (AC-X4.1) ----
await click('.sheet--peek .grabber');
check('the peek opens the library sheet at #/library', await b.until(`location.hash === '#/library' && !!document.querySelector('.sheet[role="dialog"]')`, 3000));
await b.ev('history.back()');
check('Back closes the sheet and leaves the assistant', await b.until(`!document.querySelector('.sheet[role="dialog"]') && !!document.querySelector('.orb')`, 3000));

// ---- tapping the orb with typing chosen opens the composer, never the microphone ----
await click('.orb');
check('orb tap with "typing" chosen opens the composer', await b.until(`!!document.querySelector('.composer__input')`, 3000));
await b.ev(`document.querySelector('.composer .iconbtn')?.click()`);

// ---- orb: hold and states, reduced motion ----
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await sleep(300);
const loops = await b.ev(`document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity && a.playState === 'running').length`);
check('reduced motion: no infinite animation is running (AC-D3.3)', loops === 0, `running=${loops}`);
await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

// ---- microphone level reaches the orb ----
const level = await b.ev(`(async () => {
  const { createLevelMeter } = await import('/src/ui/orb/level.js');
  const { createOrb } = await import('/src/ui/orb/orb.js');
  const orb = createOrb({ state: 'listening' });
  document.body.append(orb.el);
  const seen = [];
  const meter = createLevelMeter({ onLevel: (v) => { seen.push(v); orb.setLevel(v); } });
  const ok = await meter.start();
  await new Promise((r) => setTimeout(r, 900));
  const css = orb.el.style.getPropertyValue('--level');
  meter.stop();
  orb.el.remove();
  return { ok, n: seen.length, max: Math.max(0, ...seen), css };
})()`);
check('AnalyserNode drives --level from the microphone (fake device)', level.ok && level.n > 5 && level.max > 0, JSON.stringify(level));

// ---- read-only store: no Type, no orb capture (G26) ----
await b.load(`${b.base}/?fixture=migration-failed`, 1200);
const ro = await b.ev(`({ type: !!document.querySelector('.row-actions'), orbDisabled: document.querySelector('.orb')?.disabled, notice: /Couldn't update your thoughts/.test(document.body.innerText) })`);
check('migration failed: notice shown, Type not offered, orb disabled (G26)', ro.notice && !ro.type && ro.orbDisabled, JSON.stringify(ro));

// ---- session-level ----
check('no console error or exception in the whole session', b.problems.filter((p) => !/WebGPU|favicon/.test(p)).length === 0, b.problems.filter((p) => !/WebGPU|favicon/.test(p)).slice(0, 3).join(' ; '));
const foreign = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:') && !u.startsWith('blob:'));
check('no request leaves the local server', foreign.length === 0, foreign.slice(0, 3).join(', '));

await b.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
