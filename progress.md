# SEO go-live pack: progress (branch `feature/seo-golive`, updated 30 Oct 2026)

For the next agent working on this branch. Project-wide context, rules, servers and owner decisions are in `progress.md` on `main` (read it first: `git show main:progress.md`, or `C:\Users\ADMIN\aspire-2\aspire-web\progress.md`). This file covers only the SEO / SMO / AEO / GEO go-live pack.

## 1. Where it is

- **Worktree:** `C:\Users\ADMIN\aspire-2\aspire-web-seo`, branch `feature/seo-golive`, based on **5a2d7cb** (Release 1). `main` has moved on to d1b9997 (Release 2, admin Phase 1b), so this branch must be merged with `main` at integration (§5).
- **Code is not committed yet.** About 65 changed / new files live only in this worktree; only this `progress.md` is on GitHub. Commit the code to this branch (owner's go-ahead) before risky steps.
- `node_modules` is a junction to the main checkout's: never run `npm install` here. Dev server for this worktree: port **3001**.
- **Plan:** `docs/seo-golive-plan.md`. **Reports** (builder / verifier / fixer per package): `C:\Users\ADMIN\aspire-2\handoff\reports\seo-prior\`. **Continuation workflow** (SEO-INTEGRATE only; finished packages skipped): `C:\Users\ADMIN\.claude\projects\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53\workflows\scripts\seo-golive-pack-finish-wf_394caf39-57a.js` (`resumeFromRunId` won't work in a new session; run it as a new script).

## 2. What the pack does and how it stays off

Ships as **Release 4**, switched off. Demo mode keeps robots `Disallow: /` and `noindex` everywhere. One super-admin switch, "Open the site to search engines with the go-live pack", refuses to turn on until the site is out of demo mode on the production domain (aspireiit.in). Emergency kill: env `SEO_PACK_DISABLED=true` (the proxy step, layout tags and robots all do nothing). Any non-production host stays `noindex` + robots `Disallow` even after launch (host guard).

## 3. Packages (all built, verified and fixed; tests run with `--maxWorkers=1`)

| Package | What it built | Tests after fix |
|---|---|---|
| **SEO-CORE** | schema `src/lib/db/features/seo.ts`; `src/lib/seo/*` (types, prereq, mode, settings, runtime, pages, breadcrumbs, routes, `withSeo` metadata, hindi, access, audit, warnings, card glyphs, go-live, robots rules, tags, reserved paths); crawler registry; redirect safe-path / normalize / match; JSON-LD script component | 490 |
| **SEO-FACTS** | verified business facts sheet (`src/lib/seo/facts/**`, `/admin/search/facts`), verify / unverify per field, consistency checks incl. footer and Contact page; JSON-LD builders (Organization, LocalBusiness per centre, BreadcrumbList, Course, Event) using verified facts only | 83 |
| **SEO-SHARE** | share images `/og/<kind>/<key>.<lang>.<v>.png` (no remote fetches; admins only until live), social profiles, WhatsApp share texts (en / hi / Hinglish) with tagged links, public share links (`/admin/search/social`) | 59 |
| **SEO-ROUTING** | proxy step in `src/proxy.ts` with its own sqlite handle via `process.getBuiltinModule` (`src/lib/seo/proxy/**`): host guard, 301 redirect map with "Test a URL", 108 suggested forwards from the old aspireiit.in sitemaps (accepted group by group) | 295 |
| **SEO-META** | page titles / descriptions / share previews console (`/admin/search/pages`) with missing / too-long / duplicate / restricted-claim warnings, Google + WhatsApp previews; 20 public pages wired through `withSeo` (no output change while hidden) | 153 |
| **SEO-CENTRES** | centre pages `/centres/[slug]` (NAP from verified facts, Open in Google Maps, courses, next scholarship test, results only with consent + disclosure, enquiry form preset to the centre), centres console, Google Business Profile checklist | 85 |
| **SEO-CRAWLERS** | crawler policy console (answer vs training crawlers; owner decision 22 allows both on public pages; private paths always blocked), robots preview, Search Console / Bing verification codes, crawler visit counts without IPs, `/llms.txt` (only when live) | 48 |

No package ran `tsc` or `next build` (PC memory limits); that is SEO-INTEGRATE's job.

## 4. SEO-INTEGRATE checklist (not started)

Run on this branch first, then again after merging `main`:
1. `npx next typegen`, then **one** `npx tsc --noEmit` (wait until no other tsc / vitest / next build is running), plus `src/lib/qb/core-db.test.ts`.
2. Full vitest (`--maxWorkers=1`), eslint, production `next build`.
3. **META finding 1 (real, not fixed):** coming-soon tool pages get no og:image when live. Patch at `src/lib/seo/metadata.ts` ~line 108 and the test described in `fix_SEO-META.md`.
4. **SHARE:** align CORE's `isRefVisible` with SHARE's hidden keys so page metadata agrees (`fix_SEO-SHARE.md`).
5. Add audit labels `seo.fact_*` and `seo.event_place_*`; reword the "stubs … do nothing" test name in `src/lib/seo/core.test.ts`.
6. Add `/llms.txt` to the prerender bail-out test.
7. **Routing smoke** with Host `aspireiit.in`: `/neet-coaching-in-mandi/` → 308 (trailing slash) then 301 to `/centres/kullu`; accept a relative `Location`. If the proxy can't do it in production, use Plan B (catch-all page) from the plan.
8. Browser by hand (no jsdom in the repo): focus after verify / unverify in the facts console, focus and live regions after refresh in the share console, CLS on a demo centre page (~0 expected).
9. Smoke `scripts/seo-smoke.mjs` against the dev server on port 3001.

## 5. Merging into `main` (after Release 2's own check)

Expect conflicts in `src/lib/db/features/index.ts`, `src/proxy.ts`, `src/components/portal/areas.ts`, `src/i18n/messages/{index,types}.ts`, portal messages (en / hi), audit labels, `src/app/sitemap.ts`, `src/app/robots.ts`, `.github/workflows/ci.yml`.
- Phase 1b overlap: keep exactly **one** `search` group and one `searchOverview` key in `areas.ts` and in en / hi `portal.ts`.
- Merge `src/app/[lang]/(portal)/admin/search/page.tsx` as its MERGE NOTE comment says; use `SearchOverviewFallback` as the Suspense fallback, or keep 1b's header outside Suspense.
- Then rerun the whole §4 gate on `main` and deploy switched off with `handoff\deploy-release.sh`.

## 6. At launch (later, on aspireiit.in)

- The production nginx server block must send `proxy_set_header Host $host;` **and** `proxy_set_header X-Forwarded-Host $host;` (the host guard relies on it). Ask the owner before touching nginx.
- Owner inputs: verified centre facts (address with PIN, phone, hours, map link), Google Business Profile access, social profile links, Search Console / Bing codes, any old URLs printed on brochures or QR codes, final go-live date.
- Then: out of demo mode → turn on the go-live switch → submit sitemaps → watch crawler counts and redirect hits.

## 7. Log

- 21–22 Oct: plan written and approved; worktree created; build started; stopped by a network outage, then the weekly usage limit.
- 28 Oct: build continued on Fable; all 7 packages built, verified and fixed.
- 30 Oct: this file pushed to `feature/seo-golive`. Next: SEO-INTEGRATE (§4), after Release 2's local check on `main`.
