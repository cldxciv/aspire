# Agent Briefs — Milestone 1 (Skeleton)

Project root: `C:\Users\ADMIN\aspire-2\aspire-web`. Four agents run **in parallel in the same working tree**. File ownership below is strict.

---

## Common rules (all agents)

### Read first
1. `AGENTS.md` — **this Next.js (16.4.2) has breaking changes vs. your training data.** Read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches routing, data, caching, params, metadata, route handlers, proxy or forms.
2. `docs/agent-decisions.md` (decisions D-001…D-013 are binding), `docs/content-verification.md`.
3. `specs/` — product requirements, routes, design system, data contracts, acceptance checklist.
4. Visual reference: `reference/mockup.html` (full markup + CSS, base64 images stripped) — the primary reference for layout, sections and styling. `reference/design-board.png` for composition only — **every figure, name, rank, address and email on the board is fictional.**
5. The shared foundation (read-only for you): `src/components/ui/*` (import from `@/components/ui`), `src/components/layout/*`, `src/config/site.ts`, `src/lib/data.ts`, `src/lib/types.ts`, `src/lib/contracts/*`, `src/lib/content-mode.ts`, `src/lib/cn.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/(site)/layout.tsx`.

### Next.js 16 facts already verified by the Orchestrator
- `cacheComponents: true` + `partialPrefetching: true`. Pages are prerendered when they only use static data (our `@/lib/data` accessors qualify). Anything reading `cookies()`, `headers()`, `searchParams`, `connection()` or request data **must be inside `<Suspense>`** or the build fails. Client components calling `useSearchParams()` must also be under `<Suspense>`.
- Don't call `new Date()`, `Date.now()`, `Math.random()` or `crypto.randomUUID()` while rendering server components (breaks prerendering). Inside POST handlers / request-time code it's fine.
- Dynamic segments: `params` is a **Promise**. Use the generated global helper types `PageProps<'/programs/[slug]'>` / `LayoutProps<'/…'>`. `generateStaticParams` **must return ≥1 entry** (use `getProgramSlugs()` / `getArticleSlugs()`, which already guarantee it) and then `notFound()` for slugs `getProgram()`/`getArticle()` don't return. `dynamicParams` is **not available**.
- `middleware.ts` is now **`src/proxy.ts`** (`export function proxy(request)`), runs on Node.js.
- No `export const runtime`. GET route handlers are prerendered unless they read request data.
- Hidden routes stay mounted (`<Activity>`): component state survives navigation — reset forms explicitly after success.
- Run `npx next typegen` after adding routes if `PageProps<…>` types are missing.

### Styling
Tailwind v4 tokens (from `globals.css`): colours `navy navy-2 navy-deep blue blue-soft gold gold-2 gold-soft ink muted line surface success success-soft danger danger-soft`; `rounded-card` (18px), `rounded-control` (10px); `shadow-card`, `shadow-soft`; `max-w-content` (1200px). Gradients use v4 syntax `bg-linear-to-r`. Match the mockup's look (navy/white/blue, restrained gold, 14–18px radii, pale-blue alternating sections). Icons: `lucide-react` (decorative icons get `aria-hidden="true"`). Need a token or shared-component change? **Don't edit shared files** — build a local component in your own folder and request the change in your report.

### Content integrity (non-negotiable)
- Never invent results, ranks, student names, testimonials, statistics ("15+ years", "10,000+ students"…), fees, dates, addresses, phone numbers, emails, faculty credentials or affiliations.
- Placeholder records (`status: "placeholder"`) must render with `<DemoBadge />`. Missing optional data is **omitted** (or an honest `<EmptyState>`), never filled in.
- Sections that only make sense with approved content (testimonials, milestones) render only when `showPlaceholderContent()` is true, clearly labelled DEMO.
- No external image URLs. Use `<ImagePlaceholder label="what the photo should show" />`.
- No analytics, tracking, third-party embeds (maps, chat widgets) or new npm packages.

### Accessibility & quality
- `<main>` already exists in the layout — don't add another. One `<h1>` per page (`<PageHero>` renders it); no skipped heading levels.
- Every page exports `metadata` (or `generateMetadata`) with a unique `title` (template adds the site name) and `description`.
- Labels on all inputs, errors linked with `aria-describedby` + `aria-invalid`, visible focus (global), tap targets ≥44px on mobile, `aria-current` for current items, status not conveyed by colour alone, honours reduced motion (global CSS handles transitions).
- Layout must work at 360, 390, 768, 1024, 1440px with no horizontal overflow.
- Server Components by default; `"use client"` only for interactive leaves.

