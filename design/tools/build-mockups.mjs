// Generates the static mockups in design/mockups/ and the contact sheet design/index.html.
// Run: node design/tools/build-mockups.mjs   (no dependencies, no network)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'mockups');
mkdirSync(out, { recursive: true });

const P = {
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  idea: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  task: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.9"/>',
  journal: '<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5v-14z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6"/>',
  reminder: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0"/>',
  sparkles: '<path d="M11 3l1.7 4.6L17.3 9.3l-4.6 1.7L11 15.6l-1.7-4.6L4.7 9.3l4.6-1.7L11 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20zM13.5 7l3 3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6L12 3z"/><path d="M9 12l2 2 4-4"/>',
  wifioff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M12 20h.01M14.8 10.6A10 10 0 0 1 19 12.9M2 9.3a15 15 0 0 1 4.3-2.7M10.7 5.1A15 15 0 0 1 22 9.3"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  stack: '<path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z"/><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  hash: '<path d="M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h15M4 15h15"/>',
  share: '<path d="M12 15V3M7 8l5-5 5 5M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.8 9.5a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.3M12 16.8h.01"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5.5" cy="12" r="1.1"/><circle cx="12" cy="12" r="1.1"/><circle cx="18.5" cy="12" r="1.1"/>',
  micoff: '<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.7 5M18.5 11a6.5 6.5 0 0 1-.4 2.2M12 17.5V21"/>',
};
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
const TYPE = { idea: 'Idea', task: 'Task', journal: 'Journal', reminder: 'Reminder' };
const orb = (state = 'idle', cls = '', level = 0, label = 'Tap to talk') =>
  `<button class="orb ${cls}" data-state="${state}" style="--level:${level}" aria-label="${label}">
    <span class="orb__halo"></span><span class="orb__level"></span><span class="orb__ring"></span><span class="orb__ring"></span><span class="orb__ring"></span>
    <span class="orb__spinner"></span>
    <span class="orb__core"><span class="orb__swirl"><span class="orb__blob"></span><span class="orb__blob"></span><span class="orb__blob"></span><span class="orb__blob"></span></span><span class="orb__gloss"></span></span>
  </button>`;
const mini = `<span class="orb orb--mini" data-state="idle" aria-hidden="true"><span class="orb__core"><span class="orb__swirl"><span class="orb__blob"></span><span class="orb__blob"></span><span class="orb__blob"></span><span class="orb__blob"></span></span></span></span>`;
const badge = (t, btn = false) => `<${btn ? 'button' : 'span'} class="badge t-${t}${btn ? ' badge--btn' : ''}"${btn ? ` aria-label="Type: ${TYPE[t]}. Change type"` : ''}>${ic(t)}${TYPE[t]}${btn ? ic('down', 'i--sm') : ''}</${btn ? 'button' : 'span'}>`;
const ticon = t => `<span class="ticon t-${t}" aria-hidden="true">${ic(t)}</span>`;
const tcard = (t, title, snip, when, o = {}) => `<button class="tcard t-${t}${o.done ? ' tcard--done' : ''}">${ticon(t)}<p class="tcard__title">${title}</p><span class="tcard__when${o.due ? ' tcard__when--due' : ''}">${when}</span>${snip ? `<p class="tcard__snip">${snip}</p>` : ''}${o.tags ? `<span class="tags">${o.tags.map(g => `<span class="tag">#${g}</span>`).join('')}</span>` : ''}${o.why ? `<span class="rel-why">${ic('link')}${o.why}</span>` : ''}</button>`;
const topbar = (left, right = `<button class="iconbtn" aria-label="Settings">${ic('settings')}</button>`) => `<header class="topbar">${left}${right}</header>`;
const pillOk = `<button class="pill" aria-label="Assistant runs on this phone. Open settings"><span class="pill__dot"></span>On this phone</button>`;
const dock = (state = 'idle', right = `<button class="dock__done">Done</button>`) =>
  `<footer class="dock"><button class="iconbtn iconbtn--filled" aria-label="Type instead">${ic('keyboard')}</button>${orb(state, 'orb--dock', 0, state === 'thinking' ? 'Thinking. Tap to stop' : 'Tap to talk')}${right}</footer>`;
