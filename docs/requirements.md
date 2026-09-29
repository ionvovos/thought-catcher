# Thought Catcher: requirements (v1)

Task `nexa-build-thought-catcher-2026-09-29`, phase L1. Source: `specs/tasks/nexa-build-thought-catcher-2026-09-29/BRIEF-TEAM.md` (M1-M10 binding). No stack decisions here; the architecture document decides stack.

## 1. Who it is for and the job

It is for people whose thoughts arrive at bad moments (walking, cooking, in bed, mid-task) and pile up in notes apps, voice memos and message drafts until they are lost. The job: get a thought out of the head in one tap by voice or typing, have it sorted into idea, task, journal entry or reminder with a title and tags, ask at most one short question when the meaning is unclear, and bring it back later so it is acted on. It runs in the browser, keeps data on the device and needs no account.

## 2. Requirements and acceptance criteria

Check mode: **H** = checkable headless (unit test or headless browser), **P** = needs a real phone. A criterion marked **H/P** has a headless part (stated) and a phone part.

### M1. Capture in one tap

Opening the app from the home-screen shortcut lands on the capture screen with one large record button. On desktop a keyboard shortcut starts capture. Typed input is always available, including when speech is unavailable or permission is denied.

- AC-M1.1 (H) Loading the app's start URL shows the capture screen with a record button whose visible size is at least 96 CSS px in both dimensions, without any other tap first.
- AC-M1.2 (H) The web manifest `start_url` opens the capture screen, and the manifest has `display: standalone`.
- AC-M1.3 (H) Pressing the documented desktop shortcut on the capture screen starts recording (or focuses the text field when speech is unavailable). The shortcut is shown on the About page or in a hint on the capture screen.
- AC-M1.4 (H) A text field is present on the capture screen. Typing a thought and pressing the save control (or Enter) stores it and clears the field.
- AC-M1.5 (H) With microphone permission denied or the speech API absent, the record button shows a message and the text field stays usable. No uncaught error appears in the console.
- AC-M1.6 (P) On iOS Safari and Android Chrome, after "Add to Home Screen", tapping the icon opens the app full-screen on the capture screen.
- AC-M1.7 (H) An empty or whitespace-only thought is not stored.

### M2. Speech to text on the device where possible

The app converts speech to text. The architecture chooses between in-browser Whisper and the browser's own speech recognition, with the other as fallback. The About page states the privacy difference: browser speech recognition in Chrome sends audio to Google.

- AC-M2.1 (H) A transcription interface exists with at least two engines and the app selects a working one at run time; a unit test with both engines stubbed shows fallback to the second when the first reports unavailable or fails.
- AC-M2.2 (H) A transcript returned by the active engine is put in the text field for review before saving, and the user can edit it. Saving stores the edited text.
- AC-M2.3 (H) While recording, the record button shows a distinct recording state and a second press stops it. Stopping with no speech recognised leaves the field empty and shows "nothing heard".
- AC-M2.4 (H) The About page contains a plain statement of which engine keeps audio on the device and which sends it to a third party, with the party named.
- AC-M2.5 (P) On a real phone, speaking one sentence produces a transcript in the text field within 10 seconds of stopping.
- AC-M2.6 (H) Audio is never written to IndexedDB or exported; only text is stored.

### M3. Sort into idea, task, journal entry or reminder, with title and tags

Every saved thought gets exactly one type (idea, task, journal, reminder), a title of at most 60 characters and zero to five tags. The user can change the type, title and tags afterwards.

- AC-M3.1 (H) After save, the stored record has `type` in {idea, task, journal, reminder}, a non-empty `title` of at most 60 characters, and a `tags` array of at most 5 lowercase strings.
- AC-M3.2 (H) Test set of at least 20 sample thoughts (5 per type, clear cases such as "buy milk tomorrow", "remind me to call mum at 6pm", "what if the app let people share lists", "today was tiring but good"): the rule-based sorter labels at least 80% correctly.
- AC-M3.3 (H) With a mocked AI provider returning a valid sort result, the record uses the AI's type, title and tags. With a malformed AI reply, the record falls back to the rule-based result and the thought is not lost.
- AC-M3.4 (H) The user can edit type, title and tags of a stored thought; after reload the edits persist.
- AC-M3.5 (H) Sorting never blocks saving: with the AI provider timing out (test: 10 s mock delay), the thought is saved within 1 s as unsorted-then-rule-sorted, and is updated when the AI answers or is left as rule-sorted after timeout.

