# Integration Status

Owner: Orchestrator. Updated after each merge. Only commands actually run are listed.

## Milestone 1 — Skeleton (integrated 2026-10-19; QA pass in progress)

| Workstream | Owner | Status | Notes |
|---|---|---|---|
| Scaffold, tokens, shell, shared contracts | Orchestrator | complete | |
| Discovery pages (Home, Programs, Program detail, Results, Centres) | FE-A | complete | |
| Conversion & content pages (Admissions, Contact, About, Resources, Article, Privacy, Terms, error boundary) + EnquiryForm | FE-B | complete | |
| Public API + enquiry handling (`docs/api.md`) | BE | complete | |
| Proxy, auth boundary, portal shells, login (`docs/auth-and-portals.md`) | PORTAL | complete | |
| Runtime / visual / accessibility QA (`docs/qa-report-m1.md`) | QA | complete | 0 Critical/High; M-1, M-2 + L-1–L-10 fixed by Orchestrator (L-11 accepted: health exposes non-secret flags only; L-12 → content register) |
| Temporary stock imagery (`docs/asset-manifest.md`) | IMG | complete | 12 Unsplash-licensed photos, self-hosted, D-018 |

### QA fix verification (Orchestrator, 2026-10-19)
| Check | Result |
|---|---|
| `typecheck` / `lint` / `test` / `build` after fixes + images | all pass (317 tests) |
| Slug 404s (prod): `/programs/<unknown>`, `/resources/<unknown>`, unpublished placeholder slugs | 404 on **first** request (`ensureStatic = "navigation"`, D-017); no duplicated chrome |
| Unknown `/api/*` (prod) | 404 `application/json` envelope |
| Mobile menu (browser, dev) | Escape closes from toggle and from panel; focus returns to toggle |
| Images (browser, dev) at 360 / 768 / 1280 on `/`, `/about`, `/programs`, `/programs/iit-jee`, `/resources`, article, `/admissions`, `/contact` | all load, no broken images, no horizontal overflow; hero served via `/_next/image` (~235 KB at 1920w) |

## Next release — lead routing: super admin, areas, the 1-hour call rule, Meta and CSV leads (integrated 2026-10-22)
Base: live release `3394b3d` **plus the uncommitted working tree** (lead gate, contact-form change, heroes/carousels, homepage tools; the question-bank workflow is still running beside it). Everything here is **uncommitted**. Plan: `docs/lead-routing-plan.md` (D-044 – D-048) · owner questions: `docs/aspire-approval-checklist.md` §19 (LR-1 – LR-8) · contract: `docs/crm.md` §12.

Owner requests (2026-10-22): areas assigned to area heads and executives by a super admin; calling hours and the rest super-admin-only; a 1-hour first call; 12 Himachal districts; Meta leads without Zapier.

| Workstream | Owner | Status | Notes |
|---|---|---|---|
| Super admin, schema (`superadmin`, `crm_intake`), arrival pipeline, seams, settings, secret box, CRM core UI (SA chip, Away, SLA chip, area column / filters, Change area, call-return prompt), settings hub, privacy notice | LR-CORE | complete (fixer pass done) | |
| Districts, resolver, seed, pools, areas admin, availability, reassign, change area, enquiry `district` field | LR-ROUTING | complete (fixer pass done) | |
| Calling hours, clocks, tiers, retry tasks, alert strip, Call now, dashboard | LR-SLA | complete (fixer pass done) | |
| CSV / TSV import (decode, parse, map, Excel damage, chunks, consent basis, history) | LR-IMPORT | complete (fixer pass done) | |
| Meta Lead Ads (webhook, inbox, Graph client, mapping, secrets, actions, test mode, sync cron, setup checklist) | LR-META | complete (fixer pass done) | Fake Graph only; no real Meta call was made |
| Integrate: type check, full suite, lint, cross-package fixes, integration test, live smoke, docs | Integrate | complete | see below |

