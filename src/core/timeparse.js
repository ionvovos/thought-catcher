// Time phrases in a thought -> a due time. Pure: `now` is a parameter, times use the device's local zone.

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUM = '(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)';

const RE_AMPM = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/;
const RE_24H = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const RE_NOON = /\b(noon|midnight)\b/;
const RE_REL_TIME = new RegExp(`\\bin ${NUM} (minutes?|mins?|hours?|hrs?)\\b`);
const RE_REL_DAY = new RegExp(`\\bin ${NUM} (days?|weeks?)\\b`);
const RE_TOMORROW = /\btomorrow\b/;
const RE_WEEKDAY = new RegExp(`\\b(?:(?:on|next) )?(${WEEKDAYS.join('|')})\\b`);
const RE_NEXT_WEEK = /\bnext week\b/;

const norm = (text) => String(text ?? '').toLowerCase().replace(/[’‘]/g, "'");
const num = (s) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s]);

function clock(text) {
  let m = text.match(RE_AMPM);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3] === 'pm') h += 12;
    return { h, min: Number(m[2] ?? 0) };
  }
  m = text.match(RE_24H);
  if (m) return { h: Number(m[1]), min: Number(m[2]) };
  m = text.match(RE_NOON);
  if (m) return { h: m[1] === 'noon' ? 12 : 0, min: 0 };
  return null;
}

function relTime(text) {
  const m = text.match(RE_REL_TIME);
  if (!m) return null;
  const unit = m[2].startsWith('h') ? 3600000 : 60000;
  return num(m[1]) * unit;
}

function dateOffsetDays(text, now) {
  if (RE_TOMORROW.test(text)) return 1;
  const w = text.match(RE_WEEKDAY);
  if (w) {
    const diff = (WEEKDAYS.indexOf(w[1]) - now.getDay() + 7) % 7;
    return diff === 0 ? 7 : diff;
  }
  if (RE_NEXT_WEEK.test(text)) return 7;
  const d = text.match(RE_REL_DAY);
  if (d) return num(d[1]) * (d[2].startsWith('w') ? 7 : 1);
  return null;
}

export function scanWhen(text) {
  const t = norm(text);
  return {
    hasClock: Boolean(clock(t)) || RE_REL_TIME.test(t),
    hasDate: RE_TOMORROW.test(t) || RE_WEEKDAY.test(t) || RE_NEXT_WEEK.test(t) || RE_REL_DAY.test(t),
  };
}

export function parseWhen(text, now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('now must be a valid Date');
  const t = norm(text);
  const rel = relTime(t);
  if (rel !== null) return { due_at: new Date(now.getTime() + rel).toISOString(), kind: 'clock' };
  const c = clock(t);
  const days = dateOffsetDays(t, now);
  if (days !== null) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, c ? c.h : 9, c ? c.min : 0, 0, 0);
    return { due_at: d.toISOString(), kind: c ? 'clock' : 'date' };
  }
  if (c) {
    let d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), c.h, c.min, 0, 0);
    if (d.getTime() <= now.getTime()) d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, c.h, c.min, 0, 0);
    return { due_at: d.toISOString(), kind: 'clock' };
  }
  return { due_at: null, kind: null };
}
