# Thought Catcher: architecture (v1)

Task `nexa-build-thought-catcher-2026-09-29`, phase L2, owner `aios-saas-architect`. Inputs: `specs/tasks/nexa-build-thought-catcher-2026-09-29/BRIEF-TEAM.md` (M1-M10) and `projects/thought-catcher/docs/requirements.md` (commit `343de4fa`, acceptance criteria `AC-*`). Repo: `/Users/ionvovos/Εγγραφα/thought-catcher` → `github.com/ionvovos/thought-catcher`, served by GitHub Pages at `https://ionvovos.github.io/thought-catcher/`.

## 1. Decisions

| # | Decision | Reason |
|---|---|---|
| D1 | Plain ES modules + HTML + CSS, no build step, no npm dependencies. The repo root is the site. | Pages serves the repo as-is; a factory worktree needs no install; `node --test` runs the pure modules directly. |
| D2 | Hash routing (`#/inbox`, `#/thought/<id>`). All URLs relative (`./src/app.js`, never `/src/app.js`). | Works under the `/thought-catcher/` sub-path with no 404 fallback page. |
| D3 | Speech: on-device Whisper (transformers.js) is the primary engine after a one-time consented download; browser speech recognition is the fallback; typing always works. | M2 asks for on-device where possible. Section 4. |
| D4 | Storage: IndexedDB for thoughts and settings; the AI key in `localStorage` only; an in-memory store with the same interface for tests. | M9, AC-M8.2, AC-M8.5 (a key kept out of IndexedDB cannot leak into an export). Section 5. |
| D5 | AI: one provider interface, two implementations (Anthropic Messages API, OpenAI-compatible chat), `fetch` injected. Rule sorter always runs first. | M8, AC-M3.5 (save never waits for AI). Section 6. |
| D6 | Unit tests: `node --test 'tests/**/*.test.mjs'` (`npm test`), zero dependencies. Browser smoke: headless Google Chrome driven over the DevTools protocol by a zero-dependency Node script. Playwright is not installed. | Section 9. |

## 2. Module map

Pure modules (under `src/core/`, `src/storage/memory.js`, `src/speech/select.js`) import nothing from the DOM and nothing outside the repo, so Node can import them. Browser modules may touch `window`, `document`, `indexedDB`, `navigator`.

| Path | Kind | Responsibility |
|---|---|---|
| `index.html` | browser | App shell, CSP meta, `<link rel="manifest">`, `apple-touch-icon`, loads `./src/app.js` as a module. |
| `css/app.css` | browser | Mobile-first styles, CSS custom properties, light and dark via `prefers-color-scheme`, no horizontal scroll at 360 px. |
| `manifest.webmanifest` | static | PWA manifest (section 7). |
| `sw.js` | browser | Service worker at the repo root so its scope is the whole app (section 7). |
| `icons/` | static | `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png`. |
| `tools/make-icons.mjs` | node | Writes the PNG icons with `node:zlib` only (no image library). Run once, output committed. |
| `src/app.js` | browser | Entry: opens the store, registers the SW, reads `?capture=1`, runs the review check, starts the router. |
| `src/ui/router.js` | browser | Hash router: `#/capture` (default), `#/inbox`, `#/type/<type>`, `#/thought/<id>`, `#/review`, `#/settings`, `#/about`. |
| `src/ui/dom.js` | browser | Small `el(tag, attrs, children)` helper. User text only via `textContent`; no `innerHTML` with user data anywhere. |
| `src/ui/views/capture.js` | browser | Big record button (≥96 px), text field, save, recording state, "nothing heard", clarify prompt after save. |
| `src/ui/views/list.js` | browser | Inbox and per-type views, counts, search box, empty states, done toggle. |
| `src/ui/views/detail.js` | browser | Edit type/title/tags/text/due, delete with confirm, Expand (ideas only), re-sort with AI. |
| `src/ui/views/review.js` | browser | Daily review list with reviewed / keep / dismiss. |
| `src/ui/views/settings.js` | browser | Provider, key (masked), model, base URL, test connection, review days, speech engine choice, export, import, delete all. |
| `src/ui/views/about.js` | browser | The one-page explanation (M10), static text. |
| `src/core/model.js` | pure | Constants (`TYPES`, limits), `newThought()`, `validateThought()`, `normalizeTags()`, `makeTitle()`. |
| `src/core/timeparse.js` | pure | `parseWhen(text, now)` → `{ due_at, kind: 'clock'|'date'|null }` for "at 6pm", "18:00", "tomorrow", weekdays, "in 2 hours", "next week". |
| `src/core/sorter.js` | pure | Rule sorter `sortByRules(text, now)` → `SortResult` (section 6.3). |
| `src/core/ambiguity.js` | pure | `detectAmbiguity(sortResult, text)` → `{ case: 1..5, question } | null` (section 6.4). |
| `src/core/review.js` | pure | `computeReview(thoughts, settings, now)` and the state transitions for reviewed / keep / dismiss (section 8). |
| `src/core/search.js` | pure | `searchThoughts(thoughts, query)` over title, text, tags, case-insensitive. |
| `src/core/exportImport.js` | pure | `buildExport(thoughts, settings, now)`, `parseImport(json)`, `mergeImport(existing, incoming)` (section 5.3). |
| `src/core/ai/adapter.js` | pure | Provider interface, prompts, `extractJson()`, result validators, `AiError` kinds (section 6). |
| `src/core/ai/anthropic.js` | pure | Anthropic provider; takes `fetch` as a parameter. |
| `src/core/ai/openai.js` | pure | OpenAI-compatible provider; takes `fetch` as a parameter. |
| `src/core/clarify.js` | pure | `applyAnswer(thought, ambiguity, answer, provider)`: local time parse first for case 2, provider for the rest. |
| `src/core/expand.js` | pure | `expandIdea(thought, provider)` → validated `Expansion`; stored only when valid (AC-M6.3). |
| `src/storage/memory.js` | pure | `createMemoryStore()`, the reference implementation of the store interface. |
| `src/storage/idb.js` | browser | `createIdbStore(indexedDB)`, same interface. |
| `src/speech/select.js` | pure | `selectEngine(engines, prefs)` and `transcribeWithFallback()` (AC-M2.1). |
| `src/speech/whisper.js` | browser | Whisper engine: `MediaRecorder` → `AudioContext.decodeAudioData` → 16 kHz mono `Float32Array` → transformers.js pipeline. |
| `src/speech/webspeech.js` | browser | `SpeechRecognition`/`webkitSpeechRecognition` engine. |
| `tests/*.test.mjs` | node | Unit tests, one file per pure module. |
| `e2e/smoke.mjs` | node | Headless Chrome smoke (section 9.2). Outside `tests/` so the factory's unit-test command never launches a browser. |

