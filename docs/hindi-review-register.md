# Hindi content review register (D-028)

**Status of every file below: Machine draft — needs native Hindi review before launch.**
Drafted 2026-10-20 by the CONTENT-HI agent. Reviewer: a native Hindi speaker familiar with Himachal Pradesh parents and coaching terminology. The English records are themselves placeholders (D-005, D-020), so the Hindi versions are hidden in production exactly like the English ones.

## How it works
- English content stays in `src/content/*.ts`. Hindi overlays in `src/content/hi/` hold **text only**, keyed by the English record's id (hostel campuses and contact desks are keyed by centre slug, image alt text by image `src`).
- `src/lib/data.ts` accessors take an optional last `locale` argument (`"en"` default). For `"hi"` the overlay is applied **after** the visibility filters, with field-level fallback to English. Ids, slugs, status, consent, numbers, dates, links, phone numbers, emails and images can't change. The types block this at compile time, `mergeOverlay` ignores those keys at runtime, and `src/lib/data-locale.test.ts` checks it.
- The tests also check that a Hindi string keeps the same digits as its English source, uses no Devanagari numerals, and adds no Latin-script word that isn't already in the English text.
- When an English record changes, its Hindi text does not update by itself. The orphan, coverage and array-length tests catch added, removed or renamed records and list items. They do **not** catch reworded English text, so re-translate whenever the English wording changes.

## Files

| File | Covers | Status |
|---|---|---|
| `src/content/hi/programs.ts` | 4 programs: title, class level, cohort name, descriptions, audience, highlights, mode, duration | Machine draft — needs native Hindi review before launch |
| `src/content/hi/centres.ts` | 4 centres: name, district, label, summary, address, hours, hostel/transport notes, travel times, highlights, facilities, districts served (head of centre not overlaid) | Machine draft — needs native Hindi review before launch |
| `src/content/hi/faqs.ts` | 4 FAQs: question + answer | Machine draft — needs native Hindi review before launch |
| `src/content/hi/articles.ts` | 2 placeholder articles: title, summary, body (placeholder notice kept) | Machine draft — needs native Hindi review before launch |
| `src/content/hi/stats.ts` | 16 stats: label + context (`value` never translated) | Machine draft — needs native Hindi review before launch |
| `src/content/hi/testimonials.ts` | 12 of 13 testimonials: caption, generic context words, home town. **Quotes and headlines are not translated** | Machine draft — needs native Hindi review before launch |
| `src/content/hi/results.ts` | 7 results ("Allotted:", "State Rank", "Score", "Top Choice") + 5 ranker notes ("From … Batch", "Cat. Rank") | Machine draft — needs native Hindi review before launch |
| `src/content/hi/hostels.ts` | Hostel charter, features, girls' residency, room types, room features, daily routine, menu, 4 campus blocks | Machine draft — needs native Hindi review before launch |
| `src/content/hi/institute.ts` | Institute profile (tagline, summary, founding story, mission, founder message, approach, pedagogy, milestones), 20 downloads, download category labels | Machine draft — needs native Hindi review before launch |
| `src/content/hi/contact.ts` | Helpdesk label, hours, languages; head-office address and campus desk names/hours come from the centre overlays | Machine draft — needs native Hindi review before launch |
| `src/content/hi/images.ts` | Hindi alt text for the 12 stock photos (keyed by `src`) | Machine draft — needs native Hindi review before launch |
| `src/content/hi/results.ts` → `resultCardAltHi` / `resultPhotoAltHi` | Alt text of the 715 result cards (D-031), one pattern: "&lt;Name&gt; — &lt;Institute&gt;, &lt;Exam&gt; &lt;Year&gt; का परिणाम कार्ड". Names, colleges and exam names stay in Latin script | Machine draft — needs native Hindi review before launch |
| `src/content/hi/overlay.ts`, `index.ts` | Types and merge helpers (code, no copy) | — |

## Deliberately left in English
- **Names of people.** This covers students, parents, the founder and heads of centres, including honorifics (Er., Dr., Col.) and degrees (B.Tech, MBBS, IITK).
- **Quotes from real people.** This covers testimonial quotes and headlines and the student quotes on featured results. They are returned unchanged with `quoteLang: "en"`, and the UI should set `lang="en"` on them.
- **Brand and product names:** Aspire, Aspire IIT & Medical, Pinnacle, SSB-Alpha/Beta, Dropper Apex, Brain of Himachal / BOH, AITS / All Himachal Test Series, Reaction Roadmap, Pod Alpha-1, Volvo, HRTC, HDFC.
- **Exams:** JEE, JEE Main, JEE Advanced, NEET, NTSE, Olympiad, NTA, CBSE, NCERT.
- **Institutions:** IIT Roorkee, AIIMS Bilaspur, IGMC Shimla, NIT Hamirpur, HPTU, LMS and similar.
- **Figures and contact details:** ranks, scores, years, stat values (including their units, e.g. "90 min", "8.4 Yrs", "7:30 PM"), file sizes, phone numbers, emails, URLs and PIN codes.
- **Fields used as keys:** download `category` stays English because the admissions page filters on it. Use `getDownloadCategoryLabel(category, "hi")` for display.

## Needs a decision or a check
1. **Founder message.** It is attributed to Er. Raman Sharma and has been translated. He must approve the Hindi wording, or it should stay English like the testimonials.
2. **The "Select ‘छात्रवृत्ति’" FAQ answer** must use exactly the Hindi label of the enquiry form's Scholarship option, which is owned by the `forms` namespace.
3. **"अणु रोड" (Anu Road, Hamirpur)** — confirm the local Devanagari spelling. Also confirm the spellings of the other localities: ढालपुर, कचहरी रोड, BCS चौक, सिविल लाइन्स.
4. **"bi-weekly" → "पाक्षिक" (every two weeks).** The English is ambiguous; this reading follows "every second Saturday". Confirm with Aspire.
5. **Centre names are translated descriptively** (e.g. "शिमला BCS मुख्य परिसर", "हमीरपुर केंद्रीय हब"). If Aspire treats the campus names as brands, transliterate them instead.
6. **Gendered wording.** "छात्राओं" and "शिक्षिकाएँ" are used where the English is explicitly about girls or women faculty. Elsewhere the text uses the neutral "विद्यार्थी".

## Glossary

