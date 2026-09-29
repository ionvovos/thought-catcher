// Capture screen: one big record button, a text field that is always usable, save.
import { el } from '../dom.js';
import { sortByRules } from '../../core/sorter.js';
import { newThought } from '../../core/model.js';
import { selectEngine, transcribeWithFallback, speechMessage } from '../../speech/select.js';

export default async function renderCapture(root, ctx) {
  let alive = true;
  let recording = null; // AbortController while recording
  let source = 'typed';

  const status = el('p', { class: 'capture-status', id: 'capture-status', role: 'status', 'aria-live': 'polite' });
  const interim = el('p', { class: 'interim', 'aria-live': 'off' });
  const note = el('p', { class: 'speech-note', hidden: true });
  const recordBtn = el('button', { type: 'button', class: 'record-btn', 'aria-pressed': 'false', 'aria-label': 'Record a thought' }, 'Record');
  const field = el('textarea', { id: 'thought-text', rows: 3, autocomplete: 'off' });
  const saveBtn = el('button', { type: 'submit', class: 'btn btn--primary' }, 'Save');
  const form = el('form', { class: 'capture-form' }, [
    el('label', { for: 'thought-text' }, 'Your thought'), field, saveBtn,
  ]);
  const hint = el('p', { class: 'hint' }, [
    'Shortcut: press ', el('kbd', {}, 'R'), ' to start or stop recording, ', el('kbd', {}, 'Esc'), ' to stop.',
  ]);
  const clarifyBox = el('div', { class: 'clarify', hidden: true });

  const setStatus = (msg) => { status.textContent = msg; };
  const setRecording = (on) => {
    recordBtn.classList.toggle('is-recording', on);
    recordBtn.setAttribute('aria-pressed', String(on));
    recordBtn.textContent = on ? 'Stop' : 'Record';
    recordBtn.setAttribute('aria-label', on ? 'Stop recording' : 'Record a thought');
  };

  function refreshEngine() {
    const sel = selectEngine(ctx.engines, ctx.speech);
    recordBtn.classList.toggle('is-unavailable', !sel.engine);
    if (sel.engine) {
      recordBtn.removeAttribute('aria-describedby');
      if (sel.engine.id === 'browser') {
        note.textContent = "Voice uses your browser's speech service, which sends the recording to Google (Chrome) or Apple (Safari).";
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    } else {
      note.hidden = true;
      recordBtn.setAttribute('aria-describedby', 'capture-status');
      setStatus(speechMessage(sel.reason));
    }
    return sel;
  }

  async function toggleRecording() {
    if (recording) { recording.abort(); return; }
    const sel = refreshEngine();
    if (!sel.engine) { field.focus(); return; }
    recording = new AbortController();
    setRecording(true);
    setStatus('Listening… tap again to stop.');
    const result = await transcribeWithFallback(ctx.engines, ctx.speech, null, {
      stop: recording.signal,
      onInterim: (t) => { if (alive) interim.textContent = t; },
    });
    recording = null;
    if (!alive) return;
    setRecording(false);
    interim.textContent = '';
    if (result.text === null) {
      for (const e of result.errors) ctx.speech.failed.add(e.engine);
      refreshEngine();
      setStatus(speechMessage(result.reason));
      field.focus();
    } else if (result.text === '') {
      setStatus('nothing heard');
    } else {
      field.value = field.value.trim() ? `${field.value.trim()} ${result.text}` : result.text;
      source = 'voice';
      setStatus('Check the text, then save.');
      field.focus();
    }
  }

  async function save() {
    const text = field.value.trim();
    if (!text) { setStatus('Nothing to save yet. Type or record a thought first.'); return; }
    saveBtn.disabled = true;
    try {
      const now = ctx.now();
      const thought = newThought({ text, source, sortResult: sortByRules(text, now), now });
      await ctx.store.put(thought);
      field.value = '';
      source = 'typed';
      setStatus(`Saved as ${thought.type}: ${thought.title}`);
      if (alive && ctx.afterSave) ctx.afterSave(thought, { clarifyBox, setStatus, alive: () => alive, root });
    } catch (err) {
      setStatus(`Could not save: ${err.message}`);
    } finally {
      saveBtn.disabled = false;
    }
  }

  recordBtn.addEventListener('click', toggleRecording);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  field.addEventListener('input', () => { if (!field.value) source = 'typed'; });

  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable;
    if (e.key === 'Escape' && recording) { recording.abort(); return; }
    if ((e.key === 'r' || e.key === 'R') && !inField) {
      e.preventDefault();
      if (selectEngine(ctx.engines, ctx.speech).engine) toggleRecording();
      else field.focus();
    }
  };
  document.addEventListener('keydown', onKey);

  root.append(el('h2', {}, 'Catch a thought'), recordBtn, note, status, interim, form, clarifyBox, hint);
  refreshEngine();
  const focus = ctx.consumeInitialFocus?.();
  if (focus === 'record') recordBtn.focus();
  else if (focus === 'text') field.focus();

  return () => {
    alive = false;
    document.removeEventListener('keydown', onKey);
    if (recording) recording.abort();
  };
}
