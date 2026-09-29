// The brain (architecture 2.2-2.5). Pure: the model, the embedder, the provider, the store, the settings and the clock are
// injected, so every path runs in Node tests with stubs. Code decides; a model only proposes (A4):
// rules sort and store first, a model refines split, type and title, and code owns dates, tags, confidence and the question.
import { parseWhen, scanWhen } from '../core/timeparse.js';
import { sortByRules, APPOINTMENT_VERBS } from '../core/sorter.js';
import { splitByRules, MAX_ITEMS } from '../core/splitter.js';
import { makeTitle, contentWords, normalizeTags, TYPES } from '../core/model.js';
import { detectAmbiguity } from '../core/ambiguity.js';
import { intent as detectIntent } from '../core/intent.js';
import { replyFor, answerTemplate, limitWords } from '../core/reply.js';
import { keywordRank, searchThoughts } from '../core/search.js';
import { embedText, embedHash, topK, ASK_MIN, RELATED_MIN, relatedByWords, topicsFor } from '../core/vector.js';
import { extractJson } from '../core/ai/adapter.js';
import { AiError, describeAiError } from '../core/ai/http.js';
import { splitPrompt, classifyPrompt, expandPrompt, planPrompt, answerPrompt, asMessages } from './prompts.js';
import { validateSplit, validateClassify, validateExpansionV2, validatePlan, validateAnswer, answerGrounded } from './validate.js';

export const LLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
export const LLM_BYTES = 870000000;
export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBED_BYTES = 29000000;
export const EMBED_ROW_MODEL = `${EMBED_MODEL}@q8`;
export const DEVICE_TIMEOUTS = Object.freeze({ split: 20000, classify: 20000, expand: 45000, plan: 45000, answer: 20000 });
export const LLM_FLAG = 'brain.llm_loading';
export const STOPPED_MESSAGE = "The assistant stopped working, so I'm using simple rules for now. Try again in Settings.";
const BATCH = 16;

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---- rules and refinement (pure) --------------------------------------------------------------------------------

