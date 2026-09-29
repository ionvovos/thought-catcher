// Typing composer (design mockup composer-keyboard): a mic button to switch back, a text field, a send button.
// Enter sends, Shift+Enter is a new line. The field is a real <textarea> styled by css/conversation.css.
import { el } from '../dom.js';
import { icon } from '../icons.js';

export function createComposer({ onSend, onVoice, placeholder = 'Type a thought, or ask a question' }) {
  const field = el('textarea', { class: 'composer__input', rows: '1', placeholder, 'aria-label': 'Your thought', autocomplete: 'off', enterkeyhint: 'send' });
  const send = el('button', { type: 'button', class: 'dock__send', 'aria-label': 'Send', disabled: true, onclick: () => submit() }, icon('up'));
  const node = el('div', { class: 'composer' }, [
    el('button', { type: 'button', class: 'iconbtn iconbtn--filled', 'aria-label': 'Talk instead', onclick: () => onVoice() }, icon('mic')),
    el('label', { class: 'composer__field' }, [field, send]),
  ]);

  const grow = () => { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 120)}px`; };
  function submit() {
    const text = field.value.trim();
    if (!text) return;
    field.value = '';
    send.disabled = true;
    grow();
    onSend(text);
  }
  field.addEventListener('input', () => { send.disabled = !field.value.trim(); grow(); });
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  return { el: node, focus: () => field.focus(), value: () => field.value, setValue(v) { field.value = v; send.disabled = !v.trim(); grow(); } };
}
