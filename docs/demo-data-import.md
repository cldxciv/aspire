# Demo-site data import (2026-10-19)

On the owner's instruction, institute data from Aspire's demo site **aspire2.thechunkmedia.com** was imported as typed content records. This document covers what went where, how fields map, the visibility rules, and what was deliberately left out. The verification status of every item, every conflicting value and every excluded claim is tracked in `docs/content-verification.md` → "Demo-site import (2026-10-19)".

## Ground rules

- **Every imported record is `status: "placeholder"`** and carries `sourceRef: "aspire2.thechunkmedia.com/<page> (fetched 2026-10-19)"` (built by `demoRef()` in `src/content/demo-source.ts`). Placeholders render only in development / preview builds (`showPlaceholderContent()`), with a `<DemoBadge>`, and are hidden in production (D-005).
- **Nothing is verified.** The demo contradicts itself in many places (27 conflicts logged). Where values disagree, the most specific page wins: the campuses and campus pages for addresses and campus details, the faculty profile pages for faculty, the results page for results, and the contact page for central contact details.
- **People-centred records** (results, rankers, testimonials) have `consentStatus: "pending"`. In production they show only when `published` with `granted` consent. In preview, placeholders show even with pending consent (owner instruction). Gate names with `canShowStudentName()`.
- **Wording is the demo's own.** Text is copied verbatim. The only edits are noted below ("Edits to source text").
- **No media.** Faculty and student photos, videos and download files are not in this project. Centres have no `image`; page agents attach the illustrative centre images from `src/content/aspire-assets.ts`.
- `siteConfig.contact` (`src/config/site.ts`) is **unchanged** (all `null`). Contact data lives in `src/content/contact.ts` and is read through `getContactDetails()`.

## What went where

| Collection | File | Accessors (`src/lib/data.ts`) | Records |
|---|---|---|---|
| Programs (courses) | `src/content/programs.ts` (replaced 4 mockup programs) | `getPrograms({ exam?, track? })`, `getProgram(slug)`, `getProgramSlugs()` | 4 |
| Centres (campuses) | `src/content/centres.ts` (replaced 6 sample districts) | `getCentres({ query?, exam? })`, `getCentre(slug)` | 4 |
| Results: selections wall | `src/content/results.ts` → `results` | `getResults({ year?, exam?, centreSlug? })`, `getResultYears()`, `getFeaturedResults()` | 18 (4 featured) |
| Results: verified rankers | `src/content/results.ts` → `rankers` | `getRankers({ exam?, year? })` | 715 |
| Faculty | `src/content/faculty.ts` (new) | `getFaculty({ centreSlug? })`, `getFacultyMember(slug)`, `getFacultySlugs()` | 8 |
| Testimonials | `src/content/testimonials.ts` (new) | `getTestimonials({ centreSlug?, relation?, facultySlug? })` | 13 (4 originally videos) |
| Headline stats | `src/content/stats.ts` (new) | `getStats(group?)` | 16 |
| Hostels | `src/content/hostels.ts` (new) | `getHostelInfo()` | 1 record: 6 charter items, 4 features, 5 girls'-residency features, 3 room types, 7 routine slots, 4 campuses / 8 blocks |
| Institute profile | `src/content/institute.ts` (new) | `getInstituteProfile()`, `getDownloads()` | 1 record: 5 approach points, 5 principles, 6 milestones, 6 social links, 20 downloads |
| Contact | `src/content/contact.ts` (new) | `getContactDetails()` | 1 record + 4 campus desks (derived from `centres`) |
| Consent helper | — | `canShowStudentName(record)` | — |

All accessors apply the same `visible()` rule. Single-record accessors (`getHostelInfo`, `getInstituteProfile`, `getContactDetails`) return `null` when not publishable, so the UI hides those sections in production. `getHostelInfo()` and `getContactDetails()` also drop campus entries whose centre is not visible.

### Behaviour changes in `data.ts`

- `getResults()` previously dropped records with `consentStatus === "pending"`. It now returns `published` + `granted` records, plus placeholders while `showPlaceholderContent()` is on. As a result, `/api/results` returns the 18 placeholder records in dev / preview (names are still stripped by `toPublicResult()` because consent is not `granted`). This supersedes the "results file intentionally empty" part of **D-009** for preview builds; the Orchestrator should record that.
- A `published` result whose consent is `not_required` is now hidden (the rule is "granted only"). No such records exist.
- `getPrograms()` gained an optional `track` filter (matches `tracks`); `exam` still matches the primary track only.
- `getCentres({ query })` also matches `servesDistricts`, so a search for "Mandi" (a removed sample district) finds the Kullu centre.

## Field mapping

### Programs (`Program`)

Source: the home page's "Which Batch Is Right For My Child?" tabs and each `/courses/<slug>` page. Slugs are the demo's own.

