// Thought model: constants, construction, validation. Pure: no DOM, no clock (now is a parameter).

export const TYPES = Object.freeze(['idea', 'task', 'journal', 'reminder']);
export const SOURCES = Object.freeze(['typed', 'voice', 'import']);
// 'ai' is the v1 spelling of 'key'; it stays valid so v1 rows and v1 export files still validate before they are upgraded.
export const SORT_BY = Object.freeze(['rules', 'device', 'key', 'ai']);
export const CLARIFY_STATES = Object.freeze(['none', 'pending', 'answered', 'skipped', 'unavailable']);
export const LIMITS = Object.freeze({ TITLE_MAX: 60, TAGS_MAX: 5 });

const words = (s) => s.split(/\s+/).filter(Boolean);

export const STOPWORDS = new Set(words(`
i me my mine myself you your yours he him his she her hers it its we us our ours they them their theirs
this that these those what which who whom whose something anything everything nothing someone anyone everyone thing things stuff
am is are was were be been being have has had having do does did done will would shall should can could may might must need needs want wants going gonna get got
a an the and or but if then than so because about above after again also just only very really maybe perhaps some any more most much many such into onto from with without within over under for of to in on at by up down out off there here when where while why how all each every both other like still even back well yeah okay please
think thinking thought idea ideas differently imagine remind reminder remember forget today tonight tomorrow yesterday morning evening week weekend next last day days hour hours minute minutes monday tuesday wednesday thursday friday saturday sunday keep feel felt make made take time todo
`));

// Lowercase words of four letters or more that are not stopwords: what a note is about.
export function contentWords(text) {
  return (String(text ?? '').toLowerCase().replace(/[’‘]/g, "'").match(/[a-z]+(?:'[a-z]+)*/g) ?? [])
    .filter((w) => w.length >= 4 && !w.includes("'") && !STOPWORDS.has(w));
}

export function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const v = t.trim().toLowerCase().replace(/\s+/g, ' ');
    if (v && !out.includes(v)) out.push(v);
    if (out.length === LIMITS.TAGS_MAX) break;
  }
  return out;
}

const FILLERS = ['remind me to', "don't forget to", 'remember to', 'i need to', 'i have to', 'i should really', 'i should', 'need to', 'oh and', 'and also', 'also', 'i think', 'so'];

function firstSentence(text) {
  const m = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return m ? m[0] : text;
}

export function makeTitle(text) {
  const trimmed = String(text ?? '').trim();
  const sentence = firstSentence(trimmed).trim();
  let s = sentence;
  for (let changed = true; changed;) {
    changed = false;
    for (const f of FILLERS) {
      const re = new RegExp(`^${f}(?=\\s|$)`, 'i');
      if (re.test(s)) {
        s = s.replace(re, '').replace(/^[\s,:;-]+/, '');
        changed = true;
      }
    }
  }
  s = s.replace(/[.,;:!?\s]+$/, '').trim();
  if (!s) s = sentence.replace(/[.,;:!?\s]+$/, '').trim();
  if (!s) s = trimmed;
  if (!s) return s;
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > LIMITS.TITLE_MAX) {
    const cut = s.slice(0, LIMITS.TITLE_MAX + 1).lastIndexOf(' ');
    s = (cut > 0 ? s.slice(0, cut) : s.slice(0, LIMITS.TITLE_MAX)).trim();
  }
  return s;
}

function validDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

export function newThought({ text, source = 'typed', sortResult, now, id, by = 'rules', model = null, origin = null, bestGuess = false } = {}) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) throw new TypeError('text must be a non-empty string');
  if (!validDate(now)) throw new TypeError('now must be a valid Date');
  if (!sortResult || typeof sortResult !== 'object') throw new TypeError('sortResult is required');
  const iso = now.toISOString();
  return {
    id: id ?? globalThis.crypto.randomUUID(),
    text: clean,
    type: sortResult.type,
    title: sortResult.title,
    tags: normalizeTags(sortResult.tags),
    created_at: iso,
    updated_at: iso,
    source,
    sort: {
      by,
      confidence: sortResult.confidence,
      alt_type: sortResult.alt_type ?? null,
      model,
    },
    due_at: sortResult.due_at ?? null,
    done: false,
    done_at: null,
    clarify: { state: 'none', case: null, question: null, answer: null },
    expansion: null,
    review: { last_reviewed_at: null, snoozed_until: null, dismissed: false },
    origin,
    best_guess: bestGuess,
    plan: null,
    v: 2,
  };
}

