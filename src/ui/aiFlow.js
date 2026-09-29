// Browser glue for the AI features: background sort, the one clarifying question, expand, re-sort.
// Every pure decision lives in src/core; this file only connects them to the store, the settings and the page.
import { getSettings, getKey } from '../storage/settings.js';
import { createProvider, configFromSettings } from '../core/ai/adapter.js';
import { describeAiError } from '../core/ai/http.js';
import { detectAmbiguity } from '../core/ambiguity.js';
import { startClarify, markUnavailable, skipClarify, applyAnswer } from '../core/clarify.js';
import { expandIdea } from '../core/expand.js';
import { parseWhen } from '../core/timeparse.js';
import { el } from './dom.js';
import { attachVoice } from './voice.js';

const asSortResult = (t) => ({ type: t.type, alt_type: t.sort.alt_type, confidence: t.sort.confidence, due_at: t.due_at });

export function createAiFlow({ store, now, engines, speech, fetchFn = (...a) => globalThis.fetch(...a) }) {
  let keyRejectedShown = false;

  // { state: 'nokey' | 'offline' | 'ready', provider? } read fresh on every call, so a key added later works at once.
  function status() {
    const config = configFromSettings(getSettings(), getKey());
    if (!config) return { state: 'nokey' };
    if (globalThis.navigator?.onLine === false) return { state: 'offline' };
    return { state: 'ready', provider: createProvider(config, { fetch: fetchFn, now, getKey }) };
  }

  function reportError(err, setStatus) {
    if (err?.kind === 'auth') {
      if (!keyRejectedShown) { keyRejectedShown = true; setStatus?.('key rejected'); }
      return;
    }
    setStatus?.(describeAiError(err));
  }

  // Writes the AI's sort onto the stored thought unless the person changed or deleted it meanwhile.
  async function applySort(saved, result, provider) {
    const cur = await store.get(saved.id);
    if (!cur || cur.updated_at !== saved.updated_at) return cur ?? saved;
    const patched = {
      ...cur,
      type: result.type,
      title: result.title,
      tags: result.tags,
      due_at: result.due_at,
      sort: { by: 'ai', confidence: result.confidence, alt_type: result.alt_type, model: provider.model ?? null },
      updated_at: now().toISOString(),
    };
    await store.put(patched);
    return patched;
  }

  // Called by the capture view right after the rule-sorted thought is stored. Never blocks the save.
  async function afterSave(saved, ui) {
    const st = status();
    let current = saved;
    let authFailed = false;
    if (st.state === 'ready') {
      try {
        const result = await st.provider.sort(saved.text);
        current = await applySort(saved, result, st.provider);
        if (current !== saved && ui.alive()) ui.setStatus(`Sorted by AI as ${current.type}: ${current.title}`);
      } catch (err) {
        authFailed = err?.kind === 'auth';
        if (ui.alive()) reportError(err, ui.setStatus);
      }
    }
    if (!ui.alive() || authFailed) return;
    const amb = detectAmbiguity(asSortResult(current), current.text, { source: current.source, by: current.sort.by });
    if (!amb) return;
    if (st.state === 'nokey') {
      await store.put(markUnavailable(current, amb, now()));
    } else if (st.state === 'offline') {
      ui.setStatus('offline: sorted by rules, no question asked');
    } else {
      const asked = startClarify(current, amb, now());
      await store.put(asked);
      showQuestion(asked, amb, st.provider, ui);
    }
  }

  function showQuestion(asked, amb, provider, ui) {
    const box = ui.clarifyBox;
    const input = el('input', { type: 'text', id: 'clarify-answer', autocomplete: 'off', 'aria-describedby': 'clarify-q' });
    const err = el('p', { class: 'error', role: 'alert', hidden: true });
    const answerBtn = el('button', { type: 'submit', class: 'btn btn--primary' }, 'Answer');
    const skipBtn = el('button', { type: 'button', class: 'btn', id: 'clarify-skip' }, 'Skip');
    const voiceBtn = el('button', { type: 'button', class: 'btn', 'aria-pressed': 'false' }, 'Speak');
    const form = el('form', { class: 'clarify-form' }, [
      el('label', { for: 'clarify-answer' }, 'Your answer'), input,
      el('div', { class: 'clarify-actions' }, [answerBtn, voiceBtn, skipBtn]),
    ]);
    box.replaceChildren(el('p', { class: 'clarify-q', id: 'clarify-q' }, amb.question), form, err);
    box.hidden = false;
    const detachVoice = attachVoice({ button: voiceBtn, engines, speech, onText: (t) => { input.value = t; input.focus(); }, onMessage: (m) => { err.textContent = m; err.hidden = !m; } });
    input.focus();

    const close = () => { detachVoice(); box.hidden = true; box.replaceChildren(); };
    const busy = (on) => { for (const b of [answerBtn, skipBtn, voiceBtn]) b.disabled = on; input.disabled = on; };

    skipBtn.addEventListener('click', async () => {
      busy(true);
      try {
        const cur = await store.get(asked.id);
        if (cur && cur.clarify.state === 'pending') await store.put(skipClarify(cur, now()));
        close();
        if (ui.alive()) ui.setStatus('Kept as it is.');
      } catch (e) {
        busy(false);
        err.textContent = e.message; err.hidden = false;
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const answer = input.value.trim();
      if (!answer) { err.textContent = 'Type or say an answer, or skip.'; err.hidden = false; return; }
      busy(true); err.hidden = true;
      try {
        const cur = await store.get(asked.id);
        if (!cur || cur.clarify.state !== 'pending') { close(); return; }
        const updated = await applyAnswer(cur, amb, answer, provider, { now: now(), parseWhen });
        await store.put(updated);
        close();
        if (ui.alive()) ui.setStatus(`Updated: ${updated.type}, ${updated.title}`);
      } catch (ex) {
        busy(false);
        if (ex?.kind === 'auth') { keyRejectedShown = true; err.textContent = 'key rejected'; } else err.textContent = describeAiError(ex);
        err.hidden = false;
      }
    });
  }

  // Expand an idea. Resolves with the updated thought; the stored idea changes only when the reply is valid.
  async function expand(thought) {
    const st = status();
    if (st.state !== 'ready') throw new Error(st.state === 'offline' ? 'offline' : 'needs a key');
    const updated = await expandIdea(thought, st.provider, { now: now() });
    await store.put(updated);
    return updated;
  }

  // Re-sort one thought with the AI (only on the person's action).
  async function resort(thought) {
    const st = status();
    if (st.state !== 'ready') throw new Error(st.state === 'offline' ? 'offline' : 'needs a key');
    const result = await st.provider.sort(thought.text);
    const updated = {
      ...thought,
      type: result.type,
      title: result.title,
      tags: result.tags,
      due_at: result.due_at,
      sort: { by: 'ai', confidence: result.confidence, alt_type: result.alt_type, model: st.provider.model ?? null },
      updated_at: now().toISOString(),
    };
    await store.put(updated);
    return updated;
  }

  return { status, afterSave, expand, resort, reportError };
}
