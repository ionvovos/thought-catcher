// Export and import of thoughts as JSON (architecture 5.3). Pure. The AI key is never part of an export.

import { validateThought } from './model.js';
import { upgradeThought } from './migrate.js';

export const EXPORT_FORMAT = 'thought-catcher-export';
export const EXPORT_VERSION = 2;
export const READABLE_VERSIONS = Object.freeze([1, 2]);
export const APP_VERSION = '2.0.0';
const SETTING_KEYS = ['review.days', 'speech.engine', 'ai.provider', 'ai.model', 'ai.base_url', 'voice.speak', 'voice.name', 'theme'];

// settings: the flat object from getSettings(). Only the keys above are copied, so nothing else can leak in.
// quarantined: raw v1 rows that could not be read during migration; they travel in the export and import ignores them.
export function buildExport(thoughts, settings, now, { quarantined = [] } = {}) {
  const kept = {};
  for (const k of SETTING_KEYS) kept[k] = settings?.[k] ?? null;
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: now.toISOString(),
    app_version: APP_VERSION,
    settings: kept,
    thoughts: thoughts.map((t) => structuredClone(t)),
    quarantined: quarantined.map((r) => structuredClone(r)),
  };
}

export function exportFileName(now) {
  const p = (n) => String(n).padStart(2, '0');
  return `thought-catcher-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

// text: the file contents. Returns { ok: true, data, skipped } or { ok: false, error }.
// Version 2: all or nothing, one bad thought rejects the file. Version 1: each row is run through upgradeThought; a row
// that fails validation is skipped and counted in `skipped`, the rest import (G19). `quarantined` is ignored.
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Thought Catcher export (it is not valid JSON).' };
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data) || data.format !== EXPORT_FORMAT) {
    return { ok: false, error: 'This file is not a Thought Catcher export.' };
  }
  if (!READABLE_VERSIONS.includes(data.version)) {
    return { ok: false, error: `This export has version ${String(data.version)}; this app reads versions ${READABLE_VERSIONS.join(' and ')}.` };
  }
  if (!Array.isArray(data.thoughts)) {
    return { ok: false, error: 'This export has no list of thoughts.' };
  }
  let skipped = 0;
  const thoughts = [];
  for (let i = 0; i < data.thoughts.length; i += 1) {
    const row = data.thoughts[i];
    if (data.version === 1) {
      let up = null;
      try { up = upgradeThought(row); } catch { up = null; }
      if (up === null) skipped += 1;
      else thoughts.push(up);
      continue;
    }
    const v = validateThought(row);
    if (!v.ok) return { ok: false, error: `Thought ${i + 1} is not valid: ${v.errors[0]}. Nothing was imported.` };
    thoughts.push(row);
  }
  const rest = { ...data };
  delete rest.quarantined;
  return { ok: true, data: { ...rest, thoughts }, skipped };
}

// Adds thoughts whose id is new, skips ids that exist. Imported thoughts keep their clarify state and are never questioned.
export function mergeImport(existing, incoming) {
  const have = new Set(existing.map((t) => t.id));
  const toAdd = [];
  let skipped = 0;
  for (const t of incoming) {
    if (have.has(t.id)) {
      skipped += 1;
    } else {
      have.add(t.id);
      toAdd.push(t);
    }
  }
  return { toAdd, added: toAdd.length, skipped };
}

export function importSummary({ added, skipped }) {
  return `Added ${added}, skipped ${skipped}.`;
}

// One line for rows a version 1 file held that could not be read (parseImport().skipped), or '' when there are none.
export function unreadableSummary(n) {
  return n > 0 ? `${n} ${n === 1 ? 'thought' : 'thoughts'} in the file couldn't be read and ${n === 1 ? 'was' : 'were'} left out.` : '';
}
