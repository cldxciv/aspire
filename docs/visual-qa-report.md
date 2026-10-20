# Homepage Redesign — Visual & Functional QA Report (Wave 2)

Auditor: qa-auditor (independent, read-only on application files) · Date: 2026-10-20 (runs 02:10–02:55 IST)
Scope: homepage showcase milestone (`docs/homepage-implementation-plan.md` §4–§6, decisions D-019…D-026 incl. D-021a), plus regression of existing routes and forms.

## 1. Summary

| | Result |
|---|---|
| Blockers | **0** |
| High | **0** |
| Medium | **2**: M-1 soft or upscaled photo panels; M-2 production build predates the latest source edits (release gate) |
| Low | **7** (visual polish, one preview-only payload projection) |
| Recommendation | **Conditional go** for this milestone (internal or owner preview). Rebuild production from current source and re-run the production smoke (§9) first. Not a public-launch sign-off: content approvals and live enquiry delivery are outside this milestone. |

Every check in the brief was run in a real browser (headless Chrome driven over CDP) or with curl, and the results below are what was observed. Nothing is marked as passing that was not run.

## 2. Environment, tools and commands

| Item | Value |
|---|---|
| OS / Node | Windows 11 Pro 10.0.26200 · Node v25.7.0 |
| Preview | `http://localhost:3000`, dev server (`next dev`), placeholder content on, 24px preview banner. Already running; not started or stopped by QA. |
| Production | `http://localhost:3100`, `next start`, placeholders hidden. Build `.next/BUILD_ID` = `uDF1JbWiHzN5vTv7jU_0t`, written **02:08:08**. Not started or stopped by QA. |
| Browser | Claude in Chrome tools **unavailable** (ToolSearch: "No matching deferred tools found"). Used **headless Chrome 155.0.8059.82** over the DevTools Protocol, one temporary profile per run under the scratchpad (`…/scratchpad/qa-wave2/chrome-*`), never the user's Chrome. Viewports set with `Emulation.setDeviceMetricsOverride` (exact CSS viewport, DPR 1 unless noted; `mobile:true` + touch for 375/768). Every run closed its browser (`Browser.close`, then `taskkill /T`); a final process check found **0** leftover QA processes. |
| Rate limit | Each browser run sent its own `X-Forwarded-For` (`Network.setExtraHTTPHeaders`, 10.77.x.y), so QA submits never shared the `unknown` bucket with other agents. That was 11 enquiry POSTs to `:3000` in total, all `200 not_configured`. QA sent **no** POSTs to `:3100`. |
| Not re-run (cited) | Lead's results: lint pass; `next build` succeeds; production homepage 0 DEMO badges / 0 imported names, phones, emails / 0 `sourceRef`/`consentStatus`; production hero POST → `not_configured`. |

Scripts (scratch, not part of the repo) are in `C:\Users\ADMIN\AppData\Local\Temp\claude\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53\scratchpad\qa-wave2\`. `cdp-lib.mjs` is the harness; the check scripts are `firstfold.mjs`, `hero.mjs`, `chrome.mjs`, `sections.mjs`, `rail.mjs`, `forms.mjs`, `centreimg.mjs`, `upscale.mjs`, `perf.mjs`, `secshots.mjs`, `docshots.mjs` and `fix13.mjs`; `leak.cjs` and `formdiff.cjs` handle the payload scan and form-markup diff.

```sh
# gates (re-run by QA, 02:37, after the last source edits at 02:31–02:33)
npm run typecheck            # tsc --noEmit → exit 0
npm test                     # vitest run → 26 files, 528 tests passed (lead reported 509 earlier; tests were added since)

# route sweep (dev): status, bytes, <h1> and <main> counts per route
curl -s -o html/<route>.html -w "%{http_code} %{size_download} %{time_total}" http://localhost:3000<route>

