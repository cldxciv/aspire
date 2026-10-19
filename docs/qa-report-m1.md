# QA Report — Milestone 1 (Skeleton)

**Agent:** QA / Accessibility / Security (Agent 5) · **Date:** 2026-10-19 · **Scope:** runtime + visual pass on the dev server (placeholder content and portal preview on), plus security spot checks. Report only; no application code was changed.

**Bottom line:** No Critical or High defects. Two Medium defects should be fixed before the skeleton is shown to the client: the broken 404 on `/programs/*` and `/resources/*`, and Escape/focus handling in the mobile menu. Both fixes are small. Everything else is Low or informational. **Recommendation: accept the skeleton milestone conditionally** (see §6).

---

## 1. Environment

| Item | Value |
|---|---|
| OS | Windows 11 Pro 10.0.26200 |
| App | Next.js 16.4.2 (Turbopack), React 19.3.0, Tailwind 4; project root `C:\Users\ADMIN\aspire-2\aspire-web` |
| Server under test | `npx next dev -p 3200` with default env. No `.env*` files exist, so `ENQUIRY_DESTINATION` defaults to `none`, placeholder content is on and portal preview is on |
| Secondary check | `npx next start -p 3201` on the existing production build (`.next/BUILD_ID` 00:20:12; no `src/` file is newer). Used **with curl only** to confirm production 404 markup and empty states, then stopped |
| Browser | Chrome via Claude in Chrome, one dedicated tab, only `http://localhost:3200` URLs. Window maximised at **1280×585 CSS px, DPR 1.5**; `resize_window` had no effect |
| Width emulation | `X-Frame-Options: DENY` blocks normal framing, so each route was fetched same-origin and written into an `about:blank` iframe of exact width (360/390/768/1024/1440) with `document.write`, after `history.replaceState` to the route's path. React hydration inside the frames was confirmed (fibers attached; mobile menu opens and navigates). Limits: no touch or coarse-pointer emulation and no device DPR. Visual inspection was done at **390** and **1280**; 768/1024/1440 were measured programmatically only |
| Already verified by Orchestrator (cited, not repeated) | `npm run typecheck`, `npm run lint`, `npm test` (317 tests) pass; `npm run build` succeeds. Prod: placeholder detail pages 404, portal pages 307 → `/login?next=…`, portal APIs 401 JSON + `x-robots-tag`, security headers present. `POST /api/enquiries`: 200 `not_configured`, 403 cross-origin and missing origin, 415, 422, 429 on the 6th request, 405 for GET; no PII in logs |

**Observation:** twice during the session the test tab was soft-navigated without a tool call from me (to `/centres#shimla`, then `/`). This was most likely someone clicking in the visible window. Measurements ran in isolated iframes and every later check started with an explicit navigation, so results are unaffected.

## 2. Commands and tools used

```text
# security / source checks (before starting dev, against the existing prod build)
grep -rlE "ENQUIRY_WEBHOOK|WEBHOOK_SECRET|SECRET|ENQUIRY_DESTINATION|PORTAL_PREVIEW|SHOW_PLACEHOLDER_CONTENT|process\.env|API_KEY|PRIVATE_KEY|password|BEGIN (RSA|EC|PRIVATE)" .next/static
grep -oiE ".{0,40}(secret|token|apikey|api_key|hmac).{0,40}" -r .next/static
grep -rnE "dangerouslySetInnerHTML|innerHTML|\beval\(|new Function\(" src
grep -rnE "localStorage|sessionStorage|indexedDB|document\.cookie" src
grep -rln '"use client"' src | xargs grep -ln "process.env"
grep -rn "NEXT_PUBLIC" src next.config.ts ; ls .env*

# servers
npx next dev -p 3200            # background; stopped with taskkill //PID <pid> //T //F
npx next start -p 3201          # background, curl only; stopped the same way

# route sweep (28 URLs), link check (61 internal hrefs), fragment-target check, API spot checks
curl -s -o html/<route>.html -w "%{http_code}" http://localhost:3200<route>
curl -s -o /dev/null -w "%{http_code}" http://localhost:3200<every internal href>
curl -s -D - http://localhost:3200/api/{health,session,admin/enquiries,student/me,parent/students,parent/students/stu-1,programs,centres,results?year=abc,programs/iit-jee,debug,env}
node extract.js <html>          # scratch script: strips tags to visible text for the content sweep
```