| Check (Integrate, 2026-10-22) | Result |
|---|---|
| `npx next typegen` + `npx tsc --noEmit` | pass, 0 errors (before and after the integrate fixes) |
| `npx vitest run --maxWorkers=2` | 188 files, 3,626 tests: 3,625 pass; the 1 failure is `src/components/home/home-page.test.ts` "placeholder names" (the hero form's district list now contains the real district **Solan**, which the test's mock-up filler list forbids; owned by the finished homepage work, left for its owner: strip the district `<select>` before that check) |
| eslint on every lead-routing file and folder | 0 problems |
| New integration test `src/app/api/crm/lead-routing-integration.test.ts` (plan §25.5, real handlers and seams, fake Graph, fixed clock) | 9 / 9 pass: CLI bootstrap + ordinary admin refused; 12 areas + Set up from centre; signed webhook → Kangra, the less-loaded Dharamshala executive, due +1 working hour, redelivery adds nothing; Solan borrowed by Shimla (head sees it, not Kangra's); CSV twice / overlapping / lost family attached; erase → `erased_family`; `no_answer` retry task + `connected` reached; overdue digest for the head; Meta silence alert |
| Live smoke on the local dev server (synthetic data, then erased / disabled / removed through the APIs) | pass: CLI `list`; 12 areas; Set up from centre (Dharamshala → Kangra + Chamba) with a TEST head and 2 TEST executives; alias mapping + resolver; calling hours + 60-minute rule saved; ordinary admin: every settings page read-only and 14 write APIs → 403; CSV in Meta's export format (5 rows: 3 created and routed to Kangra, 1 invalid phone, 1 in-file duplicate; re-import → 0 created); signed webhook → held (integration off, so no Graph call), redelivery → still one inbox row, tampered → 401; an enquiry older than one working hour → overdue in the head's area queue, digest, inbox `sla=overdue` and both dashboards; headless Chrome: 10 CRM pages × 360 / 1280 px, no console errors, no horizontal overflow |

### Lead-routing release conditions
- **Before deploying:** set `INTEGRATIONS_SECRET` in the server `.env` (deploy/README.md, "Integrations key").
- **Right after deploying:** `docker compose exec app npm run auth:super-admin -- list` (then `grant` if it says no super admin). Until a super admin exists, nobody can create staff logins or change the new settings.
- **Behaviour change at deploy:** areas mode is the default; with no area members yet, enquiries still follow the old rules, but free-tool sign-ups with no district wait in **Tool sign-ups** instead of being auto-assigned. Every new lead gets a 1-working-hour first-call clock (in-app alerts only).
- **Optional:** the Meta sync cron needs the owner's approval, `INTEGRATIONS_CRON_TOKEN` and the header file (deploy/README.md step 4). No nginx change.
- **Owner steps after deploy:** Settings → Areas & people (heads and executives per centre), Calling hours & speed (defaults: Mon–Sat 09–19, Sun 10–13, 60 minutes), then Meta: the setup checklist on the Integrations page (plan Part 2); until Meta allows the live link, import the Leads Center CSV twice a day.
- Hindi: every new string is a machine draft (`docs/hindi-review-register.md` → LEAD-ROUTING); the privacy lines also need legal review.

## Next release — question bank and exam-pattern mock tests (in progress 2026-10-22)
Base: live release `3394b3d` **plus the uncommitted working tree** (including the lead-gate work below and the 22 Oct 2026 contact-form change). Everything here is **uncommitted**: not yet type-checked as a whole, built, committed or deployed. Plan: `docs/question-bank-plan.md` (v2) · decisions D-050 – D-058 · operator guide: `docs/question-bank.md` · owner and counsel questions: `docs/aspire-approval-checklist.md` §18 (QB-1 – QB-17) · public routes: `docs/api.md` → "Exam-pattern mock papers" · Hindi: `docs/hindi-review-register.md` → QUESTION-BANK · deployment: `deploy/README.md` → "Question bank".

Owner request (22 Oct 2026): a question bank built from the last 10 years of official papers, which staff extend in the admin panel; questions sorted into easy, medium and hard; a new paper for every mock attempt with the right weight from each category, as close as possible to the real pattern. Owner decisions: sources are both official papers with answer keys (PDF) and Aspire's own files (Excel, Word, PDF, CSV), AI-extracted and staff-reviewed before use; exams JEE Main, NEET UG, JEE Advanced and Aspire BOH (pattern unknown: a staff-editable placeholder).

| Workstream | Owner | Status | Notes |
|---|---|---|---|
| Foundations: dependencies (`katex`, `pdf-lib`, `read-excel-file`, `mammoth`), `qb_*` schema, types, patterns, generator, rich text, fingerprints, calibration maths, request schemas | QB-CORE-A | in progress (parallel build) | |
| Services: access, questions, pool, taxonomy, figures, blueprints, windows, papers, stats, corrections, reports, search, import hooks | QB-CORE-B | in progress (parallel build) | |
| Seed: official unit names (cited), NCERT-aligned chapters, four draft blueprints, sample questions (demo mode only) | QB-SEED | in progress (parallel build) | Must not create any official or "past year" question |
| Mock-test integration: scoring (partial, ranges, integer), paper routes, ranked windows and boards, key-correction re-scoring, figure route; JEE sample numerical marking −1 (D-058) | QB-MOCKTEST-API | in progress (parallel build) | Keeps the working-tree lead-gate behaviour of `/score` |
| Student pages: `/tools/mock-tests/exam/[slot]`, generated runner, result extras | QB-MOCKTEST-UI | in progress (parallel build) | Must not edit `src/components/home/**` (another workflow is redesigning the homepage tools) |
| Admin APIs `/api/admin/qb/**` (except imports) | QB-ADMIN-API | in progress (parallel build) | |
| Admin screens `/admin/questions/**`, portal nav and staff access | QB-ADMIN-UI | in progress (parallel build) | |
| Import pipeline (PDF / DOCX via Claude, CSV / XLSX template), import APIs and screens | QB-IMPORT | in progress (parallel build) | Fake client only; no real Claude calls before Integrate |
| Operator guide, decisions, checklist §18, Hindi register, API doc, `.env.example`, deploy notes, `backup.sh` optional `KEEP_LOCAL_*` / `FIGURE_SYNC` | QB-DOCS | complete (written to the plan's contracts; fixer pass re-checked against the code that had landed by about 03:50 IST, 22 Oct, by reading the source) | Corrected: admin API table (`docs/question-bank.md` §15), paper-token transport and result timing (`docs/api.md`), AI-only import switch, official-site list, CSV template and key columns, import-file retention, nginx limit scoped to the import route, calibration thresholds fixed in code. Import routes and admin screens had not landed: re-check at Integrate |

| Check | Result |
|---|---|
| Per-package vitest (`--maxWorkers=1`) + eslint on touched files | run by each package; results in each package's report (QB-DOCS: docs only, plus `bash -n deploy/backup.sh`, which passed) |
| `tsc` / full test suite / `next build` / browser smoke / at most 2 real extraction calls on a 1-page original test PDF | **not run yet**; due in the Integrate stage (machine limits: one heavy run at a time) |

### Question-bank release conditions
- **Nothing reaches students before an admin publishes a blueprint**, and nothing can be imported for an exam before its syllabus list is confirmed. The bank starts empty: the exam pages show "coming soon", or labelled shorter or sample papers (sample only in demo mode).
- **Owner actions before deployment:** nginx `client_max_body_size 10m;` in a `location ^~ /api/admin/qb/imports` block only (not site-wide), the data folders `/opt/aspire-web/data/qb-imports` and `qb-figures` owned by uid 1000, `QB_IMPORT_ENABLED=0` in `.env` until AI import is approved (QB-7; it stops AI imports only, CSV / XLSX template imports still work), the backup choices (QB-11), and a manual check that the source-PDF viewer opens in Chrome (`deploy/README.md` → Question bank).
- **Rights first:** no official paper is imported before Aspire answers QB-1; no third-party material until the rights are confirmed.
- **BOH** cannot be published until an admin confirms its pattern and adds BOH chapters (QB-4).
- **Integrate stage:** record and retire or archive every item the browser smoke creates in the owner's dev database; check FTS5 in the Docker image; set the `QB_IMPORT_EFFORT` default and the estimate constants from the two test calls; re-check `docs/question-bank.md`, `docs/api.md` and the Hindi register against the code; run the home-tools and learner-tools tests to confirm the catalog contract.
- **Follow-ups once the parallel workflows land:** a "Question bank" link on the CRM's no-membership panel for bank-only staff; optionally, the homepage widget lists the exam-pattern mocks; document staff access to `/admin/questions` in `docs/auth-and-portals.md`.
- **Known gap, out of scope:** the existing fixed weekly sample test can reveal per-question results during an open week, the same answer-key leak the ranked papers close; reported to the mock-test owner.
- Hindi: every new string is a machine draft (`docs/hindi-review-register.md` → QUESTION-BANK); official instruction wording should be copied from NTA's Hindi documents.

## Next release — lead gate: contact details before free tools' results (in progress 2026-10-21)
Base: release `806a938` (being deployed 2026-10-21). Everything below is **uncommitted in the working tree**: not yet type-checked as a whole, built, committed or deployed. Plan: `docs/lead-gate-plan.md` (D-043) · owner and counsel questions: `docs/aspire-approval-checklist.md` §17 (TG-1–TG-9, LG-2) · public routes: `docs/api.md` → "Lead gate" · CRM: `docs/crm.md` §11 · MCP: `docs/mcp.md`.

Owner request: *"every tool should be a data collection point before showing the result of any tool collect the contact information of the submitee."* **Owner decision (21 Oct 2026): on now, with an honest note** — `LEAD_GATE=required` on the live (demo) site although it runs on sample data; the form says plainly that results currently use sample data and that Aspire will contact the family.

| Workstream | Owner | Status | Notes |
|---|---|---|---|
| Core: contract, config, pass token/cookie, limits + flood breaker, `/api/lead-gate` (+ `/usage`), client kit (`useLeadGate`, `LeadGateForm`, `LeadGateNote`, `LeadGateIdentity`), `leadGate` messages, CRM passes + `tool_use`, enquiry pass cookie, sign-out | GATE-CORE / CORE | built; sample-data override in progress | Sample data no longer forces the gate off; `LeadGateForm` shows `leadGate.sampleData`; `LEAD_GATE_ALLOW_SAMPLE_DATA` removed |
| Predictor (full page) §8.1 | PREDICTOR (WP2) | in progress | |
| Homepage widget predictor §8.2 (planner countdown not gated §8.3) | HOME (WP3) | in progress | |
| Mock tests: ≥ 60 min ask at the start, shorter at the result; `/api/mocktest/score` 401 §5.7 | MOCKTEST (WP4) | in progress | |
| Study planner: first guest plan only §8.5 | PLANNER (WP5) | in progress | |
| `/api/ask` gate 401, per-family allowance, "Rancho used" note §5.6 | ASK-API (WP6) | in progress | |
| Rancho UIs (Ask page, `/rancho`, floating chat) §8.6 | RANCHO-UI (WP7 + WP8) | in progress | |
| CRM UI: tool-use / withdrawal labels, consent list, "confirm with a parent first", daily gate-lead count, MCP strips score bands; admin-console "CRM basics" | CRM (WP9) | in progress | |
| Privacy notice (en + hi): new section, cookie, tools column and items; checklist §17; docs; Hindi register | LEGAL (WP10) | complete | `src/i18n/messages/{en,hi}/legal.ts`, privacy page + `privacy-page.test.ts` |

| Check | Result |
|---|---|
| Per-package vitest (`--maxWorkers=1`) + eslint on touched files | run by each package (LEGAL: privacy, i18n, legal, PAGES-B and Rancho-page suites pass; eslint clean) |
| `tsc` / full test suite / `next build` / production smoke | **not run yet**; due in the Integrate stage (machine limits: one heavy run at a time) |

### Lead-gate release conditions
- **Server settings at deploy** (`/opt/aspire-web/.env`, then `docker compose up -d`; no rebuild): `LEAD_GATE=required`, `LEAD_GATE_SECRET` (≥ 32 random chars; without it production forces the gate off), `LEAD_GATE_SINCE` = the switch-on time. Keep `LEAD_GATE_RECORD_USE` / `LEAD_GATE_ASSIGN` at their defaults until Aspire answers TG-9.
- **Rollback:** `LEAD_GATE=optional` (skip button) or `off` in `.env`, then `docker compose up -d`. Pages need no change: the up-front note reads the live mode, and the privacy notice says the tools "may ask". The notice's sample-data paragraph follows `SHOW_PLACEHOLDER_CONTENT` (build time), like the form's sample line.
- **`LEAD_GATE_SINCE` is required, not optional:** without it every guest mock-test attempt is gated, including ones started before switch-on, and the privacy notice says those stay open. Not built (MOCKTEST): the plan's exemption for an attempt that already has a score on the device, so a score already seen asks again once the browser loses its pass (checklist TG-3).
- **Switched on before the plan's §10 preconditions** (owner decision): counsel has not answered TG-1 (required vs optional), TG-2 (verifiable parental consent for under-18s, DPDP s.9 — highest risk) or TG-4; the privacy notice still has 11 "to be confirmed" items; the retention purge (CRM-3) is not built. The sample-data line in the form and notice must be removed when official data replaces the samples.
- `/`, `/tools/predictor` and `/tools/planner` must stay static in the `next build` route table (the gate reads the mode at run time only).
- Copy that became untrue (plan §11.4) must change in the same release and **has no owner yet** (assign at Integrate): `tools.ts` `hero.lead` "No sign-up needed to start" and the hub `note` (en + hi), `docs/ask-aspire.md` guests line ("nothing is stored except a hashed per-day question counter"); "Free" meta titles and `isAccessibleForFree` → TG-7. Checklist §17 / TG-7 lists the /tools lead as not yet changed.
- CORE: `LeadGateForm`'s consent link should open `/privacy#tool-contact-details` (the section the tick covers), not the top of the notice.
- Hindi: every new or changed string of this release is a machine draft (`docs/hindi-review-register.md` → LEAD-GATE); the consent sentence and the privacy section also need legal review.

## Next release — Rancho, homepage student tools, carousels always on (in progress 2026-10-20)
Base: live release `828ec27` (M7: CRM lead engine, MCP per-service permissions, tablet fixes). Everything below is **uncommitted in the working tree**: not yet built, committed or deployed. Owner questions: `docs/aspire-approval-checklist.md` §16 (RA-1–RA-6, HT-1–HT-3, CA-1–CA-2) · Rancho: `docs/ask-aspire.md`, `docs/rancho.md` (being written).

| Workstream | Owner | Status | Notes |
|---|---|---|---|
| Homepage student-tools widget between Programs and Why Aspire (predictor rank band, mock-test list, Ask Rancho examples, planner countdown) | HOME-TOOLS | complete, awaiting deploy | `src/components/home/HomeTools*.tsx`, `home-tools*.ts`; sample tables and tests only in dev / preview, labelled; planner countdown worked out in the browser; nothing typed is stored or sent |
| "Ask Aspire" renamed to Rancho (Aspire's existing snow leopard mascot): en + hi copy, mascot on the Ask page and tools hub (`PageHero` `media` prop, `RanchoMediaPanel`), API fallback strings, persona prompt `2026-10-20.2`, CRM label "Ask Rancho (doubts)", privacy wording | RANCHO-NAME | complete, awaiting deploy | Route unchanged (`/tools/ask`). Temporary SVG stand-in until the official artwork arrives (`src/components/rancho/rancho-assets.ts` → `OFFICIAL_RANCHO_ART_AVAILABLE`). Admin MCP tool descriptions still say "Ask Aspire" |
| Floating Rancho chat button on every public page (typed questions only; photo questions → `/tools/ask`; hidden on `/tools/ask`, during a mock-test attempt and in print) | RANCHO-UI | in progress | `src/components/rancho/**`, `(site)/layout.tsx`, `rancho` messages; same `/api/ask` backend and daily limits as the Ask page; footer bottom padding raised so its last row clears the button |
| All carousels autoplay, including the results rail and result-card marquee; also under `prefers-reduced-motion`, with instant (non-sliding) changes; visible Pause on each (WCAG 2.2.2) | Carousel workflow | in progress (build, then 3 checks) | `src/components/ui/ImageCarousel.tsx`, `carousel-utils.ts`, `ResultRail.tsx`, `ResultCardMarquee.tsx`. Accessibility trade-off chosen by the owner (checklist CA-2) |
| Owner sign-off items (checklist §16) and this section | DOCS | complete | |

| Check | Result |
|---|---|
| typecheck / lint / test / `next build` / production smoke | **not run yet** for this release; due once the two in-progress workstreams land |

### Next-release conditions
- **Rancho's artwork is a temporary stand-in.** It must never be presented as Aspire's official Rancho. Swap it in when Aspire sends the files (checklist RA-2).
- **Rancho must always read as an AI**: AI disclosure on the Ask page, in the chat and in the privacy notice; the persona never claims to be human and never invents mascot facts (RA-3, RA-4). Any prompt wording change is a new `ASK_PROMPT_VERSION`.
- **Carousel autoplay on reduced-motion devices is the owner's choice**, not the web team's default (CA-2). The visible Pause control must stay on every carousel.
- Hindi: the widget's example doubts need a subject teacher's check (HT-3). The Rancho copy is part of the Hindi machine-draft review (HI-1).

## Milestone 4 — Hindi site, logins, image-rich pages, faculty removed (integrated 2026-10-20)
Plan: `docs/m4-plan.md` (D-028 i18n, D-029 auth, D-030 imagery) · briefs: `docs/m4-briefs.md` · integrity review: `docs/m4-integrity-review.md` · Hindi register: `docs/hindi-review-register.md` · auth: `docs/auth-and-portals.md` · owner questions: `docs/aspire-approval-checklist.md` §15.

| Workstream | Owner | Status |
|---|---|---|
| Faculty info removed (`/faculty` → `/about`, no names/profiles/founder message/centre heads, API strips `head`) | Lead | complete |
| `[lang]` routing (English unprefixed, Hindi `/hi`), Hindi chrome, switcher, Devanagari fonts, hreflang, sitemap/robots | I18N-CORE | complete |
| Locale-aware content + Hindi overlays (`src/content/hi/**`) | CONTENT-HI | complete (machine draft) |
| 36 licensed stock photos (24 new) | IMG2 | complete |
| Pages: home/programs/results/centres/forms · about/hostels/admissions/contact/resources/legal | PAGES-A · PAGES-B | complete (en + hi) |
| Auth core (SQLite, scrypt, sessions, throttling, admin APIs, audit) · login UI + 3 portals + admin user management | AUTH-1 · AUTH-2 | complete |
| Image uplift to ~50/50 (`PageHero` image, `MediaSplit`, `PhotoBand`, `StickyMediaLayout`) | UPLIFT-A · UPLIFT-B | complete |
| QA public · QA auth/security · content integrity | QA-PUBLIC · QA-AUTH · INTEGRITY | complete; findings fixed or raised with Aspire |

| Check | Result |
|---|---|
| typecheck / lint / test | pass — 41 files, 884 tests |
| `next build` | success — 123 static/partial pages, no warnings (earlier auth prerender log errors fixed with `unstable_rethrow`) |
| Production smoke (`next start`, fresh build) | **63/63** — 26 public pages (13 × en/hi): 200, correct `<html lang>`, one h1, 0 DEMO, 0 faculty; `/en/*`, `/faculty`, `/hi/faculty` redirects; portal/account → localised login; 404s; robots disallows portal/account/login in both locales; sitemap with hreflang; `/api/centres` without heads; student/parent/admin sign-in (cookie HttpOnly + Secure + SameSite=Lax), every portal page en + hi (200, `noindex`, `no-store`), cross-role API denial, logout revokes, unknown login 401, cross-origin login 403 |
| QA public (dev, preview) | all routes × locales pass; no overflow 320–1920; first fold fits at 1280×600 … 1920×1080 in both locales; Hindi complete; numbers match English |
| Image share at 1440 (preview content) | 45–50 % static on Home, Programs, Program detail, Centres, About, Hostels, Admissions, Contact, Resources; long-form pages 41–55 % of the viewport while reading (Results, Articles, Privacy, Terms) |
| QA auth (≈450 live assertions) | 0 Critical/High; M1 (forged `X-Forwarded-For` bypassed the per-IP limit) **fixed** (`TRUSTED_PROXY_HOPS`, rightmost trusted hop); L1–L5 documented as owner/deployment decisions |

### Deployment — aspire.thechunkmedia.com (2026-10-20, owner request)
| Item | State |
|---|---|
| Release | `9c8a5f9` (M3 + M4 + Docker deployment), production build (demo data hidden), browser password prompt on (`PREVIEW_ACCESS_PASSWORD` in `/opt/aspire-web/.env`) |
| Server | VPS 69.62.76.109 (shared: thechunkmedia.com, aspire2, others untouched). Docker compose project `/opt/aspire-web`, container `aspire-web-app-1` on `127.0.0.1:3011`, Node 24, auth DB `/opt/aspire-web/data/aspire.sqlite` |
| nginx | `/etc/nginx/sites-available/aspire.thechunkmedia.com` → `proxy_pass http://127.0.0.1:3011` (+ `proxy_hide_header X-Frame-Options`); backup in `/opt/aspire-web/nginx-backup/` |
| Previous site | `/opt/aspire-demo` stack (port 3010 + Postgres) **stopped, not removed** — rollback in `deploy/README.md` |
| First admin | `aspire.admin`, temporary password in root-only `/opt/aspire-web/first-admin.txt`; must change at first sign-in |
| Live checks | 401 without password; 22 routes over HTTPS as expected (en + hi, redirects, 404, sitemap, robots, health); admin sign-in: Secure/HttpOnly/SameSite cookie, wrong tab 401, temporary-password gate 403, change-password page en + hi, logout revokes, cross-origin 403; thechunkmedia.com and aspire2 still 200 |

### Milestone 4 conditions
- **Hindi is a machine draft** — native review before launch (checklist HI-1/HI-2); the privacy additions also need legal review (LG-1).
- **Auth store is a single SQLite file** (`AUTH_DB_PATH`, default `.data/aspire.sqlite`) — one server instance, persistent disk, backups; create the first admin with `npm run auth:create-admin`; never run `auth:seed` on a server.
- Run behind a reverse proxy that sets `X-Forwarded-For`; set `TRUSTED_PROXY_HOPS` if there is more than one.

## Milestone 3 — Homepage showcase + 3-step hero form (integrated 2026-10-20)
Full report: `docs/homepage-implementation-report.md` · QA: `docs/visual-qa-report.md` · Approvals: `docs/aspire-approval-checklist.md` · Map: `docs/homepage-showcase-content-map.md`.

| Check | Result |
|---|---|
| typecheck / lint / test | pass — 26 files, 528 tests |
| build + production smoke (fresh build 02:57:29) | pass — 0 imported data / DEMO / filler on `/` and `/results`; hero POST `not_configured` |
| Preview password gate (D-027) | built and tested (401 on every page/API without the password; images exempt so next/image works); **off locally** by owner choice — set `PREVIEW_ACCESS_PASSWORD` in the host's settings for any shared preview |
| QA Wave 2 | no blocker/high; M-1/M-2 fixed; L-1…L-7 open (polish / preview-only) |

## Milestone 2 — Demo-site data + Aspire assets (integrated 2026-10-20)

| Workstream | Owner | Status |
|---|---|---|
| Demo-site content import (`docs/demo-data-import.md`) | DATA | complete — 4 programs, 4 campuses, 18 results, 715 rankers, 8 faculty, 13 testimonials, 16 stats, hostels, institute profile, contact |
| Aspire asset registry + `<AspireImage>` (D-019) | Orchestrator | complete (width-class fix applied 2026-10-20) |
| Home | P2-HOME | complete |
| Programs, Results, Centres, `/faculty`, `/hostels` | P2-DISCOVERY | complete |
| About, Admissions, Contact, Resources | P2-CONTENT | complete |
| Header/footer contact, nav, sitemap, `/api/results` whitelist | Orchestrator | complete |

| Check | Result |
|---|---|
| `typecheck` / `lint` / `test` | pass — 20 files, 347 tests |
| `build` | success — `/faculty`, `/hostels`, new program slugs prerendered |
| Dev (preview) smoke test, 14 routes | all 200, one `h1` each, no runtime errors; DEMO badges present; 18 Aspire assets on Home all 200 |
| Production smoke test, 10 pages + sitemap | 0 DEMO badges, 0 imported names, phone, email or addresses; `/api/results` and `/api/programs` empty |
| Preview `/api/results` | 18 records, 0 names / schools / quotes (consent pending) |
| Visual browser check of M2 pages | **not done** — browser tooling disconnected; owner to review on `npm run dev` |

### Milestone 2 conditions (demo-site import, D-020)
- **Any preview deployment that shows placeholder content must be access-restricted** (password / IP allow-list): it renders 715 ranker names, 18 result records and 13 testimonials that look like real people, with consent `pending`. Production builds hide all of them.
- `/api/results` exposes names, schools and quotes only with `granted` consent — never for placeholders, even in preview (`toPublicResult` whitelist).
- 27 conflicting values from the demo site await Aspire's decision (`docs/demo-data-import.md`).

### Known limitations (accepted for M1)
- Segment-level 404s (`notFound()` inside `(site)`) return a correct 404 status + `noindex`, but the HTML body is rendered client-side from the RSC payload (empty before JS). Root 404 for unmatched URLs is fully server-rendered.

### Integration verification (Orchestrator, 2026-10-19)
| Command / check | Result |
|---|---|
| `npm run typecheck` | pass (exit 0) |
| `npm run lint` | pass (no findings) |
| `npm test` | 16 files, 317 tests passed |
| `npm run build` | success — 50 routes; public pages static, portal pages partial prerender, request-reading APIs dynamic |
| `next start` smoke test (production defaults) | public routes 200; placeholder detail pages 404 (placeholders hidden); `/student` `/parent` `/admin` → 307 `/login?next=…`; portal APIs 401 JSON; `x-robots-tag` on portal responses; security headers present; robots.txt disallows portal/API |
| `POST /api/enquiries` via curl | valid → 200 `not_configured`; cross-origin / missing origin → 403; text/plain → 415; bad fields → 422 with field errors; free-text centre → 422; 6th request/IP → 429; GET → 405; server log contains no personal data |

### Running modes
| Mode | How | Shows |
|---|---|---|
| Development | `npm run dev` | Placeholder (DEMO) content + portal preview shells |
| Client-review build | `SHOW_PLACEHOLDER_CONTENT=true PORTAL_PREVIEW=true npm run build && … npm start` (flags needed at **build and start** — static pages bake the flag in) | Same as dev, noindexed |
| Production defaults | `npm run build && npm start` | Only verified content (currently almost none); portals redirect to `/login` |

## External dependencies / blockers

| Dependency | Needed for | Owner action |
|---|---|---|
| Enquiry destination (CRM, email inbox or webhook) + handling process | Live enquiry forms | Aspire to choose; set `ENQUIRY_DESTINATION` (webhook adapter ready) |
| Student/parent/staff records (timetables, marks, attendance) | Portal data beyond account details (sign-in itself is built, M4) | Aspire to confirm which system holds them |
| Staff permission model (which staff see which learners; audit) | Admin access to learner records (D-015) | Aspire |
| Verified content (see `content-verification.md`) | Publishing anything as fact | Aspire |
| Approved photography + brand files | Final visuals | Aspire |
| Rancho official artwork: head / avatar ≥ 512 × 512 and waving / half-body ≥ 1024 px tall, transparent PNG / WebP / SVG, with confirmation of ownership | Replacing the temporary mascot stand-in | Aspire to send the files (checklist RA-2) |
| Hosting / domain / deployment target | Launch | Aspire — no deployment without approval |
| Legal counsel's answers on the lead gate: verifiable parental consent (DPDP s.9), "required" vs "optional" (s.6), DND calling, notice gaps | Keeping the contact step lawful while it is live | Aspire's legal adviser (checklist §17: TG-2, TG-1, TG-4, TG-8) |
| Rights to use official NTA / IIT papers and keys, and any third-party material in Aspire's files | Importing official questions into the question bank | Aspire's legal adviser (checklist §18 QB-1) |
| Official paper and answer-key files (older JEE Main shifts may only be in candidates' logins), Aspire's own question files | Filling the question bank | Aspire to collect from the official sites (nta.ac.in and subdomains, *.nic.in, NTA's government CDN *.s3waas.gov.in, jeeadv.ac.in and IIT sites; NMC and NCERT for syllabi; checklist QB-1(d)) and its own archives (never coaching websites) |
| The BOH pattern and chapter list; the question-bank team (authors, reviewers); approval of AI import and its daily cap | BOH mocks; reviewing imports; running imports | Aspire (checklist §18 QB-4, QB-7, QB-8) |
| More VPS disk (about 2 GB free) before the ten-year backfill, or fewer local backup copies | Room for the full bank, its figures and backups | Owner (checklist §18 QB-11) |

## Deferred technical items
- Content-Security-Policy with nonces.
- Enquiry rate limiter is in-memory (single instance) — needs a shared store before multi-instance hosting. Client IP now comes from the rightmost trusted `X-Forwarded-For` hop (`TRUSTED_PROXY_HOPS`, M4).
- Non-POST methods on `/api/enquiries` return Next's default 405 (not the JSON envelope).
- Error-code → HTTP-status mapping exists in both `src/lib/server/http.ts` (BE) and `src/lib/auth/responses.ts` (PORTAL); consolidate into `src/lib/contracts/api.ts`.
- Portal "Preview" banner/badges must be removed when a real identity provider is connected (`docs/auth-and-portals.md`).
- Analytics: none installed; event plan needs owner + privacy approval.
- Admin MCP tool descriptions (`src/lib/mcp/tools/status.ts`, `progress.ts`) still say "Ask Aspire"; rename to Rancho in a later release (checklist RA-6).
- No git repository yet (owner hasn't requested one).
- Lead gate: retention purge for unconverted leads (CRM-3), a do-not-contact list that survives erase, a one-tap "Request a call back" for pass holders; limiters and the flood breaker are in memory (single instance) — `docs/lead-gate-plan.md` §9.
- Question bank, phase 2 (`docs/question-bank-plan.md` §B17): JEE Advanced ranked pair with a combined board, pattern variants once 2024–2025 are verified, easier / typical / tougher mix presets, an expected-time budget, option shuffling for Aspire questions, "freeze a preview as a fixed paper", part-syllabus slots, more BOH slots, a PDF figure cropper, IRT, a strength summary across a student's papers, the homepage widget listing, certificates for generated papers. The Message Batches path is tested with fakes only until the owner's pilot; generator and report rate limits are in memory (single instance).
