// Validators for model and provider output (AC-B1.4: nothing malformed is ever stored). Pure.
// Each takes a parsed JSON object and returns a clean value or throws AiError('malformed').
import { TYPES, LIMITS } from '../core/model.js';
import { AiError } from '../core/ai/http.js';

const bad = (why) => new AiError('malformed', `The AI reply was not usable: ${why}.`);
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const wordsOf = (s) => oneLine(s).split(' ').filter(Boolean);

function cleanTitle(v) {
  const t = oneLine(v);
  if (!t) return null;
  if (t.length <= LIMITS.TITLE_MAX) return t;
  const cutAt = t.slice(0, LIMITS.TITLE_MAX + 1).lastIndexOf(' ');
  return (cutAt > 0 ? t.slice(0, cutAt) : t.slice(0, LIMITS.TITLE_MAX)).trim();
}

const cleanWhen = (v) => (typeof v === 'string' && oneLine(v) && oneLine(v).toLowerCase() !== 'null' ? oneLine(v) : null);

// { type, title, text, when } for one item. Unknown type or empty text throws.
function item(raw, i) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad(`item ${i + 1} is not an object`);
  if (!TYPES.includes(raw.type)) throw bad(`item ${i + 1} has an unknown type`);
  const text = oneLine(raw.text);
  if (!text) throw bad(`item ${i + 1} has no text`);
  return { type: raw.type, title: cleanTitle(raw.title), text, when: cleanWhen(raw.when) };
}

export function validateSplit(rawObj) {
  // a small model sometimes answers a one-thought note with the bare item instead of { items: [item] }
  const obj = rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj.items) && rawObj.type && rawObj.text ? { items: [rawObj] } : rawObj;
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) throw bad('no items list');
  if (obj.items.length === 0) throw bad('the items list is empty');
  return obj.items.slice(0, 8).map(item);
}

export function validateClassify(obj) {
  if (!obj || typeof obj !== 'object') throw bad('no object');
  if (!TYPES.includes(obj.type)) throw bad('unknown type');
  return { type: obj.type, title: cleanTitle(obj.title), when: cleanWhen(obj.when) };
}

function list(v, field, min, max) {
  if (!Array.isArray(v)) throw bad(`${field} is not a list`);
  const items = v.filter((x) => typeof x === 'string').map(oneLine).filter(Boolean).slice(0, max);
  if (items.length < min) throw bad(`${field} has fewer than ${min} entries`);
  return items;
}

// Expansion: 3-5 next steps, 3-5 questions, 3-7 outline lines. (v1 accepted 1-5; v2 asks for 3 or more.)
export function validateExpansionV2(obj) {
  if (!obj || typeof obj !== 'object') throw bad('no object');
  return { next_steps: list(obj.next_steps, 'next_steps', 3, 5), questions: list(obj.questions, 'questions', 3, 5), outline: list(obj.outline, 'outline', 3, 7) };
}

export function validatePlan(obj) {
  if (!obj || typeof obj !== 'object') throw bad('no object');
  return { steps: list(obj.steps, 'steps', 3, 8).map((text) => ({ text, done: false })) };
}

// Answer text at most 40 words; longer is cut at the 40th word with a full stop rather than rejected.
export function validateAnswer(obj) {
  if (!obj || typeof obj !== 'object') throw bad('no object');
  const words = wordsOf(obj.answer);
  if (!words.length) throw bad('the answer is empty');
  return words.length <= 40 ? words.join(' ') : `${words.slice(0, 40).join(' ').replace(/[,;:]$/, '')}.`;
}

// A reworded question: one line, at most 20 words, still a question.
export function validateWording(obj) {
  if (!obj || typeof obj !== 'object') throw bad('no object');
  const words = wordsOf(obj.question);
  if (!words.length || words.length > 20) throw bad('the question is empty or too long');
  const text = words.join(' ');
  if (!/\?$/.test(text)) throw bad('the reworded question is not a question');
  return text;
}

// The optional confirmation a key provider adds to a split: at most 40 words, else ignored.
export function optionalReply(obj) {
  const words = wordsOf(obj?.reply);
  return words.length >= 1 && words.length <= 40 ? words.join(' ') : null;
}