Browser tools: `tabs_context_mcp`, `navigate`, `javascript_tool` (audit harness: overflow, offending elements, clipped text, tap targets <44px, h1 count/outline/skipped levels, landmarks, nav labels, skip link, `img` alt, unlabelled `svg`, unlabelled fields, nameless controls, duplicate ids, broken `aria-describedby`, DEMO count, numeric/phone/email/PIN/"Design Preview" regexes, WCAG contrast scan), `read_console_messages`, `computer` (real clicks and keys: Tab, Enter, Space, Escape, arrows), `find`, `form_input`, `get_page_text`, `resize_window` (ineffective), `tabs_close_mcp`. No packages were installed.

Screenshots in `docs/qa/`:
`01-home-desktop-1280.jpg`, `02-home-mobile-390.png`, `02b-home-mobile-390-menu-open.png`, `03-admissions-form-errors-1280.jpg`, `04-admissions-not-sent-warning-1280.jpg`, `05-admin-portal-1280.jpg`.

## 3. Route results (dev server)

Overflow is `document.documentElement.scrollWidth > innerWidth` (and `> clientWidth`), plus a scan for any element extending past the viewport outside a scroll or clip container. "Console" means errors, warnings and hydration messages after a top-level load.

| Route | HTTP | Console | Overflow 360/390/768/1024/1440 | h1 | Heading skips | Landmarks (main/header/footer, labelled navs) | Skip link | img/svg a11y |
|---|---|---|---|---|---|---|---|---|
| `/` | 200 | clean | none ×5 | 1 | none | 1/1/1 ✓ | ✓ | ✓ |
| `/about` | 200 | clean | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/programs` | 200 | clean | none ×5 | 1 | none | ✓ (+Breadcrumb) | ✓ | ✓ |
| `/programs/iit-jee` | 200 | **dev "instant" error** (L-2) | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/results` | 200 | clean | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/centres` | 200 | clean | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/admissions` | 200 | clean | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/contact` | 200 | clean | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/resources` | 200 | clean | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/resources/building-a-weekly-revision-plan` | 200 | **dev "instant" error** (L-2) | none ×5 | 1 | none | ✓ | ✓ | ✓ |
| `/privacy`, `/terms` | 200 | clean | none ×5 | 1 | none | ✓ (+"On this page") | ✓ | ✓ |
| `/login` | 200 | clean | none ×5 | 1 | none | ✓ | ✓ | ✓ (no password fields) |
| `/qa-does-not-exist` (404) | 404 | clean | none ×5 | 1 | none | 1/1/1 | **missing** (L-1) | ✓ |
| `/programs/does-not-exist`, `/resources/does-not-exist` | 404 | dev "instant" error | n/a | 1 | — | **2/2/2, duplicate `id="main"`** (M-1) | 1 | ✓ |
| `/student`, `/student/timetable`, `/parent`, `/admin`, `/admin/enquiries` | 200 | clean | none ×5 | 1 | none | main 1, header 1, footer 0 (portal shell, by design), nav "‹Role› portal sections" | ✓ | ✓ |
| `/student/{resources,progress}`, `/parent/{updates,progress}`, `/admin/{content,centres,results}` | 200 | not loaded top-level | none at 360/1440 | 1 | none | ✓ | ✓ | ✓ |

Also observed across all routes: no hydration warnings; no `<img>` elements (photos are labelled `ImagePlaceholder`s); every non-hidden `svg` is `aria-hidden`; no unlabelled fields, nameless links or buttons, duplicate ids (except M-1) or dangling `aria-describedby`; unique `<title>` and meta description on every page (except the generic 404, L-1); `robots: noindex, nofollow` on every page in this preview build. All 61 distinct internal hrefs return 200, and all fragment targets (`#enquiry`, `#faqs`, `#shimla`…, legal section anchors) exist. Anchor targets use `scroll-margin-top`, so they are not hidden under the sticky header.

Visual fidelity: the pages match the mockup's language. That means a navy top bar and white sticky nav, gold primary buttons, the navy gradient hero with mountain-ridge SVG, 18px-radius tinted program cards, a navy results band with white "awaiting record" cards, pale-blue alternating sections, and the navy portal sidebar with gold active marker. Student, parent and admin portals are distinct (blue, green and gold accents plus a role badge). Contrast scan on 10 pages found one item below threshold: the blue "A" logo mark on navy in the footer (3.17:1), which is a logotype and exempt.

## 4. Pass / Fail / Blocked against `specs/acceptance_checklist.md`

