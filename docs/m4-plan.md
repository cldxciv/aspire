# Milestone 4 — Hindi site, logins, image-rich pages (multi-agent plan)

Owner request 2026-10-20 (owner AFK; execute ASAP): (1) remove faculty info — **done by lead**; (2) images on every page, ~50/50 text-to-visual; (3) Hindi version of the whole website; (4) all types of login (student, parent, admin).
Backup of the pre-M4 tree: scratchpad `backup-pre-m4/`. Base commit `59ec12c` + uncommitted M3 work.

## Decisions (binding; recorded in `docs/agent-decisions.md`)
- **D-028 i18n.** Locales `en` (default) and `hi`. All routes move under `src/app/[lang]/` (root layout there with `<html lang>`); `generateStaticParams` → `[{lang:"en"},{lang:"hi"}]`. **English URLs stay unprefixed** (proxy rewrites `/x` → `/en/x`; `/en/x` redirects to `/x`); Hindi lives at `/hi/x`. Read the locale with `next/root-params` (`lang()`), not prop drilling. UI strings in `src/i18n/messages/{en,hi}/<namespace>.ts` (one namespace per owning agent, typed so `hi` must have every `en` key). Content data is locale-aware: accessors take a locale; Hindi records live in `src/content/hi/` keyed by the same ids. Devanagari fonts (Noto Sans Devanagari body, Noto Serif Devanagari headings) applied for `hi`. Header language switcher (English | हिन्दी) keeps the current path. `hreflang` alternates in metadata + sitemap. Hindi text is a **machine draft** → listed as "needs native review" in the content register. API routes, robots and sitemap stay outside `[lang]`.
- **D-029 Authentication (owner request).** Self-hosted credentials login for **student, parent and admin**: user store in built-in `node:sqlite` at `.data/aspire.sqlite` (git-ignored); passwords hashed with Node `crypto.scrypt` (per-user salt, constant-time compare); server-side sessions (random 32-byte token in an `HttpOnly`, `SameSite=Lax`, `Secure`-in-production cookie; only its SHA-256 stored), 7-day expiry, logout revokes; same-origin check + per-IP/per-account rate limit on login; deny-by-default role and record-level checks (parents only see linked learners); admin user management (create/disable users, link parent↔student, reset password) with an audit log. No email service → "forgot password" says to contact the office (no fake reset). Dev seed creates demo accounts; their generated credentials go to the git-ignored `.data/dev-credentials.txt` (never in chat, docs or git). Portal data stays honest: no LMS is connected, so dashboards show the signed-in user's own account info plus "not connected" states — never invented grades or attendance.
- **D-030 Image-rich pages.** Every public page uses an image `PageHero` variant and alternating `MediaSplit` sections so text and visuals are roughly 50/50 on desktop; licensed stock photos only (`src/content/images.ts`), Aspire assets within `maxWidth`, people never beside real names, illustrative labels kept.

## Phases & file ownership (one owner per file at a time; only the lead runs `next build`)
### Phase A — now, parallel
| Agent | Owns | Delivers |
|---|---|---|
| **I18N-CORE** | `src/app/**` route moves into `[lang]` (mechanical — page copy untouched), `src/app/[lang]/layout.tsx`, `src/proxy.ts`, `src/i18n/**` (config, `getMessages`, `common` namespace), `src/components/layout/**` (strings, `LanguageSwitcher`, Devanagari fonts), `src/app/sitemap.ts`, `src/app/robots.ts`, `next.config.ts`, test import paths for moved pages | Working `/` + `/hi/…` routing for every existing page (Hindi chrome; page bodies still English), tests green |
| **AUTH-1** | `src/lib/auth/**`, new `src/lib/db/**`, new `src/app/api/auth/**`, `scripts/**`, `.gitignore` (`.data/`), `package.json` *scripts only* | Store, hashing, sessions, login/logout/me APIs, rate limit, admin user-management APIs + audit log, seed script, tests. **No page files** until told the restructure landed |
| **IMG2** | `public/images/stock/**`, `src/content/images.ts`, `docs/asset-manifest.md` | ~20 more licensed photos covering every page (see brief) |
| **Lead** | `src/components/ui/**` | `PageHero` image variant, `MediaSplit`, `PhotoStrip` |
| **CONTENT-HI** (pulled forward — no route dependency) | `src/lib/data.ts`, `src/content/hi/**`, `src/lib/data-locale.test.ts`, `docs/hindi-review-register.md` | Accessors take optional last `locale: ContentLocale` arg; Hindi text overlays keyed by id with field fallback; testimonial quotes untranslated |

### Phase B — after I18N-CORE lands, parallel
| Agent | Owns |
|---|---|
| **PAGES-A** | `[lang]/(site)/page.tsx` (with lead), programs, results, centres pages + their components + `src/components/forms/**` + messages namespaces `home`, `programs`, `results`, `centres`, `forms` |
| **PAGES-B** | about, hostels, admissions, contact, resources (+article), privacy, terms, error/not-found + components + namespaces `about`, `hostels`, `admissions`, `contact`, `resources`, `legal` |
| ~~CONTENT-HI~~ | moved to Phase A (see above) |
| **AUTH-2** | `[lang]/(site)/login/**`, new `[lang]/(site)/forgot-password`, `[lang]/(portal)/**`, `src/components/portal/**`, namespace `portal`, `auth` |

### Phase C — verify
QA (both locales, all logins, first fold, a11y, leakage) + content integrity (Hindi accuracy flags, no fabricated facts) → lead fixes, build, production smoke, docs.

## Shared rules
`CLAUDE.md` + `AGENTS.md` (Next 16!), D-005/D-019/D-020 content rules, no new npm packages unless the brief allows, no secrets in code or chat, verify with `tsc`/`eslint`/`vitest` (no `next build`/`dev`; a dev server runs on :3000).