| English | Hindi used | Note |
|---|---|---|
| Program / programme | प्रोग्राम | "कार्यक्रम" reads like an event; "कोर्स" also common |
| Campus | परिसर | "कैंपस" is common in ads; standard Hindi chosen |
| Centre / Center | केंद्र | |
| Hub | हब | Loanword kept (part of the campus names) |
| Hostel | हॉस्टल | More familiar to parents than "छात्रावास" — reviewer may prefer the latter |
| Faculty / teachers | शिक्षक (शिक्षिकाएँ for women faculty) | |
| Mentor | मेंटर | Coaching-role term; "मार्गदर्शक" is the formal alternative |
| Resident (faculty) | आवासीय | "परिसर में रहने वाले" in running text |
| Doubt clinic / desk | शंका-समाधान क्लिनिक / डेस्क | Colloquial "डाउट" avoided |
| Batch / micro-batch | बैच / माइक्रो-बैच | |
| Cohort | समूह | |
| Dropper / repeater | ड्रॉपर / रिपीटर | Standard coaching terms |
| Mock test | मॉक टेस्ट | |
| CBT | CBT (कंप्यूटर-आधारित टेस्ट spelled out where the English does) | |
| PYQ / DPP | PYQ / DPP | Kept as students use them |
| Revision | रिवीज़न | "पुनरावृत्ति/दोहराव" formal; "दोहराना" used in running text |
| Lab | प्रयोगशाला | |
| Organic / Inorganic chemistry | कार्बनिक / अकार्बनिक रसायन | NCERT Hindi terms |
| Coordination chemistry | उपसहसंयोजन रसायन | NCERT Hindi term — check readability for parents |
| Reaction mechanism | अभिक्रिया क्रियाविधि | NCERT Hindi term; English kept in brackets once |
| Scholarship | छात्रवृत्ति | Must match the form option label |
| Enquiry | पूछताछ | |
| Admissions team | प्रवेश टीम | |
| Parent Portal | पैरेंट पोर्टल | Product feature name, transliterated |
| Day-boarding / day-scholar | डे-बोर्डिंग / डे-स्कॉलर | |
| Twin / triple sharing | दो-साझा / तीन-साझा | Unusual coinage; reviewer may prefer "दो बिस्तर वाले कमरे" |
| Allotted / allotment | आवंटित / आवंटन | Counselling-seat term |
| State Rank / Cat. Rank | राज्य रैंक / श्रेणी रैंक | |
| Verified rankers | सत्यापित रैंकर | Mirrors the English demo claim (placeholder) |
| Placeholder text | अस्थायी (प्लेसहोल्डर) पाठ | Demo/placeholder meaning kept |
| Times (8:00 AM / 8:00 PM) | सुबह 8:00 / रात 8:00 (शाम for 4–7:30 PM, दोपहर for 1–2 PM) | Digits unchanged |
| Mon–Sat / Sun | सोम–शनि / रवि | |

## PAGES-B

UI copy for About, Hostels, Admissions, Contact, Resources (+ articles), Privacy, Terms and the error page. Drafted 2026-10-20 by PAGES-B. **Status: Machine draft — needs native Hindi review before launch.**

| File | Covers |
|---|---|
| `src/i18n/messages/hi/about.ts` | About page headings, pending-profile fallback, values, photo captions, explore links, CTA |
| `src/i18n/messages/hi/hostels.ts` | Hostels page headings, empty/demo notices, stock-photo and region captions, campus-card labels, CTA |
| `src/i18n/messages/hi/admissions.ts` | Admissions page, "what happens next" steps, scholarships panel, downloads, FAQs headings |
| `src/i18n/messages/hi/contact.ts` | Contact page, contact-detail labels, campus desks, help/centre prompts |
| `src/i18n/messages/hi/resources.ts` | Resources page, category cards, download-card labels, article page, Hindi month names |
| `src/i18n/messages/hi/legal.ts` | Privacy notice and terms of use. **Both are English drafts pending legal review; the Hindi needs legal review too** |
| `src/i18n/messages/hi/common.ts` → `errorPage` | Error page copy |
| `src/i18n/messages/hi/common.ts` → `carousel` | Image-carousel controls: फ़ोटो गैलरी, पिछली/अगली फ़ोटो, स्लाइड शो रोकें/चलाएँ, "स्लाइड {n} पर जाएँ", "{total} में से {n}"; screen-reader role names `roleCarousel` "कैरोसेल" and `roleSlide` "स्लाइड" (aria-roledescription, read aloud) (added 2026-10-20) |

Needs a decision or a check:
1. **Legal wording.** "मसौदा" (draft), "पुष्टि होनी है" (to be confirmed), "क़ानूनी सलाहकार" (legal counsel), "दायित्व" (liability), "लागू क़ानून" (governing law), "बौद्धिक संपदा" (intellectual property), "लागू होने की तिथि" (effective date), "सेवा प्रदाता" (service providers). These need a legal reviewer, and the Hindi text must not be published as binding until the English is approved.
2. **Terms sections.** Each English fragment ("This section will cover …") was rewritten as a full Hindi sentence ("इस भाग में बताया जाएगा कि …"). Check that the meaning is unchanged.
3. **"Girls' residency" → "छात्राओं का आवास".** "बालिका आवास" is an alternative.
4. **"Outstation students" → "बाहर से आने वाले विद्यार्थी".** Confirm this reads naturally to parents.
5. **"Supervision" → "देखरेख"** is used throughout the hostels page. "निगरानी" sounds more like surveillance, so it was avoided.
6. **"Integrated" → "इंटीग्रेटेड"**, transliterated as in `common` (the CONTENT-HI glossary uses "एकीकृत" in content). Pick one term site-wide.
7. **"Step {number}" → "चरण {number}"** and **"Published {date}" → "प्रकाशित: {date}"**, where dates use Hindi month names with Western digits ("18 अक्टूबर 2026").
8. **"Response times" → "जवाब मिलने का समय".** The value list is not overlaid in content (`contactDetails.responseTimes` is undefined today).
9. **Stock-photo captions.** "केवल उदाहरण के लिए स्टॉक फ़ोटो — यह Aspire का हॉस्टल या परिसर नहीं है।" and "{district} क्षेत्र" must stay explicit that the photos are not Aspire's premises.

## PAGES-A

**Files (machine draft — needs native Hindi review before launch):** `src/i18n/messages/hi/{home,programs,results,centres,forms}.ts`. Drafted 2026-10-20 by PAGES-A. They cover the home page sections, the hero 3-step enquiry form, the admissions/contact enquiry form (labels, options, field errors, status notices), /programs and program pages, /results and /centres.

Decisions and checks:
1. **Home H1** "Dreams / Take Discipline. / Let's Build Yours." → "सपनों के लिए / अनुशासन चाहिए। / आइए, आपका सपना गढ़ें।" Kept short so nav + H1 + hero step 1 still fit 1280×600, 1366×657 and 1440×789 (checked with screenshots). Line 3 wraps after "सपना" at those widths, as the English does after "Build". A reviewer may prefer a shorter line 3.
2. **Field errors are mapped, not translated at the source.** The contract's English zod messages stay unchanged. The client maps them per field to `forms.shared.errors` (`src/components/forms/field-errors.ts`). If the contract wording changes, the English catalog must change with it. `forms-i18n.test.ts` fails when the English mapping and the contract drift apart.
3. **"Integrated" → "एकीकृत"** in `programs.tracks`, the form's program option and the meta descriptions, to match CONTENT-HI and the PAGES-B note. `common.meta.description`, `about` and `admissions` still say "इंटीग्रेटेड". Pick one term site-wide.
4. **Scholarship topic label = "छात्रवृत्ति"**, exactly as the Hindi FAQ answer refers to it. A test pins it.
5. **Region captions** ("शिमला क्षेत्र", "कुल्लू घाटी", "धर्मशाला और धौलाधार पर्वत श्रृंखला", "हमीरपुर क्षेत्र") name the region, never "केंद्र" or "परिसर". The section lead says that these are stock photos of the region, not of the centres.
6. **Hero step label** "Step 1 of 3" → "चरण 1 / 3". This is compact, but the reviewer may prefer "चरण 1 (कुल 3)".
7. **Rankers / results counters:** Hindi needs no plural form, so "{count} रैंकर" is used for both the singular and plural keys.
8. **Verification dates** use short Hindi month names ("जन॰ … दिस॰", `results.card.months`) with Western digits.

### Glossary (PAGES-A UI strings)