const peek = `<section class="sheet sheet--peek" aria-label="Library"><span class="grabber" role="button" aria-label="Open library"></span>
  <div class="peek">${ic('stack')}<div class="peek__text"><div class="peek__title">Library</div><div class="typedots"><span class="t-idea">8</span><span class="t-task">6</span><span class="t-journal">6</span><span class="t-reminder">4</span></div></div><button class="iconbtn" aria-label="Search library">${ic('search')}</button></div></section>`;

const page = (name, title, body, cls = '') => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Thought Catcher mockup: ${title}</title>
<link rel="icon" href="../icons/icon-192.png">
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../components.css">
</head>
<body>
<main class="app ${cls}" data-screen="${name}">
${body}
</main>
</body>
</html>
`;

const screens = [];
const add = (name, title, state, body, cls) => screens.push({ name, title, state, html: page(name, title, body, cls) });

// ---------- Onboarding (X9) ----------
add('onboarding-1', 'Onboarding 1: what it does', 'first run', `
<button class="btn btn--plain skip">Skip</button>
<section class="ob">
  <div class="ob__art">${orb('speaking', '', .3, 'Assistant')}</div>
  <div class="ob__copy">
    <h1>Say it.<br>I'll sort it.</h1>
    <p>Speak a to-do, an idea, a reminder or a long ramble. I split it into thoughts, file each one, and ask a question only when I need to.</p>
  </div>
  <div class="ob__foot"><div class="pager" aria-label="Page 1 of 3"><span class="on"></span><span></span><span></span></div><button class="btn btn--primary btn--lg">Continue</button></div>
</section>`);

add('onboarding-2', 'Onboarding 2: privacy', 'first run', `
<button class="btn btn--plain skip">Skip</button>
<section class="ob">
  <div class="ob__art"><div class="shield-art">${ic('lock')}</div></div>
  <div class="ob__copy">
    <h1>Stays on your phone</h1>
    <ul class="plist">
      <li><span class="ticon notice__icon--info">${ic('chip')}</span><span><strong>The assistant runs here</strong>A small model downloads once and then works offline.</span></li>
      <li><span class="ticon notice__icon--info">${ic('shield')}</span><span><strong>No account</strong>Your thoughts are saved on this device. Export them any time.</span></li>
      <li><span class="ticon notice__icon--info">${ic('key')}</span><span><strong>Your own key is optional</strong>Add one later for sharper answers; only the text you file is sent.</span></li>
    </ul>
  </div>
  <div class="ob__foot"><div class="pager" aria-label="Page 2 of 3"><span></span><span class="on"></span><span></span></div><button class="btn btn--primary btn--lg">Continue</button></div>
</section>`);

add('onboarding-3', 'Onboarding 3: voice choice', 'first run', `
<section class="ob" style="padding-top:var(--sp-8)">
  <div class="ob__copy">
    <h1>How should I listen?</h1>
    <p>You can change this in Settings.</p>
    <div class="choices" role="radiogroup" aria-label="Listening">
      <button class="choice" role="radio" aria-checked="true"><span class="ticon notice__icon--info">${ic('chip')}</span><span><span class="choice__t">On this phone</span><span class="choice__s">Private and offline. One download, about 40 MB.</span></span><span class="radio"></span></button>
      <button class="choice" role="radio" aria-checked="false"><span class="ticon notice__icon--info">${ic('mic')}</span><span><span class="choice__t">Phone's speech service</span><span class="choice__s">No download. Audio goes to Apple or Google.</span></span><span class="radio"></span></button>
      <button class="choice" role="radio" aria-checked="false"><span class="ticon notice__icon--info">${ic('keyboard')}</span><span><span class="choice__t">I'll type</span><span class="choice__s">The microphone stays off.</span></span><span class="radio"></span></button>
    </div>
    <div class="inline-toggle"><span>Speak replies aloud</span><button class="toggle" role="switch" aria-checked="true" aria-label="Speak replies aloud"></button></div>
  </div>
  <div class="ob__foot" style="margin-top:auto"><div class="pager" aria-label="Page 3 of 3"><span></span><span></span><span class="on"></span></div><button class="btn btn--primary btn--lg">Start</button></div>
