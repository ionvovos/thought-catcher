# Thought Catcher

Catch a thought in one tap, by voice or typing. Thought Catcher sorts it, keeps it on your device and brings it back later.

Live app: https://ionvovos.github.io/thought-catcher/ (published with the first release; until then the link may return a 404)

**Status: under construction.** This README describes the first release. Features not yet built and checked are marked *(planned)*. The list of what works today is the app's own test run, not this page.

## What it does

- **Capture in one tap.** Open the app and press the large record button, or type. On a desktop, the `r` key starts and stops recording. Typing always works, including when speech is unavailable or the microphone is denied.
- **Speech to text.** The transcript lands in a text field so you can fix it before saving. The audio itself is never stored, only the text.
- **Sorting.** Each thought becomes an idea, a task, a journal entry or a reminder, with a title of up to 60 characters and up to five tags. You can change all three afterwards. Sorting by simple rules works without any account or key.
- **One question, only when unclear.** If a thought is ambiguous ("call the dentist": a task, or a reminder at a time?), the app asks one short question. You can answer by voice or text, or skip. It asks at most once per thought and never asks about tags. This needs an AI key (see Privacy).
- **Organise.** An inbox of everything, one view per type, search over title, text and tags, edit, delete, and mark tasks done.
- **Expand an idea.** On an idea, press Expand for next steps, questions to answer and a short outline. This needs an AI key.
- **Daily review.** When you open the app, ideas you have not looked at for a few days (3 by default, adjustable from 1 to 30) and reminders that are due are shown for you to review, keep or dismiss. Reminders appear only when you open the app. There are no push notifications.
- **Export and import.** Save everything as one JSON file and restore it later. The file never contains your AI key.

Without a key, capture, rule-based sorting, organising, the daily review, export and import all work. The two features that need a key are disabled and marked "needs a key", with one tap to Settings.

## Install on your phone

Nothing is downloaded from an app store. You add the web page to your home screen and it opens full screen like an app.

**iPhone (Safari)**

1. Open https://ionvovos.github.io/thought-catcher/ in Safari.
2. Tap the Share button.
3. Tap Add to Home Screen, then Add.

**Android (Chrome)**

1. Open https://ionvovos.github.io/thought-catcher/ in Chrome.
2. Open the Chrome menu (three dots).
3. Tap Install app, then Install.

Tapping the new icon opens the capture screen. On Android, a long press on the icon offers shortcuts to record or type. iPhone ignores those shortcuts.

## Privacy

- **Your thoughts stay on your device.** They are stored in your browser's own storage. There is no account and no server run by this project.
- **Your AI key stays on your device.** It is kept in your browser's local storage and sent only to the AI provider you choose. It is never included in an export. Any script running on the page could read it, so use a key with a spending limit.
- **What can leave the device:**
  - The text of a thought, sent to the AI provider you configured (Anthropic, or an OpenAI-compatible service you name), only when you have set a key or a local model and the app is online. With no provider set, nothing is sent.
  - Audio, only if you choose the browser's speech service: Chrome sends the recording to Google and Safari sends it to Apple.
  - A one-time download of the on-device speech model, if you choose it *(planned)*: about 60 MB from public hosts (jsDelivr and Hugging Face). After that, your voice is turned into text on the phone and never sent anywhere.
  - The app's own files, fetched from GitHub Pages when you open it.
- **Typing sends nothing.**
- **Storage can be cleared.** Clearing site data, or iOS removing data of a web app you have not used for a while, can delete your thoughts. Export a backup from time to time.

## Using a local model

Settings accepts a base URL, an optional key and a model name for any OpenAI-compatible endpoint, so a model running on your own computer works without a cloud account.

- **Ollama:** a browser page on `https://ionvovos.github.io` calling `http://localhost:11434/v1` needs Ollama to accept that origin. Start it with `OLLAMA_ORIGINS=https://ionvovos.github.io ollama serve`. Chrome may also ask permission to reach the local network, and Safari may block a secure page from calling a plain `http://` address. Chrome is the safer choice.
- **oMLX and other servers:** they need a similar origin (CORS) setting. Support for oMLX has not been checked; look at its server options before relying on it.
- **Alternative:** run the app locally (next section) and open it on `localhost`, which avoids the secure-page restrictions.

## Run locally

There is no build step and no dependency to install. The repository root is the site.

```
git clone https://github.com/ionvovos/thought-catcher.git
cd thought-catcher
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Tests

Node 22 or newer.

```
npm test               # unit tests: node --test 'tests/**/*.test.mjs'
node e2e/smoke.mjs     # headless browser smoke test (planned); needs Google Chrome installed
```

The unit tests need no dependencies and no network. The smoke test starts a local server and drives headless Chrome through one full capture, sort, list and reload path.

## Limits of this release

- English only.
- Reminders show when you open the app. There is no push notification.
- No sync between devices and no account. Use export and import to move data.
- No App Store or Play Store release.
- Recording always needs a tap; a browser does not allow it to start on its own.
- Speech quality and on-device speech speed depend on the phone. Older iPhones may struggle with the on-device model.

## Licence and author

MIT, see [LICENSE](LICENSE). By Ion Vovos, Nexa Systems.