# production payloads
curl -s -D prod/home.headers -o prod/home.html http://localhost:3100/
curl -s -L -H "RSC: 1" -o prod/home.rsc http://localhost:3100/          # same for /results
curl -s http://localhost:3100/robots.txt
node leak.cjs prod/home.html prod/home.rsc prod/_results.html prod/_results.rsc html/home.html html/home.preview.rsc

# browser checks (each launches its own headless Chrome)
node firstfold.mjs ./shots2   node hero.mjs ./shots2     node chrome.mjs ./shots
node sections.mjs ./shots     node rail.mjs ./shots      node forms.mjs ./shots
node upscale.mjs              node perf.mjs ./shots      node docshots.mjs
```

> **Moving target:** `HeroEnquiryForm.tsx`, `hero-steps.ts`, `src/lib/contracts/enquiry.ts`, `src/content/aspire-assets.ts`, `TestimonialsSection.tsx` and `src/test/mockup-strings.test.ts` were edited at 02:31–02:33, during this audit. The hero-form and first-fold checks on `:3000` were therefore **re-run against the current code** (02:41–02:44), and the tables below show those results. All other `:3000` checks ran before or after the edits and don't depend on the changed files. Every `:3100` result describes the 02:08 build (see M-2).

## 3. Results per check

### 3.1 Regression

| Check | Result | Evidence |
|---|---|---|
| All 31 page routes on `:3000` return 200 with exactly one `<h1>` and one `<main>` | **Pass** | 13 public, 4 program detail, 2 resource detail, 12 portal routes: each 200, h1 = 1, main = 1 (SSR HTML) |
| `/programs/does-not-exist` → 404 | **Pass** | 404. `/resources/does-not-exist` → 404 and `/this-route-does-not-exist` → 404 too. The slug 404s' SSR body has 0 h1/main, the same as the Phase 1 baseline (old M-1), so this is not a regression |
| `/admissions` form unchanged | **Pass** | Form markup byte-identical to the pre-Wave-1 baseline HTML (React ids normalised; 6,688 chars). Empty submit → 5 errors, focus on `name`, no request. One valid submit → 1 POST (200) → "Your enquiry has not been sent…", values kept, no console errors |
| `/contact` form unchanged | **Pass** | Markup identical to baseline (4,968 chars). Empty submit → 4 errors, focus on `name`, no request. One valid submit → 1 POST → honest "not sent" warning, values kept, no console errors |
| Portal routes | **Pass** | 12 portal pages (student ×4, parent ×3, admin ×5) 200 in preview (h1/main = 1). Production APIs: `/api/student/me` and `/api/admin/enquiries` → 401 JSON; `/api/centres`, `/api/programs`, `/api/results` → `{"ok":true,"data":[]}` |

### 3.2 First fold (homepage)

| Check | Result |
|---|---|
| Form step 1 fully visible, including Next and the privacy line, with no clipping, at 1280×600, 1366×657, 1440×789, 1440×900 and 1920×1080, in **both** modes | **Pass** (10/10). Tightest is 1280×600 preview, with 87px to spare below the privacy line |
| No ancestor clips the card; no truncated text in the card | **Pass** (the only flags were the sr-only step labels and colon, which are hidden by design) |
| No horizontal overflow at any measured viewport | **Pass** (`scrollWidth === innerWidth` everywhere) |
| 1024×768, 768×1024 and 375×812 screenshots | **Done**: step 1 is fully in view at 1024 and 768. At 375 the card stacks below the CTAs as intended; its top shows at y≈489 and the rest is one scroll away |
| Comparison with `01-approved-first-fold.png` | See §5 |

### 3.3 Hero form (interactive, `:3000`, re-run on current code: 47/47 assertions pass)

| Check | Result | Observed |
|---|---|---|
| Empty Next on step 1 → errors + focus on first invalid field, with `aria-invalid` and `aria-describedby` | **Pass** | `name` and `classOrExam` get `aria-invalid="true"`, and `aria-describedby` points at the visible messages ("Enter a name (at least 2 characters)", "Select a class / target exam"). Focus lands on `name`. Summary notice: "Please check the highlighted fields · 2 fields need attention. Nothing has been sent yet." |
| Errors clear when corrected | **Pass** | |
| Valid step 1 → step 2; focus on step heading; "Step 2 of 3" | **Pass** | Focus moves to the `h3` "Step 2 of 3: Contact Details"; step 2 `li` has `aria-current="step"`; step 1 is marked "(completed)" (sr-only) with a check icon |
| Back keeps values | **Pass** | Back → step 1 with name and class preserved, focus on the step-1 heading |
| Enter acts as Next | **Pass** | Enter in the name field (step 1) and the mobile field (step 2) advances |
| Step 2: parent/guardian name and mobile required; no email field | **Pass** | Both fields error when empty; the phone's `aria-describedby` = hint + error; no `input[type=email]` / `name=email` anywhere in the form |
| Step 3: centre select (preview options), message box, consent | **Pass** | Options: "Not sure yet" + 4 centres "(verify availability)"; message is optional; submit without consent → consent error + focus, **0 requests** |
| Submit while not connected → honest warning, data kept, no success panel | **Pass** | 1 POST → `200 not_configured` → "Your enquiry has not been sent … nothing was sent or stored … Your details are still in the form." All values kept, still on step 3, no "Enquiry received" panel. Button reads "Check my details" |
| Payload | **Pass** | Keys: `source`(hero), `name`, `classOrExam` (raw), `guardianName`, `phone`, `preferredCentre`, `consent`, `website`; no `email` |
| Keyboard-only completion | **Pass** | From page top: 16 Tabs (skip link → logo → 9 nav items → Enquire Now → login → 2 hero CTAs) reach Student Name. Then type, Tab, arrow-key select, Tab to Next, Enter; Tab to guardian, type, Tab, type, Enter; Tab to centre, arrow key, Tab to message, Tab to consent, Space; Tab past privacy link, contact link and Back to "Check my details"; Enter → 1 POST, warning. Focus stays on the submit button |
| Step indicator `aria-current` | **Pass** | `ol[aria-label="Enquiry steps"]`; exactly one `li[aria-current="step"]` per step |
| Double-click submit → one request | **Pass** | Two rapid presses (`clickCount` 1 and 2) → **1** POST |
| Mobile 375: step change keeps the card visible | **Pass** | After Next, the step-2 heading is focused and the card top (84) sits below the sticky header (64) |
| No console errors | **Pass** | 0 errors or exceptions across the mouse, keyboard and mobile runs |
| `:3100` production: no centre field | **Pass** | Step 3 reached; `preferredCentre` absent |

### 3.4 Header and footer

| Check | Result | Observed |
|---|---|---|
| Programs ▾ / Resources ▾: Enter opens, Escape closes and returns focus | **Pass** | `aria-expanded` toggles; the panel is a plain disclosure (no `role=menu`); focus returns to the button |
| Click outside closes; Tab out of the panel closes | **Pass** | Both dropdowns |
| Mobile menu at 375 | **Pass** | "Open menu" ↔ "Close menu" with `aria-expanded`; 16 links incl. sub-items, Student/Parent Login and Enquire Now; every target ≥ 44px; panel scrolls (`max-h` 100dvh); Escape closes and returns focus to the toggle; a press outside (preview banner) closes it; a link click navigates (`/faculty`) and closes it |
| Focus ring gold on navy, blue in white cards and dropdowns (D-024) | **Pass** | Keyboard-modality audit of every focusable on `/`. **Preview** (72): 42 dark-surface elements gold `rgb(244,196,78)`; 14 inside `data-surface="light"` blue `rgb(23,104,212)`; 15 on white sections blue. **Production** (40): 30 gold, 9 blue. Dropdown links blue; hero CTAs, header, footer and centres navy panel gold; hero form fields blue. Exceptions: the skip link (navy ring on white, 13.6:1) and the logo link (white ring on navy, 13.6:1). Program rows and article cards use stretched links whose ring sits on the row or `::after` (blue, 3px). No ring was below 3:1 contrast (one apparent fail, "View all centres", was a measurement artefact: the navy panel is a `::before` background) |
| Login icon has an accessible name | **Pass** | `aria-label="Student and parent login"`, 44×44, icon `aria-hidden` |

### 3.5 Sections (preview, 1440 unless noted)

| Check | Result | Observed |
|---|---|---|
| Results rail prev/next | **Pass** | 1024: Next scrolls 0→230, then disabled at end; Prev back to 0. 768: 0→372→744, Prev →372. 375: 0→284→567. Arrow keys scroll the focusable list. Live text "Showing result N of 4". Buttons 44×44. No `<img>` in result cards (D-019). At 1440 all 4 cards fit, so both buttons are disabled (see L-3) |
| Faculty cards | **Pass** | 4 cards (`InitialsAvatar`, no person images), DEMO on each, "Meet our faculty" → `/faculty` |
| Centres picker | **Pass** | 4 pins + 4 list buttons with `aria-pressed` (exactly one true); clicking a pin or list item updates both groups, the card heading and the polite live region ("Showing Hamirpur Central Hub"); pins operable with Tab + Enter; pins 44×44; "Illustrative image" label present. Card images stay within the registry `maxWidth` (= 1.25 × file width by design) |
| Impact chart has a table alternative | **Pass** | `details > summary` "Show data as a table" → `table` with caption "…(list entries, not ranks)", `th scope=col/row`, 5 year rows; chart `aria-label` lists every value; DEMO + "not ranks" shown; "top ranks" absent (D-025) |
| CTA "Call Us" uses `tel:` | **Pass** | "Call Us" → `tel:+919816623676` (DEMO); Enquire → `#home-enquiry`. Production: Enquire button only, 0 `tel:` |
| No horizontal overflow at 320, 375, 768, 1024, 1440 and 1920, both modes | **Pass** | 12/12: `scrollWidth === innerWidth`, no element past the right edge |
| Images load; none broken | **Pass** | Preview 16/16 and production 9/9 `complete` with `naturalWidth > 0`; every `<img>` has `alt`; 0 failed or 4xx network requests. Several are visibly soft (M-1) |
| Heading order | **Pass** | Preview: 33 headings, one h1, no skipped levels (h1 → h2 "Enquire Now" → h3 step → h2 sections → h3 items). Production: 12 headings, one h1, no skips |
| Console | **Pass** | Preview `/`: 0 errors, 0 warnings. (The "N" Next.js dev indicator in preview screenshots is dev-only.) |