### M4. One clarifying question, only when ambiguous

After sorting, if the thought is ambiguous by the rule in section 3, the app asks one question. The user answers by voice or text, or skips. The answer updates the record. At most one question per thought.

- AC-M4.1 (H) For each ambiguity case in section 3 (sample input for each), a question appears after save. For each clear case (sample input for each), no question appears.
- AC-M4.2 (H) At most one question is shown per thought; after the answer or skip, no second question appears for that thought, even if it is still ambiguous.
- AC-M4.3 (H) A skip control is visible with the question at all times. Pressing it stores the thought with the current best guess and closes the question.
- AC-M4.4 (H) Answering by text updates the record (type, or reminder time, or title as the question targeted); the stored record reflects the answer.
- AC-M4.5 (H/P) Answering by voice uses the M2 engine and puts the transcript in the answer field before it is submitted (H with stub engine, P for real speech).
- AC-M4.6 (H) With no key configured, no question is asked (M8); the thought is stored with the rule-based result and the inbox shows it as "needs a key to clarify".
- AC-M4.7 (H) The question text is one sentence of at most 20 words and names the missing piece (for example "What time should I remind you?").
- AC-M4.8 (H) Closing or navigating away while a question is open leaves the thought saved; on next open it is in the inbox with an unresolved marker and is not asked again.

### M5. Organise

Inbox of all thoughts, one view per type, search, edit, delete, mark task done.

- AC-M5.1 (H) The inbox lists all thoughts newest first with title, type badge, tags and date.
- AC-M5.2 (H) There is one view each for idea, task, journal, reminder, showing only that type. Counts shown match the number listed.
- AC-M5.3 (H) Search matches title, body text and tags, case-insensitive, and updates as the user types; a query with no match shows an empty-state message.
- AC-M5.4 (H) Edit changes are saved and survive reload (see AC-M3.4).
- AC-M5.5 (H) Delete asks for confirmation, then removes the thought; it is absent after reload. Cancelling the confirmation keeps it.
- AC-M5.6 (H) A task has a done control. Marking done shows it as done (strikethrough or check) and it moves out of the open-tasks list; marking done again reopens it. State persists after reload.
- AC-M5.7 (H) With zero thoughts, each view shows an empty state that points to capture.
- AC-M5.8 (H) The lists remain usable with 500 stored thoughts (open inbox in under 1 s in headless).

### M6. Expand an idea on request

For an idea, the user presses "Expand" and gets next steps, questions to answer and a short outline, stored with the idea.

- AC-M6.1 (H) The Expand control appears on ideas only, not on tasks, journal entries or reminders.
- AC-M6.2 (H) With a mocked provider, pressing Expand shows three labelled sections: next steps, questions to answer, outline. Result is stored on the record and shown again after reload without a new call.
- AC-M6.3 (H) Pressing Expand again offers "regenerate"; regenerating replaces the stored result only after the new reply is valid.
- AC-M6.4 (H) With a provider error or malformed reply, an error message is shown, the idea is unchanged, and the user can retry.
- AC-M6.5 (H) With no key, the Expand control is shown disabled with "needs a key" and opens the settings screen when pressed (M8).
- AC-M6.6 (H) A loading state is shown while waiting and the control is disabled to prevent duplicate calls.

### M7. Resurface

A daily review, shown when the app opens, brings back ideas that were not reviewed for N days (default 3, adjustable in settings) and reminders that are due. No server push.