### Concurrency rules
- Create/edit **only** files in your allowed list. If you think you need another file, stop and report it.
- **Do not run** `npm install`, `npm run build`, `next build`, `next dev`, or `next start` (shared `.next/` dir, other agents are mid-edit). Do not edit `package.json`, configs, `globals.css`, shared components or contracts.
- Allowed verification: `npx tsc --noEmit` (errors in files you don't own may appear while others work — note them, don't fix them), `npx eslint <your paths>`, `npx vitest run <your test files>`, `npx next typegen`.

### Status report (return this as your final message)
1. **Status:** complete / partial / blocked
2. **Changed files:** exact paths
3. **Implementation:** short factual summary
4. **Verification:** commands run and their actual results
5. **Open risks:** security, accessibility, data, content, performance, integration
6. **Requests for shared changes:** exact file + change + reason (Orchestrator decides)
7. **Next recommended task:** one concrete step

---

## FE-A — Discovery pages (Frontend)

**Goal:** Home, Programs, Program detail, Results and Centres pages, matching the mockup's `page-home`, `page-courses`, `page-results`, `page-centres` sections.

**Allowed files:**
- `src/app/(site)/page.tsx` (replace the temporary scaffold page)
- `src/app/(site)/programs/page.tsx`, `src/app/(site)/programs/[slug]/page.tsx`
- `src/app/(site)/results/page.tsx`
- `src/app/(site)/centres/page.tsx`
- `src/components/home/**`, `src/components/programs/**`, `src/components/results/**`, `src/components/centres/**`

