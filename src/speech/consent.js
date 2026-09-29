// First-use choice of listening engine: one card, three plain choices with their costs. The choice is saved and can be
// changed in Settings. Nothing is downloaded, recorded or asked of the browser before it is made (AC-X9.3).
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export const CHOICES = Object.freeze({
  whisper: { title: 'On this phone', sub: 'Private. One download of about 60 MB; the audio never leaves the phone.' },
  browser: { title: "Phone's speech service", sub: 'No download. The audio goes to Apple or Google.' },
  typing: { title: "I'll type", sub: 'The microphone stays off.' },
});

// Resolves with the saved engine preference, or 'ask' when no voice engine exists at all (the caller then shows the
// "voice not available" line). `host` is where the card is placed. `settings` has getSettings/setSettings.
export async function ensureSpeechChoice({ engines, speech, host, settings }) {
  speech.engine = settings.getSettings()['speech.engine'];
  if (speech.engine !== 'ask') return speech.engine;
  const usable = new Set(engines.filter((e) => e.isAvailable()).map((e) => e.id));
  if (usable.size === 0) return 'ask';

  const choice = await new Promise((resolve) => {
    const options = ['whisper', 'browser', 'typing'].filter((k) => k === 'typing' || usable.has(k));
    const card = el('div', { class: 'consent', role: 'group', 'aria-labelledby': 'voice-choice-h' }, [
      el('div', { class: 'consent__head' }, [el('span', { class: 'ticon notice__icon--info' }, icon('mic')), el('h3', { id: 'voice-choice-h' }, 'How should I listen?')]),
      el('p', {}, 'Pick once. You can change it later in Settings.'),
      el('div', { class: 'choices' }, options.map((k) => el('button', {
        type: 'button', class: 'choice', 'data-choice': k,
        onclick: () => { card.remove(); resolve(k); },
      }, [
        el('span', { class: 'ticon notice__icon--info' }, icon(k === 'typing' ? 'keyboard' : k === 'whisper' ? 'chip' : 'mic')),
        el('span', {}, [el('span', { class: 'choice__t' }, CHOICES[k].title), el('span', { class: 'choice__s' }, CHOICES[k].sub)]),
        el('span', { class: 'radio', 'aria-hidden': 'true' }),
      ]))),
    ]);
    host.append(card);
    card.querySelector('button')?.focus();
  });
  settings.setSettings({ 'speech.engine': choice });
  speech.engine = choice;
  return choice;
}
