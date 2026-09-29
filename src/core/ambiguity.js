// When is a sorted thought ambiguous enough to ask one question? Architecture section 6.5. Pure.

import { STOPWORDS } from './model.js';

export const CONFIDENCE_MARGIN = 0.6; // cases 1 and 4: ask when confidence <= this
export const CONFIDENCE_FLOOR = 0.4; // case 5: ask when confidence < this
export const MAX_QUESTION_WORDS = 20;

const isPair = (a, b, x, y) => (a === x && b === y) || (a === y && b === x);
const wordList = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean);

export function hasContentWord(text) {
  return String(text ?? '').toLowerCase().match(/[a-z']+/g)?.some((w) => w.length >= 4 && !STOPWORDS.has(w)) ?? false;
}

// Quotes at most 40 characters and keeps the whole question at 20 words or fewer.
export function shortQuestion(text) {
  let words = wordList(text);
  const fixed = 8; // "I only caught ''. What did you mean?" adds 8 words
  while (words.length > MAX_QUESTION_WORDS - fixed) words = words.slice(0, -1);
  let quoted = words.join(' ');
  if (quoted.length > 40) quoted = quoted.slice(0, 40).replace(/\s+\S*$/, '').trim() || quoted.slice(0, 40);
  return `I only caught '${quoted}'. What did you mean?`;
}

// sortResult: { type, alt_type, confidence, due_at } from the rule sorter or an AI provider.
// opts: { source: 'typed'|'voice'|'import', by: 'rules'|'ai' }. Returns { case, question } or null.
export function detectAmbiguity(sortResult, text, { source = 'typed', by = 'rules' } = {}) {
  if (!sortResult || source === 'import') return null;
  const { type, alt_type: alt = null, confidence = 0, due_at: due = null } = sortResult;

  if (isPair(type, alt, 'task', 'reminder') && confidence <= CONFIDENCE_MARGIN) {
    return { case: 1, question: 'Task to do, or a reminder at a specific time?' };
  }
  if (type === 'reminder' && !due) {
    return { case: 2, question: 'When should I remind you?' };
  }
  if (type === 'idea' && !hasContentWord(text)) {
    return { case: 3, question: 'What is the idea about?' };
  }
  if (isPair(type, alt, 'idea', 'journal') && confidence <= CONFIDENCE_MARGIN) {
    return { case: 4, question: 'Is this an idea to develop, or a note for your journal?' };
  }
  // A journal entry is never questioned by case 5 (architecture 6.5), short or not.
  const scored = by === 'ai' || confidence > 0;
  const tooShort = source === 'voice' && wordList(text).length < 3;
  const unsure = scored && confidence < CONFIDENCE_FLOOR;
  if (type !== 'journal' && (tooShort || unsure)) {
    return { case: 5, question: shortQuestion(text) };
  }
  return null;
}
