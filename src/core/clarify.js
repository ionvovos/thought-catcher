// Clarify state machine and answer handling (architecture 3 step 5, 6.5). Pure: every function returns a new thought.
// clarify.state only moves forward: none -> pending -> answered | skipped, or none -> unavailable. Never back to pending.

const withClarify = (thought, clarify, now) => ({
  ...thought,
  clarify: { ...thought.clarify, ...clarify },
  updated_at: now.toISOString(),
});

// A thought may be asked about once, only when it has never been asked and did not come from an import.
export function canAsk(thought) {
  return thought?.clarify?.state === 'none' && thought.source !== 'import';
}

export function startClarify(thought, ambiguity, now) {
  if (!canAsk(thought)) throw new Error('This thought cannot be asked a question.');
  return withClarify(thought, { state: 'pending', case: ambiguity.case, question: ambiguity.question, answer: null }, now);
}

// No key: the question is not asked and the inbox shows "needs a key to clarify".
export function markUnavailable(thought, ambiguity, now) {
  if (!canAsk(thought)) throw new Error('This thought cannot be marked.');
  return withClarify(thought, { state: 'unavailable', case: ambiguity.case, question: ambiguity.question, answer: null }, now);
}

export function skipClarify(thought, now) {
  if (thought.clarify.state !== 'pending') throw new Error('There is no open question to skip.');
  return withClarify(thought, { state: 'skipped' }, now);
}

// On app load: a question left open when the app closed is treated as skipped and never asked again (AC-M4.8).
export function resolveStale(thoughts, now) {
  return thoughts.filter((t) => t.clarify?.state === 'pending').map((t) => skipClarify(t, now));
}

export function needsKeyMarker(thought) {
  return thought.clarify?.state === 'unavailable';
}

export function isUnresolved(thought) {
  return thought.clarify?.state === 'skipped';
}

// Applies the person's answer to an open question. Case 2 tries the local time parser first and calls the
// provider only if that finds no time. Throws (AiError from the provider) and leaves the thought as it was on failure.
export async function applyAnswer(thought, ambiguity, answer, provider, { now = new Date(), parseWhen } = {}) {
  if (thought.clarify.state !== 'pending') throw new Error('There is no open question to answer.');
  const text = String(answer ?? '').trim();
  if (!text) throw new Error('The answer is empty.');
  const answered = { state: 'answered', case: ambiguity.case, question: ambiguity.question, answer: text };

  if (ambiguity.case === 2) {
    const parse = parseWhen ?? (await import('./timeparse.js')).parseWhen;
    const when = parse(text, now);
    if (when?.due_at) {
      return { ...withClarify(thought, answered, now), due_at: when.due_at };
    }
  }
  if (!provider) throw new Error('A provider is needed to apply this answer.');
  const patch = await provider.clarify({ thought, ambiguity, answer: text });
  return {
    ...withClarify(thought, answered, now),
    type: patch.type,
    title: patch.title,
    tags: patch.tags,
    due_at: patch.due_at,
    sort: { ...thought.sort, by: 'ai', model: provider.model ?? thought.sort.model },
  };
}
