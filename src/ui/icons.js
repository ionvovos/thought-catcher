// Icon set (24x24 line icons) as shape lists; built with createElementNS so no markup string is ever parsed.
const SVG_NS = 'http://www.w3.org/2000/svg';

const SHAPES = {
  settings: [['path', { d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }], ['circle', { cx: '15', cy: '7', r: '2.2' }], ['circle', { cx: '9', cy: '17', r: '2.2' }]],
  keyboard: [['rect', { x: '2.5', y: '6', width: '19', height: '12', rx: '2.5' }], ['path', { d: 'M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8' }]],
  mic: [['rect', { x: '9', y: '3', width: '6', height: '11', rx: '3' }], ['path', { d: 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21' }]],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  x: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
  back: [['path', { d: 'M15 5l-7 7 7 7' }]],
  right: [['path', { d: 'M9 5l7 7-7 7' }]],
  down: [['path', { d: 'M6 9.5l6 6 6-6' }]],
  search: [['circle', { cx: '11', cy: '11', r: '6.5' }], ['path', { d: 'M16 16l4.5 4.5' }]],
  idea: [['path', { d: 'M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z' }]],
  task: [['circle', { cx: '12', cy: '12', r: '8.5' }], ['path', { d: 'M8.5 12.2l2.4 2.4 4.6-4.9' }]],
  journal: [['path', { d: 'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5v-14z' }], ['path', { d: 'M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6' }]],
  reminder: [['path', { d: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0' }]],
  sparkles: [['path', { d: 'M11 3l1.7 4.6L17.3 9.3l-4.6 1.7L11 15.6l-1.7-4.6L4.7 9.3l4.6-1.7L11 3zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z' }]],
  link: [['path', { d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' }]],
  pencil: [['path', { d: 'M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20zM13.5 7l3 3' }]],
  calendar: [['rect', { x: '3.5', y: '5', width: '17', height: '15', rx: '2.5' }], ['path', { d: 'M3.5 10h17M8 3v4M16 3v4' }]],
  lock: [['rect', { x: '5', y: '10.5', width: '14', height: '10', rx: '2.5' }], ['path', { d: 'M8 10.5V8a4 4 0 0 1 8 0v2.5' }]],
  shield: [['path', { d: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.3-7.5 9.5-4.3-1.2-7.5-5-7.5-9.5V6L12 3z' }], ['path', { d: 'M9 12l2 2 4-4' }]],
  wifioff: [['path', { d: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.4M12 20h.01M14.8 10.6A10 10 0 0 1 19 12.9M2 9.3a15 15 0 0 1 4.3-2.7M10.7 5.1A15 15 0 0 1 22 9.3' }]],
  chip: [['rect', { x: '6', y: '6', width: '12', height: '12', rx: '2' }], ['rect', { x: '9.5', y: '9.5', width: '5', height: '5', rx: '1' }], ['path', { d: 'M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3' }]],
  download: [['path', { d: 'M12 4v11M7 10.5l5 5 5-5M5 20h14' }]],
  up: [['path', { d: 'M12 19V5M6 11l6-6 6 6' }]],
  clock: [['circle', { cx: '12', cy: '12', r: '8.5' }], ['path', { d: 'M12 7.5V12l3 2' }]],
  undo: [['path', { d: 'M9 14L4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }]],
  trash: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7' }]],
  key: [['circle', { cx: '8', cy: '15', r: '4' }], ['path', { d: 'M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2' }]],
  speaker: [['path', { d: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5z' }], ['path', { d: 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11' }]],
  stack: [['path', { d: 'M12 3l9 4.5-9 4.5-9-4.5L12 3z' }], ['path', { d: 'M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5' }]],
  refresh: [['path', { d: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5' }]],
  pause: [['path', { d: 'M9 5.5v13M15 5.5v13' }]],
  info: [['circle', { cx: '12', cy: '12', r: '8.5' }], ['path', { d: 'M12 11v5M12 8h.01' }]],
  hash: [['path', { d: 'M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h15M4 15h15' }]],
  share: [['path', { d: 'M12 15V3M7 8l5-5 5 5M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13' }]],
  list: [['path', { d: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01' }]],
  question: [['circle', { cx: '12', cy: '12', r: '8.5' }], ['path', { d: 'M9.8 9.5a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 2-2.2 3.3M12 16.8h.01' }]],
  moon: [['path', { d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  more: [['circle', { cx: '5.5', cy: '12', r: '1.1' }], ['circle', { cx: '12', cy: '12', r: '1.1' }], ['circle', { cx: '18.5', cy: '12', r: '1.1' }]],
  micoff: [['path', { d: 'M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5.5 11a6.5 6.5 0 0 0 10.7 5M18.5 11a6.5 6.5 0 0 1-.4 2.2M12 17.5V21' }]],
};

export const ICON_NAMES = Object.freeze(Object.keys(SHAPES));

// icon('pencil', 'i--sm') returns <svg class="i i--sm" aria-hidden="true">. An unknown name throws, so a typo fails a test.
export function icon(name, cls = '') {
  const shapes = SHAPES[name];
  if (!shapes) throw new Error(`icon(): unknown icon "${name}"`);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls ? `i ${cls}` : 'i');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of shapes) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.appendChild(node);
  }
  return svg;
}

export const icons = icon;