### 3.6 Production leakage (`:3100`, build of 02:08)

| Check | `/` HTML | `/` RSC | `/results` HTML | `/results` RSC |
|---|---|---|---|---|
| Imported result names (18) / multi-word ranker names (257) / single-word ranker names ≥5 chars (322) | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Faculty (8), testimonial authors (12), centre names (4) | 0 | 0 | 0 | 0 |
| Phones (15 variants), emails (5), stat values (12) | 0 | 0 | 0 | 0 |
| `sourceRef`, `consentStatus`, `thechunkmedia`, `"placeholder"`, `DEMO`, "Preview build", "verify availability" | 0 | 0 | 0 | 0 |

- **Positive control:** the same scan of the preview `/` HTML finds 6 result names, 4 faculty, 3 authors, 4 centres, phones, email, stat values and DEMO, so the scanner works.
- **Client bundles** (`.next/static`, 22 chunks): 0 imported names, phones or centre names. `consentStatus`/`sourceReference` appear only as property reads in the results-card code, and `aspireiit.in` only as the `siteConfig` default URL. These are code, not data.
- **Robots:** production `robots.txt` has `Allow: /`, disallows `/api/`, portals and `/login`, and lists a sitemap. There is no `<meta name="robots">` and no `X-Robots-Tag` on `/`, so it is **indexable**. Preview (`:3000`) has `noindex, nofollow` and `Disallow: /`. **Pass.**
- **Console on production `/`:** 0 errors, 0 warnings, 0 failed requests. **Pass.**