| English | Hindi used | Note |
|---|---|---|
| Enquire Now / enquiry | पूछताछ करें / पूछताछ | Same as `common` |
| Step (form) | चरण | |
| Parent / Guardian | माता-पिता / अभिभावक | "अभिभावक" alone in short labels |
| Class / Target Exam | कक्षा / लक्ष्य परीक्षा | |
| Not sure yet | अभी तय नहीं | |
| Dropper | ड्रॉपर | Coaching term, as in CONTENT-HI |
| Consent sentence | "मैं सहमत हूँ कि Aspire … और मैंने {link} पढ़ ली है।" | Legal wording, so the reviewer must check it |
| Privacy notice | गोपनीयता सूचना | Must match the legal page title (PAGES-B) |
| Reference number | संदर्भ नंबर | |
| Not connected (online enquiries) | जुड़ी नहीं है | Honest-status wording; keep its meaning that nothing is sent |
| Counsellor / counselling | काउंसलर / काउंसलिंग | Loanword; "परामर्शदाता" is more formal |
| Pathway / track | राह / ट्रैक | |
| Highlights | मुख्य बातें | |
| Schedule & fees | समय-सारणी और फ़ीस | |
| Doubt resolution | शंका-समाधान | Same as CONTENT-HI |
| Delivery mode | पढ़ाई का तरीका | |
| Batch size | बैच का आकार | |
| Name withheld | नाम नहीं दिखाया गया | |
| Rankers list | रैंकर सूची | |
| Source / Verified | स्रोत / सत्यापित | |
| Results archive | परिणाम संग्रह | |
| Head campus | मुख्य परिसर | |
| Districts served | सेवा वाले ज़िले | Awkward; the reviewer may prefer "जिन ज़िलों के लिए" |
| Map not to scale | नक्शा पैमाने पर नहीं | |
| Illustrative image / stock photo | सांकेतिक चित्र / सांकेतिक स्टॉक फ़ोटो | From `common` |
| Testimonials (eyebrow) | अनुभव | The quotes themselves stay English, with `lang="en"` |
| Dream · Prepare · Achieve | सपना देखें · तैयारी करें · हासिल करें | Decorative slogan |

## AUTH-2 — sign-in, account and portal UI (2026-10-20)

**Status: Machine draft — needs native Hindi review before launch.** Drafted by the AUTH-2 agent.

| File | Covers | Status |
|---|---|---|
| `src/i18n/messages/hi/auth.ts` | Login page (tabs, fields, errors, help, safety tips), signed-in panel, sign-out, forgot-password page, change-password page | Machine draft — needs native Hindi review before launch |
| `src/i18n/messages/hi/portal.ts` | Portal shell (header, preview banner, navigation), student / parent / admin dashboards and section pages, admin user management, audit log, demo enquiries table, error copy | Machine draft — needs native Hindi review before launch |

