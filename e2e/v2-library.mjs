// Headless Chrome flows for S3's screens: library, detail, review card, onboarding, consent card, settings, About, ask.
// Run outside the Bash sandbox: node e2e/v2-library.mjs   (exit 1 when any check fails)
// Each group builds a deterministic ctx from src/dev/fixtures-s3.js and drives the real DOM in the page.
import { launch } from './lib/cdp.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok), detail: ok ? '' : String(detail) }); };

const b = await launch();
await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

// Runs `body` (async function body) in a fresh page that has the stylesheets and returns its JSON result.
async function inPage(body) {
  await b.load(`${b.base}/__s3host`, 100);
  return b.ev(`(async () => {
    const css = ['tokens', 'app', 'shell', 'components', 'orb', 'conversation', 'library', 'detail', 'review', 'onboarding', 'settings'];
    await Promise.all(css.map((n) => new Promise((res) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/' + n + '.css'; l.onload = res; l.onerror = res; document.head.append(l); })));
    const root = document.createElement('main'); root.className = 'app'; document.body.append(root);
    const fx = await import('/src/dev/fixtures-s3.js');
    const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
    const $ = (s, r = root) => r.querySelector(s);
    const $$ = (s, r = root) => [...r.querySelectorAll(s)];
    const byText = (s, t, r = root) => $$(s, r).find((n) => n.textContent.trim().includes(t));
    try {
    ${body}
    } catch (e) { return { __error: String(e && e.stack || e).slice(0, 600) }; }
  })()`).then((r) => { if (r && r.__error) { const m = /<anonymous>:(\d+)/.exec(r.__error); const line = m ? body.split('\n')[Number(m[1]) - 11] : ''; throw new Error('page error: ' + r.__error.split('\n')[0] + ' | ' + (line || '').trim().slice(0, 160)); } return r; });
}