// A brain Item (architecture 2.2) becomes a stored thought. origin: { id, index, count } or null.
export function thoughtFromItem(item, { source = 'typed', now, id, origin = null, model = null } = {}) {
  return newThought({
    text: item.text,
    source,
    now,
    id,
    by: item.by ?? 'rules',
    model,
    origin,
    bestGuess: Boolean(item.best_guess),
    sortResult: { type: item.type, title: item.title, tags: item.tags, confidence: item.confidence, alt_type: item.alt_type, due_at: item.due_at },
  });
}

const isIso = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateThought(t) {
  const errors = [];
  if (!isObj(t)) return { ok: false, errors: ['thought must be an object'] };
  if (typeof t.id !== 'string' || !t.id) errors.push('id must be a non-empty string');
  if (typeof t.text !== 'string' || !t.text.trim()) errors.push('text must be a non-empty string');
  if (!TYPES.includes(t.type)) errors.push('type must be idea, task, journal or reminder');
  if (typeof t.title !== 'string' || t.title.length < 1 || t.title.length > LIMITS.TITLE_MAX) {
    errors.push('title must be 1-60 characters');
  }
  if (!Array.isArray(t.tags) || t.tags.length > LIMITS.TAGS_MAX
    || t.tags.some((x) => typeof x !== 'string' || !x || x !== x.toLowerCase())) {
    errors.push('tags must be at most 5 non-empty lowercase strings');
  }
  if (!isIso(t.created_at)) errors.push('created_at must be an ISO date');
  if (!isIso(t.updated_at)) errors.push('updated_at must be an ISO date');
  if (!SOURCES.includes(t.source)) errors.push('source must be typed, voice or import');
  if (!isObj(t.sort)) {
    errors.push('sort must be an object');
  } else {
    if (!SORT_BY.includes(t.sort.by)) errors.push('sort.by must be rules, device or key');
    if (typeof t.sort.confidence !== 'number' || !(t.sort.confidence >= 0 && t.sort.confidence <= 1)) {
      errors.push('sort.confidence must be a number from 0 to 1');
    }
    if (t.sort.alt_type !== null && !TYPES.includes(t.sort.alt_type)) errors.push('sort.alt_type must be a type or null');
    if (t.sort.model !== null && typeof t.sort.model !== 'string') errors.push('sort.model must be a string or null');
  }
  if (t.due_at !== null && !isIso(t.due_at)) errors.push('due_at must be null or an ISO date');
  if (typeof t.done !== 'boolean') errors.push('done must be a boolean');
  if (t.done_at !== null && !isIso(t.done_at)) errors.push('done_at must be null or an ISO date');
  if (!isObj(t.clarify) || !CLARIFY_STATES.includes(t.clarify.state)) errors.push('clarify.state is invalid');
  if (t.expansion !== null && !isObj(t.expansion)) errors.push('expansion must be null or an object');
  if (!isObj(t.review)) {
    errors.push('review must be an object');
  } else {
    if (t.review.last_reviewed_at !== null && !isIso(t.review.last_reviewed_at)) errors.push('review.last_reviewed_at is invalid');
    if (t.review.snoozed_until !== null && !isIso(t.review.snoozed_until)) errors.push('review.snoozed_until is invalid');
    if (typeof t.review.dismissed !== 'boolean') errors.push('review.dismissed must be a boolean');
  }
  // v2 fields are optional so v1 rows validate; when present they must be well formed.
  if (t.origin !== undefined && t.origin !== null) {
    if (!isObj(t.origin) || typeof t.origin.id !== 'string' || !t.origin.id
      || !Number.isInteger(t.origin.index) || !Number.isInteger(t.origin.count)) errors.push('origin must be null or { id, index, count }');
  }
  if (t.best_guess !== undefined && typeof t.best_guess !== 'boolean') errors.push('best_guess must be a boolean');
  if (t.plan !== undefined && t.plan !== null && !isObj(t.plan)) errors.push('plan must be null or an object');
  return { ok: errors.length === 0, errors };
}
