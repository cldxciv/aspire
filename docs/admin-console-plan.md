# Aspire admin console: redesign plan

**For:** the owner of Aspire IIT & Medical, for approval
**Date:** 21 October 2026 (after release `6d073fe`)
**Status:** draft. Nothing in this plan is built until you approve it and answer the decisions in section 7.

**Based on:** two read-only audits of today's admin, CRM, SEO, lead and admission features; an architect's first draft; and two reviews of that draft, one by an admissions head and counsellors, one on whether it can be built on this server. Appendix A lists every review point and whether it was accepted or rejected.

---

## In one minute

- **The "stuck in Enquiries" problem is already fixed.** Since release `6d073fe`, the admissions pages appear as a "Leads & admissions" group inside the admin sidebar, and a breadcrumb leads back. What's still missing is honesty and order: some pages still say "not connected", some are empty, and there are no numbers for running admissions.
- **The console gets seven sections:** Dashboard, Admission engine, Lead generation, Website & content, SEO / SMO / AEO / GEO, Users & access, and Settings & audit. Each person sees only what their role allows (admin, centre manager, counsellor, and later front desk).
- **Order of work:**
  1. **Phase 1a (days):** clean up the console.
  2. **Phase 1b (2–3 weeks):** your numbers by centre, and faster follow-ups for counsellors.
  3. **Phase 2:** the admission season (scholarship test, visits and demo classes, counsellor fact sheet). It is enquiry season now, so this comes before website editing.
  4. **Phase 3:** edit the website without a developer.
  5. **Phase 4:** Google and AI search, timed with go-live.
  6. **Phase 5:** marketing extras.
  7. **Phase 6:** paid integrations, only if you approve them.
- **Phase 0 runs in parallel and is not optional:** nightly backups that leave the server. Today there are none.
- **We need 23 decisions from you** (section 7). Each one has a recommended default. **Six are needed before the first sprint starts.**

---

## 1. What's wrong today

**Already fixed (live since `6d073fe`):** admins on the CRM pages now see the full admin sidebar with a "Leads & admissions" group and a breadcrumb back to the admin overview.

**Still wrong:**

1. **Enquiries appear twice.** The old "Enquiries" page still says enquiries are "not connected", although every website enquiry has been saved as a CRM lead since the M7 release. The admin overview says the same wrong thing.
2. **Empty pages.** "Content", "Centres" and "Results" only say "not connected". The Results page even contradicts the live site, which shows 18 selections and about 715 rankers.
3. **The overview is not a dashboard.** It shows no enquiry numbers, no overdue follow-ups, no admissions against target and no view by centre. Its account counts leave out staff.
4. **Counsellors get stuck too.** "Back" on an enquiry always goes to the Inbox, even from "Today's calls". Logging a call and setting the next follow-up takes two separate forms. There are no WhatsApp message templates.
5. **Missing screens.** Walk-ins and phone enquiries can only be added through an AI agent, and enquiry details cannot be edited or erased on screen, although the server already supports all three.
6. **Staff can be created in two places**, and one of them quietly makes every new staff member a counsellor for all centres.
7. **The activity log is unreadable.** Admissions and AI-agent actions show as raw codes such as `crm.lead_view`, which floods the list.
8. **Every website edit needs a developer and a redeploy.** All content records (programs, centres, results, testimonials and so on) are still demo placeholders. Switching to production mode today would empty the site.
9. **No SEO or AI-search tooling.** The site is deliberately hidden from Google while it is in demo mode on a temporary address.
10. **Lead sources are captured but not shown.** Campaign tags, the referring website and the landing page are saved on every web enquiry, but appear only in the CSV export.
11. **No backups leave the server.** There are manual copies made before each deploy, on the same disk, but nothing scheduled and nothing off the server, even though enquiries from families of minors are already stored there.

---

## 2. The new console map

### 2.1 Who uses the console

| Role | Who | Home page |
|---|---|---|
| **Admin** | You, and anyone you trust with everything | Dashboard, all centres |
| **Centre manager** | Runs one or more centres' admissions | Dashboard, own centres |
| **Counsellor** | Calls families and books visits | Today's calls, own enquiries only |
| **Front desk** (new, Phase 2) | Receptionist at a centre | Walk-in desk: add a walk-in, find a family by phone, today's visits and test check-ins |

A content editor or marketing role is **not** planned until a second person actually edits the website or runs campaigns (see Appendix A, E14).

### 2.2 How you get around (rules for every page)

- **Same console, same sidebar, on every page**, including the admissions pages. The sidebar is grouped, and on phones it collapses into a "Menu" button.
- **There is always a way back.** A breadcrumb (Console › Admission engine › Enquiries › Sharma family). "Back" returns to where you came from: Today's calls, Pipeline, a search, or a filtered list.
- **Top bar:**
  - Home
  - **Find an enquiry** (name or the last digits of a phone number)
  - **+ Add enquiry**
  - **View website** (visible on every screen size; today it disappears on smaller laptops)
  - Language
  - Your account

  No notification bell until Phase 5.
- **No empty pages.** A page appears in the sidebar only once it works. Everything planned is on one "What's coming" page with its phase.
- **Plain names.** The group headings use your own words. Pages inside them use everyday words: "Enquiries", "Today's calls", "Visits & demo classes", "Scholarship test", "Admissions done", "Where enquiries come from". Decision 2 lets you change this.
- **The web addresses of the admissions pages stay `/crm/...`**, so staff bookmarks keep working.

### 2.3 Sections, pages and who sees them

Phase "now" means the page exists today. A phase number means the page appears only when that phase ships.

**1. Dashboard**