const REMINDER_CUE = /\b(?:remind me|don't forget|dont forget|remember to)\b/i;

function ruleItem(part) {
  return {
    text: part.text,
    type: part.type,
    alt_type: part.alt_type ?? null,
    confidence: part.confidence,
    title: part.title,
    tags: part.tags ?? [],
    due_at: part.due_at ?? null,
    by: 'rules',
    question: null,
    best_guess: false,
  };
}

export function splitRulesItems(text, now) {
  return splitByRules(text, now).map(ruleItem);
}

export function classifyRulesItem(text, now) {
  const t = oneLine(text);
  const { scores, ...sorted } = sortByRules(t, now);
  void scores;
  return ruleItem({ text: t, ...sorted });
}

// Refinement rules of architecture 2.3, steps 1-4, for one model item { type, title, text, when }.
export function refineItem(mi, now, by) {
  const text = oneLine(mi.text);
  const rules = sortByRules(text, now);
  let type = mi.type;
  const first = text.toLowerCase().match(/^[a-z']+/)?.[0] ?? '';
  const cue = REMINDER_CUE.test(text);
  const timed = scanWhen(text).hasClock && APPOINTMENT_VERBS.has(first);
  if (cue || timed) type = 'reminder';
  let confidence;
  let alt = null;
  const family = (t) => (t === 'task' || t === 'reminder' ? 'do' : 'think');
  if (rules.confidence === 0) confidence = 0.8; // the rules found no cue at all: no opinion, so no disagreement
  else if (rules.type === type) confidence = 0.9;
  else if (family(rules.type) !== family(type) && rules.confidence >= 0.9 && rules.scores[rules.type] >= 2) {
    // a strong, unopposed rule cue (a leading task verb, a reminder phrase, "what if") beats a model that crosses
    // between doing and thinking; real 1.5B replies filed "buy dog food" as an idea. Task/reminder and idea/journal
    // disagreements stay with the model and go to the one question.
    type = rules.type;
    confidence = 0.9;
  } else { confidence = 0.6; alt = rules.type; }
  let due = null;
  if (type === 'reminder' || type === 'task') {
    due = (mi.when ? parseWhen(mi.when, now).due_at : null) ?? parseWhen(text, now).due_at ?? null;
  }
  return {
    text,
    type,
    alt_type: alt,
    confidence,
    title: mi.title && aligned({ title: mi.title, text }) ? mi.title : makeTitle(text),
    tags: normalizeTags(rules.tags),
    due_at: due,
    by,
    question: null,
    best_guess: false,
  };
}

// A model item whose words are mostly not in the note was invented (spike 2: example items leaked into answers).
function grounded(mi, noteWords) {
  const words = contentWords(mi.text);
  if (!words.length) return true;
  return words.filter((w) => noteWords.has(w)).length / words.length >= 0.5;
}

const positionIn = (note, text) => note.toLowerCase().indexOf(oneLine(text).toLowerCase().slice(0, 30));

// Step 5: if the model's items cover under 60% of the note's content words, each uncovered rule part is added.
// A rule part none of whose content words the model covered is added even when the overall share is higher.
export function coverageGuard(note, items, now) {
  const noteWords = new Set(contentWords(note));
  if (!noteWords.size) return items.slice(0, MAX_ITEMS);
  const covered = new Set(contentWords(items.map((i) => i.text).join(' ')));
  const share = [...noteWords].filter((w) => covered.has(w)).length / noteWords.size;
  const parts = splitByRules(note, now);
  const missing = (p) => {
    const ws = contentWords(p.text);
    return ws.length > 0 && ws.filter((w) => covered.has(w)).length / ws.length;
  };
  const extra = parts.filter((p) => {
    const m = missing(p);
    return m !== false && (share < 0.6 ? m < 0.5 : m === 0);
  }).map(ruleItem);
  if (!extra.length) return items.slice(0, MAX_ITEMS);
  let prev = -1;
  const placed = [...items, ...extra].map((it, i) => {
    let pos = positionIn(note, it.text);
    if (pos < 0) pos = prev + 0.001;
    prev = pos;
    return { it, pos, i };
  });
  placed.sort((a, b) => a.pos - b.pos || a.i - b.i);
  return placed.map((p) => p.it).slice(0, MAX_ITEMS);
}

// ---- how far to trust a model split ---------------------------------------------------------------------------
// Real 1.5B output (e2e/v2-brain.mjs --real-model): the `text` spans are usually faithful, but titles and types are often
// shifted onto the neighbouring item, one item may swallow two sentences, and a sentence may be dropped. So the model's
// split is used as it is only when every item is self-consistent (its title shares a word with its text) and the items
// cover the note; otherwise the rule split is the skeleton and the model only labels the parts it matches unambiguously.
const stem = (w) => w.replace(/(?:ing|ed|es|s)$/, '');
const stems = (text) => new Set(contentWords(text).map(stem));
export const TRUST_COVERAGE = 0.8;

function aligned(mi) {
  const t = stems(mi.title ?? '');
  const x = stems(mi.text);
  if (!t.size || !x.size) return true;
  for (const w of t) if (x.has(w)) return true;
  return false;
}

function coverageShare(note, items) {
  const noteWords = new Set(contentWords(note));
  if (!noteWords.size) return 1;
  const covered = new Set(contentWords(items.map((i) => i.text).join(' ')));
  return [...noteWords].filter((w) => covered.has(w)).length / noteWords.size;
}

const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n += 1; return n; };

function hybridSplit(usable, note, now, by) {
  const parts = splitByRules(note, now);
  const taken = new Set();
  return parts.map((part) => {
    const pw = stems(part.text);
    const hits = pw.size === 0 ? [] : usable.filter((mi) => {
      const mw = stems(mi.text);
      const o = overlap(pw, mw);
      return mw.size > 0 && o / pw.size >= 0.6 && o / mw.size >= 0.6;
    });
    if (hits.length === 1 && !taken.has(hits[0])) {
      taken.add(hits[0]);
      return refineItem({ ...hits[0], text: part.text }, now, by);
    }
    return ruleItem(part);
  });
}

// Steps 1-6 over a whole validated model reply. Throws when nothing usable is left (the caller falls back to rules).
export function refineSplit(modelItems, note, now, by) {
  const noteWords = new Set(contentWords(note));
  const usable = modelItems.filter((mi) => grounded(mi, noteWords) && aligned(mi));
  if (!usable.length) throw new AiError('malformed', 'The AI reply had no usable items.');
  if (usable.length === modelItems.length && coverageShare(note, usable) >= TRUST_COVERAGE) {
    return coverageGuard(note, usable.map((mi) => refineItem(mi, now, by)), now);
  }
  return hybridSplit(usable, note, now, by).slice(0, MAX_ITEMS);
}

// ---- the one question (architecture 2.4) ------------------------------------------------------------------------

const CHIPS = { 1: ['Task', 'Reminder'], 2: ['Tonight', 'Tomorrow morning', 'This weekend'], 3: [], 4: ['Idea', 'Journal'], 5: [] };

export function ambiguityOf(item, source) {
  return detectAmbiguity(
    { type: item.type, alt_type: item.alt_type, confidence: item.confidence, due_at: item.due_at },
    item.text,
    { source, by: item.by === 'rules' ? 'rules' : 'ai' },
  );
}

const askable = (amb, aiAvailable) => Boolean(amb) && (aiAvailable || amb.case === 2 || amb.case === 5);
const toQuestion = (amb) => ({ case: amb.case, text: amb.question, chips: [...CHIPS[amb.case]] });

// Without any AI only cases 2 and 5 are asked; a voice note under 3 words falls under case 5 inside detectAmbiguity.
export function clarifyQuestionFor(item, { source = 'typed', aiAvailable = true } = {}) {
  const amb = ambiguityOf(item, source);
  return askable(amb, aiAvailable) ? toQuestion(amb) : null;
}

// In a ramble only the first askable item in spoken order carries the question; other ambiguous items are best guesses.
export function assignQuestions(items, { source = 'typed', aiAvailable = true } = {}) {
  let asked = false;
  return items.map((it) => {
    const amb = ambiguityOf(it, source);
    if (!amb) return { ...it, question: null, best_guess: false };
    if (!asked && askable(amb, aiAvailable)) {
      asked = true;
      return { ...it, question: toQuestion(amb), best_guess: false };
    }
    return { ...it, question: null, best_guess: true };
  });
}

// ---- answers to the one question ---------------------------------------------------------------------------------

export function whenFromAnswer(text, now) {
  const t = oneLine(text).toLowerCase();
  const parsed = parseWhen(t, now).due_at;
  if (parsed) return parsed;
  if (/\bweekend\b/.test(t)) {
    let days = (6 - now.getDay() + 7) % 7;
    if (days === 0 && now.getHours() >= 10) days = 1;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 10, 0, 0, 0).toISOString();
  }
  const part = t.match(/\b(morning|afternoon|evening)\b/);
  if (part) {
    const h = { morning: 9, afternoon: 15, evening: 19 }[part[1]];
    let d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0, 0);
    if (d.getTime() <= now.getTime()) d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, 0, 0, 0);
    return d.toISOString();
  }
  return null;
}

