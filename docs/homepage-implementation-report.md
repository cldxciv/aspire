# Homepage Showcase — Implementation Report

Date: 2026-10-20 · Plan: `docs/homepage-implementation-plan.md` (owner-approved) · Base commit: `59ec12c`
Design: `reference/homepage/01-approved-first-fold.png` (primary), `02-full-page.png`, `03-design-details.png` (palette + form spec)

## Outcome
The homepage was rebuilt as the approved institutional showcase with a 3-step hero enquiry form, a new navy header and footer, and the design-details palette — while keeping every existing route, API, portal preview and the content-integrity safeguards. Production shows only honest copy and fallbacks (nothing is approved yet); preview builds show imported demo data with DEMO labels behind a password gate.

## How the work ran
| Phase | Agents | Result |
|---|---|---|
| 1 · Read-only audit | content researcher, UX designer, QA baseline, content integrity reviewer, backend engineer (parallel) | Plan synthesis; 18 new conflicts (C28–C45); D-021 contract proposal |
| 0 · Lead setup | Orchestrator | Commit `59ec12c`; decisions D-021–D-026; serif font, tokens, focus rules, nav config, `getRankerYearCounts()`; risky claims removed from content |
| 1 · Build (parallel) | backend, header/footer, hero + form, sections I, sections II | All delivered; design-details follow-ups (D-021a, D-026) applied by four agents |
| 2 · Verify (parallel) | QA auditor, content integrity reviewer | No blockers/high; findings fixed (below); `docs/visual-qa-report.md`, `docs/aspire-approval-checklist.md`, `docs/homepage-showcase-content-map.md` |
| 3 · Integrate | Orchestrator | `page.tsx` composition, retired 7 old sections, test rewrite, fixes, preview gate (D-027), rebuild + smoke |

## What changed (high level)
- **Header / footer** (`src/components/layout/**`): single 72px navy bar, serif placeholder logo, Programs ▾ / Resources ▾ disclosures, gold "Enquire Now" (→ `#home-enquiry` on `/`), login icon, hamburger below `xl`, slim preview banner; navy footer with validated social links and portal/legal row, no year.
- **Hero + 3-step form** (`HomeHero.tsx`, `forms/HeroEnquiryForm.tsx`, `StepProgress.tsx`, `hero-steps.ts`): stock Himachal photo with lighter overlay + labelled AI "Illustration" postcard (xl + tall only, D-023); steps Student Information → Contact Details (guardian name + mobile required) → Preferences (centre if any, message, consent); per-step validation, focus management, Back keeps data, one POST, honest `not_configured`.
- **Contract** (`src/lib/contracts/enquiry.ts`, D-021/D-021a): `source: "hero"` with `classOrExam` (12 pairs → `currentClass` + `programInterest`), required `guardianName`; `quick` still accepted; privacy field table and `docs/api.md` updated; guardian name never logged.
- **Sections** (`src/components/home/**`): StatsBand, ResultsShowcase/ResultRail, ProgramPaths, WhyAspire, FacultySpotlight (4 cards, initials), CentresShowcase + HimachalMap + CentrePicker, CampusLifeTiles, TestimonialsSection, ImpactChart (server SVG + table, D-025), ResourcesTeaser, CtaBand photo variant ("Call Us" only with data).
- **Global**: Source Serif 4, D-026 palette tokens, gold focus on dark surfaces, `scroll-padding-top`, `short:`/`tall:` variants (`globals.css`, `layout.tsx`).
- **Data / privacy hardening**: `getRankerYearCounts()` (counts only, duplicates once); client view models carry only displayed fields; `/results` archive projection; `/api/centres` + `/api/programs` strip `sourceRef`; risky claims removed from content (BOH "100%", "results you can verify", refund charter, response-time promises).
- **Preview gate** (D-027, `src/proxy.ts`, `src/lib/auth/preview-gate.ts`): HTTP Basic password on every route when `PREVIEW_ACCESS_PASSWORD` is set (value only in git-ignored `.env.local`).