| Page | What it is for | Admin | Centre manager | Counsellor | Front desk | Phase |
|---|---|---|---|---|---|---|
| Home | Five numbers by centre (see 3.1), plus a "Needs attention" list that links to filtered lists | All centres | Own centres | (home is Today's calls) | (home is Walk-in desk) | 1b |
| What's coming | Every planned feature, with its phase and status | Yes | Yes | — | — | 1a |

**2. Admission engine**

| Page | What it is for | Admin | Centre manager | Counsellor | Front desk | Phase |
|---|---|---|---|---|---|---|
| Enquiries | List, search, preset views (My new, Unassigned, Overdue, This centre, Free tool users), add, edit | All | Own centres | Own enquiries | Find by phone, add walk-in | Now (improved in 1a and 1b) |
| Today's calls | Overdue and due follow-ups and new enquiries, with one-tap call outcomes | All | Own team | Own | — | Now (improved in 1b) |
| Pipeline | Board by stage | All | Own centres | Own | — | Now |
| Admissions done | Admitted students this session, by centre and program | All | Own centres | Own | — | 1b |
| Targets | Session targets against actuals, per centre and program | Edit | View own | — | — | 1b |
| Reports | Funnel, sources, counsellor activity, lost reasons, CSV | All | Own centres, CSV | Own numbers | — | Now (improved in 1b) |
| Team & rules | Who handles which centre and program, auto-assignment, leave cover | Edit | View | — | — | Now (improved in 1b) |
| Fact sheet | Per centre: batches, start dates, timings, fees and instalments, test dates, scholarship slabs, hostel | Edit | Edit own centres | Read | Read | 2 |
| Visits & demo classes | Counselling visits and trial classes, calendar per centre | All | Own centres | Own | Today's list, check-in | 2 |
| Scholarship test | Registrations, roll numbers, admit slips, attendance, scores, slabs, offer calls | All | Own centres | Own registrations | Check-in | 2 |

**3. Lead generation**

| Page | What it is for | Admin | Centre manager | Counsellor | Front desk | Phase |
|---|---|---|---|---|---|---|
| Where enquiries come from | Source, tool, campaign tag, referring site (incl. ChatGPT and other AI assistants), landing page, weekly trend; each with "reached counselling" and "admitted" | All | Own centres (read) | — | — | 1b |
| Free tools & Rancho | Tool use per day, enquiries per tool, contact-form status, link to the "Free tool users" queue | Yes | Own centres | — | — | 1b (grows when the tool contact form ships) |
| Campaign links & QR | Tagged links and printable QR codes for posters, seminars and newspaper ads, with enquiries and admissions per campaign | Yes | Read | — | — | 2 |
| Downloads behind a form | Prospectus and sample papers in exchange for contact details | Yes | — | — | — | 5 |
| Visits & funnel | Cookie-free visit counts → tool use → enquiry → admission | Yes | Read | — | — | 5 (decision 21) |

**4. Website & content**

| Page | What it is for | Admin | Others | Phase |
|---|---|---|---|---|
| What's on the website | Honest status: how many programs, centres, results etc., which are demo and which are approved, whose consent is pending, how to change them today, and a link to each live page | Yes | — | 1a |
| Approvals & consent | Approve each record as true, and record written permission for every named student, parent or teacher. This is what lets the site leave demo mode safely. | Yes | — | 3a |
| Announcements & banner | Test dates, new batches, results day; scheduled, in English and Hindi | Yes | — | 3b |
| Editors: Results, Centres, Programs, FAQs, Articles | Edit in English and Hindi side by side: draft → preview → publish, with history | Yes | — | 3c |
| Media library | Photos with alt text, size limits and a disk quota | Yes | — | 3c |
| Hindi review | Hindi text still marked "machine draft" | Yes | — | 3c |

**5. SEO / SMO / AEO / GEO** (sidebar label "Google & AI search"; see decision 2)

| Page | What it is for | Admin | Others | Phase |
|---|---|---|---|---|
| Overview | Enquiries that came from Google, Maps and AI assistants (measurable now); the go-live checklist for search | Yes | — | 1b (small), 4 |
| Page titles & share previews | Title, description and share image per page, with Google and WhatsApp previews and too-long or missing warnings | Yes | — | 4 |
| Business facts & structured data | One verified fact sheet (name, address, phones, hours, social profiles) used for search-engine data | Yes | — | 4 |
| Centre pages & Google Business Profile | One web page per centre, plus a per-centre Google Business Profile checklist | Yes | — | 4 |
| Crawlers, sitemap & verification | Which search and AI crawlers may read the site, Search Console and Bing verification, crawler visit counts | Yes | — | 4 |
| Redirects | Keep old and printed links working | Yes | — | 4 |
| Social sharing (SMO) | Social profile links, WhatsApp share texts with tagged links, selected Instagram posts | Yes | — | 4 |

**6. Users & access**

| Page | What it is for | Admin | Others | Phase |
|---|---|---|---|---|
| People | Every account in one list; staff rows show CRM role and centres; one way to create staff | Yes | Managers see their team in Team & rules | Now (fixed in 1b) |
| Roles & permissions | A read-only table of who can do what | Yes | — | 2 |
| AI assistant access | Let an AI assistant read enquiries or add notes for you, with per-service permissions (today "AI agent access (MCP)") | Yes | — | Now (plain wording in 1b) |
| Leaderboard moderation | Remove abusive mock-test leaderboard names | Yes | — | 5 |

**7. Settings & audit**

| Page | What it is for | Admin | Others | Phase |
|---|---|---|---|---|
| Site status | Demo or production mode, whether Google can index the site, whether enquiries are saved, release, database size, free disk, last backup | Yes | — | 1b |
| Go-live checklist | What must be done before leaving demo mode (consent, legal wording, verified centre facts, domain) | Yes | — | 1b (summary), 3a (live from approvals) |
| Activity log | Who did what, in plain words; record views grouped together | Yes | — | Now (readable in 1b, filters in 3) |
| Data & privacy | Erase requests, the retention clean-up (with a dry run first), export log | Yes | — | With the tool contact form, or Phase 2 |

---

## 3. Feature catalogue

**Effort** (build time for one agent, including tests; your review time is extra):

| Size | Build time |
|---|---|
| **S** | up to 1 day |
| **M** | 2–4 days |
| **L** | 1–2 weeks |
| **XL** | more than 2 weeks |

### 3.1 Dashboard

| Feature | Why it matters for Aspire | Effort | Phase |
|---|---|---|---|
| **Five numbers by centre:** enquiries today and this week; new enquiries not yet called; overdue follow-ups; admissions this session against target; top 3 sources | With about 6 centres you run the business on target against achieved, centre by centre. Five numbers fit one glance; everything else lives on the section pages. | M | 1b |
| **Needs attention list:** unassigned enquiries, new enquiries not called within 24 h, overdue follow-ups by counsellor, lost enquiries to review, erase requests | Each line opens the filtered list, so nothing goes cold unnoticed | S | 1b |
| **Role homes:** counsellor → Today's calls; manager → own-centre dashboard; front desk → walk-in desk | Each person lands on their own work | S | 1b (front desk in 2) |
| **What's coming page** | Replaces the empty "not connected" pages with one honest list | S | 1a |

### 3.2 Admission engine

| Feature | Why it matters for Aspire | Effort | Phase |
|---|---|---|---|
| **Add enquiry** for walk-ins, phone calls and referrals, recording how the family gave consent (spoken, signed slip, form). If the family already exists, it opens their record and logs the visit with one click. | Many Himachal families walk in or phone a centre. Today only an AI agent can record them. | M | 1a |
| **Edit details; erase** (admin, with typed confirmation and a reason) | Names and classes get corrected all the time; erase requests for minors' data must be honoured (D-042) | S | 1a |
| **Back returns to where you came from** | Counsellors stop landing in the wrong list | S | 1a |
| **One-tap call outcome with the next follow-up required:** presets (Later today / Tomorrow / 3 days / Pick); a suggested next step per outcome (no answer → +3 h; switched off → tomorrow; call back → time picker); an attempt counter; "not reachable" suggested after N tries | At 60–100 calls a day, saving steps on every call is the biggest time win | M | 1b |
| **Ticking a task asks what happened** and sets the next follow-up | Today a task can be ticked "done" without any record of the call | S | 1b |
| **Follow-up rules by stage:** new → same day; contacted → day 2, 5 and 10; after counselling → day 1 and 3; after the test result → offer call within 48 h. Rules respect calling hours and the family's preferred time. | A steady rhythm without anyone remembering it | M | 1b |
| **WhatsApp templates** in English, Hindi and Hinglish, with slots (student, centre, Maps link, prospectus link, test date, batch start). They open WhatsApp with the text ready; staff press send, and the contact is logged. | Faster, consistent messages with no paid WhatsApp service | M | 1b |
| **More enquiry details:** second phone or WhatsApp number, school, board (HPBOSE or CBSE), town or district, hostel needed, target exam and year, how they heard (newspaper, poster, seminar, Google Maps, old student), referred by, intake session, preferred call time, who decides | These are the questions counsellors ask on every call. The intake session keeps a Class 10 enquiry in October counted in the right year. | M | 1b |
| **Duplicate suggestions:** same alternate phone, or same name, class and centre | Stops two counsellors calling one family | M | 1b |
| **Counsellor activity and conversion:** calls and WhatsApps per day, connect rate, conversion | Mostly counts the system already has | S | 1b |
| **Leave cover:** bulk reassign; **lost-enquiry review** (lost reasons by counsellor) | Needed the first week someone is on leave; stops hard enquiries being marked "lost" too early | M | 1b |
| **Admissions done** view and **centre targets** | Target against achieved, per session, centre and program | M | 1b |
| **Preset views and tidy filters** (filters fold away and show as removable chips) | The Inbox stops feeling like a trap | S | 1b |
| **Counsellor fact sheet**, per centre: batches, start dates, timings, fees and instalments, next test dates, scholarship slabs, hostel. Internal only. | Answers what every family asks on the phone, and fills the WhatsApp template slots | M | 2 |
| **Scholarship test (BOH), end to end:** a registration page and form (itself a lead source), roll number and printable admit slip, centre slots and capacity, check-in, scores (CSV or by hand; optionally online through the mock-test engine), score slabs → scholarship %, result on the family's timeline, an automatic "offer call within 48 h" task, and a test report | The scholarship test is the biggest admission and lead event of the season | XL | 2 |
| **Visits & demo classes:** a calendar per centre for counselling visits and 3–7 day trial classes; booking moves the stage and creates a task; calendar file; WhatsApp confirmation template | Trial classes are a key conversion step; today "visited or demo" is only a stage name | L | 2 |
| **Front-desk role** | Receptionists add walk-ins without seeing anyone's full pipeline | M | 2 |
| **Import paper enquiries (CSV)** from school seminars, paper test forms and newspaper coupons, with a consent-method column and duplicate check | A large offline source in Himachal | M | 2 |
| **Merge duplicates; add another student to the same family** | Siblings and both parents' phones are common. Today one phone number means one enquiry, so this needs a small design change. | L | 2 |
| **First-response time** (enquiry → first call), by counsellor and centre | Speed of the first call drives conversion | M | 2 |
| Offers and scholarship approvals, with a printable letter | Consistent, approved discounts | L | 6 (after decisions 13–14) |
| Fees and instalments due (only if Aspire has no fee system already) | Avoid duplicating Tally, an ERP or Excel | L | 6 (decision 13) |
| Applications and documents checklist (no scans stored) | Know which files are complete | M | 6 |
| Convert an admitted student into student and parent portal accounts | Closes the loop to the portals | M | 6 |

### 3.3 Lead generation

| Feature | Why it matters for Aspire | Effort | Phase |
|---|---|---|---|
| **Where enquiries come from:** source, tool, campaign tag (UTM), referring site, landing page, weekly trend; each with "reached counselling" and "admitted" | Shows which poster, campaign or tool actually brings admissions, using data already saved on every web enquiry | M | 1b |
| **Enquiries from AI assistants:** referring sites chatgpt.com, perplexity.ai, gemini.google.com and Copilot, plus `utm_source=chatgpt.com`. The non-personal referring site is kept even when an enquiry is erased. | The one honest AEO/GEO number available today | S | 1b |
| **Google Maps and Business Profile as a source:** a tagged website link for each centre's Google Business Profile, plus "Google Maps" in "how they heard" | For local coaching, Maps calls and clicks are a major source, and this makes them visible at no cost | S | 1b |
| **Free tools & Rancho card:** tool use per day (predictor, mock tests, planner, Rancho questions), enquiries per tool, and "Rancho" shown by name in reports (today it appears as "ask") | The free tools and Rancho are the lead magnets; you should see them working | S | 1b |
| **Contact form in front of every tool.** This has its own detailed plan (work packages WP0–WP10) and its own schedule. Console pieces that ship with it: a "Free tool users" queue triaged by managers; tool use on each family's timeline; the form's on/off status; a queue of "Not you? delete my details" requests; and an automatic clean-up of tool-only enquiries nobody called, which must exist before the form becomes mandatory. | Turns tool traffic into enquiries while respecting minors' data rules | XL (whole feature); console part M | With the contact form |
| **Rancho as a lead source:** Rancho's "Talk to a counsellor" already creates an enquiry tagged Rancho. With the contact form, Rancho records only the subject (Physics, Chemistry, Maths, Biology), never the question or photo. Later, a "Ask a counsellor to call me" button inside the chat. | Rancho is the most engaging tool; it should feed admissions without exposing children's questions | S now; M later | 1b, 5 |
| **Campaign links & QR codes:** short links, click counts, printable QR (SVG/PNG), enquiries and admissions per campaign, an Instagram bio-link page | Most Himachal marketing is offline (posters, school seminars, newspapers, test posters); QR codes make it measurable | M | 2 (print only after decision 17) |
| **Program and centre pre-filled** on every "Enquire" button | Fewer form fields; better reports | S | 3b |
| **Downloads behind a form:** prospectus, sample papers | Classic lead capture; the download cards already exist, marked "gated" | M | 5 |
| **Cookie-free visit counts and full funnel** (visits → tool use → enquiry → admission) by source and campaign | The only way to see conversion from visits. It needs a small first-party script and a privacy notice update. | L | 5 (decision 21) |
| **New-enquiry alerts inside the console** (bell, plus browser alert while the console is open) | Nothing is sent to families; staff just notice faster | M | 5 |
| Form settings, spam statistics, consent-wording versions (read-only) | Tune forms without a deploy | M | 5 |
| ~~General landing-page builder~~ | **Dropped.** The landing page that matters, scholarship-test registration, is built in Phase 2. | — | — |

### 3.4 Website & content

| Feature | Why it matters for Aspire | Effort | Phase |
|---|---|---|---|
| **"What's on the website" status page** | Replaces three empty pages with the truth: what's there, what's demo, what's pending | S | 1a |
| **Approvals & consent register:** for each existing record, approved or not, who verified it and when. For each named student, parent or teacher, permission granted, pending, refused or withdrawn, and how it was given. The text stays where it is for now. | Lets the site leave demo mode **without going empty**, and closes the result-card consent item (RC-1). Withdrawing permission takes the name off the site within minutes. | L | 3a |
| **Go-live readiness from live data** | The checklist fills itself as records are approved | S | 3a |
| **Announcements & homepage banner:** scheduled, English and Hindi, with an end date | The most common "change it today" need: test dates, new batch, results day | M | 3b |
| **Editors for the content you change often:** results register (CSV import), centres (about 6, each fact marked verified), programs, FAQs, articles. English and Hindi side by side; draft → preview → publish; history and restore. | Changes go live in minutes without a developer | XL (store) + L per group of editors | 3c |
| **Media library:** uploads up to 5 MB, resized automatically, required alt text in English and Hindi, a total quota, a disk warning | New photos without a redeploy, within a small server's disk | L | 3c |
| **Hindi review queue** | Machine-drafted Hindi is checked before it represents Aspire | S | 3c |
| Homepage carousels and hero photos | These are spread across many component files owned by other work streams (64 files read the image lists directly). Editing them is a large rewiring job. | L+ | Later, only if needed |
| Content-editor role | Only when a second person edits the site | M–L | Later |

### 3.5 SEO / SMO / AEO / GEO

**Why most of this waits for go-live:** while the site is in demo mode on a temporary address, it is deliberately hidden from Google (robots "Disallow: /", noindex). SEO work done now would be invisible, and some of it would be thrown away when the domain changes.

| Feature | Why it matters for Aspire | Effort | Phase |
|---|---|---|---|
| Keep the console out of search (`/crm` added to robots); remove unavailable tools from the sitemap | Quick hygiene | S | 1a |
| Enquiries from Google Maps and AI assistants (see 3.3) | Measurable now | S | 1b |
| **Page titles, descriptions & share previews:** per-page overrides, Google and WhatsApp previews, "missing" and "too long" warnings | What families see in Google and in shared links | L | 4 |
| **Share images:** a default image plus cards for programs, centres, articles, announcements. English first; Hindi only after a font test, because the image tool breaks Hindi letter joins today. | Links on WhatsApp and Instagram are how families pass the site around | M | 4 |
| **Business facts & structured data:** Organization and one LocalBusiness per centre (address, map pin, hours), Article, Breadcrumb, Event for the scholarship test, built only from verified facts. **No promise of rich results:** Google has limited FAQ rich results to government and health sites, and is phasing out course rich results. | Helps Google and AI assistants get Aspire's facts right; wrong facts would mislead families | L | 4 |
| **Centre pages** (one per town), with map, timings, programs, local results (with consent), and an enquiry form pre-filled with the centre | Searches like "NEET coaching in Mandi" need one page per centre | M | 4 |
| **Google Business Profile checklist** per centre: same name, address and phone everywhere, categories, photos, posts, review replies | For local coaching this matters more than anything on the website. It is mostly offline work and can start any time. | S | 4 (start now offline) |
| **Search & AI crawler settings:** sitemap, robots, Search Console and Bing verification on the production domain, and an AI-crawler policy that keeps answer crawlers (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot, Perplexity-User) separate from training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended). Note: Google-Extended does **not** control Google's AI Overviews. | You decide who may read the site (decision 22) | M | 4 |
| **AI crawler visits:** daily counts per bot, with no IP addresses | A real signal that AI engines are reading Aspire | S | 4 |
| **Redirects** | Old links, printed URLs and the domain move keep working | M | 4 |
| **llms.txt** | Cheap hygiene; no major AI engine has committed to reading it | S | 4 |
| **Social sharing (SMO):** social profile links, WhatsApp share texts with tagged links for results, announcements and test dates, selected Instagram posts as links (no third-party embeds) | Instagram and WhatsApp are where students and parents are | M | 4 |
| **Monthly AI-answer check:** about 10 questions such as "best NEET coaching in Mandi", noting whether Aspire is named | AI answers cannot be measured automatically; this is a manual checklist, not software | S | 4 |
| ~~0–100 SEO score, AI-visibility log screen, llms-full.txt, a switch per structured-data type, 404 log~~ | **Dropped.** They are vanity numbers, unmeasurable, or not possible on this setup (Appendix A, E12 and E19). | — | — |

