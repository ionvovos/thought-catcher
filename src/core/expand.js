// Expand an idea into next steps, questions and an outline (M6). Pure: the provider is injected.

// Returns a new thought with `expansion` set. Throws (AiError) on a provider error or an invalid reply; the
// original thought is never changed, so a failed regenerate keeps the old expansion (AC-M6.3, AC-M6.4).
export async function expandIdea(thought, provider, { now = new Date() } = {}) {
  if (thought?.type !== 'idea') throw new Error('Only ideas can be expanded.');
  if (!provider) throw new Error('A provider is needed to expand an idea.');
  const result = await provider.expand(thought);
  return {
    ...thought,
    expansion: {
      next_steps: result.next_steps,
      questions: result.questions,
      outline: result.outline,
      generated_at: now.toISOString(),
      model: provider.model ?? null,
    },
    updated_at: now.toISOString(),
  };
}

export function canExpand(thought) {
  return thought?.type === 'idea';
}
