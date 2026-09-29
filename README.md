# Thought Catcher

A small assistant that lives on your phone. Open it, tap the voice orb and say what is on your mind. It asks one short question if it needs to, files the thought, and brings it back when it matters. Your data stays on your device.

Live app: https://ionvovos.github.io/thought-catcher/

Version 2.0.0.

## What it does

- **Opens on a voice orb.** One large orb in the centre reacts to your voice while you speak. Tap it to talk. Typing is one tap away and always works, including when speech is unavailable or the microphone is denied.
- **A conversation, not a form.** What you say appears as a message. The assistant replies briefly, asks one question only when the thought is unclear, then shows the filed result as a card you can correct in one tap. Done closes it.
- **One ramble, several thoughts.** A long spoken ramble is split into separate items, for example two tasks, an idea and a reminder with its date. Each is filed on its own.
- **A library one swipe away.** Thoughts are grouped by type (idea, task, journal, reminder) with colour and icon, with search and filters.
- **Ask your thoughts.** Ask "what did I say about the gym?" and the app answers from your own saved thoughts, with links to them. It searches by meaning, on the device.
- **Related thoughts.** Each thought shows the others it relates to. Ideas that keep coming back are grouped into a topic.
- **Expand and plan.** Turn an idea into next steps, open questions and an outline, or turn a task into sub-steps.
- **Daily review and reminders.** A short review card when you open the app. Reminders that are due appear when you open it. There are no push notifications.
- **Export and import.** Save everything as one JSON file and restore it later. The file never contains your AI key. Data from version 1 is migrated automatically.

## How the AI works

- **On-device AI, no setup.** When the phone supports it (a browser with WebGPU), the app downloads a small language model and a small embedding model once and runs them on the phone. No account, no key, no server.
- **Simple rules when the phone cannot run it.** The app says so and falls back to rule-based sorting. Capture, the library, search, review, export and import still work.
- **Your own key is optional.** Settings accepts an Anthropic key or any OpenAI-compatible endpoint (including a model on your own computer). It makes the conversation, splitting and planning stronger. Without a key, everything above still runs on the device or on rules.

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

## Privacy

- **Your thoughts stay on your device.** They are stored in your browser's own storage. There is no account and no server run by this project.
- **Your AI key stays on your device.** It is kept in your browser's local storage and sent only to the AI provider you choose. It is never included in an export. Any script running on the page could read it, so use a key with a spending limit.
- **What can leave the device:**
  - The text of a thought, sent to the AI provider you configured, only when you have set a key or a local model and the app is online. With no provider set, nothing is sent.
  - Audio, only if you choose the phone's own speech service: Chrome sends the recording to Google and Safari sends it to Apple.
  - One-time downloads of the on-device models from public hosts (jsDelivr, Hugging Face, GitHub). After that the models run on the phone and your words are not sent anywhere.
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
node e2e/smoke.mjs     # headless browser smoke test; needs Google Chrome installed
```

The unit tests need no dependencies and no network. The smoke test starts a local server and drives headless Chrome through one capture, sort, list and reload path.

## Limits of this release

- English only.
- On-device AI needs a browser with WebGPU and a first download of several hundred megabytes. Older phones may be slow or fall back to rules.
- Reminders show when you open the app. There is no push notification.
- No sync between devices and no account. Use export and import to move data.
- No App Store or Play Store release.
- Recording always needs a tap; a browser does not allow it to start on its own.

## Third-party notices

The app loads these components at run time from public hosts. It does not bundle them.

| Component | Used for | Licence |
| --- | --- | --- |
| WebLLM (`@mlc-ai/web-llm` 0.2.85) | Runs the language model in the browser | Apache-2.0 |
| transformers.js (`@huggingface/transformers` 4.3.0) | Runs the embedding and speech models in the browser | Apache-2.0 |
| Qwen2.5-1.5B-Instruct (MLC q4f16_1 build) | On-device language model | Apache-2.0 |
| all-MiniLM-L6-v2 (`Xenova/all-MiniLM-L6-v2`) | On-device search by meaning | Apache-2.0 |
| WebLLM model library, `Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm` from `mlc-ai/binary-mlc-llm-libs` | Compiled runtime for the language model | No licence declared in that repository |
| whisper-tiny (`onnx-community/whisper-tiny`) | Optional on-device speech to text | Licence not checked for this notice |

The WebLLM model library is a compiled binary that its publisher has not given a stated licence. It is fetched from its publisher's repository at run time and is not redistributed here.

## Licence and author

MIT, see [LICENSE](LICENSE). By Ion Vovos, Nexa Systems.