### 3.6 Users & access

| Feature | Why it matters for Aspire | Effort | Phase |
|---|---|---|---|
| **One People list:** staff show their CRM role and centres, staff are created in one place only, and staff are counted | Ends the "everyone becomes a counsellor for all centres" surprise | M | 1b |
| **AI assistant access in plain words:** fix the old "Ask Aspire" wording to "Rancho" | You can see what an AI assistant is allowed to do | S | 1b |
| **Front-desk role and a read-only permissions table** | Clear, limited access for receptionists | M | 2 |
| **Leaderboard moderation screen** (the server function exists today) | Remove abusive names without an AI agent | S | 5 |
| Student progress viewer for admins (every view recorded) | Today only an AI agent can see it | M | 6 |

### 3.7 Settings & audit

| Feature | Why it matters for Aspire | Effort | Phase |
|---|---|---|---|
| **Nightly encrypted backups that leave the server**, with a monthly test restore | Families' enquiries (minors' data) and accounts live in one database file with no off-server copy | M (setup on the server) | 0 |
| **Site status page** (admin only): mode, indexing, enquiry saving and webhook test, release, database size, free disk, last backup | You see the site's health without asking a developer | S | 1b |
| **Go-live checklist summary**, drawn from the approval checklist document until Phase 3a takes over | One place to see what blocks launch | S | 1b |
| **Readable activity log:** plain labels for every admissions and AI-agent action; repeated "viewed enquiry" entries grouped (kept, not deleted) | A manager can actually read it | S | 1b |
| Activity log filters (person, action, date), paging, export | Answer "who opened this family's record?" | M | 3 |
| **Data & privacy:** erase requests, retention clean-up with a dry run first, export log | DPDP and minors' data (D-042) | M | With the tool contact form, or Phase 2 |

