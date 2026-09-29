// Time phrases in a thought -> a due time. Pure: `now` is a parameter, times use the device's local zone.

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUM = '(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)';

const RE_AMPM = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/;
const RE_24H = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
// "at 7" and "at 7:30" with no am/pm: which half of the day is not stated.
const RE_AT_HOUR = /\bat (1[0-2]|[1-9])(?::([0-5]\d))?\b/;
const RE_NOON = /\b(noon|midnight)\b/;
const RE_REL_TIME = new RegExp(`\\bin ${NUM} (minutes?|mins?|hours?|hrs?)\\b`);
const RE_REL_DAY = new RegExp(`\\bin ${NUM} (days?|weeks?)\\b`);
const RE_TOMORROW = /\btomorrow\b/;
const RE_WEEKDAY = new RegExp(`\\b(?:(?:on|next) )?(${WEEKDAYS.join('|')})\\b`);
const RE_NEXT_WEEK = /\bnext week\b/;
const RE_YESTERDAY = /\byesterday\b/;
// "today" only counts together with a time ("today at 8pm"); "tonight" and "this evening" carry their own default hour.
const RE_TODAY = /\b(today|tonight|this evening)\b/;
const DEFAULT_HOUR = { tonight: 20, 'this evening': 20 };

const norm = (text) => String(text ?? '').toLowerCase().replace(/[’‘]/g, "'");
const num = (s) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s]);

function clock(text) {
  let m = text.match(RE_AMPM);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3] === 'pm') h += 12;
    return { h, min: Number(m[2] ?? 0) };
  }
  m = text.match(RE_AT_HOUR);
  if (m) return { h: Number(m[1]), min: Number(m[2] ?? 0), ambiguous: true };
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

// The hours an unmarked hour can mean today: 7 is 07:00 or 19:00. pmOnly for "tonight" and "this evening".
function todayCandidates(c, pmOnly) {
  const am = c.h % 12;
  const pm = am + 12;
  if (!c.ambiguous) return [c.h];
  return pmOnly ? (c.h === 12 ? [] : [pm]) : [am, pm];
}

// The first of `hours` today that is still ahead of now, or null (a past time is not scheduled for tomorrow).
function firstAhead(hours, min, now) {
  for (const h of hours) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0);
    if (d.getTime() > now.getTime()) return d;
  }
  return null;
}

// An unmarked hour on a named day ("tomorrow at 7", "at 3 tomorrow", "at 7 on friday"): 7-11 is the morning hour,
// 1-6 is the afternoon hour (+12), 12 is noon.
function dayHour(h) {
  if (h === 12) return 12;
  return h <= 6 ? h + 12 : h;
}

const NONE = { due_at: null, kind: null };

// "Tonight" said after its default 20:00 has passed still means tonight (build gate G8): one hour from now, rounded up to a
// quarter hour, and never past midnight (23:59 at the latest). Null only when less than a minute of the day is left.
export function laterTonight(now) {
  const t = new Date(now.getTime() + 60 * 60000);
  t.setSeconds(0, 0);
  t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0);
  const d = t.getTime() > end.getTime() ? end : t;
  return d.getTime() - now.getTime() >= 60000 ? d : null;
}

export function parseWhen(text, now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError('now must be a valid Date');
  const t = norm(text);
  const rel = relTime(t);
  if (rel !== null) return { due_at: new Date(now.getTime() + rel).toISOString(), kind: 'clock' };
  const c = clock(t);
  const days = dateOffsetDays(t, now);
  if (days === null && RE_YESTERDAY.test(t)) return NONE; // a past day is not a due time
  if (days === null) {
    const today = t.match(RE_TODAY);
    if (today && (c || DEFAULT_HOUR[today[1]] !== undefined)) {
      const evening = today[1] !== 'today';
      const d = c
        ? firstAhead(todayCandidates(c, evening), c.min, now)
        : firstAhead([DEFAULT_HOUR[today[1]]], 0, now) ?? laterTonight(now);
      return d ? { due_at: d.toISOString(), kind: 'clock' } : NONE;
    }
  }
  if (days !== null) {
    const fixed = c && c.ambiguous ? { h: dayHour(c.h), min: c.min } : c; // "tomorrow at 7" does not say which 7: dayHour picks one
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, fixed ? fixed.h : 9, fixed ? fixed.min : 0, 0, 0);
    return { due_at: d.toISOString(), kind: fixed ? 'clock' : 'date' };
  }
  if (c) {
    if (c.ambiguous) {
      const d = firstAhead(todayCandidates(c, false), c.min, now);
      return d ? { due_at: d.toISOString(), kind: 'clock' } : NONE;
    }
    let d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), c.h, c.min, 0, 0);
    if (d.getTime() <= now.getTime()) d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, c.h, c.min, 0, 0);
    return { due_at: d.toISOString(), kind: 'clock' };
  }
  return NONE;
}