| Field | Source |
|---|---|
| `slug`, `title`, `shortDescription` | course page (`/courses/jee-neet-pinnacle-2027`, `class-12-intensive`, `dropper-special`, `junior-foundation`) |
| `classLevel` | course page tag ("Class XI", "Class XII", "Class Dropper", "Class VIII-X") |
| `cohortName` | home tab "Cohort: …" |
| `description`, `highlights` | home tab paragraph + its two feature chips |
| `dailyContactHours`, `doubtMinutesPerDay`, `batchSize` | home tab "Daily contact" / "Doubt resolution" / "Batch ceiling" (batch size also on course page) |
| `duration`, `deliveryMode` | course page "Duration" / "Mode" |
| `exam` (primary), `tracks` | course page "Target: JEE / NEET / Foundation". Pinnacle 2027 → `Integrated` (school-board + entrance integrated); Class 12 Intensive → `JEE`; Dropper Special → `NEET`; Junior Foundation → `Foundation`. The two dual courses' primary track is an editorial choice so each existing filter keeps one program |
| `targetAudience` | drafted from the class level stated on the page |
| `image` | existing `stockImages`: studentsTakingNotes, physicsWhiteboard, libraryReading, youngStudentWriting |
| `feeDisplay` | not set (fees not imported) |

"Repeater Residential (11 Months)" is the cohort name of Dropper Special on the home page, not a separate course, so it is kept as that record's `cohortName`. The demo's second catalogue on `/courses` (six batches with fees and start dates) is logged as conflict C12 and not imported.

### Centres (`Centre`)

| Field | Source |
|---|---|
| `slug` | demo slugs: `shimla`, `hamirpur`, `dharamshala`, `kullu` |
| `name`, `label`, `address` | `/campuses` (address truncated there; full text on `/about`, `/contact`, campus pages) |
| `district` | Shimla, Hamirpur, Kangra (Dharamshala is in Kangra district), Kullu |
| `summary`, `phone`, `email`, `openingHours`, `facilities`, `travelTimes` | each `/campuses/<slug>` page |
| `head` | campus tile ("Director: Er. Raman Sharma", "Head: Er. Kapil Dev (IITK)", "Dean: Dr. P. K. Thakur (MBBS)", "Mentor: Er. Mohit Sen") |
| `hostelNote` | campus tile chip |
| `transportNote` | the campus page's transport facility description |
| `highlights` | facility names |
| `servesDistricts` | `/contact` FAQ "Which campus should I contact?" |
| `programs` | `[]` (not stated per campus) |
| `latitude`, `longitude`, `directionsUrl`, `image` | not set |

### Results (`ResultRecord`, `RankerRecord`)

- **Selections wall:** the 18 cards on `/results`. `rankOrOutcome` is the card's badge ("AIR 312", "675 / 720", "State Rank #2", "NEET Score 682"); cards without a badge use the card's own "Allotted: …" text. `destination` is the allotted seat, `examLabel` is "JEE Advanced" where stated, and `centreSlug` comes from the card's campus. `programSlug` is not set (unknown; the field is now optional). `sourceReference` is `https://aspire2.thechunkmedia.com/results`.
- **Featured:** Aryan Sharma, Hitesh Thakur, Mitali Thakur and Sanidhya Dogra from the home page. `school` and `quote` are taken from there; rank and destination come from `/results`.
- **Rankers:** fetched from the endpoint the results page uses (`/rankers.json?exam=all&offset=…&limit=48`, 15 pages, 715 items). Each row has a name, an `institution` exactly as listed (e.g. "MBBS · Tanda"; omitted when blank, 2 rows), an `exam` and `year` parsed from the label ("NEET 2025"), and a `note` from the item's detail where present (9 rows: "AIR 3238", "From SSB Batch", …). The demo's ranker images were not imported.
- Roll numbers are **not** imported (personal identifiers; consent unknown).

### Faculty (`FacultyMember`)

Six profile pages (`/faculty/<slug>`) supply `role`, `subject`, `credentials`, `experience`, home campus, `bio` (the "About" paragraphs), `expertise` and `teaches`. Er. Neeraj Thakur and Dr. Priya Chauhan have no profile page; their data comes from the "Faculty based at this campus" lists on `/campuses/hamirpur` and `/campuses/dharamshala`, and their slugs were constructed in the same pattern. Campus heads who are not faculty (Kapil Dev, P. K. Thakur, Mohit Sen) exist only as `Centre.head`. Not imported: photos, ratings, achievement counters, doubt-desk rosters and LinkedIn buttons.

### Testimonials (`Testimonial`)

Distinct quotes from the home page, `/faculty`, the faculty profiles, `/about`, `/why-aspire`, the campus pages and `/residential-campuses`; duplicates across pages are merged and every page is listed in `sourceRef`. For the two home-page videos, `quote` is the video's quoted title and `caption` is the demo's description. `isVideo` / `videoDuration` record that the original was a video (4 records). `context` keeps the demo's attribution line.

### Stats (`Stat`)

Values are copied exactly as strings and grouped as `headline`, `results`, `pedagogy`, `faculty` or `residential`. Not imported: "100% Audited Registry" and "100% Daily Attendance SMS" (the SMS point appears as an approach point instead), ratings, and "68% of parents".

