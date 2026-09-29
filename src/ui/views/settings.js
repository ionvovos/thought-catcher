// Settings (M8, M9, M7, M2): AI provider and key, preferences, export, import, delete all data.
import { el } from '../dom.js';
import * as store from '../../storage/settings.js';
import {
  resolveProvider, configFromSettings, keyBinding, providerLabel, describeAiError, ANTHROPIC_DEFAULT_MODEL, OPENAI_DEFAULT_BASE_URL,
} from '../../core/ai/adapter.js';
import {
  buildExport, exportFileName, parseImport, mergeImport, importSummary,
} from '../../core/exportImport.js';
import { FEATURES } from '../../features.js';

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function field(id, label, control, hint) {
  return el('div', { class: 'field' }, [
    el('label', { for: id }, label),
    control,
    hint ? el('p', { class: 'hint', id: `${id}-hint` }, hint) : null,
  ]);
}

function speechChoices() {
  const out = [['ask', 'Ask me when I first record']];
  if (FEATURES.onDeviceSpeech) out.push(['whisper', 'On-device model (your voice stays on this phone)']);
  out.push(['browser', "Browser speech service (audio goes to Google or Apple)"], ['typing', 'Typing only']);
  return out;
}

export default async function renderSettings(root, ctx) {
  const saved = store.getSettings();

  // ---- AI ----
  const provider = el('select', { id: 's-provider' }, [
    el('option', { value: 'none' }, 'None (sort by simple rules)'),
    el('option', { value: 'anthropic' }, 'Anthropic'),
    el('option', { value: 'openai' }, 'OpenAI-compatible (OpenAI, Ollama, a model on your computer)'),
  ]);
  provider.value = saved['ai.provider'];
  const keyInput = el('input', {
    type: 'password', id: 's-key', name: 'ai-key', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 's-key-hint',
  });
  const model = el('input', { type: 'text', id: 's-model', autocomplete: 'off', spellcheck: 'false' });
  model.value = saved['ai.model'];
  const baseUrl = el('input', { type: 'url', id: 's-base', autocomplete: 'off', spellcheck: 'false', placeholder: OPENAI_DEFAULT_BASE_URL });
  baseUrl.value = saved['ai.base_url'] ?? '';
  const aiStatus = el('p', { class: 'hint', role: 'status', id: 's-ai-status' });
  const keyHint = el('p', { class: 'hint', id: 's-key-hint' });
  const baseField = field('s-base', 'Base URL', baseUrl,
    'For a model on your own computer use its address, for example http://localhost:11434/v1 for Ollama. '
    + 'The model program must allow requests from this page (Ollama: set OLLAMA_ORIGINS to this site\'s address). '
    + 'Some browsers block a local address from a secure page; if so, open this app from your own computer instead.');
  const removeKeyBtn = el('button', { type: 'button', class: 'btn--danger' }, 'Remove key');
  const saveBtn = el('button', { type: 'submit', class: 'btn--primary' }, 'Save');
  const testBtn = el('button', { type: 'button' }, 'Test connection');

  function refreshAi() {
    const p = provider.value;
    const binding = keyBinding(formSettings());
    const has = Boolean(binding) && store.hasKeyFor(binding);
    const other = Boolean(binding) && store.keyIsForOther(binding);
    baseField.hidden = p !== 'openai';
    keyInput.disabled = p === 'none';
    model.disabled = p === 'none';
    testBtn.disabled = p === 'none';
    model.placeholder = p === 'anthropic' ? ANTHROPIC_DEFAULT_MODEL : 'Model name, for example llama3';
    keyInput.placeholder = has ? 'Saved on this device. Type to replace it.' : 'Paste your key';
    if (has) {
      keyHint.textContent = 'A key is saved on this device for this provider. It is sent only to this provider\'s address. Use a key with a spending limit.';
    } else if (other) {
      keyHint.textContent = `The saved key was entered for a different provider or address and is not used here. Enter a key for ${providerLabel(p)}. Saving with this provider removes the old key.`;
    } else if (p === 'openai') {
      keyHint.textContent = 'A key is optional for a model on your own computer. Use a key with a spending limit for online providers.';
    } else {
      keyHint.textContent = 'Not saved yet. The key stays on this device and is sent only to the provider you chose above. Use a key with a spending limit.';
    }
    removeKeyBtn.hidden = !store.hasKey();
  }
  provider.addEventListener('change', () => { aiStatus.textContent = ''; refreshAi(); });
  baseUrl.addEventListener('input', refreshAi);

  function formSettings() {
    const p = provider.value;
    return { 'ai.provider': p, 'ai.model': model.value.trim(), 'ai.base_url': p === 'openai' ? baseUrl.value.trim() || null : null };
  }

  function whatIsMissing(s, key) {
    if (s['ai.provider'] === 'none') return 'Choose a provider first.';
    if (s['ai.provider'] === 'anthropic' && !key) return 'Add a key first.';
    if (s['ai.provider'] === 'openai' && !s['ai.model']) return 'Add a model name first.';
    return 'Add a key for this address first.';
  }

  const aiForm = el('form', { class: 'section', 'aria-labelledby': 's-ai-h' }, [
    el('h3', { id: 's-ai-h' }, 'AI (optional)'),
    el('p', { class: 'hint' }, 'Sorting by simple rules works without this. AI adds better sorting, the clarifying question and Expand on ideas. The text of your thoughts is sent to the provider you choose.'),
    field('s-provider', 'Provider', provider),
    el('div', { class: 'field' }, [el('label', { for: 's-key' }, 'Key'), keyInput, keyHint]),
    field('s-model', 'Model', model),
    baseField,
    el('div', { class: 'row' }, [saveBtn, testBtn, removeKeyBtn]),
    aiStatus,
  ]);

  aiForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const s = formSettings();
    store.setSettings(s);
    const binding = keyBinding(s);
    const typed = keyInput.value.trim();
    let note = '';
    if (typed) {
      store.setKey(typed, binding);
      keyInput.value = '';
    } else if (binding && store.reconcileKey(binding) === 'removed') {
      // A key saved for another provider or address is never sent here: it was removed; ask for a new one.
      note = ` Enter a key for ${providerLabel(s['ai.provider'])}. The key saved for another provider was removed.`;
    }
    refreshAi();
    const key = binding ? store.getKeyFor(binding) : null;
    if (note) aiStatus.textContent = `Saved.${note}`;
    else aiStatus.textContent = s['ai.provider'] === 'none' || configFromSettings({ ...store.getSettings() }, key)
      ? 'Saved on this device.'
      : `Saved, but AI stays off. ${whatIsMissing(s, key)}`;
  });

  removeKeyBtn.addEventListener('click', () => {
    store.removeKey();
    keyInput.value = '';
    refreshAi();
    aiStatus.textContent = 'Key removed from this device. Sorting uses simple rules.';
  });

  testBtn.addEventListener('click', async () => {
    const s = formSettings();
    const binding = keyBinding(s);
    const typed = keyInput.value.trim();
    // Only a key typed just now, or one saved for exactly this provider and address, is ever sent.
    const p = resolveProvider(s, store, { fetch: globalThis.fetch.bind(globalThis), now: ctx.now, typedKey: typed });
    if (!p) {
      aiStatus.textContent = !typed && binding && store.keyIsForOther(binding)
        ? `Enter a key for ${providerLabel(s['ai.provider'])}.`
        : whatIsMissing(s, typed || (binding ? store.getKeyFor(binding) : null));
      return;
    }
    if (globalThis.navigator?.onLine === false) { aiStatus.textContent = 'You are offline.'; return; }
    testBtn.disabled = true;
    aiStatus.textContent = 'Testing…';
    try {
      await p.test();
      aiStatus.textContent = 'Connection works.';
    } catch (err) {
      aiStatus.textContent = describeAiError(err);
    } finally {
      testBtn.disabled = false;
    }
  });

  // ---- preferences ----
  const days = el('input', { type: 'number', id: 's-days', min: '1', max: '30', step: '1', inputmode: 'numeric' });
  days.value = String(saved['review.days']);
  const speech = el('select', { id: 's-speech' }, speechChoices().map(([v, label]) => el('option', { value: v }, label)));
  speech.value = speechChoices().some(([v]) => v === saved['speech.engine']) ? saved['speech.engine'] : 'ask';
  const prefStatus = el('p', { class: 'hint', role: 'status' });

  days.addEventListener('change', () => {
    store.setSettings({ 'review.days': days.value });
    days.value = String(store.getSettings()['review.days']);
    prefStatus.textContent = `Saved. Ideas come back after ${days.value} ${days.value === '1' ? 'day' : 'days'} without a review.`;
  });
  speech.addEventListener('change', async () => {
    store.setSettings({ 'speech.engine': speech.value });
    if (ctx.speech) ctx.speech.engine = speech.value;
    try { await ctx.store.setSetting('speech.engine', speech.value); } catch { /* localStorage copy is enough */ }
    prefStatus.textContent = 'Saved.';
  });

  const prefs = el('section', { class: 'section', 'aria-labelledby': 's-pref-h' }, [
    el('h3', { id: 's-pref-h' }, 'Preferences'),
    field('s-days', 'Bring ideas back after this many days (1 to 30)', days),
    field('s-speech', 'Speech to text', speech,
      'Typing always works. The browser speech service sends your recording to its maker: Google for Chrome, Apple for Safari.'),
    prefStatus,
  ]);

  // ---- data ----
  const dataStatus = el('p', { class: 'hint', role: 'status' });
  const exportBtn = el('button', { type: 'button' }, 'Export all thoughts');
  const importInput = el('input', { type: 'file', id: 's-import', accept: 'application/json,.json' });
  const deleteBtn = el('button', { type: 'button', class: 'btn--danger' }, 'Delete all data');
  const confirmBox = el('div', { class: 'row', hidden: true }, []);

  exportBtn.addEventListener('click', async () => {
    try {
      const data = buildExport(await ctx.store.getAll(), store.getSettings(), ctx.now());
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = el('a', { href: url, download: exportFileName(ctx.now()) });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      dataStatus.textContent = `Exported ${data.thoughts.length} ${data.thoughts.length === 1 ? 'thought' : 'thoughts'}. The file has no key in it.`;
    } catch (err) {
      dataStatus.textContent = `Could not export: ${err.message}`;
    }
  });

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) { dataStatus.textContent = 'This file is too large to be a Thought Catcher export. Nothing was imported.'; return; }
    try {
      const parsed = parseImport(await file.text());
      if (!parsed.ok) { dataStatus.textContent = /Nothing was imported\.$/.test(parsed.error) ? parsed.error : `${parsed.error} Nothing was imported.`; return; }
      const merged = mergeImport(await ctx.store.getAll(), parsed.data.thoughts);
      await ctx.store.putMany(merged.toAdd);
      dataStatus.textContent = importSummary(merged);
    } catch (err) {
      dataStatus.textContent = `Could not import: ${err.message}. Nothing was imported.`;
    }
  });

  function closeConfirm() {
    confirmBox.hidden = true;
    confirmBox.replaceChildren();
    deleteBtn.hidden = false;
    deleteBtn.focus();
  }
  deleteBtn.addEventListener('click', () => {
    deleteBtn.hidden = true;
    const yes = el('button', { type: 'button', class: 'btn--danger' }, 'Yes, delete everything');
    const no = el('button', { type: 'button' }, 'Cancel');
    confirmBox.replaceChildren(
      el('p', { role: 'alert' }, 'This removes every thought, every setting and your key from this device. It cannot be undone.'),
      yes, no,
    );
    confirmBox.hidden = false;
    no.focus();
    no.addEventListener('click', closeConfirm);
    yes.addEventListener('click', async () => {
      try {
        await ctx.store.clear();
        store.clearAll();
        if (ctx.speech) ctx.speech.engine = 'ask';
        try { await ctx.store.setSetting('speech.engine', 'ask'); } catch { /* ignore */ }
        try { await globalThis.caches?.delete('transformers-cache'); } catch { /* no downloaded model */ }
        provider.value = 'none';
        model.value = '';
        baseUrl.value = '';
        keyInput.value = '';
        days.value = String(store.getSettings()['review.days']);
        speech.value = 'ask';
        refreshAi();
        aiStatus.textContent = '';
        closeConfirm();
        dataStatus.textContent = 'All data deleted from this device.';
      } catch (err) {
        dataStatus.textContent = `Could not delete: ${err.message}`;
      }
    });
  });

  const data = el('section', { class: 'section', 'aria-labelledby': 's-data-h' }, [
    el('h3', { id: 's-data-h' }, 'Your data'),
    el('p', { class: 'hint' }, 'Everything is stored on this device only. Export a backup file now and then: clearing browser data, or iOS removing data from an app you have not opened for a while, can delete your thoughts.'),
    el('div', { class: 'row' }, exportBtn),
    field('s-import', 'Import a backup file', importInput, 'Thoughts already here are kept. New ones from the file are added.'),
    el('div', { class: 'row' }, deleteBtn),
    confirmBox,
    dataStatus,
  ]);

  root.append(el('h2', {}, 'Settings'), aiForm, prefs, data);
  refreshAi();
}
