// Rule splitter (architecture 2.3): one ramble becomes several items. Pure: `now` is a parameter.
// It cuts on line breaks, sentence ends and clause connectors, then sorts each part with the rule sorter.
import { sortByRules, TASK_VERBS } from './sorter.js';

export const MAX_ITEMS = 8;
const CUT = '\u0001';

const VERBS = new Set([...TASK_VERBS.filter((v) => !['up', 'off', 'out'].includes(v)), 'call', 'phone', 'ring', 'message', 'ask', 'tell', 'visit', 'buy']);
const LEAD = /^(?:(?:tomorrow|today|tonight|later|next \w+|on \w+day|this \w+|please|then|so|and|also|oh|okay|ok|alright|well|um+|uh+)\b[\s,]*)+/;
const MODAL = /^(?:(?:i|we)\s+)?(?:really\s+)?(?:need to|have to|has to|must|should|want to|gotta|got to|going to|will|'ll|ought to)\s+(?:really\s+)?/;
const CUES = /^(?:remind me|don't forget|dont forget|remember to)\b/;
const OPENERS = /^(?:(?:okay|ok|alright|right|um+|uh+|so|well|and|oh|also|then|plus|yeah|anyway)\b[\s,]*)+/i;
const CONTINUATION = /^(?:it|it's|its|they|them|that|this|these|those|he|she|which|because|but)\b/i;
const ABBREVIATION = /\b(?:dr|mr|mrs|ms|prof|st|vs|no|e\.g|i\.e|etc)\.$/i;

const norm = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const wordCount = (s) => (s.match(/[\p{L}\p{N}']+/gu) ?? []).length;

// True when the clause opens with an action: a task verb, an appointment verb, or a reminder cue, after any
// time words and "I need to" style lead-ins.
export function startsAction(clause) {
  let s = norm(clause).toLowerCase().replace(/^[\s,;:-]+/, '');
  s = s.replace(LEAD, '').replace(MODAL, '');
  if (CUES.test(s)) return true;
  const first = s.match(/^[a-z']+/)?.[0];
  if (!first) return false;
  if (first === 'pick' || first === 'drop' || first === 'sort' || first === 'look') return true;
  return VERBS.has(first);
}

function lines(text) {
  return String(text ?? '')
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))
    .map(norm)
    .filter(Boolean);
}

function sentences(line) {
  const parts = line.split(/(?<=[.!?])\s+(?=\S)|;\s+/);
  const out = [];
  for (const p of parts) {
    const prev = out[out.length - 1];
    if (prev && ABBREVIATION.test(prev)) out[out.length - 1] = `${prev} ${p}`;
    else out.push(p);
  }
  return out.filter(Boolean);
}

// Explicit connectors always cut, provided both sides keep two words.
const CONNECTORS = [
  /,?\s+and also\s+/gi,
  /,?\s+oh,? and\s+/gi,
  /,?\s+and then\s+/gi,
  /,\s*then\s+/gi,
  /,\s*also,?\s+/gi,
  /,\s*plus\s+/gi,
];

function cutConnectors(sentence) {
  let s = sentence;
  for (const re of CONNECTORS) {
    s = s.replace(re, (m, offset) => (wordCount(s.slice(0, offset)) >= 2 ? CUT : m));
  }
  // before a reminder cue that follows other words: "..., remind me Monday at 9 to book the car"
  s = s.replace(/(?:[,;]\s*(?:and\s+)?|\s+and\s+|\s+)(?=(?:remind me|don't forget|remember to)\b)/gi, (m, offset) => (wordCount(s.slice(0, offset)) >= 2 ? CUT : m));
  return s.split(CUT);
}

// Cuts at "," / ", and" / " and" only when the segment so far and the next clause both open with an action,
// or when ", and I ..." starts a new clause with its own subject.
function cutOnActions(segment) {
  const re = /(,\s*(?:and\s+)?|\s+and\s+)(?=\S)/gi;
  const cuts = [];
  let last = 0;
  let m;
  while ((m = re.exec(segment)) !== null) {
    const left = segment.slice(last, m.index);
    const right = segment.slice(m.index + m[0].length);
    const comma = m[0].includes(',');
    const newSubject = comma && /^and\s/i.test(m[0].replace(/^,\s*/, '')) && /^(?:i|we)\s+\S+/i.test(right);
    if (wordCount(left) >= 2 && wordCount(right) >= 2 && ((startsAction(left) && startsAction(right)) || newSubject)) {
      cuts.push([m.index, m.index + m[0].length]);
      last = m.index + m[0].length;
    }
  }
  if (!cuts.length) return [segment];
  const out = [];
  let from = 0;
  for (const [a, b] of cuts) { out.push(segment.slice(from, a)); from = b; }
  out.push(segment.slice(from));
  return out;
}

const clean = (s) => norm(s).replace(/^[\s,;:.-]+/, '').replace(OPENERS, '').replace(/[\s,;]+$/, '').trim();

// The texts of one ramble in spoken order, before sorting.
export function splitTexts(text) {
  const raw = [];
  for (const line of lines(text)) {
    for (const sentence of sentences(line)) {
      let first = true;
      for (const part of cutConnectors(sentence)) {
        for (const seg of cutOnActions(part)) {
          const c = clean(seg);
          if (c) raw.push({ text: c, sentenceStart: first });
          first = false;
        }
      }
    }
  }
  // fragments under two words join the previous part (or the next when first)
  const merged = [];
  for (let i = 0; i < raw.length; i += 1) {
    const cur = raw[i];
    if (wordCount(cur.text) < 2 && (merged.length || i + 1 < raw.length)) {
      if (merged.length) merged[merged.length - 1].text += ` ${cur.text}`;
      else raw[i + 1].text = `${cur.text} ${raw[i + 1].text}`;
    } else if (cur.sentenceStart && merged.length && CONTINUATION.test(cur.text)) {
      merged[merged.length - 1].text += ` ${cur.text}`;
    } else {
      merged.push({ ...cur });
    }
  }
  return merged.map((m) => m.text);
}

const dropScores = ({ scores, ...rest }) => rest;

// Sorted parts of a ramble: [{ text, type, alt_type, confidence, title, tags, due_at }], 1..MAX_ITEMS.
// Two neighbouring journal parts read as one entry and merge. A single sentence stays one item.
export function splitByRules(text, now) {
  const texts = splitTexts(text);
  if (!texts.length) return [];
  const items = [];
  for (const t of texts) {
    const sorted = sortByRules(t, now);
    const prev = items[items.length - 1];
    if (prev && prev.type === 'journal' && sorted.type === 'journal') {
      const joined = `${prev.text}${/[.!?]$/.test(prev.text) ? '' : '.'} ${t}`;
      items[items.length - 1] = { text: joined, ...dropScores(sortByRules(joined, now)) };
    } else {
      items.push({ text: t, ...dropScores(sorted) });
    }
  }
  while (items.length > MAX_ITEMS) {
    const last = items.pop();
    const joined = `${items[items.length - 1].text} ${last.text}`;
    items[items.length - 1] = { text: joined, ...dropScores(sortByRules(joined, now)) };
  }
  return items;
}
