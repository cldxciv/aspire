# Milestone 5 — previous results instead of nature images

Owner request 2026-10-20: "the images are related to nature, we could have displayed previous results instead." Owner choices: replace **all nature images except the homepage hero**; the live site (aspire.thechunkmedia.com) **stays on the production build** (demo data hidden).

## D-031 Result cards (binding)
- Aspire's own result cards (student photo in an Aspire hoodie + college badge + name; 715, from the owner's demo site `rankers.json`) are imported as **placeholder personal data**: files in git-ignored `private/result-cards/` (never committed, never in the Docker image), served only by `GET /api/result-cards/[file]` under the same rule as `canShowStudentName()`; `next/image` with `unoptimized` (no `/_next/image` copies). Production builds show none until Aspire confirms written consent per student (checklist).
- A student's own result card may sit beside that student's own name (narrow exception to D-019's "never a person image beside a real name", which still applies to stock/AI people).
- **Never place result cards beside a specific centre, campus or hostel** — the data doesn't say where a student studied. Results go in general sections (home, results, programs by exam, about, admissions).
- Every slot that shows result cards has a **non-nature education photo as the production fallback** (`fallbackImage`), so production shows no landscapes either. Landscape photos (`himalayaBlueRidge`, `mountainTrail`, `shimlaPanorama`, `dhauladharTriund`, `kulluValley`, `hamirpurHills`, `hillRoadBarot`, `himalayaHero` outside the home hero, Aspire `hero-mountains` / `himachal-landscape` / `bg-mountain-*` assets) are used **only** by the homepage hero.
- Captions stay neutral: "Previous results", "JEE results from Aspire's previous batches" — no "toppers", "best", rank claims beyond the card data.

## Phase 1 — done (RESULTS-DATA)
`getResultCards({ exam?, year?, limit?, locale? })` (`[]` in production) · `ResultCardMosaic` (variants `2x3 3x3 4x2 4x3 6x2`, `fill`, `fallback` / `fallbackImage`, "See all results" tile) · `ResultCardMarquee` (reduced-motion safe, pausable) · `MediaSplit` `media` slot · messages `results.cards.*`.

## Phase 2 — page agents (parallel, disjoint files)
| Agent | Owns |
|---|---|
| **RES-A** | `[lang]/(site)/page.tsx`, `programs/**`, `results/**`, `centres/**`; `src/components/{home,programs,results,centres}/**` (except `HomeHero.tsx` stays as is) |
| **RES-B** | `[lang]/(site)/{about,admissions,contact,hostels,resources,privacy,terms}/**`; `src/components/{about,admissions,contact,hostels,resources,legal,faq}/**`; portal `src/components/portal/{StudentViews,ParentViews}.tsx` |
Shared rules: keep ~45–50 % imagery at 1440 (preview) and good imagery in production; no photo twice per page; labels on stock; en + hi; one h1; no overflow 320–1920; tests green; a repo test asserts landscape keys appear only in `HomeHero`.

## Owner decision — live mode (2026-10-20)
aspire.thechunkmedia.com runs the latest version in **demo mode (`SHOW_PLACEHOLDER_CONTENT=true`) with no password**, by explicit owner choice after being told that this makes the 715 result cards (real students' photos and names, consent not yet confirmed) publicly reachable. Mitigations kept: `X-Robots-Tag: noindex, nofollow` (nginx) and `robots.txt` `Disallow: /` in demo mode; DEMO labels on every placeholder record; the cards are not in git or the image (server-only volume). This overrides the D-020 condition "preview deployments showing placeholder content must be access-restricted" for this host only. Revert: `SHOW_PLACEHOLDER_CONTENT=false` + rebuild, or re-add `PREVIEW_ACCESS_PASSWORD`.
