# Rancho: mascot, floating launcher and chat panel

Rancho is Aspire's snow leopard mascot (Instagram @aspireiit_medical) and the name of the AI doubt solver
(formerly "Ask Aspire", page `/tools/ask`; backend and persona: docs/ask-aspire.md).

## Official artwork: what Aspire needs to provide

The site currently draws a **temporary SVG stand-in** (`src/components/rancho/RanchoMascot.tsx`,
marked `data-placeholder="true"`). It is not Aspire's Rancho and must be replaced by the official
art before launch.

Please send these two files:

| File (put in `public/images/rancho/`) | What | Format | Minimum size |
|---|---|---|---|
| `rancho-head.webp` | Front-facing head / avatar, centred, square canvas, little empty margin. Shown from 32px (the floating button) up to about 160px. | Transparent PNG or WebP, or SVG | 512 × 512 px |
| `rancho-wave.webp` | Waving or half-body pose, for page heroes and empty states | Transparent PNG or WebP, or SVG | 1024 px tall |

- The background must be transparent (no white box): the head sits on a white circle in a navy button,
  the half-body pose on navy and light backgrounds.
- The head must stay recognisable at 32 × 32 px, so a simple, bold version works best.
- Confirm Aspire owns the artwork, or has a licence for web use (D-019: no unlicensed images).
- If the files are PNG or SVG, keep the names but change the extension in `rancho-assets.ts`.

## Switching to the official art

1. Copy the files to `public/images/rancho/`.
2. In `src/components/rancho/rancho-assets.ts`, set each entry's real `width` / `height` (and the
   extension, if it is not `.webp`).
3. Set `OFFICIAL_RANCHO_ART_AVAILABLE = true`.
4. Run `npx vitest run src/components/rancho`. A test fails if the flag is on while a file is missing.

`<RanchoMascot variant="head" | "wave" title? className? />` keeps the same API. When the flag is on,
it renders `next/image` with `alt={title}`, or `alt=""` + `aria-hidden` when it has no title. Size it
with `className` (e.g. `size-10`). Every user of the mascot (the launcher, the panel, the Ask page,
the home tools widget) switches automatically.

## The Rancho chat (floating panel, /tools/ask and /rancho)

One chat component, `RanchoChat` (`src/components/rancho/RanchoChat.tsx`), runs in three places:

| Where | How | Variant |
|---|---|---|
| Every public page | `RanchoDock` → `RanchoLauncher` → `RanchoChatPanel` (lazy-loaded on first open) | `panel`: a native `<dialog>` |
| `/tools/ask` | `AskAspire` (`src/components/ask/AskAspire.tsx`) | `page`: a card in the page |
| `/rancho` (the installable Rancho app, PWA track) | the same `AskAspire` | `page` |

Strings: `rancho.panel` (`src/i18n/messages/{en,hi}/rancho.ts`). The `ask` namespace re-exports the
same object as `ask.chat`, so the panel and the pages always say the same thing. Otherwise `ask`
keeps only the `/tools/ask` page's own copy (meta, hero, how, honest notes, stuck box) and two
strings the homepage tools widget reads (`form.heading`, `answer.disclaimer`); the old form's
`form.*`, `answer.*` and `errors.*` keys are gone, as are `rancho.panel.title` and
`panel.remaining` (the chat is named by its "Rancho" heading).

### Layout (October 2026 declutter)

The owner's complaint was that the chrome took 60–70% of the panel. The conversation now gets most
of the height. Measured with an empty conversation open:

| Viewport | Before | After |
|---|---|---|
| 412 × 915 phone (full-height sheet) | 66.9% | 84.4% |
| 1366 × 768 desktop (popover) | 48.8% | 75.8% |
| `/tools/ask` page card, 1366 × 768 | — | about 79% |

- **Header** (one row, 52 px): mascot head, "Rancho", and "N of M left today" from `GET /api/ask`
  ("Aspire's AI doubt solver" until that arrives). Then the icon buttons, each with an accessible
  name and a 44 px target:
  - voice mode (only where the browser can listen and speak);
  - New chat;
  - in the panel only: Open the full page (expand icon → `/tools/ask`) and Close.

  The page chat adds an answer-language select (English / हिंदी). In the panel, answers follow the
  page locale.
- **Composer**: one row.
  - 📷 photo, 🎤 voice typing (only where supported), an auto-growing field (1 line up to about 5),
    a compact "Any ▾" subject select, and a round Send button. While an answer streams, Send
    becomes Stop.
  - The field grows only with text: empty, it stays one line and a long placeholder is cut short
    with "…" (`placeholder:truncate`).
  - The subject select appears only after the first question. Before it, the subject chips sit in
    the empty conversation under the welcome message.
  - The select sits in the row only when the chat is at least 23rem wide (a container query on the
    footer: the 412 px phone sheet and the desktop popover). In a narrower chat (the page card on a
    phone, the sheet on a 390 px phone) it moves to the disclaimer line, as "Subject [Any ▾]", so
    the field keeps its width. Both selects edit the same value; CSS shows one.
  - Above the row, only when needed: the "From <tool>" chip after a handoff, and the attached photo
    with its "no faces or names" box.