</section>`);

// ---------- Assistant ----------
add('assistant-first-run', 'Assistant: first run, empty, model loading', 'first run + empty + loading model', `
${topbar(`<button class="pill" aria-label="Setting up the assistant, 44 percent"><span class="pill__ring" style="--p:44"></span>Setting up 44%</button>`)}
<section class="stage">
  <h1 class="greeting">What's on your mind?</h1>
  ${orb('idle', '', 0)}
  <p class="hint"><strong>Tap to talk.</strong> Hold for longer thoughts.</p>
  <div class="suggest" aria-label="Try saying">
    <div class="suggest__item">${ic('reminder')}"Remind me to water the plants on Sunday"</div>
    <div class="suggest__item">${ic('idea')}"Idea: a weekend bread-baking workshop"</div>
  </div>
</section>
<div class="strip">${ic('info')}Until setup finishes I file with simple rules. Nothing is lost.</div>
<section class="sheet sheet--peek" aria-label="Library"><span class="grabber" role="button" aria-label="Open library"></span>
  <div class="peek">${ic('stack')}<div class="peek__text"><div class="peek__title">Library</div><div class="peek__sub">Nothing yet. Your first thought lands here.</div></div></div></section>`);

add('assistant-idle', 'Assistant: idle', 'idle', `
${topbar(pillOk)}
<section class="stage">
  <h1 class="greeting">Good afternoon</h1>
  ${orb('idle', '', 0)}
  <p class="hint"><strong>Tap to talk.</strong> Or ask: "What did I say about the gym?"</p>
  <div class="row-actions"><button class="btn btn--secondary btn--pill">${ic('keyboard')}Type</button></div>
</section>
<div class="due" role="group" aria-label="Due today">${ticon('reminder')}<div class="due__text"><div class="due__label">Due today, 18:00</div><div class="due__title">Pick up the dry cleaning</div></div><button class="iconbtn" aria-label="Mark done">${ic('check')}</button></div>
${peek}`);

add('assistant-listening', 'Assistant: listening', 'listening', `
<header class="topbar"><button class="iconbtn" aria-label="Cancel">${ic('x')}</button><span class="topbar__center">Listening</span><button class="iconbtn" aria-label="Type instead">${ic('keyboard')}</button></header>
<section class="stage">
  ${orb('listening', '', .55, 'Listening. Tap to finish')}
  <p class="transcript" aria-live="polite"><span class="old">Okay so tomorrow I need to call the dentist about the crown, and</span> book the car service before the tenth<span class="caret"></span></p>
</section>
<footer class="dock" style="grid-template-columns:1fr"><p class="hint">Tap the orb when you're done</p></footer>`);

const ramble = `<div class="msg msg--user">Okay so tomorrow I need to call the dentist about the crown, and book the car service before the tenth. Also send Maria the photos from Sunday. Oh, and an idea: a grocery list that learns what we run out of.</div>`;

add('assistant-thinking', 'Assistant: thinking', 'thinking', `
${topbar(pillOk)}
<section class="thread">
  <span class="msg-time">Today 14:32</span>
  ${ramble}
  <div class="msg msg--assistant">${mini}<div class="msg__body"><p class="shimmer" role="status">Sorting your thoughts</p><div class="msg__meta">On this phone</div></div></div>
</section>
${dock('thinking', `<button class="dock__done" aria-label="Stop">Stop</button>`)}`);