---

## 4. Phases

| Phase | Name | Outcome you will see | Rough build time |
|---|---|---|---|
| **0** | Safety net (server work, in parallel with 1a) | Nightly backups leave the server; disk stays healthy; every change is test-built off your PC | 2–3 days |
| **1a** | Clean up the console | Nothing says "not connected"; no empty pages; Back works everywhere; staff can add, edit and erase enquiries on screen | About 1 week |
| **1b** | Your numbers and faster follow-ups | Five numbers by centre against target; counsellors log a call and the next follow-up in one step; WhatsApp templates; where enquiries come from, including AI assistants and Google Maps; one place to manage staff | 2–3 weeks |
| **2** | Admission season | The scholarship test runs end to end in the console; visits and demo classes are booked; counsellors have a fact sheet; front desk enters walk-ins; paper enquiries can be imported; campaign QR codes are measurable | 4–6 weeks |
| **3** | Website without a developer | **3a:** records approved and consents recorded, so the site can leave demo mode without going empty. **3b:** announcements and a banner in minutes. **3c:** editors and photos for the content you change often. | 3a: 1–2 weeks. 3b: about 1 week. 3c: 6–10 weeks |
| **4** | Go-live: Google & AI search | Every page has a reviewed title and share card; centre pages; verified business facts; a crawler policy; redirects; Search Console on the real domain | 3–5 weeks |
| **5** | Marketing extras | Downloads behind a form, cookie-free visit counts (if approved), alerts inside the console, Rancho callback, leaderboard moderation | 3–4 weeks |
| **6** | Optional, only with your approval | Paid messaging (WhatsApp Business API, SMS, email), payment gateway, fees module, offers and letters, documents, portal accounts for new admissions, Google Analytics or Meta pixel | Case by case |

**How the order works:**

- **Phase 3a can run alongside Phase 2** if you want to leave demo mode sooner. The two touch different parts of the code.
- **Phase 4 is timed with your go-live date and domain choice** (decision 17), not with the calendar.
- **The tool contact form follows its own plan.** Its console pieces (section 3.3) ship together with it, whichever phase that lands in.

---

## 5. Architecture notes and honest constraints

This section is for the build team; you can skim it. The words in **bold** are the rules.

### 5.1 Ground rules

- **One console.** Admin and staff use the same shell. The shipped shell already picks the admin or staff sidebar for the signed-in person inside `<Suspense>`, so the static page shell stays prerendered. Keep it that way, and never read the session in a synchronous layout.
- **Server re-checks everything.** Hiding a sidebar item is cosmetic. Every page and API re-checks permission on the server, as `CrmGate` and `requireCrm` do today.
- **No changes that rebuild existing tables.** New lead details, targets, rules, templates, test data, bookings, the front-desk flag and family links go into **side tables keyed by lead or user id**, created by idempotent feature schemas (`src/lib/db/features/*.ts`). The `crm_leads` stage CHECK and the `crm_staff` role CHECK are never widened. All SQL stays in repo modules (D-037).
- **Erase and retention cover every new table.** Any side table that holds personal data (second phone, school, test registration, booking) is cleared by `eraseLead` and the retention job. Non-personal analytics fields, such as the referring site's host, are kept.
- **Route handlers, not Server Actions.** The repo has none today. Keep writing through API route handlers with their existing auth, audit and error handling.
- **Every new console widget must render without data in preview mode** (`PORTAL_PREVIEW`).
- **`/api/health` stays public and minimal.** Release, database size, disk and backup status come from an admin-only server read.
- **Long jobs never block the site.** `node:sqlite` is synchronous and the server has one CPU, so seeding, CSV imports, retention runs and exports work in chunks of about 200 rows per transaction, yielding between chunks. Counters are added up in memory and written every 30–60 s, never one row per page view.

### 5.2 Moving content out of code files, with Cache Components (Next 16, `cacheComponents: true`)

**Today:** all content is TypeScript in `src/content/`. Pages are prerendered during `docker compose build`, where no `/data` volume and no database exist. `src/lib/data.ts` is the main access layer, **but not the only one**: 64 files import the image lists directly, carousels and hero slides live in component modules, and the slug getters are synchronous.

**Step 3a: an approvals and consent overlay (not a CMS).** A table keyed by the existing record ids holds:
- status (placeholder, approved, hidden)
- verified by and verified on
- consent status, method, guardian and withdrawal date for each named person

The text stays in code. `data.ts` merges the overlay in. This unblocks production mode at about a tenth of the cost of a full CMS.

**Rule 1: anything that may need to come down fast is never baked into build HTML.** That covers student names and result cards, testimonials, announcements and anything with an end date. It renders inside `<Suspense>` after `await connection()` and reads through `'use cache'` functions tagged `content:<type>`.

**Why Rule 1 matters:** today the results page calls `canShowStudentName()` at build time, so names are written into static HTML. Tag state also lives in memory and does not survive a restart.

**Rule 2: other DB-backed content also renders per request from the in-memory cache.** That stays cheap on local SQLite. A publish shows within seconds, and a restart can never bring back a build-time copy. The static page shell (layout, headings, code-held text) stays prerendered.

**Rule 3: console writes call `revalidateTag(tag, { expire: 0 })`**, so the next visitor gets fresh data, which also matters for consent withdrawal and unpublishing. Do not use `'max'` (stale-while-revalidate) for console publishes. Editor pages read the database directly and are session-dynamic, so editors always see their own changes.

**Result-card files** are sent with `private, max-age=3600`. A withdrawn card can stay in a family's browser for up to an hour. Shorten this to 5 minutes when the consent register ships, and tell the owner the real delay, never "immediately".