- **Disclaimer**: one line under the composer: "AI can make mistakes — check with your teacher. ·
  Privacy" plus an ⓘ button (`aria-expanded`). The ⓘ disclosure shows:
  - the AI note;
  - the full privacy note and the privacy link;
  - the voice note;
  - for signed-in students, the weak-topics note.

  The welcome message carries the full AI and privacy note once.
- **Not connected / daily limit**: the notice replaces the composer. It is not added to the
  conversation. Focus moves to the heading. `chatBlock()` in `rancho-chat.ts` decides which notice
  to show.
- **Answers**:
  - Tool cards come first, then the answer.
  - A finished answer gets a slim footer: subject · topic · level, 🔊 Listen, Copy, and on the
    Ask page 👍 / 👎. Feedback counts stay on the device (`AskAspire` stores them; the Rancho folder
    itself never touches storage), and the thanks line says so ("Thanks! Saved on this device
    only.").
  - Under the latest answer, one line: "Still stuck? Talk to a counsellor" (`?from=ask`, D-039).
- **Tap targets**: every control is at least 44 × 44 px (docs/agent-briefs.md): the header and
  composer buttons, the selects, the ⓘ, Listen / Copy / 👍 / 👎, the subject chips and the counsellor
  link. Where the look should stay small (the ✕ on the "From …" chip), a 32 px circle is drawn
  inside a 44 px button that overhangs into the gap around it. Listen / Copy overlap the bubble's
  bottom padding, so an answer is only 2 px taller than with 32 px buttons.
- **Sizes**:
  - Panel on phones (under 640 px): full-height sheet.
  - Panel from 640 px: `min(680px, 100dvh − header − margins)` tall, 26rem wide (28rem from `lg`).
  - Page card: `min(720px, 100dvh − 5.5rem)` tall by default. `AskAspire`'s `className` *replaces*
    the default size. For example, `/rancho` can pass `h-full min-h-0` inside a sized flex parent.

### Voice (`rancho-voice.ts`, `useRanchoVoice.ts`)

- **🎤 Speech to text** uses the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`).
  - Language: `en-IN` or `hi-IN`, following the answer language.
  - Interim words appear in the field, which is read-only while listening. Recognition stops at
    the pause after the question, or when the mic is pressed again or Esc. Nothing is sent
    automatically: the student reviews the text and presses Send.
  - Errors are shown under the composer (`role="alert"`): permission denied (with how to allow it),
    no microphone, offline, nothing heard.
  - The button is hidden where the API is missing (e.g. Firefox). Detection uses
    `useSyncExternalStore` with a `false` server snapshot, so there is no hydration mismatch.
- **🔊 Listen** on each finished answer uses `speechSynthesis`.
  - `speakableText()` first strips Markdown and turns maths into words: x², √, π, →, ⇌, fractions,
    units, and the odd LaTeX. "v² = u² + 2as" is read as "v squared equals u squared plus 2as", or
    in Hindi "v का वर्ग बराबर u का वर्ग प्लस 2as". The words are in `panel.voice.say`.
  - LaTeX (rare: the prompt asks for Unicode maths): `\int_0^{\pi}` → "integral from 0 to pi of",
    `\sum_{i=1}^{n}` → "sum from i equals 1 to n of", `\lim_{x \to 0}` → "limit as x tends to 0
    of", `\log_{10}` → "log to the base 10 of"; `\vec`, `\hat` and `\bar` are dropped; a command
    keeps its name before a subscript (`\alpha_1` → "alpha 1"). A leading minus is read before
    letters too ("-b" → "minus b"), and `[A]^2` → "A squared".
  - `speechChunks()` then splits the text into utterances of 180 characters or fewer, because
    Chrome cuts long speech off.
  - Only one answer is read at a time. Voices on the device are preferred (`pickVoice`).
  - Reading stops on Stop, New chat, sending, starting the mic, closing the panel or leaving the
    page.
- **Voice mode** (header toggle, `aria-pressed`): after a *spoken* question, the answer is read
  aloud automatically when it finishes. It is React state only and off by default.
- **Privacy**: the ⓘ note (`panel.voice.note`) and the privacy notice (`legal`, Student tools →
  Rancho item, en + hi) say that in Chrome the browser's speech service (Google) turns speech into
  text, that Aspire receives only the text the student sends (never audio), and that Listen uses
  the device's own voices. The same item says a tool handoff sends a short summary of the tool's
  result with the next question. It names the buttons generically ("an “Ask Rancho …” button in
  another tool"), because each tool has its own label ("Ask Rancho how to improve", "Ask Rancho
  about my weak topics", …).

### Tool cards (`RanchoToolCards.tsx`, `rancho-cards.ts`)

The `/api/ask` stream can carry `{ t: "card", card }` events (contract: `src/lib/ask/cards.ts`).
The decoder (`createNdjsonDecoder` in `ask-client.ts`) checks each card with `parseToolCard()`:

- known kinds only;
- well-formed numbers and dates;
- strings capped in length;
- same-site links only, otherwise the card or test is dropped.

Unknown kinds are skipped silently. Cards render inside Rancho's bubble, above the text:

- `rank_band`: exam, "Rank 2,700 – 6,000" (Indian grouping, like the predictor), the score or
  percentile it is for, the percentile range, a "Sample data" badge when `sample`, and "See
  colleges & full prediction".
- `mock_tests`: up to 3 tests, each with its exam, questions and minutes and a Start link (named by
  the test), plus a Leaderboard link.
- `plan`: days left (with singular and "today" forms), the exam date, the outline, and "Build my
  full plan".

Every link goes through `localePath`. A card link in the floating panel closes the panel.

### "Ask Rancho about this" handoffs (`rancho-handoff.ts`)

1. A tool calls `openRancho({ prompt, toolContext })`, which dispatches `RANCHO_OPEN_EVENT` on
   `window`. Nothing goes in the URL.
2. `RanchoLauncher` listens on every page where it is shown, and opens the panel with the
   handoff. On `/tools/ask` and `/rancho` the launcher is hidden, and the page chat listens
   instead.
3. `readOpenDetail()` cleans the event:
   - the prompt is capped to the question limit, with control characters removed;
   - the tool must be one of `predictor | mock-test | planner`;
   - the summary is clamped with `clampToolSummary`.
4. The chat prefills the field (the student still presses Send) and shows a removable "From
   Predictor — <summary>" chip above the composer. Focus goes to the field with the caret at the
   end. On a page, the chat card is first scrolled into view: all of it when it fits below the
   sticky header (`scroll-padding-top`), otherwise its bottom edge, so the field and Send are on
   screen. The card has no scroll margin of its own (it used to add 80 px to the page's 88 px,
   which on 768–800 px tall screens left the field just below the fold).
5. The next `POST /api/ask` includes `toolContext: { tool, summary }`, once. The chip then clears.
   The student's bubble shows "From Predictor". After a failed send, the context goes back to the
   composer with the question.
6. A draft (text and chip) survives the panel's unmount cleanup. React's dev Strict Mode
   double-mount runs that cleanup right after the panel opens with a handoff.

### Launcher

- `RanchoDock` (server) is mounted in `src/app/[lang]/(site)/layout.tsx`. It renders on the public
  site only, not in the portal, admin or CRM.
- The launcher is a 56 px round button at the bottom right, inside the safe-area insets, at `z-30`.
  It steps aside (fades out, leaves the tab order) while a page `<form>` is under it, and while a
  text field has focus on touch screens.
- `isRanchoHiddenPath()` hides it on:
  - `/tools/ask` and `/rancho` (and their sub-paths, in both locales);
  - mock-test attempts;
  - print.
- The panel is a native `<dialog>`:
  - On phones it opens with `showModal()` as a full-height sheet. Focus is trapped and the page is
    inert and doesn't scroll.
  - From 640 px up it opens with `show()` as a popover above the button.
  - Esc and ✕ close it, and focus returns to the launcher. While listening, Esc stops listening
    first.
- The conversation is React state only: no storage or cookies, and a test checks this. Each
  question is answered on its own (no conversation context is sent). Closing the panel aborts a
  streaming answer and stops listening and reading.
- When the chat goes away (unmounted, or hidden by Next's `<Activity>` with `cacheComponents`), the
  cleanup in a passive `useEffect`:
  - aborts the answer;
  - closes the dialog (a hidden modal would leave the next page inert);
  - drops a photo being prepared and revokes the photo URLs;
  - clears the turns.

### Photo questions

The panel and the page chat follow the same photo rules and code (the Ask page's `preparePhoto`).

- **Adding a photo.** A camera button ("Add a photo" / "फ़ोटो जोड़ें") is first in the composer row.
  It opens a hidden `<input type="file" accept="image/*">`. There is no `capture` attribute, so
  phones offer both the camera and the gallery. This is now also true on `/tools/ask`, which used
  `capture="environment"` before the shared chat. Once a photo is attached, the button's name
  changes to "Change photo".
- **Processing on the device.** `rancho-photo.ts` → `loadRanchoPhoto()`:
  1. It refuses files that aren't images ("unsupported"). Files with an empty type, which some
     Android pickers report, are tried anyway.
  2. It refuses files over 30 MB (`RANCHO_PHOTO_MAX_FILE_BYTES`) as "too large" before reading
     them. `preparePhoto()` decodes the original at full size before scaling it, so a huge file
     could crash the tab on a low-memory phone. Ordinary phone photos are a few MB. The shared
     `preparePhoto()` has no pixel-count cap. Adding one is up to the Ask page's owner, and it
     would protect the Ask page too.
  3. It calls the Ask page's exported `preparePhoto()`. This scales the photo to ≤ 1600 px and
     re-encodes it as JPEG through a canvas, which drops EXIF data, including GPS location.
  4. It checks the result against `maxImageBytes` from `GET /api/ask`. Until the status has loaded
     it uses `ASK_MAX_IMAGE_BYTES`, and it never allows more than that.
  Errors: "isn't a photo", "couldn't open" (for example HEIC on a desktop browser that can't decode
  it), and "too large". The panel shows them in a `role="alert"` line under the input row.
- **Before sending.** `RanchoPhotoAttachment` shows:
  - a thumbnail of the local preview, with alt text;
  - a remove button;
  - the box the API requires with a photo (`photoConsent: true`): "My photo shows only the
    question: no faces or names";
  - the note: don't include faces or names; location details are removed on your device; the photo
    is used only to answer this question and isn't stored.

  The question text is optional while a photo is attached (the API's rule: a question **or** a
  photo), and the placeholder changes to "Add a note about the photo (optional)…".

  Focus stays on the camera button after a photo is added. The required box is above it in the
  tab order, so the live region says "Photo added. Tick the box above to confirm it shows no
  faces or names."
- **Screen-reader feedback.** The "type a question" error has `role="alert"`. Pressing Enter in
  the field keeps focus there, so moving focus alone would not announce it. While a photo is being
  prepared, Send is `aria-disabled`. Pressing it then announces "Wait a moment: your photo is still
  being prepared."
- **Sending.** The body is `{ question (may be ""), subject, language, image: { mediaType:
  "image/jpeg", data: <base64> }, photoConsent: true }`. Sending without ticking the box is stopped
  in the browser, with an error under the checkbox. The API also refuses it.
- **Server errors.** `413` → "too large" and `422 image` → "couldn't use that photo" appear in
  Rancho's reply bubble. After a failed send, the photo goes back to the composer, except when the
  API refused the photo itself. The question also goes back.
- **Memory and object URLs.** The student's message shows the photo they sent (alt "Photo you
  sent"). Each preview is an object URL tracked by `createPreviewUrls()` in `rancho-photo.ts`.
  Every holder (the composer or a sent message) takes a hold, and the URL is revoked when the last
  holder lets go. That happens when the photo is removed or replaced, on "New chat", and when the
  panel goes away (unmounted on `/tools/ask`, or hidden by `<Activity>`; see above). A photo still
  being prepared at that moment is dropped and revoked. The base64 data exists only for the
  request.
- **Layout.** The attachment block sits above the input row, on both the phone sheet and the
  desktop popover. The whole footer (chip, photo, composer, disclaimer, ⓘ notes) is capped at 60%
  of the chat's height and scrolls inside on short screens. The message log stays visible and
  nothing is clipped.

### Tests

`src/components/rancho/*.test.ts` and `src/components/ask/ask-page.test.ts`. These run in Node, with
server rendering and mocked `fetch` (no real requests):

- `rancho-chat.test.ts`: the request and stream contract; the panel layout (one composer row,
  chips only in the empty state, the one-line disclaimer with the collapsed ⓘ, voice controls
  hidden without support); what replaces the composer; enquiry links.
- `rancho-voice.test.ts`: feature detection, transcripts, error mapping, voice choice, speakable
  text (en + hi, Unicode maths and LaTeX) and chunking.
- `rancho-cards.test.ts`: card checking, the decoder, `askRancho` with cards, rendering of each
  kind (en + hi), unknown kinds ignored, cards inside the answer bubble.
- `rancho-handoff.test.ts`: event cleaning, the `openRancho()` → listener round trip, the prefilled
  composer with its chip, and `toolContext` in the POST body.
- `rancho-photo.test.ts`, `rancho-launcher.test.ts` (hidden on `/rancho` too),
  `rancho-mascot.test.ts`.

Interactive behaviour was checked in headless Chrome with mocked `/api/ask` and stubbed speech
APIs:

- open the panel from a handoff event, check the prefill and chip, send, and check the POST body;
- mic → interim text → final text → Send → voice mode reads the answer;
- Listen;
- the limit notice replacing the composer.