### Choices to confirm
1. **Role names:** विद्यार्थी (student — gender-neutral, matches the content register and `common.nav.studentLogin`), अभिभावक (parent / guardian — matches `common.nav.parentLogin`), एडमिन (admin; "प्रशासक" is the formal alternative). Portal names: विद्यार्थी पोर्टल, अभिभावक पोर्टल, स्टाफ़ एडमिन. Note: the content glossary above uses the transliterated product name "पैरेंट पोर्टल" in institute copy; the UI uses "अभिभावक पोर्टल" — pick one.
2. **Sign in / sign out:** transliterated "साइन इन" / "साइन आउट" (common in Indian apps); "लॉग इन/लॉग आउट" or "प्रवेश करें/बाहर निकलें" are alternatives.
3. **"Login ID"** stays "लॉगिन ID" (the ID itself is Latin text and case-insensitive). "Password" → पासवर्ड; "temporary password" → अस्थायी पासवर्ड.
4. **"Not connected"** → "जुड़ा नहीं है"; "Preview" → "प्रीव्यू" (transliteration, like the site's other preview labels).
5. **Account / session:** खाता (account), सत्र (session), ऑडिट लॉग (audit log, transliterated), "दिखने वाला नाम" (display name).
6. **Password-toggle labels** are built as "{field} दिखाएँ / छिपाएँ" from the field label, so field labels are nouns ("मौजूदा पासवर्ड", "नया पासवर्ड", "नया पासवर्ड दोबारा").

### Deliberately left in English / Latin script
Login IDs, display names of accounts (as entered by staff), "Aspire", exam/program names in the demo table (JEE, NEET, Foundation, Integrated), the "DEMO-001" style references, numbers and dates (dates via `Intl` `hi-IN`, India time, Latin digits).

## Lead and QA wording changes (2026-10-20, after the integrity review)
- "Integrated" is now **एकीकृत** everywhere (`common`, `about`, `admissions` previously used "इंटीग्रेटेड").
- "Parent portal" is now **अभिभावक पोर्टल** everywhere (content previously used "पैरेंट पोर्टल"; the portal UI uses अभिभावक).
- `hi/hostels.ts`: the girls' hostel keeps its English name "Girls Residency Sanctum" (the draft added "सुरक्षित", a safety claim not in the English); "हमेशा" (always) removed from the open-door counselling line.
- `hi/institute.ts`: the 2023 milestone is past tense again (a launch, not a present ability).
- `programs`: "Draft" is **ड्राफ़्ट** (was "प्रारंभिक", which reads as "preliminary"); the guide line no longer claims Aspire "confirmed" details.
- `legal` (privacy): new "पोर्टल खाते" section and session-cookie paragraph, translated from the English draft — **needs legal as well as native review**.
- `auth` / `portal`: process statements rewritten as neutral, instructional copy ("अस्थायी पासवर्ड" instead of "one-time"); see `docs/m4-integrity-review.md` M-5.

## RESULTS-DATA — result cards (2026-10-20, D-031)

**Machine draft — needs native Hindi review before launch.** New keys in `src/i18n/messages/hi/results.ts` → `cards` (used by `ResultCardMosaic` / `ResultCardMarquee`): `title` "पिछले परिणाम", `lead` / `listLabel` "Aspire के पिछले बैचों के परिणाम कार्ड", `seeAll` "सभी परिणाम देखें", `pause` "रोकें", `pauseLabel` "चलते हुए परिणाम कार्ड रोकें", `scrollLabel` "… (बगल में स्क्रॉल होते हैं)". Wording is neutral on purpose (no "टॉपर", "सर्वश्रेष्ठ" or guarantees). `pauseLabel` must keep containing `pause` (accessible name contains the visible label). Alt-text pattern: see the Files table.

## M6 — student tools (2026-10-20, machine drafts — native review needed)
- Messages: `hi/tools.ts`, `hi/predictor.ts`, `hi/mocktest.ts`, `hi/ask.ts`, `hi/planner.ts`, `hi/common.ts` (nav: विद्यार्थी टूल्स, रैंक और कॉलेज प्रेडिक्टर, मॉक टेस्ट, Ask Aspire (शंका समाधान), स्टडी प्लानर), `hi/legal.ts` → `privacy.tools` (**legal review too**).
- Content: Hindi question stems, options and solutions in `src/content/mocktest/*` (85 questions + topic names) — **needs a subject teacher's review, not only language review**; Hindi topic names and formula flashcards in `src/content/planner/*`.
- Ask Aspire answers in Hindi are generated live by the AI model — not reviewable in advance; the page carries an "AI can make mistakes" note.
- The predictor share card is English-only (no Devanagari font bundled for image rendering).
- Portal tool panels: `hi/portal.ts` → `tools.*`, `blocks.toolDataBadge` and the updated student/parent copy (PORTAL-INTEGRATION, M6). Doubt-topic labels are AI-generated English (`lang="en"`).
- MCP admin page: `hi/mcp.ts` and `hi/portal.ts` → `nav.mcp` ("AI एजेंट एक्सेस") — machine draft.
- MCP permission matrix: `hi/mcp.ts` → `services`, `serviceWrite`, `access`, matrix / preset / summary keys (MCP-ADMIN, per-service scopes) — machine draft.
- CRM capture: `hi/forms.ts` (v2 consent line, `wait.hours`, `receivedBody`, `rateLimitedBody`, `fromPredictor`), "काउंसलर से बात करें" CTA labels in `hi/{predictor,ask,mocktest,planner}.ts`, updated `hi/predictor.ts` privacy line, `hi/legal.ts` enquiry access + attribution items — machine draft; consent line also needs legal review.
- CRM (M7): `hi/crm.ts` (staff workspace — inbox, lead detail, today, pipeline, reports, staff & rules), `hi/auth.ts` → `roles.staff`, `roleHints.staff`, `help.staff`, `hi/portal.ts` → `nav.crm` ("लीड और प्रवेश") — machine draft; staff-facing, so lower priority than public pages.

## HOME-TOOLS — homepage "Student tools" widget (2026-10-20, machine draft — native review needed)
- Messages: `hi/home.ts` → `tools` (eyebrow "मुफ़्त विद्यार्थी टूल्स", title "अभ्यास करें, अनुमान लगाएँ, योजना बनाएँ", lead, the three intro points, "सभी टूल्स देखें", short tab labels रैंक प्रेडिक्टर / मॉक टेस्ट / रैंचो से पूछें / स्टडी प्लानर, predictor / mock-test / planner leads, "आपका अनुमानित रैंक बैंड यहाँ दिखेगा।", "कॉलेज और पूरा अनुमान देखें", the planner countdown lines "{exam} में {days} दिन बाकी", "{exam} आज है — शुभकामनाएँ!", "यह तारीख निकल चुकी है…", and the four planner features). Form labels, sample labels, the AI caveat and most CTAs reuse the already-registered `tools`, `predictor`, `mocktest`, `ask` and `planner` strings.
- Example doubts (`tools.ask.examples`): physics (projectile, "ज़मीन से 30° पर 20 m/s की चाल से…"), chemistry (क्वथनांक), maths (x·eˣ का समाकलन), biology (दोहरा परिसंचरण) — **a subject teacher should confirm the terminology** (समाकलन / क्वथनांक / परिसंचरण vs the transliterated terms students may know better).
- Rancho (Ask Aspire's new name, owner request): `tools.tabs.ask` / `tools.ask.title` "रैंचो से पूछें" and `tools.ask.lead` ("मिलिए रैंचो से — … Aspire का AI स्टडी बडी …"). "स्टडी बडी" is transliterated on purpose (alternative: "पढ़ाई का साथी"); keep the mascot name's Hindi spelling (रैंचो) in step with RANCHO-UI.
- Register check: the widget mixes the `ask` namespace's informal "सवाल" with the planner's "विषयों"; the intro point "इस बॉक्स में आप जो लिखते हैं, वह आपके ब्राउज़र में ही रहता है" is a privacy statement — keep it accurate if the widget ever starts sending data.

## RANCHO-NAME — "Ask Aspire" renamed Rancho (रैंचो), Aspire's snow leopard mascot (2026-10-20, machine draft — native review needed)
- Name: **रैंचो** (Rancho), the tool **"रैंचो से पूछें"** (Ask Rancho), described as **"AI डाउट सॉल्वर"** — the same spellings as RANCHO-UI's `hi/rancho.ts` and HOME-TOOLS' `hi/home.ts`; change them together. Rancho is Aspire's existing mascot, so the copy says "Aspire का (दोस्ताना) हिम तेंदुआ रैंचो अब आपके डाउट हल करता है", not "मिलिए…" as for a new character.
- `hi/ask.ts`: `meta.title` "रैंचो से पूछें: अंग्रेज़ी और हिंदी में AI डाउट सॉल्वर", `meta.description` (new first sentence), `hero.crumb` "रैंचो से पूछें", `hero.title` "रैंचो — डाउट हल करने वाला आपका स्टडी बडी", `hero.lead`, `hero.note` ("…एक AI डाउट सॉल्वर है, कोई इंसान नहीं…"), `hero.mascotLabel` "Aspire का हिम तेंदुआ मैस्कॉट रैंचो, हाथ हिलाते हुए", `hero.mascotCaption` "AI डाउट सॉल्वर", `form.heading` "रैंचो से अपना डाउट पूछें", `answer.heading` "रैंचो का जवाब", `answer.working`, `answer.refused`, `errors.notConnectedTitle` / `busy` / `network`, `how.steps.solve.body`, `honest.items.ai` ("रैंचो एक AI है, कोई इंसान नहीं: …") and `honest.items.scope`.
- `hi/tools.ts`: `meta.description` ("रैंचो (हमारा AI डाउट सॉल्वर)"), `items.ask.title` "रैंचो से पूछें", `items.ask.body` (new first sentence; "हमारा AI डाउट सॉल्वर … चरण-दर-चरण समझाएगा"), `ranchoMascot` "Aspire का हिम तेंदुआ मैस्कॉट रैंचो", `ranchoCaption` "AI डाउट सॉल्वर". Note the hub card keeps the hub's formal register (प्रश्न, चरण-दर-चरण, शिक्षक) while the tool page uses सवाल / स्टेप-बाय-स्टेप / टीचर — pick one register for both.
- `hi/common.ts` → `nav.askAspire` "रैंचो से पूछें (शंका समाधान)"; `hi/crm.ts` → `tools.ask` "रैंचो से पूछें (डाउट)" (staff-facing).
- `hi/portal.ts` → `tools.activityDescription`, `blocks.previewBody`, `tools.doubts.description` ("AI डाउट सॉल्वर रैंचो से सबसे ज़्यादा पूछे गए विषय…"), `notConnectedTitle`, `emptyBodyParent`, `ctaParent` "रैंचो के बारे में", `tools.facts.doubts` "रैंचो से पूछे गए डाउट".
- `hi/legal.ts` → `privacy.tools.items` (Rancho item now starts "रैंचो (हमारा AI डाउट सॉल्वर): …"; the rest unchanged) — **legal review too**.
- Rancho's Hindi answers (including any light "snow leopard" line, e.g. a Hindi equivalent of "Let's pounce on this one!") are generated live by the AI model and are not reviewable in advance; the prompt asks for natural, simple Hindi and the name written as रैंचो.

## RANCHO-UI — floating "रैंचो से पूछें" button and chat panel (2026-10-20, machine draft — native review needed)
- Messages: `hi/rancho.ts` (new namespace). Launcher label "रैंचो से पूछें" and hint "किसी डाउट पर अटके हैं? Aspire के AI स्टडी बडी रैंचो से पूछें।". Panel: title, subtitle "Aspire का AI डाउट सॉल्वर", the greeting "नमस्ते, मैं रैंचो हूँ! …" (Rancho speaks in the first person, masculine "समझाऊँगा" / "देता हूँ"), "मैं एक AI हूँ, कोई इंसान नहीं …", subject chips ("कोई भी" + subject names kept in Latin script, as in the Ask page), placeholder "अपना डाउट लिखें…", the Enter / Shift + Enter hint, status lines, the remaining-questions line "आज {limit} में से {remaining} सवाल बाकी", the photo link "सवाल की फ़ोटो है? रैंचो का पूरा पेज खोलें", and every error and notice (not connected, daily limit "आज के लिए इतना ही", busy, network, interrupted, blocked, generic).
- The AI caveat "AI से गलती हो सकती है — अपने टीचर से ज़रूर जाँचें।" and the privacy line ("नाम या कोई निजी जानकारी न लिखें। … Anthropic की API (Claude) द्वारा प्रोसेस किया जाता है और सेव नहीं किया जाता।") are privacy/honesty statements: keep them in step with `hi/ask.ts` → `form.privacyNote` and `honest.*` (and with legal review of the privacy notice).
- Register matches `hi/ask.ts` (informal "सवाल", "डाउट", "टीचर"); the mascot name's Hindi spelling is रैंचो everywhere.

## RANCHO-PHOTO — photo questions in the floating Rancho chat (2026-10-20, machine draft — native review needed)
- `hi/rancho.ts` → `panel.photo`: camera button "फ़ोटो जोड़ें" / "फ़ोटो बदलें", "फ़ोटो हटाएँ", "फ़ोटो तैयार हो रही है…", "फ़ोटो जुड़ गई", "फ़ोटो हटा दी गई", alt texts "आपके सवाल की फ़ोटो" / "आपकी भेजी गई फ़ोटो", placeholder "फ़ोटो के बारे में कुछ लिखें (ज़रूरी नहीं)…", the confirmation "मेरी फ़ोटो में केवल सवाल है: कोई चेहरा या नाम नहीं।", and errors (फ़ाइल फ़ोटो नहीं है / खुल नहीं पाई / बहुत बड़ी है / बॉक्स पर टिक करें / "रैंचो इस फ़ोटो का उपयोग नहीं कर पाया…").
- Privacy statements, keep in step with `hi/ask.ts` → `form.privacyNote` / `consentLabel` and `hi/legal.ts` → `privacy.tools` (**legal review too**): `panel.photo.note` ("फ़ोटो में चेहरे या नाम न हों। भेजने से पहले फ़ोटो से लोकेशन की जानकारी आपके डिवाइस पर ही हटा दी जाती है … इसे सेव नहीं किया जाता।") and the updated `panel.privacy` ("…आपका सवाल और कोई भी फ़ोटो Anthropic की API (Claude) द्वारा प्रोसेस किए जाते हैं और सेव नहीं किए जाते।").
- Also changed: `panel.greeting` ("…एक सवाल लिखकर या उसकी फ़ोटो भेजें…"), `panel.errors.questionRequired` "अपना सवाल लिखें या उसकी फ़ोटो जोड़ें।", and the photo link replaced by `panel.fullPageLink` "रैंचो का पूरा पेज खोलें".
- "लोकेशन" is transliterated on purpose (alternative: "स्थान की जानकारी"); "फ़ोटो" is treated as feminine throughout (जुड़ गई, हटा दी गई), as in `hi/ask.ts`.
- Screen-reader-only announcements (heard, never shown): `panel.photo.attachedAnnouncement` "फ़ोटो जुड़ गई। ऊपर वाले बॉक्स पर टिक करके पुष्टि करें कि फ़ोटो में कोई चेहरा या नाम नहीं है।" (must start with `attached`; wording of the box check kept in step with `errors.consentRequired`) and `panel.photo.wait` "एक पल रुकें: आपकी फ़ोटो अभी तैयार हो रही है।" (when Send is pressed while the photo is still being prepared).

## LEAD-GATE — contact details before free tools' results (2026-10-21, machine draft — native review needed)

**Status: Machine draft — needs native Hindi review before launch.** The consent sentence and the privacy-notice text also need **legal review** (checklist §17 TG-4, LG-2). Owner decision 21 Oct 2026: the contact step is live now (`required`) while the tools show sample data, so these strings are public as soon as the release ships. Packages wrote their Hindi in parallel; this list was made from the working tree on 21 Oct 2026. **Any other key added or changed in these namespaces in this release also needs review** (the Integrate stage should diff them against release `806a938`).

| File | Keys new or changed in this release | Package |
|---|---|---|
| `src/i18n/messages/hi/leadGate.ts` | **Whole namespace (new):** `heading`, `lead`, `remember`, `requiredNote`, `fields.*`, `classOptions.*`, `consent` (**legal sentence, consent version `2026-10-21.gate.v1`**; the server stores its own copy in `src/lib/server/enquiry-consent.ts`, so any wording change needs a new version), `consentLink`, `smallPrint`, `sampleData` (the honest sample-data line), `signIn`, `signInLink`, `submit.*`, `sending`, `skip`, `continueWithoutSaving`, `honeypotLabel`, `errors.*`, `status.*`, `note.*`, `identity.*` | CORE |
| `src/i18n/messages/hi/legal.ts` | `privacy.meta.description`, `hero.lead`, `about.p1`, `collect.title` / `intro` / `caption` / `columnForm` / `columnRequired` / `columnTools` (new) / `hidden`, `also[4]` ("स्कोर या पर्सेंटाइल का दायरा"), every `collect.rows[].tools` (new) plus two rows (`आप विद्यार्थी हैं या माता-पिता/अभिभावक` new; `आपसे संपर्क किए जाने की आपकी सहमति` reworded, `forms` "सभी फ़ॉर्म (आपकी पूछताछ के बारे में)"), **new section `toolContact.*`** (`title`, `p1` (says the tools "पूछ सकते हैं", may ask), `sample`, `p2`–`p7`), `protecting.p1` / `p2` (extended to the contact step: limits per internet connection, a hashed per-number count for 24 hours, logs without name, number or IP address), `retention.p1`, `rights.p1`, `tools.items[0]` (predictor, rewritten), `tools.items[1]` / `[2]` / `[3]` (mock tests, planner, Rancho: one sentence appended to each; the mock-test item's first sentence also now says the website scores answers without storing them), `cookies.p1` (rewritten: no longer says "no tracking cookies"), `cookies.p3` (new: the `aspire_tool_pass` cookie). **Legal review too** | LEGAL |
| `src/i18n/messages/hi/predictor.ts` | `form.privacy` (mode-agnostic rewrite: exam and score range kept if contact details are shared), the submit button's pending label, any other gate copy | PREDICTOR |
| `src/i18n/messages/hi/home.ts` | `tools.points.free` "मुफ़्त। परिणाम से पहले आपसे एक बार संपर्क नंबर पूछा जा सकता है", `tools.points.private` "यहाँ लिखे स्कोर और तारीख़ों का हिसाब आपके ब्राउज़र में ही होता है; सटीक मान कभी नहीं भेजे जाते", `tools.predictor.pending` "एक पल…" | HOME |
| `src/i18n/messages/hi/mocktest.ts` | the tests-list description (contact number before the score), new block `gate.*` (`noteStartRequired`, `noteStartOptional`, `startIntro`, `startSubmit`, `lockedTitle`, `lockedBody`, `lockedBodyRanked` (ranked paper: share now so the save can count on the board; solutions when the month closes), `printLocked`, `printLockedCta`) | MOCKTEST |
| `src/i18n/messages/hi/planner.ts` | `privacy`, the intro line, `settings.privacy`, the pending label before a guest's first plan | PLANNER |
| `src/i18n/messages/hi/rancho.ts`, `ask.ts` (`ranchoApp.ts` was not changed in the working tree on 21 Oct 2026; review it only if RANCHO-UI changes it) | privacy notes (a guest may be asked for a contact number once; Aspire notes only that Rancho was used) and the held-question copy ("Send now" after unlocking elsewhere) | RANCHO-UI |
| `src/i18n/messages/hi/crm.ts` (staff-facing, lower priority) | labels for `tool_use` ("Used a free tool") and `consent_withdrawn`, source `tool` "Free tool (contact before result)", tool-use summaries, "Filled in by" (Student / Parent or guardian), the flag "Confirm with a parent first", consent list with dates, daily gate-lead count; admin-console CRM basics ("Add enquiry" drawer, "Edit details", "Erase" dialog, "Enquiries", "Today's calls", Rancho as the label for tool `ask`) | CRM |

Decisions and checks:
1. **Rancho's name.** `leadGate.submit.ask` is "Rancho से पूछें" in Latin script, but the site writes **रैंचो** everywhere else (RANCHO-NAME; `legal.ts` uses रैंचो). Align it (CORE owns `leadGate`).
2. **"Score range."** New lead-gate text (the consent sentence, `legal.ts` additions) uses **अंकों की सीमा** (for the predictor **अंकों या पर्सेंटाइल की सीमा**, since its band can be a percentile range); older `legal.ts` text (mock-test verification page) uses **स्कोर का दायरा**. Pick one. "10-point score range (40–49%)" → "10 अंकों की स्कोर-सीमा": the points are percentage points, so a reviewer may prefer "10 प्रतिशत-अंकों की सीमा".
3. **Button names are quoted in the privacy notice** (`toolContact.p6`, `cookies.p3`): "आप नहीं हैं?", "Aspire मुझसे संपर्क न करे", "बिना साझा किए आगे बढ़ें". If the `leadGate.identity` / `skip` wording changes, change the notice too (a test in `privacy-page.test.ts` fails otherwise).
4. **Section title** "मुफ़्त विद्यार्थी टूल्स: परिणाम से पहले संपर्क विवरण" is quoted in `about.p1`, `tools.items[0]` and `[1]`; keep them identical (tested). It uses "टूल्स", like the existing "विद्यार्थी टूल्स" section, not the plan draft's "टूल".
5. **Honesty wording to keep exact in meaning:** "सैंपल डेटा" / "सैंपल हैं" (sample data, transliterated on purpose), "विवरण साझा करने से आधिकारिक डेटा नहीं खुलता" (sharing does not unlock official data), "कोई OTP नहीं भेजा जाता", "खुले रहते हैं" (stay open: only plans already made and mock tests started before switch-on; do not widen it to "always" or to scores already seen), "पूछ सकते हैं" (may ask: the notice must stay true if the step is switched to optional or off). Never translate the step as "सत्यापन" (verification): nothing is verified.
6. **Parent wording.** The form says "माता-पिता या अभिभावक"; the class options and "I am the" radio ("मैं हूँ": विद्यार्थी / माता-पिता या अभिभावक) need a check that "मैं हूँ" reads naturally as a legend.
7. **Cookie wording:** "बेतरतीब, हस्ताक्षरित कोड" (random signed code), "वेबसाइट चलाने के लिए यह ज़रूरी नहीं है" (not essential). Legal reviewer to confirm.

## QUESTION-BANK — question bank and exam-pattern mock tests (2026-10-22, machine draft — native review needed)

**Status: being built.** Design `docs/question-bank-plan.md`; operator guide `docs/question-bank.md`; owner questions `docs/aspire-approval-checklist.md` §18 (QB-13 for Hindi). The packages below write their Hindi in parallel, so this section lists the files and the proposed glossary, not the final keys. **The Integrate stage must diff these namespaces and list every new or changed key here.** Every new UI string is a machine draft until a native Hindi reviewer checks it.

Two different kinds of Hindi are involved:
- **Website wording** (buttons, labels, notices): machine drafts written by the packages, reviewed like the rest of the site.
- **Question content** (stems, options, solutions): its own provenance, stored per question (`hiSource`). **Official** Hindi comes from NTA's Hindi or bilingual papers and is a transcription: reviewers check it against the source page and do not reword it (a change beyond fixing typing errors makes the question "Adapted by Aspire"). **Staff** Hindi is written by Aspire staff. **Machine** Hindi is labelled "machine translation, under review" (`hi_machine`) and never used on its own in Hindi mode. Hindi of the existing sample questions is already listed under M6 (needs a subject teacher).

| File | Covers | Package | Audience |
|---|---|---|---|
| `src/i18n/messages/hi/mocktest.ts` (additions) | Exam-pattern mock pages: composition line, readiness ("coming soon", shorter practice set), language and extra-time choice at start, section instructions with marking, integer keypad and 2-decimal input instructions, one-or-more-correct, passage blocks, per-question Hindi toggle with "English prevails", result extras (source labels, difficulty, accuracy by difficulty, marks lost to negative marking, "based on N questions", "Report a problem", expired paper), sample / shorter / adapted banners, ranked board note | QB-MOCKTEST-UI | **Public: review first** |
| `src/i18n/messages/hi/qb.ts` (new) | Admin bank screens: list, editor, review queues, flags, taxonomy, blueprints, coverage, team | QB-ADMIN-UI | Staff |
| `src/i18n/messages/hi/qbImport.ts` (new) | Import screens: upload form, rights tick, estimate, job progress, pattern snapshot, warnings | QB-IMPORT | Staff |
| `src/i18n/messages/hi/portal.ts` | `nav.questionBank`, `navGroups.tests`, `shell.qbAreaLabel`, `shell.crmLink` | QB-ADMIN-UI | Staff |
| `src/lib/qb/labels.ts` (if it builds Hindi source labels in code) | Public source labels ("… से Aspire द्वारा रूपांतरित", "Aspire प्रश्न बैंक", sample label) | QB-CORE-A | **Public** |
| `src/lib/qb/patterns.ts` (`QB_SLOT_META`, section labels and instructions) | Exam titles, summaries, section names and instruction text shown on the exam pages | QB-CORE-A | **Public** |
| `src/lib/qb/seed/*` | Hindi labels of official syllabus units and Aspire chapters | QB-SEED | Staff and public (chapter names in results) |

### Proposed glossary (QUESTION-BANK; machine draft, reviewer to confirm)

Where NTA's own Hindi bulletin or Hindi question papers use a term, **prefer NTA's wording** and note the source; the entries below marked "NTA term?" need that check.

| English | Hindi proposed | Note |
|---|---|---|
| Question bank | प्रश्न बैंक | |
| Exam-pattern mock test | परीक्षा-पैटर्न मॉक टेस्ट | "मॉक टेस्ट" as in the main glossary |
| A new paper every attempt | हर प्रयास में नया प्रश्नपत्र | |
| Question paper / paper | प्रश्नपत्र (running text: पेपर) | Matches the landed blueprint labels (`src/lib/qb/patterns.ts`: "प्रश्नपत्र 1"). NTA term? ("प्रश्न पत्र"); if the reviewer prefers another spelling, change the labels and this entry together |
| Practice set (shorter than the real exam) | अभ्यास सेट (असली परीक्षा से छोटा) | Keep "shorter" explicit: honesty wording |
| Monthly ranked paper | मासिक रैंकिंग पेपर | Alternative: "हर महीने का रैंक वाला पेपर" |
| Ranks are indicative | रैंक केवल सांकेतिक हैं | Keep "indicative" (सांकेतिक) |
| Easy / Medium / Hard | आसान / मध्यम / कठिन | |
| Difficulty mix set by Aspire | Aspire द्वारा तय कठिनाई-मिश्रण | Must not read as official |
| Chapter | अध्याय | Existing mock-test strings use "टॉपिक" for topics; keep अध्याय for chapters |
| Syllabus / syllabus unit | पाठ्यक्रम / पाठ्यक्रम इकाई | NTA term? |
| Section | खंड | As in `hi/mocktest.ts` |
| Single correct | एक सही विकल्प | |
| One or more correct | एक या अधिक सही विकल्प | |
| Numerical value | संख्यात्मक मान | As in `hi/mocktest.ts` |
| Rounded off to the nearest integer | निकटतम पूर्णांक तक पूर्णांकित | NTA term? Copy the official instruction wording |
| Two decimal places | दशमलव के दो स्थानों तक | Copy the official JEE Advanced Hindi instruction if available |
| Partial marks | आंशिक अंक | |
| Negative marking | नकारात्मक अंकन | `hi/mocktest.ts` uses this and, once, ऋणात्मक: pick one |
| Answer key (provisional / final) | उत्तर कुंजी (अनंतिम / अंतिम) | NTA term? |
| Dropped question | हटाया गया प्रश्न | NTA term? |
| Shift | पाली | NTA term?; students also say "शिफ़्ट" |
| Booklet code (NEET) | परीक्षा पुस्तिका कोड | NTA term? |
| Passage | अनुच्छेद | |
| Match List-I with List-II | सूची-I का सूची-II से मिलान कीजिए | Copy the official wording |
| Assertion (A) / Reason (R) | अभिकथन (A) / कारण (R) | As in NTA Hindi papers (check) |
| Statement I / Statement II | कथन I / कथन II | |
| Source | स्रोत | |
| Adapted by Aspire from … | … से Aspire द्वारा रूपांतरित | Must say Aspire changed it; never just "… से लिया गया" |
| Aspire question bank | Aspire प्रश्न बैंक | |
| Sample question (written for this demo) | सैंपल प्रश्न (इस डेमो के लिए लिखा गया) | "सैंपल" transliterated, as elsewhere |
| English prevails (if the versions differ) | दोनों संस्करणों में अंतर होने पर अंग्रेज़ी संस्करण मान्य होगा | NTA term? |
| Machine translation, under review | मशीन अनुवाद, समीक्षा जारी | Must keep "machine" |
| Compensatory time | प्रतिपूरक समय | NTA term? |
| Report a problem | समस्या बताएँ | |
| Coming soon: the bank has X of Y questions | जल्द आ रहा है: बैंक में {total} में से {count} प्रश्न हैं | Placeholder order differs from English |
| Pattern as per the 2026 bulletin | 2026 सूचना बुलेटिन के अनुसार पैटर्न | NTA term? ("सूचना बुलेटिन") |
| Pattern reviewed by Aspire faculty | पैटर्न की समीक्षा Aspire के शिक्षकों ने की है | |
| Draft / In review / Approved / Rejected | ड्राफ़्ट / समीक्षा में / स्वीकृत / अस्वीकृत | Staff-facing |
| Suspend / Retire | अस्थायी रूप से रोकें / स्थायी रूप से हटाएँ | Never "सेवानिवृत्त" for retire |
| Author / Reviewer | लेखक / समीक्षक | Staff-facing |
| Blueprint | ब्लूप्रिंट | Staff-facing, transliterated |
| Import | इम्पोर्ट | Staff-facing |
| Spot check | स्पॉट चेक | Alternative: "नमूना जाँच" |
| Duplicate / variant | डुप्लिकेट / वेरिएंट | Staff-facing |
| Figure | चित्र | |
| Readiness: full / short / thin | तैयारी: पूरा पेपर / छोटा सेट / अपर्याप्त | |

Decisions and checks:
1. **Official instruction wording.** The plan asks for the official wording of the integer keypad, decimal input and marking instructions. In Hindi, copy it from NTA's Hindi bulletin or Hindi question papers (with the source noted), not from a translation; mark any string that has no official source as a machine draft.
2. **Honesty wording to keep exact in meaning:** "छोटा" (shorter set), "सैंपल", "Aspire द्वारा रूपांतरित" (adapted), "सांकेतिक" (indicative ranks), "Aspire द्वारा तय" (Aspire's mix, not official), "मशीन अनुवाद" (machine translation). Never call a generated paper "पिछले वर्ष का प्रश्नपत्र" (a past year's paper): it is made from approved questions, some of which come from past papers.
3. **Digits and Latin script:** the existing i18n tests require the same digits as the English source and no Devanagari numerals; exam names (JEE Main, NEET, JEE Advanced, NTA, NCERT, BOH) stay in Latin script, as in the main list above.
4. **Subject terms** in chapter names and instructions (for example "शुद्ध गतिकी (Kinematics)") need a subject teacher's check, as for M6.

## LEAD-ROUTING (LR-CORE) — areas, the 1-hour call rule, super admins, Meta / CSV intake (2026-10-22, machine draft — native review needed)

**Status: Machine draft — needs native Hindi review before launch.** Mostly staff-facing (CRM and Admin → Users); the `legal.ts` and `forms.ts` lines are public and the privacy lines also need **legal review**. Written by LR-CORE (docs/lead-routing-plan.md §24); the nested `crm-*.ts` files pass to their packages, which add their own keys and list them here.

| File | Keys new or changed | Package |
|---|---|---|
| `src/i18n/messages/hi/crm.ts` | `nav.dashboard` "लीड डैशबोर्ड", `nav.settings` "CRM सेटिंग"; `sources.meta_lead_ad` "Meta लीड फ़ॉर्म", `sources.csv_import` "इम्पोर्ट की गई सूची"; `errors.superAdminOnly`; new blocks `superAdmin.*` (सुपर एडमिन chip, "आप ये सेटिंग बदल सकते हैं।", "सिर्फ़ देखने के लिए: …"), `slaChip.*` ("{time} तक कॉल करें", "कॉल में देर", "ऊपर भेजी गई"), `away.*` ("{date} तक बाहर", "मैं वापस आ गया/गई", "वापसी का दिन"), `settings.*` (hub: 5 section titles and bodies); `inbox.area` / `areaNone` / `areaToolSignups` / `noArea` / `sla*`, `inbox.columns.area`; `lead.details.consentKinds.meta` / `import`, `lead.details.consentSystemMethods.*`; new `lead.routing.*` (matches: ज़िले का नाम, क़स्बे का नाम, दूसरी वर्तनी, सीमा से लगा क़स्बा, मिलती-जुलती वर्तनी; outcomes), `lead.sla.*`, `lead.origin.*`, `lead.confirmConsent.*`, `lead.callReturn.*`; reworded `staff.managerLead`, `staff.rulesReadOnly` (now "सुपर एडमिन") | LR-CORE |
| `src/i18n/messages/hi/crm-areas.ts` (new, nested as `crm.areasAdmin`) | `metaTitle`, `metaDescription`, `title` "क्षेत्र और टीम", `lead`, `rulesNotice` | LR-ROUTING owns it from now on |
| `src/i18n/messages/hi/crm-speed.ts` (new, `crm.speed`) | `metaTitle`, `metaDescription`, `title` "कॉलिंग समय और रफ़्तार", `lead`, `strip.*` (the alert strip; "ये सूचनाएँ सिर्फ़ CRM के अंदर दिखती हैं…") | LR-SLA |
| `src/i18n/messages/hi/crm-dashboard.ts` (new, `crm.dashboard`) | `metaTitle`, `metaDescription`, `title` "लीड डैशबोर्ड", `lead` | LR-SLA |
| `src/i18n/messages/hi/crm-meta.ts` (new, `crm.metaAds`) | `metaTitle`, `metaDescription`, `title` "इंटीग्रेशन: Meta लीड विज्ञापन", `lead`, `statusOnly` | LR-META |
| `src/i18n/messages/hi/portal.ts` | `admin.users.errors.superAdminOnly` / `staffSuperAdminOnly` / `superAdminTarget` / `lastSuperAdmin` / `notAdmin` / `wrongPassword`; new `admin.users.superAdmin.*` (grant / revoke dialog, "({date} को अपने-आप बने)", the no-super-admin banner with the server command) | LR-CORE |
| `src/i18n/messages/hi/forms.ts` (public) | `shared.district.*` ("आपका ज़िला", "अपना ज़िला चुनें", "हिमाचल से बाहर"), `shared.errors.district`. District names themselves come from `src/content/hp-districts.ts` | LR-CORE (ROUTING renders it) |
| `src/i18n/messages/hi/legal.ts` (public, **legal review**) | `privacy.access.p1` (area heads; Meta lead forms — Aspire fetches the answers from Meta; imported lists; the district is used only to reach the nearest team), `privacy.retention.p1` (after erasure no name, number or message is kept: only counts that identify no one, the Meta lead id and a one-way coded fingerprint of the mobile number — "कोई नाम, नंबर या संदेश नहीं रखता: केवल ऐसी गिनती जिससे किसी की पहचान न हो …"; copies in Meta's Leads Center or downloaded sheets are not deleted) | LR-CORE |
| `src/i18n/messages/hi/crm.ts` (fix round) | `lead.erase.what` now also says what stays after an erase and that Meta / sheet copies are not deleted (§23, L7): "बचता है: बिना नाम की गिनती (चरण, स्रोत, केंद्र, क्षेत्र, तारीख़ें), Meta लीड id और फ़ोन नंबर का एकतरफ़ा कोड वाला निशान, ताकि कोई पुरानी सूची या Meta फ़ॉर्म इस परिवार को फिर से न जोड़ दे। Meta Leads Center या डाउनलोड की गई शीट में रखी प्रतियाँ नहीं हटतीं: उन्हें वहाँ भी हटाएँ।" and lists "परिवार की लिखी जगह" among what is deleted; `lead.routing.noArea` shortened to a neutral "अभी कोई क्षेत्र नहीं" (the outcome row says why) | LR-CORE |
| `src/i18n/messages/hi/crm-dashboard.ts` (fix round) | `metaDescription`: "अभी करनी वाली कॉल" corrected to "अभी करने वाली कॉल" | LR-CORE (LR-SLA owns the file) |

Decisions and checks:
1. **Titles staff use.** "एरिया हेड" and "एग्ज़ीक्यूटिव" are transliterated on purpose (the CMO's words); the older CRM strings say "केंद्र प्रबंधक" / "काउंसलर". Pick one pair for the whole CRM.
2. **"Escalated" = "ऊपर भेजी गई"** and **"Away until …" = "… तक बाहर"**: check they read naturally on a phone; "मैं वापस आ गया/गई" uses the slash for gender — a reviewer may prefer "मैं लौट आया/आई" or a neutral "वापस उपलब्ध".
3. **Privacy wording to keep exact in meaning:** "एकतरफ़ा कोड वाला निशान" (one-way coded fingerprint: it cannot be turned back into the number) and "प्रतियाँ नहीं हटतीं" (copies in Meta / sheets are NOT deleted). Product names Meta, Facebook, Instagram, Leads Center stay in Latin script.
4. **No third-party service is named** in any of these strings (the CRM connects to Meta directly).

## LEAD-ROUTING (ROUTING, SLA, IMPORT, META) — the four nested CRM files (2026-10-22, machine draft — native review needed)

**Status: Machine draft — needs native Hindi review before launch.** Staff-facing only (CRM settings, dashboard, Today's calls, alert strip, import wizard, Meta integration page). Each file mirrors its English twin key for key (`src/i18n/messages/en/crm-*.ts`); the i18n parity tests pass. Listed by the Integrate stage from the package reports.

| File (nested under `crm`) | What it covers | Sample lines to check | Package |
|---|---|---|---|
| `hi/crm-areas.ts` (`crm.areasAdmin`, 272 lines) | Areas & people: routing mode, districts and teams, "Set up from centre", people and availability, place names (aliases), place tester, unmatched places, legacy-scope review, merge, create login, Add enquiry district, errors | `title` "क्षेत्र और टीम"; `sections.routing` / `areas` / `setup`; `aliases.title` "जगहों के नाम"; `merge.title` "दो क्षेत्र मिलाएँ"; `rulesNotice` | LR-ROUTING |
| `hi/crm-speed.ts` (`crm.speed`, 145 lines) | Calling hours and the first-call rule; alert strip; Call now; escalation list | `title` "कॉलिंग समय और रफ़्तार"; `strip.callNow` "{count} को अभी कॉल करें", `strip.overdue` "{count} की कॉल में देर", `strip.escalated` "{count} ऊपर भेजी गईं"; `rule.countOnly` "पहली कॉल किसे माना जाए?"; `rule.leadGate` "फ़्री टूल के संपर्क फ़ॉर्म पर भी घड़ी शुरू करें" | LR-SLA |
| `hi/crm-dashboard.ts` (`crm.dashboard`, 120 lines) | Dashboard tiles, tables and Meta health | `title` "लीड डैशबोर्ड"; `filters.title` "अवधि और एरिया"; `away.title` "छुट्टी पर"; `speed.title` "पहली कॉल की रफ़्तार"; "reached" = "बात हुई" (table column) | LR-SLA |
| `hi/crm-import.ts` (`crm.importLeads`, 195 lines) | CSV / TSV import wizard: file, mapping, consent basis, preview statuses, Excel-damage banner, result, history | `consent.bases.meta_lead_form` "इन परिवारों ने हमारा Meta लीड फ़ॉर्म भरा"; `statuses.attached` "पहले से CRM में"; `statuses.erased_family` "परिवार का डेटा मिटाया गया था"; `damage.title` "यह फ़ाइल Excel से होकर आई है" | LR-IMPORT |
| `hi/crm-meta.ts` (`crm.metaAds`, 353 lines) | Meta Lead Ads page: status, actions, connection check, the 13-step setup checklist, credentials, forms, field mapping, test leads, inbox | `title` "इंटीग्रेशन: Meta लीड विज्ञापन"; `direct` (says no Zapier / Make is needed); `keyMissing` (asks the developer to set INTEGRATIONS_SECRET); `checklist.*` (long instructions: check the Meta menu names stay in English as on Meta's screens) | LR-META |

Decisions and checks (in addition to the LR-CORE list above):
1. **One word for "area".** `crm-areas.ts` says "क्षेत्र", while `crm-dashboard.ts` and `crm-speed.ts` say "एरिया" ("एरिया हेड"). Pick one for the whole CRM (the LR-CORE note 1 asks the same for "area head").
2. **"Away".** The dashboard says "छुट्टी पर" (on leave); the header toggle says "… तक बाहर". Away also covers a meeting or a field visit: a reviewer may prefer one neutral word everywhere.
3. **"Clock" = "घड़ी"** for the first-call timer, **"speed" = "रफ़्तार"**: check they read naturally to executives.
4. **Third-party names.** `crm-meta.ts` `direct` names Zapier and Make only to say they are **not** used (owner: "no zapier please"); this is the one exception to LR-CORE note 4.

## PAGE-LAYOUT — page layout editor (2026-10-22, machine draft — native review needed)

Design `docs/page-layout-plan.md` §3 and §11. Staff-facing, except the preview banner, which only a super admin sees on the public pages while previewing a draft.

| File | Covers | Status |
|---|---|---|
| `src/i18n/messages/hi/layout.ts` | Page layout editor, preview banner, section labels and hints; staff-facing. Verbs that would agree with a section name agree with "सेक्शन" instead, with the name quoted (“{section}” सेक्शन …); `history.someone` is the oblique "किसी व्यक्ति" (always followed by "ने") | Machine draft — needs native Hindi review before launch |
| `src/i18n/messages/hi/portal.ts` (page layout keys only) | `nav.pageLayout` "पेज लेआउट"; audit labels `admin.audit.actions.layoutSaveDraft` "पेज लेआउट का ड्राफ़्ट सहेजा", `layoutDiscardDraft` "पेज लेआउट का ड्राफ़्ट हटाया", `layoutPublish` "पेज लेआउट प्रकाशित किया", `layoutReset` "पेज लेआउट मूल क्रम पर लौटाया"; staff-facing | Machine draft — needs native Hindi review before launch |
