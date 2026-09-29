// First-use choice of voice engine (architecture 4.2): one panel, three plain choices with their costs.
// The choice is saved and can be changed in Settings. Nothing is downloaded or recorded before it is made.
import { el } from './dom.js';
import { getSettings, setSettings } from '../storage/settings.js';

const CHOICES = {
  whisper: 'Download the on-device model (about 60 MB, audio stays on this phone)',
  browser: "Use the browser's speech service (no download; audio goes to Google or Apple)",
  typing: 'Type instead',
};

// Resolves with the saved engine preference. Resolves 'ask' when no voice engine exists at all (the caller shows
// the "voice not available" message). `host` is the element the panel is placed in.
export async function ensureSpeechChoice({ engines, speech, host }) {
  speech.engine = getSettings()['speech.engine'];
  if (speech.engine !== 'ask') return speech.engine;
  const usable = new Set(engines.filter((e) => e.isAvailable()).map((e) => e.id));
  if (usable.size === 0) return 'ask';

  const choice = await new Promise((resolve) => {
    const options = ['whisper', 'browser', 'typing'].filter((k) => k === 'typing' || usable.has(k));
    const panel = el('div', { class: 'consent', role: 'group', 'aria-labelledby': 'consent-h' }, [
      el('h3', { id: 'consent-h' }, 'How should voice work?'),
      el('p', { class: 'hint' }, 'Pick once. You can change it later in Settings.'),
      ...options.map((k) => el('button', {
        type: 'button', class: 'btn consent-choice', 'data-choice': k,
        onclick: () => { panel.remove(); resolve(k); },
      }, CHOICES[k])),
    ]);
    host.append(panel);
    panel.querySelector('button').focus();
  });
  setSettings({ 'speech.engine': choice });
  speech.engine = choice;
  return choice;
}
