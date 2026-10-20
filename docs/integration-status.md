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
