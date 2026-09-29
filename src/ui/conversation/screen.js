// The assistant screen: orb, conversation thread, dock, composer, library peek. It owns the conversation state machine
// (machine.js), runs its effects against the brain and the store, and renders after every step. Brain calls go through
// ctx.brain only; thoughts are written through ctx.store only (architecture section 5).
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { createOrb } from '../orb/orb.js';
import { createLevelMeter } from '../orb/level.js';
import { IconButton } from '../components/button.js';
import { StatusPill, orbStateFor, downloadLine, pillFor } from '../components/statusLine.js';
import { createToaster } from '../components/toast.js';
import { openMenu } from '../components/menu.js';
import { transition, initialState } from './machine.js';
import { renderFiledCard, typeMenuOptions, whenLabel } from './filedCard.js';
import { createComposer } from './composer.js';
import { createSpeaker } from './speak.js';
import { dateOptions } from './dates.js';
import * as V from './view.js';
import { thoughtFromItem } from '../../core/model.js';
import { selectEngine, transcribeWithFallback, speechMessage, failureMessage, enginesToMarkFailed } from '../../speech/select.js';
import { ensureSpeechChoice } from '../../speech/consent.js';

const FLAG_PREFIX = 'thought-catcher.ui.';
const flag = {
  get(name) { try { return globalThis.localStorage?.getItem(FLAG_PREFIX + name) === '1'; } catch { return false; } },
  set(name) { try { globalThis.localStorage?.setItem(FLAG_PREFIX + name, '1'); } catch { /* per-viewer convenience only */ } },
};

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// deps: { engines, speech, s3 } where s3 = { renderAnswer, renderReviewCard, offerModel } (each may be missing).
// snapshot (fixtures only): { st, log, typing, transcript, status, pendingChoice } sets the starting view without running effects.
export function createAssistant(ctx, deps = {}, snapshot = null) {
  const { store, brain, settings, now, nav } = ctx;
  const engines = deps.engines ?? [];
  const speechPrefs = deps.speech ?? { engine: 'ask', failed: new Set() };
  const s3 = deps.s3 ?? {};
  const fixture = Boolean(snapshot);

  let st = snapshot?.st ?? initialState();
  let log = snapshot?.log ?? [];
  let typing = snapshot?.typing ?? false;
  let transcript = snapshot?.transcript ?? '';
  let speechNote = snapshot?.speechNote ?? '';
  let pendingChoice = false;
  let status = snapshot?.status ?? brain.getStatus();
  let thoughts = snapshot?.thoughts ?? [];
  let capture = snapshot?.capture ? { originId: 'fixture', source: 'voice', rows: snapshot.capture, edited: new Set(), replaced: true } : null; // { originId, source, rows, edited:Set, replaced }
  let lastFiled = capture?.rows?.[0] ?? null; // last filed thought row, target of "expand it" / "plan it"
  let dueDismissed = new Set();
  let reviewNode = null;
  let alive = true;
  let seq = 0;
  let controller = null; // AbortController of the running listen
  let cancelled = false;
  let brainToken = 0;

  const readOnly = () => Boolean(store.migration?.readOnly);

  // ---- persistent nodes ----
  const root = el('main', { class: 'app', 'data-screen': 'assistant' });
  const orb = createOrb({
    size: 'stage',
    onTap: () => (st.name === 'thinking' ? dispatch({ type: 'STOP' }) : dispatch({ type: 'TAP_ORB' })),
    onHoldStart: () => dispatch({ type: 'HOLD_START' }),
    onHoldEnd: () => dispatch({ type: 'HOLD_END' }),
  });
  const meter = createLevelMeter({ onLevel: (v) => orb.setLevel(v) });
  const toaster = createToaster(root);
  const speaker = createSpeaker({ onStart: () => dispatch({ type: 'SPEAK_START' }), onEnd: () => dispatch({ type: 'SPEAK_END' }) });
  const composer = createComposer({
    onSend: (text) => dispatch({ type: 'SEND_TEXT', text }),
    onVoice: () => { typing = false; dispatch({ type: 'TAP_ORB' }); },
  });
  const stage = el('section', { class: 'stage' });
  const thread = el('section', { class: 'thread', 'aria-label': 'Conversation' });
  thread.tabIndex = -1;

  // ---- data ----
  async function loadThoughts() {
    if (fixture) return;
    try { thoughts = await store.getAll(); } catch { thoughts = []; }
    if (alive) render();
  }
  const counts = () => {
    const c = { idea: 0, task: 0, journal: 0, reminder: 0 };
    for (const t of thoughts) if (c[t.type] !== undefined) c[t.type] += 1;
    return c;
  };
  const dueToday = () => {
    const at = now();
    return thoughts
      .filter((t) => t.type === 'reminder' && !t.done && t.due_at && sameDay(new Date(t.due_at), at) && !dueDismissed.has(t.id))
      .sort((a, b) => a.due_at.localeCompare(b.due_at))[0] ?? null;
  };

  // ---- rendering ----
  function orbState() {
    if (st.speaking) return 'speaking';
    if (st.name === 'listening') return 'listening';
    if (st.name === 'transcribing' || st.name === 'thinking') return 'thinking';
    return 'idle';
  }

  function syncOrb() {
    const basic = orbStateFor(status) === 'basic';
    orb.setState(orbState(), { basic });
    orb.el.disabled = readOnly() && orbState() === 'idle';
  }

  function topbar() {
    if (st.name === 'listening' || st.name === 'transcribing') {
      return el('header', { class: 'topbar' }, [
        IconButton({ name: 'x', label: 'Cancel', onClick: () => dispatch({ type: 'CANCEL' }) }),
        el('span', { class: 'topbar__center' }, st.name === 'listening' ? 'Listening' : 'Working on it'),
        readOnly() ? el('span', { class: 'iconbtn', 'aria-hidden': 'true' }) : IconButton({ name: 'keyboard', label: 'Type instead', onClick: () => { dispatch({ type: 'CANCEL' }); openTyping(); } }),
      ]);
    }
    return el('header', { class: 'topbar' }, [
      snapshot?.migrationRun ? migrationPill(snapshot.migrationRun) : StatusPill(status, { onClick: () => openFromPill(pillFor(status).opens) }),
      IconButton({ name: 'settings', label: 'Settings', onClick: () => nav.go('#/settings') }),
    ]);
  }

  // "Moving 38 of 52" while the v1 upgrade runs (design.md 3, migration-running). The upgrade blocks the page, so only a fixture shows it.
  function migrationPill({ done, total }) {
    const ring = el('span', { class: 'pill__ring' });
    ring.style.setProperty('--p', String(Math.round((done / total) * 100)));
    return el('button', { type: 'button', class: 'pill', 'aria-label': `Moving your thoughts, ${done} of ${total}` }, [ring, `Moving ${done} of ${total}`]);
  }

  function offlineStrip() {
    if (status.online !== false) return null;
    return el('div', { class: 'strip', role: 'status' }, [icon('wifioff'), status.key === 'set' ? 'Offline. The assistant still works on this phone; your key waits for the connection.' : 'Offline. Everything on this phone still works.']);
  }

  function renderStage() {
    const firstRun = thoughts.length === 0 && !fixture ? true : (snapshot?.firstRun ?? thoughts.length === 0);
    const top = el('div', { class: 'stage__top' });
    const bottom = [];
    if (st.name === 'listening' || st.name === 'transcribing') {
      bottom.push(pendingChoice ? el('div', { class: 'stage__choice' }) : V.transcriptView(transcript));
      if (speechNote) bottom.push(el('p', { class: 'hint', role: 'status' }, speechNote));
    } else {
      top.append(el('h1', { class: 'greeting' }, V.greeting(now(), firstRun)));
      const blocked = readOnly() ? 'Capturing is paused until your thoughts are updated. Export them from Settings.' : null;
      bottom.push(V.hintLine({ firstRun, engineRules: orbStateFor(status) === 'basic', download: downloadLine(status), blocked }));
      if (!readOnly()) bottom.push(V.typeButton(openTyping));
      if (firstRun) bottom.push(V.suggestions());
    }
    stage.replaceChildren(...(top.childNodes.length ? [top] : []), orb.el, ...bottom);
    const choiceHost = stage.querySelector('.stage__choice');
    return choiceHost;
  }

  function renderThread() {
    const kids = [];
    log.forEach((entry, i) => {
      const node = entryNode(entry, i);
      if (node) {
        const list = Array.isArray(node) ? node : [node];
        for (const n of list) { if (entry.seen) n.classList.add('is-old'); kids.push(n); }
      }
      entry.seen = true;
    });
    thread.replaceChildren(...kids);
    thread.scrollTop = thread.scrollHeight;
  }

  function entryNode(entry, index) {
    switch (entry.kind) {
      case 'time': return el('span', { class: 'msg-time' }, entry.text);
      case 'user': {
        const lastUser = log.map((e, i) => (e.kind === 'user' ? i : -1)).filter((i) => i >= 0).pop() === index;
        const bubble = V.userMessage(entry.text);
        return lastUser && (st.name === 'filed' || st.name === 'asking') && !fixture ? [bubble, V.editControl(() => editMessage(entry))] : lastUser && entry.editable ? [bubble, V.editControl(() => editMessage(entry))] : bubble;
      }
      case 'thinking': return V.thinkingMessage(entry.text, entry.by);
      case 'assistant': return assistantNode(entry);
      case 'error': return V.errorMessage(entry);
      case 'answer': return answerNode(entry);
      case 'lines': return V.assistantMessage([el('p', {}, entry.text), el('ol', { class: 'answer-lines' }, entry.lines.map((l) => el('li', {}, l)))]);
      case 'consent': return V.assistantMessage([el('p', {}, entry.text ?? 'Want a smarter assistant?'), consentNode()]);
      default: return null;
    }
  }

  function consentNode() {
    if (s3.offerModel) { try { return s3.offerModel(ctx); } catch (err) { console.error(err); } }
    return el('div', { class: 'consent', role: 'group', 'aria-label': 'Download the assistant' }, [
      el('div', { class: 'consent__head' }, [el('span', { class: 'ticon notice__icon--info' }, icon('chip')), el('h3', {}, 'Want a smarter assistant?')]),
      el('p', {}, 'It runs on this phone; nothing is sent anywhere. About 870 MB, Wi-Fi recommended, once.'),
      el('div', { class: 'consent__acts' }, [
        el('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { settings.setSettings({ 'brain.llm_consent': 'no' }); log = log.filter((e) => e.kind !== 'consent'); render(); } }, 'Not now'),
        el('button', { type: 'button', class: 'btn btn--primary', onclick: () => { settings.setSettings({ 'brain.llm_consent': 'yes', 'brain.embed_consent': 'yes' }); brain.prepare({ llm: true, embed: true }); log = log.filter((e) => e.kind !== 'consent'); render(); } }, 'Download'),
      ]),
    ]);
  }

  function answerNode(entry) {
    if (s3.renderAnswer) {
      try { return V.assistantMessage([s3.renderAnswer(entry.answer, ctx)]); } catch (err) { console.error(err); }
    }
    return V.assistantMessage([el('p', {}, entry.answer.answer)]);
  }

  function assistantNode(entry) {
    const kids = [];
    if (entry.text) kids.push(el('p', {}, entry.text));
    if (entry.speaking) kids.push(el('div', { class: 'msg__meta' }, [icon('speaker', 'i--sm'), ` Speaking with ${entry.speaking}. Tap the orb to stop.`]));
    if (entry.question) kids.push(...V.questionBlock(entry.question.question, { count: entry.question.count, onAnswer: (c) => dispatch({ type: 'ANSWER', text: c }), onSkip: () => dispatch({ type: 'SKIP' }) }));
    if (entry.filed && capture && capture.rows.length) {
      kids.push(renderFiledCard({ thoughts: capture.rows, now: now(), animate: !entry.seen, handlers: cardHandlers() }));
    }
    if (entry.meta) kids.push(el('div', { class: 'msg__meta' }, entry.meta));
    return V.assistantMessage(kids, { role: entry.question ? 'status' : 'status' });
  }

  function dock() {
    const left = readOnly() ? el('span') : IconButton({ name: 'keyboard', label: 'Type instead', filled: true, onClick: openTyping });
    if (st.name === 'listening' || st.name === 'transcribing') {
      return el('footer', { class: 'dock dock--hint' }, [el('p', { class: 'hint' }, st.name === 'listening' ? "Tap the orb when you're done" : 'Turning your voice into text')]);
    }
    const right = st.name === 'thinking' ? V.dockButton('Stop', () => dispatch({ type: 'STOP' }), 'Stop') : V.dockButton('Done', () => dispatch({ type: 'DONE' }));
    return V.dockView({ left, orbEl: orb.el, right });
  }

  function peekNode() {
    return V.peek({ counts: counts(), total: thoughts.length, onOpen: () => nav.go('#/library') });
  }

  function render() {
    if (!alive) return;
    syncOrb();
    const listening = st.name === 'listening' || st.name === 'transcribing';
    const stageMode = log.length === 0 && !typing;
    const parts = [topbar()];
    const strip = offlineStrip();
    if (strip) parts.push(strip);
    if (stageMode || listening) {
      orb.el.classList.remove('orb--dock');
      const choiceHost = renderStage();
      parts.push(stage);
      if (listening) {
        parts.push(dock());
      } else {
        const notices = stageNotices();
        if (reviewNode) parts.push(reviewNode);
        const due = dueToday();
        if (due) parts.push(V.dueCard(due, `Due today, ${whenLabel(due.due_at, now()).replace(/^Today /, '')}`, () => markDone(due)));
        parts.push(...notices, peekNode());
      }
      root.replaceChildren(...parts, ...root.querySelectorAll('.toast, .menu'));
      if (pendingChoice && choiceHost) choiceHost.append(pendingChoice);
    } else {
      renderThread();
      orb.el.classList.add('orb--dock');
      parts.push(thread);
      parts.push(typing ? composer.el : dock());
      root.replaceChildren(...parts, ...root.querySelectorAll('.toast, .menu'));
    }
  }

  function stageNotices() {
    const out = [];
    const llm = status.llm;
    if (llm?.state === 'not-supported' && !flag.get('notice.basic')) {
      out.push(el('div', { class: 'stage__notice' }, V.notice({
        iconName: 'chip',
        title: 'Basic mode on this phone',
        body: "This phone can't run the on-device assistant. I'll sort your thoughts with simple rules. You can add your own AI key in Settings.",
        actions: [
          el('button', { type: 'button', class: 'btn btn--tinted', onclick: () => nav.go('#/settings/assistant') }, [icon('key', 'i--sm'), 'Add your own key']),
          el('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { flag.set('notice.basic'); render(); } }, 'Got it'),
        ],
      })));
    }
    if (store.migration?.state === 'failed') {
      out.push(el('div', { class: 'stage__notice' }, V.notice({
        iconName: 'info',
        title: 'Your thoughts are safe',
        body: "Couldn't update your thoughts to the new version. They are safe; export them from Settings.",
        actions: [
          el('button', { type: 'button', class: 'btn btn--tinted', onclick: () => nav.go('#/settings') }, [icon('download', 'i--sm'), 'Export']),
          el('button', { type: 'button', class: 'btn btn--secondary', onclick: () => globalThis.location.reload() }, 'Try again'),
        ],
      })));
    } else if (store.migration?.state === 'migrated' && !settings.getSettings()['migration.notice_shown']) {
      const q = store.migration.quarantined ?? 0;
      out.push(el('div', { class: 'stage__notice' }, V.notice({
        iconName: 'check',
        tone: 'info',
        title: `Migrated ${store.migration.count} thoughts`,
        body: q ? `${q} couldn't be read and are kept aside; they are included in your export.` : 'Everything is where you left it.',
        actions: [el('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { settings.setSettings({ 'migration.notice_shown': true }); render(); } }, 'Got it')],
      })));
    }
    return out;
  }

  // ---- actions ----
  function openTyping() {
    if (readOnly()) return;
    typing = true;
    if (log.length === 0) log.push({ kind: 'time', text: V.timeLabel(now()) }, { kind: 'assistant', text: 'Type your thought. Enter sends it.', ephemeral: true });
    render();
    composer.focus();
  }

  function openFromPill(target) {
    if (target === 'consent') {
      if (!log.some((e) => e.kind === 'consent')) log.push({ kind: 'consent' });
      render();
    } else {
      nav.go('#/settings/assistant');
    }
  }

  async function markDone(t) {
    dueDismissed.add(t.id);
    try {
      await store.put({ ...t, done: true, done_at: now().toISOString(), updated_at: now().toISOString() });
      toaster.toast('Marked done');
    } catch (err) {
      dueDismissed.delete(t.id);
      toaster.toast(`Couldn't save: ${err.message}`);
    }
    await loadThoughts();
  }

  const stamp = (row) => ({ ...row, updated_at: now().toISOString() });

  async function saveRow(row, { edited = true } = {}) {
    const next = stamp(row);
    if (capture) {
      capture.rows = capture.rows.map((r) => (r.id === next.id ? next : r));
      if (edited) capture.edited.add(next.id);
    }
    if (lastFiled?.id === next.id) lastFiled = next;
    try { await store.put(next); } catch (err) { toaster.toast(`Couldn't save: ${err.message}`); }
    render();
  }

  function cardHandlers() {
    return {
      onType: (t, anchor) => openMenu({ host: root, anchor, label: 'Change type', options: typeMenuOptions(t.type), onPick: (type) => { if (type !== t.type) saveRow({ ...t, type, best_guess: false, due_at: type === 'idea' || type === 'journal' ? null : t.due_at }); } }),
      onDate: (t, anchor) => openMenu({ host: root, anchor, label: 'Change date', options: dateOptions(now()).map((o) => ({ value: o.value, label: o.label, checked: o.value === t.due_at })), onPick: (due) => saveRow({ ...t, due_at: due }) }),
      onTitle: (t, title) => saveRow({ ...t, title }),
      onUndoAll: () => undoAll(),
      onKeepOne: () => keepAsOne(),
    };
  }

  async function undoAll() {
    if (!capture) return;
    const rows = capture.rows;
    const ids = rows.map((r) => r.id);
    try { await store.deleteMany(ids); } catch (err) { toaster.toast(`Couldn't remove: ${err.message}`); return; }
    const entry = log.find((e) => e.filed);
    if (entry) { entry.filed = false; entry.text = `Removed ${rows.length} thought${rows.length === 1 ? '' : 's'}.`; }
    capture.rows = [];
    render();
    toaster.toast(`Removed ${rows.length} thought${rows.length === 1 ? '' : 's'}`, {
      action: { label: 'Undo', onClick: async () => {
        try { await store.putMany(rows); } catch (err) { toaster.toast(`Couldn't restore: ${err.message}`); return; }
        if (capture) capture.rows = rows;
        if (entry) { entry.filed = true; entry.text = 'Restored.'; entry.seen = false; }
        await loadThoughts();
      } },
    });
    await loadThoughts();
  }

  async function keepAsOne() {
    if (!capture?.originId) return;
    try {
      const kept = await brain.merge(capture.originId);
      capture.rows = [kept];
      capture.originId = null;
      lastFiled = kept;
      const entry = log.find((e) => e.filed);
      if (entry) { entry.text = 'Kept as one thought.'; entry.seen = false; }
      toaster.toast('Kept as one thought');
    } catch (err) {
      toaster.toast(`Couldn't join them: ${err.message}`);
    }
    await loadThoughts();
  }

  function editMessage(entry) {
    const text = entry.text;
    const doEdit = async () => {
      if (capture?.rows?.length) { try { await store.deleteMany(capture.rows.map((r) => r.id)); } catch { /* the rows stay; the edit still reopens */ } }
      capture = null;
      log = [];
      brainToken += 1;
      st = { ...initialState() };
      typing = true;
      log.push({ kind: 'time', text: V.timeLabel(now()) });
      await loadThoughts();
      render();
      composer.setValue(text);
      composer.focus();
    };
    doEdit();
  }

  // ---- effects ----
  function replyBy(items) {
    return items.some((i) => i.by === 'device') ? 'device' : items.some((i) => i.by === 'key') ? 'key' : 'rules';
  }

  function buildRow(item, { id, index, count, source, existing }) {
    const model = item.by === 'device' ? (status.llm?.model ?? null) : null;
    const row = thoughtFromItem(item, { source, now: now(), id, model, origin: { id: capture.originId, index, count } });
    if (existing) row.created_at = existing.created_at;
    row.clarify = item.question ? { state: 'pending', case: item.question.case, question: item.question.text, answer: null } : row.clarify;
    return row;
  }

  const effects = {
    async startSpeech() { await beginSpeech(); },
    stopSpeech() { controller?.abort(); },
    cancelSpeech() { cancelled = true; controller?.abort(); meter.stop(); transcript = ''; speechNote = ''; pendingChoice = false; },
    orbLevel({ rms }) { orb.setLevel(rms); },
    showError({ code }) { showSpeechError(code); },
    toast({ text }) { meter.stop(); toaster.toast(text); },
    stopSpeaking() { speaker.stop(); },
    showUserMessage({ text }) {
      meter.stop();
      log = log.filter((e) => !e.ephemeral);
      if (!log.some((e) => e.kind === 'time')) log.unshift({ kind: 'time', text: V.timeLabel(now()) });
      log.push({ kind: 'user', text }, { kind: 'thinking', text: 'Sorting your thoughts', id: ++seq });
      transcript = '';
    },
    route({ text }) {
      const r = brain.intent(text);
      const thinking = log.findLast?.((e) => e.kind === 'thinking') ?? [...log].reverse().find((e) => e.kind === 'thinking');
      if (thinking) thinking.text = r.kind === 'ask' ? 'Looking through your thoughts' : r.kind === 'expand' || r.kind === 'plan' ? 'Working on it' : 'Sorting your thoughts';
      queueMicrotask(() => dispatch({ type: 'INTENT', kind: r.kind, text: r.text ?? text }));
    },
    async saveRules({ text, source }) {
      capture = { originId: globalThis.crypto.randomUUID(), source, rows: [], edited: new Set(), replaced: false };
      try {
        const items = brain.splitRules(text, { source });
        const rows = items.map((item, i) => buildRow(item, { id: undefined, index: i, count: items.length, source, existing: null }));
        await store.putMany(rows);
        capture.rows = rows;
        lastFiled = rows[0] ?? lastFiled;
        await loadThoughts();
      } catch (err) {
        capture.failed = err;
      }
    },
    async brainSplit({ text, source }) {
      const mine = ++brainToken;
      try {
        const items = await brain.split(text, { source });
        if (mine !== brainToken) return;
        if (capture?.failed) { dispatch({ type: 'BRAIN_FAILED', error: { code: 'save-failed', message: capture.failed.message } }); return; }
        dispatch({ type: 'BRAIN_DONE', items });
      } catch (err) {
        if (mine === brainToken) dispatch({ type: 'BRAIN_FAILED', error: { code: err?.code ?? 'run-failed', message: err?.message ?? String(err) } });
      }
    },
    async replaceRuleItems({ items }) {
      if (!capture || capture.replaced) return;
      capture.replaced = true;
      const old = capture.rows;
      const rows = items.map((item, i) => {
        const existing = old[i];
        if (existing && capture.edited.has(existing.id)) return existing;
        return buildRow(item, { id: existing?.id, index: i, count: items.length, source: capture.source, existing });
      });
      const surplus = old.slice(items.length).map((r) => r.id);
      try {
        await store.putMany(rows);
        if (surplus.length) await store.deleteMany(surplus);
        capture.rows = rows;
        lastFiled = rows[0] ?? lastFiled;
        await loadThoughts();
      } catch (err) {
        toaster.toast(`Couldn't save: ${err.message}`);
      }
    },
    showReply({ items, failed }) {
      const thinkingAt = log.findIndex((e) => e.kind === 'thinking');
      const rows = capture?.rows ?? [];
      const by = replyBy(items?.length ? items : rows.map((r) => ({ by: r.sort?.by })));
      let text = '';
      try { text = items?.length ? brain.reply(items, { by }) : `Filed ${rows.length} thought${rows.length === 1 ? '' : 's'}.`; } catch { text = 'Filed.'; }
      const entry = { kind: 'assistant', text, filed: true, meta: failed && !rows.length ? null : null };
      lastReply = text;
      if (thinkingAt >= 0) log.splice(thinkingAt, 1, entry); else log.push(entry);
      maybeOfferModel();
      if (rows.length === 1) {
        toaster.toast('Filed', { action: { label: 'Undo', onClick: () => undoAll() } });
      }
    },
    showStatus({ error }) {
      if (!error) return;
      const at = log.findIndex((e) => e.kind === 'thinking');
      const entry = { kind: 'error', iconName: 'chip', name: 'Assistant stopped', text: 'The assistant stopped working, so I used simple rules for this one.', replies: [{ label: 'Open Settings', icon: 'refresh', onClick: () => nav.go('#/settings/assistant') }] };
      if (error.code === 'save-failed') {
        entry.iconName = 'info'; entry.name = "Couldn't save"; entry.text = `Your thought wasn't saved: ${error.message}. Nothing was lost on screen; try again.`; entry.replies = [];
      }
      if (at >= 0) log.splice(at, 0, entry); else log.push(entry);
    },
    showQuestion({ items, index, question }) {
      const entry = { kind: 'assistant', question: { question, count: items.length } };
      const at = log.findIndex((e) => e.kind === 'thinking');
      if (at >= 0) log.splice(at, 1, entry); else log.push(entry);
      maybeOfferModel();
    },
    async brainAnswer({ index, question, text }) {
      const row = capture?.rows[index];
      const at = log.findIndex((e) => e.kind === 'assistant' && e.question);
      if (at >= 0) log.splice(at, 1, { kind: 'user', text }, { kind: 'thinking', text: 'Updating', id: ++seq });
      const items = st.items.map((it) => ({ ...it, question: null }));
      if (!row) { dispatch({ type: 'BRAIN_DONE', items }); return; }
      try {
        const patch = await brain.answer(row, question, text);
        const next = stamp({ ...row, ...patch, tags: patch.tags ?? row.tags, best_guess: false, clarify: { ...row.clarify, state: 'answered', answer: text } });
        capture.rows = capture.rows.map((r) => (r.id === next.id ? next : r));
        capture.edited.add(next.id);
        await store.put(next);
        items[index] = { ...items[index], type: next.type, title: next.title, tags: next.tags, due_at: next.due_at, best_guess: false };
      } catch (err) {
        toaster.toast(`Couldn't apply that answer: ${err.message}`);
      }
      dispatch({ type: 'BRAIN_DONE', items });
    },
    answerByText({ text }) { dispatch({ type: 'ANSWER', text }); },
    async markSkipped({ index }) {
      const row = capture?.rows[index];
      const at = log.findIndex((e) => e.kind === 'assistant' && e.question);
      if (row) await saveRow({ ...row, clarify: { ...row.clarify, state: 'skipped' } }, { edited: false });
      const items = st.items.map((it) => ({ ...it, question: null }));
      if (at >= 0) log.splice(at, 1, { kind: 'assistant', text: brain.reply(items, { by: replyBy(items) }), filed: true });
      lastReply = '';
    },
    markUnresolved() { /* the row keeps clarify.state 'pending'; the next launch marks it unresolved (AC-M4.8) */ },
    speakReply() {
      const s = settings.getSettings();
      if (!s['voice.speak'] || !s['voice.name'] || !lastReply) return;
      const used = speaker.speak(lastReply, s['voice.name']);
      if (used) { const entry = [...log].reverse().find((e) => e.filed); if (entry) entry.speaking = used; }
    },
    async brainAsk({ text }) {
      const mine = ++brainToken;
      try {
        const answer = await brain.ask(text);
        if (mine !== brainToken) return;
        dispatch({ type: 'BRAIN_ANSWER', answer });
      } catch (err) {
        if (mine === brainToken) dispatch({ type: 'BRAIN_FAILED', error: { code: 'run-failed', message: err?.message ?? String(err) } });
      }
    },
    showAnswer({ answer }) {
      if (!answer) return;
      const at = log.findIndex((e) => e.kind === 'thinking');
      const entry = { kind: 'answer', answer };
      if (at >= 0) log.splice(at, 1, entry); else log.push(entry);
    },
    async runOnLast({ what }) {
      const target = lastFiled;
      const at = log.findIndex((e) => e.kind === 'thinking');
      const put = (entry) => { if (at >= 0) log.splice(at, 1, entry); else log.push(entry); };
      if (!target) { put({ kind: 'assistant', text: 'There is nothing to work on yet. Tell me a thought first.' }); dispatch({ type: 'BRAIN_ANSWER', answer: null }); return; }
      try {
        if (what === 'expand') {
          const ex = await brain.expand(target);
          await store.put(stamp({ ...target, expansion: ex }));
          put({ kind: 'lines', text: `Next steps for "${target.title}":`, lines: ex.next_steps });
        } else {
          const plan = await brain.plan(target);
          await store.put(stamp({ ...target, plan }));
          put({ kind: 'lines', text: `A plan for "${target.title}":`, lines: plan.steps.map((s) => s.text) });
        }
      } catch {
        put({ kind: 'assistant', text: `${what === 'expand' ? 'Expanding' : 'Planning'} needs the on-device assistant or your own key. Set one up in Settings.` });
      }
      dispatch({ type: 'BRAIN_ANSWER', answer: null });
    },
    cancelBrain() { brainToken += 1; const at = log.findIndex((e) => e.kind === 'thinking'); if (at >= 0) log.splice(at, 1); },
    clearThread() {
      brainToken += 1;
      speaker.stop();
      log = [];
      capture = null;
      typing = false;
      transcript = '';
      speechNote = '';
      refreshReview();
    },
  };
  let lastReply = '';

  // A brain state that needs the person's choice is offered once, after the first filed capture (AC-X9.3).
  function maybeOfferModel() {
    const s = settings.getSettings();
    const llm = status.llm?.state;
    const embed = status.embed?.state;
    const wants = (llm === 'not-downloaded' && s['brain.llm_consent'] === 'ask')
      || (llm === 'not-supported' && embed === 'not-downloaded' && s['brain.embed_consent'] === 'ask');
    if (wants && !log.some((e) => e.kind === 'consent') && !flag.get('offered')) {
      flag.set('offered');
      log.push({ kind: 'consent' });
    }
  }

  function showSpeechError(code) {
    meter.stop();
    pendingChoice = false;
    const blocked = code === 'not-allowed';
    const replies = [];
    if (blocked) replies.push({ label: 'How to allow it', onClick: () => { toaster.toast('Open your browser or phone settings, allow the microphone for this site, then tap the orb.'); } });
    else replies.push({ label: 'Try again', icon: 'mic', onClick: () => dispatch({ type: 'TAP_ORB' }) });
    replies.push({ label: 'Type instead', icon: 'keyboard', onClick: () => { dispatch({ type: 'DONE' }); openTyping(); } });
    log.push({ kind: 'error', iconName: blocked ? 'micoff' : 'mic', name: blocked ? 'Microphone blocked' : 'Voice input stopped', text: failureMessage(speechPrefs, { errors: [], reason: code }) || speechMessage(code), replies });
  }

  async function beginSpeech() {
    cancelled = false;
    transcript = '';
    speechNote = '';
    if (readOnly()) { dispatch({ type: 'CANCEL' }); return; }
    const host = el('div');
    pendingChoice = false;
    const needChoice = settings.getSettings()['speech.engine'] === 'ask' && engines.some((e) => e.isAvailable());
    if (needChoice) {
      pendingChoice = host;
      render();
    }
    const pref = await ensureSpeechChoice({ engines, speech: speechPrefs, host, settings });
    pendingChoice = false;
    if (cancelled || !alive) return;
    if (pref === 'typing') { dispatch({ type: 'CANCEL' }); openTyping(); return; }
    const sel = selectEngine(engines, speechPrefs);
    if (!sel.engine) {
      const reason = pref === 'ask' ? 'unavailable' : sel.reason;
      dispatch({ type: 'SPEECH_ERROR', code: reason });
      return;
    }
    render();
    controller = new AbortController();
    const mine = controller;
    meter.start();
    const result = await transcribeWithFallback(engines, speechPrefs, null, {
      stop: mine.signal,
      onInterim: (t) => { transcript = t; if (st.name === 'listening') updateTranscript(); },
      onState: (kind, detail) => {
        if (kind === 'loading') { speechNote = `Getting the on-device model ready… ${detail}%`; render(); }
        else if (kind === 'listening') { speechNote = ''; render(); }
      },
    });
    meter.stop();
    if (controller === mine) controller = null;
    if (cancelled || !alive) return;
    speechNote = '';
    if (result.text === null) {
      for (const id of enginesToMarkFailed(speechPrefs, result)) speechPrefs.failed.add(id);
      dispatch({ type: 'SPEECH_ERROR', code: result.reason ?? 'failed' });
    } else if (result.text === '') {
      dispatch({ type: 'NOTHING_HEARD' });
    } else {
      dispatch({ type: 'TRANSCRIPT', text: result.text });
    }
  }

  function updateTranscript() {
    const old = stage.querySelector('.transcript');
    if (old) old.replaceWith(V.transcriptView(transcript));
  }

  // ---- dispatch ----
  function dispatch(event) {
    if (!alive) return;
    const r = transition(st, event);
    st = r.state;
    for (const eff of r.effects) {
      const fn = effects[eff.type];
      if (!fn) continue;
      try {
        const p = fn(eff);
        if (p && typeof p.catch === 'function') p.catch((err) => console.error(err));
      } catch (err) { console.error(err); }
    }
    render();
  }

  // ---- brain status and store changes ----
  const onStatus = (e) => { status = e.detail; render(); };
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || root.closest('[hidden]')) return;
    const tag = document.activeElement?.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
    if (e.key === 'Escape' && (st.name === 'listening' || st.name === 'transcribing')) { dispatch({ type: 'CANCEL' }); return; }
    if ((e.key === 'r' || e.key === 'R') && !inField && !location.hash.startsWith('#/library') && (st.name === 'idle' || st.name === 'listening')) { e.preventDefault(); dispatch({ type: 'TAP_ORB' }); }
  };
  let unsubStore = null;

  async function refreshReview() {
    if (!s3.renderReviewCard || fixture) return;
    try { reviewNode = await s3.renderReviewCard(ctx); } catch (err) { console.error(err); reviewNode = null; }
    if (alive) render();
  }

  if (!fixture) {
    brain.addEventListener('status', onStatus);
    document.addEventListener('keydown', onKey);
    unsubStore = store.onChange?.(() => { loadThoughts(); });
    loadThoughts();
    refreshReview();
  } else {
    document.addEventListener('keydown', onKey);
  }
  render();

  return {
    el: root,
    dispatch,
    getState: () => st,
    refreshReview,
    focusForLaunch(kind) {
      if (kind === 'type') openTyping();
      else if (kind === 'record') orb.el.focus();
    },
    destroy() {
      alive = false;
      brain.removeEventListener?.('status', onStatus);
      document.removeEventListener('keydown', onKey);
      unsubStore?.();
      meter.stop();
      speaker.stop();
      controller?.abort();
    },
  };
}
