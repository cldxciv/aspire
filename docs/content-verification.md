# Content Verification Register

Nothing below may be published as fact until its status is `verified`. Owner = Aspire staff member who approves. Statuses: `verified`, `needs approval`, `placeholder`, `omit`.

Rows marked *Demo site* were imported on 2026-10-19 from Aspire's demo site `aspire2.thechunkmedia.com` (details, field mapping and file list: `docs/demo-data-import.md`). In code every such record is `status: "placeholder"` with a `sourceRef`, so it renders only in development / preview builds with a DEMO badge and stays hidden in production (D-005). "needs approval" here means Aspire must confirm the value before the record can become `published`.

| Item | Proposed copy / data | Source | Verification owner | Status | Last checked |
|---|---|---|---|---|---|
| Logo / brand files | Text logo recreated from mockup | Mockup | Aspire (brand) | placeholder | 2026-10-18 |
| Tagline | "Transforming aspirations into achievements" | Mockup | Aspire (marketing) | needs approval | 2026-10-18 |
| Hero headline | "Higher Dreams. Brighter Tomorrows." | Mockup | Aspire (marketing) | needs approval | 2026-10-18 |
| Region served | "Himachal Pradesh" | Mockup | Aspire | needs approval | 2026-10-18 |
| Phone / email / address / hours (site-wide) | `siteConfig.contact` stays `null`. Demo values (central helpdesk +91 98166 23676, admissions@aspireiitmedical.com, WhatsApp +91 98166 23676, Mon–Sat 9:00 AM – 7:00 PM IST, head-office address) live in `src/content/contact.ts`, read via `getContactDetails()` | Demo site | Aspire (admin) | needs approval | 2026-10-19 |
| Program: JEE (Main & Advanced) / NEET Pinnacle 2027 | Title, class level, cohort (SSB-Alpha), description, highlights, 5.5 h/day contact, 90 min/day doubt desk, batch 35, 2 years, offline — `src/content/programs.ts` | Demo site | Aspire (academics) | needs approval | 2026-10-19 |
| Program: Class 11 → 12 Intensive (JEE / NEET 2026) | as above: SSB-Beta, 6 h/day, 90 min/day, batch 35, 1 year, offline | Demo site | Aspire (academics) | needs approval | 2026-10-19 |
| Program: Class 12 Pass Dropper Special (Target 2026) | as above: "Repeater Residential (11 Months)" cohort, 8 h/day, 120 min/day, batch 30, 11 months, residential | Demo site | Aspire (academics) | needs approval | 2026-10-19 |
| Program: Class 8-10th Junior Foundation (Olympiad / NTSE) | as above: after-school, 2.5 h/day, 45 min/day, batch 30, 1 year, offline | Demo site | Aspire (academics) | needs approval | 2026-10-19 |
| Program primary track for dual JEE/NEET courses | Class 12 Intensive → `JEE`, Dropper Special → `NEET` (both list JEE + NEET in `tracks`). Editorial choice so each existing filter keeps one program — not a claim from Aspire | Drafted | Aspire (academics) | needs approval | 2026-10-19 |
| Program fees, batch start dates, seats left | — (demo shows fees, start dates and seat counters; not imported) | Demo site | Aspire (admissions) | omit | 2026-10-19 |
| Campuses: Shimla BCS Head Campus, Hamirpur Central Hub, Dharamshala Kangra Hub, Kullu Valley Center | Names, labels, summaries, heads, hostel / transport notes, travel times, facilities, districts served — `src/content/centres.ts` (replaces the six sample districts) | Demo site | Aspire (operations) | needs approval | 2026-10-19 |
| Campus addresses, phones, emails, hours | From the campuses page and each campus page (e.g. Hamirpur: Anu Road, Opposite PWD Colony, Hamirpur - 177005, +91 98166 23677, hamirpur@aspireiit.in). Footer addresses differ — see conflicts below | Demo site | Aspire (operations) | needs approval | 2026-10-19 |
| Campus map pins / directions links | — (demo has Google Maps links; not imported) | Demo site | Aspire (operations) | omit | 2026-10-19 |
| Programs offered per campus | — (no page states it; `programs: []`) | — | Aspire (operations) | omit | 2026-10-19 |
| Results: selections wall | 18 records (name, exam, rank/score, destination, campus); 4 featured with school + quote — `src/content/results.ts`. Consent `pending`; roll numbers not imported | Demo site | Aspire (academics) + consent records | needs approval | 2026-10-19 |
| Results: verified-rankers list | 715 entries (name, institution, exam, year, optional detail) from the demo's `/rankers.json` — `src/content/results.ts`. Consent `pending` | Demo site | Aspire (academics) + consent records | needs approval | 2026-10-19 |
| Headline stats | 16 figures in `src/content/stats.ts` (e.g. "14+ IGMC Shimla '25", "5,000+ Doctors & IITians", "3.8 : 1", "13+ years", "715 verified rankers", batch cap 35, "90 min" doubt desk, "94.8%" boarder selection rate) | Demo site | Aspire | needs approval | 2026-10-19 |
| Testimonials (parent, student) | 13 quotes in `src/content/testimonials.ts` (4 were videos on the demo; text only). Consent `pending` | Demo site | Aspire + written consent | needs approval | 2026-10-19 |
| Testimonial prompts (home "What families value") | Placeholder prompts only, DEMO-labelled | Mockup | Aspire + written consent | placeholder | 2026-10-18 |
| Institute profile: founding story, mission, founder message | Founded 2013 in Shimla by Er. Raman Sharma (B.Tech, IIT Roorkee); "Founded by IIT Roorkee alumni"; mission + founder message — `src/content/institute.ts`. Summary contains "results you can verify"; founder message promises a "published refund charter" | Demo site | Aspire (leadership) | needs approval | 2026-10-19 |
| Institute approach + pedagogy principles | 5 approach points (35-student micro-batches, resident faculty, 90-min doubt clinic, attendance SMS, faculty till 7:30 PM) + 5 of the demo's 6 principles | Demo site | Aspire (leadership) | needs approval | 2026-10-19 |
| Institutional history / milestones | 2013, 2015, 2017, 2019, 2021, 2023 (2023 without the ISO half; 2026 "admissions open" not imported) | Demo site | Aspire (leadership) | needs approval | 2026-10-19 |
| Faculty profiles | 8 people in `src/content/faculty.ts` (6 "senior resident leads" + 2 campus faculty): honorific, credentials, subject, experience, home campus, bio. No photos, ratings or achievement counters | Demo site | Aspire + each faculty member | needs approval | 2026-10-19 |
| Faculty bio claims | Bios include: "142 of her students scored 350+/360 in Biology" (NEET 2024), "260+ droppers … sub-5000 ranks", "28 National Chemistry Olympiad qualifiers", "secured AIR 312 in IIT-JEE Advanced himself", "former CSIR Research Fellow and national gold medalist", "headed organic chemistry at a leading Kota institute" | Demo site | Aspire + each faculty member | needs approval | 2026-10-19 |
| Campus heads | Shimla: Director Er. Raman Sharma; Hamirpur: Head Er. Kapil Dev (IITK); Dharamshala: Dean Dr. P. K. Thakur (MBBS); Kullu: Mentor Er. Mohit Sen | Demo site | Aspire (operations) | needs approval | 2026-10-19 |
| Hostels / residential facilities | Charter, features, girls' residency, room types (no prices), daily routine, menu highlights, per-campus blocks with capacities and warden phones — `src/content/hostels.ts` | Demo site | Aspire (operations) | needs approval | 2026-10-19 |
| Downloads list | 20 items (title, category, description, size) — `available: false`, no files in this project | Demo site | Aspire (academics) | needs approval | 2026-10-19 |
| Social media links | Facebook, Instagram, YouTube, LinkedIn, X, Telegram (`aspireiitmedical` / `aspireiitmed`) — in `src/content/institute.ts` | Demo site | Aspire (marketing) | needs approval | 2026-10-19 |
| Admissions process steps | Enquiry → Counselling → Application → Enrolment | Mockup | Aspire (admissions) | needs approval | 2026-10-18 |
| Scholarship information | Generic "to be confirmed" copy | Mockup | Aspire (admissions) | placeholder | 2026-10-18 |
| FAQ answers | `src/content/faqs.ts` | Drafted | Aspire (admissions) | placeholder | 2026-10-18 |
| Resource articles | 2 placeholder articles in `src/content/articles.ts` | Drafted | Aspire (academics) | placeholder | 2026-10-18 |
| Privacy notice / Terms | Draft structure only | Drafted | Aspire + legal | placeholder | 2026-10-18 |
| Photography (hero, classrooms, centres, faculty, students) | 12 temporary Unsplash-licensed stock photos — see `docs/asset-manifest.md`. Never presented as Aspire students, staff or centres. Replace with Aspire-owned, consented photos | Unsplash | Aspire (consented, licensed) | placeholder | 2026-10-19 |
| Home hero trust points + highlight strip | "Expert faculty & mentorship", "Personalized student support", "Local guidance across Himachal" (softened from "Local centres…"), etc. | Mockup | Aspire (marketing) | needs approval | 2026-10-19 |
| Results publishing policy copy | "Checked against Aspire's official records", correction contact line (`/results`) | Drafted | Aspire (academics) | needs approval | 2026-10-19 |
| About: approach pillars + values | Mockup phrases on `/about` | Mockup | Aspire (leadership) | needs approval | 2026-10-19 |
| Admissions step descriptions | Labelled "indicative" on `/admissions` | Mockup | Aspire (admissions) | needs approval | 2026-10-19 |
| Privacy: "Protecting the form" section | Describes current server behaviour (IP used only as in-memory rate-limit key; logs exclude personal details) — re-check whenever enquiry handling changes | Drafted from code | Aspire + legal | needs approval | 2026-10-19 |

