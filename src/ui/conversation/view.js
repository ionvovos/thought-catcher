// Static view pieces of the assistant screen (design.md 2.x, section 3). Each function returns DOM built with el(); user text
// only ever reaches the page through text nodes.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { miniOrb } from '../orb/orb.js';
import { Reply } from '../components/chip.js';
import { typeMeta } from '../typeMeta.js';

export function greeting(now, firstRun) {
  if (firstRun) return "What's on your mind?";
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const timeLabel = (now) => `Today ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

// The two spoken examples of the first-run screen (design mockup assistant-first-run).
export function suggestions() {
  return el('div', { class: 'suggest', 'aria-label': 'Try saying' }, [
    el('div', { class: 'suggest__item' }, [icon('reminder'), '"Remind me to water the plants on Sunday"']),
    el('div', { class: 'suggest__item' }, [icon('idea'), '"Idea: a weekend bread-baking workshop"']),
  ]);
}

export function hintLine({ firstRun, engineRules, download, blocked }) {
  if (blocked) return el('p', { class: 'hint', role: 'status' }, blocked);
  if (download) return el('p', { class: 'hint', role: 'status' }, download);
  if (firstRun) return el('p', { class: 'hint' }, [el('strong', {}, 'Tap to talk.'), ' Hold for longer thoughts.']);
  if (engineRules) return el('p', { class: 'hint' }, el('strong', {}, 'Tap to talk.'));
  return el('p', { class: 'hint' }, [el('strong', {}, 'Tap to talk.'), ' Or ask: "What did I say about the gym?"']);
}

export function typeButton(onClick) {
  return el('div', { class: 'row-actions' }, el('button', { type: 'button', class: 'btn btn--secondary btn--pill', onclick: onClick }, [icon('keyboard'), 'Type']));
}

// The transcript while listening: settled words in tertiary text, the newest words normal, then a caret.
export function transcriptView(text) {
  const words = String(text ?? '').trim();
  const p = el('p', { class: 'transcript', 'aria-live': 'polite' });
  if (!words) { p.append(el('span', { class: 'caret' })); return p; }
  const cut = Math.max(0, words.lastIndexOf(' ', words.length - 1));
  const tail = words.split(/\s+/).slice(-4).join(' ');
  const head = words.slice(0, words.length - tail.length).trimEnd();
  p.append(...(head ? [el('span', { class: 'old' }, head), ' '] : []), tail, el('span', { class: 'caret' }));
  return p;
}

export function dueCard(thought, whenText, onDone) {
  return el('div', { class: 'due', role: 'group', 'aria-label': 'Due today' }, [
    el('span', { class: 'ticon t-reminder', 'aria-hidden': 'true' }, icon('reminder')),
    el('div', { class: 'due__text' }, [el('div', { class: 'due__label' }, whenText), el('div', { class: 'due__title' }, thought.title)]),
    el('button', { type: 'button', class: 'iconbtn', 'aria-label': `Mark done: ${thought.title}`, onclick: onDone }, icon('check')),
  ]);
}

const DOT_ORDER = ['idea', 'task', 'journal', 'reminder'];

// The library peek (design.md 2.4): grabber, "Library", the four type counts as coloured dots, search.
export function peek({ counts, total, onOpen }) {
  const dots = el('div', { class: 'typedots', role: 'group', 'aria-label': 'Thoughts by type' }, DOT_ORDER.map((t) => el('span', { class: typeMeta(t).cls, 'aria-label': `${counts[t] ?? 0} ${typeMeta(t).plural.toLowerCase()}` }, String(counts[t] ?? 0))));
  const sub = total === 0 ? el('div', { class: 'peek__sub' }, 'Nothing yet. Your first thought lands here.') : dots;
  const grabber = el('span', { class: 'grabber', role: 'button', tabindex: '0', 'aria-label': 'Open library', onclick: onOpen });
  grabber.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } });
  let startY = null;
  const section = el('section', { class: 'sheet sheet--peek', 'aria-label': 'Library' }, [
    grabber,
    el('div', { class: 'peek' }, [
      icon('stack'),
      el('div', { class: 'peek__text' }, [el('div', { class: 'peek__title' }, 'Library'), sub]),
      total === 0 ? null : el('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Search library', onclick: onOpen }, icon('search')),
    ]),
  ]);
  // Swipe up anywhere on the peek opens the library.
  section.addEventListener('pointerdown', (e) => { startY = e.clientY; });
  section.addEventListener('pointerup', (e) => { if (startY !== null && startY - e.clientY > 40) onOpen(); startY = null; });
  section.addEventListener('click', (e) => { if (!e.target.closest('button, .grabber')) onOpen(); });
  return section;
}

export function notice({ iconName, title, body, actions, tone = 'warn' }) {
  return el('div', { class: 'notice', role: 'status' }, [
    el('span', { class: `notice__icon${tone === 'info' ? ' notice__icon--info' : ''}` }, icon(iconName)),
    el('div', {}, [el('h2', {}, title), el('p', {}, body)]),
    el('div', { class: 'notice__actions' }, actions),
  ]);
}

// ---- thread entries ----

export function userMessage(text) {
  return el('div', { class: 'msg msg--user' }, text);
}

export function editControl(onEdit) {
  return el('button', { type: 'button', class: 'msg-edit', 'aria-label': 'Edit your message', onclick: onEdit }, [icon('pencil'), 'Edit']);
}

export function assistantMessage(bodyKids, { role = 'status', error = false } = {}) {
  return el('div', { class: `msg msg--assistant${error ? ' msg--error' : ''}`, role }, [miniOrb(), el('div', { class: 'msg__body' }, bodyKids)]);
}

export function thinkingMessage(text, byText) {
  return assistantMessage([el('p', { class: 'shimmer', role: 'status' }, text), byText ? el('div', { class: 'msg__meta' }, byText) : null]);
}

export function questionBlock(question, { count, onAnswer, onSkip }) {
  const lead = count > 1 ? `I found ${count === 2 ? 'two' : count === 3 ? 'three' : count === 4 ? 'four' : count} things. One question first.` : 'One quick question.';
  const chips = (question.chips ?? []).map((c, i) => Reply({ label: c, variant: i === 0 ? 'accent' : null, iconName: /pick a time/i.test(c) ? 'calendar' : i === 0 && /\d|morning|tonight|tomorrow|weekend/i.test(c) ? 'clock' : null, index: i, onClick: () => onAnswer(c) }));
  chips.push(Reply({ label: 'Skip', variant: 'quiet', index: chips.length, onClick: onSkip }));
  return [
    el('p', {}, lead),
    el('span', { class: 'qtag' }, [icon('question', 'i--sm'), '1 question']),
    el('p', {}, el('strong', {}, question.text)),
    el('div', { class: 'replies' }, chips),
  ];
}

export function errorMessage({ iconName, name, text, replies }) {
  return assistantMessage([
    el('span', { class: 'errmark' }, [icon(iconName, 'i--sm'), name]),
    el('p', {}, text),
    replies?.length ? el('div', { class: 'replies' }, replies.map((r, i) => Reply({ label: r.label, variant: i === 0 ? 'accent' : null, iconName: r.icon ?? null, index: i, onClick: r.onClick }))) : null,
  ], { role: 'alert', error: true });
}

export function dockView({ left, orbEl, right }) {
  return el('footer', { class: 'dock' }, [left, orbEl, right]);
}

export function dockButton(label, onClick, aria = null) {
  return el('button', { type: 'button', class: 'dock__done', 'aria-label': aria, onclick: onClick }, label);
}