add('assistant-question', 'Assistant: one question with quick replies', 'question', `
${topbar(pillOk)}
<section class="thread">
  <span class="msg-time">Today 14:32</span>
  ${ramble}
  <div class="msg msg--assistant">${mini}<div class="msg__body">
    <p>I found four things. One question first.</p>
    <span class="qtag">${ic('question', 'i--sm')}1 question</span>
    <p><strong>When should I remind you to call the dentist?</strong></p>
    <div class="replies">
      <button class="reply reply--accent" style="--i:0">${ic('clock', 'i--sm')}Tomorrow 9:00</button>
      <button class="reply" style="--i:1">Tomorrow 14:00</button>
      <button class="reply" style="--i:2">${ic('calendar', 'i--sm')}Pick a time</button>
      <button class="reply reply--quiet" style="--i:3">Skip</button>
    </div>
  </div></div>
</section>
${dock('idle')}`);

const fitem = (t, title, meta, i) => `<div class="fitem" style="--i:${i}">${ticon(t)}<div class="fitem__main"><p class="fitem__title">${title}</p><div class="fitem__meta">${badge(t, true)}${meta}</div></div><button class="iconbtn" aria-label="Edit ${title}">${ic('pencil')}</button></div>`;
const dchip = (txt) => `<button class="chipdate" aria-label="Change date: ${txt}">${ic('calendar')}${txt}</button>`;
add('assistant-filed', 'Assistant: four thoughts filed from one ramble', 'filed', `
${topbar(pillOk)}
<section class="thread">
  <div class="msg msg--user" style="animation:none">…a grocery list that learns what we run out of.</div>
  <div class="msg msg--assistant">${mini}<div class="msg__body"><p>Done. Four thoughts, filed.</p>
    <div class="filed" role="group" aria-label="Filed thoughts">
      <div class="filed__head"><span class="filed__title">${ic('check')}Filed 4</span><button class="btn btn--plain" style="min-height:36px">Undo all</button></div>
      ${fitem('reminder', 'Call the dentist about the crown', dchip('Tomorrow 9:00'), 0)}
      ${fitem('task', 'Book the car service', dchip('By Sat 10 Oct'), 1)}
      ${fitem('task', 'Send Maria the photos from Sunday', '', 2)}
      ${fitem('idea', 'Grocery list that learns what runs out', '', 3)}
    </div>
  </div></div>
</section>
${dock('idle')}`);

// ---------- Library (X4) ----------
const libHead = (count) => `<span class="grabber" role="button" aria-label="Resize library"></span><div class="sheet__head"><h2 class="sheet__title">Library<span class="sheet__count">${count}</span></h2><button class="iconbtn" aria-label="Close library">${ic('x')}</button></div>`;
const chips = (sel = 'all', counts = { all: 24, idea: 8, task: 6, journal: 6, reminder: 4 }) => `<div class="chips no-scrollbar" role="toolbar" aria-label="Filter by type">
  <button class="chip" aria-pressed="${sel === 'all'}">All <span class="n">${counts.all}</span></button>
  ${['reminder', 'task', 'idea', 'journal'].map(t => `<button class="chip t-${t}" aria-pressed="${sel === t}"><span class="dot"></span>${TYPE[t]}s <span class="n">${counts[t]}</span></button>`).join('')}</div>`;
const idleBehind = `${topbar(pillOk)}<section class="stage"><h1 class="greeting">Good afternoon</h1>${orb('idle', '', 0)}<p class="hint"><strong>Tap to talk.</strong></p></section>`;

add('library-half', 'Library: half sheet', 'library half', `
${idleBehind}
<div class="scrim"></div>
<section class="sheet sheet--half" aria-label="Library" role="dialog">
  ${libHead(24)}
  <div class="searchrow"><label class="search">${ic('search')}<input placeholder="Search or ask" aria-label="Search thoughts"></label></div>
  ${chips('all')}
  <div class="sheet__body no-scrollbar">
    <div class="group-h t-reminder">${ic('reminder')}Reminders <span class="n">4</span></div>
    <div class="cards">
      ${tcard('reminder', 'Pick up the dry cleaning', '', 'Today 18:00', { due: true })}
      ${tcard('reminder', 'Call the dentist about the crown', '', 'Tomorrow 9:00')}
    </div>
    <div class="group-h t-task">${ic('task')}Tasks <span class="n">6</span></div>
    <div class="cards">
      ${tcard('task', 'Book the car service', 'Before the 10th, ask about the rear brakes too.', 'Sat 10 Oct', { tags: ['car'] })}
      ${tcard('task', 'Send Maria the photos from Sunday', '', 'Today')}
    </div>
  </div>
</section>`);

