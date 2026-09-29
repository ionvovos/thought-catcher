// Own key page (B3): provider, key, model, base URL, Test connection, Remove key. The key is bound to its provider and
// host when saved and only ever sent there (v1 gate finding V2 G1); nothing here changes that. Provider error text is
// never shown for a rejected key: only "Key rejected." (gate G25, v1 F6).
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Button, IconButton } from '../components/button.js';
import {
  resolveProvider, keyBinding, providerLabel, ANTHROPIC_DEFAULT_MODEL, OPENAI_DEFAULT_BASE_URL, configFromSettings,
} from '../../core/ai/adapter.js';
import { describeAiError } from '../../core/ai/http.js';

const PROVIDERS = [['anthropic', 'Anthropic'], ['openai', 'OpenAI-compatible']];

const mask = (key) => (key ? `${'•'.repeat(12)}${key.slice(-4)}` : '');

export function renderOwnKey(ctx, { onSaved } = {}) {
  const store = ctx.settings;
  const saved = store.getSettings();
  const form = { provider: saved['ai.provider'] === 'none' ? 'anthropic' : saved['ai.provider'] };

  const seg = el('div', { class: 'segsm segsm--wide', role: 'radiogroup', 'aria-label': 'Provider' }, PROVIDERS.map(([value, label]) => el('button', {
    type: 'button', role: 'radio', 'aria-checked': String(form.provider === value), 'data-value': value,
    onclick: () => { form.provider = value; status.textContent = ''; problem.hidden = true; paint(); },
  }, label)));

  const keyInput = el('input', { type: 'password', class: 'frow__input', id: 'k-key', name: 'ai-key', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Key' });
  const reveal = IconButton({ name: 'lock', label: 'Show key', onClick: () => {
    const on = keyInput.type === 'password';
    keyInput.type = on ? 'text' : 'password';
    reveal.setAttribute('aria-label', on ? 'Hide key' : 'Show key');
  } });
  const model = el('input', { type: 'text', class: 'frow__input', id: 'k-model', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Model' });
  model.value = saved['ai.model'];
  const base = el('input', { type: 'url', class: 'frow__input', id: 'k-base', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Base URL', placeholder: OPENAI_DEFAULT_BASE_URL });
  base.value = saved['ai.base_url'] ?? '';
  const baseNote = el('span', { class: 'frow__note' }, 'Not used for Anthropic');
  const baseRow = el('label', { class: 'frow' }, [el('span', { class: 'frow__label' }, 'Base URL (OpenAI-compatible only)'), el('span', { class: 'frow__value' }, [base, baseNote])]);
  const keyHint = el('p', { class: 'gfoot' });
  const problem = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const status = el('p', { class: 'status-line', role: 'status' });
  const removeBtn = Button({ label: 'Remove key', kind: 'secondary', icon: 'trash', className: 'btn--danger', onClick: () => remove() });
  const testBtn = Button({ label: 'Test connection', kind: 'tinted', icon: 'refresh', onClick: () => test() });
  const saveBtn = Button({ label: 'Save', kind: 'primary', large: true, type: 'submit' });

  const formValues = () => {
    const p = form.provider;
    return { 'ai.provider': p, 'ai.model': model.value.trim(), 'ai.base_url': p === 'openai' ? base.value.trim() || null : null };
  };

  function paint() {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === form.provider)));
    const p = form.provider;
    const s = formValues();
    const binding = keyBinding(s);
    const has = Boolean(binding) && store.hasKeyFor(binding);
    const other = Boolean(binding) && store.keyIsForOther(binding);
    base.disabled = p !== 'openai';
    baseNote.hidden = p === 'openai';
    base.hidden = p !== 'openai';
    model.placeholder = p === 'anthropic' ? ANTHROPIC_DEFAULT_MODEL : 'Model name, for example llama3';
    keyInput.placeholder = has ? mask(store.getKeyFor(binding)) : 'Paste your key';
    if (has) keyHint.textContent = "The key stays on this phone and is sent only to this provider's address, with the text you file. It is never in an export. Use a key with a spending limit.";
    else if (other && p === 'openai') keyHint.textContent = 'The saved key was entered for a different provider or address and is not used here. A key is optional for a model on your own computer. Saving with this provider removes the old key.';
    else if (other) keyHint.textContent = `The saved key was entered for a different provider or address and is not used here. Enter a key for ${providerLabel(p)}. Saving with this provider removes the old key.`;
    else if (p === 'openai') keyHint.textContent = 'A key is optional for a model on your own computer. Use a key with a spending limit for online providers. It is never in an export.';
    else keyHint.textContent = 'Not saved yet. The key stays on this phone and is sent only to the provider above, with the text you file. It is never in an export. Use a key with a spending limit.';
    removeBtn.hidden = !store.hasKey();
  }

  function whatIsMissing(s, key) {
    if (s['ai.provider'] === 'none') return 'Choose a provider first.';
    if (s['ai.provider'] === 'anthropic' && !key) return 'Add a key first.';
    if (s['ai.provider'] === 'openai' && !s['ai.model']) return 'Add a model name first.';
    return 'Add a key for this address first.';
  }

  function save() {
    const s = formValues();
    store.setSettings(s);
    const binding = keyBinding(s);
    const typed = keyInput.value.trim();
    let note = '';
    if (typed) {
      store.setKey(typed, binding);
      keyInput.value = '';
    } else if (binding) {
      const before = store.getKeyBinding();
      if (store.reconcileKey(binding) === 'removed') {
        // A key saved for another provider or address is never sent here: it was removed.
        const removed = before?.provider === binding.provider ? 'The key saved for the previous address was removed.' : 'The key saved for another provider was removed.';
        note = ` ${removed} ${s['ai.provider'] === 'openai' ? 'No key saved; add one if your server needs it.' : `Enter a key for ${providerLabel(s['ai.provider'])}.`}`;
      } else if (s['ai.provider'] === 'openai' && !store.hasKeyFor(binding)) {
        note = ' No key saved; add one if your server needs it.';
      }
    }
    paint();
    const key = binding ? store.getKeyFor(binding) : null;
    problem.hidden = true;
    status.className = 'status-line status-line--ok';
    if (note) status.textContent = `Saved.${note}`;
    else if (configFromSettings(store.getSettings(), key)) status.textContent = 'Saved on this phone.';
    else { status.className = 'status-line'; status.textContent = `Saved, but AI stays off. ${whatIsMissing(s, key)}`; }
    ctx.brain.refresh?.();
    onSaved?.();
  }

  function remove() {
    store.removeKey();
    keyInput.value = '';
    problem.hidden = true;
    status.className = 'status-line';
    status.textContent = 'Key removed from this phone. Sorting uses the assistant, or simple rules.';
    paint();
    ctx.brain.refresh?.();
    onSaved?.();
  }

  async function test() {
    const s = formValues();
    const binding = keyBinding(s);
    const typed = keyInput.value.trim();
    problem.hidden = true;
    status.className = 'status-line';
    // Only a key typed just now, or one saved for exactly this provider and address, is ever sent.
    const p = resolveProvider(s, store, { fetch: globalThis.fetch.bind(globalThis), now: ctx.now, typedKey: typed });
    if (!p) {
      status.textContent = !typed && binding && s['ai.provider'] === 'anthropic' && store.keyIsForOther(binding)
        ? `Enter a key for ${providerLabel(s['ai.provider'])}.`
        : whatIsMissing(s, typed || (binding ? store.getKeyFor(binding) : null));
      return;
    }
    if (globalThis.navigator?.onLine === false) { status.textContent = 'You are offline. Try again when you are connected.'; return; }
    testBtn.disabled = true;
    status.textContent = 'Testing…';
    try {
      await p.test();
      status.className = 'status-line status-line--ok';
      status.textContent = 'Connection works.';
    } catch (err) {
      status.textContent = '';
      problem.replaceChildren(icon('info'), describeAiError(err));
      problem.hidden = false;
    } finally {
      testBtn.disabled = false;
    }
  }

  const page = el('form', { class: 'ownkey', novalidate: 'true' }, [
    el('h2', { class: 'glabel' }, 'Provider'),
    seg,
    el('h2', { class: 'glabel' }, 'Connection'),
    el('div', { class: 'group' }, [
      el('label', { class: 'frow' }, [el('span', { class: 'frow__label' }, 'Key'), el('span', { class: 'frow__value' }, [keyInput, reveal])]),
      el('label', { class: 'frow' }, [el('span', { class: 'frow__label' }, 'Model'), el('span', { class: 'frow__value' }, model)]),
      baseRow,
    ]),
    keyHint,
    problem,
    status,
    el('div', { class: 'formacts' }, [saveBtn]),
    el('div', { class: 'formacts' }, [testBtn, removeBtn]),
  ]);
  page.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  base.addEventListener('input', paint);

  // A rejected key is reported once, with fixed wording only (AC-B3.5, G25).
  if (ctx.status?.().key === 'rejected') {
    problem.replaceChildren(icon('info'), 'Key rejected.');
    problem.hidden = false;
    status.textContent = 'Your thoughts are saved and sorted on this phone.';
  }
  paint();
  return page;
}
