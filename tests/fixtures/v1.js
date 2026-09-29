// A thought exactly as build a999310 stored it: no origin, best_guess, plan or v.
import { newThought } from '../../src/core/model.js';
import { sortByRules } from '../../src/core/sorter.js';

export const V1_NOW = new Date(2026, 8, 29, 10, 0, 0);

export function v1Thought(text, id, patch = {}) {
  const t = newThought({ text, id, sortResult: sortByRules(text, V1_NOW), now: V1_NOW });
  for (const k of ['origin', 'best_guess', 'plan', 'v']) delete t[k];
  return { ...t, ...patch };
}
