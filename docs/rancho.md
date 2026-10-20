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

## Floating launcher and chat panel (RANCHO-UI)

- `RanchoDock` (server) is mounted in `src/app/[lang]/(site)/layout.tsx`. It renders on the public site
  only, not in the portal, admin or CRM. It loads the `rancho` messages and renders `RanchoLauncher` (client).
- The launcher is a 56px round button at the bottom right, inside the safe-area insets. It sits at
  `z-30`: above page content, below the sticky header and its menu (`z-40`) and full-screen overlays.
  It is hidden on `/tools/ask` (both locales), during a mock-test attempt (`/tools/mock-tests/<id>`)
  and in print.
  It **steps aside** (fades out and leaves the tab order) while part of a page `<form>` is under it.
  For example, the home hero enquiry form on phones. It also steps aside while a text field has focus
  on touch screens, so the on-screen keyboard can't push it over the field. The footer has extra
  bottom padding so its last row scrolls clear of the button.
- The panel (`RanchoChatPanel`) is lazy-loaded on first open, and prefetched on hover or focus. It is a
  native `<dialog>`:
  - On phones (under 640px) it opens with `showModal()` as a full-height sheet. Focus is trapped and the
    page is inert and doesn't scroll.
  - From 640px up it opens with `show()` as a non-modal popover above the button.
  - Esc and the close button close it, and focus returns to the launcher. The entry motion only runs
    without reduced motion.
- It is a chat on the same backend as the Ask page: `GET /api/ask` returns the status and allowance,
  and `POST /api/ask` takes `{ question, subject, language }`, plus `image` and `photoConsent` when a
  photo is attached, and streams NDJSON (`rancho-chat.ts`). The answer language follows the page
  locale. Students can type a question, send a photo of it, or both (see "Photo questions" below).
- It reuses `AnswerContent`, `createNdjsonDecoder`, `failureFromResponse` and `splitAnswer`.
- It handles these states:
  - Not connected: a notice with a link to the enquiry form (`?from=ask`).
  - Daily limit: a notice with the hours left and, for guests, a sign-in link.
  - Busy, network, interrupted, blocked and generic errors.
  - Stopped, truncated and refused answers.
- Closing the panel, "New chat", or leaving to `/tools/ask` aborts an answer that is still streaming.
- The conversation lives only in React state, including sent photos (as object URLs). Nothing goes to
  storage or cookies, and a test checks this. It survives closing the panel and client-side
  navigation within the public site, and "New chat" clears it. Each question is answered on its own
  (no conversation context is sent).
- When the panel goes away, the chat is cleared as if "New chat" had been pressed: a streaming
  answer is aborted, photos are freed and the dialog is closed. "Goes away" means unmounted (on
  `/tools/ask`) or hidden. With `cacheComponents`, Next hides a route the student leaves (React
  `<Activity>`) instead of unmounting it. It keeps the state but cleans up effects. RanchoDock sits
  in the `(site)` layout, so moving on to a `(portal)` page hides it. The reset runs in the
  cleanup of a passive `useEffect`, not a layout effect. A layout effect's cleanup would also run
  when a Suspense boundary above falls back, which would wipe the chat. This means that after
  Back, no message points at a revoked photo URL
  and no turn is stuck "waiting". It also means that no hidden modal dialog leaves the portal page
  inert.
- Under the composer, a small "Open the full Rancho page" link keeps `/tools/ask` one tap away. It
  replaced the old "Photo question? Open Rancho" link, because photos now work in the panel. Its
  text is small, but its hit area is 32 px tall (WCAG 2.5.8, the same height as the subject chips).
- Copy: the `rancho` namespace (`src/i18n/messages/{en,hi}/rancho.ts`, photo strings under
  `panel.photo`).
- Tests: `src/components/rancho/*.test.ts` (photos: `rancho-photo.test.ts`).

### Photo questions in the panel

The panel follows the same rules as the Ask page's photo field and reuses its code. Nothing in
`src/components/ask/**`, `src/lib/ask/**` or the API changed.

- **Adding a photo.** A camera button ("Add a photo" / "फ़ोटो जोड़ें") sits next to Send and opens a
  hidden `<input type="file" accept="image/*">`. There is no `capture` attribute, so phones offer
  both the camera and the gallery. (The Ask page uses `capture="environment"`, which goes straight
  to the camera on Android.) Once a photo is attached, the button's name changes to "Change photo".
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
- **Layout.** The attachment block sits above the input row, on both the phone sheet (checked at
  375 × 740 and 360 × 640) and the desktop popover. The composer is capped at 70% of the panel
  height and scrolls inside on short screens, so the message log stays visible and nothing is
  clipped. For example, a 1280 × 600 desktop has a 424 px popover.
