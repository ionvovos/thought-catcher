// Export, import and delete-all for Settings (M9, X10). The browser parts (download, caches) live here; the file format
// and merge rules are in src/core/exportImport.js.
import { buildExport, exportFileName, parseImport, mergeImport, importSummary, unreadableSummary } from '../../core/exportImport.js';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export async function exportAll(ctx) {
  const thoughts = await ctx.store.getAll();
  const quarantined = (await ctx.store.getQuarantined?.()) ?? [];
  const data = buildExport(thoughts, ctx.settings.getSettings(), ctx.now(), { quarantined });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName(ctx.now());
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { count: thoughts.length, quarantined: quarantined.length };
}

// Returns { ok, message }. Never throws; a bad file changes nothing.
export async function importFile(ctx, file) {
  const name = file?.name ?? 'This file';
  if (!file) return { ok: false, message: 'No file was chosen. Nothing was imported.' };
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, message: `"${name}" is too large to be a Thought Catcher export, so nothing was imported. Your thoughts are unchanged.` };
  try {
    const parsed = parseImport(await file.text());
    if (!parsed.ok) {
      const notExport = /^This file is not a Thought Catcher export/.test(parsed.error);
      return { ok: false, message: notExport ? `"${name}" is not a Thought Catcher export, so nothing was imported. Your thoughts are unchanged.` : `${parsed.error.replace(/ Nothing was imported\.$/, '')} Nothing was imported. Your thoughts are unchanged.` };
    }
    const merged = mergeImport(await ctx.store.getAll(), parsed.data.thoughts);
    await ctx.store.putMany(merged.toAdd);
    return { ok: true, message: [importSummary(merged), unreadableSummary(parsed.skipped ?? 0)].filter(Boolean).join(' ') };
  } catch (err) {
    return { ok: false, message: err?.message === 'read-only' ? 'Your thoughts are read-only until they are updated to the new version, so nothing was imported.' : `Could not import: ${err?.message ?? 'unknown error'}. Nothing was imported.` };
  }
}

export async function deleteAll(ctx) {
  await ctx.store.clear();
  ctx.settings.clearAll();
  try { await globalThis.caches?.delete('transformers-cache'); } catch { /* no downloaded speech model */ }
  ctx.brain.refresh?.();
}
