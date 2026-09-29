// Conversation state machine (architecture section 4). Pure: transition(state, event) -> { state, effects }.
// The view renders from `state`; the shell runs `effects`. Nothing here reads the clock, the DOM or the brain.
//
// States: idle, listening, transcribing, thinking, asking, filed, error.
// Payload fields on the state: items (brain Items of the last capture), question, error, source, kind, speaking.

export const STATES = Object.freeze(['idle', 'listening', 'transcribing', 'thinking', 'asking', 'filed', 'error']);

export const initialState = () => ({ name: 'idle', items: [], question: null, error: null, source: 'typed', kind: null, speaking: false });

const fx = (type, extra = {}) => ({ type, ...extra });

// The first item, in spoken order, that carries a question (architecture 2.4); the others stay best guesses.
export function firstQuestion(items) {
  const index = (items ?? []).findIndex((i) => i?.question);
  return index < 0 ? null : { index, question: items[index].question };
}

const cleanText = (t) => String(t ?? '').trim();

export function transition(state, event) {
  const s = state ?? initialState();
  const stay = (patch = {}, effects = []) => ({ state: { ...s, ...patch }, effects });

  // Tapping the orb while a reply is spoken stops the voice and does nothing else (architecture section 4, "any").
  if (event.type === 'TAP_ORB' && s.speaking) return stay({ speaking: false }, [fx('stopSpeaking')]);
  if (event.type === 'SPEAK_START') return stay({ speaking: true });
  if (event.type === 'SPEAK_END') return stay({ speaking: false });

  switch (s.name) {
    case 'idle':
      if (event.type === 'TAP_ORB' || event.type === 'HOLD_START') return stay({ name: 'listening', error: null }, [fx('startSpeech', { hold: event.type === 'HOLD_START' })]);
      if (event.type === 'SEND_TEXT') return sendText(s, event.text, 'typed');
      return stay();

    case 'listening':
      if (event.type === 'TAP_ORB' || event.type === 'HOLD_END') return stay({ name: 'transcribing' }, [fx('stopSpeech')]);
      if (event.type === 'CANCEL') return stay({ name: 'idle' }, [fx('cancelSpeech')]);
      if (event.type === 'LEVEL') return stay({}, [fx('orbLevel', { rms: event.rms })]);
      if (event.type === 'SPEECH_ERROR') return stay({ name: 'error', error: event.code }, [fx('showError', { code: event.code })]);
      return stay();

    case 'transcribing':
      if (event.type === 'TRANSCRIPT') return sendText(s, event.text, 'voice', true);
      if (event.type === 'NOTHING_HEARD') return stay({ name: 'idle' }, [fx('toast', { text: 'Nothing heard' })]);
      if (event.type === 'SPEECH_ERROR') return stay({ name: 'error', error: event.code }, [fx('showError', { code: event.code })]);
      if (event.type === 'CANCEL') return stay({ name: 'idle' }, [fx('cancelSpeech')]);
      return stay();

    case 'thinking':
      if (event.type === 'INTENT') return intent(s, event);
      if (event.type === 'BRAIN_DONE') return done(s, event.items);
      if (event.type === 'BRAIN_ANSWER') return stay({ name: 'filed', kind: 'answer' }, [fx('showAnswer', { answer: event.answer })]);
      if (event.type === 'BRAIN_FAILED') return stay({ name: 'filed', kind: s.kind === 'answer' ? 'answer' : 'capture', error: event.error ?? null }, [fx('showStatus', { error: event.error ?? null }), fx('showReply', { items: s.items, failed: true })]);
      if (event.type === 'STOP') return stay({ name: s.items.length ? 'filed' : 'idle' }, [fx('cancelBrain'), ...(s.items.length ? [fx('showReply', { items: s.items, failed: true })] : [])]);
      if (event.type === 'DONE' || event.type === 'CLOSE') return stay({ name: 'idle', items: [], question: null }, [fx('cancelBrain'), fx('clearThread')]);
      return stay();

    case 'asking':
      if (event.type === 'ANSWER') return stay({ name: 'thinking', question: null }, [fx('brainAnswer', { index: s.question?.index ?? 0, question: s.question?.question ?? null, text: cleanText(event.text) })]);
      if (event.type === 'SKIP') return stay({ name: 'filed', question: null }, [fx('markSkipped', { index: s.question?.index ?? 0 })]);
      if (event.type === 'DONE' || event.type === 'CLOSE') return stay({ name: 'idle', items: [], question: null }, [fx('markUnresolved', { index: s.question?.index ?? 0 }), fx('clearThread')]);
      if (event.type === 'SEND_TEXT') return stay({}, [fx('answerByText', { text: cleanText(event.text) })]); // the typed reply answers the open question
      return stay();

    case 'filed':
      if (event.type === 'DONE' || event.type === 'CLOSE') return stay({ name: 'idle', items: [], question: null, kind: null }, [fx('clearThread')]);
      if (event.type === 'TAP_ORB' || event.type === 'HOLD_START') return stay({ name: 'listening', error: null, question: null }, [fx('startSpeech', { hold: event.type === 'HOLD_START' })]);
      if (event.type === 'SEND_TEXT') return sendText(s, event.text, 'typed');
      if (event.type === 'REFILED') return stay({ items: event.items ?? s.items });
      return stay();

    case 'error':
      if (event.type === 'TAP_ORB') return stay({ name: 'listening', error: null }, [fx('startSpeech', { hold: false })]);
      if (event.type === 'DONE' || event.type === 'CLOSE') return stay({ name: 'idle', error: null, items: [], question: null }, [fx('clearThread')]);
      if (event.type === 'SEND_TEXT') return sendText(s, event.text, 'typed');
      return stay();

    default:
      return stay();
  }
}

// A typed or transcribed message. The user's bubble shows at once; the intent decides what the message is.
function sendText(s, text, source, fromTranscript = false) {
  const t = cleanText(text);
  if (!t) return { state: fromTranscript ? { ...s, name: 'idle' } : s, effects: fromTranscript ? [fx('toast', { text: 'Nothing heard' })] : [] };
  return { state: { ...s, name: 'thinking', source, error: null, question: null, items: [], kind: null }, effects: [fx('showUserMessage', { text: t, source }), fx('route', { text: t, source })] };
}

function intent(s, event) {
  const t = event.text;
  switch (event.kind) {
    case 'capture':
      return { state: { ...s, kind: 'capture' }, effects: [fx('saveRules', { text: t, source: s.source }), fx('brainSplit', { text: t, source: s.source })] };
    case 'ask':
      return { state: { ...s, kind: 'answer' }, effects: [fx('brainAsk', { text: t })] };
    case 'expand':
    case 'plan':
      return { state: { ...s, kind: 'answer' }, effects: [fx('runOnLast', { what: event.kind, text: t })] };
    case 'done':
      return { state: { ...s, name: 'idle', items: [], question: null, kind: null }, effects: [fx('clearThread')] };
    default:
      return { state: s, effects: [] };
  }
}

function done(s, items) {
  const q = firstQuestion(items);
  const effects = [fx('replaceRuleItems', { items })];
  if (q) {
    return { state: { ...s, name: 'asking', items, question: q, kind: 'capture' }, effects: [...effects, fx('showQuestion', { items, index: q.index, question: q.question })] };
  }
  return { state: { ...s, name: 'filed', items, question: null, kind: 'capture' }, effects: [...effects, fx('showReply', { items }), fx('speakReply', { items })] };
}