## 3. Data flow of one capture

1. User taps record (or presses `r` outside a text field; `Escape` stops) or types.
2. Speech engine returns text into the field; the user may edit (AC-M2.2). Audio is never stored (AC-M2.6).
3. Save: `sortByRules()` runs synchronously and the thought is written to the store at once (AC-M3.5, under 1 s).
4. If a provider is configured and online, `provider.sort(text)` runs in the background with a 15 s timeout. A valid reply patches the stored thought (`sort.by = 'ai'`). A timeout, error or malformed reply leaves the rule result (AC-M3.3). A 401/403 shows "key rejected" once per session (AC-M8.6).
5. `detectAmbiguity()` runs on the final sort result. If it returns a case and a provider is configured, the one question is shown with answer (text or voice) and skip. `clarify.state` moves `pending` → `answered` or `skipped`, and never back to `pending` (AC-M4.2). On app load, any thought still `pending` (the app was closed while the question was open) moves to `skipped`, shows the unresolved marker in the inbox and is never asked again (AC-M4.8). Without a provider, `clarify.state = 'unavailable'` and the inbox shows "needs a key to clarify" (AC-M4.6).

## 4. Speech (M2)

### 4.1 Engines

| | On-device Whisper | Browser speech recognition |
|---|---|---|
| Implementation | transformers.js `@huggingface/transformers@4.3.0` (exact pin, dynamic `import()` from `cdn.jsdelivr.net`), model `onnx-community/whisper-tiny`, quantized weights, `language: 'english'` (Q6 in requirements). | `window.SpeechRecognition || window.webkitSpeechRecognition`, `lang = 'en-US'`, `interimResults = true`. |
| First download | About 41 MB of model (encoder 10.1 MB + merged decoder 30.7 MB, quantized) plus the ONNX Runtime WebAssembly file, 14.3 MB for the plain SIMD build and up to 28.4 MB for the WebGPU build, plus the 0.5 MB library. Total roughly 55-70 MB before compression. Figures from the Hugging Face and jsDelivr file listings, 2026-09-29. | None. |
| Offline | Yes, after download. transformers.js keeps model files in Cache Storage (`transformers-cache`); the SW caches the pinned jsDelivr files. | No. It needs the vendor's servers. |
| Privacy | Audio never leaves the device. | Chrome sends audio to Google. Safari sends it to Apple (Siri/dictation servers) unless on-device dictation handles it; Apple decides, not the app. |
| Chrome Android | Works: WebAssembly SIMD since Chrome Android 91 (MDN BCD `webassembly.fixed-width-SIMD`); WebGPU where `navigator.gpu` exists. | Supported: `webkitSpeechRecognition` since 33, unprefixed since 139 (MDN BCD `api.SpeechRecognition`). |
| iOS Safari | Works on WebAssembly SIMD, Safari iOS 16.4+ (MDN BCD `webassembly.fixed-width-SIMD`); `MediaRecorder` since iOS 14 (MDN BCD `api.MediaRecorder`). Single-threaded, because GitHub Pages cannot send the COOP/COEP headers that threads require, so it is the slowest path. Memory pressure on older iPhones is a risk (R2). | `webkitSpeechRecognition` since Safari iOS 14.5 (MDN BCD `api.SpeechRecognition`); its behaviour in a home-screen (standalone) app is unverified here and must be checked on a phone (R3). |
| Firefox desktop | Works (WebAssembly SIMD). | Absent: listed only as "preview" (MDN BCD `api.SpeechRecognition`). |

