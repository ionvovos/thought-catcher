// First-run onboarding (X9): at most three pages, a visible way to skip, and nothing requested before the first tap on the
// orb or the typing control (no microphone, notification, key prompt or download happens here; AC-X9.3).
// The choices are written only when the last page is finished; Skip leaves every setting as it was.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Button } from '../components/button.js';
import { createOrb } from '../orb/orb.js';
import { radioGroup } from './radio.js';
import { voiceRows, PREVIEW_TEXT } from './voices.js';

const LISTEN = [
  { value: 'whisper', label: 'On this phone', sub: 'Private, one download of about 60 MB' },
  { value: 'browser', label: "Phone's speech service", sub: 'No download; audio goes to Apple or Google' },
  { value: 'typing', label: "I'll type", sub: 'The microphone stays off' },
];

const synth = () => (typeof globalThis.speechSynthesis === 'object' ? globalThis.speechSynthesis : null);

// root is an .app frame; onDone() runs after the last page or Skip. `start` (0-2) lets tests open a later page.
export function showOnboarding(root, ctx, { onDone, start = 0 } = {}) {
  let page = Math.min(2, Math.max(0, start));
  const choice = { listen: LISTEN.some((l) => l.value === ctx.settings.getSettings()['speech.engine']) ? ctx.settings.getSettings()['speech.engine'] : 'whisper', voice: ctx.settings.getSettings()['voice.name'] ?? null };
  let stopVoices = null;

  function finish(save) {
    synth()?.cancel();
    stopVoices?.();
    if (save) {
      ctx.settings.setSettings({ 'speech.engine': choice.listen, 'voice.name': choice.voice, 'voice.speak': Boolean(choice.voice) });
    }
    onDone?.();
  }

  const pager = (n) => el('div', { class: 'pager', role: 'img', 'aria-label': `Page ${n + 1} of 3` }, [0, 1, 2].map((i) => el('span', { class: i === n ? 'on' : '' })));

  function shell(n, { art, copy, foot }) {
    return el('section', { class: 'ob', 'aria-label': `Welcome, page ${n + 1} of 3` }, [
      art ? el('div', { class: 'ob__art' }, art) : null,
      el('div', { class: 'ob__copy' }, copy),
      el('div', { class: 'ob__foot' }, [pager(n), foot]),
    ].filter(Boolean));
  }

  const skip = () => Button({ label: 'Skip', kind: 'plain', className: 'skip', ariaLabel: 'Skip the welcome', onClick: () => finish(false) });
  const next = (label) => Button({ label, kind: 'primary', large: true, onClick: () => { if (page === 2) finish(true); else { page += 1; draw(); } } });

  function page1() {
    const orb = createOrb({ state: 'speaking' });
    orb.el.style.setProperty('--level', '0.3');
    orb.el.disabled = true;
    orb.el.setAttribute('aria-hidden', 'true');
    orb.el.tabIndex = -1;
    return [skip(), shell(0, {
      art: orb.el,
      copy: [el('h1', { tabindex: '-1' }, ['Say it.', el('br'), "I'll sort it."]), el('p', {}, 'Speak a to-do, an idea, a reminder or a long ramble. I split it into thoughts, file each one, and ask a question only when I need to.')],
      foot: next('Continue'),
    })];
  }

  function fact(iconName, title, text) {
    return el('li', {}, [el('span', { class: 'ticon notice__icon--info', 'aria-hidden': 'true' }, icon(iconName)), el('span', {}, [el('strong', {}, title), text])]);
  }

  function page2() {
    return [skip(), shell(1, {
      art: el('div', { class: 'shield-art', 'aria-hidden': 'true' }, icon('lock')),
      copy: [
        el('h1', { tabindex: '-1' }, 'Stays on your phone'),
        el('ul', { class: 'plist' }, [
          fact('chip', 'The assistant runs here', 'A small model downloads once, after you agree, then works offline.'),
          fact('shield', 'No account', 'Your thoughts are saved on this phone. Export them any time.'),
          fact('key', 'Only two things can leave', "Your voice, if you pick the phone's speech service. And the text you file, if you add your own AI key."),
        ]),
      ],
      foot: next('Continue'),
    })];
  }

  function voiceList() {
    const box = el('div', { class: 'voicebox' });
    const s = synth();
    const paint = () => {
      const rows = voiceRows(s?.getVoices?.() ?? []);
      const items = [{ value: null, label: 'Silent', sub: 'Replies on screen only' }, ...rows.map((r) => ({
        value: r.name, label: r.name, sub: r.sub,
        extra: el('button', {
          type: 'button', class: 'mini-btn', 'aria-label': `Preview ${r.name}`,
          onclick: () => {
            s.cancel();
            const u = new globalThis.SpeechSynthesisUtterance(PREVIEW_TEXT);
            u.voice = r.voice;
            s.speak(u);
          },
        }, [icon('speaker', 'i--sm'), ' Play']),
      }))];
      const group = radioGroup(items, { value: choice.voice, label: 'Reply voice', onChange: (v) => { choice.voice = v; } });
      box.replaceChildren(group.el, ...(s ? [] : [el('p', { class: 'gfoot' }, 'This browser has no voices to choose from, so replies stay silent.')]));
    };
    paint();
    if (s?.addEventListener) {
      s.addEventListener('voiceschanged', paint);
      stopVoices = () => s.removeEventListener('voiceschanged', paint);
    }
    return box;
  }

  function page3() {
    const listen = radioGroup(LISTEN, { value: choice.listen, label: 'How I listen', onChange: (v) => { choice.listen = v; } });
    return [el('section', { class: 'ob ob--voice', 'aria-label': 'Welcome, page 3 of 3' }, [
      el('div', { class: 'ob__copy' }, [
        el('h1', { tabindex: '-1' }, 'Your voice, and mine'),
        el('p', {}, 'Both can be changed in Settings.'),
        el('h2', { class: 'subh' }, 'How I listen'),
        listen.el,
        el('h2', { class: 'subh' }, 'How I reply'),
        voiceList(),
      ]),
      el('div', { class: 'ob__foot' }, [pager(2), next('Start')]),
    ])];
  }

  function draw() {
    stopVoices?.();
    stopVoices = null;
    synth()?.cancel();
    root.replaceChildren(...[page1, page2, page3][page]());
    root.querySelector('h1')?.focus?.({ preventScroll: true });
  }

  draw();
}
