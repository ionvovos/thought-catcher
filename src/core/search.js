// Live search over title, text and tags, case-insensitive. Pure.

// Every word of the query must appear in the title, the text or a tag. An empty query matches everything.
export function searchThoughts(thoughts, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return thoughts.slice();
  return thoughts.filter((t) => {
    const hay = `${t.title ?? ''}\n${t.text ?? ''}\n${(t.tags ?? []).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
