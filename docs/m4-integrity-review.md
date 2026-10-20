# M4 content-integrity review (Phase C)

Reviewer: INTEGRITY agent, 2026-10-20 (review only; no source files edited).
Scope: Hindi fidelity (14 message namespaces + 11 content overlays), faculty removal, M4 image placements, production leakage, auth/portal copy.
Rules applied: CLAUDE.md, D-005, D-018, D-019, D-020, D-023a, D-028, D-029, D-030, `docs/content-verification.md`, `docs/asset-manifest.md`, `docs/hindi-review-register.md`.

## Method
- Compared every `src/i18n/messages/en/<ns>.ts` with `hi/<ns>.ts` key by key, and every `src/content/hi/*.ts` overlay with its English record (by id or index).
- Fetched 29 routes × 2 locales from the dev server (`localhost:3000`, preview mode, DEMO content visible) and searched the HTML and RSC payloads. Also queried `/api/centres`, `/api/results` and `/sitemap.xml`.
- Read the production prerender in `.next/server/app` (BUILD_ID 07:03; I ran no build).
- Used the pre-M4 backup (scratchpad `backup-pre-m4/`) to tell new M4 copy apart from older copy.
- **Files that changed during the review** (07:05–07:10): `hi/auth.ts`, `hi/legal.ts`, `content/hi/{hostels,centres,institute}.ts` and `docs/hindi-review-register.md`. I re-checked all of them. The main change was "पैरेंट पोर्टल" → "अभिभावक पोर्टल" (see M-3). The findings describe the files as of 07:12.

## Summary

| Severity | Count | Items |
|---|---|---|
| High | 1 | H-1 The privacy notice and terms don't cover the new login/portal data |
| Medium | 5 | M-1 Centres API still returns centre heads, including faculty names · M-2 Hindi adds safety claims to the girls' hostel text · M-3 DEMO "Parent Portal" claims contradict the real parent portal · M-4 New programs copy says "details Aspire has confirmed" · M-5 Auth/portal copy states Aspire processes as fact (renders in production) |
| Low | 15 | L-1 – L-15 |

No fabricated facts were found in the Hindi. All numbers, times, limits, DEMO / draft / to-be-confirmed / illustrative / "not an Aspire hostel" notices and the legal hedges carry over. The problems are a few added emphases, one terminology change, and English copy issues that the Hindi mirrors.

---

## High

### H-1 The privacy notice and terms don't cover the new login/portal data (EN and HI)
- **Where:**
  - `src/i18n/messages/en/legal.ts:28`: the notice's scope is "information you enter in the enquiry forms".
  - `:88-91`: the cookies paragraph says "If that changes, this notice will be updated first."
  - `:128-131`: the terms say portals will be covered "if and when they become available".
  - Hindi has the same gap at `src/i18n/messages/hi/legal.ts:26`, `:85-88` and `:121-124`. At 07:10 the portals title was updated to "विद्यार्थी और अभिभावक पोर्टल" but the body was not.
- **What the site now stores (D-029):**
  - `src/lib/db/connection.ts:47-95`:
    - `users`: display names of students (minors) and parents, login IDs and password hashes.
    - `parent_links`: which parent is linked to which student.
    - `sessions`: token hash, **user agent** and timestamps.
    - `audit_log`: actor, action, target, role and login ID.
    - `login_attempts`: SHA-256 hashes of the client IP, login ID and user ID.
  - The `aspire_session` HttpOnly cookie, kept 7 days after last activity (`src/lib/auth/sessions.ts:27`).
- **Why it matters:** The site now stores children's personal data, and neither language mentions it. The cookie paragraph promised to update the notice "first" if anything changed. The privacy notice is legal text and must be accurate before any real account is created.
- **Fix:**
  1. Add a "Portal accounts" section in EN and HI, with a matching row in the "What is collected" table. It should say:
     - who creates accounts and what is stored;
     - who can see the data (admins; parents see only linked learners);
     - that there is one strictly-necessary session cookie, kept for 7 days;
     - that sign-in throttling keeps hashed IP and login-ID values for the throttle window;
     - what the audit log records, and that it never records passwords;
     - retention and rights: {tbc}.
  2. Reword the cookie paragraph to mention the session cookie.
  3. Replace the terms "if and when they become available" line.
  4. Get legal review before portal accounts are created for real families.

## Medium

### M-1 `/api/centres` and `/api/centres/[slug]` still return centre heads, including a faculty name
- **Where:**
  - `src/app/api/centres/route.ts:15` and `src/app/api/centres/[slug]/route.ts:21` pass whole centre records through `withoutInternalFields` (`src/lib/server/public-content.ts:135`), which only removes `sourceRef`.
  - The data is in `src/content/centres.ts:25, 74, 118, 162`.
