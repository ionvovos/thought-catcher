// Vector maths and the relatedness constants for ask, related and topics (architecture 2.5). Pure.
// The constants are tuned only against the AC-X5.1 / AC-X6.1 / AC-X6.2 fixtures (tests/fixtures/corpus.js).
import { contentWords } from './model.js';

export const DIMS = 384;
export const ASK_MIN = 0.30;
export const RELATED_MIN = 0.35;
export const TOPIC_LINK = 0.45;
export const TOPIC_MIN_SIZE = 3;
export const WORDS_MIN = 0.2; // Jaccard floor for the no-embeddings fallback

export function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) s += a[i] * b[i];
  return s;
}

export function normalize(v) {
  let n = 0;
  for (let i = 0; i < v.length; i += 1) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (!n) return Float32Array.from(v);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 1) out[i] = v[i] / n;
  return out;
}

// Cosine similarity; equals the dot product for normalised vectors.
export function cosine(a, b) {
  let ab = 0; let aa = 0; let bb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

// rows: [{ id, vec }]. Returns [{ id, score }] best first, at most k, score >= min, `exclude` ids left out.
export function topK(query, rows, k, { min = 0, exclude = [] } = {}) {
  const skip = new Set(exclude);
  return rows
    .filter((r) => !skip.has(r.id))
    .map((r) => ({ id: r.id, score: cosine(query, r.vec) }))
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, k);
}

// fnv1a 32-bit of a string, as 8 hex digits: the change detector for a stored embedding.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const embedText = (t) => `${t.title ?? ''}\n${t.text ?? ''}`;
export const embedHash = (t) => fnv1a(embedText(t));

// ---- no-embeddings fallback: shared tags and shared words ----

const bag = (t) => new Set([...(t.tags ?? []), ...contentWords(`${t.title ?? ''} ${t.text ?? ''}`)]);

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function wordSimilarity(a, b) {
  return jaccard(bag(a), bag(b));
}

// Related thoughts without vectors: Jaccard over tags plus content words, at or above WORDS_MIN.
export function relatedByWords(thought, thoughts, k = 3) {
  return thoughts
    .filter((t) => t.id !== thought.id)
    .map((t) => ({ t, score: wordSimilarity(thought, t) }))
    .filter((r) => r.score >= WORDS_MIN)
    .sort((a, b) => b.score - a.score || (a.t.id < b.t.id ? -1 : 1))
    .slice(0, k)
    .map((r) => ({ id: r.t.id, score: r.score, title: r.t.title, type: r.t.type }));
}

// ---- topics ----

function mostFrequent(items) {
  const counts = new Map();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = null;
  for (const [k, n] of counts) if (best === null || n > best[1] || (n === best[1] && k < best[0])) best = [k, n];
  return best;
}

// Most frequent tag among the members, else the most frequent content word, else the first title.
export function topicLabel(members) {
  const tag = mostFrequent(members.flatMap((m) => m.tags ?? []));
  if (tag && tag[1] >= 2) return tag[0];
  const word = mostFrequent(members.flatMap((m) => contentWords(`${m.title ?? ''} ${m.text ?? ''}`)));
  if (word) return word[0];
  return tag ? tag[0] : (members[0]?.title ?? 'topic');
}

// Union-find over links; `similar(i, j)` says whether two members link. Keeps clusters of TOPIC_MIN_SIZE or more.
function cluster(list, similar) {
  const parent = list.map((_, i) => i);
  const find = (i) => { let r = i; while (parent[r] !== r) r = parent[r]; parent[i] = r; return r; };
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      if (similar(i, j)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  list.forEach((m, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(m); });
  return [...groups.values()].filter((g) => g.length >= TOPIC_MIN_SIZE);
}

// ideas: thoughts of type idea. vectors: Map id -> Float32Array, or null for the shared-tag fallback.
// Returns [{ label, ids }] with at least 3 ids each, largest first.
export function topicsFor(ideas, vectors) {
  let groups;
  if (vectors) {
    const withVec = ideas.filter((t) => vectors.has(t.id));
    groups = cluster(withVec, (i, j) => cosine(vectors.get(withVec[i].id), vectors.get(withVec[j].id)) >= TOPIC_LINK);
  } else {
    // shared-tag topics: every tag held by 3 or more ideas is a topic; an idea joins its first such tag
    const byTag = new Map();
    for (const t of ideas) for (const tag of t.tags ?? []) { if (!byTag.has(tag)) byTag.set(tag, []); byTag.get(tag).push(t); }
    const used = new Set();
    groups = [];
    for (const [, members] of [...byTag.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
      const free = members.filter((m) => !used.has(m.id));
      if (free.length >= TOPIC_MIN_SIZE) { free.forEach((m) => used.add(m.id)); groups.push(free); }
    }
  }
  return groups
    .sort((a, b) => b.length - a.length)
    .map((g) => ({ label: topicLabel(g), ids: g.map((m) => m.id) }));
}