- AC-M7.1 (H) With a fixed test clock, an idea created 3 days earlier and not reviewed appears in the review on app open; an idea created 2 days earlier does not.
- AC-M7.2 (H) A reminder whose time has passed and that is not dismissed appears in the review; a reminder in the future does not.
- AC-M7.3 (H) For each item the user can mark reviewed (idea leaves the review and its clock restarts), keep (snooze to N days from now) or dismiss (reminder). State persists.
- AC-M7.4 (H) The review is shown at most once per calendar day on open unless items remain unresolved; with nothing due it is not shown at all.
- AC-M7.5 (H) The threshold N can be set in settings between 1 and 30 days and is used by the next review.
- AC-M7.6 (H) The app shows a plain note that reminders appear only when the app is opened (About page or review screen).

### M8. AI without a server (own key)

Settings accept the user's own key for Anthropic, or a base URL, key and model name for any OpenAI-compatible endpoint (covers a local Ollama or oMLX model). The key is stored only on the device.

- AC-M8.1 (H) Settings has a provider choice (Anthropic, OpenAI-compatible), key field (masked), model field, and for OpenAI-compatible a base URL field. A key is optional for a local base URL.
- AC-M8.2 (H) Saved settings persist after reload; the key is stored only in browser storage on the device. Network trace of a full session (headless) shows no request containing the key except to the chosen provider's host.
- AC-M8.3 (H) Removing the key deletes it from storage; subsequent sort calls use the rule-based path.
- AC-M8.4 (H) A "test connection" control sends one minimal request with mocked transport in tests, and shows success or the provider's error text.
- AC-M8.5 (H) The exported JSON (M9) does not contain the key.
- AC-M8.6 (H) A wrong key (provider returns 401) shows "key rejected" once and the thought is still saved rule-sorted.

### M9. Data stays on the device

All thoughts and settings-other-than-key are in IndexedDB. No account, no backend. Export and import as JSON.

- AC-M9.1 (H) After saving thoughts and reloading, all are present (IndexedDB check in headless browser).
- AC-M9.2 (H) In a headless session with network logging, no request other than to static app assets and, when a key is configured, the chosen provider is made.
- AC-M9.3 (H) Export downloads one JSON file containing a format version, an export timestamp and all thoughts with fields intact; it contains no key.
- AC-M9.4 (H) Import of a file exported by the app restores all thoughts; importing into a non-empty store merges by id without duplicating. A count summary is shown ("added N, skipped M").
- AC-M9.5 (H) Import of an invalid file (not JSON, wrong version, missing fields) shows an error and changes nothing.
- AC-M9.6 (H) Round trip: export, clear all data, import, and the record set equals the original (deep-equal in a test).
- AC-M9.7 (H) A "delete all data" control exists, asks for confirmation and empties the store.
- AC-M9.8 (P) After Safari iOS "Add to Home Screen" and a week of non-use, data is still present; the About page notes that clearing site data or the iOS storage eviction policy can remove it and recommends periodic export.

### M10. About page

The one-page explanation.

- AC-M10.1 (H) An About page is reachable from the main navigation in one tap and works offline.
- AC-M10.2 (H) It contains: what the app is, how to install on iPhone (Safari, Share, Add to Home Screen) and on Android (Chrome menu, Install app) in 3 steps each or fewer, a privacy section (data on device; key on device; speech engine difference per AC-M2.4), author "Ion Vovos / Nexa Systems", and a link to the public code.
- AC-M10.3 (H) The code link target is `https://github.com/ionvovos/thought-catcher` and is a working link once the repo exists (checked at release).
- AC-M10.4 (H) The page states the limits of v1 (see section 5, first paragraph list).
- AC-M10.5 (H) The About text is understandable by a non-engineer: no unexplained term such as IndexedDB, PWA, API key (each is replaced by plain words or explained in one clause).

### Cross-cutting acceptance (quality bar)

- AC-Q.1 (H) No console errors or warnings on load and during the smoke path capture, sort, list, edit, delete.
- AC-Q.2 (H) Works offline after first load: with the network disabled, capture with typed input, rule-based sort, and all list views work; AI features show "offline".
- AC-Q.3 (H) Accessibility: every control has an accessible name; the record button and question controls are reachable by keyboard; text contrast at least 4.5:1; an automated axe scan reports no serious or critical issues on capture, inbox, settings and About.
- AC-Q.4 (H) Layout has no horizontal scroll at 360 px width and is usable at 1280 px.
- AC-Q.5 (P) The app is usable one-handed on a phone; tap targets at least 44 px (H can check the size; P checks the feel).
- AC-Q.6 (H) A Lighthouse PWA check reports installable (manifest, service worker, icons, HTTPS on the live host).