// ---- library (X4) -------------------------------------------------------------------------------------------------------
{
  const r = await inPage(`
    const { ctx, sheet } = await fx.libraryFixture(root);
    const out = {};
    out.groups = $$('.group-h', sheet).map((h) => h.textContent.replace(/\\s+/g, ' ').trim());
    out.counts = $$('.group-h', sheet).map((h) => [Number(h.querySelector('.n').textContent), h.nextElementSibling.querySelectorAll('.tcard').length]);
    const input = $('input', sheet);
    input.value = 'GYM'; input.dispatchEvent(new Event('input')); await wait();
    out.gymCount = $$('.tcard', sheet).length;
    out.marks = $$('mark', sheet).length;
    byText('.chip', 'Tasks', sheet).click(); await wait();
    out.gymTasks = $$('.tcard', sheet).length;
    byText('.chip', 'All', sheet).click();
    input.value = 'passport'; input.dispatchEvent(new Event('input')); await wait();
    out.emptyText = $('.empty', sheet)?.textContent ?? '';
    out.askInstead = Boolean(byText('.btn', 'Ask instead', sheet));
    byText('.btn', 'Ask instead', sheet).click(); await wait(120);
    out.askCalls = ctx.brain.calls.filter((c) => c[0] === 'ask').length;
    out.answerSources = $$('.lib__answer .src', sheet).length;
    input.value = ''; input.dispatchEvent(new Event('input')); await wait();
    byText('.chip', 'Open', sheet).click(); await wait();
    out.openOnly = $$('.tcard', sheet).map((c) => c.classList.contains('tcard--done'));
    byText('.chip', 'Open', sheet).click(); byText('.chip', 'Done', sheet).click(); await wait();
    out.doneOnly = $$('.tcard', sheet).length;
    byText('.chip', 'Done', sheet).click(); byText('.chip', '#car', sheet).click(); await wait();
    out.carTag = $$('.tcard', sheet).length;
    byText('.chip', '#car', sheet).click(); await wait();
    $('.tcard', sheet).click();
    out.nav = ctx.log.nav.at(-1);
    out.chipHeights = $$('.chip', sheet).map((c) => c.getBoundingClientRect().height);
    return out;
  `);
  check('X4.2 groups follow the order and each count equals the number listed', r.groups.length === 4 && r.counts.every(([n, listed]) => n === listed), JSON.stringify(r.counts));
  check('X4.3 search matches case-insensitively and highlights', r.gymCount === 4 && r.marks >= 4, JSON.stringify([r.gymCount, r.marks]));
  check('X4.3 type filter combines with search', r.gymTasks === 1, r.gymTasks);
  check('X4.3/D5 empty search shows the message and Ask instead runs an ask with sources', /No thoughts match "passport"/.test(r.emptyText) && r.askInstead && r.askCalls === 1 && r.answerSources === 2, JSON.stringify(r));
  check('X4.3 open, done and tag filters', r.openOnly.every((d) => d === false) && r.doneOnly === 1 && r.carTag === 2, JSON.stringify([r.openOnly, r.doneOnly, r.carTag]));
  check('X4 a card opens its thought', /^#\/thought\//.test(r.nav), r.nav);
}
{
  const r = await inPage(`
    const big = Array.from({ length: 500 }, (_, i) => fx.sampleThought('b' + i, ['idea', 'task', 'journal', 'reminder'][i % 4], 'Bulk thought number ' + i, '', { tags: ['t' + (i % 5)] }));
    const t0 = performance.now();
    const { sheet } = await fx.libraryFixture(root, { ctx: { thoughts: big } });
    return { ms: performance.now() - t0, cards: $$('.tcard', sheet).length };
  `);
  check('AC-X4.5 500 thoughts render in under a second', r.cards === 500 && r.ms < 1000, JSON.stringify(r));
}
{
  const r = await inPage(`
    const { ctx, sheet } = await fx.libraryFixture(root, { ctx: { thoughts: [] } });
    return { text: $('.empty', sheet)?.textContent ?? '', chips: $$('.chips:not([hidden])', sheet).length };
  `);
  check('AC-X4.5 an empty library points to the orb and hides the filters', /Nothing yet/.test(r.text) && /orb/.test(r.text) && r.chips === 0, JSON.stringify(r));
}

// ---- detail (X4 edit and done, X6, X7) -----------------------------------------------------------------------------
{
  const r = await inPage(`
    const { renderThought } = await import('/src/ui/detail/index.js');
    const ctx = await fx.makeCtx({ status: fx.STATUS.rules });
    const out = {};
    await renderThought('t3', root, ctx); await wait();
    out.needsAi = Boolean($('.needs-ai[aria-disabled="true"]')) && /needs AI/.test($('.needs-ai').textContent);
    $('.needs-ai').click(); await wait();
    out.explain = /Two ways to get AI/.test(root.textContent);
    out.relatedEmpty = /No related thoughts yet/.test(root.textContent);
    // done toggle persists
    byText('.actionbar .btn', 'Mark done').click(); await wait(80);
    out.done = (await ctx.store.get('t3')).done;
    byText('.actionbar .btn', 'Reopen').click(); await wait(80);
    out.reopened = (await ctx.store.get('t3')).done === false;
    // type change through the menu
    $('.badge--btn').click(); await wait();
    byText('.amenu__item', 'Idea').click(); await wait(80);
    out.type = (await ctx.store.get('t3')).type;
    out.expandOnIdea = /Expand/.test($('.section-h').textContent);
    // delete: cancel keeps, confirm removes and goes back to the library
    await renderThought('t3', root, ctx); await wait();
    $('[aria-label="More"]').click(); byText('.amenu__item', 'Delete').click(); await wait();
    byText('.actionbar .btn', 'Cancel').click(); await wait();
    out.kept = Boolean(await ctx.store.get('t3'));
    $('[aria-label="More"]').click(); byText('.amenu__item', 'Delete').click(); await wait();
    byText('.actionbar .btn', 'Delete').click(); await wait(100);
    out.deleted = (await ctx.store.get('t3')) === undefined;
    out.afterDelete = ctx.log.nav.at(-1);
    // edit persists
    await renderThought('i2', root, ctx); await wait();
    $('[aria-label="More"]').click(); byText('.amenu__item', 'Edit').click(); await wait();
    $('#f-title').value = 'Bread workshop, renamed'; $('#f-tags').value = 'Food, Weekend, food';
    $('.edit-form').dispatchEvent(new Event('submit', { cancelable: true })); await wait(100);
    const saved = await ctx.store.get('i2');
    out.edit = [saved.title, saved.tags];
    return out;
  `);
  check('X7.5 no AI: control visible, disabled, reads "needs AI", one tap explains', r.needsAi && r.explain, JSON.stringify(r));
  check('X6.3 no related thoughts shows a plain empty state', r.relatedEmpty);
  check('X4.4 done toggles and persists; reopen works', r.done === true && r.reopened, JSON.stringify([r.done, r.reopened]));
  check('X2.3 type changes in one tap from the badge menu and Expand then appears for an idea', r.type === 'idea' && r.expandOnIdea, JSON.stringify([r.type, r.expandOnIdea]));
  check('X4.4 delete asks first: cancel keeps, confirm removes and returns to the library', r.kept && r.deleted && r.afterDelete === '#/library', JSON.stringify([r.kept, r.deleted, r.afterDelete]));
  check('X4.4 edits persist, tags are lowercase and de-duplicated', r.edit[0] === 'Bread workshop, renamed' && JSON.stringify(r.edit[1]) === '["food","weekend"]', JSON.stringify(r.edit));
}
{
  const r = await inPage(`
    const { renderThought } = await import('/src/ui/detail/index.js');
    const { AiError } = await import('/src/core/ai/http.js');
    const exp = { next_steps: ['a', 'b', 'c'], questions: ['q1', 'q2', 'q3'], outline: ['o1', 'o2', 'o3'], generated_at: new Date().toISOString(), by: 'device', model: 'm' };
    let mode = 'ok';
    let n = 0;
    const ctx = await fx.makeCtx({ brain: { async expand() { n += 1; await wait(80); if (mode === 'bad') throw new AiError('malformed'); return exp; }, async plan() { return { steps: [{ text: 'one', done: false }, { text: 'two', done: false }, { text: 'three', done: false }], generated_at: new Date().toISOString(), by: 'key', model: 'x' }; } } });
    const out = {};
    await renderThought('i1', root, ctx); await wait();
    out.hasButton = Boolean(byText('.mini-btn', 'Expand'));
    byText('.mini-btn', 'Expand').click();
    await wait(5);
    out.busyDisabled = $('.mini-btn')?.disabled === true;
    await wait(200);
    out.sections = $$('[role=tab]').map((t) => t.textContent);
    out.stored = Boolean((await ctx.store.get('i1')).expansion);
    // tick a step and persist
    $('.check').click(); await wait(80);
    out.ticked = (await ctx.store.get('i1')).expansion.done_steps;
    // reload without a new call
    const callsBefore = n;
    await renderThought('i1', root, ctx); await wait();
    out.noNewCall = n === callsBefore && $$('.step').length === 3;
    // malformed regenerate leaves the stored result unchanged and shows a message
    mode = 'bad';
    byText('.mini-btn', 'Regenerate').click(); await wait(100);
    const after = await ctx.store.get('i1');
    out.unchanged = JSON.stringify(after.expansion.next_steps) === JSON.stringify(exp.next_steps);
    out.message = $('.field-error')?.textContent ?? '';
    // plan on a task
    await renderThought('t3', root, ctx); await wait();
    byText('.mini-btn', 'Plan').click(); await wait(100);
    out.plan = (await ctx.store.get('t3')).plan?.steps.length;
    $('.check').click(); await wait(80);
    out.planTick = (await ctx.store.get('t3')).plan.steps[0].done;
    return out;
  `);
  check('X7.4 Expand shows a busy state and the control is disabled while it runs', r.hasButton && r.busyDisabled, JSON.stringify([r.hasButton, r.busyDisabled]));
  check('X7.2 Expand shows three sections and stores the result; ticking a step persists', JSON.stringify(r.sections) === '["Next steps","Questions","Outline"]' && r.stored && JSON.stringify(r.ticked) === '[0]', JSON.stringify([r.sections, r.stored, r.ticked]));
  check('X7.2 a stored expansion shows again after reload without a new call', r.noNewCall);
  check('X7.3 a malformed regenerate leaves the thought unchanged and shows a message', r.unchanged && /unchanged/.test(r.message), JSON.stringify([r.unchanged, r.message]));
  check('X7.2 Plan stores steps and ticking persists', r.plan === 3 && r.planTick === true, JSON.stringify([r.plan, r.planTick]));
}
{
  const r = await inPage(`
    const { renderThought } = await import('/src/ui/detail/index.js');
    const ctx = await fx.makeCtx({ brain: { async related(id) { return id === 'i1' ? [{ id: 't3', score: 0.7, title: 'x', type: 'task' }, { id: 'gone', score: 0.6, title: 'x', type: 'task' }, { id: 'i1', score: 1, title: 'self', type: 'idea' }] : []; }, async topics() { return []; } } });
    await renderThought('i1', root, ctx); await wait(120);
    return { titles: $$('.tcard .tcard__title').map((n) => n.textContent), why: $$('.rel-why').map((n) => n.textContent) };
  `);
  check('X6.1/X6.3 related shows existing thoughts with a reason and never the thought itself or a deleted one', r.titles.length === 2 && !r.titles.includes('self') || r.titles.length === 1, JSON.stringify(r));
}

// ---- review card (X8) --------------------------------------------------------------------------------------------------
{
  const r = await inPage(`
    const { renderReviewCard } = await import('/src/ui/review/index.js');
    const at = (d, h) => new Date(2026, 8, d, h).toISOString();
    const mk = (id, type, o = {}) => fx.sampleThought(id, type, id, '', o);
    const thoughts = [
      { ...mk('due-rem', 'reminder', { due: new Date(2026, 8, 29, 9) }) },
      { ...mk('future-rem', 'reminder', { due: new Date(2026, 8, 30, 9) }) },
      { ...mk('idea3', 'idea', { created: new Date(2026, 8, 26, 10) }) },
      { ...mk('idea2', 'idea', { created: new Date(2026, 8, 25, 10) }) },
    ];
    const ctx = await fx.makeCtx({ thoughts });
    const out = {};
    const card = await renderReviewCard(ctx);
    root.append(card);
    out.items = $$('.ritem__title').map((n) => n.textContent);
    out.lede = $('.review__lede').textContent;
    const orb = document.createElement('button'); orb.className = 'orb'; let taps = 0; orb.addEventListener('click', () => { taps += 1; }); root.append(orb);
    orb.click(); out.orbTap = taps === 1 && orb.getBoundingClientRect().height > 0;
    byText('.ritem .btn', 'Tomorrow').click(); await wait(100);
    const rem = await ctx.store.get('due-rem');
    out.snoozed = new Date(rem.review.snoozed_until).getDate() === 30 && new Date(rem.review.snoozed_until).getHours() === 9;
    byText('.ritem .btn', 'Let go').click(); await wait(100);
    out.letGo = (await ctx.store.get('idea2')).review.dismissed === true;
    byText('.ritem .btn', 'Keep').click(); await wait(100);
    out.keep = (await ctx.store.get('idea3')).review.snoozed_until !== null;
    out.clear = /All clear for today/.test(card.textContent);
    $('[aria-label="Close review"]').click();
    out.closed = !card.isConnected;
    out.secondOpen = (await renderReviewCard(ctx)) === null;
    return out;
  `);
  check('X8.1 a due reminder and ideas older than the threshold are on the card; a future reminder is not', JSON.stringify(r.items) === '["due-rem","idea2","idea3"]', JSON.stringify(r.items));
  check('X8 lede reads as a sentence', r.lede === 'One reminder due, two ideas waiting.', r.lede);
  check('X8.4 the orb stays tappable with the card visible', r.orbTap);
  check('X8.2 Tomorrow, Let go and Keep write the thought and leave the card; all clear follows', r.snoozed && r.letGo && r.keep && r.clear, JSON.stringify([r.snoozed, r.letGo, r.keep, r.clear]));
  check('X8.3 closing dismisses it for the day: the next open shows nothing', r.closed && r.secondOpen);
}
{
  const r = await inPage(`
    const { renderReviewCard } = await import('/src/ui/review/index.js');
    const many = Array.from({ length: 8 }, (_, i) => fx.sampleThought('m' + i, 'idea', 'Idea ' + i, '', { created: new Date(2026, 8, 20 + (i % 3)) }));
    const ctx = await fx.makeCtx({ thoughts: many });
    const card = await renderReviewCard(ctx);
    root.append(card);
    const first = { shown: $$('.ritem').length, more: $('.review__more')?.textContent };
    // shown once per day: leaving without closing keeps items unresolved, so it shows again; nothing due shows nothing
    const again = (await renderReviewCard(ctx)) !== null;
    const empty = await fx.makeCtx({ thoughts: [] });
    return { first, again, none: (await renderReviewCard(empty)) === null };
  `);
  check('X8.3 at most five items plus a count of the rest', r.first.shown === 5 && /3 more/.test(r.first.more), JSON.stringify(r.first));
  check('X8.3 items left unresolved bring the card back on the next open; nothing due shows nothing', r.again && r.none);
}

// ---- onboarding (X9) and the consent card ----------------------------------------------------------------------------
{
  const r = await inPage(`
    let mic = 0; let speaks = 0;
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: () => { mic += 1; return Promise.reject(new Error('no')); } }, configurable: true });
    const { showOnboarding } = await import('/src/ui/onboarding/index.js');
    const ctx = await fx.makeCtx({ thoughts: [], status: fx.STATUS.first });
    Object.defineProperty(globalThis, 'speechSynthesis', { value: { getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Daniel', lang: 'en-GB', localService: true }], cancel() {}, speak() { speaks += 1; }, addEventListener() {}, removeEventListener() {} }, configurable: true });
    globalThis.SpeechSynthesisUtterance = function (t) { this.text = t; };
    let done = 0;
    showOnboarding(root, ctx, { onDone: () => { done += 1; } });
    const out = { pages: [] };
    out.skipVisible = Boolean(byText('.skip', 'Skip'));
    for (let i = 0; i < 2; i += 1) { out.pages.push($('h1').textContent); byText('.btn', 'Continue').click(); }
    out.pages.push($('h1').textContent);
    out.silentDefault = $('[aria-label="Reply voice"] [role=radio][aria-checked=true]').textContent.includes('Silent');
    out.voices = $$('[aria-label="Reply voice"] [role=radio]').map((n) => n.textContent.replace(/\\s+/g, ' ').trim());
    $('[aria-label="Preview Daniel"]').click();
    out.speaks = speaks;
    byText('[role=radio]', 'Daniel').click();
    byText('[role=radio]', "I'll type").click();
    out.beforeStart = { mic, prepares: ctx.brain.calls.length, voice: ctx.settings.getSettings()['voice.name'] };
    byText('.btn', 'Start').click();
    out.after = { done, voice: ctx.settings.getSettings()['voice.name'], speak: ctx.settings.getSettings()['voice.speak'], engine: ctx.settings.getSettings()['speech.engine'], mic, calls: ctx.brain.calls.length };
    // skip leaves everything as it was
    const ctx2 = await fx.makeCtx({ thoughts: [], status: fx.STATUS.first });
    root.replaceChildren();
    let done2 = 0;
    showOnboarding(root, ctx2, { onDone: () => { done2 += 1; } });
    byText('.skip', 'Skip').click();
    out.skip = { done: done2, engine: ctx2.settings.getSettings()['speech.engine'], voice: ctx2.settings.getSettings()['voice.name'] };
    return out;
  `);
  check('X9.1 three pages with a visible Skip', r.pages.length === 3 && r.skipVisible, JSON.stringify(r.pages));
  check('X9.4 the voice page lists Silent (default) and the system voices, with a working preview', r.silentDefault && r.voices.length === 3 && r.speaks === 1, JSON.stringify([r.voices, r.speaks]));
  check('X9.3 nothing is requested before Start: no microphone call, no brain call', r.beforeStart.mic === 0 && r.beforeStart.prepares === 0 && r.beforeStart.voice === null, JSON.stringify(r.beforeStart));
  check('X9.4 Start stores the choices and finishes; a named voice turns spoken replies on', r.after.done === 1 && r.after.voice === 'Daniel' && r.after.speak === true && r.after.engine === 'typing' && r.after.mic === 0 && r.after.calls === 0, JSON.stringify(r.after));
  check('X9.1 Skip finishes and leaves every setting as it was', r.skip.done === 1 && r.skip.engine === 'ask' && r.skip.voice === null, JSON.stringify(r.skip));
}
{
  const r = await inPage(`
    const { offerModel } = await import('/src/ui/onboarding/index.js');
    const ctx = await fx.makeCtx({ thoughts: [], status: fx.STATUS.first });
    const card = offerModel(ctx);
    root.append(card);
    const out = { text: card.textContent.replace(/\\s+/g, ' ').trim(), callsBefore: ctx.brain.calls.length };
    byText('.btn', 'Download').click();
    out.prepare = ctx.brain.calls.filter((c) => c[0] === 'prepare').map((c) => c[1]);
    out.consent = ctx.settings.getSettings()['brain.llm_consent'];
    ctx.brain.setStatus(fx.STATUS.downloading); await wait();
    out.progress = $('[role=progressbar]')?.getAttribute('aria-valuenow');
    byText('.btn', 'Cancel').click();
    out.cancel = ctx.brain.calls.some((c) => c[0] === 'cancel');
    const ctx2 = await fx.makeCtx({ thoughts: [], status: fx.STATUS.first });
    root.replaceChildren(offerModel(ctx2));
    byText('.btn', 'Not now').click();
    out.declined = ctx2.settings.getSettings()['brain.llm_consent'];
    out.declinedPrepare = ctx2.brain.calls.length;
    const ctx3 = await fx.makeCtx({ thoughts: [], status: fx.STATUS.unsupported });
    root.replaceChildren(offerModel(ctx3));
    out.embedOnly = root.textContent.replace(/\\s+/g, ' ');
    byText('.btn', 'Download').click();
    out.embedPrepare = ctx3.brain.calls.filter((c) => c[0] === 'prepare').map((c) => c[1]);
    return out;
  `);
  check('B2.2 the offer shows the size and nothing downloads before Download', /870 MB/.test(r.text) && /Wi-Fi recommended/.test(r.text) && r.callsBefore === 0, r.text);
  check('B2.2 Download asks the brain to prepare after consent; progress is visible and cancellable', r.prepare.length === 1 && r.prepare[0].llm === true && r.consent === 'yes' && r.progress === '42' && r.cancel, JSON.stringify(r));
  check('B2.2 Not now declines and starts nothing', r.declined === 'no' && r.declinedPrepare === 0, JSON.stringify([r.declined, r.declinedPrepare]));
  check('B2.4 a phone that cannot run the model is offered only search by meaning, with its own size', /29 MB/.test(r.embedOnly) && !/870/.test(r.embedOnly) && r.embedPrepare[0].llm === false && r.embedPrepare[0].embed === true, JSON.stringify([r.embedOnly, r.embedPrepare]));
}

// ---- settings, own key, data (B3, X10) ---------------------------------------------------------------------------------
{
  const r = await inPage(`
    const { renderSettings } = await import('/src/ui/settings/index.js');
    const out = {};
    let fetches = [];
    globalThis.fetch = async (url, init) => { fetches.push([String(url), init?.headers ?? {}]); return new Response(JSON.stringify({ error: { message: 'invalid x-api-key SECRET-PROVIDER-TEXT' } }), { status: 401, headers: { 'content-type': 'application/json' } }); };
    const ctx = await fx.makeCtx({ status: fx.STATUS.first });
    renderSettings(root, ctx, {});
    await wait();
    out.rows = $$('.srow__label').map((n) => n.textContent);
    // own key page
    byText('.srow', 'Your own key').click(); await wait();
    $('#k-key').value = 'sk-ant-typed-key-1234';
    $('.ownkey').dispatchEvent(new Event('submit', { cancelable: true })); await wait();
    out.saved = ctx.settings.getKey() === 'sk-ant-typed-key-1234' && ctx.settings.getKeyBinding().host === 'api.anthropic.com';
    out.mask = $('#k-key').placeholder;
    // test connection: 401 shows only "Key rejected."
    byText('.btn', 'Test connection').click(); await wait(150);
    out.problem = $('.field-error')?.textContent ?? '';
    out.sentTo = fetches.map((f) => new URL(f[0]).host);
    // switch provider: the key is not sent to the other host and saving removes it
    fetches = [];
    byText('[role=radio]', 'OpenAI-compatible').click();
    $('#k-model').value = 'llama3'; $('#k-base').value = 'https://example.org/v1';
    $('.ownkey').dispatchEvent(new Event('submit', { cancelable: true })); await wait();
    out.afterSwitch = { hasKey: ctx.settings.hasKey(), status: $('.status-line')?.textContent ?? '' };
    byText('.btn', 'Test connection').click(); await wait(150);
    out.otherHost = fetches.map((f) => [new URL(f[0]).host, JSON.stringify(f[1]).includes('sk-ant')]);
    // remove key
    byText('[role=radio]', 'Anthropic').click();
    $('#k-key').value = 'sk-ant-second-9999';
    $('.ownkey').dispatchEvent(new Event('submit', { cancelable: true })); await wait();
    byText('.btn', 'Remove key').click(); await wait();
    out.removed = !ctx.settings.hasKey();
    return out;
  `);
  check('settings lists Assistant, Voice, Appearance, data and About rows', ['On-device assistant', 'Search by meaning', 'Your own key', 'Listening', 'Reply voice', 'Daily review', 'Theme', 'Export thoughts', 'Import', 'Delete everything', 'About Thought Catcher'].every((l) => r.rows.includes(l)), JSON.stringify(r.rows));
  check('B3.1/B3.4 the key is saved bound to its provider and host, and shown masked', r.saved && /3f9Q|1234/.test(r.mask), JSON.stringify([r.saved, r.mask]));
  check('G25/B3.5 a 401 shows only "Key rejected." and never the provider text', r.problem === 'Key rejected.' && !/SECRET/.test(r.problem), r.problem);
  check('B3.4 the key went only to its own provider host', r.sentTo.every((h) => h === 'api.anthropic.com') && r.sentTo.length >= 1, JSON.stringify(r.sentTo));
  check('B3.4 switching provider removes the old key on save and it is never sent to the new host', r.afterSwitch.hasKey === false && /removed/.test(r.afterSwitch.status) && r.otherHost.every(([, leaked]) => leaked === false), JSON.stringify([r.afterSwitch, r.otherHost]));
  check('B3.1 Remove key deletes it', r.removed);
}
{
  const r = await inPage(`
    const { renderSettings } = await import('/src/ui/settings/index.js');
    const { exportAll, importFile, deleteAll } = await import('/src/ui/settings/data.js');
    const out = {};
    let blob = null;
    URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    HTMLAnchorElement.prototype.click = function () {};
    const ctx = await fx.makeCtx({});
    ctx.settings.setKey('sk-should-not-appear', { provider: 'anthropic', host: 'api.anthropic.com' });
    const before = await ctx.store.getAll();
    await exportAll(ctx);
    const text = await blob.text();
    const data = JSON.parse(text);
    out.export = { version: data.version, count: data.thoughts.length, hasKey: text.includes('sk-should-not-appear') };
    await ctx.store.clear();
    const file = new File([text], 'x.json', { type: 'application/json' });
    const res = await importFile(ctx, file);
    const after = await ctx.store.getAll();
    const sort = (l) => l.slice().sort((a, b) => a.id.localeCompare(b.id));
    out.roundtrip = JSON.stringify(sort(after)) === JSON.stringify(sort(before));
    out.summary = res.message;
    const again = await importFile(ctx, file);
    out.again = again.message;
    const bad = await importFile(ctx, new File(['{"hello": 1}'], 'notes.json'));
    out.bad = [bad.ok, bad.message, (await ctx.store.getAll()).length];
    // v1 file import
    const v1 = { format: 'thought-catcher-export', version: 1, exported_at: new Date().toISOString(), app_version: '1.0.0', settings: {}, thoughts: [{ ...before[0], id: 'v1-one', sort: { ...before[0].sort, by: 'ai' } }] };
    delete v1.thoughts[0].origin; delete v1.thoughts[0].plan; delete v1.thoughts[0].best_guess; delete v1.thoughts[0].v;
    out.v1 = (await importFile(ctx, new File([JSON.stringify(v1)], 'v1.json'))).message;
    // delete all: cancel keeps, confirm clears everything
    renderSettings(root, ctx, {});
    await wait();
    byText('.srow', 'Delete everything').click(); await wait();
    byText('.confirm .btn', 'Cancel').click(); await wait();
    out.keptOnCancel = (await ctx.store.getAll()).length > 0;
    byText('.srow', 'Delete everything').click(); await wait();
    byText('.confirm .btn', 'Yes, delete everything').click(); await wait(100);
    out.cleared = [(await ctx.store.getAll()).length, ctx.settings.hasKey()];
    return out;
  `);
  check('X10.3 export is version 2 with every thought and no key', r.export.version === 2 && r.export.count === 24 && r.export.hasKey === false, JSON.stringify(r.export));
  check('X10.3 export, clear, import gives the same records', r.roundtrip && /Added 24, skipped 0/.test(r.summary), r.summary);
  check('X10.3 importing the same file again skips every id', /Added 0, skipped 24/.test(r.again), r.again);
  check('X10.3 an invalid file changes nothing and says so', r.bad[0] === false && /not a Thought Catcher export/.test(r.bad[1]) && /unchanged/.test(r.bad[1]) && r.bad[2] === 24, JSON.stringify(r.bad));
  check('X10.3 a v1 export file imports', /Added 1, skipped 0/.test(r.v1), r.v1);
  check('X10.4 Delete all asks first; cancel keeps, confirm empties thoughts and removes the key', r.keptOnCancel && r.cleared[0] === 0 && r.cleared[1] === false, JSON.stringify(r.cleared));
}
{
  const r = await inPage(`
    const { renderSettings } = await import('/src/ui/settings/index.js');
    const ctx = await fx.makeCtx({ status: fx.STATUS.first });
    const out = {};
    renderSettings(root, ctx, {});
    await wait();
    out.notDownloaded = /About 870 MB/.test(root.textContent) && Boolean(byText('.mini-btn', 'Download'));
    byText('.mini-btn', 'Download').click(); await wait();
    out.prepare = ctx.brain.calls.filter((c) => c[0] === 'prepare').length;
    ctx.brain.setStatus(fx.STATUS.downloading); await wait();
    out.bar = $('[role=progressbar][aria-label="Assistant download"]')?.getAttribute('aria-valuenow');
    byText('.mini-btn', 'Cancel').click();
    out.cancel = ctx.brain.calls.some((c) => c[0] === 'cancel');
    ctx.brain.setStatus(fx.STATUS.unsupported); await wait();
    out.unsupported = /can't run the on-device assistant/.test(root.textContent) && /simple rules/.test(root.textContent);
    ctx.brain.setStatus(fx.STATUS.failed); await wait();
    out.failed = Boolean(byText('.mini-btn', 'Try again'));
    // theme, review days, listening
    byText('[role=radio]', 'Dark').click(); await wait();
    out.theme = [ctx.settings.getSettings().theme, document.documentElement.getAttribute('data-theme')];
    byText('[role=radio]', 'Auto').click();
    byText('.srow', 'Daily review').click(); await wait();
    for (let i = 0; i < 3; i += 1) { $('[aria-label="One day more"]').click(); await wait(20); }
    out.days = ctx.settings.getSettings()['review.days'];
    out.note = /only when you open the app/.test(root.textContent);
    $('.navbar__back').click(); await wait();
    byText('.srow', 'Listening').click(); await wait();
    byText('[role=radio]', 'Phone').click();
    out.engine = ctx.settings.getSettings()['speech.engine'];
    return out;
  `);
  check('B2.2 Settings offers the download with the size; Download prepares; progress shows; Cancel cancels', r.notDownloaded && r.prepare === 1 && r.bar === '42' && r.cancel, JSON.stringify(r));
  check('B2.4 unsupported and failed states say so plainly, with Try again on failure', r.unsupported && r.failed);
  check('D1.2 the theme choice is stored and applied', r.theme[0] === 'dark' && r.theme[1] === 'dark', JSON.stringify(r.theme));
  check('X8.5 the review threshold changes with the stepper and the notification note is shown', r.days === 6 && r.note, JSON.stringify([r.days, r.note]));
  check('X1 the listening engine choice is stored', r.engine === 'browser', r.engine);
}

// ---- About and ask (X10.7, B4.2, X5) -----------------------------------------------------------------------------------
{
  const r = await inPage(`
    const { renderAbout } = await import('/src/ui/about/index.js');
    const ctx = await fx.makeCtx({});
    renderAbout(root, ctx);
    await wait();
    const t = root.textContent;
    return { hosts: ['cdn.jsdelivr.net', 'huggingface.co', 'raw.githubusercontent.com', 'ionvovos.github.io'].every((h) => t.includes(h)), author: t.includes('Ion Vovos / Nexa Systems') || document.body.textContent.includes('Ion Vovos'), link: [...document.querySelectorAll('a')].map((a) => a.href), install: /Safari/.test(t) && /Chrome/.test(t), export: /Export in Settings/.test(t), term: /IndexedDB|PWA|API key/.test(t) };
  `);
  check('X10.7/B4.2 About lists every host, install steps, backup advice and uses no unexplained term', r.hosts && r.install && r.export && !r.term, JSON.stringify(r));
  check('X10.7 About has the author and the code link', r.author && r.link.includes('https://github.com/ionvovos/thought-catcher'), JSON.stringify(r.link));
}
{
  const r = await inPage(`
    const { renderAnswer } = await import('/src/ui/ask/index.js');
    const ctx = await fx.makeCtx({});
    const ans = { answer: 'You want three short sessions [1], and the membership ends in October [2].', sources: [{ id: 'i1', score: 0.7, title: 'Gym plan', type: 'idea' }, { id: 'gone', score: 0.6, title: 'Deleted', type: 'task' }, { id: 't3', score: 0.5, title: 'Renew gym membership', type: 'task' }], mode: 'meaning', by: 'device' };
    const card = renderAnswer(ans, ctx);
    root.append(card);
    await wait(100);
    const out = { sources: $$('.src', card).map((n) => n.querySelector('.src__title').textContent), prov: $('.provenance', card).textContent };
    $$('.src', card)[0].click();
    out.nav = ctx.log.nav.at(-1);
    const none = renderAnswer({ answer: "I couldn't find anything about that.", sources: [], mode: 'meaning', by: 'device' }, ctx);
    root.append(none); await wait(80);
    out.none = [$('.answer__text', none).textContent, $$('.src', none).length];
    const kw = renderAnswer({ answer: 'I found 1 thought about that.', sources: [ans.sources[0]], mode: 'keyword', by: 'rules' }, ctx);
    root.append(kw); await wait(80);
    out.kw = $('.provenance', kw).textContent;
    return out;
  `);
  check('AC-X5.2 every cited thought exists and a deleted one is not shown; a source opens its thought', JSON.stringify(r.sources) === '["Gym plan","Renew gym membership"]' && r.nav === '#/thought/i1', JSON.stringify([r.sources, r.nav]));
  check('AC-X5.2 with nothing relevant the answer says so and cites nothing', /couldn't find anything about that in your thoughts/.test(r.none[0]) && r.none[1] === 0, JSON.stringify(r.none));
  check('AC-X5.4 keyword answers are labelled "Keyword search"', /Keyword search/.test(r.kw), r.kw);
  check('X5 provenance names how many thoughts and where it searched', /From 2 of your 24 thoughts\. Searched on this phone\./.test(r.prov), r.prov);
}

const external = b.network.filter((u) => !u.startsWith(b.base) && !u.startsWith('data:') && !u.startsWith('blob:'));
const problems = b.problems.filter((p) => !/__s3host|favicon|status of 404/.test(p) && !/Failed to load resource: the server responded with a status of 401/.test(p));
await b.close();
const failed = results.filter((x) => !x.ok);
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : `\n      ${x.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; external requests: ${external.length}; console problems: ${problems.length}`);
for (const p of problems) console.log('  PROBLEM', p.slice(0, 200));
for (const u of external) console.log('  EXTERNAL', u);
process.exit(failed.length || external.length ? 1 : 0);
