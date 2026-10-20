# M4 Phase B briefs (start after I18N-CORE lands)

Read first: `CLAUDE.md`, `AGENTS.md`, `docs/m4-plan.md` (D-028/D-029/D-030), **`src/i18n/README.md`** (the i18n API written by I18N-CORE), `docs/agent-decisions.md` (D-005, D-017, D-019–D-027), `src/components/ui/{PageHero,MediaSplit}.tsx`, `src/content/images.ts` + `src/content/aspire-assets.ts`.

## Common rules for page agents
- **Every user-visible string** in your pages/components comes from your message namespace(s) in `src/i18n/messages/{en,hi}/<ns>.ts` (typed — `hi` must have every `en` key). English copy stays as today unless a rule below changes it. Hindi: natural, respectful (आप-form), parent/student-friendly; keep proper nouns (Aspire, IIT-JEE, NEET, Shimla…) recognisable; numbers as digits. Hindi is a machine draft — add nothing that isn't in the English.
- **Every internal link** via `localePath()` (Hindi pages must link to Hindi pages). `metadata`/`generateMetadata` per locale (title/description from messages; `alternates` from the i18n helper).
- **50/50 text-to-visual (D-030)**: `PageHero` with `image` (+ `imageLabel="…stock photo"` from messages) on every page; body sections alternate `MediaSplit` (imageSide left/right) and, where useful, `PhotoStrip`. Aim for roughly half of each page's desktop area to be imagery. Use `src/content/images.ts` (IMG2 is adding ~20 photos — re-read it before finishing) and Aspire assets within `maxWidth`. Never a person image beside a real name; label stock/AI imagery; no Palampur/Solan; no faculty info anywhere (D-030).
- Content (names, numbers, programs, centres…) only via `src/lib/data.ts` accessors, passing the locale as the **optional last argument** (`getPrograms(filter, locale)`, `getProgram(slug, locale)`, `getHostelInfo(locale)`…; type `ContentLocale = "en" | "hi"`). CONTENT-HI (started early) is adding this — re-read `data.ts`; if an accessor isn't localised yet, call it as-is and leave a `// TODO(i18n-content)`. Testimonial quotes stay untranslated (attributed words) — render them with `lang="en"` on Hindi pages.
- Keep: DEMO badges (localised label), production fallbacks, `ensureStatic`/`instant` on detail pages, a11y (one h1, headings order, labels, focus), no overflow 320–1920.
- Verify: `npx tsc --noEmit`, `npx eslint <your paths>`, `npx vitest run <your tests>`; curl `http://localhost:3000/<page>` and `/hi/<page>` (200, Hindi text present, images load). No `next build`.
- Final message: status report (files, namespaces, pages done, screenshots optional, open issues).

## CONTENT-HI notes (landed)
- `ContentLocale`, `WithQuoteLang<T>`, `localizeImage(image, locale)` (Hindi alt by `src` — use it for every `stockImages` photo on Hindi pages), `getDownloadCategoryLabel(category, locale)` are exported from `src/lib/data.ts`.
- Quotes (testimonials, featured results) come back with `quoteLang: "en"` in Hindi → put `lang={t.quoteLang}` on the quote element.
- Admissions picks scholarship milestones with `/scholarship/i` on `milestone.title` — that fails in Hindi; select by `tag === "BOH"` (or year) instead.
- `CentreDirectory` client search sees only the localised text — in Hindi also pass the English name/district so Latin queries still match.
- The "(verify availability)" suffix on centre options is UI copy → messages.

## PAGES-A — Home, Programs (+detail), Results, Centres, forms
Owns: `src/app/[lang]/(site)/page.tsx`, `…/programs/**`, `…/results/**`, `…/centres/**`; `src/components/{home,programs,results,centres,forms}/**`; namespaces `home`, `programs`, `results`, `centres`, `forms`.
- Home is already image-rich — localise it; keep the hero/form behaviour and first-fold budget (Hindi text is longer: re-check nav + H1 + step 1 fit at 1280×600/1366×657/1440×789).
- Forms (hero 3-step, admissions, contact): all labels, placeholders, hints, errors, statuses localised. Zod messages are English constants from the contract — map them to message keys on the client (by field + message), don't change the contract. Server responses: show the localised status copy by `status`/`error` code, not the server's English `message`.
- Programs/Results/Centres: add `MediaSplit`/`PhotoStrip` sections so each reaches ~50/50 (program detail: track photo + highlights split; centres: Himachal region landscapes labelled as the region, never "the centre").

## PAGES-B — About, Hostels, Admissions, Contact, Resources (+article), Privacy, Terms, error/not-found
Owns those routes under `src/app/[lang]/(site)/**`, `src/app/[lang]/**/not-found.tsx`/`error.tsx`, `src/components/{about,hostels,admissions,contact,resources,legal,faq}/**`, namespaces `about`, `hostels`, `admissions`, `contact`, `resources`, `legal`, `errors`.
- Admissions/Contact render `EnquiryForm` (owned by PAGES-A) — pass the locale/messages per the forms API PAGES-A exposes; coordinate via the lead if needed.
- Legal pages: translate the draft structure; keep "Draft — pending review" banners; images: calm, abstract stock.

## CONTENT-HI — locale-aware content
Owns `src/lib/data.ts` (add a `locale` param or read `lang()` — follow `src/i18n/README.md`), new `src/content/hi/**`.
- Hindi records keyed by the same ids, overriding only text fields (titles, descriptions, highlights, summaries, labels, captions, FAQ Q&A, article bodies, hostel features, stats labels/context, milestones, centre text). Never translate personal names; numbers/dates unchanged. Fallback to English per field when a Hindi value is missing.
- Same visibility rules (placeholder gating, consent) for both locales. Tests: both locales, fallback, production gating.

## AUTH-2 — login UI and portals (after AUTH-1 + I18N-CORE)
Owns `src/app/[lang]/(site)/login/**`, new `src/app/[lang]/(site)/forgot-password/**`, `src/app/[lang]/(portal)/**`, `src/components/portal/**`, namespaces `auth`, `portal`.
- Login page: role tabs (Student / Parent / Admin), login ID + password (show/hide), errors, rate-limit message, `next` redirect (sanitised), must-change-password flow, logout in portal header; forgot-password = "contact the office" (no fake reset). Image-rich 50/50 layout (D-030).
- Portals: real session (via `getSession()`), role-appropriate dashboards with the user's own account info and honest "not connected" states; parent sees linked learners only; admin: user management UI (list, create with one-time temp password display, disable/enable, reset, link parent↔student) + audit list. Preview mode behaviour per D-014 for signed-out users. All strings localised.
