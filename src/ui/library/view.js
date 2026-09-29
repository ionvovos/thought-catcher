// Library view-model (X4) and small formatters shared by the S3 screens. Pure: no DOM, `now` is always a parameter.
import { TYPES } from '../../core/model.js';
import { searchThoughts } from '../../core/search.js';

// Order of the groups in the library (design: reminders and tasks first, they need action).
export const TYPE_ORDER = Object.freeze(['reminder', 'task', 'idea', 'journal']);
export const TYPE_LABEL = Object.freeze({ idea: 'Idea', task: 'Task', journal: 'Journal', reminder: 'Reminder' });
export const TYPE_PLURAL = Object.freeze({ idea: 'Ideas', task: 'Tasks', journal: 'Journals', reminder: 'Reminders' });
export const TAG_CHIPS_MAX = 8;
export const STATES = Object.freeze(['open', 'done']);

const DAY_MS = 86400000;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const dayDiff = (d, now) => Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
const clock = (d) => `${d.getHours()}:${pad(d.getMinutes())}`;
const dayMonth = (d) => `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;

// "Today 18:00", "Tomorrow 9:00", "Sat 10 Oct" (a reminder's due time in local time; a due date with no clock time still shows the time).
export function dueLabel(iso, now) {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff === 0) return `Today ${clock(d)}`;
  if (diff === 1) return `Tomorrow ${clock(d)}`;
  if (diff === -1) return `Yesterday ${clock(d)}`;
  return dayMonth(d);
}

// When it was captured: "Today", "Yesterday", "3 days ago", else "Sun 27 Sep".
export function agoLabel(iso, now) {
  const diff = -dayDiff(new Date(iso), now);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return dayMonth(new Date(iso));
}

// The right-hand label of a card: { text, due } where due colours a reminder that is due today or overdue.
export function whenLabel(t, now) {
  if (t.type === 'reminder' && t.due_at) {
    const overdue = !t.done && Date.parse(t.due_at) <= now.getTime();
    const today = dayDiff(new Date(t.due_at), now) === 0;
    return { text: dueLabel(t.due_at, now), due: !t.done && (today || overdue) };
  }
  if (t.type === 'task' && t.due_at) return { text: `Due ${new Date(t.due_at).getDate()} ${MONTH[new Date(t.due_at).getMonth()]}`, due: false };
  return { text: agoLabel(t.created_at, now), due: false };
}

// Two-line snippet: the body when it says more than the title, else nothing.
export function snippetOf(t, max = 160) {
  const text = String(t.text ?? '').replace(/\s+/g, ' ').trim();
  const title = String(t.title ?? '').trim();
  if (!text || text.toLowerCase() === title.toLowerCase()) return '';
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

// Splits text into [{ text, hit }] so the UI can wrap matches in <mark> without ever parsing markup.
export function highlightParts(text, query) {
  const words = [...new Set(String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean))];
  const src = String(text ?? '');
  if (!words.length) return [{ text: src, hit: false }];
  const lower = src.toLowerCase();
  const marks = new Array(src.length).fill(false);
  for (const w of words) {
    for (let at = lower.indexOf(w); at !== -1; at = lower.indexOf(w, at + w.length)) {
      for (let i = at; i < at + w.length; i += 1) marks[i] = true;
    }
  }
  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.text += src[i];
    else out.push({ text: src[i], hit: marks[i] });
  }
  return out;
}

const byNewest = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at);
// Reminders read best by when they fall due (soonest first, undated ones last, newest first); every other type is newest first.
const byDue = (a, b) => (a.due_at && b.due_at ? Date.parse(a.due_at) - Date.parse(b.due_at) : a.due_at ? -1 : b.due_at ? 1 : byNewest(a, b));

// Tags across all thoughts, most used first, at most TAG_CHIPS_MAX.
export function topTags(thoughts) {
  const count = new Map();
  for (const t of thoughts) for (const g of t.tags ?? []) count.set(g, (count.get(g) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TAG_CHIPS_MAX).map(([g]) => g);
}

// filters: { q, type: Type|null, tag: string|null, state: 'open'|'done'|null }.
// The open/done filter narrows to tasks. Counts ignore the type filter so the chips keep showing every type's size for the
// current search. Groups are in TYPE_ORDER, each newest first (reminders soonest due first); each group's count is the number listed.
export function libraryView(thoughts, { q = '', type = null, tag = null, state = null } = {}) {
  const searched = searchThoughts(thoughts, q);
  const tagged = tag ? searched.filter((t) => (t.tags ?? []).includes(tag)) : searched;
  const stated = state ? tagged.filter((t) => t.type === 'task' && (state === 'done' ? t.done : !t.done)) : tagged;
  const counts = { all: stated.length };
  for (const ty of TYPES) counts[ty] = stated.filter((t) => t.type === ty).length;
  const shown = type ? stated.filter((t) => t.type === type) : stated;
  const groups = TYPE_ORDER
    .map((ty) => ({ type: ty, items: shown.filter((t) => t.type === ty).sort(ty === 'reminder' ? byDue : byNewest) }))
    .filter((g) => g.items.length > 0);
  return { total: thoughts.length, counts, groups, shown: shown.length, tags: topTags(thoughts), filtered: Boolean(q.trim() || type || tag || state) };
}

export const countsOf = (thoughts) => {
  const c = { all: thoughts.length };
  for (const ty of TYPES) c[ty] = thoughts.filter((t) => t.type === ty).length;
  return c;
};