## 3. Ambiguity rule for M4

Ask one question when, after sorting, at least one of these is true. Check in this order and ask about the first that applies; ask nothing about the others.

1. **Type unclear between task and reminder.** The thought contains an action but the sorter's top two types are task and reminder within a small margin (rule-based: both a task verb and a time cue, or neither). Example: "call the dentist" (task or reminder?). Question: "Task to do, or a reminder at a specific time?"
2. **Reminder with no usable time.** Type is reminder and no date or time was parsed ("remind me to pay rent"). Question: "When should I remind you?"
3. **Idea with no subject.** Type is idea and the text has no noun phrase beyond a pronoun or filler ("what if we did it differently", "I have an idea"). Question: "What is the idea about?"
4. **Type unclear between idea and journal.** The thought is reflective and speculative in similar measure ("I keep thinking we should move to a smaller place"). Question: "Is this an idea to develop, or a note for your journal?"
5. **Transcript too short or garbled.** Fewer than 3 words after speech to text, or the sorter confidence is below its floor. Question: "I only caught '<text>'. What did you mean?"

Not ambiguous, no question: a clear single type, a reminder with a parsed time, a task with an object, an idea with a subject, any journal entry.

Limits: at most one question per thought, ever (AC-M4.2). Skip is always offered (AC-M4.3). No question without a key (AC-M4.6). No question about tags. A thought created by import or edited later is never questioned.

Open for the test engineer: the numeric margin and confidence floor are set by the architect and must be written next to the rule so cases 1 and 5 are testable.

## 4. No-key behaviour (M8)

| Works without a key | Shows "needs a key" |
|---|---|
| M1 capture, typed and voice (M2 speech does not need an AI key) | M4 clarifying question |
| M3 rule-based sort: type, title, tags | M6 expand an idea |
| M5 organise: inbox, views, search, edit, delete, done | AI-quality sorting (an unobtrusive "sorted by rules" label on the thought) |
| M7 daily review and due reminders | |
| M9 storage, export, import | |
| M10 About page | |

Rules:

- The needs-a-key controls are visible but disabled, with the text "needs a key" and one tap to Settings. They are never hidden and never fail silently.
- A thought captured without a key is stored complete (rule sorted). If a key is added later, a "re-sort with AI" action per thought or for all is offered; nothing is re-sorted without the user's action.
- The first-run screen offers Settings but does not require it; capture is usable immediately.
- If the in-browser Whisper engine (M2) needs a first-run model download, the size and a consent prompt are shown before download, and browser speech or typing is offered instead.

## 5. Out of v1 and open questions

Out of v1 (from the brief): native App Store and Play release (Apple 99 USD/yr is a money item), cross-device sync, push notifications, accounts.

Open questions for Ion:

- Q1. Product name: keep "Thought Catcher" or choose another? (No domain purchase either way; the live link is the GitHub Pages address.)
- Q2. App Store release: Apple charges 99 USD per year for the developer programme. Do you want a native iPhone app later, at that cost, or stay with the installable web app? (Play is a one-time 25 USD fee, also a money item.)
- Q3. What to build next after this one: which portfolio candidate, or an extension of this app (sync, push reminders, widget)?
- Q4. Default review threshold: is 3 days for resurfacing ideas right, or do you want it shorter or longer?
- Q5. Should the app offer an in-browser Whisper model that downloads once (size on the order of tens of MB), or use only the browser's own speech recognition with typing as fallback? (Privacy versus size, per M2.)
- Q6. Language: English only in v1, or also Greek capture and Greek interface? (Speech engines and the rule-based sorter differ per language; v1 is assumed English only.)
- Q7. Licence and attribution: MIT, author Ion Vovos, publisher Nexa Systems, as in the brief. Confirm?
