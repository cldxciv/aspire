# Agent Briefs — Milestone 2 (Demo data + Aspire assets)

Project root: `C:\Users\ADMIN\aspire-2\aspire-web`. The **Common rules** in `docs/agent-briefs.md` still apply (read them), plus the additions below. Three page agents run in parallel; file ownership is strict.

## What changed since M1 (read before coding)
1. **Institute data imported from the owner's demo site** (D-020) — see `docs/demo-data-import.md`, `src/lib/types.ts`, `src/lib/data.ts` and `src/content/*`. Every imported record is `status: "placeholder"` with a `sourceRef`: it renders only when `showPlaceholderContent()` is on (dev/preview) and **must carry `<DemoBadge />`**. Production hides it. Never render it any other way.
   - Accessors (use only these; never import `src/content/*` data directly in UI, except the asset registry): `getPrograms`, `getProgram`, `getCentres`, `getCentre`, `getResults`, `getFeaturedResults`, `getRankers`, `getResultYears`, `getFaculty`, `getTestimonials`, `getStats`, `getHostelInfo`, `getInstituteProfile`, `getContactDetails`, `getArticles`, `getFaqs` (check `data.ts` for exact names/signatures).
   - Student names: render only when `canShowStudentName(record)` is true.
   - Not rendered by decision: seat/vacancy counters, "guarantee"/"#1" claims, ISO/audit badges, "Admissions open" badges.
2. **Aspire visual assets** (D-019) — registry `src/content/aspire-assets.ts`, component `<AspireImage asset={aspireAssets.x} className="w-16" />` from `@/components/ui`. Rules:
   - Never render wider than the asset's `maxWidth` (files are tiny: 84–425 px). Full-bleed backgrounds keep the existing 2000 px stock hero photo.
   - Feature icons with `crop: "top-square"` are handled by `AspireImage` (hides a baked-in filename caption) — don't render them with `next/image` directly.
   - **Person images never beside a real name** (results, rankers, testimonials, faculty). Use them only decoratively (CTA bands, program cards, illustrations).
   - **Centre images are illustrative**: every use needs a visible "Illustrative image" label; Kullu has no centre image (use `himachalLandscape` or none).
   - Decor (`goldCurve`, `dotPattern`, `laurelWreath`, `quoteIcon`, `star`…) is `alt=""` + `aria-hidden` (AspireImage does this when alt is empty).
3. Existing Unsplash photos (`src/content/images.ts`, D-018) remain valid for large slots. Prefer Aspire assets where their size fits; keep stock photos where an Aspire asset would have to be stretched.

## Shared rules for this milestone
- Mockup look and existing UI primitives still apply (`@/components/ui`). Don't edit shared files (`src/components/ui/**`, `src/components/layout/**`, `src/lib/**`, `src/content/**`, `src/config/**`, configs). Need a shared change → request it in your report.
- No new npm packages. No external image URLs. No `dangerouslySetInnerHTML`.
- Verification allowed: `npx tsc --noEmit`, `npx eslint <your paths>`, `npx vitest run <tests>`, `npx next typegen`. **Do not** run next dev/build/start.
- Final message: the status report format from Common rules.

---

## P2-HOME — Home page
**Allowed:** `src/app/(site)/page.tsx`, `src/components/home/**`.
- **Hero:** keep stock background + gradient. Add `goldCurve` as a decorative underline beneath "Brighter Tomorrows." If `getInstituteProfile()` returns a profile, use its founding line/subheadline (e.g. "Founded by IIT Roorkee alumni…") as the lead with a DEMO badge; else keep current lead.
- **Stats strip:** `getStats()` (value + label, DEMO-labelled); fall back to the current qualitative strip when empty.
- **Programs:** new courses from `getPrograms()`; use the program illustration icons (`iconIitProgram`, `iconNeetProgram`, `iconFoundationProgram`, `iconIntegratedProgram`) by track; show batch size / daily hours if present.
- **Why Aspire / pedagogy:** new section from the institute profile's approach points, with the feature icons (`iconExpertFaculty`, `iconMentorship`, `iconPersonalized`, `iconStudentSupport`).
- **Results feature:** `getFeaturedResults()` (name via `canShowStudentName`), decor `laurelWreath`/`trophySuccess`, link to `/results`. No person images here.
- **Centres:** the 4 campuses with illustrative thumbnails (labelled), link to `/centres#<slug>`.
- **Testimonials:** `getTestimonials()` with `quoteIcon`; no person images; DEMO badges.
- **CTA band:** `heroStudents` image (≤ its maxWidth) beside the CTA.

## P2-DISCOVERY — Programs, Results, Centres, Faculty, Hostels
**Allowed:** `src/app/(site)/programs/**`, `src/app/(site)/results/**`, `src/app/(site)/centres/**`, **new** `src/app/(site)/faculty/page.tsx`, **new** `src/app/(site)/hostels/page.tsx`, `src/components/programs/**`, `src/components/results/**`, `src/components/centres/**`, **new** `src/components/faculty/**`, **new** `src/components/hostels/**`.
- **Programs list/detail:** new course fields (class level, duration, daily contact hours, doubt minutes/day, batch size, tracks). Program illustration icons. Detail keeps `ensureStatic`/`instant` exports and `notFound()` (D-017).
- **Results:** featured stories (cards, quote, school, destination, campus) + rankers list (searchable/filterable table by exam/year/name, paginated or "show more" — 700+ rows; keep DOM reasonable). Filters must work. Every record DEMO-labelled; names via `canShowStudentName`.
- **Centres:** campus cards with address, phone (`tel:`), email, hours, head, hostel/transport notes, highlights/facilities, travel times; illustrative centre image + label; anchors `id={slug}`.
- **Faculty (new `/faculty`):** cards with initials avatar (no photos), credentials, subject, experience, campus; DEMO badges; `metadata` + canonical.
- **Hostels (new `/hostels`):** facilities, who it's for, per-campus hostel notes from `getHostelInfo()`; `himachalLandscape` or `campusBuilding` imagery labelled illustrative.

## P2-CONTENT — About, Admissions, Contact, Resources
**Allowed:** `src/app/(site)/about/**`, `src/app/(site)/admissions/**`, `src/app/(site)/contact/**`, `src/app/(site)/resources/page.tsx`, `src/components/about/**`, `src/components/resources/**`, **new** `src/components/admissions/**`, **new** `src/components/contact/**`. (Don't edit `src/components/forms/**` — it derives centre options from `getCentres()` already via the page; just pass the new campuses.)
- **About:** institute profile (founding story, approach, values) with feature icons/illustrations (`illustrationGoal`, `illustrationGrowth`, `illustrationJourney`, `successJourney`), `campusBuilding` (labelled illustrative), link to `/faculty` and `/hostels`. Keep the stock photo grid only if it still fits.
- **Admissions:** steps with illustrations; centre options from the new campuses; scholarship info if present in the profile; downloads list (title/size/description) shown as "Available soon" (files not in project — no dead links).
- **Contact:** `getContactDetails()` — phone (`tel:`), email (`mailto:`), WhatsApp (`https://wa.me/<digits>` — no prefilled text), per-campus addresses/phones/hours; social links if present (plain links, no embeds); `himachalLandscape` strip. When contact details are hidden (production), keep the current "will be added after verification" notice.
- **Resources:** add the downloads list ("Available soon") above articles.
