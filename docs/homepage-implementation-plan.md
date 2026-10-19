# Homepage Showcase — Implementation Plan (Phase 2 synthesis)

Status: **approved by owner 2026-10-20** (hero image: option B — mountains + labelled AI postcard) · Lead: Orchestrator
Inputs: Phase 1 read-only audits (content researcher, UX designer, QA baseline, content integrity reviewer, backend engineer) and the approved design in `reference/homepage/` (`01-approved-first-fold.png` = primary, `02-full-page.png` = long page; its single-step form is ignored).

## 1. Ground rules that override the PNGs
1. **Data-only facts.** Every number, name, rank, phone, hour, campus and credential comes from a `src/lib/data.ts` accessor — never a component literal. Every PNG value (AIR 48/62/101/118, "10+ Years", "5000+ Students Guided", Palampur/Solan, "+91 98765 43210", "Dr. R. Sharma 20+ yrs Ex-IIT", the chart bars) is layout filler and must not ship. A guard test enforces this (§6).
2. **Placeholder gate (D-005/D-020).** Imported records render only in dev/preview with `<DemoBadge />`; production shows the honest fallback listed per section (§4). Nothing is `published` today.
3. **No person image beside a real name (D-019).** Results, testimonials and faculty use `InitialsAvatar`/laurel/trophy art. No other institutions' crests. AI "ASPIRE"-hoodie images are not presented as Aspire students.
4. **Claims stay neutral until approved.** Not implemented: "Himachal Pradesh's Trusted Choice", "Real Students. Real Success.", "Learn from the Best", "For over a decade", "Proven Track Record", "Safe & Supportive", "Safe & comfortable (AC/Non-AC)", "Ex-IIT Faculty", "Mentored 1000s", "Your information is safe with us", "Consistent Growth", "We Make It Possible" (outcome promise) — neutral defaults are used and each item goes on the approval checklist.
5. **Things that don't exist are not faked:** no "Watch Our Story" video (→ "Our story" link to `/about`), no site search (→ login icon), no testimonials route, no copyright year from `new Date()`.

## 2. Decisions to record (lead)
| ID | Decision |
|---|---|
| D-021 | Enquiry contract adds `source: "hero"` exactly as the backend proposal: step 1 `name` + `classOrExam` (single select of 12 valid class/exam pairs, `HERO_CLASS_EXAM_OPTIONS`, mapped at validation to `currentClass` + `programInterest`); step 2 optional `guardianName` (2–80, never logged), `phone`, optional `email`; step 3 optional `preferredCentre` (D-016 + server membership check), optional `message`, `consent: true`; honeypot. No `intent`. Exported step schemas + `validateHeroStep`/`heroStepOfField`. `quick` stays accepted. Privacy field table updated in the same release. |
| D-022 | Homepage follows `reference/homepage/01`/`02` with §1 adaptations: single navy header (no top bar), display serif **Source Serif 4** for headings/stat numbers, full nav from `xl` (hamburger below), Programs ▾ / Resources ▾ disclosure dropdowns, login icon replaces search, slim 24px preview banner (preview builds only). |
| D-023 | Hero image (owner choice, option B): 2000px stock Dhauladhar photo full-bleed with a lighter overlay, **plus** `heroStudents` as a small tilted "postcard" (300–360px, never above its 450px maxWidth, white ring) beside the CTA row at `xl` and `tall` heights only, with a visible "Illustration" label and `alt=""`. Hidden on mobile/tablet. Replace with a consented photo shoot before launch. |
| D-024 | Gold `:focus-visible` on dark surfaces (blue ring is 2.80:1 on navy); `scroll-padding-top` for the sticky header. |
| D-025 | Impact chart = "Entries in the imported results list, by exam year (JEE / NEET)", server-aggregated counts only, DEMO, preview-only; never "top ranks". |

## 3. Phases, owners and file ownership
Only one agent owns a file at a time. Only the lead runs `next build`. Agents verify with `npx tsc --noEmit`, `npx eslint <paths>`, `npx vitest run <tests>`.