add('library-full-search', 'Library: full sheet, search', 'library full + search', `
${idleBehind}
<div class="scrim"></div>
<section class="sheet sheet--full" aria-label="Library" role="dialog">
  <span class="grabber" role="button" aria-label="Resize library"></span>
  <div class="searchrow" style="padding-top:6px"><label class="search">${ic('search')}<input value="gym" aria-label="Search thoughts"><button class="clear" aria-label="Clear search"><span>${ic('x')}</span></button></label><button class="btn btn--plain">Cancel</button></div>
  ${chips('all', { all: 5, idea: 1, task: 1, journal: 2, reminder: 1 })}
  <div class="sheet__body no-scrollbar">
    <p class="results-h">5 thoughts, by meaning and words</p>
    <div class="cards">
      ${tcard('idea', 'Gym plan: three short sessions instead of two long ones', 'Mon, Wed, Fri, 35 minutes each. Easier to keep than two long <mark>gym</mark> days.', '3 days ago', { tags: ['fitness'] })}
      ${tcard('task', 'Renew <mark>gym</mark> membership', 'Runs out on 12 October. Ask about the off-peak price.', 'Due 12 Oct')}
      ${tcard('reminder', 'Pack <mark>gym</mark> bag the night before', '', 'Weekdays 21:30')}
      ${tcard('journal', 'Good run by the sea this morning', '6 km without stopping. Felt easier than the treadmill at the <mark>gym</mark>.', 'Sun 27 Sep')}
      ${tcard('journal', 'Slept badly, too much coffee after 4', 'Skipped training. Pattern: late coffee, bad sleep, no workout.', 'Thu 24 Sep')}
    </div>
  </div>
</section>`);

// ---------- Detail (X6, X7) ----------
add('thought-detail', 'Thought detail: related and plan', 'detail', `
<header class="navbar"><button class="navbar__back">${ic('back')}Library</button><div><button class="iconbtn" aria-label="Share">${ic('share')}</button><button class="iconbtn" aria-label="More">${ic('more')}</button></div></header>
<section class="scroll no-scrollbar">
  ${badge('idea', true)}
  <h1 class="d-title">Gym plan: three short sessions instead of two long ones</h1>
  <div class="d-meta"><span>Spoken, Sat 26 Sep</span><span aria-hidden="true">·</span><span>#fitness</span></div>
  <p class="d-body">Mon, Wed, Fri, 35 minutes each. Easier to keep than two long days, and it fits before work.</p>
  <div class="section-h"><h2>${ic('sparkles')}Plan</h2><button class="mini-btn">${'Regenerate'}</button></div>
  <div class="seg" role="tablist"><button role="tab" aria-selected="true">Next steps</button><button role="tab" aria-selected="false">Questions</button><button role="tab" aria-selected="false">Outline</button></div>
  <div class="panel"><ul class="steps">
    <li class="step step--done"><span class="check check--on" role="checkbox" aria-checked="true" aria-label="Done">${ic('check')}</span><span class="step__text">Check the gym's opening hours before 8:00</span></li>
    <li class="step"><span class="check" role="checkbox" aria-checked="false" aria-label="Not done"></span><span class="step__text">Pick three 35-minute routines, one per day</span></li>
    <li class="step"><span class="check" role="checkbox" aria-checked="false" aria-label="Not done"></span><span class="step__text">Block Mon, Wed, Fri 7:15 in the calendar</span></li>
    <li class="step"><span class="check" role="checkbox" aria-checked="false" aria-label="Not done"></span><span class="step__text">Review after two weeks: kept all six?</span></li>
  </ul><div class="gen-note">${ic('chip', 'i--sm')}Made on this phone</div></div>
  <div class="section-h"><h2>${ic('link')}Related</h2></div>
  <div class="topic">${ic('hash')}<div><strong>Fitness</strong><span>Topic: 5 thoughts in 3 weeks</span></div></div>
  <div class="cards">
    ${tcard('task', 'Renew gym membership', '', 'Due 12 Oct', { why: 'Same gym' })}
    ${tcard('journal', 'Slept badly, too much coffee after 4', '', 'Thu 24 Sep', { why: 'Missed training' })}
  </div>
</section>`);