Support data: `@mdn/browser-compat-data` 8.1.3, fetched 2026-09-29. Actual behaviour on phones is checked at L4/L5 (R3).

### 4.2 Selection rule (`src/speech/select.js`)

Setting `speech.engine` ∈ `ask` (default) | `whisper` | `browser` | `typing`.

1. `whisper` and the model is cached, or the download has been consented: use Whisper. If loading or transcription throws, fall back to browser speech when available, else leave the field for typing with a message.
2. `browser` and the API exists: use browser speech; on error (`not-allowed`, `network`, `no-speech`) show the message and keep the field usable (AC-M1.5).
3. `ask`: the first tap on record opens one dialog with three choices and their plain costs: "Download the on-device model (about 60 MB, audio stays on this phone)", "Use the browser's speech service (no download; audio goes to Google or Apple)", "Type instead". The choice is saved; Settings can change it. This is the consent prompt required by requirements section 4.
4. `typing`, or no engine works: the record button shows why and focuses the text field.

Whisper backend: `device: 'webgpu'` when `navigator.gpu` is present, else `'wasm'`; `dtype` quantized (`q8`). The model loads in the page after the first record tap, with a progress bar driven by the pipeline's `progress_callback`. A Web Worker would keep the UI smoother; it is optional for v1 (R2 fallback).

### 4.3 About page statement (AC-M2.4)

"If you choose the on-device model, your voice is turned into text on your phone and never sent anywhere. If you choose the browser's speech service, your browser sends the recording to its maker to turn it into text: Google for Chrome, Apple for Safari. Typing sends nothing."

## 5. Storage (M9)

### 5.1 IndexedDB schema

Database `thought-catcher`, version 1.

Store `thoughts`, `keyPath: 'id'`. Indexes: `by_type` (`type`), `by_created` (`created_at`), `by_due` (`due_at`). Search and lists load all rows and filter in memory; 500 rows is well inside AC-M5.8.

```json
{
  "id": "uuid from crypto.randomUUID()",
  "text": "raw text as saved (after the user's edit)",
  "type": "idea | task | journal | reminder",
  "title": "1-60 chars",
  "tags": ["lowercase", "max 5"],
  "created_at": "ISO 8601 UTC",
  "updated_at": "ISO 8601 UTC",
  "source": "typed | voice | import",
  "sort": { "by": "rules | ai", "confidence": 0.0, "alt_type": "task | null", "model": "id or null" },
  "due_at": "ISO 8601 UTC or null",
  "done": false,
  "done_at": null,
  "clarify": { "state": "none | pending | answered | skipped | unavailable", "case": null, "question": null, "answer": null },
  "expansion": null,
  "review": { "last_reviewed_at": null, "snoozed_until": null, "dismissed": false }
}
```

`expansion`, when present: `{ "next_steps": [..], "questions": [..], "outline": [..], "generated_at": "ISO", "model": "id" }`.

Store `settings`, `keyPath: 'key'`, rows `{ key, value }`. Keys: `ai.provider` (`none | anthropic | openai`), `ai.model`, `ai.base_url`, `speech.engine`, `review.days` (1-30, default 3), `review.last_shown_date` (local `YYYY-MM-DD`), `review.left_unresolved` (bool), `schema.version`.

The AI key is stored under `localStorage['thought-catcher.ai-key']` only. Removing it deletes that entry (AC-M8.3).

### 5.2 Store interface

Both `createMemoryStore()` and `createIdbStore(indexedDB)` return:

```
getAll() → Promise<Thought[]>          get(id) → Promise<Thought|undefined>
put(thought) → Promise<void>           putMany(thoughts) → Promise<void>
delete(id) → Promise<void>             clear() → Promise<void>   // thoughts only
getSetting(key, fallback) → Promise<any>
setSetting(key, value) → Promise<void>
```

`createIdbStore` rejects with a readable error when IndexedDB is unavailable (Firefox private mode, blocked storage); the app then shows a banner and runs on the memory store for the session so capture still works.

### 5.3 Export / import format

```json
{
  "format": "thought-catcher-export",
  "version": 1,
  "exported_at": "ISO 8601 UTC",
  "app_version": "1.0.0",
  "settings": { "review.days": 3, "speech.engine": "ask", "ai.provider": "anthropic", "ai.model": "…", "ai.base_url": null },
  "thoughts": [ /* Thought objects exactly as stored */ ]
}
```

- Never contains the key (AC-M8.5, AC-M9.3). A test asserts the serialized export does not contain the key string.
- `parseImport` rejects, with a message and no writes, when: not JSON, `format` differs, `version` is not 1, `thoughts` is not an array, or any thought fails `validateThought` (AC-M9.5). All-or-nothing.
- `mergeImport(existing, incoming)` adds thoughts whose `id` is new and skips existing ids, returning `{ toAdd, added, skipped }` for the "added N, skipped M" message (AC-M9.4). Imported thoughts keep their `clarify` state and are never questioned.
- Export is a `Blob` download named `thought-catcher-YYYY-MM-DD.json`.

## 6. AI adapter (M8)

### 6.1 Interface (`src/core/ai/adapter.js`)

```
createProvider(config, { fetch, now }) → {
  id: 'anthropic' | 'openai',
  sort(text) → Promise<SortResult>
  clarify({ thought, ambiguity, answer }) → Promise<Patch>     // {type,title,tags,due_at}
  expand(thought) → Promise<Expansion>
  test() → Promise<{ ok: true } >                               // one minimal request (AC-M8.4)
}
```

Each provider implements only `complete({ system, user, maxTokens, timeoutMs }) → text`; `adapter.js` owns the prompts, JSON extraction (strip code fences, take the first balanced `{…}`, `JSON.parse`) and validation. Failures throw `AiError` with `kind` ∈ `auth` (401/403) | `rate` (429) | `timeout` | `network` | `malformed` | `provider`. Timeouts use `AbortController`: sort and clarify 15 s, expand 45 s, test 10 s. When `navigator.onLine` is false, AI controls show "offline" (AC-Q.2).

### 6.2 Providers

Anthropic: `POST https://api.anthropic.com/v1/messages`; headers `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, `content-type: application/json`; body `{ model, max_tokens, system, messages: [{ role: 'user', content }] }`; text at `content[0].text`. Default model `claude-haiku-4-5-20251001` (the user pays; sort, clarify and expand are short tasks), editable in Settings.

OpenAI-compatible: `POST <base_url>/chat/completions`, `base_url` such as `https://api.openai.com/v1` or `http://localhost:11434/v1` (Ollama) or an oMLX server; header `Authorization: Bearer <key>` only when a key is set (optional for a local URL, AC-M8.1); body `{ model, messages: [{ role: 'system', … }, { role: 'user', … }], temperature: 0 }`; text at `choices[0].message.content`. No `response_format` (not every server supports it); the prompt demands JSON and the validator enforces it.

The key is read from `localStorage` at call time and sent only in the request to the chosen host. No telemetry, no other network call (AC-M9.2).

### 6.3 JSON contracts

Every prompt ends with "Reply with one JSON object only, no prose." The current local date-time with UTC offset is included so relative times resolve.

