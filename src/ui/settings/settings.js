// Settings (design.md 2.8, architecture 5): Assistant, Voice, Appearance, Your data, About. Sub-pages (own key, listening,
// reply voice, review days) replace the content in place with a back link. Routes: #/settings and #/settings/<section>
// where section is `assistant` (the top group) or `key` (the own-key page).
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Button, IconButton } from '../components/button.js';
import { radioGroup } from '../onboarding/radio.js';
import { voiceRows, PREVIEW_TEXT } from '../onboarding/voices.js';
import { reviewDays } from '../../core/review.js';
import { showOnboarding } from '../onboarding/onboarding.js';
import { renderOwnKey } from './ownKey.js';
import { exportAll, importFile, deleteAll } from './data.js';
import { llmRow, embedRow, keyRow, assistantFoot, listenLabel, daysLabel } from './status.js';

const THEMES = [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
const LISTEN = [
  { value: 'whisper', label: 'On this phone', sub: 'Private, one download of about 60 MB' },
  { value: 'browser', label: "Phone's speech service", sub: 'No download; audio goes to Apple or Google' },
  { value: 'typing', label: 'Typing only', sub: 'The microphone stays off' },
];
export const APP_VERSION = '2.0.0';

// Applies the saved theme to the page (`system` follows the phone). Exported so the shell can call it at start.
export function applyTheme(theme, root = globalThis.document?.documentElement) {
  if (!root) return;
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}

const synth = () => (typeof globalThis.speechSynthesis === 'object' ? globalThis.speechSynthesis : null);

// Returns a cleanup function. params: { section }.
export function renderSettings(root, ctx, params = {}) {
  let view = params?.section === 'key' ? 'key' : 'main';
  let dataMessage = null; // { text, tone: 'ok'|'error' }
  let confirmDelete = false;
  let stopVoices = null;
  let scrollTop = 0;

  const settings = () => ctx.settings.getSettings();
  const status = () => ctx.brain.getStatus();
  const ai = () => (settings()['ai.provider'] === 'openai' ? 'OpenAI-compatible' : 'Anthropic');

  // ---- building blocks -----------------------------------------------------------------------------------------

  function srow({ iconName, bg, label, sub, value, tone, trail, onClick, stack = false, labelId }) {
    const inner = [
      el('span', { class: `srow__icon ${bg}`, 'aria-hidden': 'true' }, icon(iconName)),
      el('span', { class: 'srow__text' }, [el('span', { class: 'srow__label', id: labelId }, label), sub ? el('span', { class: 'srow__sub' }, sub) : null]),
      value ? el('span', { class: `srow__value${tone ? ` srow__value--${tone}` : ''}` }, value) : null,
      trail ?? null,
    ];
    const cls = `srow${stack ? ' srow--stack' : ''}${onClick ? ' srow--btn' : ''}`;
    return onClick ? el('button', { type: 'button', class: cls, onclick: onClick }, inner) : el('div', { class: cls }, inner);
  }

  const chevron = () => icon('right');
  const group = (rows) => el('div', { class: 'group' }, rows.filter(Boolean));
  const label = (t) => el('h2', { class: 'glabel' }, t);
  const foot = (t) => (t ? el('p', { class: 'gfoot' }, t) : null);

  function bar(pct, name) {
    const b = el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': name }, el('span', {}));
    b.style.setProperty('--p', String(pct));
    return b;
  }

  function page(title, backLabel, onBack, content) {
    const scroll = el('section', { class: 'scroll no-scrollbar' }, [el('h1', { class: 'large-title', tabindex: '-1' }, title), ...content.filter(Boolean)]);
    return [
      el('header', { class: 'navbar' }, [el('button', { type: 'button', class: 'navbar__back', onclick: onBack }, [icon('back'), backLabel])]),
      scroll,
    ];
  }

  // ---- model rows ----------------------------------------------------------------------------------------------

  function modelAction(row, { retry, download }) {
    if (row.action === 'download') return el('button', { type: 'button', class: 'mini-btn', onclick: download }, 'Download');
    if (row.action === 'cancel') return el('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Cancel download', onclick: () => ctx.brain.cancel() }, 'Cancel');
    if (row.action === 'retry') return el('button', { type: 'button', class: 'mini-btn', onclick: retry }, 'Try again');
    return null;
  }

  function assistantGroup() {
    const s = status();
    const l = llmRow(s);
    const e = embedRow(s);
    const k = keyRow(s, settings(), ai());
    const llmDownload = () => { ctx.settings.setSettings({ 'brain.llm_consent': 'yes', 'brain.embed_consent': 'yes' }); ctx.brain.prepare({ llm: true, embed: true }); };
    const embedDownload = () => { ctx.settings.setSettings({ 'brain.embed_consent': 'yes' }); ctx.brain.prepare({ llm: false, embed: true }); };
    const llm = srow({
      iconName: 'chip', bg: 'bg-iris', label: 'On-device assistant', sub: l.sub, tone: l.tone,
      trail: modelAction(l, { download: llmDownload, retry: () => ctx.brain.prepare({ llm: true, embed: false }) }),
      stack: l.pct !== null,
    });
    if (l.pct !== null) llm.append(bar(l.pct, 'Assistant download'));
    const emb = srow({
      iconName: 'search', bg: 'bg-teal', label: 'Search by meaning', sub: e.sub,
      value: e.tone === 'ok' ? icon('check') : null, tone: e.tone === 'ok' ? 'ok' : null,
      trail: modelAction(e, { download: embedDownload, retry: () => ctx.brain.prepare({ llm: false, embed: true }) }),
      stack: e.pct !== null,
    });
    if (e.pct !== null) emb.append(bar(e.pct, 'Search download'));
    const key = srow({
      iconName: 'key', bg: 'bg-grey', label: 'Your own key', sub: k.sub, value: k.value, tone: k.tone, trail: chevron(),
      onClick: () => { view = 'key'; draw(); },
    });
    return [label('Assistant'), group([llm, emb, key]), foot(assistantFoot(s))];
  }

  // ---- main page -----------------------------------------------------------------------------------------------

  function themeControl() {
    const current = settings().theme;
    const seg = el('div', { class: 'segsm', role: 'radiogroup', 'aria-label': 'Theme' }, THEMES.map(([value, name]) => el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(current === value),
      onclick: () => { ctx.settings.setSettings({ theme: value }); applyTheme(value); draw(); },
    }, name)));
    return seg;
  }

  function dataGroup() {
    const fileInput = el('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': 'Choose a Thought Catcher file to import' });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      const r = await importFile(ctx, file);
      dataMessage = { text: r.message, tone: r.ok ? 'ok' : 'error' };
      draw();
    });
    const readOnly = Boolean(ctx.store.migration?.readOnly);
    const rows = [
      srow({ iconName: 'share', bg: 'bg-teal', label: 'Export thoughts', sub: 'One file, no key inside', trail: chevron(), onClick: async () => {
        try {
          const r = await exportAll(ctx);
          dataMessage = { text: `Exported ${r.count} ${r.count === 1 ? 'thought' : 'thoughts'}. The file has no key in it.`, tone: 'ok' };
        } catch (err) { dataMessage = { text: `Could not export: ${err.message}`, tone: 'error' }; }
        draw();
      } }),
      srow({ iconName: 'download', bg: 'bg-green', label: 'Import', sub: readOnly ? 'Unavailable until your thoughts are updated' : 'Merge a Thought Catcher file', trail: chevron(), onClick: readOnly ? null : () => fileInput.click() }),
      srow({ iconName: 'trash', bg: 'bg-red', label: 'Delete everything', sub: 'Asks before it deletes', trail: chevron(), onClick: readOnly ? null : () => { confirmDelete = true; draw(); } }),
    ];
    const out = [label('Your data'), group(rows), fileInput];
    if (dataMessage) {
      out.push(dataMessage.tone === 'error'
        ? el('p', { class: 'field-error', role: 'alert' }, [icon('info'), dataMessage.text])
        : el('p', { class: 'status-line status-line--ok', role: 'status' }, dataMessage.text));
    }
    if (confirmDelete) {
      out.push(el('div', { class: 'confirm', role: 'alert' }, [
        el('p', {}, 'This removes every thought, every setting and your key from this phone. It cannot be undone.'),
        el('div', { class: 'formacts' }, [
          Button({ label: 'Cancel', kind: 'secondary', onClick: () => { confirmDelete = false; draw(); } }),
          Button({ label: 'Yes, delete everything', kind: 'danger', icon: 'trash', onClick: async () => {
            try {
              await deleteAll(ctx);
              applyTheme('system');
              dataMessage = { text: 'All data deleted from this phone.', tone: 'ok' };
            } catch (err) { dataMessage = { text: `Could not delete: ${err.message}`, tone: 'error' }; }
            confirmDelete = false;
            draw();
          } }),
        ]),
      ]));
    }
    return out;
  }

  function mainPage() {
    const s = settings();
    const voiceName = s['voice.name'];
    const content = [
      ...assistantGroup(),
      label('Voice'),
      group([
        srow({ iconName: 'mic', bg: 'bg-pink', label: 'Listening', value: listenLabel(s['speech.engine']), trail: chevron(), onClick: () => { view = 'listen'; draw(); } }),
        srow({ iconName: 'speaker', bg: 'bg-green', label: 'Reply voice', value: voiceName ?? 'Silent', trail: chevron(), onClick: () => { view = 'voice'; draw(); } }),
        srow({ iconName: 'reminder', bg: 'bg-amber', label: 'Daily review', value: daysLabel(reviewDays(s)), trail: chevron(), onClick: () => { view = 'days'; draw(); } }),
      ]),
      label('Appearance'),
      group([srow({ iconName: 'moon', bg: 'bg-iris', label: 'Theme', trail: themeControl() })]),
      ...dataGroup(),
      label('About'),
      group([
        srow({ iconName: 'info', bg: 'bg-grey', label: 'About Thought Catcher', sub: `Version ${APP_VERSION}`, trail: chevron(), onClick: () => ctx.nav.go('#/about') }),
        srow({ iconName: 'sparkles', bg: 'bg-iris', label: 'Show the welcome again', trail: chevron(), onClick: () => {
          showOnboarding(root, ctx, { onDone: () => { view = 'main'; draw(); } });
        } }),
      ]),
    ];
    return page('Settings', 'Assistant', () => ctx.nav.go('#/'), content);
  }

  // ---- sub-pages -----------------------------------------------------------------------------------------------

  function listenPage() {
    const group = radioGroup(LISTEN, {
      value: LISTEN.some((o) => o.value === settings()['speech.engine']) ? settings()['speech.engine'] : null, label: 'How I listen',
      onChange: (v) => { ctx.settings.setSettings({ 'speech.engine': v }); },
    });
    return page('Listening', 'Settings', () => { view = 'main'; draw(); }, [
      group.el,
      foot('Typing always works. The phone\'s speech service sends your recording to Apple or Google to turn it into text. The on-device choice downloads about 60 MB once and keeps your voice on this phone.'),
    ]);
  }

  function voicePage() {
    const box = el('div', { class: 'voicebox' });
    const s = synth();
    const paint = () => {
      const rows = voiceRows(s?.getVoices?.() ?? []);
      const items = [{ value: null, label: 'Silent', sub: 'Replies on screen only' }, ...rows.map((r) => ({
        value: r.name, label: r.name, sub: r.sub,
        extra: el('button', { type: 'button', class: 'mini-btn', 'aria-label': `Preview ${r.name}`, onclick: () => {
          s.cancel();
          const u = new globalThis.SpeechSynthesisUtterance(PREVIEW_TEXT);
          u.voice = r.voice;
          s.speak(u);
        } }, [icon('speaker', 'i--sm'), ' Play']),
      }))];
      const g = radioGroup(items, { value: settings()['voice.name'] ?? null, label: 'Reply voice', onChange: (v) => { ctx.settings.setSettings({ 'voice.name': v, 'voice.speak': Boolean(v) }); } });
      box.replaceChildren(g.el);
    };
    paint();
    if (s?.addEventListener) { s.addEventListener('voiceschanged', paint); stopVoices = () => s.removeEventListener('voiceschanged', paint); }
    return page('Reply voice', 'Settings', () => { s?.cancel(); view = 'main'; draw(); }, [
      box,
      foot(s ? 'Silent shows replies on screen only. A voice speaks each reply and the text stays on screen. Tap the orb while it speaks to stop it.' : 'This browser has no voices to choose from, so replies stay silent.'),
    ]);
  }

  function daysPage() {
    const n = reviewDays(settings());
    const set = (v) => { ctx.settings.setSettings({ 'review.days': v }); draw(); };
    const minus = IconButton({ name: 'x', label: 'One day fewer', onClick: () => set(n - 1) });
    minus.replaceChildren(el('span', { class: 'stepper__sign', 'aria-hidden': 'true' }, '−'));
    minus.disabled = n <= 1;
    const plus = IconButton({ name: 'plus', label: 'One day more', onClick: () => set(n + 1) });
    plus.disabled = n >= 30;
    return page('Daily review', 'Settings', () => { view = 'main'; draw(); }, [
      el('div', { class: 'group' }, el('div', { class: 'stepper' }, [
        el('div', {}, [el('div', { class: 'srow__sub' }, 'Bring ideas back after'), el('div', { class: 'stepper__value', role: 'status' }, daysLabel(n))]),
        el('div', { class: 'stepper__btns' }, [minus, plus]),
      ])),
      foot('Between 1 and 30 days. Reminders appear only when you open the app. There are no notifications.'),
    ]);
  }

  function keyPage() {
    return page('Your own key', 'Settings', () => { view = 'main'; draw(); }, [renderOwnKey(ctx, { onSaved: () => {} })]);
  }

  // ---- render --------------------------------------------------------------------------------------------------

  function draw() {
    stopVoices?.();
    stopVoices = null;
    const before = root.querySelector('.scroll');
    if (before) scrollTop = before.scrollTop;
    const build = { main: mainPage, key: keyPage, listen: listenPage, voice: voicePage, days: daysPage }[view] ?? mainPage;
    const parts = build();
    root.replaceChildren(...parts);
    const scroll = root.querySelector('.scroll');
    if (scroll) scroll.scrollTop = view === 'main' ? scrollTop : 0;
  }

  const onStatus = () => { if (view === 'main' && root.isConnected && !root.querySelector('.ob')) draw(); };
  ctx.brain.addEventListener?.('status', onStatus);
  draw();
  if (view === 'main') root.querySelector('h1')?.focus?.({ preventScroll: true });

  return () => {
    ctx.brain.removeEventListener?.('status', onStatus);
    stopVoices?.();
    synth()?.cancel();
  };
}
