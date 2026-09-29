// Reply templates (architecture 2.2 `reply`). Pure: `now` is a parameter. Every reply is at most 40 words.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NOUN = { task: ['a task', 'tasks'], idea: ['an idea', 'ideas'], reminder: ['a reminder', 'reminders'], journal: ['a journal note', 'journal notes'] };
export const MAX_REPLY_WORDS = 40;

const pad = (n) => String(n).padStart(2, '0');

// "Fri 18:00", "today 18:00" or "tomorrow 09:00", in the device's local time.
export function formatWhen(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day0 = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(d) - day0(now)) / 86400000);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `today ${time}`;
  if (diff === 1) return `tomorrow ${time}`;
  return `${WEEKDAYS[d.getDay()]} ${time}`;
}

export function limitWords(text, max = MAX_REPLY_WORDS) {
  const words = String(text ?? '').trim().split(/\s+/);
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ').replace(/[,;:]$/, '')}.`;
}

const join = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

// items: brain Items. Groups by type in spoken order of first appearance.
// One item: "Filed as a task: Buy milk, tomorrow 09:00." Several: "Filed 2 tasks, an idea and a reminder for Fri 18:00."
export function replyFor(items, { now = new Date() } = {}) {
  if (!Array.isArray(items) || items.length === 0) return "I didn't catch anything to file.";
  if (items.length === 1) {
    const [it] = items;
    const when = it.due_at ? `, ${formatWhen(it.due_at, now)}` : '';
    return limitWords(`Filed as ${NOUN[it.type]?.[0] ?? 'a note'}: ${it.title}${when}.`);
  }
  const counts = new Map();
  for (const it of items) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
  const seen = [];
  for (const it of items) if (!seen.includes(it.type)) seen.push(it.type);
  const single = items.filter((it) => it.type === 'reminder' && it.due_at);
  const parts = seen.map((type) => {
    const n = counts.get(type);
    if (n === 1) {
      const base = NOUN[type]?.[0] ?? 'a note';
      return type === 'reminder' && single.length === 1 ? `${base} for ${formatWhen(single[0].due_at, now)}` : base;
    }
    return `${n} ${NOUN[type]?.[1] ?? 'notes'}`;
  });
  return limitWords(`Filed ${join(parts)}.`);
}

export function answerTemplate(count) {
  if (count <= 0) return "I couldn't find anything about that.";
  return count === 1 ? 'I found one thought about that.' : `I found ${count} thoughts about that.`;
}