## Verification (commands actually run, final state)
| Check | Result |
|---|---|
| `npm run typecheck` | pass (exit 0) |
| `npm run lint` | pass (0 problems) |
| `npm test` | **26 files, 528 tests passed** (baseline 347) |
| `npm run build` | success (BUILD_ID 02:57:29, after all fixes) |
| Production smoke (`next start :3100`, fresh build) | `/` + `/results` HTML & RSC: 0 DEMO, 0 imported names/phones/emails, 0 `sourceRef`/`consentStatus`, 0 mockup filler; new privacy line present; no centre option; hero POST → 200 `not_configured` |
| Preview gate | `:3000` and `:3100`: no auth / wrong password → 401 (`WWW-Authenticate: Basic realm="Aspire preview"`), right password → 200, incl. APIs and `/images/*` |
| QA (Wave 2, headless Chrome/CDP) | 31 routes 200 (one h1/main each); first fold step 1 fully visible at 1280×600, 1366×657, 1440×789, 1440×900, 1920×1080 in both modes (min 87px spare); hero form 47/47 interaction checks incl. keyboard-only and single POST on double-click; gold/blue focus audit pass; no overflow 320–1920; production 749 KB initial; `/admissions` + `/contact` forms byte-identical to baseline |
| Content integrity (Wave 2) | production clean; every rendered fact traced to an accessor; no person image beside a name; postcard labelled; no withheld claims |

## Wave 2 findings and disposition
| ID | Finding | Disposition |
|---|---|---|
| QA M-1 | Photo panels upscaled (object-cover crops) | **Fixed** — `sizes` raised in WhyAspire, ProgramPaths, HomeHero |
| QA M-2 | Production build predated latest edits | **Fixed** — rebuilt 02:57:29 and re-smoked |
| CI H-1 | Shared preview exposes named people (consent pending) | **Mitigated** — D-027 password gate on; production hides all |
| CI M-2 | "Foundation – Class 6–8" vs data Class 8–10 | **Fixed** — label "Foundation – Class 8" |
| CI M-3 | Privacy line "We'll only use…" vs notice TBC | **Fixed** — "We use these details to respond to your enquiry." |
| CI L-2 | Step 3 mentions centre when none shown | **Fixed** — neutral description |
| CI L-4 | Guard test string list too narrow | **Fixed** — +10 strings |
| CI L-7 | Palampur/Solan assets registered | **Fixed** — unregistered |
| CI M-1 | New production copy needs approval | Logged in `content-verification.md` + checklist |
| CI M-4 | All 13 testimonials carry outcome wording | Accepted for preview only (DEMO, gated, hidden in production) |
| QA L-1 | Preview `/results` sends `consentStatus`/`sourceReference`/`school` to client | Open (preview-only; production 0) — tighten before any result is published |
| QA L-2…L-7 | Visual polish: stat alignment, rail "1 of 4" at wide widths, postcard gap, trust-row wrap at ≥1536, DEMO badge spacing, duplicate not-connected notice | Open — polish backlog |
| QA note | Hero darker/cooler than the PNG | Owner to review (overlay tuned for AA contrast) |

## Known limitations / owner & Aspire dependencies
- Nothing is approved: production homepage = hero + form, results intro, programs note, Why Aspire (generic), student life (stock), CTA, footer. Approvals: `docs/aspire-approval-checklist.md` (~115 items, C1–C45).
- Enquiries are not connected (`ENQUIRY_DESTINATION`); the form says so honestly.
- Hero/student/faculty photography, official logo, transparent `gold-curve`/clean icons, AI-asset provenance — see `docs/asset-manifest.md`.
- Privacy notice still has "to be confirmed" items (data controller C27, retention, rights); DPDP consent wording for minors needs legal review.
- Social icons reproduce legacy lucide/Tabler outlines (lucide v1 has no brand icons).
- No deploy, no push. Commits: only `6f2f04a` (baseline) and `59ec12c` (setup pack + plan); this milestone's changes are uncommitted pending owner review.
