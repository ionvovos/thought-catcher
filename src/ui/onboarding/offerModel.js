// The consent card for the on-device assistant (architecture 5, offerModel). It appears as an assistant message after the
// first filed capture and never before the user's first tap (AC-X9.3). Nothing downloads until "Download" is pressed;
// the sizes come from brain.getStatus(). "Not now" keeps the app fully working on rules and leaves the offer in Settings.
import { el } from '../dom.js';
import { icon } from '../icons.js';
import { Button } from '../components/button.js';

const mb = (bytes, fallback) => `about ${Math.round((bytes ?? fallback) / 1e6)} MB`;

export function offerModel(ctx) {
  const card = el('div', { class: 'consent', role: 'group', 'aria-label': 'Download the assistant' });
  let dismissed = false;

  function fact(iconName, text) {
    return el('span', { class: 'by' }, [iconName ? icon(iconName) : null, text].filter(Boolean));
  }

  function download(status) {
    const withModel = status.llm.state === 'not-downloaded';
    ctx.settings.setSettings({ 'brain.llm_consent': withModel ? 'yes' : ctx.settings.getSettings()['brain.llm_consent'], 'brain.embed_consent': 'yes' });
    ctx.brain.prepare({ llm: withModel, embed: true });
  }

  function notNow() {
    dismissed = true;
    ctx.settings.setSettings({ 'brain.llm_consent': 'no', 'brain.embed_consent': 'no' });
    card.replaceChildren(el('p', { class: 'consent__later', role: 'status' }, 'No problem. I keep sorting with simple rules. You can set up the assistant any time in Settings.'));
    card.dispatchEvent(new CustomEvent('offer-dismissed', { bubbles: true }));
  }

  function draw() {
    if (dismissed) return;
    const s = ctx.brain.getStatus();
    const llm = s.llm.state;
    const canModel = llm !== 'not-supported';
    if (llm === 'downloading' || llm === 'loading' || s.embed.state === 'downloading') {
      const pct = Math.round(llm === 'downloading' || llm === 'loading' ? s.llm.pct ?? 0 : s.embed.pct ?? 0);
      card.replaceChildren(
        el('div', { class: 'consent__head' }, [el('span', { class: 'ticon notice__icon--info', 'aria-hidden': 'true' }, icon('chip')), el('h3', {}, 'Getting the assistant ready')]),
        el('p', { role: 'status' }, `${pct}% of ${mb(s.llm.bytes, 870000000)}. You can keep using the app.`),
        el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': 'Download progress' }, el('span', { class: 'bar__fill' })),
        el('div', { class: 'consent__acts' }, [Button({ label: 'Cancel', kind: 'secondary', onClick: () => ctx.brain.cancel() })]),
      );
      card.querySelector('.bar').style.setProperty('--p', String(pct));
      return;
    }
    if (llm === 'ready' && s.embed.state === 'ready') {
      card.replaceChildren(el('p', { class: 'consent__later', role: 'status' }, 'The assistant is ready. It runs on this phone.'));
      return;
    }
    if (llm !== 'not-downloaded' && s.embed.state !== 'not-downloaded') {
      // error, or a state with nothing to offer: Settings has the details
      card.replaceChildren(el('p', { class: 'consent__later', role: 'status' }, 'The assistant is not available right now. Settings has the details.'));
      return;
    }
    const size = canModel ? mb(s.llm.bytes, 870000000) : mb(s.embed.bytes, 29000000);
    card.replaceChildren(
      el('div', { class: 'consent__head' }, [
        el('span', { class: 'ticon notice__icon--info', 'aria-hidden': 'true' }, icon('chip')),
        el('h3', {}, canModel ? 'Want a smarter assistant?' : 'Want to search by meaning?'),
      ]),
      el('p', {}, canModel
        ? 'It splits long rambles, asks better questions and answers "what did I say about…". It runs on this phone; nothing is sent anywhere.'
        : 'Ask "what did I say about…" and find thoughts by meaning, not only by words. It runs on this phone; nothing is sent anywhere.'),
      el('div', { class: 'consent__facts' }, [fact('download', size), fact(null, 'Wi-Fi recommended'), fact('clock', 'once')]),
      el('div', { class: 'consent__acts' }, [
        Button({ label: 'Not now', kind: 'secondary', onClick: notNow }),
        Button({ label: 'Download', kind: 'primary', onClick: () => download(s) }),
      ]),
    );
  }

  ctx.brain.addEventListener?.('status', draw);
  draw();
  return card;
}
