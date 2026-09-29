// Live search over title, text and tags, case-insensitive. Pure.
import { STOPWORDS } from './model.js';

// Every word of the query must appear in the title, the text or a tag. An empty query matches everything.
export function searchThoughts(thoughts, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return thoughts.slice();
  return thoughts.filter((t) => {
    const hay = `${t.title ?? ''}\n${t.text ?? ''}\n${(t.tags ?? []).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// Natural-language keyword ranking for `ask` without embeddings (architecture 2.5). The question's content words are
// matched against title, text and tags with a light suffix strip ("skipping" finds "skip"); score is the share of the
// question's words found. Returns [{ thought, score }] best first, at most k, only score > 0.
const QUERY_STOP = new Set(['say', 'said', 'sayed', 'tell', 'told', 'mention', 'mentioned', 'wrote', 'write', 'note', 'noted', 'saved', 'save', 'show', 'find', 'search', 'look']);

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

export function queryWords(query) {
  const out = [];
  for (const w of String(query ?? '').toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9]+/g) ?? []) {
    if (w.length < 3 || STOPWORDS.has(w) || QUERY_STOP.has(w)) continue;
    const s = stem(w);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export function keywordRank(thoughts, query, k = 3) {
  const words = queryWords(query);
  if (!words.length) return [];
  return thoughts
    .map((t) => {
      const hay = `${t.title ?? ''}\n${t.text ?? ''}\n${(t.tags ?? []).join(' ')}`.toLowerCase();
      const found = words.filter((w) => hay.includes(w)).length;
      return { thought: t, score: found / words.length };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.thought.created_at < b.thought.created_at ? 1 : -1))
    .slice(0, k);
}