### 3.7 Performance sanity (production, cache disabled, fresh page per run, localhost timings)

| Run | Initial load | After full scroll | Hero image request | LCP element / time |
|---|---|---|---|---|
| 1440×900 DPR 1 | 45 req · **749 KB** (JS 257, fonts 149, images 249, RSC prefetch 43, HTML 22 KB transfer / 135 KB decoded) | 55 req · **797 KB** | `/_next/image?url=…himalaya-dhauladhar-ridge-hero.jpg&w=1920&q=75` → **220 KB WebP** | hero `<img>`, 280 ms |
| 1366×657 DPR 1.25 | 43 req · 730 KB | 53 req · 778 KB | `w=1920`, 220 KB | hero, 508 ms |
| 375×812 DPR 2 | 28 req · 485 KB | 52 req · 602 KB | `w=750`, 42 KB | hero, 628 ms |
| 375×812 DPR 1 | 28 req · 463 KB | 52 req · 568 KB | `w=640`, 30 KB | hero, 412 ms |

Nothing reaches 1 MB. The hero is preloaded and responsive. The source photo is 2000×1249 (516 KB JPEG), served as WebP. Localhost timings say nothing about real-network performance.

## 4. First-fold measurements

CSS px from the viewport top. "Spare" = viewport height − bottom of the lower of Next and the privacy line. "Trust" = trust row fully in the fold. The postcard shows at `xl` + `tall` only (D-023).

