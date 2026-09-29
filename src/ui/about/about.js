// About (X10, AC-B4.2): the explanation, rendered from src/core/aboutText.js. Works offline; reached from Settings.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { aboutSections } from '../../core/aboutText.js';
import { APP_VERSION } from '../settings/settings.js';

function sectionBody(s) {
  const kids = [];
  for (const p of s.paragraphs ?? []) kids.push(el('p', { class: 'about-p' }, p));
  for (const g of s.groups ?? []) {
    kids.push(el('h3', { class: 'about-sub' }, g.label), el('ol', { class: 'steps-n' }, g.steps.map((t) => el('li', {}, t))));
  }
  for (const h of s.hosts ?? []) {
    kids.push(el('p', { class: 'about-p' }, [el('strong', {}, h.name), ' ', el('span', { class: 'srow__sub' }, h.host), h.why]));
  }
  if (s.link) {
    kids.push(el('a', { class: 'srow srow--btn', href: s.link.href, rel: 'noopener', target: '_blank' }, [
      el('span', { class: 'srow__icon bg-iris', 'aria-hidden': 'true' }, icon('link')),
      el('span', { class: 'srow__text' }, [el('span', { class: 'srow__label' }, 'Source code'), el('span', { class: 'srow__sub' }, s.link.text.replace(/^https?:\/\//, ''))]),
      icon('right'),
    ]));
  }
  return kids;
}

export function renderAbout(root, ctx) {
  const sections = aboutSections({ onDeviceSpeech: true });
  root.replaceChildren(
    el('header', { class: 'navbar' }, [el('button', { type: 'button', class: 'navbar__back', onclick: () => ctx.nav.go('#/settings') }, [icon('back'), 'Settings'])]),
    el('section', { class: 'scroll no-scrollbar' }, [
      el('div', { class: 'about-hero' }, [
        el('img', { src: './icons/icon-192.png', alt: '', width: '88', height: '88' }),
        el('h1', { tabindex: '-1' }, 'Thought Catcher'),
        el('p', {}, `Say a thought; it gets sorted into ideas, tasks, journal and reminders. Version ${APP_VERSION}.`),
      ]),
      ...sections.flatMap((s) => [el('h2', { class: 'glabel' }, s.heading), el('div', { class: 'group' }, sectionBody(s))]),
    ]),
  );
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}