## Demo-site import (2026-10-19)

Source: `aspire2.thechunkmedia.com` (pages listed in `docs/demo-data-import.md`). Owner for every row: Aspire. "Used" is the value now in `src/content/`; all are unverified.

### Conflicting values

| # | Item | Values on the demo (page) | Used | Status |
|---|---|---|---|---|
| C1 | Shimla address | "Near HDFC Bank Phase 3, BCS Chowk, New Shimla - 171009" (/campuses, /campuses/shimla, /contact desk) · "Near BCS Chowk, New Shimla, HP 171009" (footer, most pages) · "Near BCS Gate, New Shimla, HP - 171009" (home footer) · "Near BCS Gate, New Shimla, Himachal Pradesh 171009" (/contact "head office") | first | needs approval |
| C2 | Hamirpur address | "Anu Road, Opposite PWD Colony, Hamirpur - 177005" (/campuses) · "Anu Chowk, Near HPTU Campus, Hamirpur, HP" (home footer) | first | needs approval |
| C3 | Dharamshala address | "Civil Lines, Kachhari Road, Dharamshala - 176215" (/campuses) · "Civil Lines, Kotwali Bazaar Road, Kangra, HP" (home footer); campus tile label "Kotwali Road" | first | needs approval |
| C4 | Kullu address | "Dhalpur Green Avenue, Near Bus Stand, Kullu - 175101" (/campuses) · "Akhara Bazaar, Near Regional Hospital, Kullu, HP" (home footer) | first | needs approval |
| C5 | Campus network | 4 Himachal campuses (all main pages) · "Kota & Shimla Residential Hubs" header and footer "Kota Residential Campus, Shimla Hills Academic Hub, Chandigarh Learning Center, Delhi NCR Day Boarding" (/faculty, /admissions) | 4 HP campuses | needs approval |
| C6 | Admissions email | admissions@aspireiitmedical.com (/contact, home footer, /about) · admissions@aspireiit.org.in (footer, most pages) · admissions@aspireiitmed.edu.in (/faculty, /admissions footer); also accounts@aspireiit.in (/admissions) and campus emails `<campus>@aspireiit.in` | aspireiitmedical.com (its domain differs from the site domain aspireiit.in) | needs approval |
| C7 | Office hours | "Mon–Sat, 9:00 AM – 7:00 PM IST at every campus" (/contact FAQ, /about) · per-campus hours on campus pages (Shimla & Hamirpur Mon–Sat 8 AM – 8 PM, Sun 9 AM – 1 PM; Dharamshala Mon–Sat 8:30 AM – 7:30 PM, Sun closed; Kullu Mon–Sat 8 AM – 8 PM, Sun 10 AM – 1 PM) | central 9–7 for the helpdesk; campus pages for campuses | needs approval |
| C8 | Raman Sharma / Raman Verma | Faculty pages: Er. Raman Sharma = Founder & Physics Directorate, B.Tech IIT Roorkee, 14+ yrs; Er. Raman Verma = Mathematics, B.Tech IIT Delhi, 9+ yrs. Home demo-class cards: "Er. Raman Verma, B.Tech, IIT Bombay • 11 Yrs Exp" teaching Physics. /why-aspire: "Er. Raman Verma, Physics • B.Tech IIT Delhi • 14 Yrs Exp." Home hero: "Er. Raman Sharma (IIT Roorkee)" | faculty pages | needs approval |
| C9 | Dr. Shalini Sharma credentials | "Ex-AIIMS Resident • MBBS" (/faculty) · "MBBS · AIIMS" (/about) · "M.D. Pediatrics / AIIMS Alum" (home) · "Zoology • MD Pediatrics, Ex-IGMC" (/why-aspire) | /faculty | needs approval |
| C10 | Prof. Arun Kaundal | "M.Sc. Chemistry • Ex-Kota Lead", 12+ yrs (/faculty) · "Ex-Kota Faculty • 14 Yrs Exp" (home) · "Physical Chemistry • M.Sc Gold Medalist" (/why-aspire) | /faculty | needs approval |
| C11 | Faculty doubt-desk hours | e.g. Er. Vivek Chauhan "4:30 – 7:00 PM (Mon–Sat)" (profile) vs "4:30 – 7:30 PM (Daily)" (/faculty roster); Dr. Arvind Swaminathan "4:00 – 6:30 PM (Mon–Fri)" vs "4:30 – 7:00 PM (Tue, Thu, Sat)" | not imported | needs approval |
| C12 | Course catalogue | 4 courses on home tabs + `/courses/<slug>` (Pinnacle 2027, Class 12 Intensive, Dropper Special, Junior Foundation) · 6 batches on /courses (2-Year IIT-JEE SSB-Alpha, 2-Year NEET-UG SSB-Alpha Medical, JEE Advanced 2026, NEET Medical 2026, Dropper Target Batch, Pre-Foundation) · 3 on /why-aspire | the 4 home-tab courses | needs approval |
| C13 | Class 12 Intensive contact hours | 6 h/day (home) · 5.5 h/day (/courses/jee-advanced-2026, /courses/neet-medical-2026) | 6 h | needs approval |
| C14 | Dropper course | 8 h/day, 120 min doubt, batch 30, 11 months, residential (home, /courses/dropper-special) · 6.5 h/day, "1-on-1 Daily", 1 year, hybrid (/courses/dropper-intensive) · "5 Hrs Rapid Revision" (/why-aspire) | first | needs approval |
| C15 | Foundation batch size / mode | 30, offline (home, /courses/junior-foundation) · 40, hybrid (/courses, /courses/pre-foundation, /why-aspire; the same page also says "Batch Ceiling 30") | 30, offline | needs approval |
| C16 | Batch cap | "Batch Size strictly capped at 35" (home) · 30 for Dropper and Foundation (course FAQ) · 40 for Pre-Foundation | 35 / 30 per course | needs approval |
| C17 | Doubt-clinic timing | 90 min/day (home) · open desk 4:00 – 7:30 PM daily (/about, /faculty) · 2:30 – 4:00 PM clinic (/courses/ssb-alpha-*) · faculty on campus "till 7:30 PM" vs Prof. Kaundal "till 8:30 PM" and lab "till 8:00 PM" | as stated per item | needs approval |
| C18 | Hitesh Thakur result | "NEET 682 / 720" (home feature) · "State Rank #2" (/results); a parent quote ties "Hitesh" to an "IIT Roorkee Admit" (/faculty/er-raman-sharma) | /results | needs approval |
| C19 | Ananya Sharma score | "NEET Score 682" (/results) · "score 678" (/residential-campuses testimonial) | /results | needs approval |
| C20 | Aryan Dogra | Dharamshala campus, B.Tech CS IIT Roorkee, AIR 412 (/results) · father "Col. K.S. Dogra", "Parent · Hamirpur Central" (/campuses/hamirpur) · "Col. S. Dogra (Retd.)", son in "IIT Roorkee Mechanical" (home video) | /results | needs approval |
| C21 | Kunal | Kunal Verma, NEET 2024, AIR 689, AIIMS Bilaspur (/results) · quoted by "Mr. & Mrs. Sharma" (/about) · "Sh. Ramesh Thakur" says Kunal cracked "NEET for IGMC", NEET 2026 (/about, /campuses/shimla); "Ramesh & Sunita Thakur" are elsewhere the parents of Aarohi Thakur | /results; quotes kept with their stated context | needs approval |
| C22 | AIR 312 | Student Aryan Sharma (JEE Adv 2025) and Er. Raman Verma's own rank | both as stated | needs approval |
| C23 | Totals | "5,000+ Doctors & IITians" (home) · "715 verified rankers" (/results) · "152+ State Selections" (/why-aspire) · "14+ IGMC Shimla '25" vs 29 rankers listed "IGMC" for NEET 2025 | as stated | needs approval |
| C24 | Girls' hostels | "Separated boys and girls residential blocks across … Shimla, Hamirpur, Dharamshala and Kullu" (/residential-campuses), "boys & girls hostels" in every hub (/campuses), "hostels at every campus" (/courses) · Kullu: "Girls Residency: Not on this campus"; Dharamshala: partner hostels only (campus pages) | campus pages (blanket sentence not imported) | needs approval |
| C25 | Night study desk | "night clearing desks open till 11:15 PM" · "Night Study Pods 8:00 – 11:30 PM" | both as stated | needs approval |
| C26 | Founders | "Founded by IIT Roorkee alumni" (home, /why-aspire) · "Founded by IITians" (/about) · founded "by Er. Raman Sharma" (/about FAQ) | tagline: IIT Roorkee alumni; founder: Er. Raman Sharma | needs approval |
| C27 | Legal entity | "Aspire IIT & Medical Academy Pvt. Ltd." · "Registered under National Educational Trust" · "Government Regd." | not imported | needs approval |