**Step 3c: a real content store, only for types edited often.**
- **Seeding:** an admin-only, idempotent "Import code baseline" action seeds the store inside the app. A plain-Node script cannot resolve the `@/` imports, and the data lives in the container.
- **A per-type `seeded_at` marker:** once a type is seeded, the database is the truth even when it is empty, so archived content never "comes back" from code.
- **Shared fields are stored once** (ids, numbers, phones, links, images). Only translatable text is stored per language, so a phone number corrected in English is never left wrong in Hindi.
- **Slug getters become async**, which touches pages owned by other work streams. Sequence that with them.
- **The `src/content` files become seed-only and test fixtures**, with a header saying so, to avoid two sources of truth.

**Build safety.** `next build` cannot run on the owner's PC (too little RAM) and today first runs on the production server. The existing `prerender-bailout.test.ts` only checks six API routes, not pages. Before Phase 3, add an off-PC CI build (GitHub Actions on the private repo) that runs typecheck, tests and `next build`, and checks `.next/prerender-manifest.json`, so that no page silently turns fully dynamic or fails to prerender.

### 5.3 Draft → preview → publish, and English/Hindi editing

- **Status flow:** draft → (in review, if you want it) → published → archived. Publish and unpublish dates are checked at request time (Rule 1).
- **Preview** happens inside the console only (signed in). It renders the real public section with draft data, on an uncached route. **There are no public preview links for any record that names a student, parent or teacher** (decision 18). Signed 72-hour preview links for other records are optional later.
- **History:** append-only revisions with author and note. Restoring a version creates a new revision. Every publish is audited (`content.publish`).
- **English and Hindi:** the two languages sit side by side. Every Hindi field carries a "machine draft" or "reviewed" flag. A record shows English where its Hindi is missing (as today). Decision 19 sets whether unreviewed Hindi may publish.
- **Console language:** the console is bilingual today; every message file has a typed Hindi twin. Keeping every new console screen bilingual adds roughly 30–40% to copy and review effort (decision 5).

### 5.4 Media on a small VPS (about 2 GB free disk)

**The server:** 1 CPU, 4 GB RAM, shared with other client sites. The disk is about 95% full. A release build peaks at about 2.6 GB. The container is limited to 768 MB of memory with a 512 MB JavaScript heap.

**Storage:** files go to `/data/media` (the same volume as the database, included in off-server backups), never to `public/`, because the image is rebuilt on every release.

**Upload limits:**
- 5 MB per file
- longest side resized to 2,400 px or less
- the raw original is **not** kept
- HEIC (iPhone) files are rejected with a clear message, because the prebuilt image library cannot read them

**One resizing strategy:** make two sizes (about 960 and 1,920 px WebP) at upload and serve them as they are. Do not also pass them through `next/image`, so they never fill its cache. Separately, cap the existing `next/image` cache for bundled images with `images.maximumDiskCacheSize`.

**sharp:**
- add it to `package.json` as a pinned dependency (today it is only an optional dependency of `next`)
- `sharp.concurrency(1)`, `sharp.cache(false)`, `limitInputPixels`
- one upload processed at a time

Its memory sits outside the JavaScript heap.

**nginx:** the host's default upload limit is 1 MB. Raise it **only for the upload route**, to about 6 MB. This is an ops change on the shared host, made when the media library ships.

**Quota:** a total media quota of about 500 MB, warning at 80%. The Site status page shows free disk and warns below 1.5 GB.

**Private files** (result cards, later gated downloads) are served only through routes that re-check consent and role. Result cards stay in their current server folder and are linked to the consent register.

### 5.5 Permissions

**Today:** there are core roles (admin, staff, student, parent) and, for staff, a CRM membership (counsellor or manager, with centres) read through `crmPermissions`.

**Plan:** one `can(viewer, capability)` helper extends `crmPermissions`. Capabilities include `lead.export`, `lead.erase`, `rules.edit`, `targets.edit`, `facts.edit`, `test.manage`, `content.publish` and `settings.view`. Pages, APIs and sidebar filtering all use it.

**Front desk** is a CRM staff member with a front-desk flag in a side table. No role CHECK change is needed.

**Content-editor and marketing roles** need a new core role and changes to the auth policy, the proxy and the gates. They are deferred until such a person exists.

**Export** stays with admins and managers; **erase** stays with admins only.

### 5.6 Audit

- Every console write is audited with a dotted code: `crm.*`, `adm.*` (tests, bookings), `content.*`, `consent.*`, `seo.*`, `leadgen.*`, `settings.*`.
- One label registry (English and Hindi) turns codes into sentences.
- Repeated `crm.lead_view` entries are **grouped on screen, not deleted**: they are the evidence of who looked at a minor's record. Retention is decision 20.
- Indexes on (action, at), (actor, at) and (target, at) support the Phase 3 filters. Export runs in chunks.

### 5.7 Lead generation data

- **Attribution:** the campaign tags, referring site, landing page and tool are already captured on every web enquiry (in session storage only, no cookies). Phase 1b adds reports, plus a stored referring-site host that survives erase.
- **Tool contact form:** follows its own plan: a `crm_tool_passes` table, a `tool_use` activity, and a `TOOL_GATE` switch (`required`, `optional` or `off`) set in the server settings. The console shows the switch read-only until settings move to the database.
- **Campaign links (Phase 2):** a campaigns table and a links table (short code → page plus tags). `/go/<code>` counts clicks per day and redirects. QR codes are made on the server.
- **The redirect map** that the proxy reads is shared through a `globalThis[Symbol.for(...)]` registry (the proxy is bundled separately from the API routes; `connection.ts` already uses this trick).
- **Visit counts (Phase 5, if approved):** filter out Next's background prefetch requests. Tagging visits with campaign data needs a small first-party browser script, so say so plainly in the privacy notice.

### 5.8 Server operations (Phase 0)

- **Backups:**
  1. Nightly `VACUUM INTO` (or `node:sqlite` `backup()`) inside the container. A plain file copy of a WAL database is not safe.
  2. Encrypt the copy.
  3. Send it off the server with rclone to a location you choose (decision 3).
  4. Keep 14 daily and 8 weekly copies.
  5. Write a "last backup" marker that the Site status page reads.
  6. Do a restore test once a month.

  Copies on the same disk are only temporary.
- **Disk:**
  - Keep at most 2 release images (current and rollback).
  - Run `docker builder prune` after each build.
  - Keep using the low-disk watchdog during builds.
  - Later, consider building the image in CI and pulling it, to avoid the 2.6 GB build peak on the shared server.
- **CI build:** see 5.2. It is required before Phase 3 and useful from the first sprint.

### 5.9 Honest constraints

- **No SMS, email or WhatsApp-sending provider (D-033, D-041).** Staff call through `tel:` links and send WhatsApp messages themselves through `wa.me` links with pre-filled text. The console logs the contact but **never says a message was "sent"**. Families get no automatic confirmations or reminders until you approve a provider (decision 23). SMS in India also needs DLT registration.
- **Children's data and India's DPDP Act.** Most enquiries concern under-18s.
  - The Act requires verifiable parental consent for children.
  - The consent wording, the privacy notice (7 parts still "to be confirmed") and the retention period are all awaiting legal review (checklist items CRM-2, CRM-3, FP-3, FP-6 and FP-11).
  - **Today about 715 students' names and result cards are publicly reachable on the demo site without confirmed consent (RC-1).** Decision 4 asks you to close this.
  - The tool contact form will multiply the number of minors' records, which is why its clean-up and "delete my details" queue ship with it.
  - Document scans are not stored.
- **Demo vs production.** Every content record is still a placeholder, so production mode today means an empty site. The safe path:
  1. Phase 3a: approve records and record consent.
  2. Tick the go-live checklist.
  3. Set `SHOW_PLACEHOLDER_CONTENT=false` and rebuild.

  The console banner always states which mode the site is in.
- **AEO and GEO can't be measured precisely.** ChatGPT, Perplexity, Gemini and Google AI Overviews publish no data on how often they mention or recommend a business. What can be measured:
  - enquiries referred by AI assistants (from 1b)
  - AI crawler visits (Phase 4)
  - a monthly manual check of sample questions

  Structured data and llms.txt help AI assistants get the facts right, but they carry no guarantee and no rich results for this kind of site.
