// Export and import of thoughts as JSON (architecture 5.3). Pure. The AI key is never part of an export.

import { validateThought } from './model.js';

export const EXPORT_FORMAT = 'thought-catcher-export';
export const EXPORT_VERSION = 1;
export const APP_VERSION = '1.0.0';
const SETTING_KEYS = ['review.days', 'speech.engine', 'ai.provider', 'ai.model', 'ai.base_url'];

// settings: the flat object from getSettings(). Only the keys above are copied, so nothing else can leak in.
export function buildExport(thoughts, settings, now) {
  const kept = {};
  for (const k of SETTING_KEYS) kept[k] = settings?.[k] ?? null;
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: now.toISOString(),
    app_version: APP_VERSION,
    settings: kept,
    thoughts: thoughts.map((t) => structuredClone(t)),
  };
}

export function exportFileName(now) {
  const p = (n) => String(n).padStart(2, '0');
  return `thought-catcher-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

// text: the file contents. Returns { ok: true, data } or { ok: false, error }. All or nothing: one bad thought rejects the file.
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
  if (data.version !== EXPORT_VERSION) {
    return { ok: false, error: `This export has version ${String(data.version)}; this app reads version ${EXPORT_VERSION}.` };
  }
  if (!Array.isArray(data.thoughts)) {
    return { ok: false, error: 'This export has no list of thoughts.' };
  }
  for (let i = 0; i < data.thoughts.length; i += 1) {
    const v = validateThought(data.thoughts[i]);
    if (!v.ok) return { ok: false, error: `Thought ${i + 1} is not valid: ${v.errors[0]}. Nothing was imported.` };
  }
  return { ok: true, data };
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