// ---------- Ask (X5) ----------
const src = (n, t, title, when) => `<button class="src t-${t}"><span class="cite">${n}</span>${ticon(t)}<span><span class="src__title">${title}</span><span class="src__when">${TYPE[t]} · ${when}</span></span></button>`;
add('ask-answer', 'Ask your thoughts: answer with sources', 'ask', `
${topbar(pillOk)}
<section class="thread">
  <span class="msg-time">Today 14:40</span>
  <div class="msg msg--user">What did I say about the gym?</div>
  <div class="msg msg--assistant">${mini}<div class="msg__body">
    <p>You want to swap two long sessions for three short ones<span class="cite">1</span>, and the membership runs out on 12 October<span class="cite">2</span>. On Sunday you wrote that running by the sea felt easier than the treadmill<span class="cite">3</span>.</p>
    <div class="sources" aria-label="Sources">
      ${src(1, 'idea', 'Gym plan: three short sessions', 'Sat 26 Sep')}
      ${src(2, 'task', 'Renew gym membership', 'due 12 Oct')}
      ${src(3, 'journal', 'Good run by the sea this morning', 'Sun 27 Sep')}
    </div>
    <div class="provenance">${ic('lock')}From 3 of your 24 thoughts. Searched on this phone.</div>
    <div class="replies"><button class="reply" style="--i:0">${ic('sparkles', 'i--sm')}Make a plan</button><button class="reply" style="--i:1">Remind me on 10 Oct</button></div>
  </div></div>
</section>
${dock('idle')}`);

// ---------- Daily review (X8) ----------
add('daily-review', 'Daily review with undo toast', 'review + toast', `
${topbar(pillOk, `<button class="iconbtn" aria-label="Close review">${ic('x')}</button>`)}
<section class="scroll no-scrollbar" style="padding:0 0 var(--safe-bottom)">
  <article class="review" aria-label="Daily review">
    <div class="review__eyebrow">Tuesday 29 September</div>
    <h1>Your quiet minute</h1>
    <p class="review__lede">One reminder due, two ideas waiting. Yesterday you filed six thoughts.</p>
    <div class="progress-dots" aria-label="1 of 3 reviewed"><span class="on"></span><span></span><span></span></div>
    <div class="ritem" style="margin-top:var(--sp-4)">${ticon('idea')}<div><p class="ritem__title">Weekend bread-baking workshop</p><p class="ritem__sub">Idea from 4 days ago, untouched</p></div>
      <div class="ritem__acts"><button class="btn btn--tinted">${ic('sparkles', 'i--sm')}Plan it</button><button class="btn btn--secondary">Keep</button><button class="btn btn--secondary">Let go</button></div></div>
    <div class="ritem">${ticon('idea')}<div><p class="ritem__title">Grocery list that learns what runs out</p><p class="ritem__sub">Idea from yesterday</p></div>
      <div class="ritem__acts"><button class="btn btn--tinted">${ic('sparkles', 'i--sm')}Plan it</button><button class="btn btn--secondary">Keep</button><button class="btn btn--secondary">Let go</button></div></div>
    <button class="btn btn--primary btn--lg" style="margin-top:var(--sp-4)">Finish review</button>
  </article>
</section>
<div class="toast" role="status">Dry cleaning moved to tomorrow<button class="btn">Undo</button></div>`);