- **Small shared server.** It has one CPU, a single SQLite database, rate limits held in memory, about 2 GB of free disk and other clients' sites beside it. This is fine for about 6 centres, but heavy jobs, big uploads and analytics must stay modest (5.1, 5.4).
- **Builds cannot be checked on the owner's PC** (5.2), and the PC crashes when too many agents run at once. Agents work in small waves.
- **Shared code ownership.** Public pages (`(site)/**`), the homepage components and the tool components are being changed by other work streams, including the tool contact form. Console work that touches them (Phase 3b and later, centre pages, CTA prefill) is sequenced with those owners.

---

## 6. Risks

| Risk | What we do about it |
|---|---|
| **Admission season slips** while the console work is busy with website editing | The order puts admissions first (1b, then 2); website editing comes after |
| **Minors' data exposure:** demo-mode names (RC-1), the tool contact form's volume, imports, exports | Decision 4 now; consent register in 3a; erase and retention cover every table; export limited to managers and admins; every record view audited |
| **Data loss:** one database file with no off-server backup, and the website itself will live there after Phase 3 | Phase 0 before anything moves into the database; monthly restore test |
| **Disk fills up** during a build or an upload, taking down other client sites on the shared server | Image pruning, build watchdog, upload limits and quota, disk warning on Site status; later, CI-built images |
| **Stale or resurrected content** after moving to the database (build-time copies, restarts, empty-type fallback) | Rules 1–3 in 5.2, `seeded_at` markers, CI prerender check |
| **Two agents edit the same files.** For example, the tool contact form's CRM screen (WP9) and this plan's lead-page work both touch `LeadDetailView.tsx` and the CRM messages. | Sprint waves are sequenced (section 8); never run both at once |
| **Staff don't use it**, keeping notebooks and personal WhatsApp | One-tap logging, templates, targets, manager reviews; a 30-minute walkthrough per centre after 1b |
| **Scope creep** into a school ERP (attendance, payroll, timetables) | Scope ends at "admitted"; fees only if Aspire has no system (decision 13) |
| **Unverified facts** in structured data, share texts or WhatsApp templates (fees, dates, addresses, results) | Verified flags; the fact sheet is internal until verified; schema built only from verified facts |
| **Machine Hindi** going live unreviewed | Hindi review queue; decision 19 |
| **The tool contact form cuts tool use** (and with it sharing and SEO value), or breaches consent rules | Its own plan: start in optional or soft mode until legal review, measure shown, submitted and skipped, then review |
| **Over-promising SEO or AI results** | This plan promises no rankings, no rich results and no AI "scores"; only measurable signals are reported |
| **QR codes printed with the temporary domain** stop working after the domain move | Decision 17: print only after the domain is final, or keep the old domain redirecting permanently |
| **Long jobs freeze the site** on one CPU with a synchronous database | Chunked jobs and in-memory counters (5.1) |

---

## 7. Decisions needed from you

> **Owner approval (2026-10-21):** the owner approved this plan and **all 23 recommended defaults** as written below (each can be changed later). Sprint order: Wave 1 Agent A (console) and Agent C (ops & SEO) start now; Agent B (CRM basics) starts after the tool contact form core (GATE-CORE) finishes, because both edit src/lib/crm; RC-1 (hide named result cards until consent) is scheduled right after the Rancho app release. **Backups deferred (2026-10-21):** the owner put off-server backups on hold; deploy/backup.sh, restore.sh and the cron/README steps stay in the repo, unused, until the owner asks.


Each decision has a **recommended default**. If you reply "defaults are fine", we use them.

### Needed before the first sprint (Phase 0 and 1a)

1. **Approve this plan and its order:** admission work first, website editing next, Google & AI search at go-live.
   *Default:* approve.
