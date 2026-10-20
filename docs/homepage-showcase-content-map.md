# Homepage showcase: content map

For developers. This document maps each homepage section to its component, the data accessors it reads, the fields it renders, today's content status, how it behaves in production, and the approval items in `docs/aspire-approval-checklist.md` (IDs such as `HE-1`). It reflects the integrity review of 2026-10-20 (Wave 2), checked against `src/app/(site)/page.tsx` and the running servers (`:3000` preview, `:3100` production).

**Rules applied throughout** (D-005, D-019, D-020, plan §1):
- Facts come only from `src/lib/data.ts` accessors.
- Every imported record is `status: "placeholder"`. It renders only when `showPlaceholderContent()` is on, and always with `<DemoBadge>`.
- Names are shown only via `canShowStudentName()`.
- Client components receive server-projected view models only.
- No record is `published` today, so every data-driven section shows its fallback in production, or renders nothing.

## 1. Section map

Order is the render order in `page.tsx`. "Tone" alternates white/surface over the sections that actually render.

| Homepage section | Component(s) | Data accessor(s) | Fields shown | Status today | Production behaviour | Checklist IDs |
|---|---|---|---|---|---|---|
| **Header** (all pages) | `layout/SiteHeader.tsx`, `MainNav.tsx`, `Logo.tsx` | `showPlaceholderContent()` (banner only); `mainNav`/`portalNav` from `config/site.ts` | Nav labels, dropdown descriptions, "Enquire Now", login icon; preview banner | Static config; logo is a recreated placeholder | Same, without the preview banner. No phone in the header. | HE-8, IM-1 |
| **Hero** | `home/HomeHero.tsx` (server), `MountainRidge.tsx` | none (copy is hard-coded) | Eyebrow, H1, lead, 2 CTAs, 4 trust points, AI postcard labelled "Illustration" (`xl` + `tall` only, 300 px, `alt=""`, `aria-hidden`) | Hard-coded copy, **needs approval** | **Renders as-is** | HE-1 to HE-5, IM-2, IM-3 |
| **Hero enquiry form** | `forms/HeroEnquiryForm.tsx` (client), `StepProgress.tsx`, `hero-steps.ts`, `fields.tsx` | `getCentres()` → `centreOptions` (built in `page.tsx:65-68`); `getEnquiryDeliveryStatus()` (`lib/server/env`) | Steps 1–3 per D-021a; centre select only when `centreOptions.length > 0`; "(verify availability)" suffix on placeholder centres; `not_configured` notices | Centres: 4 placeholder. Delivery: `not_configured` | `centreOptions: []`, so there is **no centre field** (verified on `:3100`). Honest "not connected" copy. Consent is required. | FP-1 to FP-11, CE-7 |
| **Stats band** | `home/StatsBand.tsx` (server) | `getStats()`: ids `stat-campuses`, `stat-years`, `stat-doctors-iitians`, `stat-verified-rankers` | `value`, `label`, `context` exactly as stored; per-item DEMO | 4 placeholder | **Hidden** (returns `null`) | ST-1 to ST-5 |
| **Results** | `home/ResultsShowcase.tsx` (server) → `ResultRail.tsx` (client) | `getFeaturedResults()`, falling back to `getResults().slice(0, 4)`; `canShowStudentName()` | Exam label, `rankOrOutcome`, year, name (or "Name withheld"), destination, DEMO. InitialsAvatar plus a generic `GraduationCap`. No photos or crests. | 4 featured placeholder, consent `pending` | Heading + "Verified results will be published here once Aspire has confirmed them." + "View all results". No cards. | RE-1 to RE-8 |
| **Programs** | `home/ProgramPaths.tsx`, `ProgramPathRow.tsx` (server) | `getPrograms()` | `title`, `classLevel`, link to `/programs/[slug]`, per-row DEMO; decorative stock `studentsTakingNotes` | 4 placeholder | `EmptyState` "Program details are being finalised…" + "Talk to a counsellor" → `/admissions#enquiry` | PR-1 to PR-7 |
| **Why Aspire** | `home/WhyAspire.tsx` (server) | `getInstituteProfile()`: `mission.title`, `summary`, `approach[0..3]` (title + first sentence) | Mission line, summary, 4 approach points, one section DEMO badge (after the summary); decorative "Rooted in Himachal" over stock `himalayaBlueRidge` | 1 placeholder record | Generic lead + `FALLBACK_POINTS` (a copy of About's `APPROACH`). **Renders.** | SA-1 to SA-13 |
| **Faculty** | `home/FacultySpotlight.tsx` (server) | `getFaculty()` (senior leads first, max 4); `getCentres()` for campus names | Display name, subject, `experience`, campus name, DEMO, InitialsAvatar. No bio, credentials, photo or counters. | 8 placeholder (4 shown) | **Omitted** (`faculty.length === 0`) | FA-0 to FA-8 |
| **Centres** | `home/CentresShowcase.tsx` (server) → `CentrePicker.tsx` (client); `HimachalMap.tsx` (server SVG) | `getCentres()`; `CENTRE_IMAGES`; `CENTRE_PIN_POSITIONS` | Count heading, name, `label`, `address`, `phone`, pin (hand-placed, "Map not to scale"), illustrative image (≤ 240 px, "Illustrative image" label), section and card DEMO plus a review notice | 4 placeholder | **Omitted** (returns `null`) | CE-0 to CE-8, ST-1 |
| **Student life** | `home/CampusLifeTiles.tsx` (server) | `getHostelInfo()` (`charter`, `features` names); `centre.facilities` names | 4 tiles: title + activity (hard-coded); a preview-only caption from data, filtered by `CLAIM_PATTERN`, with DEMO; stock photos + labelled AI `campusBuilding`; "Illustrative stock photos…" note | Hostel 1 placeholder; facilities placeholder | **Renders** with generic captions ("Campus life / A place to focus") and the button → `/about` | SL-0 to SL-8, IM-5 |
| **Testimonials** | `home/TestimonialsSection.tsx` (server) | `getTestimonials()` → `pickHomeTestimonials()` (written only, `canShowStudentName`, non-rank-claim first, parent/student alternation, 3) | Headline, quote, author, relation, `context`, DEMO, decorative `quoteIcon`. No avatars. | 13 placeholder, consent `pending`; picks: Pathania, R & S Thakur, Sh. Ramesh Thakur | **Omitted** (`show` is false in `page.tsx`) | TE-0 to TE-11 |
| **Impact chart** | `home/ImpactChart.tsx` (server SVG + table) | `getRankerYearCounts({ from: 2020, to: 2024 })` (counts only, duplicates once); `getStats()` → `stat-verified-rankers` | Grouped JEE/NEET counts per year, value labels, "Show data as a table", stat card (value / label / context as stored), DEMO + "list entries, not ranks" | Counts from 715 placeholder rankers | **Omitted** (`yearCounts.length === 0`) | IC-1 to IC-3, ST-4, RE-4 |
| **Resources** | `home/ResourcesTeaser.tsx` → `resources/ArticleCard.tsx` (server) | `getArticles()` (max 4) | Title, excerpt, category, date, DEMO (from `ArticleCard`) | 2 placeholder (web-team drafts) | **Omitted** (`articles.length === 0`) | RS-0 to RS-4 |
| **Closing CTA** | `home/CtaBand.tsx` (`variant="photo"`) | `getContactDetails()` → `phone`, `hours`; `isPlaceholder(contact)` | Title/description (hard-coded in `page.tsx:121-122`), "Enquire Now" → `#home-enquiry`; "Call Us" + number + hours + DEMO only when `phone` is set; decorative slogan "Dream · Prepare · Achieve" | Contact 1 placeholder | Title, description, Enquire button and slogan only (no phone or hours) | CT-1 to CT-3, CT-10 |
| **Footer** (all pages) | `layout/SiteFooter.tsx` | `getContactDetails()` (phone, WhatsApp, email); `getInstituteProfile()?.socialLinks` | Blurb (hard-coded), contact list + DEMO, site links, socials + DEMO, "© {siteConfig.name}" (no year), legal and portal links | Placeholder | Blurb, links, "© Aspire IIT & Medical". No contact or socials. | CT-3, CT-4, CT-7 to CT-9 |
| **Page metadata** | `app/(site)/page.tsx:34-38`, `app/layout.tsx` | `siteConfig.name`, `region`, `description`, `url` | `<title>`, description, canonical / OG URL `https://aspireiit.in`; preview adds `noindex, nofollow` | Config, **needs approval** | **Renders** (indexable) | HE-6, HE-9 |

## 2. Client-component props (what reaches the browser)

Checked in the preview RSC payload (`curl -H "RSC: 1" http://localhost:3000/`):

| Client component | Props | Built by | Excluded |
|---|---|---|---|
| `HeroEnquiryForm` | `centreOptions` (`value` = slug, `label`), `deliveryStatus`, `id`, `className` | `page.tsx:65-68` | Every other centre field |
| `ResultRail` | `cards[]`: `exam`, `outcome`, `year`, `name` (null unless `canShowStudentName`), `destination`, `placeholder` | `toResultCardViews()` (`ResultsShowcase.tsx:14-23`) | Record `id` (embeds the name), `sourceRef`, `sourceReference`, `consentStatus`, `school`, `quote`, `featured`, `centreSlug` |
| `CentrePicker` | `centres[]`: `slug`, `name`, `shortName`, `label`, `address`, `phone{display,href}`, `pin`, `media` (server-rendered node), `demo`; `initialSlug`; `map` (server node) | `toCentrePickerItems()` (`CentresShowcase.tsx:38-54`) | `sourceRef`, `head`, `facilities`, `servesDistricts`, `travelTimes`, `hostelNote`, `email`, `openingHours` |

Every other section is a server component. Testimonials, faculty, stats, programs, profile and hostel records are never serialised whole. Only the picked or rendered items appear, as HTML.

## 3. Hard-coded copy inventory (renders without a data gate)

None of these strings is a number, name, rank, phone, hour, campus or credential taken from the mockup. They are still marketing or factual copy, and they ship to production unless Aspire rejects them.

| Copy | File | Checklist |
|---|---|---|
| Eyebrow "IIT-JEE · NEET · Foundation · Himachal Pradesh"; H1 "Dreams / Take Discipline. / Let's Build Yours."; lead; trust points "Experienced Faculty", "Regular Tests & Analysis", "Personal Mentoring", "Supportive Learning Environment"; CTAs; postcard label | `components/home/HomeHero.tsx:15-20, 115-136, 57-59` | HE-1 to HE-5, IM-3 |
| Form title/intro, step titles and descriptions, privacy line "We'll only use these details to respond to your enquiry.", not-connected notices | `components/forms/HeroEnquiryForm.tsx:292-297, 403-405, 445-460`; `hero-steps.ts:22-24` | FP-4, FP-5, FP-8 |
| 12 class/exam options (incl. "Foundation – Class 6–8", which the program data does not support: Junior Foundation is Class VIII–X) | `lib/contracts/enquiry.ts:50-98` | FP-2 |
| Consent label (names Aspire, links `/privacy`, not pre-ticked) | `components/forms/fields.tsx:343-346` | FP-3 |
| "Results" / "Results, year by year" + both intro lines | `components/home/ResultsShowcase.tsx:44-54` | RE-1 |
| "Our programs" / "A clear path for every aspirant" / intro / empty state "A counsellor can help…" / "Talk to a counsellor" | `components/home/ProgramPaths.tsx:20-31, 45-47` | PR-1 |
| "Why Aspire" / "More than coaching" / "Rooted in Himachal" / fallback lead + `FALLBACK_POINTS` | `components/home/WhyAspire.tsx:24-29, 75-100` | SA-1, SA-2 |
| "Our faculty" / "Meet our faculty" / intro | `components/home/FacultySpotlight.tsx:100-111` | FA-0 |
| "Our centres" / "{count} centres across Himachal Pradesh" / intro / review notice / "Map not to scale" / pin positions | `components/home/CentresShowcase.tsx:79-99`; `CentrePicker.tsx:118-120`; `HimachalMap.tsx:11-16` | CE-0, CE-6 |
| "Student life" / "A home for learning and growth" / intro ("…a settled daily routine") / tile titles and activities **Classrooms, Campus/Hostel life, Library, Labs** / stock note | `components/home/CampusLifeTiles.tsx:50-79, 126-139, 162-164` | SL-0, SL-1 |
| "Testimonials" / "Voices from families" / intro / review notice | `components/home/TestimonialsSection.tsx:104-115` | TE-0 |
| "Results list" / chart title / "These are list entries, not ranks." / "The chart covers … only." | `components/home/ImpactChart.tsx:142, 172-182` | IC-1 |
| "Resources" / "Guidance for your journey" / intro | `components/home/ResourcesTeaser.tsx:21-29` | RS-0 |
| CTA "Ready to begin your journey?" + description; "Call Us"; slogan "Dream · Prepare · Achieve" | `app/(site)/page.tsx:121-122`; `components/home/CtaBand.tsx:147, 163-172` | CT-1, CT-2 |
| Footer blurb "Helping students move forward with clarity, effort and guidance."; "© Aspire IIT & Medical" | `components/layout/SiteFooter.tsx:58-59, 134` | CT-8, CT-9 |
| Site name, description, region, canonical URL; nav descriptions | `config/site.ts:6-20, 30-55` | HE-6, HE-8, HE-9 |

## 4. Verification evidence (2026-10-20)

**`/` on `:3100` (production, `placeholderContent:false`), HTML and RSC.** 0 matches for:
- imported names: Raman, Shalini, Kaundal, Pathania, Aryan, Hitesh, Mitali, Sanidhya, Kunal, Aarohi;
- contact details: `98166`, `aspireiitmedical`;
- places and results: centre names, `IGMC`, `AIR`;
- figures and labels: `715`, `13+`, `5,000+`, `Verified rankers`, `Parent Portal`, `Dropper Apex`, `Mon–Sat`;
- DEMO badges;
- internal fields: `sourceRef`, `consentStatus`, `"school"`, `"quote"`, `"bio"`;
- mockup filler: `98765`, Palampur, Solan, Trusted Choice, Real Success, Ex-IIT, Rohan Mehta, Sneha Verma, Kartik Thakur, "safe with us", "No spam", BOH.

The RSC prop is `"centreOptions":[]`, and the HTML has no `name="preferredCentre"`. The only domain string is the canonical/OG `https://aspireiit.in` (config).

**`/` on `:3000` (preview).**
- **DEMO badges:** 48 DEMO/Demo occurrences in the HTML.
- **Robots:** `noindex, nofollow`.
- **Internal fields:** 0 `sourceRef`, `consentStatus`, `sourceReference`, `studentDisplayName`, `"school"`, `"quote"`, `"bio"`, `"context"`, `featured` or `ranker-` keys.
- **Unpicked records** (0 in HTML and RSC):
  - testimonial authors and students: Rajiv Mehta, Mahender, Pranjali, Col., Sunita Sharma, Mr. & Mrs.;
  - results-wall names: Nikhil, Parnav, Aryan Mehta, Aryan Dogra, Sanskriti, Alabhya, Parth Pandit, Pradyun, Priya Chandel, Karthik, Ananya;
  - faculty not shown: Swaminathan, Vivek Chauhan, Neeraj;
  - campus heads: Kapil Dev, Mohit Sen, P. K. Thakur;
  - bio phrases: Kota, Ex-AIIMS, CSIR;
  - hostel safety claims: Biometric, CCTV, SOS, Geofence.
- **Withheld names:** `canShowStudentName()` returns true for every placeholder in preview, so no name is withheld there. In production the people-centred sections are omitted, and the results rail would print "Name withheld".

**Imagery.**
- No person image appears beside a name.
- The hero postcard is the only AI person image. It carries the `hidden xl:tall:block` classes, is 300 px wide (the file is 360 px, the cap 450 px), and is labelled "Illustration".
- 5 "Illustrative image" labels in the preview RSC: 4 centre media plus the `campusBuilding` tile. The production HTML has 1 (the tile).
- No Palampur or Solan anywhere in the output. `centrePalampur` / `centreSolan` stay unused in `content/aspire-assets.ts:98-99`.
- No crests: results use `GraduationCap`.

**Guard and tests.** `npx vitest run src/test/mockup-strings.test.ts src/components/home`: 4 files, 50 tests passed. `/api/centres` and `/api/programs` on `:3000` now return 0 `sourceRef`.

## 5. Known gaps for developers

1. **Guard coverage.** `src/test/mockup-strings.test.ts` scans `src/components` and `src/app` only, not `src/config` or `src/lib`. These mockup strings are not in its list: "AIR 62", "AIR 101", "AIR 118", "Kartik Thakur", "Pareet", "Learn from the Best", "Proven Track Record", "Safe & Supportive", "Consistent Growth", "safe with us", "No spam", "Mentored 1000s", "6:00 PM" (as "9:00 AM – 6:00 PM"), "© 2025", "Watch Our Story". Some are asserted absent from rendered sections in `home-sections-1.test.ts`, but not repo-wide.
2. **Testimonial picker.** `RANK_OR_SCORE` (`TestimonialsSection.tsx:12`) misses outcome claims such as "cleared JEE Advanced", "crack NEET for IGMC" and "Admit". In preview it therefore picks the C21-conflicted Kunal quote ("Sh. Ramesh Thakur") next to "Ramesh & Sunita Thakur". Consider also deprioritising quotes whose context names a child, or excluding records listed in a conflict.
3. **Contract vs privacy table.** `heroContactStepSchema` still accepts `email` for `source: "hero"` (`enquiry.ts:166-171`), but the privacy table lists email only for Admissions and Contact. The UI never sends it, but a direct API client could. Either strip `email` from the hero variant or add "Home page enquiry" to that row (lead/backend decision, D-008).
4. **Production step-3 copy.** "Choose a centre and tell us how we can help." shows even when the centre field is hidden (`hero-steps.ts:24`).
5. **DEMO granularity.** The Why Aspire approach points rely on one section badge placed after the summary, in a different column at `lg`. Hero-form centre options say "(verify availability)" rather than DEMO. Both are acceptable under the global preview banner, but per-item labels would be clearer.
6. **Data quirks now visible in preview.**
   - "Dropper Apex" names no existing program (`institute.ts:278`).
   - "Parent Portal" is mentioned while the portals are inactive (D-011; `institute.ts:291`).
   - "(Top Choice)" and the duplicated "(State Rank #2)" appear in result destinations (`results.ts:88, 101`).
   - The stat card says "715 Verified rankers" beside a chart that counts duplicates once.

All of these are on the checklist; none is a code defect.
