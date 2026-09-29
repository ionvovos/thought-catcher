// Capture screen: one big record button, a text field that is always usable, save.
import { el } from '../dom.js';
import { sortByRules } from '../../core/sorter.js';
import { newThought } from '../../core/model.js';
import { selectEngine, transcribeWithFallback, speechMessage, failureMessage, enginesToMarkFailed } from '../../speech/select.js';
import { ensureSpeechChoice } from '../consent.js';
import { getSettings } from '../../storage/settings.js';

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
  const consentHost = el('div', { class: 'consent-host' });
  const progress = el('progress', { class: 'progress', max: '100', value: '0', hidden: true, 'aria-label': 'Downloading the on-device model' });

  const setStatus = (msg) => { status.textContent = msg; };
  const setRecording = (on) => {
    recordBtn.classList.toggle('is-recording', on);
    recordBtn.setAttribute('aria-pressed', String(on));
    recordBtn.textContent = on ? 'Stop' : 'Record';
    recordBtn.setAttribute('aria-label', on ? 'Stop recording' : 'Record a thought');
  };

  function refreshEngine() {
    ctx.speech.engine = getSettings()['speech.engine'];
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

  let choosing = false;
  async function toggleRecording() {
    if (recording) { recording.abort(); return; }
    if (choosing) return;
    choosing = true;
    let pref;
    try {
      pref = await ensureSpeechChoice({ engines: ctx.engines, speech: ctx.speech, host: consentHost });
    } finally {
      choosing = false;
    }
    if (!alive) return;
    const sel = refreshEngine();
    if (pref === 'typing') { setStatus(speechMessage('typing')); field.focus(); return; }
    if (!sel.engine) { field.focus(); return; }
    recording = new AbortController();
    setRecording(true);
    setStatus(sel.engine.id === 'whisper' ? 'Getting ready…' : 'Listening… tap again to stop.');
    const onState = (kind, detail) => {
      if (!alive) return;
      progress.hidden = kind !== 'loading';
      if (kind === 'loading') {
        progress.value = detail;
        setStatus(`Getting the on-device model ready… ${detail}%`);
      } else if (kind === 'listening') {
        setStatus('Listening… tap again to stop.');
      } else if (kind === 'transcribing') {
        setStatus('Turning your voice into text…');
      }
    };
    const result = await transcribeWithFallback(ctx.engines, ctx.speech, null, {
      stop: recording.signal,
      onInterim: (t) => { if (alive) interim.textContent = t; },
      onState,
    });
    recording = null;
    if (!alive) return;
    progress.hidden = true;
    setRecording(false);
    interim.textContent = '';
    if (result.text === null) {
      for (const id of enginesToMarkFailed(ctx.speech, result)) ctx.speech.failed.add(id);
      refreshEngine();
      setStatus(failureMessage(ctx.speech, result));
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

  let saving = false;
  async function save() {
    if (saving) return; // a second submit in the same instant must not store the thought twice
    const text = field.value.trim();
    if (!text) { setStatus('Nothing to save yet. Type or record a thought first.'); return; }
    saving = true;
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
      saving = false;
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

  const due = ctx.getReviewCount?.() ?? 0;
  const nudge = due > 0 ? el('p', { class: 'review-nudge' }, el('a', { href: '#/review', class: 'btn' }, `${due} to review`)) : null;
  root.append(el('h2', {}, 'Catch a thought'), nudge, recordBtn, consentHost, note, status, progress, interim, form, clarifyBox, hint);
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