### Hostels (`HostelInfo`)

The charter chips come from `/campuses`; the features, girls' residency, room types (no prices), room features, daily routine and menu highlights come from `/residential-campuses`; the per-campus blocks (distance, rooms, supervision, capacity) come from each campus page, and the warden phones from `/residential-campuses`.

### Institute profile (`InstituteProfile`)

The founding story, mission, founder message, the five pedagogy principles and the milestones come from `/about`. The tagline comes from the home page and `/why-aspire`. The five approach points use the brief's list, described in the demo's own words (home page, course FAQ, `/about`). Social links come from the site footer. Downloads are the 20 cards on `/resources`, all with `available: false`; `gated` marks cards that asked for a WhatsApp number.

### Contact (`ContactDetails`)

The central helpdesk phone, admissions email, WhatsApp (plain `https://wa.me/919816623676`, with no prefilled message), hours, response times and languages come from `/contact`. The address is the head campus's campuses-page address. Campus desks are derived from `centres` (phone, email, hours) so the two never diverge. **The email domain `aspireiitmedical.com` differs from the site domain `aspireiit.in`**; the campus emails (`shimla@aspireiit.in` …) use the site domain, and two more admissions addresses appear on the demo (`aspireiit.org.in`, `aspireiitmed.edu.in`) — conflict C6.

## Edits to source text

- **Hostels:** "100% Bio-Secure Geofence" is imported as "Bio-Secure Geofence". Hospital tie-up details are dropped from "Medical SOS", "24/7 Medical Emergency Desk" and "On-Campus Doctor-on-Call & Infirmary"; the last keeps "Dedicated first-aid infirmary and regular health checkups."
- **2023 milestone:** the title "Quality-management certification & student portal" becomes "Student portal", and the ISO sentence is removed.
- **Download descriptions** truncated by the demo ("…") keep their last complete sentence, or else the visible text cut at a word boundary, followed by "…".
- **The home-page hero sentence** "…and 100% transparent pedagogical results" is not imported. Only "Founded by IIT Roorkee alumni" is used, as the tagline.

## Excluded (not rendered: needs Aspire confirmation)

The full list is in `docs/content-verification.md`. In summary:

- seat / vacancy counters and the live demo-class schedule;
- "guarantee" / "100%" / audit claims and superlatives ("Himachal's #1");
- ISO 9001:2015 and every other certification, affiliation, alignment or partner badge;
- the "Admissions Open" and "Answer Key Live" badges, cookie-banner text, WhatsApp-planner marketing and Hindi toggle text;
- fees, EMI, refund terms, batch start dates, student roll numbers, faculty ratings and counters, map links, legal entity names, and the "Toll-Free" label.

## Data anomalies (beyond conflicts)

- **7 exact duplicate pairs** in the rankers list (corrected 2026-10-20; previously only 358/359 were noted): Pratyush Thakur (IIT Bombay, JEE 2025), Aryan (MBBS · Chamba, NEET 2025), Mayank Thakur (AIIMS Jammu, NEET 2025, rows 358/359), Aditi (IGMC, NEET 2023), Muskan (Tanda, NEET 2022), Rohan (Nahan, NEET 2022), Gaurav (Nahan, NEET 2021). All rows are kept so the count matches the demo's 715 (708 unique); `getRankerYearCounts()` counts duplicates once (C31).
- Ranker 736 (Ravishta) is listed as NEET 2016 at NIT Hamirpur, an engineering institute.
- Two rankers have no institution (68 Shaurya Sharma, 79 Suryansh Thakur, both JEE 2025).
- The ranker names and result-card file names look like real students' results. Because consent is pending, they must not appear on any publicly reachable preview without Aspire's confirmation.

## Pages read (fetched 2026-10-19)

`/`, `/about`, `/courses`, `/courses/{jee-neet-pinnacle-2027, class-12-intensive, dropper-special, junior-foundation, ssb-alpha-engineering, ssb-alpha-medical, jee-advanced-2026, neet-medical-2026, dropper-intensive, pre-foundation}`, `/results`, `/rankers.json`, `/faculty`, `/faculty/{er-raman-sharma, dr-shalini-sharma, prof-arun-kaundal, er-raman-verma, er-vivek-chauhan, dr-arvind-swaminathan}`, `/campuses`, `/campuses/{shimla, hamirpur, dharamshala, kullu}`, `/residential-campuses`, `/contact`, `/admissions`, `/why-aspire`, `/resources`. The downloaded copies are kept in the session scratchpad only, not in the repository.

## Promoting a record to production

1. Aspire confirms the value (and, for people, provides written consent) → update the register row to `verified`.
2. Change the record's `status` to `published`; for results, rankers and testimonials also set `consentStatus: "granted"` (plus `verifiedBy` / `verifiedAt` for results).
3. Keep or replace `sourceRef` with Aspire's own reference.