| Viewport | Mode | Header bottom | Card top–bottom | Next bottom | Privacy bottom | Spare | Step 1 visible | Trust | Postcard |
|---|---|---|---|---|---|---|---|---|---|
| 1280×600 | preview | 96 (24 banner + 72) | 120–533 | 465 | 513 | **87** | **Yes** | yes | – |
| 1280×600 | production | 72 | 96–525 | 441 | 505 | **95** | **Yes** | yes | – |
| 1366×657 | preview | 96 | 120–533 | 465 | 513 | 144 | **Yes** | yes | – |
| 1366×657 | production | 72 | 96–525 | 441 | 505 | 152 | **Yes** | yes | – |
| 1440×789 | preview | 96 | 136–571 | 497 | 547 | 242 | **Yes** | yes | yes |
| 1440×789 | production | 72 | 112–563 | 473 | 539 | 250 | **Yes** | yes | yes |
| 1440×900 | preview | 96 | 136–571 | 497 | 547 | 353 | **Yes** | yes | yes |
| 1440×900 | production | 72 | 112–563 | 473 | 539 | 361 | **Yes** | yes | yes |
| 1920×1080 | preview | 96 | 136–571 | 497 | 547 | 533 | **Yes** | yes | yes |
| 1920×1080 | production | 72 | 112–563 | 473 | 539 | 541 | **Yes** | yes | yes |
| 1024×768 | preview | 96 | 136–678 | 572 | 654 | 114 | Yes | yes | – |
| 1024×768 | production | 72 | 112–654 | 548 | 630 | 138 | Yes | yes | – |
| 768×1024 | preview | 96 | 502–952 | 878 | 928 | 96 | Yes | no (below card) | – |
| 768×1024 | production | 72 | 478–928 | 854 | 904 | 120 | Yes | yes | – |
| 375×812 | preview | 88 | 489–1023 | 921 | 1003 | −191 | No (stacked by design) | no | – |
| 375×812 | production | 64 | 465–999 | 897 | 979 | −167 | No (stacked by design) | no | – |

