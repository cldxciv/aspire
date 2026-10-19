# Aspire IIT & Medical — Project Instructions

## Project context
This is the existing `aspire-web/` application: Next.js 16.4 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS 4, zod 4, vitest. Scripts: `npm run dev | build | start | lint | typecheck | test`. The app already contains public pages, demo content, forms, portal previews, image assets, and automated tests (347 at the 2026-10-20 baseline commit).

Primary content reference: https://aspire2.thechunkmedia.com

## Read before writing code (all agents)
@AGENTS.md

- **Next.js 16.4 differs from model training data.** Read the relevant guide in `node_modules/next/dist/docs/` before touching routing, data, caching, params, metadata, route handlers or proxy. Verified facts for this repo:
  - `cacheComponents` + `partialPrefetching` are on. Anything reading `cookies()`, `headers()`, `searchParams`, `connection()` or request data must sit under `<Suspense>`; client `useSearchParams()` too. No `new Date()` / `Math.random()` while rendering server components.
  - Dynamic routes: `params` is a Promise (`PageProps<'/route/[slug]'>`); `generateStaticParams` must return ≥1 entry; `dynamicParams` is unavailable. Detail pages keep `ensureStatic = "navigation"` + `instant = false` so unknown slugs return a real 404 (D-017).
  - Middleware is `src/proxy.ts`. No `export const runtime`.
- **Project conventions** — read `docs/agent-decisions.md` (binding decisions) and the "Common rules" in `docs/agent-briefs.md`:
  - Content is read only through `src/lib/data.ts` accessors. Imported/unverified records are `status: "placeholder"`: visible only when `showPlaceholderContent()` is on, always with `<DemoBadge />`, hidden in production (D-005, D-020). Names via `canShowStudentName()` only.
  - Enquiry contract `src/lib/contracts/enquiry.ts` is shared by the form and `POST /api/enquiries` (D-008). Changing it is a lead/backend task with a recorded decision.
  - Aspire assets: `src/content/aspire-assets.ts` + `<AspireImage>`; never past `maxWidth`, person images never beside real names, centre images labelled "Illustrative image" (D-019).
  - Status and open questions: `docs/integration-status.md`, `docs/demo-data-import.md`, `docs/content-verification.md`.
- **Concurrency:** parallel agents must not run `next build` / `next dev` / `next start` at the same time (shared `.next/`). The lead runs builds; agents verify with `npx tsc --noEmit`, `npx eslint <paths>`, `npx vitest run <tests>`. A dev server may already be running on port 3000.

## Approved homepage direction
- Premium navy, white, and gold visual identity.
- Hero with aspirational but authentic student/campus imagery and mountain context.
- Integrated compact **three-step enquiry form** in the hero:
  1. Student name + class/target exam.
  2. Parent/guardian and contact details.
  3. Preferred centre, optional message, consent, and final submission.
- Aim for the navigation, hero, and first form step to fit in the first desktop viewport on a typical laptop. Do not force the form to be so narrow that it harms usability.
- Homepage should showcase the institution: verified stats, results, programs, history/story, faculty, centres, student life/facilities, authentic testimonials, resources, admissions CTA, and footer.
- Keep layouts varied and editorial; avoid a stack of identical card grids.
- Mobile: stack hero content and form accessibly, preserve readable text and touch targets.

## Source-of-truth and content rules
- Use the reference site and local source inventory as content sources; record URLs and provenance.
- “Mostly verified” does not mean every item is approved. Flag contradictions, stale content, student identity/consent questions, claims about outcomes, safety, scholarships, fees, and contact details.
- Never invent statistics, ranks, students, testimonials, awards, faculty credentials, campus locations, facilities, or admission terms.
- Keep unverified content unpublished or in a clearly internal review state.
- Do not treat publicly accessible photos as automatically licensed for reuse.
- Never expose demo data in production output, API responses, or browser payloads where it should not be available.

## Engineering rules
- Inspect repository state and docs before editing.
- Preserve current architecture, routes, design tokens, and unrelated functionality.
- Reuse existing components and patterns where practical.
- Agree on component props/data contracts before parallel agents edit shared interfaces.
- Avoid multiple agents editing the same file concurrently.
- Use small, reviewable changes.
- Never print secrets; never stage `.env` files or credentials.
- Do not run destructive Git commands or discard user changes.
- Do not deploy, push, activate portal authentication, or connect live enquiry delivery without explicit authorization.
- Never claim tests, visual checks, or audits passed unless actually run and observed.

## Required verification
Run the actual project scripts for typecheck, lint, tests, and production build. Visually inspect the homepage at desktop, tablet, and mobile sizes using available browser tooling. Check all hero form steps, validation, back/next behavior, keyboard access, consent, error states, and honest submission behavior.