// ---------- Settings ----------
const srow = (icon, bg, label, sub, trail) => `<div class="srow"><span class="srow__icon ${bg}">${ic(icon)}</span><span class="srow__text"><span class="srow__label">${label}</span>${sub ? `<span class="srow__sub">${sub}</span>` : ''}</span>${trail}</div>`;
add('settings-model-downloading', 'Settings: on-device model downloading', 'loading model', `
<header class="navbar"><button class="navbar__back">${ic('back')}Assistant</button></header>
<section class="scroll no-scrollbar">
  <h1 class="large-title">Settings</h1>
  <h2 class="glabel">Assistant</h2>
  <div class="group">
    <div class="srow srow--stack"><span class="srow__icon bg-iris">${ic('chip')}</span><span class="srow__text"><span class="srow__label">On-device assistant</span><span class="srow__sub">Downloading, 212 of 480 MB. About 2 min on Wi-Fi.</span></span><button class="mini-btn" aria-label="Pause download">Pause</button>
      <div class="bar" style="--p:44;margin-left:42px" role="progressbar" aria-valuenow="44" aria-valuemin="0" aria-valuemax="100" aria-label="Model download"><span></span></div></div>
    ${srow('search', 'bg-teal', 'Search by meaning', 'Ready, 23 MB', `<span class="srow__value" style="color:var(--c-success)">${ic('check')}</span>`)}
    ${srow('key', 'bg-grey', 'Your own key', 'Optional. Sharper answers, uses the internet.', `<span class="srow__value">Off</span>${ic('right')}`)}
  </div>
  <p class="gfoot">Until the download finishes, thoughts are filed with simple rules and upgraded afterwards.</p>
  <h2 class="glabel">Voice</h2>
  <div class="group">
    ${srow('mic', 'bg-pink', 'Listening', '', `<span class="srow__value">On this phone</span>${ic('right')}`)}
    ${srow('speaker', 'bg-green', 'Speak replies', '', `<button class="toggle" role="switch" aria-checked="true" aria-label="Speak replies"></button>`)}
    ${srow('reminder', 'bg-amber', 'Daily review', '', `<span class="srow__value">9:00</span>${ic('right')}`)}
  </div>
  <h2 class="glabel">Appearance</h2>
  <div class="group">${srow('moon', 'bg-iris', 'Theme', '', `<div class="segsm" role="tablist"><button aria-selected="true">Auto</button><button aria-selected="false">Light</button><button aria-selected="false">Dark</button></div>`)}</div>
  <h2 class="glabel">Your data</h2>
  <div class="group">
    ${srow('share', 'bg-teal', 'Export thoughts', '', ic('right'))}
    ${srow('download', 'bg-green', 'Import', '', ic('right'))}
    ${srow('trash', 'bg-red', 'Delete everything', '', ic('right'))}
  </div>
  <h2 class="glabel">About</h2>
  <div class="group">${srow('info', 'bg-grey', 'About Thought Catcher', 'Version 2.0.0', ic('right'))}</div>
</section>`);

// ---------- Error + offline ----------
add('error-offline', 'Offline and a microphone error', 'offline + error', `
${topbar(`<button class="pill pill--off" aria-label="Offline"><span class="pill__dot"></span>Offline</button>`)}
<div class="strip">${ic('wifioff')}Offline. The assistant still works on this phone; your key waits for the connection.</div>
<section class="thread">
  <div class="msg msg--user">Remind me to pick up the dry cleaning on Friday</div>
  <div class="msg msg--assistant">${mini}<div class="msg__body"><p>Filed as a reminder for Friday 18:00.</p>
    <div class="filed"><div class="fitem" style="--i:0">${ticon('reminder')}<div class="fitem__main"><p class="fitem__title">Pick up the dry cleaning</p><div class="fitem__meta">${badge('reminder', true)}${dchip('Fri 18:00')}</div></div><button class="iconbtn" aria-label="Edit">${ic('pencil')}</button></div></div></div></div>
  <div class="msg msg--assistant msg--error">${mini}<div class="msg__body"><span class="errmark">${ic('micoff', 'i--sm')}Microphone blocked</span><p>I couldn't hear you. The browser is blocking the microphone for this app.</p>
    <div class="replies"><button class="reply reply--accent" style="--i:0">How to allow it</button><button class="reply" style="--i:1">${ic('keyboard', 'i--sm')}Type instead</button></div></div></div>
</section>
${dock('idle')}`);