Production numbers come from the 02:08 build, whose privacy line ("We'll only use these details…") wraps to two lines. The current source ("We use these details to respond to your enquiry.") fits on one line at desktop widths, so a rebuild should gain about 16px of spare space.

## 5. Comparison with `reference/homepage/01-approved-first-fold.png`

Intentional, plan-approved deviations, all as specified:
- Eyebrow and line 3 of the H1 ("Let's Build Yours.") replace unapproved claims (§1.4).
- "Our Story" has no play icon (no video, §1.5).
- A login icon replaces search (D-022).
- No large student photo; instead, the labelled "Illustration" postcard at `xl` + `tall` (D-023).
- The current-step circle has a navy ring (§5).
- The neutral privacy line plus an amber "not connected yet" line (§5).

| Area | Observation |
|---|---|
| Hero image brightness and overlay | **Noticeably darker and cooler than 01.** The design is a sunlit, warm photo (green forest, blue sky, people). The implementation is a blue-grey Dhauladhar ridge under navy 88%→72% across the text column, then 15% over the card side. Mountains read clearly only on the right. Readability is good, but the mood is closer to "night" than the design's daylight. The owner should review this; it isn't a defect. |
| Typography | Matches: Source Serif 4 bold H1 on 3 lines (line 3 gold), about 56px at 1440 vs about 60px in the design; Inter body; gold uppercase tracked eyebrow; serif "Enquire Now" in the card. |
| Card layout | Matches the structure: title + step circles top right, subtitle, divider, step heading, inset-label fields with leading icons (D-021a), full-width gold "Next Step →", lock + privacy line. Additions: "Step 1 of 3" / "* Required" row, the not-connected line and a privacy link. The card is 432px wide at `xl` (design about 425px). |
| Step circles | 32px circles: current gold with navy ring, upcoming white with border, completed navy with a check. Below `xl`, short labels show under the circles (Student / Contact / Preferences). |
| Trust row | The design has one line of 4 with dividers. The implementation is a 2×2 grid at 1280–1535px and one line with dividers at ≥1536px, where every label wraps to two lines (L-5). |
| Vertical rhythm (1440×900) | The CTA row sits about 80px below the lead because the 150px postcard centres it (L-4). In the design, CTAs follow the lead closely and the trust row sits at the bottom of the hero. |
| Below the fold | Preview shows the stats band (number misalignment, L-2) and then Results, as in 02. Production hides stats, so the fold flows hero → "Results, year by year" (honest fallback). |

## 6. Screenshots (`docs/qa/homepage/`)

| File | What |
|---|---|
| `01-home-1440x900-preview.jpg` | Desktop 1440 first fold, preview (current code) |
| `02-home-1440x900-production.jpg` | Desktop 1440 first fold, production (02:08 build) |
| `03-home-1280x600-preview.jpg` | 1280×600 first fold, preview: tightest fit (87px spare) |
| `04-home-1366x657-production.jpg` | 1366×657 first fold, production |
| `05-home-1024x768-preview.jpg` | 1024×768 (hamburger, 400px card) |
| `06-home-768x1024-preview.jpg` | Tablet 768 |
| `07-home-375x812-preview-top.jpg`, `08-home-375x812-preview-form.jpg` | Mobile 375 (DPR 2): top of hero; scrolled to the form |
| `09-mobile-375-menu-open.jpg` | Mobile menu open |
| `10-header-programs-dropdown-open-1440.jpg` | Programs dropdown open, keyboard focus (blue ring) on the first link |
| `11-hero-step1-errors-1440.jpg` | Step 1 validation errors |
| `12-hero-step3-preview-1440.jpg` | Step 3 (centre select, message, consent, not-connected notice) |
| `13-hero-not-sent-warning-1440.jpg` | Honest "Your enquiry has not been sent" after submit; data kept |
| `14-hero-step3-production-no-centre-1440.jpg` | Production step 3: no centre field |
| `15-stats-band-alignment-preview.jpg` | Evidence for L-2 |
| `16-why-aspire-soft-image-preview.png` | Evidence for M-1 |
| `17-results-rail-preview.png` | Evidence for L-3 |
| `18-centre-card-preview.png` | Centre card with "Illustrative image" label |