### Wave 0 — lead (before agents start)
- Commit the Claude setup pack + `reference/homepage/` (owner approval) so Phase 3 diffs are clean.
- Record D-021…D-025; update `docs/content-verification.md` with C28 (years 10+ vs 13+), C29 ("5,000+" relabelled), C30 (mockup centre network), C31 (7 duplicate ranker pairs → 708 unique), C32 (results wall not corroborated by rankers list), N1–N10 (researcher) and the design claims in §1.4.
- Content fixes in `src/content/**` (lead-owned): remove the BOH "100% free education and boarding" milestone wording; drop "results you can verify" from the summary; gate the "callback within 2 working hours" promise until a destination is live; correct the duplicate note in `docs/demo-data-import.md`.
- `src/lib/data.ts`: add `getRankerYearCounts()` (counts by year × exam, deduplicated, no names) and `getEnquiryDeliveryStatus()` passthrough if the backend helper lives in `lib/server`.
- Global: `src/app/layout.tsx` (Source Serif 4 via `next/font/google`, `--font-serif`), `src/app/globals.css` (`--font-serif` token, `blue-soft` band tone, dark-surface gold focus, `scroll-padding-top`, `short`/`tall` height variants), `src/config/site.ts` (nav restructure: Home, Programs ▾ [programs + Admissions], Results, Centres, Faculty, Hostels, About, Resources ▾ [resources, downloads, FAQs], Contact; portal links → login chooser/menu/footer).
- Projection fixes found in audits: `ResultsArchive` gets a whitelisted view model (no `sourceRef`/`consentStatus`/`school`/`quote`); `/api/centres` + `/api/programs` get whitelist projections like `toPublicResult`.

### Wave 1 — parallel implementation (5 agents)
| Agent | Owns | Delivers |
|---|---|---|
| **Backend** | `src/lib/contracts/enquiry.ts` + test, `src/lib/server/**` (+ `getEnquiryDeliveryStatus()`), `src/app/api/enquiries/**` tests, `docs/api.md`, field table + 2 sentences in `src/app/(site)/privacy/page.tsx` | D-021 contract exactly as proposed (lands **first** — FE-A depends on it), tests (188 existing unchanged + new), guard test for mockup strings (§6) |
| **Chrome (FE-0)** | `src/components/layout/{SiteHeader,MainNav,Logo,SiteFooter,NavDisclosure}.tsx` | Navy header per 01 (72px), dropdown disclosures (button + `aria-expanded`, Esc/focus-out close, not `role=menu`), login icon (`aria-label` "Student and parent login" → `/login`), hamburger below `xl` with all links incl. portals, slim preview banner, serif text-logo placeholder (flagged), footer per 02 (navy, social row from visible `socialLinks` only, small row with portal links + Sitemap, no year) |
| **FE-A Hero + form** | `src/components/home/HomeHero.tsx`, `MountainRidge.tsx`, new `src/components/forms/{HeroEnquiryForm,StepProgress}.tsx`, `hero-steps.ts` + test; additive-only edits to `forms/{fields.tsx,enquiry-payload.ts,FormStatus.tsx}` | Hero per 01 + §4.1; 3-step form per §5; `HomeHero({ centreOptions, deliveryStatus })`; keep `EnquiryForm` quick/admissions/contact untouched |
| **FE-B1 Sections I** | new/rewritten `src/components/home/{StatsBand,ResultsRail,ProgramPaths,WhyAspire,FacultySpotlight}.tsx` (+ retire `HighlightStrip`, `ProgramsSection`/`HomeProgramCard`, `ResultsFeature` usage) | §4.2–4.6 |
| **FE-B2 Sections II** | new/rewritten `src/components/home/{CentrePicker,HimachalMap,CentreDiscovery,CampusLifeTiles,TestimonialsSection,RankersByYear,ResourcesTeaser,CtaBand}.tsx` | §4.7–4.12 (chart via the `dataviz` skill; `CtaBand` photo variant is additive — `/hostels` also uses it) |

The lead owns `src/app/(site)/page.tsx` and composes sections at integration. **Every section is a server component receiving records from `page.tsx`; any client child (carousel, map picker, chart tooltip) receives a server-projected view model with only displayed fields** (no `sourceRef`, `consentStatus`, withheld names, or full ranker lists). Each section renders `null` (or its listed production fallback) on `[]`/`null`.