add('no-webgpu-fallback', 'Device cannot run the model: rules fallback', 'unsupported device', `
${topbar(`<button class="pill pill--warn" aria-label="Basic mode. Open settings"><span class="pill__dot"></span>Basic mode</button>`)}
<section class="stage">
  <h1 class="greeting">Good afternoon</h1>
  ${orb('basic', '', 0)}
  <p class="hint"><strong>Tap to talk.</strong> I'll file it with simple rules.</p>
</section>
<div style="padding:0 var(--gutter) var(--sp-3)"><div class="notice" role="status">
  <span class="notice__icon">${ic('chip')}</span>
  <div><h2>This phone can't run the assistant</h2><p>Types, dates and reminders still work. Questions, Ask and Plan need a newer browser or your own key.</p></div>
  <div class="notice__actions"><button class="btn btn--tinted">${ic('key', 'i--sm')}Add your own key</button><button class="btn btn--secondary">Got it</button></div>
</div></div>
${peek}`);

for (const s of screens) writeFileSync(join(out, `${s.name}.html`), s.html);

// Contact sheet
const sheet = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>Thought Catcher design</title>
<link rel="icon" href="icons/icon-192.png"><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="components.css">
<style>
 body{padding:32px var(--gutter) 64px;max-width:1280px;margin:0 auto}
 h1{font:var(--fw-bold) var(--fs-large)/var(--lh-large) var(--font-display);letter-spacing:var(--tracking-tight);margin:0 0 6px}
 .lede{color:var(--c-text-2);margin:0 0 28px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:24px}
 .shot{display:flex;flex-direction:column;gap:8px;text-decoration:none;color:inherit}
 .shot picture img{width:100%;aspect-ratio:390/844;object-fit:cover;border-radius:22px;box-shadow:var(--e-2);display:block;background:var(--c-surface)}
 .shot b{font-size:var(--fs-subhead)} .shot small{color:var(--c-text-3);font-size:var(--fs-footnote)}
 .shot a{color:var(--c-accent-text);font-size:var(--fs-footnote)}
 .types{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 28px}
</style></head><body>
<h1>Thought Catcher v2 design</h1>
<p class="lede">${screens.length} screens at 390 x 844. Tokens: <a href="tokens.css">tokens.css</a>. Spec: ais-os projects/thought-catcher/docs/design.md. Screenshots follow the system theme here.</p>
<div class="types">${['idea', 'task', 'journal', 'reminder'].map(t => badge(t)).join('')}</div>
<div class="grid">
${screens.map(s => `<div class="shot"><a href="mockups/${s.name}.html"><picture><source srcset="screens/${s.name}-390x844-dark.png" media="(prefers-color-scheme: dark)"><img src="screens/${s.name}-390x844-light.png" alt="${s.title}" loading="lazy"></picture></a><b>${s.title}</b><small>State: ${s.state} · <a href="mockups/${s.name}.html">open</a> · <a href="screens/${s.name}-390x844-light.png">light</a> · <a href="screens/${s.name}-390x844-dark.png">dark</a></small></div>`).join('\n')}
</div></body></html>`;
writeFileSync(join(root, 'index.html'), sheet);
writeFileSync(join(root, 'tools', 'screens.json'), JSON.stringify(screens.map(s => ({ name: s.name, title: s.title, state: s.state })), null, 1));
console.log(`wrote ${screens.length} mockups`);