## 7. Findings

### Blocker
None.

### High
None.

### Medium

**M-1: Photo panels are served too small for their `object-cover` crop and look soft.**
Measured device-pixel upscaling (box ÷ delivered pixels × DPR) on production:
- `himalaya-blue-ridge.jpg` (Why Aspire panel, 336×416 box): **×1.63** at DPR 1 and ×1.66 at DPR 2. Visibly blurry on a standard laptop (screenshot 16).
- `students-taking-notes-class.jpg` (Programs, 293×366): ×1.27 at DPR 1 and ×1.53 at DPR 2.
- Hero background on mobile (375×1119 box, DPR 2): **×4.78**. It's mostly masked by the 80–86% overlay, so the impact there is low.

Cause: `sizes` describes the box *width* (e.g. `(min-width:1200px) 360px`), but these boxes are portrait while the photos are landscape. `object-cover` scales them by height, so the browser picks a candidate that is too narrow.
- **Repro:** open `/` at 1440×900 (either mode) and look at the "Rooted in Himachal" panel; or in DevTools compare `img.getBoundingClientRect()` with the delivered image's pixel size.
- **Likely files:** `src/components/home/WhyAspire.tsx` and `src/components/home/ProgramPaths.tsx` (their `sizes`). For mobile, `src/components/home/HomeHero.tsx` (`sizes="100vw"`).
- **Fix:** derive `sizes` from the width the cover crop needs (≈ box height × image aspect, e.g. `640px` for the Why Aspire panel), or crop the source to the panel's aspect. For the mobile hero, accept it or use e.g. `sizes="(max-width: 1023px) 200vw, 100vw"` at a small byte cost.

**M-2: The production build under test predates the latest source edits (release gate, not a code defect).**
`.next/BUILD_ID` was written at 02:08:08. Six files changed at 02:31–02:33: the hero form, step copy, enquiry contract, asset registry, testimonials and the guard test.
- **Repro:** the `:3100` privacy line reads "We'll only use these details…" while `:3000` reads "We use these details to respond to your enquiry."
- Every production result in this report (first fold, leakage, no centre field, console, performance) therefore describes the 02:08 build.
- **Action (lead):** rebuild, then re-run the production smoke in §9 before sign-off.

### Low

**L-1: The `/results` page sends internal fields to the client archive (preview only today).**
- **Repro:** `curl -s -L -H "RSC: 1" http://localhost:3000/results`. The response has `"consentStatus"` ×18, `"sourceReference"` ×18 (the demo-site URL) and `"school"` ×5 in `ResultsArchive` props. The production payload has 0, because no results are published.
- Plan §3 (Wave 0) asked for a whitelisted `ResultsArchive` view model without `consentStatus`/`school`. `/` is clean.
- **Files:** `src/app/(site)/results/page.tsx:63` (`results.map(withPermittedName)` passes full records) and `src/components/results/ResultsArchive.tsx`.

**L-2: Stats band numbers aren't aligned (preview only; production hides the band).**
- Each item is vertically centred, so "4" and "715" sit about 15px higher than "13+" and "5,000+", and the icons drift (screenshot 15). The design aligns the numbers on one line.
- **File:** `src/components/home/StatsBand.tsx`. Align the items to the top or put the icon and text on a shared top line.

**L-3: Results rail polish at ≥1280px.**
- All 4 cards fit, yet "1 of 4" and two disabled prev/next buttons still show, and "Showing result 1 of 4" is announced although all four are visible.
- The card headers differ in height ("JEE ADVANCED" wraps), so the rank and year lines don't align across cards (screenshot 17).
- **File:** `src/components/home/ResultRail.tsx`. Hide the controls when `scrollWidth <= clientWidth`, and give the exam label a fixed or two-line height.