`sort` → `SortResult`:
```json
{ "type": "idea|task|journal|reminder", "alt_type": "idea|task|journal|reminder|null",
  "confidence": 0.0, "title": "≤60 chars", "tags": ["≤5 lowercase words"], "due_at": "ISO 8601 with offset or null" }
```
`clarify` (apply the user's answer) → `{ "type", "title", "tags", "due_at" }`, same rules.
`expand` → `{ "next_steps": ["3-5 items"], "questions": ["3-5 items"], "outline": ["3-7 lines"] }`.

Validators coerce what is safe (trim, lowercase and de-duplicate tags, cut title to 60, cut arrays to their maximum, clamp confidence to 0-1) and reject what is not (unknown `type`, missing field, empty title, unparseable `due_at`, empty expansion section) with `AiError('malformed')`.

### 6.4 Rule sorter (no key, and the first pass always)

`sortByRules(text, now)` scores each type from cue hits (case-insensitive, word boundaries):

| Type | Cues and points |
|---|---|
| reminder | "remind me", "reminder", "don't forget", "remember to" +3 · clock time parsed ("at 6pm", "18:00") +2 · date word parsed ("tomorrow", weekday, "next week") +1 · appointment verb at start ("call", "phone", "ring", "book") +2 |
| task | imperative verb at start (buy, call, email, send, fix, pay, book, clean, finish, write, pick up, order, schedule, cancel, renew, check, …) +2 · "need to", "have to", "must", "todo", "to do" +2 |
| idea | "what if", "idea", "we could", "i could", "app that", "wouldn't it be", "imagine" +3 · "should" +1 |
| journal | "today", "yesterday", "i feel", "i felt", "i keep thinking", "i've been thinking", "grateful", "tired", "happy", "sad", "was", "were" +1 each, at most +3 |

`type` = highest score; ties break reminder > task > idea > journal; all zero → `journal`. `alt_type` = second-highest type with score > 0, else null. `confidence` = top ÷ sum of scores, 0 when the sum is 0. `title` = first sentence with filler ("remind me to", "I think", "so") stripped, capitalised, cut at a word boundary to 60. `tags` = up to 3 content words (≥4 letters, not in a stopword list), lowercase. `due_at` from `parseWhen` for reminders and tasks.

Worked checks the tests must include: "buy milk tomorrow" → task 2, reminder 1, task, confidence 0.67. "call mum" → task 2, reminder 2, tie → reminder, alt task, confidence 0.5. "call mum at 6pm" → reminder 4, task 2, confidence 0.67, due set. "remind me to call mum at 6pm" → reminder 5 (the appointment verb is not at the start), task 0, confidence 1.0. "I keep thinking we should move to a smaller place" → idea 1, journal 1, tie → idea, alt journal, confidence 0.5 (case 4).

### 6.5 Ambiguity thresholds (requirements section 3, cases 1 and 5)

Checked in order; the first hit is the question (fixed templates from requirements section 3, each ≤20 words, AC-M4.7). Same thresholds for rule and AI results.

1. `{type, alt_type}` = `{task, reminder}` and `confidence ≤ 0.6` → "Task to do, or a reminder at a specific time?"
2. `type = reminder` and `due_at = null` → "When should I remind you?"
3. `type = idea` and no content word (≥4 letters and not in the stopword list, which includes pronouns and "have", "think", "idea", "thing", "something", "differently", "maybe", "what", "that", "this") → "What is the idea about?"
4. `{type, alt_type}` = `{idea, journal}` and `confidence ≤ 0.6` → "Is this an idea to develop, or a note for your journal?"
5. `source = voice` and fewer than 3 words, or (`type ≠ journal`, at least one type scored, and `confidence < 0.4`) → "I only caught '<text>'. What did you mean?" (text cut to 40 chars). Typed text is never questioned for length; a cue-less thought (all scores 0, sorted `journal`) and any journal entry are never questioned by this case. For AI results "at least one type scored" is always true. Checks: typed "buy milk" → task, confidence 1.0, no question; voice "buy milk" → case 5; typed "had a long walk" → journal, no question.

Case 2 answers go through `parseWhen` first; the provider is called only if that fails. Other answers go to `provider.clarify`.

## 7. PWA and offline (M1)

Manifest (`manifest.webmanifest`, all URLs relative to it):
```json
{ "name": "Thought Catcher", "short_name": "Thoughts", "id": "./", "start_url": "./?capture=1",
  "scope": "./", "display": "standalone", "background_color": "#…", "theme_color": "#…",
  "icons": [ {"src":"icons/icon-192.png","sizes":"192x192","type":"image/png"},
             {"src":"icons/icon-512.png","sizes":"512x512","type":"image/png"},
             {"src":"icons/icon-maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"} ],
  "shortcuts": [ {"name":"Record a thought","url":"./?capture=1&record=1"},
                 {"name":"Type a thought","url":"./?capture=1&type=1"} ] }
```

`?capture=1` opens the capture screen with the record button focused; `&type=1` focuses the text field. Browsers do not allow recording to start without a tap, so `record=1` means "ready to record", one tap away (AC-M1.1). Shortcuts show on Android long-press; iOS ignores them. `index.html` also carries `apple-touch-icon` and `apple-mobile-web-app-capable` metas for iOS.

Service worker (`sw.js`), `const VERSION = 'tc-v1'`, bumped on every release:
- `install`: precache the shell list (every file in the module map that the browser loads), then `skipWaiting()`.
- `activate`: delete caches not named `VERSION` (leave `transformers-cache` alone), `clients.claim()`.
- `fetch`, GET only: navigation requests → cached `./index.html` (`ignoreSearch: true`), network if missing. Same-origin assets → cache first, network fallback. `cdn.jsdelivr.net` URLs (exact-pinned, immutable) → cache first, stored on first fetch. Everything else, including every provider request and every non-GET, is not intercepted.
- An empty `.nojekyll` file at the repo root stops GitHub Pages from running Jekyll over the site.
- Registered from `app.js` as `navigator.serviceWorker.register('./sw.js')`, so it works under `/thought-catcher/` and on `localhost` alike.

Content Security Policy (meta tag in `index.html`): `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; img-src 'self' data: blob:; style-src 'self'; media-src 'self' blob:`. `connect-src` has to allow any HTTPS host because the OpenAI-compatible base URL is user-chosen; the script policy is where the protection is. `style-src 'self'` blocks inline `style="…"` attributes and `setAttribute('style', …)`, so from R1 on the UI uses no inline style attributes: classes, or `element.style` properties set from script (CSSOM, which the policy allows).

## 8. Resurface (M7)

`computeReview(thoughts, settings, now)`, run on app open and when the page becomes visible on a new local calendar day:

- An idea is due when `now ≥ (review.snoozed_until ?? (review.last_reviewed_at ?? created_at) + N days)`, N = `review.days` (default 3, 1-30).
- A reminder is due when `due_at ≤ now`, `review.dismissed` is false, and `review.snoozed_until` is null or `≤ now`.
- Actions: reviewed (idea): `last_reviewed_at = now`, `snoozed_until = null`. Keep: `snoozed_until = now + N days` (ideas and reminders). Dismiss (reminder): `dismissed = true`.
- Auto-show: items exist and (`review.last_shown_date` ≠ today's local date, or `review.left_unresolved` is true). On close, record today's date and whether items remain (AC-M7.4). A Review entry in the navigation with a count is always available.
- The review screen and About page say reminders appear only when the app is opened (AC-M7.6).

`now` is always passed in, never read inside the pure module, so tests use a fixed clock (AC-M7.1).

## 9. Tests

### 9.1 Unit (factory gate)

`node --test 'tests/**/*.test.mjs'` from the repo root (factory argv `["node", "--test", "tests/**/*.test.mjs"]`, no shell needed because Node expands the glob itself), Node 22, no dependencies, no network, no DOM. Test files are named `*.test.mjs`. The brief's `node --test tests/` does not work on Node 22: a directory argument is resolved as a module path, so it fails with `Cannot find module '…/tests'` unless a `tests/index.js` exists, and then it runs only that file (checked in the new repo, 2026-09-29). One file per pure module: `model`, `timeparse`, `sorter` (the 20-thought labelled set from AC-M3.2 plus the section 6.4 worked checks), `ambiguity` (one input per case plus clear cases), `review` (fixed clock), `search`, `exportImport` (round trip deep-equal, invalid files, merge counts, no key in output), `ai` (both providers with a mocked `fetch`: request URL, headers including `anthropic-dangerous-direct-browser-access`, body shape, malformed reply, 401, timeout), `clarify`, `expand`, `memoryStore`, `speechSelect` (stub engines, fallback on unavailable and on throw).

### 9.2 Browser smoke (L4)

Feasible tool on this machine: Google Chrome 154 at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` in `--headless=new` mode, verified this session (`--dump-dom` of a test page rendered `ok-object`, confirming `indexedDB` exists). It only runs outside the Bash sandbox: inside it Chrome fails with `Failed to create socket directory` / `Operation not permitted` on its profile. Playwright is not available (`npx --no-install playwright --version` failed) and is not added.

`e2e/smoke.mjs` (zero dependencies): start a `node:http` static server on `127.0.0.1` port 0 serving the repo, launch Chrome with `--headless=new --remote-debugging-port=0 --user-data-dir=<fs.mkdtempSync dir>`, read the port from `DevToolsActivePort`, connect with Node 22's built-in `WebSocket`, enable `Runtime`, `Log` and `Network`, then: load the app, type a thought, save, assert it appears in the inbox with a type badge, reload, assert it persists, and assert no `Runtime.exceptionThrown`, no console error, no request to a host other than `127.0.0.1`. Run with `node e2e/smoke.mjs` unsandboxed; exit code 0 = pass. An axe scan (AC-Q.3) and Lighthouse (AC-Q.6) need tools not on this machine; L4 records them as manual checks or findings.

## 10. Factory build split

Five runs instead of three. R1-R3 each leave a usable app. The last part is split so that the on-device speech engine, the only part M2's fallbacks already cover, is the one cut if time runs out: R4a (review, PWA, About) must land before the 09:30Z feature freeze; R4b (Whisper) runs only if time remains and is cut first (risk R10). Each run leaves `npm test` green. Request texts, in full:

R1. "Scaffold Thought Catcher, a no-build static web app served as-is from the repo root, per projects/thought-catcher/docs/architecture.md sections 1-3, 5 and 6.4. Plain ES modules, all URLs relative, hash router, no npm dependencies. Build: index.html, css/app.css (mobile-first, no horizontal scroll at 360 px), src/app.js, src/ui/router.js, src/ui/dom.js (user text via textContent only), src/core/model.js, src/core/timeparse.js, src/core/sorter.js (rule sorter with the exact cues, scores, tie order and worked checks in section 6.4), src/storage/memory.js and src/storage/idb.js (the store interface in 5.2 and the schema in 5.1), src/speech/select.js and src/speech/webspeech.js (browser speech engine; typed input always works), src/ui/views/capture.js (record button at least 96 px, text field, Enter saves, empty text not saved, 'nothing heard' state) and src/ui/views/list.js as the inbox (newest first: title, type badge, tags, date; empty state). Saving writes the rule-sorted thought immediately. Unit tests in tests/ for model, timeparse, sorter (a labelled set of 20 thoughts, 5 per type, at least 80% correct, plus the section 6.4 worked checks), memory store and speech selection with stub engines. Test files are tests/*.test.mjs, run by npm test. Do not change LICENSE, package.json or .gitignore. No inline style attributes; use classes or element.style."

R2. "Add the AI layer to Thought Catcher per projects/thought-catcher/docs/architecture.md sections 3 and 6. Build src/core/ai/adapter.js (interface, prompts, JSON extraction, validators, AiError kinds, AbortController timeouts), src/core/ai/anthropic.js (headers x-api-key, anthropic-version 2023-06-01, anthropic-dangerous-direct-browser-access: true; default model claude-haiku-4-5-20251001) and src/core/ai/openai.js (base URL + optional key + model, /chat/completions), both taking fetch as a parameter. Build src/core/ambiguity.js with the five cases and thresholds of section 6.5 and src/core/clarify.js. Wire capture: save with rules first, then background AI sort that patches the thought; show at most one clarifying question with text answer, voice answer and skip; clarify.state never returns to pending; no key means no question and an inbox marker 'needs a key to clarify'. Build src/ui/views/settings.js with provider, masked key stored only in localStorage['thought-catcher.ai-key'], model, base URL, test connection, remove key. A 401 shows 'key rejected' once and keeps the rule result. Unit tests with a mocked fetch for both providers (URL, headers, body, malformed reply, 401, timeout), ambiguity (one input per case plus clear cases) and clarify. Test files are tests/*.test.mjs, run by npm test. Do not change LICENSE, package.json or .gitignore."

R3. "Add organise, expand and data portability to Thought Catcher per projects/thought-catcher/docs/architecture.md sections 2, 5.3 and 6. Per-type views for idea, task, journal, reminder with counts; search over title, text and tags, case-insensitive, live, with an empty state (src/core/search.js); src/ui/views/detail.js to edit type, title, tags, text and due time, delete with confirmation, mark a task done and reopen it; 're-sort with AI' per thought when a key is set. Expand for ideas only (src/core/expand.js): next steps, questions, outline, stored on the thought, shown again after reload, regenerate replaces only on a valid reply, loading state disables the button, disabled with 'needs a key' linking to settings when no key. Export and import in settings (src/core/exportImport.js, format of section 5.3: version 1, no key ever, all-or-nothing validation, merge by id with 'added N, skipped M') and delete all data with confirmation. Unit tests for search, expand with a mocked provider, export/import round trip deep-equal, invalid files, merge counts and absence of the key. Test files are tests/*.test.mjs, run by npm test. Do not change LICENSE, package.json or .gitignore."

R4a. "Finish Thought Catcher per projects/thought-catcher/docs/architecture.md sections 7 and 8. Daily review: src/core/review.js (due ideas after N days, default 3, settable 1-30; due reminders, respecting snoozed_until; reviewed, keep, dismiss; auto-show rule with last_shown_date and left_unresolved; now always passed in) and src/ui/views/review.js with a navigation entry and count. PWA: manifest.webmanifest exactly as section 7 (start_url ./?capture=1, shortcuts), sw.js at the root with the cache strategy of section 7, registration with a relative path, icons generated by tools/make-icons.mjs using node:zlib only and committed, apple-touch-icon, the CSP meta of section 7, and an empty .nojekyll file at the repo root. src/ui/views/about.js: what it is, install on iPhone and Android in 3 steps each, privacy including the speech statement of section 4.3 and that the key stays on the device, the limits of v1, reminders only on open, periodic export advice, author Ion Vovos / Nexa Systems, link https://github.com/ionvovos/thought-catcher, no unexplained technical terms. Keyboard: r starts and stops recording outside a text field, Escape stops, hint shown. Unit tests for review with a fixed clock (including a kept reminder staying hidden until snoozed_until) and for the manifest's required fields. Test files are tests/*.test.mjs, run by npm test. Do not change LICENSE, package.json or .gitignore. No inline style attributes; use classes or element.style."

R4b. "Add on-device speech to Thought Catcher per projects/thought-catcher/docs/architecture.md section 4. src/speech/whisper.js using @huggingface/transformers@4.3.0 by dynamic import from cdn.jsdelivr.net, model onnx-community/whisper-tiny quantized, language english, webgpu when navigator.gpu exists else wasm, MediaRecorder audio decoded and resampled to 16 kHz mono, a progress bar driven by progress_callback. On the first record tap with speech.engine = ask, show the three-choice consent dialog of section 4.2 (download the on-device model with its size, use the browser speech service naming Google or Apple, type instead), save the choice, and let Settings change it. Implement the selection and fallback order of section 4.2 in src/speech/select.js: Whisper failure falls back to browser speech, then typing, with a message. Audio is never stored. Unit tests with stub engines for the selection order, the consent choices and fallback on load failure and on transcription failure. Test files are tests/*.test.mjs, run by npm test. Do not change LICENSE, package.json or .gitignore. No inline style attributes; use classes or element.style."

If the factory fails on a run and cannot be fixed within the brief's 20-minute limit, the same request text goes to a sonnet `aios-nextjs-developer` seat in the repo.

## 11. Risks

| # | Severity | Risk | Fallback |
|---|---|---|---|
| R10 | HIGH | The build misses the 09:30Z feature freeze: five sequential factory runs, and the last ones carry M1's install and home-screen shortcut, M7 and M10. | R4 is split: R4a (review, PWA manifest, service worker, icons, CSP, `.nojekyll`, About, keyboard) runs before R4b (Whisper and the consent dialog). R4b is cut first; the app then ships with browser speech and typing (M2 fallback) and the About page says on-device speech is not in this release. If R4a itself is late, its request text goes to a developer seat in parallel with the factory. |
| R1 | MEDIUM | A factory run is too big and fails review or tests. | Split that run in two along its module list; or the brief's developer-seat fallback with the same request text. |
| R2 | MEDIUM | Whisper is too slow or runs out of memory on an iPhone (single-threaded WebAssembly, AC-M2.5's 10 s). | Selection falls back to browser speech on load or run failure; Settings lets the user pick browser speech or typing; the About page says the on-device model suits newer phones. Moving inference to a Web Worker is the next step if the UI freezes. |
| R3 | MEDIUM | `webkitSpeechRecognition` does not work in an iOS home-screen app. | Whisper or typing. A phone check (P) at L4/L5 records which engines work where. |
| R4 | LOW | jsDelivr or Hugging Face unreachable on first speech use. | Error message, browser speech or typing; nothing else in the app depends on those hosts. |
| R5 | LOW | An HTTPS page calling a local `http://localhost` model: Chrome may ask for local-network permission; Safari may block it as mixed content; Ollama rejects unknown origins. | About/Settings text: set `OLLAMA_ORIGINS=https://ionvovos.github.io` for Ollama (oMLX's origin/CORS setting is unverified; check its server options before claiming support), use Chrome, or serve the repo locally (`python3 -m http.server`) and open it on `localhost`. |
| R6 | MEDIUM | iOS evicts site data of an unused web app. | Export and import; the About page advises periodic export (AC-M9.8). |
| R7 | MEDIUM | The key is readable by any script on the page (localStorage). | No third-party script except the pinned transformers.js, loaded only after speech consent; CSP `script-src` limited to self and that CDN; all user text rendered with `textContent`. The About page says to use a key with a spending limit. |
| R8 | LOW | A stale service worker serves an old app after a release. | `VERSION` bump per release, old caches deleted on activate, `skipWaiting` plus `clients.claim`. |
| R9 | LOW | A model returns prose around the JSON or wrong fields. | `extractJson` plus validators; the rule result stays stored; malformed replies never overwrite data. |
