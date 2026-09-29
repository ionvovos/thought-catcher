// v1 -> v2 thought upgrade (architecture 3.3). Pure.
import { validateThought } from './model.js';

// Returns the v2 form of a stored or imported thought, or null when the row fails v1 validation (the caller sets it
// aside instead of losing it). Every v1 field is kept byte-equal; only `sort.by` 'ai' is renamed to 'key'.
// Throws TypeError for a value that is not an object at all.
export function upgradeThought(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('a thought row must be an object');
  if (!validateThought(row).ok) return null;
  const out = structuredClone(row);
  if (out.sort.by === 'ai') out.sort.by = 'key';
  if (out.origin === undefined) out.origin = null;
  if (out.best_guess === undefined) out.best_guess = false;
  if (out.plan === undefined) out.plan = null;
  out.v = 2;
  return out;
}

export const isV1 = (row) => row !== null && typeof row === 'object' && row.v !== 2;