### Not rendered: needs Aspire confirmation

| Claim / element (examples) | Where on the demo | Status |
|---|---|---|
| Seat and vacancy counters: "Shimla BCS: Only 8 seats vacant", "Only 4 hostel seats vacant", "8 seats left", "Live intake alert", "Booking Fast (1 Left)", "wings are filling fast", "Phase 1 admissions closing shortly" | home, /courses, course, faculty, residential pages | needs approval |
| Live demo-class schedule with seats left (dates, halls, "4 Seats Left") | home, course, campus, faculty pages | needs approval |
| "Guarantee" / "100%" claims: "100% transparent pedagogical results", "100% Audited Registry/Results", "100% verifiable wall of fame", "Zero Borrowed Toppers", "Zero paid-rank marketing", "Parent Peace of Mind Guarantee", "Zero Spam Guarantee", "100% Academic Trust Guarantee", "Micro-Cohort Integrity Guarantee", "guarantees verified merit outcomes", "100% Bio-Secure", "100% Locked", "100% Encrypted & Parent Consented", "100% cold-pressed …" | across the site | needs approval |
| Verification pillars: "Verifiable results — roll numbers behind every rank…", "Verifiable outcomes", "Every diary is cross-checked against NTA roll records" | /about, /why-aspire | needs approval |
| Superlatives: "Himachal's #1 IITian & Doctor Academy", "premier benchmark institution", "Himachal's pinnacle entrance training academy", "Most Coveted … Study Vault", "Premier Institute for JEE \| NEET \| Foundation" | home, footers, /faculty | needs approval |
| Certification / affiliation badges: ISO 9001:2015 (certified / registered / approved / accredited), "Himachal Pradesh State Merit Board Audited / Verified", "Government Regd.", "National Examination Oversight Board Recognized", "NTA Aligned", "IIT Madras JEE Advanced 2026 blueprint", "Consumer Protection Charter", "Anti-Ragging Compliant (UGC)", ISO 22000 food safety, "Certified 120-140 TDS purity", "Affiliated coaching partner for CBSE/State Board", hospital tie-ups (IGMC Shimla, Zonal Hospitals), bank / EMI partners (SBI, HDFC, ICICI, Razorpay, GrayQuest, Eduvanz, Axis Bank), "256-Bit SSL Encrypted Escrow" | headers, footers, /about, /residential-campuses, /admissions | needs approval |
| "Admissions Open 2026-27", "BOH Answer Key Live" / "BOH 2026 Live Key Enabled", "Registrations Active" badges; 2026 milestone "Admissions open for the 2026-27 session" | headers, /about | needs approval |
| "Toll-Free" label on a mobile number | home footer, /courses | needs approval |
| Fees and money terms: tuition (₹95,000–₹1,45,000/yr), hostel fees and room prices, ₹2,500 registration fee, caution deposit, EMI plans, refund table, BOH 20–100% concessions | /courses, course pages, campus pages, /admissions, /residential-campuses | needs approval |
| Batch start dates and sessions (e.g. "Starts 05 Apr 2027") | /courses, course pages | needs approval |
| Student roll numbers on result cards | /results, home, campus pages | needs approval |
| Faculty ratings ("4.96 / 5.0 (1,480 Ratings)"), achievement counters ("1,200+ IIT & NIT selections mentored", "850+", "340+", "410+", "260+", "28"), "Personal mentor to AIR 24 & AIR 68", masterclass views / ratings | /faculty, faculty and course pages | needs approval |
| Marketing stats: "MOST SELECTED BY 68% PARENTS" | /residential-campuses | needs approval |
| WhatsApp planner marketing ("12-Month Daily Study Planner PDF delivered via WhatsApp in 30 seconds", "Claim Verified 2026 Batch Plan"), prefilled WhatsApp message, cookie-banner text, Hindi toggle and Hindi slogans ("13 साल बेमिसाल", "ASPIRE फिर बना सफलता की पहचान!") | home, /why-aspire, all pages | needs approval |
| Sample checkout identity "Aarav Sharma — KYC Verified", App ID | /admissions | omit |