| # | Checklist item | Status | Evidence / notes |
|---|---|---|---|
| **Visual and responsive** | | | |
| 1 | Prototype reviewed, tokens applied consistently | **Pass** | Visual comparison with `reference/mockup.html`; tokens from `globals.css`; screenshots 01–05 |
| 2 | Looks intentional at 360/390/768/1024/1440 | **Pass** (partial visual) | Measured on 19 routes × 5 widths, all clean. Visual review only at 390 and 1280 (window could not be resized) |
| 3 | No overflow, clipped nav, overlapping text, broken imagery | **Pass with exceptions** | Zero overflow; no clipped text. Exceptions: M-1 (duplicated chrome on slug 404s), L-8 (admin demo caption cut off at 390 inside its scroller) |
| 4 | Authentic imagery or tracked temporary assets | **Pass** | No raster images or external URLs; "Photo needed · …" placeholders on About |
| 5 | Visible interaction states | **Pass** (spot-checked) | 3px blue `:focus-visible` outline seen on skip link, inputs, selects, submit, summary; `aria-pressed` with check icon; hover classes present (hover not systematically tested) |
| **Public pages** | | | |
| 6 | All public routes work | **Pass** | 14 public routes 200; unknown URLs 404 (but see M-1) |
| 7 | Consistent header/footer/nav; mobile nav keyboard-accessible | **Partial** | Consistent across routes. Mobile menu: opens and closes, `aria-expanded` and label toggle, links navigate and close it. **Escape fails from the toggle and loses focus** (M-2) |
| 8 | Programme and centre empty states | **Pass** | Prod HTML: "Program details are being finalised", "Verified centre locations will be listed here". Dev: centre no-match empty state with "Clear filters"; program filter on placeholder centres explains availability is unconfirmed |
| 9 | Results sourced, verified, consent-aware; no illustrative values | **Pass** | No result records; "Awaiting approved result record" cards; exam/year filters disabled with an `aria-describedby` explanation |
| 10 | Enquiry form validation, field errors, no double submit, clear success/error | **Pass** | All 3 variants: empty submit shows per-field errors with `aria-invalid` and `aria-describedby`, focus moves to the first invalid field, and a polite summary says "Nothing has been sent yet". Two Enter presses sent **one** POST (`aria-disabled` plus "Sending…"). The `received` success path was not exercised at runtime (no destination); covered by unit tests per the Orchestrator |
| 11 | Forms not labelled live unless connected | **Pass** | 200 `not_configured` shows "Your enquiry has not been sent … nothing was sent or stored"; data kept in the form (screenshot 04) |
| **Portals and security** | | | |
| 12 | Student/parent/admin distinct, role-appropriate | **Pass** | Distinct accents and role badges; copy is role-specific |
| 13 | Real data routes require server-side authN/Z | **Pass** | Dev spot check: `/api/admin/enquiries`, `/api/student/me`, `/api/parent/students[/id]` return 401 JSON with `no-store` and `noindex` even in preview. Prod verified by the Orchestrator |
| 14 | Parent access restricted to linked learners | **Blocked (runtime)** | No identity provider, so it can't be exercised end-to-end. Unit tests exist (`src/lib/auth/*.test.ts`) |
| 15 | Admin operations protected and auditable | **Blocked** | APIs deny by default; audit logging is not built yet (documented on `/admin` as required before go-live) |
| 16 | No secrets or sensitive data in client code or logs | **Pass** | `.next/static` grep: no env names or secrets (only URL-polyfill and React DOM `password` identifiers). No `localStorage`/`sessionStorage`/cookies; no `process.env` in client components; 17 server modules import `server-only`. Dev log for 3 test enquiries shows only `{event, outcome, durationMs, source}`, with no name or phone |
| 17 | Missing auth/backend documented; screens marked demo/preview | **Pass** | Persistent "Preview — no real accounts or records are connected" banner; "PREVIEW · NO LIVE DATA" badges; admin table "DEMO · LOCAL ONLY"; `docs/auth-and-portals.md` |
| **Accessibility and quality** | | | |
| 18 | Landmarks, headings, labels, alt text, keyboard navigation | **Partial** | All normal routes pass. Fails: M-1 (duplicate landmarks and ids on slug 404s), M-2 (menu Escape and focus), L-1 (no skip link on root 404), L-3 (focus lost after "Clear filters") |
| 19 | Visible focus, accessible names, contrast, non-colour cues | **Pass** | Contrast scan clean except the exempt logotype; status pills and errors use text plus icon; filters use a checkmark |
| 20 | Loading, empty, error, permission-denied states | **Pass** | "Loading the enquiry form…" fallback, empty states, error notices, 401 JSON and prod redirect to `/login`. `(site)/error.tsx` exists but was not triggered at runtime |
| 21 | Titles, meta descriptions, social metadata | **Partial** | Unique title and description on every page; `og:title` present. Canonical only on 5 pages (L-7); 404 uses the generic home title (L-1) |
| 22 | Images sized and lazy-loaded | **N/A** | No raster images yet |
| 23 | Build and tests pass; exceptions documented | **Pass** | Orchestrator-verified (cited). Dev-only diagnostics noted in L-2 |
| **Handoff** | | | |
| 24 | Setup, dev, build, test, deploy instructions | **Partial** | README covers setup and all npm scripts; Deployment says "Not configured" (expected for M1) |
| 25 | Env example has names and placeholders only | **Pass** | `.env.example` read: names, comments and empty values only |
| 26 | Owner verification list | **Pass** (presence) | `docs/content-verification.md` mentions results, fees, centres, contact, images, testimonials, legal, admissions and dates. Completeness not audited |
| 27 | Known limitations, credentials, dependencies documented | **Pass** (presence) | `docs/integration-status.md` §External dependencies / Deferred items. Not audited in depth |