- **Observed:** `GET /api/centres` returned the following (it also did with `?lang=hi`, because the API isn't localised):
  - `"head":{"honorific":"Er.","name":"Raman Sharma","title":"Director","facultySlug":"er-raman-sharma"}`
  - Kapil Dev (IITK)
  - Dr. P. K. Thakur (MBBS)
  - Er. Mohit Sen
- **Why it matters:** The owner asked for faculty information to be removed. The `/centres` page already strips `head` (`centres/page.tsx:50-52`), but the public API does not. The data is placeholder, so production returns an empty list. Preview and dev still expose the names.
- **Fix:** Drop `head` in the centres API with a `toPublicCentre()` projection, or delete `head` from `centres.ts` (it is marked "not rendered"). Add a test asserting that no `head` or `facultySlug` appears in the API output.

### M-2 Hindi adds safety claims to the girls' hostel text (preview only)
- **`src/content/hi/hostels.ts:164`:**
  - English (`hostels.ts:170`): "Girls Residency Sanctum".
  - Hindi: "लड़कियों का **सुरक्षित** आवास" ("girls' **safe/secure** residence").
  - The English name is a brand-like name. The Hindi turns it into a safety claim.
- **`src/content/hi/hostels.ts:46`:**
  - English (`hostels.ts:47`): "…with open-door student counseling".
  - Hindi: "…दरवाज़ा परामर्श के लिए **हमेशा** खुला रहता है" ("**always** open").
- **Why it matters:** These are safety promises to parents of girls. The English is itself unverified demo text (D-020), and the Hindi is stronger than the English.
- **Fix:**
  - Line 164: "लड़कियों का आवास (Sanctum)" or "लड़कियों का अलग आवास".
  - Line 46: "…वार्डन उसी मंज़िल पर रहती हैं और विद्यार्थियों से परामर्श के लिए उनका दरवाज़ा खुला रहता है" (drop "हमेशा").

### M-3 DEMO "Parent Portal" claims contradict the real parent portal, and the Hindi now uses the portal's exact name
- **English DEMO content:**
  - `src/content/institute.ts:291`: "Attendance SMS … warden updates are published on the Parent Portal".
  - `institute.ts:321`: "… sync to the parent portal the same day".
  - `institute.ts:365`: "CBT portal with parent attendance and score tracking".
  - `src/content/centres.ts:141`: "warden check-ins logged on the Parent Portal".
  - `src/content/hostels.ts:220`: "Parent Portal check-ins".
- **Hindi:**
  - `src/content/hi/institute.ts:55, :85, :117`
  - `src/content/hi/centres.ts:127`
  - `src/content/hi/hostels.ts:205`
  - At 07:10 these changed from "पैरेंट पोर्टल" to "अभिभावक पोर्टल", which is exactly the label of the new portal (`portal.ts` `areas.parent.label`).
  - Two Hindi strings also drift further:
    - `hi/institute.ts:117` states a present ability, "अभिभावक … नज़र रख सकते हैं" ("parents **can** track"), where the English describes a 2023 launch.
    - `hi/hostels.ts:205` renders "check-ins" as "उपस्थिति-प्रविष्टि" ("attendance entries").
- **Rendered in preview:** `/about`, `/hostels` and `/centres` in both locales (confirmed in the fetched HTML).
- **Conflict:** The same site's parent portal says progress, updates and attendance are "Not connected" (`en/portal.ts:130, 150`; parent learner cards). The forgot-password page says "This website doesn't send emails or text messages" (`en/auth.ts:107`), but the demo content promises "attendance SMS".
- **Why it matters:** D-029 requires honest portal states. A parent sees a promise that attendance, scores and warden check-ins appear on "अभिभावक पोर्टल", then finds a portal that shows none of them. `docs/content-verification.md` already lists these "Parent Portal / attendance-SMS claims" as needing approval.
- **Fix:** Withhold these sentences from the placeholder records until Aspire confirms them, as was done for the BOH "100% free" claim. At minimum:
  - revert the Hindi to the distinct product name "पैरेंट पोर्टल";
  - keep the 2023 milestone in the past tense: "…CBT पोर्टल शुरू किया, जिसमें अभिभावकों के लिए उपस्थिति और अंकों की ट्रैकिंग थी";
  - change line 205 to "महिला वार्डन, पैरेंट पोर्टल पर चेक-इन".

### M-4 New programs-page copy claims details "Aspire has confirmed" (EN and HI)
- **Where:**
  - English, `src/i18n/messages/en/programs.ts:34` (new in M4): "Open a program to see the details Aspire has confirmed for it."
  - Hindi, `hi/programs.ts:33`: "…जिनकी Aspire ने उसके लिए पुष्टि की है".
- **Why it matters:** In preview this sits on `/programs` beside DEMO programs whose notice says details are "pending verification by Aspire", and every detail page opens with "Draft program information". In production it renders with no programs at all. In both cases it claims a confirmation that doesn't exist.
- **Fix:**
  - English: "Open a program to see its class level, schedule and highlights. Aspire's admissions team confirms the details."
  - Hindi: "किसी प्रोग्राम को खोलकर उसकी कक्षा, समय-सारणी और मुख्य बातें देखें। विवरण की पुष्टि Aspire की प्रवेश टीम करती है।"

### M-5 Auth/portal copy states Aspire's processes as fact, and it renders in production
These strings are new in M4 and appear on `/login`, `/forgot-password` and the portals in both languages, with matching Hindi. They are reasonable, but they are commitments made on Aspire's behalf that Aspire has not approved.

| String | English | Hindi |
|---|---|---|
| Parents see only linked learners "after checking who you are" | `en/auth.ts:63` | `hi/auth.ts:62` |
| "Ask your Aspire centre. Staff create the account…" | `en/auth.ts:66` | `hi/auth.ts:65` |
| "Aspire staff will never ask you for your password." | `en/auth.ts:72, 108` | `hi/auth.ts:71, 107` |
| "Aspire staff check who you are before they reset anything." | `en/auth.ts:101` | `hi/auth.ts:100` |
| "Your centre keeps attendance records for now." | `en/portal.ts:85` | `hi/portal.ts:83` |
| Learners are linked "after confirming who you are / your identity" | `en/portal.ts:133, 138` | `hi/portal.ts:131, 136` |

- **Why it matters:** CLAUDE.md says process statements must not be published as fact until approved. Unlike the DEMO content, these render in production.
- **Fix:** Add them to `docs/aspire-approval-checklist.md` and `docs/content-verification.md` as "needs approval". Until then, keep only statements the software enforces (accounts are created by staff, there is no email reset, a password change is forced), or soften the process lines to "should".

## Low

| # | Where | English → Hindi (brief) | Why / fix |
|---|---|---|---|
| L-1 | `hi/programs.ts:79` | "Draft program information" → "प्रोग्राम की **प्रारंभिक** जानकारी" ("preliminary") | "Draft" is softened. The body keeps "अस्थायी … सत्यापन बाकी". Use "प्रोग्राम की जानकारी का मसौदा", matching "मसौदा" in `legal`. |
| L-2 | `hi/legal.ts:67` | "Enquiries are **intended** to be seen only by…" → "पूछताछ केवल … के देखने के लिए है" | The "intended" hedge is weaker in a legal text. Use "…इस उद्देश्य से है कि इसे केवल … देखें". |
| L-3 | `hi/centres.ts:36` | "direct eye contact to faculty — no backbenchers" → "**हर विद्यार्थी** का शिक्षक से सीधा आँख-संपर्क" | Adds "every student" (DEMO). Use "शिक्षक से सीधा आँख-संपर्क — कोई बैकबेंचर नहीं". |
| L-4 | `hi/institute.ts:29-36` | Founder message: "the same rigour as Kota" → "कोटा जैसी ही **कड़ी मेहनत**" ("hard work") | The founder message is no longer rendered (`about/page.tsx:106`), so register item 1 is now moot. Drop it from the overlay, or leave it untranslated like quotes. If kept, use "कोटा जैसा ही कड़ा अनुशासन/स्तर". |
| L-5 | `hi/programs.ts:27` | "a **resident** doubt desk" → "**आवासीय** शंका-समाधान डेस्क" ("residential desk") | Ambiguous. Use "परिसर में रहने वाले शिक्षकों की शंका-समाधान डेस्क". |
| L-6 | `hi/results.ts:12` | "consent-**aware** records" → "सहमति-**आधारित**" ("consent-based") | Slightly stronger than the English. Use "सहमति का ध्यान रखते हुए". |
| L-7 | `hi/common.ts:105` | "Illustration" → "चित्रांकन" | Faithful, but for a photo-realistic AI image a parent may read it as a captioned photo. Propose to the owner, in both languages: "Illustration (AI-generated)" / "सांकेतिक चित्र (AI द्वारा बनाया गया)". |
| L-8 | `en/auth.ts:103`, `hi/auth.ts:102` | "a **one-time** temporary password" / "एक बार इस्तेमाल होने वाला" | The temporary password stays valid until it is changed (`must_change_password`, `src/lib/db/users.ts:116-121`). It is not single-use. Say "a temporary password" / "अस्थायी पासवर्ड". |
| L-9 | `about/page.tsx:94`, `contact/page.tsx:114` (Shimla panorama); `terms/page.tsx:41`, `portal/ParentViews.tsx:53` (Hamirpur hills); `centres/page.tsx:80`, `contact/page.tsx:75` (Barot road beside "Find Aspire near you") | Place-specific landscapes on pages that render in production | Each photo is labelled and none is captioned as a centre (D-030 OK). In production, though, they are the only geographic cues next to Aspire copy, and they hint at locations that aren't verified (Barot has no centre). Use neutral ridges or peaks on production-visible heroes until centres are verified. |
| L-10 | `forgot-password/page.tsx:44` (`mentoringConversation` beside "Aspire staff can reset it"); `about/page.tsx:138` (`teacherChalkboard` beside "Every senior educator is a permanent resident scholar", preview only); `programs/page.tsx:110` | Stock photos of people beside Aspire-staff copy | The label and neutral alt mitigate this, but readers may take the people for Aspire staff. Prefer object or landscape photos there. |
| L-11 | `hostels/page.tsx:56` | The hero photo (`studyThroughWindow`) has the stock label but no "not an Aspire hostel" caption | Every other hostels photo carries it, but `PageHero` has no caption prop. Add a caption option, or use a non-room photo in the hero. |
| L-12 | `components/home/ProgramPaths.tsx:64`, `programs/ProgramCard.tsx:59` | Unlabelled stock photos of students (renders in production) | Pre-existing (M3), not M4. Add `illustrativeStockPhoto` labels for consistency with D-030. |
| L-13 | Residual faculty claims without names in DEMO content: `institute.ts:336` ("AIIMS-trained doctors"), `hostels.ts:116` ("IITian and Ex-AIIMS faculty panels"), `institute.ts:296` ("Faculty on campus till 7:30 PM"); Hindi mirrors | — | Not names, so they don't conflict with "remove faculty info", but they are faculty-credential claims. Confirm with the owner whether these should also go. |
| L-14 | `docs/asset-manifest.md:66, 76, 172` | — | Says round-2 photos are "Not wired into any page yet" and lists pre-`[lang]` paths. Record the actual placements (e.g. `shimlaPanorama` → About hero and Contact; `hamirpurHills` → Terms hero and parent portal; `libraryAisle` → change-password). |
| L-15 | `en/portal.ts:357`, `hi/portal.ts:355` | "…is marked DEMO on the website until Aspire verifies it" | In production, placeholders are hidden, not marked. Say "shown only in preview builds (marked DEMO) until Aspire verifies it". |

**Awkward Hindi, for the native reviewer only (meaning is fine):**
- "दो-साझा / तीन-साझा" (already in the register)
- "सेवा वाले ज़िले"
- "जागरण" for "Awakening" in the routine ("उठना" is more natural)
- "बायो-सुरक्षित जियोफ़ेंस"
- "उपसहसंयोजन रसायन"
- "दिमाग़ी ऊर्जा वाले रविवार"
- "सहमति का ध्यान"
- "शिक्षक परिसर में इस समय तक"

**Pre-existing English issues the Hindi mirrors faithfully (not M4 regressions):**
- The hostels meta description and empty lead assert that "residential options" exist.
- `faq-centre` says "Only verified centres … are listed", while preview lists DEMO centres.
- The home "Experienced Faculty" trust row (already "needs approval").

---

## Verified OK
- **Hindi fidelity, messages:**
  - All 14 namespace pairs were checked key by key.
  - Figures match: 10–128 characters, 1000-character message, 10-digit mobile, step counts, "about {minutes} minutes".
  - Every honesty notice is intact: "nothing was sent or stored", "not connected", DEMO / "pending verification", "draft — pending review by Aspire and legal counsel", "To be confirmed" (`पुष्टि होनी है`), "indicative" steps, "not a guarantee of future outcomes", "These are list entries, not ranks", "Stock photo … not an Aspire hostel or campus", "region … not the centres".
  - The consent sentence and the privacy field table are faithful.
  - Hindi legal text adds no entity, jurisdiction or obligation.
- **Hindi fidelity, content overlays:**
  - Ids, numbers, phones, emails and links are unchanged. Lists are index-aligned (hostels, centres, institute, programs).
  - Times are converted correctly, e.g. 8:30 AM – 7:30 PM → सुबह 8:30 – शाम 7:30; 02:00 PM → दोपहर 02:00; Night Study Pods 8:00 – 11:30 PM → रात 8:00 – 11:30.
  - Testimonial and featured-result quotes stay English and are rendered with `lang="en"` (`TestimonialsSection.tsx:74-78`, `ResultStoryCard.tsx:73`).
  - The scholarship FAQ uses the form label "छात्रवृत्ति".
- **Faculty removal:**
  - No faculty or founder names, faculty slugs or faculty links appear in the rendered HTML or RSC payload of 29 routes × 2 locales. `/faculty` and `/hi/faculty` redirect (307) to `/about`, `/faculty/<slug>` returns 404, and the sitemap has no faculty URLs.
  - Home testimonials exclude every quote that names faculty (`TestimonialsSection.tsx:43`). The `/centres` page strips centre heads (`centres/page.tsx:52`). The About page doesn't render the founder or founder message (`about/page.tsx:106`).
  - These data files are never rendered: `src/content/faculty.ts` (`getFaculty` has no callers), `institute.founder` and `founderMessage` (EN and HI), the testimonial quotes that name faculty, and `centres[].head`. The one exception is the API (M-1).
- **Images:**
  - All 36 files in `public/images/stock/` are in the manifest with an individual licence check (`premium:false`, `plus:false`), and `hero-students-large.jpg` is documented (D-023a).
  - Every M4 placement passes a visible label: PageHero, MediaSplit, PhotoStrip, StockPhoto, CtaSplit, AuthSplit, the portal AccountPanel, ArticleCard and LegalDocument.
  - The fetched `/hi` pages carry only Hindi labels (0 English labels per page).
  - Region photos are captioned as the region and shown only for visible centres (`centres/page.tsx:67`, `hostels/page.tsx:87`).
  - No person photo sits beside a real name: results use initials avatars, and portal panels beside account names use landscapes or objects.
  - English and Hindi alt text never claims Aspire people or places.
  - Aspire assets stay within `maxWidth`: the hero students image renders at 440 px (cap 460), and `AspireImage` caps all others.
- **Production leakage:**
  - The Hindi overlay is applied after the visibility filters (`src/lib/data.ts:66-101`).
  - No client component imports `src/content/**`.
  - New sections are gated: region strips, hostel regions, scholarships and downloads.
  - The production prerender (`.next`, BUILD_ID 07:03) of every `en`/`hi` page contains no DEMO badges, demo names, demo phone numbers, campus names, "SSB-Alpha" or "715". The only "डेमो" is a label string in the `/hi/results` client props.
- **Auth copy vs implementation:**
  - These claims match the code: case-insensitive login IDs (`identifiers.ts:13`), 10–128 characters and not equal to the login ID (`password.ts:15-16, 133`), no email reset, rate limiting, signing out everywhere on disable or reset (`accounts.ts:285-295, 418, 462`), the `create-admin.mjs` script, and an audit log that never stores passwords.
  - Portals show only account info plus "Not connected". There is no live grades or attendance copy.
  - Seed accounts are clearly named "Demo … (dev)", and the demo enquiries table uses fictional "Sample applicant" rows.

---

## Resolution (lead, 2026-10-20)
| Finding | Status |
|---|---|
| H-1 Privacy/terms don't cover portal accounts | **Fixed (draft):** new "Portal accounts" section + session-cookie paragraph in the privacy notice (EN + HI), mirroring `src/lib/db/connection.ts`; under-18 consent, retention and correction/deletion marked "To be confirmed"; terms' portal section no longer says "if and when". Needs legal review — checklist LG-1 |
| M-1 `/api/centres` exposes centre heads | **Fixed:** `toPublicCentre()` drops `head` (+ `sourceRef`) in both centre APIs; regression tests in `src/app/api/content-routes.test.ts` |
| M-2 Hindi adds safety claims (hostels) | **Fixed** by QA-PUBLIC (`src/content/hi/hostels.ts`) |
| M-3 DEMO "Parent Portal" claims vs real portal | Tense fix applied (`hi/institute.ts`); the DEMO sentences themselves stay preview-only and are raised with Aspire (checklist PP-1) |
| M-4 "details Aspire has confirmed" | **Fixed** (EN + HI `programs`) |
| M-5 Auth/portal process claims | **Fixed** by QA-AUTH: neutral, instructional copy (EN + HI); remaining process questions in checklist AU-1–AU-3 |
| L-8 "one-time" temporary password | **Fixed** (QA-AUTH) |
| L-12 missing stock labels on program photos | **Fixed** (QA-PUBLIC) |
| Draft → "प्रारंभिक" | **Fixed:** "ड्राफ़्ट" |
| Faculty-credential claims in DEMO content | Raised with Aspire (checklist FA-2) |