**Out of scope:** `src/components/forms/**` (FE-B owns `EnquiryForm` — import it, don't edit it), other routes, shared files.

**Requirements:**
- **Home** (mockup `page-home`, in order):
  1. Hero — navy gradient with an inline SVG mountain-ridge silhouette (no photo URL). Eyebrow "IIT JEE · NEET · FOUNDATION · SCHOOL PROGRAMS", `<h1>` "Higher Dreams. **Brighter Tomorrows.**" (second line gold), lead copy, CTAs "Explore Programs" → `/programs` and "Book a Free Counselling Session" → `/admissions#enquiry`, four qualitative trust points (no numbers). Right column: white card containing `<EnquiryForm variant="quick" />`.
  2. Qualitative highlight strip (mockup "stats" row: Results matter / JEE · NEET / Himachal / Student-first) — no numeric claims.
  3. Programs grid — `ProgramCard` per `getPrograms()` with exam icon, tinted backgrounds as mockup, link to `/programs/[slug]`.
  4. Results feature (navy section) — if `getResults()` is empty, show the mockup's "awaiting approved record" cards; link to `/results`.
  5. Centre discovery — district tiles from `getCentres()` linking to `/centres`, with the mockup's verification note.
  6. Our story / journey (milestones "to verify") and "What families value" testimonial prompts — **only when `showPlaceholderContent()`**, each DEMO-labelled.
  7. Final CTA band → `/admissions#enquiry` and `/contact`.
  - Skip the mockup's "design board" showcase section (D-012).
- **Programs** — `PageHero`; exam filter (a small client component filtering the server-provided list; buttons with `aria-pressed`); cards; the mockup's notice that availability, batch dates, fees and delivery modes must be confirmed; `EmptyState` when none.
- **Program detail** — `generateStaticParams` from `getProgramSlugs()`, `generateMetadata`, `notFound()`; overview, who it's for, highlights, a "Schedule & fees" block that shows `duration`/`deliveryMode`/`feeDisplay` only if present, otherwise "Ask a counsellor"; DemoBadge if placeholder; CTA to `/admissions#enquiry`; other programs.
- **Results** — `PageHero`; the mockup's integrity notice; exam + year filter UI (years from `getResultYears()`; disabled with explanation when no records); `ResultCard` (show `studentDisplayName` only when `consentStatus === "granted"`; always show `sourceReference`); when empty, the four "awaiting records" category cards + a methodology/context paragraph.
- **Centres** — `PageHero`; search + program filter (client component over server-provided list); `CentreCard` showing address/phone/hours **only if present**, "Call" (`tel:`) and "Directions" buttons only when `phone`/`directionsUrl` exist; DemoBadge + "Details pending verification" for placeholders; no-match `EmptyState`; map area as a labelled placeholder panel (no embed).

**Acceptance:** all five routes render; no numeric claims or names anywhere; placeholders labelled; filters keyboard-operable; responsive at all five widths; `tsc` clean for your files; `eslint` clean on your paths.

---

## FE-B — Conversion & content pages + EnquiryForm (Frontend)

**Goal:** the working `EnquiryForm` plus Admissions, Contact, About, Resources, Article detail, Privacy, Terms and the `(site)` error boundary.

**Allowed files:**
- `src/components/forms/**` — implement `EnquiryForm.tsx` (**keep the exported props interface and names exactly**; you may add internal files)
- `src/app/(site)/admissions/page.tsx`, `src/app/(site)/contact/page.tsx`, `src/app/(site)/about/page.tsx`
- `src/app/(site)/resources/page.tsx`, `src/app/(site)/resources/[slug]/page.tsx`
- `src/app/(site)/privacy/page.tsx`, `src/app/(site)/terms/page.tsx`
- `src/app/(site)/error.tsx` (read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` first)
- `src/components/about/**`, `src/components/resources/**`, `src/components/faq/**`, `src/components/legal/**`

**Out of scope:** `/api/*` (BE owns), contracts (frozen), other routes, shared files.

**EnquiryForm requirements** (contract: `src/lib/contracts/enquiry.ts`, D-008):
- Variants — `quick`: Enquiry/Scholarship tab switch (sets `intent`; tabs are a proper `role="tablist"` or a radio group), name, current class, program, phone, consent. `admissions`: name, class, program, phone, email (optional), preferred centre (from `centreOptions` + "Not sure yet"), message (optional), consent. `contact`: name, phone, email (optional), topic, message, consent.
- Option lists come from `CLASS_OPTIONS`, `PROGRAM_INTEREST_OPTIONS`, `CONTACT_TOPIC_OPTIONS`. `defaultProgram` preselects.
- Hidden honeypot input `website` (visually hidden, `aria-hidden`, `tabIndex={-1}`, `autoComplete="off"`).
- Client validation with `enquirySchema.safeParse` (zod 4: `z.flattenError(error).fieldErrors`); errors shown per field and linked via `aria-describedby`; `aria-invalid`; focus the first invalid field on submit.
- `fetch("/api/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body })`. Disable submit + show pending text while in flight (no double submit).
- Render `EnquiryResponse` honestly in a live region: `received` → success with `reference`, then reset; `not_configured` → warning: details were checked but **not sent**, online enquiries aren't connected yet, contact Aspire directly (keep the entered data); `validation` → map `fieldErrors`; `rate_limited` / other errors / network failure → error notice with retry guidance. **Never** show "submitted" for anything except `received`.
- Consent checkbox label links to `/privacy`.
- Styling per mockup `.field` / `.formgrid` (two columns ≥640px for admissions/contact; single column for quick).

**Page requirements:**
- **Admissions** — `PageHero`; form panel with `id="enquiry"` (anchor target used site-wide) passing `centreOptions` built from `getCentres()` (label placeholder centres "District (verify availability)"); "What happens next?" 4 steps; admissions FAQ accordion (`getFaqs("admissions")`, native `<details>`/`<summary>` is fine) with DemoBadge on placeholders; scholarship/fees notice from mockup.
- **Contact** — `PageHero`; form panel (variant `contact`); contact details panel showing `siteConfig.contact` fields only if non-null, otherwise a notice that official details will be added after verification; "Need help choosing a program?" → `/admissions#enquiry`.
- **About** — `PageHero`; story / approach / values per mockup (`page-about`) using the mockup's "what the story should cover" guidance, DEMO-labelled where it's placeholder; `ImagePlaceholder`s for campus/classroom; no faculty/leadership content.
- **Resources** — `PageHero`; category cards from mockup (study guidance, practice & tests, prospectus, FAQs); `ArticleCard` list from `getArticles()` with DemoBadge; `EmptyState` when none.
- **Article detail** — `generateStaticParams` from `getArticleSlugs()`, `generateMetadata` (seoTitle/seoDescription fallbacks), `notFound()`; body paragraphs rendered as text (never `dangerouslySetInnerHTML`); related articles; CTA.
- **Privacy / Terms** — clearly bannered "Draft — pending review by Aspire and legal counsel". Privacy structure: what the enquiry form collects (exactly the contract fields), why, who can access it, retention ("to be confirmed"), rights/contact ("to be confirmed"), no cookies/analytics currently. Terms: neutral skeleton headings with "to be confirmed". No invented legal entity names, addresses or jurisdictions.
- **error.tsx** — friendly message, retry action, link home; no error details shown to users.

**Acceptance:** form works end-to-end against `/api/enquiries` once BE lands (until then, it must handle a 404/network failure gracefully); keyboard-only completion possible; errors announced; responsive; `tsc`/`eslint` clean for your files.

---

## BE — Public API & enquiry handling (Backend)

**Goal:** server routes for public content and a secure, honest `POST /api/enquiries`.

**Allowed files:**
- `src/app/api/enquiries/route.ts`
- `src/app/api/programs/route.ts`, `src/app/api/centres/route.ts`, `src/app/api/results/route.ts`, `src/app/api/health/route.ts`
- Optional: `src/app/api/programs/[slug]/route.ts`, `src/app/api/centres/[slug]/route.ts` — only if the docs confirm they build cleanly under Cache Components; otherwise skip and report.
- `src/lib/server/**` (e.g. `rate-limit.ts`, `request-guards.ts`, `enquiry-service.ts`, `destinations/*.ts`, `logger.ts`, `env.ts`)
- Tests: `src/lib/server/**/*.test.ts`, `src/lib/contracts/enquiry.test.ts`, `src/app/api/**/*.test.ts`
- `docs/api.md`

**Out of scope:** `src/lib/contracts/*.ts` (frozen — propose changes in your report), `/api/admin|student|parent/**` and auth (PORTAL owns), UI.

**Requirements — `POST /api/enquiries`** (read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `03-api-reference/03-file-conventions/route.md`):
1. **Origin check (CSRF):** reject cross-site requests with 403 `forbidden` — require `Origin` to match the request host (or `NEXT_PUBLIC_SITE_URL`); if `Origin` is absent, fall back to `Sec-Fetch-Site` (`same-origin`/`none` allowed).
2. **Content-Type** must be `application/json`; body ≤ 10 KB; malformed JSON → 400 `bad_request`.
3. **Rate limit** per client IP (first `x-forwarded-for` hop, then `x-real-ip`): e.g. 5 requests / 10 minutes, in-memory sliding window; 429 `rate_limited` with `Retry-After`. Document it's single-instance only.
4. Validate with `enquirySchema.safeParse` → 422 `validation` with `z.flattenError(...).fieldErrors`.
5. **Honeypot** (`website` non-empty) → return the same response a genuine request would get, but don't forward anything.
6. **Destination adapter** from env (`ENQUIRY_DESTINATION`): `none` (default) → 200 `{ ok: true, status: "not_configured", message }`; `webhook` → POST JSON `{ reference, receivedAt, consentAt, enquiry }` to `ENQUIRY_WEBHOOK_URL` with an HMAC-SHA256 signature header using `ENQUIRY_WEBHOOK_SECRET`, 8 s timeout; 2xx → 201 `received` with reference (e.g. `ENQ-` + random suffix); failure → 500 `server_error` with a generic message. Webhook selected but URL/secret missing → behave as `none` and log a warning.
7. **Logging:** never log name, phone, email or message. Log reference, source, outcome, duration only.
8. Responses always JSON in the `src/lib/contracts/api.ts` envelope, `Cache-Control: no-store`.

**Requirements — GET routes:** `/api/programs?exam=`, `/api/centres?q=&exam=`, `/api/results?year=&exam=`, `/api/health`. Use `@/lib/data` accessors only (never import from `src/content` directly). Validate query params with zod (400 on invalid). Return `ApiList<T>`.

**Tests (vitest):** schema cases per source (valid, phone formats incl. `+91 98765 43210`, missing consent, bad email), rate limiter window, origin guard cases, and the POST handler: happy path (`not_configured`), 422, 403 cross-origin, 415/400 content-type, 429, honeypot, webhook success/failure (mock `fetch`).

**Acceptance:** `npx vitest run` passes; `tsc`/`eslint` clean for your files; `docs/api.md` documents every endpoint, status code and env var.

---

## PORTAL — Proxy, auth boundary, portal shells, login (Middleware/Auth)

**Goal:** a deny-by-default auth boundary and visually distinct, data-free student / parent / admin preview shells, ready for a real identity provider later.

**Read first:** `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, `03-api-reference/03-file-conventions/proxy.md`, `02-guides/authentication-with-cache-components.md`.

**Allowed files:**
- `src/proxy.ts` (+ helpers in `src/lib/auth/**`)
- `src/lib/auth/**` (e.g. `session.ts`, `roles.ts`, `guards.ts`, `config.ts`)
- `src/app/(portal)/**` — portal layout and all pages below
- `src/app/(site)/login/page.tsx`
- `src/components/portal/**`
- `src/app/api/admin/**`, `src/app/api/student/**`, `src/app/api/parent/**`, `src/app/api/session/route.ts`
- Tests: `src/lib/auth/**/*.test.ts`, `src/proxy.test.ts`
- `docs/auth-and-portals.md`

**Out of scope:** public pages, `/api/enquiries` and public GET APIs (BE), shared files.

**Requirements:**
- **Roles & session:** `Role = "student" | "parent" | "admin"`; `Session = { userId; role; linkedStudentIds? }`. `getSession()` (server-only) returns `null` — no provider integrated; document the integration point. Never derive a role from query strings, headers or unsigned cookies.
- **Guards:** `requireRole(...roles)` for route handlers → `ApiError` 401 `unauthenticated` / 403 `forbidden` (JSON envelope from `src/lib/contracts/api.ts`). Parent access must also check `linkedStudentIds` (record-level). Deny by default.
- **Preview mode:** `isPortalPreviewEnabled()` reads `PORTAL_PREVIEW` (`"true"`/`"false"`; default on in development, off in production).
- **`src/proxy.ts`:** matcher `/student/:path*`, `/parent/:path*`, `/admin/:path*`, `/api/admin/:path*`, `/api/student/:path*`, `/api/parent/:path*`. Always set `X-Robots-Tag: noindex, nofollow`. API paths: `Cache-Control: no-store`; optimistic deny (401 JSON) when there's no session. Page paths: preview on → continue; preview off → redirect to `/login?next=<path>` where `next` is sanitised to a same-site portal path (no open redirects). Proxy is optimistic only — pages and handlers enforce again.
- **Portal layout `(portal)`:** own shell (it is **not** under the `(site)` layout, so it must provide its own skip link and `<main>`): slim top bar with `<Logo>`, "Back to website", a role badge and a persistent "Preview — no real accounts or records are connected" banner; navy sidebar nav (mockup `.sidebar`/`.sideitem`, horizontal scroll strip on mobile) with `aria-current`. `metadata.robots = { index: false, follow: false }`. Student, parent and admin areas visually distinct (e.g. accent colour + role label).
- **Server-side access check in pages:** a guard component/helper that allows a real session with the right role, otherwise preview mode (render the data-free shell), otherwise `redirect("/login?next=…")`. Follow the authentication-with-cache-components guide for where session reads must sit (`<Suspense>`).
- **Pages (all data-free):** `/student` (overview tiles: "My program — Not connected", "Upcoming activity — Awaiting live schedule", "Progress — no academic data", quick links), `/student/timetable`, `/student/resources`, `/student/progress`; `/parent`, `/parent/updates`, `/parent/progress` (copy stresses access only to linked, authorised learners); `/admin` (metric tiles show "—" + "No live data", never numbers), `/admin/enquiries` (DEMO table with "Sample applicant A/B/C", client-only add-row and status change — clearly labelled as local demo, nothing persisted), `/admin/content`, `/admin/centres`, `/admin/results`. Unavailable areas use honest `EmptyState`s naming the system that must be connected.
- **`/login` (site layout):** explains that portal sign-in isn't available yet (no identity provider connected); cards for Student / Parent / Staff; in preview mode, links to the preview dashboards labelled "Preview"; **no password fields**. Must not read `searchParams` outside `<Suspense>`.
- **APIs:** `GET /api/admin/enquiries`, `GET /api/student/me`, `GET /api/parent/students` → guarded by `requireRole` (currently always 401). `GET /api/session` → `{ ok: true, data: { authenticated: false } }`, `Cache-Control: no-store`.
- **Tests (vitest):** proxy (headers, preview on/off, redirect sanitisation incl. `//evil.com` and `https://evil.com`, API 401), guards deny-by-default, parent record-level check with a fake session.

**Acceptance:** no portal route exposes data; all portal responses carry `X-Robots-Tag`; `npx vitest run` for your tests passes; `tsc`/`eslint` clean for your files; `docs/auth-and-portals.md` explains the integration point for a real provider.