function typeFromAnswer(caseNo, text) {
  const t = oneLine(text).toLowerCase();
  const has = (re) => re.test(t);
  if (caseNo === 1) {
    if (has(/\bremind|\btime\b|\bspecific\b|\bat \d/)) return 'reminder';
    if (has(/\btask\b|\bto ?do\b|\bjust do\b/)) return 'task';
  }
  if (caseNo === 4) {
    if (has(/\bidea\b|\bdevelop\b/)) return 'idea';
    if (has(/\bjournal\b|\bnote\b|\bdiary\b/)) return 'journal';
  }
  return null;
}

const withTimeout = (promise, ms, make) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(make()), ms);
  Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});

const yieldIdle = () => new Promise((resolve) => {
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(() => resolve(), { timeout: 200 });
  else setTimeout(resolve, 0);
});

// ---- createBrainCore --------------------------------------------------------------------------------------------

// deps: { store, settings, now, llm, embedder, getProvider, online, timeouts }
//   llm      { generate(messages, { maxTokens, timeoutMs }) -> string, check?(), load?({ onProgress }), cancel?(), loaded?(), model? }
//   embedder { embed(texts) -> Float32Array[], check?(), load?({ onProgress }), cancel?(), loaded?() }
//   getProvider() -> provider | null (the own-key provider for the current settings; same object while settings are unchanged)
export function createBrainCore(deps) {
  const {
    store, settings = { getSettings: () => ({}), setSettings: () => ({}) }, now = () => new Date(), llm = null, embedder = null,
    getProvider = () => null, online = () => globalThis.navigator?.onLine !== false,
  } = deps;
  const timeouts = { ...DEVICE_TIMEOUTS, ...(deps.timeouts ?? {}) };
  const clock = () => now();
  const target = new EventTarget();

  const read = (k, fallback = null) => { try { return settings.getSettings()?.[k] ?? fallback; } catch { return fallback; } };
  const write = (patch) => { try { settings.setSettings(patch); } catch { /* settings blocked: the session copy is enough */ } };

  // ---- status ----
  const stubLlm = Boolean(llm) && typeof llm.load !== 'function';
  const stubEmbed = Boolean(embedder) && typeof embedder.load !== 'function';
  let llmState = !llm
    ? { state: 'not-supported', reason: 'no-webgpu' }
    : stubLlm ? { state: 'ready', model: llm.model ?? LLM_MODEL } : { state: 'not-downloaded', bytes: LLM_BYTES };
  let embedState = !embedder
    ? { state: 'not-supported', reason: 'no-wasm' }
    : stubEmbed ? { state: 'ready', model: EMBED_MODEL } : { state: 'not-downloaded', bytes: EMBED_BYTES };
  let keyRejectedFor = null;
  let lastError = null;
  let llmLoad = null;
  let embedLoad = null;
  let loadGen = 0;
  let embedGen = 0;

  const keyState = () => {
    const p = getProvider();
    if (!p) return 'none';
    return keyRejectedFor === p ? 'rejected' : 'set';
  };
  const engineNow = () => {
    const p = getProvider();
    if (p && keyRejectedFor !== p) return 'key';
    return llm && llmState.state === 'ready' ? 'device' : 'rules';
  };
  const getStatus = () => ({
    llm: { ...llmState },
    embed: { ...embedState },
    key: keyState(),
    online: online(),
    engine: engineNow(),
    lastError: lastError ? { ...lastError } : null,
  });
  const emit = () => target.dispatchEvent(new CustomEvent('status', { detail: getStatus() }));
  const setLlm = (next) => { llmState = next; emit(); };
  const setEmbed = (next) => { embedState = next; emit(); };

  // ---- one AI call over the ladder: own key, then on-device model; null result means rules ----
  function onKeyError(e, provider) {
    if (e?.kind === 'auth') keyRejectedFor = provider;
    lastError = { engine: 'key', kind: e?.kind ?? 'provider', message: e?.kind === 'auth' ? 'Key rejected.' : describeAiError(e) };
    emit();
  }
  function onDeviceError(e) {
    if (e?.kind === 'malformed') { lastError = { engine: 'device', kind: 'malformed', message: describeAiError(e) }; emit(); return; }
    const message = e?.kind === 'timeout' ? 'The assistant took too long.' : (oneLine(e?.message) || 'The assistant stopped working.');
    lastError = { engine: 'device', kind: e?.kind ?? 'run-failed', message };
    llmState = { state: 'error', code: 'run-failed', message };
    emit();
  }

  async function runAi(op, { key, device }) {
    let error = null;
    const provider = getProvider();
    if (provider && keyRejectedFor !== provider) {
      if (online()) {
        try {
          const value = await withTimeout(key(provider), (timeouts[op] ?? 20000) + 500, () => new AiError('timeout', 'The AI did not answer in time.'));
          return { by: 'key', model: provider.model ?? null, value };
        } catch (e) { error = e; onKeyError(e, provider); }
      } else {
        error = new AiError('network', 'You are offline.');
      }
    }
    if (llm && llmState.state === 'ready') {
      try {
        const value = await device();
        return { by: 'device', model: llmState.model ?? LLM_MODEL, value };
      } catch (e) { error = e; onDeviceError(e); }
    }
    return { by: null, error };
  }

  const deviceJson = async (op, prompt, maxTokens, validate) => {
    const raw = await withTimeout(
      llm.generate(asMessages(prompt), { maxTokens, timeoutMs: timeouts[op] }),
      timeouts[op],
      () => new AiError('timeout', 'The assistant took too long.'),
    );
    return validate(extractJson(raw));
  };

  // ---- capture ----
  function finishItems(items, source) {
    return assignQuestions(items, { source, aiAvailable: engineNow() !== 'rules' });
  }

  // With an own key the provider also rewords the question text (code still chose the case and the chips).
  async function wordQuestion(items) {
    const provider = getProvider();
    const at = items.findIndex((i) => i.question);
    if (at < 0 || !provider || keyRejectedFor === provider || !online() || typeof provider.word !== 'function') return items;
    try {
      const text = await withTimeout(provider.word(items[at].question.text, items[at].text), 8000, () => new AiError('timeout', 'The AI did not answer in time.'));
      return items.map((it, i) => (i === at ? { ...it, question: { ...it.question, text } } : it));
    } catch (e) {
      if (e?.kind === 'auth') { keyRejectedFor = provider; emit(); }
      return items;
    }
  }

  function splitRules(text, { source = 'typed' } = {}) {
    const items = splitRulesItems(oneLine(text) ? String(text) : '', clock());
    return assignQuestions(items, { source, aiAvailable: false });
  }

  async function split(text, { source = 'typed' } = {}) {
    const note = String(text ?? '').trim();
    if (!note) return [];
    const at = clock();
    let items = null;
    let keyReply = null;
    try {
      const r = await runAi('split', {
        key: (p) => p.split(note),
        device: () => deviceJson('split', splitPrompt(note), 400, validateSplit),
      });
      if (r.by) {
        try { items = refineSplit(r.value, note, at, r.by); } catch (e) { onDeviceError(e); }
      }
      if (items) keyReply = r.by === 'key' ? (r.value.reply ?? null) : null;
    } catch (e) { onDeviceError(e); }
    if (!items) items = splitRulesItems(note, at);
    if (!items.length) items = [classifyRulesItem(note, at)];
    let done = finishItems(items, source);
    if (keyReply) remember(done, keyReply);
    if (items.some((i) => i.by === 'key')) done = await wordQuestion(done);
    return done;
  }

  async function classify(text, { source = 'typed' } = {}) {
    const note = oneLine(text);
    if (!note) throw new TypeError('text must be a non-empty string');
    const at = clock();
    let item = null;
    try {
      const r = await runAi('classify', {
        key: (p) => p.classify(note),
        device: () => deviceJson('classify', classifyPrompt(note), 200, validateClassify),
      });
      if (r.by) item = refineItem({ ...r.value, text: note }, at, r.by);
    } catch (e) { onDeviceError(e); }
    if (!item) item = classifyRulesItem(note, at);
    return finishItems([item], source)[0];
  }

  const clarifyQuestion = (item, { source = 'typed', aiAvailable = engineNow() !== 'rules' } = {}) => clarifyQuestionFor(item, { source, aiAvailable });

  async function answer(thought, question, replyText) {
    const at = clock();
    const text = oneLine(replyText);
    const base = { type: thought.type, title: thought.title, tags: [...(thought.tags ?? [])], due_at: thought.due_at ?? null };
    const caseNo = question?.case;
    if (caseNo === 2) {
      const due = whenFromAnswer(text, at);
      if (due) return { ...base, due_at: due };
    }
    const chosen = typeFromAnswer(caseNo, text);
    if (chosen) return { ...base, type: chosen, due_at: chosen === 'idea' || chosen === 'journal' ? null : base.due_at };
    const combined = `${oneLine(thought.text)}. ${text}`;
    if (!text) return base;
    const item = await classify(combined, { source: 'import' });
    return { type: item.type, title: item.title, tags: item.tags, due_at: item.due_at };
  }

  // A key provider words the confirmation inside the split call; the sync reply() returns it for the same items.
  const replies = new Map();
  const replyKey = (items) => items.map((i) => i.text).join('\u0001');
  const remember = (items, text) => {
    if (!text) return;
    replies.set(replyKey(items), text);
    if (replies.size > 30) replies.delete(replies.keys().next().value);
  };
  const reply = (items) => replies.get(replyKey(items)) ?? replyFor(items, { now: clock() });

  // ---- expand and plan (never write; the caller stores the result) ----
  async function generate(op, prompt, { validate, maxTokens, keyCall }) {
    const r = await runAi(op, {
      key: keyCall,
      device: () => deviceJson(op, prompt, maxTokens, validate),
    });
    if (!r.by) throw r.error instanceof AiError ? r.error : new AiError('unavailable', 'No AI is available.');
    return r;
  }

  async function expand(thought) {
    const r = await generate('expand', expandPrompt(thought), { validate: validateExpansionV2, maxTokens: 600, keyCall: (p) => p.expand(thought) });
    return { ...r.value, generated_at: clock().toISOString(), by: r.by, model: r.model };
  }

  async function plan(thought) {
    const r = await generate('plan', planPrompt(thought), { validate: validatePlan, maxTokens: 600, keyCall: (p) => p.plan(thought) });
    return { steps: r.value.steps, generated_at: clock().toISOString(), by: r.by, model: r.model };
  }

  // ---- embeddings ----
  let queue = Promise.resolve();
  const enqueue = (fn) => { const run = queue.then(fn); queue = run.catch(() => {}); return run; };
  const idle = () => queue;
  const embedReady = () => Boolean(embedder) && embedState.state === 'ready';

  async function embed(texts) {
    if (!embedReady()) throw new AiError('unavailable', 'The search model is not ready.');
    return embedder.embed(texts);
  }

  async function indexNow(t) {
    if (!embedReady() || !t) return;
    const hash = embedHash(t);
    const row = await store.getEmbedding?.(t.id);
    if (row && row.hash === hash && row.model === EMBED_ROW_MODEL) return;
    const [vec] = await embedder.embed([embedText(t)]);
    await store.putEmbedding?.({ id: t.id, model: EMBED_ROW_MODEL, hash, vec });
  }
  const index = (thought) => enqueue(() => indexNow(thought));
  const unindex = (id) => enqueue(async () => { await store.deleteEmbedding?.(id); });

  // Rebuilds missing or stale rows in batches of 16, yielding between batches so the app stays responsive.
  function reindex() {
    const step = async () => {
      if (!embedReady()) return;
      const [thoughts, rows] = await Promise.all([store.getAll(), store.getAllEmbeddings?.() ?? []]);
      const have = new Map(rows.map((r) => [r.id, r]));
      const live = new Set(thoughts.map((t) => t.id));
      for (const r of rows) if (!live.has(r.id)) await store.deleteEmbedding?.(r.id);
      const todo = thoughts.filter((t) => { const r = have.get(t.id); return !r || r.hash !== embedHash(t) || r.model !== EMBED_ROW_MODEL; });
      for (let i = 0; i < todo.length; i += BATCH) {
        const chunk = todo.slice(i, i + BATCH);
        const vecs = await embedder.embed(chunk.map(embedText));
        for (let j = 0; j < chunk.length; j += 1) await store.putEmbedding?.({ id: chunk[j].id, model: EMBED_ROW_MODEL, hash: embedHash(chunk[j]), vec: vecs[j] });
        await yieldIdle();
      }
    };
    return enqueue(step);
  }

  const asSource = (t, score) => ({ id: t.id, score, title: t.title, type: t.type });

  async function ask(question) {
    const q = oneLine(question);
    try {
      if (!q) return { answer: answerTemplate(0), sources: [], mode: embedReady() ? 'meaning' : 'keyword', by: 'rules' };
      await idle();
      const thoughts = await store.getAll();
      const byId = new Map(thoughts.map((t) => [t.id, t]));
      let mode = 'keyword';
      let hits = [];
      if (embedReady()) {
        mode = 'meaning';
        const [qv] = await embedder.embed([q]);
        const rows = (await store.getAllEmbeddings?.() ?? []).filter((r) => byId.has(r.id));
        hits = topK(qv, rows, 3, { min: ASK_MIN }).map((h) => asSource(byId.get(h.id), h.score));
      } else {
        hits = keywordRank(thoughts, q, 3).map((r) => asSource(r.thought, r.score));
      }
      if (!hits.length) return { answer: answerTemplate(0), sources: [], mode, by: 'rules' };
      const cited = hits.map((h) => byId.get(h.id));
      let text = answerTemplate(hits.length);
      let by = 'rules';
      const r = await runAi('answer', {
        key: (p) => p.answer(q, cited),
        device: () => deviceJson('answer', answerPrompt(q, cited), 200, (obj) => {
          const text = validateAnswer(obj);
          if (!answerGrounded(text, q, cited)) throw new AiError('malformed', 'The answer was not based on your thoughts.');
          return text;
        }),
      });
      if (r.by) { text = r.value; by = r.by; }
      return { answer: limitWords(text, 40), sources: hits, mode, by };
    } catch {
      const thoughts = await store.getAll().catch(() => []);
      const hits = keywordRank(thoughts, q, 3).map((r) => asSource(r.thought, r.score));
      return { answer: answerTemplate(hits.length), sources: hits, mode: 'keyword', by: 'rules' };
    }
  }

  async function related(id, k = 3) {
    const thought = await store.get(id);
    if (!thought) return [];
    if (embedReady()) {
      await idle();
      await index(thought);
      const [rows, thoughts] = await Promise.all([store.getAllEmbeddings?.() ?? [], store.getAll()]);
      const byId = new Map(thoughts.map((t) => [t.id, t]));
      const self = rows.find((r) => r.id === id);
      if (self) {
        return topK(self.vec, rows.filter((r) => byId.has(r.id)), k, { min: RELATED_MIN, exclude: [id] }).map((h) => asSource(byId.get(h.id), h.score));
      }
    }
    return relatedByWords(thought, await store.getAll(), k);
  }

  async function topics() {
    const thoughts = await store.getAll();
    const ideas = thoughts.filter((t) => t.type === 'idea');
    let vectors = null;
    if (embedReady()) {
      await idle();
      const rows = await store.getAllEmbeddings?.() ?? [];
      vectors = new Map(rows.map((r) => [r.id, r.vec]));
    }
    return topicsFor(ideas, vectors);
  }

  async function merge(originId) {
    const rows = await store.getByOrigin(originId);
    if (!rows.length) throw new Error('Nothing to merge.');
    if (rows.length === 1) return rows[0];
    const [first, ...rest] = rows;
    const text = rows.map((r) => oneLine(r.text)).reduce((acc, t) => (acc ? `${acc}${/[.!?]$/.test(acc) ? '' : '.'} ${t}` : t), '');
    const item = await classify(text, { source: 'import' });
    const merged = {
      ...first,
      text,
      type: item.type,
      title: item.title,
      tags: item.tags,
      due_at: item.due_at,
      sort: { by: item.by, confidence: item.confidence, alt_type: item.alt_type, model: item.by === 'device' ? (llmState.model ?? LLM_MODEL) : (getProvider()?.model ?? null) },
      origin: null,
      best_guess: false,
      updated_at: clock().toISOString(),
    };
    await store.put(merged);
    await store.deleteMany(rest.map((r) => r.id));
    return merged;
  }

  // ---- model lifecycle ----
  const errorCode = (e) => (e?.code === 'watchdog' ? 'watchdog' : (globalThis.navigator?.onLine === false || e?.code === 'offline') ? 'offline' : 'load-failed');
  const errorText = (code, e) => (code === 'offline' ? 'You are offline. Connect to download the assistant.' : code === 'watchdog' ? 'The assistant did not start in time.' : (oneLine(e?.message) || STOPPED_MESSAGE));

  function prepareLlm() {
    if (!llm || llmState.state === 'not-supported') return Promise.resolve();
    if (llmState.state === 'ready') return Promise.resolve();
    if (llmLoad) return llmLoad;
    if (typeof llm.loaded === 'function' && llm.loaded()) { setLlm({ state: 'ready', model: llm.model ?? LLM_MODEL }); return Promise.resolve(); }
    const gen = (loadGen += 1);
    const firstTime = !read('brain.llm_ready_once', false);
    write({ [LLM_FLAG]: clock().toISOString(), 'brain.llm_consent': 'yes' });
    setLlm(firstTime ? { state: 'downloading', pct: 0, bytes: LLM_BYTES } : { state: 'loading', pct: 0 });
    llmLoad = Promise.resolve()
      .then(() => llm.load({
        onProgress: (pct) => {
          if (gen !== loadGen) return;
          const p = Math.max(llmState.pct ?? 0, Math.min(100, Math.round(pct)));
          if (p === llmState.pct) return;
          setLlm(firstTime ? { state: 'downloading', pct: p, bytes: LLM_BYTES } : { state: 'loading', pct: p });
        },
      }))
      .then(() => {
        if (gen !== loadGen) return;
        write({ [LLM_FLAG]: null, 'brain.llm_ready_once': true });
        lastError = null;
        setLlm({ state: 'ready', model: llm.model ?? LLM_MODEL });
      })
      .catch((e) => {
        if (gen !== loadGen) return;
        write({ [LLM_FLAG]: null });
        const code = errorCode(e);
        setLlm({ state: 'error', code, message: errorText(code, e) });
      })
      .finally(() => { if (gen === loadGen) llmLoad = null; });
    return llmLoad;
  }

  function prepareEmbed() {
    if (!embedder || embedState.state === 'not-supported') return Promise.resolve();
    if (embedState.state === 'ready') return Promise.resolve();
    if (embedLoad) return embedLoad;
    if (typeof embedder.loaded === 'function' && embedder.loaded()) { setEmbed({ state: 'ready', model: EMBED_MODEL }); return reindex().then(() => {}); }
    const gen = (embedGen += 1);
    const firstTime = !read('brain.embed_ready_once', false);
    write({ 'brain.embed_consent': 'yes' });
    setEmbed(firstTime ? { state: 'downloading', pct: 0, bytes: EMBED_BYTES } : { state: 'loading', pct: 0 });
    embedLoad = Promise.resolve()
      .then(() => embedder.load({
        onProgress: (pct) => {
          if (gen !== embedGen) return;
          const p = Math.max(embedState.pct ?? 0, Math.min(100, Math.round(pct)));
          if (p === embedState.pct) return;
          setEmbed(firstTime ? { state: 'downloading', pct: p, bytes: EMBED_BYTES } : { state: 'loading', pct: p });
        },
      }))
      .then(() => {
        if (gen !== embedGen) return undefined;
        write({ 'brain.embed_ready_once': true });
        setEmbed({ state: 'ready', model: EMBED_MODEL });
        return reindex();
      })
      .catch((e) => {
        if (gen !== embedGen) return;
        const code = errorCode(e);
        setEmbed({ state: 'error', code, message: errorText(code, e) });
      })
      .finally(() => { if (gen === embedGen) embedLoad = null; });
    return embedLoad;
  }

  // Embeddings first, then the language model (R8: one heavy load at a time).
  async function prepare({ llm: wantLlm = false, embed: wantEmbed = false } = {}) {
    if (wantEmbed) await prepareEmbed();
    if (wantLlm) await prepareLlm();
  }

  function cancel() {
    if (llmLoad || llmState.state === 'downloading' || llmState.state === 'loading') {
      loadGen += 1;
      llmLoad = null;
      try { llm?.cancel?.(); } catch { /* the host is already gone */ }
      write({ [LLM_FLAG]: null });
      setLlm({ state: 'not-downloaded', bytes: LLM_BYTES });
    }
    if (embedLoad || embedState.state === 'downloading' || embedState.state === 'loading') {
      embedGen += 1;
      embedLoad = null;
      try { embedder?.cancel?.(); } catch { /* the host is already gone */ }
      setEmbed({ state: 'not-downloaded', bytes: EMBED_BYTES });
    }
  }

  // ---- start ----
  const crashed = Boolean(read(LLM_FLAG, null));
  if (crashed && llm && !stubLlm) llmState = { state: 'error', code: 'load-failed', message: STOPPED_MESSAGE };

  const ready = (async () => {
    try {
      if (llm && !stubLlm && typeof llm.check === 'function') {
        const unsupported = await llm.check();
        if (unsupported) { llmState = unsupported; emit(); }
      }
      if (embedder && !stubEmbed && typeof embedder.check === 'function') {
        const unsupported = await embedder.check();
        if (unsupported) { embedState = unsupported; emit(); }
      }
      // Load only what was downloaded before and agreed to: embeddings, then the model (never with a key set, never after a crash).
      if (embedState.state === 'not-downloaded' && read('brain.embed_consent') === 'yes' && read('brain.embed_ready_once', false)) await prepareEmbed();
      else if (embedReady()) await reindex();
      if (llmState.state === 'not-downloaded' && !crashed && !getProvider() && read('brain.llm_consent') === 'yes' && read('brain.llm_ready_once', false)) await prepareLlm();
    } catch { /* a failed start step already set its own status */ }
    emit();
  })();

  const unsubscribe = typeof store?.onChange === 'function' ? store.onChange(({ kind, ids }) => {
    if (kind === 'clear') return;
    for (const id of ids ?? []) {
      if (kind === 'delete') { unindex(id); continue; }
      store.get(id).then((t) => (t ? index(t) : undefined)).catch(() => {});
    }
  }) : () => {};

  return Object.assign(target, {
    ready,
    getStatus,
    refresh: emit,
    prepare,
    cancel,
    split,
    splitRules,
    classify,
    clarifyQuestion,
    answer,
    reply,
    expand,
    plan,
    embed,
    index,
    unindex,
    reindex,
    merge,
    related,
    topics,
    ask,
    intent: detectIntent,
    search: (thoughts, query) => searchThoughts(thoughts, query),
    destroy() { unsubscribe(); },
  });
}

export { TYPES };