### Interaction tests (task §4)

| Test | Result |
|---|---|
| Mobile menu at 390 | Opens via toggle; `aria-expanded` false→true, label "Open menu"→"Close menu"; 10 links each ≥44px tall; clicking "About" navigates to `/about` and closes it. **Escape with focus on the toggle (the state right after opening) does nothing**. With focus inside the panel, Escape closes it but focus drops to `<body>` (M-2) |
| Programs filter | `role=group` "Filter programs by exam"; `aria-pressed` updates; Space works; `role=status` "Showing N programs" updates; checkmark cue. Identical count text isn't re-announced (L-9) |
| Centres search/filter | Labelled search and select; "mand" gives "Showing 1 centre"; "mandzzz" gives "Showing 0 centres" plus an empty state; "Clear filters" resets but focus is lost (L-3); program filter gives 0 with an explanation (all placeholder centres have `programs: []`, by design) |
| Admissions form, empty submit | 5 errors, focus on name, each linked via `aria-describedby` (phone keeps its hint and gains the error) and `aria-invalid="true"`; consent error linked; honeypot `tabindex=-1`, `aria-hidden`, `autocomplete=off` (screenshot 03) |
| Admissions form, valid ("QA Test", 9876543210, Class 10, IIT JEE, consent) | **Completed keyboard-only** (type, Tab, arrows, Space, Enter). Honest "has not been sent" warning in a polite live region; values retained; one POST despite a double Enter (screenshot 04) |
| Home quick form | Enquiry/Scholarship is a radio group in a `<fieldset>` with legend (arrow keys work); empty submit gives 5 linked errors with focus on name; valid submit shows the "not sent" warning; `intent=scholarship` kept |
| Contact form | Empty submit gives 4 linked errors; invalid email is flagged and focused; valid submit shows the "not sent" warning. Copy mismatch L-5 |
| Admin enquiries demo | Clearly labelled ("Table layout demo … Rows are fictional", caption "DEMO · LOCAL ONLY"); "Add sample row" adds DEMO-004 "Sample applicant D"; status select (labelled "Status for Sample applicant A") changes the pill, and a live region says "…on this page only. Nothing was saved."; status filter works |
| Skip link | First Tab reveals "Skip to content" with an outline; Enter moves to `#main`, and the next Tab lands inside `<main>` |
| `/login?next=//evil.example/x` | No password inputs and no external links; `evil.example` appears only inside Next's inline RSC flight-data script, never rendered |

### Content integrity sweep (task §5)

Rendered text was taken from the SSR HTML of 28 URLs plus the hydrated DOM `innerText` of every route. **No** numeric claims (`N+`, `%`, "N years/students"), ranks or AIR, phone numbers, emails, PIN codes, student names, or mentions of "Design Preview", "Admin Demo" or "design board". Digits present are only class options (6–8, 9–12), "10-digit" hint, "1000 characters", step numbers 1–4, filter counts, legal section numbers, one article date, and `DEMO-001…004`. "Sample applicant A–D" appear only on `/admin/enquiries`. Every placeholder record carries DEMO: 4 program cards, 6 centre tiles and cards, 2 articles, 3 FAQs, the story/journey/testimonial sections, and a site-wide preview banner. Production HTML (port 3201) for `/`, `/programs`, `/centres`, `/admissions` has **0** DEMO markers, hides story and testimonial sections, and shows honest empty states. Content notes: L-6, L-12.