### Wave 2 — parallel read-only verification
- **QA auditor:** baseline regression list (31 routes, forms, API), first-fold at 1280×600/720, 1366×657/768, 1440×789/900, 390×664 (headless Chrome via CDP is acceptable when Claude in Chrome is unavailable), all hero-form steps/keyboard/focus/back-next/honest not-sent, production leakage (home + `/results` HTML/RSC: 0 imported names, no `sourceRef`/`consentStatus`), console/network clean.
- **Content integrity reviewer:** guard-test results, every rendered number/name traced to an accessor, DEMO coverage, production render of `/` clean, imagery labels.

### Wave 3 — lead
Integrate `page.tsx`, fix findings, re-run typecheck/lint/test/build + production smoke, write `docs/homepage-showcase-content-map.md`, `docs/homepage-implementation-report.md`, `docs/visual-qa-report.md`, `docs/aspire-approval-checklist.md` (from the integrity reviewer's §5b draft). No deploy, no push.

## 4. Section specifications (order follows 02)
Backgrounds alternate over **rendered** sections (About page `ToneSection` pattern); fixed exceptions: stats = `blue-soft` band, centres = navy/light split, CTA = photo.

| # | Section | Data | Preview | Production fallback |
|---|---|---|---|---|
| 4.1 | **Hero + form** | `getCentres()` → options; delivery status | Eyebrow "IIT-JEE · NEET · Foundation · Himachal Pradesh"; serif H1 3 lines (line 3 gold) — copy from 01 minus the outcome promise pending approval; fixed approved-pending lead (not `profile.summary`); CTAs "Explore Our Programs" + "Our Story" (→ `/about`); 4-item trust row (2×2 in column at xl, one line at 2xl); form card right, `items-start` | Same (copy is on the approval checklist); centre field hidden when no centres |
| 4.2 | **Stats band** | `getStats()` ids `stat-campuses`, `stat-years`, `stat-doctors-iitians`, `stat-verified-rankers` — values/labels exactly as stored | Serif numbers, lucide icons in pale circles, dividers, per-item DEMO | **Hidden** (no pseudo-stats) |
| 4.3 | **Results** | `getFeaturedResults()` (fallback newest 4 of `getResults()`), names via `canShowStudentName` | Intro left (neutral heading "Results"), `ResultRail` scroll-snap + 44px prev/next, no autoplay; cards: exam, rank/outcome, year, name, destination, laurel, InitialsAvatar, generic `GraduationCap` (no crests), DEMO | Neutral heading + one honest line + "View results" link (no "awaiting" cards) |
| 4.4 | **Programs** | `getPrograms()`; labels from `title` + `classLevel`; links via `track` | Text left, `ProgramPathRow`s (tinted, lucide icon, arrow, stretched link), stock `studentsTakingNotes` right (decorative) | Compact EmptyState |
| 4.5 | **Why Aspire / story** | `getInstituteProfile()` (`mission`, `approach[0..3]`) | Stock `himalayaBlueRidge` image panel (serif-italic line, `aria-hidden`), copy, "Our story" button, 4 gold-circle points | Generic copy + About's existing `APPROACH` points |
| 4.6 | **Faculty** | `getFaculty()` (seniorLead first), `getCentres()` for campus names | `FacultySpotlight`: intro, stock `physicsWhiteboard` (no face), one-card accessible carousel ("2 of 8"), InitialsAvatar, accessor fields only (no bios/counters) | Omit |
| 4.7 | **Centres** | `getCentres()`; heading count = `centres.length` | Navy left panel; stylised `HimachalMap` SVG ("not to scale", no boundaries), pins from a slug→position table, pins = `<button aria-pressed>` + visible list fallback; centre card with ≤240px illustrative image + label | Omit |
| 4.8 | **Student life** | `getHostelInfo()`, `centre.facilities` | `CampusLifeTiles`: classrooms (`classroomDesks`), hostel (`campusBuilding`, labelled), library (`libraryReading`), lab (`labPipette`, replaces unsupported "sports"); activity-only DEMO captions; "Illustrative stock photos…" note | Stock tiles, generic captions, link to `/about` |
| 4.9 | **Testimonials** | `getTestimonials()` (server picks 3, written quotes, no rank claims preferred) | Intro left, 3 quote cards, `quoteIcon`, no avatars/photos, DEMO; no "View all" route | Omit |
| 4.10 | **Impact** | `getRankerYearCounts()` 2020–2024 + `getStats("results")` | `RankersByYear` grouped bars + data-table alternative + direct labels; title "Entries in the imported results list, by exam year"; navy card with stat value; DEMO + "not ranks; unverified" | Omit |
| 4.11 | **Resources** | `getArticles()` (≤4) | `ResourcesTeaser` with `ArticleCard` | Omit (or compact shortcuts) |
| 4.12 | **CTA** | `getContactDetails()` | Photo variant (hero/blue-ridge photo, warm navy overlay), "Enquire Now" → `#home-enquiry`, phone box only from accessor (DEMO), serif-italic slogan `aria-hidden` | Enquire button only |
| — | Retired from home | `StorySection`, `TestimonialPrompts`, gold curve, `heroStudents` CTA image | — | — |

## 5. Hero form behaviour (FE-A, contract D-021)
- Steps: 1 Student (name, class/target exam select grouped by exam) · 2 Parent/Guardian (guardian name optional, mobile, email optional) · 3 Centre & confirmation (centre if options exist, "+ Add a message" disclosure, review `dl` with 44px Edit buttons, consent 24px, submit).
- Visible labels on every control (design's icons kept as `aria-hidden` decoration). Student name `autoComplete="off"`.
- `StepProgress`: `<ol aria-label="Enquiry steps">`, current step `aria-current="step"` gold **+ navy ring**, completed = navy + check + sr-only "(completed)", visible "Step N of 3" text.
- All fieldsets stay mounted (`hidden` attr); one submit handler (Enter = Next); Back `type="button"` before Next; `validateHeroStep` on Next; focus first invalid field; focus new step heading on step change; no autoplay animation (motion-safe opacity only).
- POST once at final submit (raw payload incl. `classOrExam`); server 422 → `heroStepOfField` → jump + focus. Double-submit guard (`inFlight` + `aria-disabled`, Back disabled while sending).
- `received` → success panel with reference, focus heading, "Make another enquiry". `not_configured` → honest warning, stay on step 3, keep data; while `deliveryStatus === "not_configured"` the step-1 privacy line says details won't be sent yet and the button reads "Check my details". Other errors: existing `FormStatus` copy, no focus move.
- Privacy line: "We'll only use these details to respond to your enquiry. Privacy notice" (link). Consent label: keep current wording with Aspire + privacy link (design's shorter text lacks both).
- No browser storage, no per-step API calls, no analytics.

## 6. Tests & guards
- Backend: contract/route/service tests per proposal; **guard test** failing if any of these appear in `src/` outside tests: `98765 43210`, `Palampur`, `Solan` (outside asset registry comments), `Trusted Choice`, `Ex-IIT Faculty`, `20+ Years`, `10+ Years`, `5000+ Students`, `AIR 48`, `Rohan Mehta`, `Sneha Verma`, `Real Success`.
- FE-A: `hero-steps` unit tests + form payload/step-mapping tests. FE-B: render tests per section in both content modes (preview: DEMO badges, no person images beside names; production: fallbacks, zero imported strings). Update `home-page.test.ts` (lead review).
- Gates: typecheck, lint, all tests, build, production smoke (§3 Wave 2).

## 7. Content gaps & owner/Aspire dependencies
Consented hero/faculty/student photos (C: photo shoot brief in UX report §5.2) · official logo files · approval of all §1.4 claims and hero copy · the 12 class/exam combinations · real centre list (design shows Palampur/Solan) · stats evidence · results official records + consent · faculty consent · hostel/safety claims · sports/activities facts · story video (optional) · verified phone/socials · enquiry destination · privacy-notice TBCs (data controller C27, retention, rights) · DPDP consent wording for minors. Full itemised list → `docs/aspire-approval-checklist.md`.

## 8. Open questions for the owner
1. Hero image until a real photo shoot: **(A, recommended)** stock Himachal mountains, lighter overlay, no people; or **(B)** also a small labelled AI "students" postcard (360px, shows ASPIRE-branded AI people).
2. Approve this plan (including committing the setup pack + design references before Wave 1).
