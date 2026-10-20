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
| Hosting / domain / deployment target | Launch | Aspire — no deployment without approval |

## Deferred technical items
- Content-Security-Policy with nonces.
- Enquiry rate limiter is in-memory (single instance) — needs a shared store before multi-instance hosting. Client IP now comes from the rightmost trusted `X-Forwarded-For` hop (`TRUSTED_PROXY_HOPS`, M4).
- Non-POST methods on `/api/enquiries` return Next's default 405 (not the JSON envelope).
- Error-code → HTTP-status mapping exists in both `src/lib/server/http.ts` (BE) and `src/lib/auth/responses.ts` (PORTAL); consolidate into `src/lib/contracts/api.ts`.
- Portal "Preview" banner/badges must be removed when a real identity provider is connected (`docs/auth-and-portals.md`).
- Analytics: none installed; event plan needs owner + privacy approval.
- No git repository yet (owner hasn't requested one).
