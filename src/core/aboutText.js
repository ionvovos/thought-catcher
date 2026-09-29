// The About page content as data (M10). Pure, so tests can check it against AC-M10.2 to AC-M10.5 without a browser.
// Plain words only: no IndexedDB, PWA, API key or other unexplained term.

export const CODE_URL = 'https://github.com/ionvovos/thought-catcher';
export const AUTHOR = 'Ion Vovos / Nexa Systems';

export const SPEECH_STATEMENT = "If you choose the on-device model, your voice is turned into text on your phone and never sent anywhere. "
  + "If you choose the browser's speech service, your browser sends the recording to its maker to turn it into text: Google for Chrome, Apple for Safari. "
  + 'Typing sends nothing.';

const SPEECH_NO_MODEL = "Speech is turned into text by your browser's speech service, which sends the recording to its maker: "
  + 'Google for Chrome, Apple for Safari. Typing sends nothing. An on-device model that keeps your voice on your phone is not in this release.';

// features: { onDeviceSpeech: boolean }. Returns [{ heading, paragraphs?, steps?, groups? }].
export function aboutSections(features = { onDeviceSpeech: false }) {
  const speech = features.onDeviceSpeech
    ? [SPEECH_STATEMENT, 'The on-device model is a one-time download of about 60 MB and suits newer phones. Audio is never saved, only the text.']
    : [SPEECH_NO_MODEL, 'Audio is never saved, only the text.'];
  const leaves = features.onDeviceSpeech
    ? 'Nothing else leaves your device, apart from what the Speech and AI sections below describe. The on-device voice model is downloaded once from public servers (jsDelivr and Hugging Face), which see your internet address but none of your thoughts.'
    : 'Nothing else leaves your device, apart from what the Speech and AI sections below describe.';
  return [
    {
      heading: 'What it is',
      paragraphs: [
        'Thought Catcher catches a thought in one tap. Speak it or type it, and the app sorts it as an idea, a task, a journal entry or a reminder, gives it a title and tags, and brings it back later.',
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
      heading: 'AI (optional)',
      paragraphs: [
        'Sorting by simple rules works with nothing set up. For better sorting, the one clarifying question and Expand on ideas, you can add your own key from an AI provider: a password that lets this app use your account with them.',
        'The key stays on this device and is sent only to the provider and address you saved it for. If you change the provider or the address, the app never sends the old key there: it removes it and asks for a new one. Anyone using your key spends your money, so choose a key with a spending limit. When AI is on, the text of your thoughts is sent to that provider.',
        'You can also point the app at a model running on your own computer. That needs the model program to accept requests from this page; Settings explains how.',
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
