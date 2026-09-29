// Rule sorter (architecture 6.4). Pure: `now` is a parameter.
import { STOPWORDS, makeTitle, normalizeTags } from './model.js';
import { parseWhen, scanWhen } from './timeparse.js';

export const TIE_ORDER = Object.freeze(['reminder', 'task', 'idea', 'journal']);

export const TASK_VERBS = Object.freeze(('buy call email send fix pay book clean finish write pick up order schedule cancel renew '
  + 'check get text reply return submit print sign post wash tidy update prepare bring collect water feed vacuum cook charge '
  + 'install repair replace register apply drop off sort out look up').split(' '));

const TWO_WORD = ['pick up', 'drop off', 'sort out', 'look up'];
const SINGLE_TASK_VERBS = new Set(TASK_VERBS.filter((v) => !['up', 'off', 'out'].includes(v)));
export const APPOINTMENT_VERBS = new Set(['call', 'phone', 'ring', 'book']);

const REMINDER_CUES = ['remind me', 'reminder', "don't forget", 'remember to'];
const TASK_CUES = ['need to', 'have to', 'must', 'todo', 'to do'];
const IDEA_CUES = ['what if', 'idea', 'ideas', 'we could', 'i could', 'app that', "wouldn't it be", 'imagine'];
const JOURNAL_CUES = ['today', 'yesterday', 'i feel', 'i felt', 'i keep thinking', "i've been thinking", 'grateful', 'tired', 'happy', 'sad', 'was', 'were'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text, phrase) => new RegExp(`(?:^|[^a-z0-9'])${esc(phrase)}(?![a-z0-9'])`).test(text);
const hasAny = (text, phrases) => phrases.some((p) => has(text, p));

function firstWords(text) {
  const tokens = text.split(' ').map((t) => t.replace(/^[^a-z']+|[^a-z']+$/g, ''));
  if (tokens[0] === 'please') tokens.shift();
  return { first: tokens[0] ?? '', two: `${tokens[0] ?? ''} ${tokens[1] ?? ''}` };
}

export function sortByRules(text, now) {
  const raw = String(text ?? '');
  const t = raw.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  const { first, two } = firstWords(t);
  const when = scanWhen(t);

  const scores = { reminder: 0, task: 0, idea: 0, journal: 0 };
  if (hasAny(t, REMINDER_CUES)) scores.reminder += 3;
  if (when.hasClock) scores.reminder += 2;
  if (when.hasDate) scores.reminder += 1;
  if (APPOINTMENT_VERBS.has(first)) scores.reminder += 2;
  if (TWO_WORD.includes(two) || SINGLE_TASK_VERBS.has(first)) scores.task += 2;
  if (hasAny(t, TASK_CUES)) scores.task += 2;
  if (hasAny(t, IDEA_CUES)) scores.idea += 3;
  if (has(t, 'should')) scores.idea += 1;
  scores.journal = Math.min(3, JOURNAL_CUES.filter((c) => has(t, c)).length);

  const sum = scores.reminder + scores.task + scores.idea + scores.journal;
  let type = 'journal';
  let alt_type = null;
  let confidence = 0;
  if (sum > 0) {
    const ranked = [...TIE_ORDER].sort((a, b) => scores[b] - scores[a] || TIE_ORDER.indexOf(a) - TIE_ORDER.indexOf(b));
    type = ranked[0];
    alt_type = scores[ranked[1]] > 0 ? ranked[1] : null;
    confidence = Math.round((scores[type] / sum) * 100) / 100;
  }

  const seen = [];
  for (const tok of t.match(/[a-z]+(?:'[a-z]+)*/g) ?? []) {
    if (tok.includes("'") || tok.length < 4 || STOPWORDS.has(tok)) continue;
    if (SINGLE_TASK_VERBS.has(tok) || APPOINTMENT_VERBS.has(tok)) continue;
    if (!seen.includes(tok)) seen.push(tok);
  }

  const due_at = type === 'reminder' || type === 'task' ? parseWhen(t, now).due_at : null;
  return { type, alt_type, confidence, title: makeTitle(raw), tags: normalizeTags(seen.slice(0, 3)), due_at, scores };
}
