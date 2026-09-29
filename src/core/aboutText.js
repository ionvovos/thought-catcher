// The About page content as data (M10). Pure, so tests can check it against AC-M10.2 to AC-M10.5 without a browser.
// Plain words only: no IndexedDB, PWA, API key or other unexplained term.

export const CODE_URL = 'https://github.com/ionvovos/thought-catcher';
export const AUTHOR = 'Ion Vovos / Nexa Systems';

export const SPEECH_STATEMENT = "If you choose the on-device model, your voice is turned into text on your phone and never sent anywhere. "
  + "If you choose the browser's speech service, your browser sends the recording to its maker to turn it into text: Google for Chrome, Apple for Safari. "
  + 'Typing sends nothing.';

const SPEECH_NO_MODEL = "Speech is turned into text by your browser's speech service, which sends the recording to its maker: "
  + 'Google for Chrome, Apple for Safari. Typing sends nothing. An on-device model that keeps your voice on your phone is not in this release.';

// features: { onDeviceSpeech: boolean }. Returns [{ heading, paragraphs?, groups?, hosts?, link? }].
export function aboutSections(features = { onDeviceSpeech: true }) {
  const speech = features.onDeviceSpeech
    ? [SPEECH_STATEMENT, 'The on-device model is a one-time download of about 60 MB and suits newer phones. Audio is never saved, only the text.']
    : [SPEECH_NO_MODEL, 'Audio is never saved, only the text.'];
  const leaves = features.onDeviceSpeech
    ? 'Nothing else leaves your device, apart from what the Speech, Assistant and AI sections below describe. The on-device models are downloaded once from public servers (jsDelivr and Hugging Face), which see your internet address but none of your thoughts. The last section lists every address the app contacts.'
    : 'Nothing else leaves your device, apart from what the Speech, Assistant and AI sections below describe. The last section lists every address the app contacts.';
  return [
    {
      heading: 'What it is',
      paragraphs: [
        'Thought Catcher is a small assistant for your thoughts. Speak or type, and it files each thought as an idea, a task, a journal entry or a reminder, with a title and tags. A long ramble becomes several thoughts. Later, ask it "what did I say about…" and it answers from your own thoughts.',
        'If it cannot tell what you meant, it asks one short question. You can skip the question.',
      ],
    },
    {
      heading: 'Put it on your phone',
      groups: [
        { label: 'iPhone', steps: ['Open this page in Safari.', 'Tap the Share button.', 'Tap Add to Home Screen.'] },
        { label: 'Android', steps: ['Open this page in Chrome.', 'Open the Chrome menu (three dots).', 'Tap Install app.'] },
      ],
    },
    {
      heading: 'On a computer',
      paragraphs: ['Press R to start and stop recording, when you are not typing in a box. Press Escape to stop.'],
    },
    {
      heading: 'Your data',
      paragraphs: [
        'Your thoughts are stored on this device only. There is no account and no server. ' + leaves,
        'Clearing your browser data, or iOS removing data from an app you have not opened for a while, can delete your thoughts. Use Export in Settings to keep a backup file now and then. Import restores it.',
      ],
    },
    { heading: 'Speech', paragraphs: speech },
    {
      heading: 'Assistant',
      paragraphs: [
        'The assistant that splits, sorts and answers runs on your phone, not on a server. Its files are about 870 MB and download once, after you agree, best on Wi-Fi. After that it works with no connection. Search by meaning has its own smaller download of about 29 MB.',
        'Some phones cannot run the assistant, and you can always say Not now. Then the app sorts, splits and searches with simple rules, and says so on each thought it sorted that way. Nothing breaks and nothing is hidden.',
      ],
    },
    {
      heading: 'AI (optional)',
      paragraphs: [
        'Simple rules and the on-device assistant work with nothing else set up. For sharper sorting, the one clarifying question, Expand on ideas, Plan on tasks and answers, you can add your own key from an AI provider: a password that lets this app use your account with them.',
        'The key stays on this device and is sent only to the provider and address you saved it for. If you change the provider or the address, the app never sends the old key there: it removes it and asks for a new one. Anyone using your key spends your money, so choose a key with a spending limit. When AI is on, the text of your thoughts is sent to that provider.',
        'You can also point the app at a model running on your own computer. That needs the model program to accept requests from this page; Settings explains how.',
      ],
    },
    {
      heading: 'Where the app connects',
      paragraphs: ['These are all the addresses this app contacts. None of them receives your thoughts, except your own AI provider when you add a key.'],
      hosts: [
        { name: 'This app', host: 'ionvovos.github.io', why: 'Always. Serves the app itself.' },
        { name: 'jsDelivr', host: 'cdn.jsdelivr.net', why: 'After you agree: the assistant and speech programs, downloaded once.' },
        { name: 'Hugging Face', host: 'huggingface.co and its file servers', why: 'After you agree: the search and speech models, downloaded once.' },
        { name: 'GitHub', host: 'raw.githubusercontent.com', why: 'After you agree: the assistant program files, downloaded once.' },
        { name: 'Your AI provider', host: 'the address you saved a key for', why: 'Only if you add a key. Receives the text you file.' },
        { name: 'Google or Apple', host: 'your browser\'s speech service', why: 'Only if you choose it for listening. Receives your voice recording.' },
      ],
    },
    {
      heading: 'Review',
      paragraphs: [
        'When you open the app, it shows ideas you have not looked at for a few days and reminders that are due. You choose how many days in Settings.',
        'Reminders appear only when you open the app. There are no notifications.',
      ],
    },
    {
      heading: 'What this version does not do',
      paragraphs: [
        'It sends no notifications. Your thoughts do not sync between devices. It works in English only. There is no App Store or Play Store version.',
      ],
    },
    {
      heading: 'Who made it',
      paragraphs: [`${AUTHOR}. Open source under the MIT licence.`],
      link: { href: CODE_URL, text: CODE_URL },
    },
  ];
}
