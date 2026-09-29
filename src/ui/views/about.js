// About page (M10): the one-page explanation, rendered from src/core/aboutText.js.
import { el } from '../dom.js';
import { aboutSections } from '../../core/aboutText.js';
import { FEATURES } from '../../features.js';

function block(section) {
  const kids = [el('h3', {}, section.heading)];
  for (const p of section.paragraphs ?? []) kids.push(el('p', {}, p));
  for (const g of section.groups ?? []) {
    kids.push(el('h4', {}, g.label), el('ol', {}, g.steps.map((s) => el('li', {}, s))));
  }
  if (section.link) {
    kids.push(el('p', {}, el('a', { href: section.link.href, rel: 'noopener', target: '_blank' }, section.link.text)));
  }
  return el('section', { class: 'section' }, kids);
}

export default async function renderAbout(root) {
  root.append(
    el('h2', {}, 'About Thought Catcher'),
    el('div', { class: 'prose' }, aboutSections(FEATURES).map(block)),
  );
}
