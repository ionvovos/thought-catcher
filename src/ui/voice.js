// Wires a "Speak" button to the speech engines: press to listen, press again to stop, text goes to onText.
import { selectEngine, transcribeWithFallback, speechMessage } from '../speech/select.js';

// Returns a function that stops any listening and removes the handler.
export function attachVoice({ button, engines, speech, onText, onMessage }) {
  let controller = null;
  let alive = true;
  const label = button.textContent;

  const refresh = () => {
    const usable = Boolean(selectEngine(engines, speech).engine);
    button.classList.toggle('is-unavailable', !usable);
  };

  async function onClick() {
    if (controller) { controller.abort(); return; }
    const sel = selectEngine(engines, speech);
    if (!sel.engine) { onMessage?.(speechMessage(sel.reason)); return; }
    controller = new AbortController();
    button.setAttribute('aria-pressed', 'true');
    button.textContent = 'Stop';
    onMessage?.('');
    const result = await transcribeWithFallback(engines, speech, null, { stop: controller.signal });
    controller = null;
    if (!alive) return;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = label;
    if (result.text === null) {
      for (const e of result.errors) speech.failed.add(e.engine);
      refresh();
      onMessage?.(speechMessage(result.reason));
    } else if (result.text === '') {
      onMessage?.('nothing heard');
    } else {
      onText(result.text);
    }
  }

  refresh();
  button.addEventListener('click', onClick);
  return () => {
    alive = false;
    button.removeEventListener('click', onClick);
    if (controller) controller.abort();
  };
}