2. **Sidebar names.**
   *Default:* your words for the groups (Dashboard, Admission engine, Lead generation, Website & content, Google & AI search (SEO/SMO/AEO/GEO), Users & access, Settings & audit) and plain words for the pages inside them (Enquiries, Today's calls, Visits & demo classes, Scholarship test, Admissions done, Where enquiries come from, Campaign links & QR).
3. **Off-server backups: where they go and who holds the key.**
   *Default:* a nightly encrypted copy to a cloud folder you own (for example your Google Drive, through rclone); 14 daily and 8 weekly copies; the encryption key in your password manager; a test restore once a month.
4. **Student names and result cards on the public demo site before consent (RC-1).**
   *Default:* hide names and cards on the public demo now (a small change) until the consent register (Phase 3a) records permission. The rest of the demo stays open. (Zero-code alternative: turn the preview password back on.)
5. **Console language.**
   *Default:* staff-facing admission screens in English and Hindi (as today); owner-only technical pages (SEO, settings, activity log) in English only, which saves about 30% effort on those pages.
6. **Keep the `/crm` web addresses** for the admissions pages.
   *Default:* keep them.

### Needed before Phase 1b

7. **Centres.** Confirm the real list (about 6; the website has 4) and each centre's manager.
   *Default:* send the names now; addresses, phones and map pins can wait for go-live.
8. **Session calendar and targets.**
   *Default:* the session runs April to March; you enter admission targets per centre and program in the console; enquiry and counselling targets are optional.
9. **Calling rules.**
   *Default:*
   - no calls before 8 am or after 9 pm (IST)
   - new enquiry: called the same day, within 1 working hour
   - contacted: follow up on days 2, 5 and 10
   - after counselling: follow up on days 1 and 3
   - after the test result: offer call within 48 h
   - suggest "not reachable" after 5 unanswered tries
10. **Lost enquiries and duplicates.**
    *Default:* counsellors may mark an enquiry lost, with a reason; managers review lost enquiries weekly; duplicates are never merged automatically, only suggested and confirmed by staff.
11. **WhatsApp templates.**
    *Default:* we draft 8 templates in English, Hindi and Hinglish; you approve the wording; managers may edit later; staff always press send themselves.
12. **Leads from the tool contact form, and Rancho.**
    *Default:* a separate "Free tool users" queue that managers triage (not auto-assigned to counsellors); Rancho records only the subject, never the question or photo.

### Needed before Phase 2 (admission season)

13. **What you already use:**
    - for fees, batches and receipts (Tally, a coaching ERP, Excel)
    - WhatsApp Business quick replies
    - any missed-call or IVR number
    - who manages each centre's Google Business Profile

    *Default:* fees stay where they are today; the console tracks families up to "admitted" only.
14. **Scholarship test (BOH) format and rules.**
    *Default:* an offline paper at each centre, with scores entered by CSV, plus an optional online version through the mock-test engine. You set the slabs (score → scholarship %). Counsellors cannot give extra discounts; centre managers may, up to a limit you set; above that limit, you approve.
15. **Front desk.**
    *Default:* one front-desk login per centre that has a receptionist, limited to adding walk-ins, finding a family by phone, and today's visits and test check-ins.
16. **Consent for walk-in and paper enquiries.**
    *Default:* every manual enquiry records how consent was given (spoken, signed slip, form); your legal adviser confirms which methods are acceptable for minors' families (FP-11).
17. **Production domain and go-live date** (this also decides when QR codes can be printed).
    *Default:* aspireiit.in, which is already the website's default; print QR codes only once the domain is final, or keep the temporary domain redirecting permanently.

### Needed before Phase 3 (website editing)

18. **Who edits the website, and how approvals work.**
    *Default:*
    - only you (admin) for now
    - every change is a draft until you publish it
    - no public preview links for anything that names a student, parent or teacher
    - the approval checklist document stays the source of truth until Phase 3a moves approvals into the console
19. **Hindi publishing.**
    *Default:* Hindi about people, results, fees or claims must be reviewed by a person before it goes live; English shows until then.
20. **Legal review and retention.** Name the person who reviews the consent wording and privacy notice (CRM-2, FP-3, FP-6, FP-11).
    *Default retention:*
    - enquiries that never became admissions: deleted 18 months after the last activity
    - tool-only enquiries nobody contacted: 6 months
    - activity log: 3 years (record views grouped on screen, never deleted early)

### Needed before Phases 4–6

21. **Analytics.**
    *Default:* cookie-free, first-party aggregate counts only, with the privacy notice updated; no Google Analytics or Meta pixel for now.
22. **AI crawlers.**
    *Default:* at go-live, allow both answer crawlers and training crawlers to read public pages, since you want AI assistants to know Aspire; private areas are always blocked.
23. **Paid integrations:** WhatsApp Business API, SMS, email, a payment gateway, document scans, Instagram embeds.
    *Default:* stay manual for now; revisit once Phase 2 is in daily use.

---

## 8. First build sprint (starts as soon as you approve)

**Scope:** Phase 0 and Phase 1a.

**How agents work** (because the owner's PC is short of memory):
- 2, at most 3, build agents at a time, in waves
- tests with `vitest --maxWorkers=2`, only for the suites a change touches
- no local `next build` and no dev server unless a change needs a visual check
- the CI build (agent C) checks the full build off the PC
- you run the push and deploy, following `deploy/README.md` with the low-disk watchdog

### Wave 1 (two agents in parallel)

**Agent A: CONSOLE (honesty, labels, top bar).** Does:
- `/admin/enquiries` → redirect to Enquiries (`/crm`). The `GET /api/admin/enquiries` 503 stub is removed. `DemoEnquiriesTable.tsx` is deleted.
- The Enquiries item is removed from the sidebar.
- Content, Centres and Results merge into one "What's on the website" status page, with counts read through `src/lib/data.ts`. The old addresses redirect to it.
- A new "What's coming" page.
- The overview loses its stale "not connected" text and counts staff accounts.
- "View website" at every screen width.
- A "Find an enquiry" box and "+ Add enquiry" button in the top bar. Both open `/crm`; "+ Add enquiry" opens Agent B's form.
- Group and page labels per decision 2, in English and Hindi.
- The `docs/auth-and-portals.md` lines that still say enquiries aren't stored.

Files:
- `src/components/portal/{areas.ts, PortalShell.tsx, PortalNav.tsx, AdminViews.tsx, DemoEnquiriesTable.tsx, portal-ui.test.ts}`
- `src/app/[lang]/(portal)/admin/{page.tsx, enquiries/, content/, centres/, results/, coming/ (new)}`
- `src/app/api/admin/enquiries/route.ts`
- `src/i18n/messages/{en,hi}/portal.ts`
- `docs/auth-and-portals.md`

**Agent B: CRM BASICS (back, add, edit, erase).** Does:
- "Back" returns to the page the user came from. It uses a `back` parameter checked against an allow-list of `/crm` paths, carried from Inbox, Today, Pipeline and search.
- An "Add enquiry" drawer: walk-in, phone call, referral or other, with a consent-method choice. This adds an optional `consentMethod` to `manualLeadSchema`, stored in the submission's activity meta. When the phone number already exists, it shows "This family already exists" with "Open" and "Log a visit".
- An "Edit details" panel (existing `PATCH`).
- An "Erase" dialog for admins only, with typed confirmation and a reason (existing `POST …/erase`).
- "Rancho" shown as the label for tool `ask` in the CRM.

Files:
- `src/components/crm/{LeadDetailView.tsx, LeadActions.tsx, InboxView.tsx, TodayView.tsx, PipelineBoard.tsx, lead-forms.ts, client-kit.tsx, crm-ui.test.ts}`, plus a new `AddLeadForm.tsx`
- `src/lib/crm/{schemas.ts, capture.ts, format.ts}`, plus their tests
- `src/i18n/messages/{en,hi}/crm.ts`

**Coordinate:** the tool contact form's WP9 edits the same CRM files. Run Agent B before or after WP9, never at the same time.

### Wave 2 (one or two agents)

**Agent C: OPS & SEO ONE-LINERS (Phase 0).** Does:
- A backup script plus cron instructions: `VACUUM INTO`, encrypt, rclone off-server, retention, marker file.
- An image-pruning rule (keep 2) and a disk check.
- A GitHub Actions workflow: typecheck, tests, `next build`, and a `.next/prerender-manifest.json` check.
- `/crm` added to `PRIVATE_PATHS`.
- Unavailable tools removed from the sitemap.

Files:
- `deploy/` (a new `backup.sh` and a README section)
- `.github/workflows/ci.yml` (new)
- `src/app/robots.ts`, `src/app/sitemap.ts`

**Server steps (cron, rclone setup, first backup) are run by you or by the deploy agent with your approval.** Nothing on the shared server is changed without asking.

**Agent D: REVIEW.** Does:
- A code review of waves 1–2.
- Touched test suites only, plus typecheck.
- A CI run on the pushed `feature/admin-console-1a` branch.
- A short owner walkthrough script: "click here, then here".

### Done when

- No page in the console says "not connected".
- Every sidebar item opens a working page.
- Back always returns to where you were.
- Staff can add, edit and (admin) erase an enquiry on screen.
- A backup has been restored successfully once.
- CI builds the site off your PC.

### Next, Phase 1b

Proposed as two waves:

1. **Dashboard and targets, sources and AI-referral reports, people and site status.**
   Files: `src/components/portal/**`, a new `src/components/console/**`, `src/lib/crm/reports.ts`, new side-table schemas in `src/lib/db/features/crm.ts`.
2. **Fast call logging, follow-up rules, WhatsApp templates, extra enquiry details, duplicates, leave cover and lost review.**
   Files: `src/components/crm/**`, `src/lib/crm/**`.

---

## Appendix A: How each review point was handled

### A.1 Admissions head and counsellors' review

| # | Point | Decision | Where |
|---|---|---|---|
| A1 | Admissions work is last (phase 5) although the season has started; treat pulling it forward as decided | **Accepted** | Daily tools in 1b; admission season is Phase 2 |
| A2 | Call logging too slow: one-tap outcomes, required next follow-up, suggestions, attempt counter, "not reachable" | **Accepted** | 1b |
| A3 | Ticking a task records no outcome | **Accepted** | 1b |
| A4 | Back must return to the origin (Today, Pipeline, search, dashboard), not only keep Inbox filters | **Accepted** | 1a |
| A5 | Follow-up rhythm by stage; preferred call window; decision-maker | **Accepted** | 1b; decision 9 |
| A6 | WhatsApp templates in phase 1, en/hi/Hinglish, with slots | **Accepted** | 1b. Fact-sheet slots fill automatically from Phase 2; until then staff type them. |
| A7 | Counsellor fact sheet before any content editor | **Accepted** | First item of Phase 2 (internal, no consent or caching issues) |
| A8 | Counsellor performance is cheap now (`byCounsellor`) | **Accepted** | 1b |
| A9 | Centre-wise targets | **Accepted** | 1b; decision 8 |
| A10 | Intake session on each lead | **Accepted** | 1b (side table) |
| A11 | Duplicates and families: suggestions, merge, siblings; a walk-in of an existing lead logs a visit | **Accepted**, split | Existing-family walk-in in 1a, suggestions in 1b, merge and siblings in Phase 2 (the one-lead-per-phone rule needs a design change) |
| A12 | Missing lead fields (second phone, school, board, district, hostel, target, how heard, referred by) | **Accepted** | 1b |
| A13 | CSV import of paper leads with consent method; consent method on walk-ins | **Accepted** | Consent method in 1a; import in Phase 2 |
| A14 | Front-desk role | **Accepted** | Phase 2; decision 15 |
| A15 | Leave cover / bulk reassign needed early | **Accepted** | 1b |
| A16 | Manager review of lost leads | **Accepted** | 1b; decision 10 |
| A17 | Demo (trial) classes | **Accepted** | Phase 2, "Visits & demo classes" |
| A18 | Fees: ask what already exists; maybe only an instalments-due list | **Accepted** | Decision 13; fees module only in Phase 6, if nothing exists |
| A19 | Too much SEO/AI screen work; keep only title/description overrides, social links, GBP checklist and GBP as a source | **Partly accepted** | Dropped the score, AI-visibility log screen, llms-full.txt, per-type switches and 404 log; all SEO moved to go-live (Phase 4); GBP as a source in 1b. **Rejected** "keep only three things": you asked for SEO/SMO/AEO/GEO features, and centre pages, verified facts, redirects and the crawler policy are real value at go-live. |
| A20 | Landing-page builder and analytics too expensive; scholarship registration is the landing page that matters | **Accepted** | No generic builder; registration page in Phase 2; analytics in Phase 5 if decision 21 allows |
| A21 | Developer items in phase 1 | **Accepted, item by item** | Ctrl+K → plain search box (1a). Browser-saved views dropped; preset views instead (1b). Leaderboard moderation moved to Phase 5. Go-live checklist table → static summary (1b). Audit log **partly**: readable labels in 1b, filters in Phase 3. Tool-engagement card **partly**: off the dashboard, a small card on the Lead generation page (1b). |
| A22 | Dashboard has 11 blocks; owner wants about 5 numbers by centre | **Accepted** | 3.1 |
| A23 | Too many unfinished pages; hide them; one "What's coming" page | **Accepted** | 1a |
| A24 | Labels are jargon; plain names suggested | **Partly accepted** | Plain names for every page. **Rejected** for group headings: you used "lead generation", "admission engine" and "SEO/SMO/AEO/GEO" yourself. Decision 2 lets you choose. |
| A25 | Top bar too crowded | **Accepted** | Home, Find an enquiry, + Add enquiry, View website (language and account menu stay as today); no bell until Phase 5 |
| A26 | Scholarship test split across two phases | **Accepted** | One feature in Phase 2, from registration to the offer call |
| A27 | Role table lists unbuilt pages for counsellors | **Accepted** | The map marks phases; nothing appears in a sidebar until built |
| A28 | Phase 1 too big; smaller phase 1 suggested | **Accepted** | Merged with the engineering split into 1a and 1b; every suggested item is in 1a or 1b except the fact sheet (first in Phase 2) |
| A29 | Missing owner questions (existing software, calendar and targets, front desk, call hours, who marks lost, merge policy) | **Accepted** | Decisions 8–10, 13 and 15 |

### A.2 Engineering-feasibility review

| # | Point | Decision | Where |
|---|---|---|---|
| E1 | Build-time pages bake old content and withdrawn names; render people records, announcements and unpublish dates at request time; `revalidateTag(tag, {expire: 0})`; result cards are browser-cached for 1 h | **Accepted** (verified: the results page calls `canShowStudentName()` at build time; the card route sends `private, max-age=3600`) | 5.2 Rules 1–3; shorten card caching to 5 minutes |
| E2 | The prerender guard only tests API routes; the build can't run locally | **Accepted** (verified) | CI build in Phase 0, required before Phase 3 |
| E3 | No backups at all | **Accepted, with a correction**: manual pre-deploy copies exist on the same disk, but nothing scheduled or off-server | Phase 0; decision 3 |
| E4 | Disk headroom | **Accepted** | 5.4 and 5.8 |
| E5 | nginx 1 MB limit, sharp settings, HEIC, one resizing strategy | **Accepted** | 5.4; the nginx change comes with the media library |
| E6 | `data.ts` is not the only path to content | **Accepted** (verified: 64 files import the image lists directly) | Carousel editing deferred; 3c limited to frequently edited types |
| E7 | Code fallback brings deleted content back | **Accepted** | `seeded_at` marker per type (5.2) |
| E8 | The import script won't run as plain Node | **Accepted** | In-app "Import code baseline" action |
| E9 | Separate `data_en` / `data_hi` objects drift | **Accepted** | Shared fields stored once (5.2) |
| E10 | Server Actions are a new pattern | **Accepted** (verified: zero `"use server"` files) | Route handlers only |
| E11 | The synchronous SQLite API blocks the site | **Accepted** | Chunked jobs, in-memory counters (5.1) |
| E12 | The proxy can't see a module-level redirect version; 404 log not feasible | **Accepted** | `globalThis` registry; 404 log dropped (nginx logs later, if wanted) |
| E13 | Choosing the shell in the CRM layout conflicts; badges need Suspense; preview mode; `/api/health` is public | **Accepted** (verified: the shipped `PortalShell` picks the nav inside Suspense) | 5.1 |
| E14 | Console roles cost more than M; defer | **Accepted** | Content-editor and marketing roles deferred; front desk modelled inside CRM staff (5.5) |
| E15 | SEO is invisible in demo mode on an undecided domain | **Accepted** | Phase 4 tied to decision 17 |
| E16 | Do-now one-liners (robots `/crm`, sitemap tools) | **Accepted** | 1a (Agent C) |
| E17 | The real SEO list (titles, Organization/LocalBusiness from verified facts, GBP, Search Console on production, redirects) | **Accepted** | Phase 4 |
| E18 | FAQPage and Course rich results are overstated | **Accepted** | 3.5 promises no rich results |
| E19 | Vanity items: 0–100 score, llms.txt, AI-visibility log | **Accepted** | Score dropped (replaced by missing/too-long warnings computed from settings, no self-fetch); llms.txt kept as cheap hygiene; AI check is a monthly manual list |
| E20 | Measurable AI signals: crawler hits, AI-referred leads, a referrer host kept on erase | **Accepted** (verified: erase nulls `referrer`) | AI-referred enquiries in 1b; crawler counts in Phase 4 |
| E21 | Crawler toggles mix training and search bots; Google-Extended ≠ AI Overviews | **Accepted** | 3.5; decision 22 |
| E22 | Hindi share images may render broken in Satori | **Accepted** | English first, Hindi after a font test |
| E23 | Analytics: prefetch over-counting; the tagging beacon is a script; privacy notice | **Accepted** | 5.7; decision 21 |
| E24 | Effort re-estimates (content store, editors, `buildMetadata` across 51 files, tool gate XL, Hindi console +30–40%) | **Accepted** | Section 3 efforts; decision 5 |
| E25 | Phase 1 too big; split into 1a and 1b | **Accepted** | Section 4 |
| E26 | Proposed order: 0, 1a/1b, overlay, announcements, editors, SEO at go-live, test manager before landing pages, fees only if none exists | **Partly accepted** | The same order inside website work (3a → 3b → 3c) and SEO at go-live. **Changed:** the admission season (Phase 2) comes before website work, per the admissions review; 3a may run alongside it. |
| E27 | Missing owner decisions (existing fee system; console in Hindi; backup location and key; audit retention and `lead_view`; no signed preview links for consent-pending records; checklist source of truth) | **Accepted** | Decisions 3, 5, 13, 18 and 20 |

## Appendix B: What this plan was checked against

**Code checked on 21 October 2026, read-only:**
- `src/components/portal/{areas.ts, PortalShell.tsx}` and `src/app/[lang]/(portal)/crm/layout.tsx`: the shipped grouped nav, and "View website" still hidden below `xl`
- `src/app/[lang]/(portal)/admin/*`: the Enquiries, Content, Centres and Results pages still exist
- `src/components/crm/LeadDetailView.tsx:94`: Back is hard-wired to `/crm`
- `src/lib/crm/{types.ts, schemas.ts, reports.ts, admin.ts}`: permissions, 7 editable fields, manual-lead contract, `byCounsellor`, erase nulls `referrer`
- `src/lib/db/features/crm.ts`: stage and role CHECKs, one lead per phone
- `src/app/api/result-cards/[file]/route.ts`: one-hour browser cache
- `src/app/api/prerender-bailout.test.ts`: API routes only
- `deploy/{README.md, docker-compose.yml}`: 768 MB limit, no backup job
- `next.config.ts`: `cacheComponents: true`
- the bundled Next 16 docs for `revalidateTag(tag, { expire: 0 })` and `images.maximumDiskCacheSize`

**Releases:** `git log 828ec27..HEAD` shows one release, `6d073fe` (Rancho, homepage tools widget, admin console nav). Uncommitted Rancho/PWA work is in progress in the tree.

**Related plans:**
- the tool contact form design (work packages WP0–WP10), followed for everything about the gate
- `docs/aspire-approval-checklist.md` (content approvals)
- `docs/crm.md` (CRM contract)