### Security spot checks (task §6)

| Check | Result |
|---|---|
| Secrets in client bundle (`.next/static`, 29 files, 1.1 MB) | **None.** No `ENQUIRY_*`, `SECRET`, `PORTAL_PREVIEW`, `SHOW_PLACEHOLDER_CONTENT`, `process.env`, keys or PEM blocks |
| `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `new Function` in `src/` | **None** |
| `localStorage` / `sessionStorage` / IndexedDB / `document.cookie` in `src/` | **None** |
| `NEXT_PUBLIC_*` | Only `NEXT_PUBLIC_SITE_URL` (public by design) |
| Debug endpoints | `/api/debug` and `/api/env` return 404. `/api/health` shows config state (L-11) |
| Enquiry logging | 3 test submissions logged `outcome/source/durationMs` only; no test PII in the dev log |

## 5. Findings (severity-ranked)

No **Critical** or **High** findings.

### Medium

**M-1 — Slug-route 404 renders the site chrome twice (two headers, two `<main>`, duplicate `id="main"`).**
- Repro: `npx next dev`, open `/programs/does-not-exist` or `/resources/does-not-exist`. You get two preview banners, two top bars, two headers, two footers; `document.querySelectorAll('main').length === 2`, two elements with `id="main"`, and the skip link's target is ambiguous.
- Production (`next start` on the current build): the 404 HTML for `/programs/iit-jee` and `/resources/building-a-weekly-revision-plan` has an **empty `<body>`**, so the page renders client-side only. Its RSC payload contains the `(site)` layout's skip link plus the root not-found's own header, main and footer, consistent with the same duplication (not browser-verified on the prod port). Every program and article detail URL currently hits this page in production because all records are placeholders, though production pages and the sitemap don't link to them.
- Likely files: `src/app/not-found.tsx` renders `SiteHeader`, `<main id="main">` and `SiteFooter`, and is placed inside `src/app/(site)/layout.tsx` when `notFound()` is thrown from `src/app/(site)/programs/[slug]/page.tsx:33` or `src/app/(site)/resources/[slug]/page.tsx:44`. Probable fix: add `src/app/(site)/not-found.tsx` that renders only the inner 404 content, and keep the root one for unmatched URLs.

**M-2 — Mobile menu: Escape doesn't work from the toggle, and focus isn't restored.**
- Repro (≤1023px): activate "Open menu". Focus stays on the toggle; press Escape and the menu stays open (`aria-expanded="true"`). Tab into the panel and press Escape: the menu closes, but `document.activeElement` becomes `<body>`.
- Likely file: `src/components/layout/MainNav.tsx`. The `onKeyDown` Escape handler is only on the panel `<div>`, not on the toggle or document, and there's no `buttonRef.focus()` after close.

### Low

- **L-1 — Root 404 page lacks a skip link and page title.** `/qa-does-not-exist`: first focusable is a header link, not "Skip to content"; `<title>` falls back to the home default. File: `src/app/not-found.tsx` (no skip link, no `metadata`).
- **L-2 — Dev console errors on detail routes ("instant" validation).** Visiting `/programs/iit-jee` or `/resources/building-a-weekly-revision-plan` logs `Error: Route "/programs/[slug]": Next.js encountered URL data during prerendering or a navigation`, and the dev overlay shows "1 Issue". Unknown slugs add "Could not validate `instant`…". The build passes, but Next says navigations to these routes can't be instant. Files: `src/app/(site)/programs/[slug]/page.tsx:31`, `src/app/(site)/resources/[slug]/page.tsx:42` (`await params` outside `<Suspense>`; either wrap the body in `<Suspense>` or set `export const instant = false`).
- **L-3 — Focus lost after "Clear filters" on `/centres`.** Search "zzz", activate "Clear filters", and focus goes to `<body>` because the button unmounts with the empty state. File: `src/components/centres/CentreDirectory.tsx` (move focus to the search input).
- **L-4 — Tap targets under the brief's 44px on mobile.** At 390: `/login` "Preview student/parent/staff portal" buttons are 36px (`ButtonLink size="sm"` gives `min-h-9`: `src/app/(site)/login/page.tsx:133`, `src/components/ui/Button.tsx:22`). Top-bar "Student Login"/"Parent Login" links are 16px tall (`src/components/layout/SiteHeader.tsx`; duplicated at 44px in the menu). Footer links are 28px. All except the top bar meet WCAG 2.5.8's 24px minimum.
- **L-5 — Contact form error copy.** The "Your name" field shows "Enter the student's name". Files: `src/lib/contracts/enquiry.ts:47` (shared message), `src/components/forms/EnquiryForm.tsx:338`.
- **L-6 — Production copy describes controls that are hidden.** With no verified records: `/programs` says "Filter by exam, then open a program…" (`src/app/(site)/programs/page.tsx:28`), `/centres` says "Search by district or centre name, or filter by program." (`src/app/(site)/centres/page.tsx:32`), and Home says "Select a district to open its directory entry." (`src/components/home/CentreDiscovery.tsx:38`). None of those controls render.
- **L-7 — Canonical URL only on 5 pages** (`/`, `/programs`, `/programs/[slug]`, `/results`, `/centres`). Missing on about, admissions, contact, resources, article, privacy, terms and login. Agent 6 scope.
- **L-8 — Admin demo table caption cut off on mobile.** At 390 the caption sits inside the horizontally scrolling wrapper; "Fictional sample rows. Ch…" is cut at the edge (the DEMO label stays visible). File: `src/components/portal/DemoEnquiriesTable.tsx:108`.
- **L-9 — Programs filter status may not re-announce.** Going from NEET to Foundation keeps the identical text "Showing 1 program", so screen readers may stay silent. Include the filter name. File: `src/components/programs/ProgramDirectory.tsx`.
- **L-10 — Unknown `/api/*` paths return the HTML 404 page**, not the JSON envelope (D-007). `curl -i localhost:3200/api/debug` returns `text/html` 404.
- **L-11 — `/api/health` exposes configuration state publicly** (`placeholderContent`, `enquiries: "not_configured"`). Low sensitivity; consider trimming to `status` only. File: `src/app/api/health/route.ts:19`.
- **L-12 — Unlabelled positioning copy (owner approval needed).** About's "Our approach" (4 cards) and "What we value" (4 cards) expand one mockup sentence into new descriptive claims with no DEMO label. Home trust points ("Expert faculty & mentorship"…) come from the mockup. They're qualitative, not numeric, but should go on the owner verification list. File: `src/app/(site)/about/page.tsx`.

### Informational

- The contract makes `message` optional for the contact form (the brief listed it without "optional"). Accepted as a frozen-contract decision.
- The admin demo table scroll wrapper has no `tabindex` or label; it's still keyboard-reachable through the selects inside it.
- Footer logo mark "A" is 3.17:1 on navy. Logotype, so exempt.
- Hidden previous routes stay mounted (`<Activity>`). A stale breadcrumb `aria-current` sits inside a `display:none` subtree, so it isn't exposed to AT. No action.

## 6. Release recommendation — Skeleton milestone

**Conditional accept.** The skeleton meets its core goals:
- All routes render with no overflow at 5 widths.
- Landmarks and headings are sound on normal pages.
- Forms validate accessibly, block double submits and never claim success they don't have.
- Portals are data-free and deny by default.
- No secrets, unsafe HTML or client storage.
- Content is honest and DEMO-labelled, and placeholders disappear in production.

Before a client-review or preview deployment, fix:
1. **M-1** (slug 404 duplicates the chrome; empty SSR body in prod).
2. **M-2** (mobile menu Escape and focus return).

L-1 to L-12 can go to the M2 backlog; L-1, L-3 and L-5 are one-line fixes worth bundling with M-1/M-2.

Not production-ready for public launch, as expected at this milestone. Still pending: identity provider, enquiry destination, audit logging, CSP, deployment, owner-verified content (items 14, 15, 24 and `docs/integration-status.md`).

### Side effects of this QA run
- `next dev` regenerated `next-env.d.ts` to reference `.next/dev/types/*`. The file is auto-generated and gitignored, `tsconfig.json` includes both `.next/types` and `.next/dev/types`, and `next build` rewrites it.
- `next dev` created `.next/dev/`.
- 3 synthetic enquiries were POSTed to the local dev server (destination `none`; nothing forwarded or stored).