**L-4: Large gap between the lead and the CTAs at `xl` + `tall`.**
- The 300×150 postcard is in the CTA row (`flex items-center justify-between`), so the buttons are centred on it, about 80px below the lead (vs 28px when the postcard is hidden). This differs from 01.
- **File:** `src/components/home/HomeHero.tsx:128–139`. Try `items-end`/`items-start`, or position the postcard absolutely.

**L-5: Trust labels wrap to two lines at ≥1536px.**
- The one-line trust row is squeezed into the about 690px text column, so each label wraps ("Experienced / Faculty"); in the design they sit on one line. Between 1280 and 1535px it's a 2×2 grid.
- **File:** `src/components/home/HomeHero.tsx:149`. Use `whitespace-nowrap` with a smaller gap, or let the row span under the card.

**L-6: In Why Aspire, the "DEMO · PENDING VERIFICATION" badge touches the "Our story" button with no gap** (preview only, screenshot 16).
- **File:** `src/components/home/WhyAspire.tsx`, the badge + button row needs a `gap`.

**L-7: Step 3 shows two near-identical "not connected" messages after submit.**
- The pre-submit info notice ("Online enquiries aren't connected yet…") stays above the button while the post-submit warning ("Your enquiry has not been sent…") appears below it. The card grows to 833px at 1440 (screenshot 13).
- At 1280×600 the warning appears below the button and may need a scroll; it is announced through `aria-live`.
- **File:** `src/components/forms/HeroEnquiryForm.tsx:402–407`. Optionally hide the info notice once `state.kind === "not_configured"`.

### Observations (no action)
- Centre-card images reach up to 1.25× their file width. This is within the registry's documented `maxWidth = width × 1.25` (`src/content/aspire-assets.ts`), so D-019 is respected.
- In the first multi-viewport run, production at 375px reused a cached `w=1920` hero. Fresh, cache-disabled runs served `w=640` (DPR 1) and `w=750` (DPR 2) as expected.
- The first mobile-menu navigation test timed out at 2.5s while dev compiled `/about`. A retest with polling passed.
- When a step heading receives focus after a mouse click, it shows the blue focus ring. That's acceptable, and it helps show where focus went.
- Test count is now 528 (lead reported 509 earlier), consistent with tests added during the 02:31 edits.

## 8. Not covered or limits
- Real touch devices, iOS Safari, Firefox, screen-reader output (NVDA/VoiceOver) and Windows high-contrast mode were not tested. Accessibility was checked through DOM/ARIA state, focus movement and computed styles.
- Visual comparison with the design was by eye on screenshots, not pixel diffing.
- Lint and `next build` were not re-run by QA (the brief forbids `next build`; lint results are cited from the lead).
- `/` and `/results` were scanned for leakage, plus `.next/static` and the public content APIs. Other production routes were not scanned in this wave.
- No security conclusions are drawn from this limited scan.

## 9. Release recommendation

**Conditional go for this milestone** (homepage redesign in preview/owner review). There are no blockers or high-severity issues. Every functional, accessibility and leakage check in the brief passed on the code as observed.

Before signing off the milestone:
1. **Rebuild production from the current source** and re-run the production smoke:
   - `/` and `/results` HTML + RSC leakage scan (`leak.cjs`);
   - first fold at 1280×600 and 1440×900;
   - step 3 without a centre field;
   - hero POST → `not_configured`;
   - console clean on `/` (M-2).
2. Fix M-1 (soft photo panels) or have the owner explicitly accept it.
3. Low items can follow in a polish pass. L-1 should be fixed before any result is published.

This is not a public-launch sign-off. Launch still depends on:
- owner and Aspire approval of the hero copy and claims;
- verified content replacing placeholders (production currently hides stats, results, faculty, centres, testimonials and impact);
- consented photography to replace the AI postcard;
- a live enquiry destination, since the form honestly reports "not sent" today.
