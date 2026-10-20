# aspire2.thechunkmedia.com — visual content audit (2026-10-20)

Read-only audit of the owner's earlier demo site **aspire2.thechunkmedia.com** (Laravel + Livewire/Alpine.js), compared with our Next.js rebuild **aspire.thechunkmedia.com** (demo mode, `SHOW_PLACEHOLDER_CONTENT=true`). The audit covers what kinds of visuals the demo uses, where, how many, how they are presented, and which types or patterns are worth adopting.

People are referred to by role. Names appear only where the structure needs them, for example "the card prints the student's name".

## 1. Summary

1. **The demo is mostly AI-generated imagery presented as Aspire's own.** Its pool has 70 distinct image files (3.1 MB). 63 of them are AI-generated, or built from AI images, and show scenes in Aspire branding: classrooms, labs, an invented glass-tower "Aspire Academy" campus and a mountain campus, faculty portraits, students in "ASPIRE" hoodies, parents, felicitation ceremonies, a dining hall and hostel rooms. Several are "app UI" mock-ups. None carries a label saying it is generated or illustrative.
2. **Only two kinds of image show real people.**
   - **715 student result cards** (`/media/rankers/*.webp`, 15.3 MB, all WebP). Each card shows the student's photo, a college crest (NIT / MBBS / IIT / AIIMS …) and the student's name printed on a banner.
   - **4 genuine Aspire Hindi results posters** ("13 साल, बेमिसाल", "ASPIRE फिर बना सफलता की पहचान!", "NEET 2026 में ASPIRE ने फिर रचा…"). Together they show about 46 named students plus one crowd shot.
3. **AI faces sit beside real-sounding names.** There are 165 image instances in which an AI face is captioned with a person's name, covering 23 distinct names: toppers on the "selections wall", all 8 faculty members, and parents. Four AI faces are each reused for 2–3 *different* named people, mostly "toppers" with different ranks. One AI faculty image is also reused as a NEET student. This happens directly under the claim "Every candidate photograph below matches verified NTA roll credentials".
4. **The real posters are misused as filler.** They appear as the hero background and slides and as thumbnails labelled "35-Student Micro-Cohort in Session", "Aspire IIT interactive smart lecture classroom" and so on. Their alt text describes classrooms, not the poster.
5. **The demo has many visual types but a small image area.** Its non-legal pages average **11 %** image area in the content column at 1440 px (home 25 %, results 24 %, course pages 6–9 %). Most images are ≤ 512 px JPEGs shown small. A few are upscaled, including the 512 px poster used as the 1440 px hero background. There is no `srcset`, no `<picture>` and no WebP, except the result cards.
6. **Our site has a much larger image area but fewer types.** Our 15 non-legal pages average **40 %** (home 39 %, results 23 %). The images are almost entirely labelled Unsplash stock (109 of 120 visible stock images carry an "illustrative" label) and the same 715 result cards (DEMO badge), all served as WebP with `srcset`.
7. **Every demo video is a placeholder.** There are about 20 video slots (lecture samples, parent and student testimonials, recordings), but they use only **2 YouTube IDs, which appear to be generic sample videos** (`aqz-KE-bpKQ` is the well-known "Big Buck Bunny" demo; `ysz5S6PUM-U` is a sample clip, not Aspire content). The thumbnails are AI images or UI mock-ups with play overlays. The player is a click-to-load `youtube-nocookie` modal, which is a good pattern even though the content is fake.
8. **Gaps on our side (visual types the demo has and we don't):**
   - faculty photos and a faculty page with profiles;
   - classroom, lab, event and celebration photos;
   - real campus and hostel photos (ours are stock, or AI centre illustrations labelled as illustrations);
   - topper posters and banners;
   - video testimonials and lecture samples;
   - per-campus Google Maps embeds;
   - a per-campus photo gallery;
   - branded blog covers.
   
   **What the demo lacks and we have:** an image-led results archive, labelled imagery, responsive images, an SVG map and an SVG chart.
9. **Recommendation:** adopt the demo's *patterns* (exam filter chips and "show more" on results, per-program and per-centre selections, a click-to-load video modal, a campus gallery, a room-tier selector, a map embed) and its *real* asset types (result cards, Aspire's own posters). Ask Aspire for real faculty, campus, hostel and event photos and real videos. Do **not** reuse any demo `figma/` image: they are AI-generated with unknown generator terms, depict non-existent people and buildings, and some are tied to real names.

## 2. Scope and method

- **Pages:**
  - aspire2: all **53 English URLs** from `sitemap.xml` (5 sub-sitemaps: 21 pages, 8 blog posts, 8 faculty, 4 campuses, 13 courses). Nav and footer links add no further pages. Hindi `/hi/*` mirrors were skipped.
  - Ours: all **17 English URLs** in its sitemap.
- **Data endpoint:** `GET /rankers.json?exam=&offset=&limit=&source=ranker-archive` (cap 48 per call; 15 sequential calls; 715 items with `img, w, h, alt, label, name, institute, detail`). There is no separate gallery or media endpoint. Downloads are PDFs under `/media/downloads/`, and blog Open Graph images are `/media/blog/*-og.jpg`.
- **Capture:** headless Chrome over CDP with its own temporary profile, read-only. It navigated, scrolled the full page to trigger lazy loading and waited for images. Every browser request passed through a CDP Fetch gate allowing **at most 2 requests in flight**, with 1–1.5 s between pages. The two sites share one VPS (69.62.76.109), so they were crawled one after the other. No clicks, forms or logins.
  - Per page, the capture took every `<img>` (src, `currentSrc`, `srcset`, alt, natural and rendered size, hidden state, overflow clip), CSS `background-image` (element and pseudo-elements), `<svg>`, `<video>`, `<iframe>`, `<canvas>`, Material Symbols glyphs, section order with headings, and interaction hints (Alpine `x-show` tabs and sliders, `@click` handlers, CSS animations, horizontal scroll).
- **Image share:** the union of visible image boxes (img plus background images, clipped to overflow ancestors), sampled on a 12 px grid over `<main>`. It is reported against full width × main height and against the content column (1280 px on both sites). This follows `uplift-a/measure.mjs`.
- **Bytes and dimensions:**
  - Pool images: each distinct non-ranker file was fetched once, one at a time, and measured with `sharp` (74 files, 3.27 MB).
  - Result cards: HEAD requests one at a time (714 of 715 answered; one network error).
  - Our site: transfer sizes come from the crawl.
- **Classification:** done by eye from labelled contact sheets of every pool file (`crops/sheet-*.jpg`). The mapping is in `data/figma-map.json`.
- **Screenshots:** full-page screenshots were taken at 1440 for all 70 pages and at 375 for home and results on both sites, and reviewed for this report. They were then **deleted by the lead to free disk space** (drive C: was nearly full), so none are kept. The 37 sample images and 12 contact sheets are kept.
- **Limits:**
  - Counts are of the initial state: first tab, first slide, before "show more". Hidden tab and slide images are counted as "in DOM".
  - Hero slides change on a timer.
  - The demo's cookie banner overlapped the first fold in the screenshots.
  - The 375 px measurements cover home and results only.

## 3. Visual-type catalogue (aspire2)

All sample files are in the scratch folder `…\scratchpad\aspire2-audit\samples\`; `figma__home__raw_1.jpg` is `/media/figma/home/raw_1.jpg`. Contact sheets of every file are in `…\aspire2-audit\crops\sheet-<folder>.jpg`.

| Type (code) | Distinct files | What it shows | Real or AI | Named people? | Where used | Samples |
|---|---:|---|---|---|---|---|
| Student result card (RC) | 715 (15.3 MB webp, median 17 KB, 317–640 px wide; 658 newer `asp-*` cards with photo, crest and name banner, 57 older `live-*` cards with yellow arc) | One student, college crest, name banner | **Real students** | Yes: name on the card, in the caption and in the alt ("… — verified result card") | Home, results, 8 course pages | `rankers__asp-137-7.webp`, `rankers__asp-277-herishab.webp`, `rankers__live-183-…webp`, `rankers__live-184-…webp` |
| Topper poster / banner (TP) | 4 (210 KB, 512×73…512×284) | Aspire's Hindi results posters: rows of selected students with names and college crests; one thin "13 साल, बेमिसाल" banner | **Real** (Aspire marketing artwork) | Yes: about 46 students, names printed small | Home only: hero background, 3-slide hero carousel, batch tabs, demo-class cards, hostel tiles | `figma__home__raw_1.jpg` … `raw_4.jpg` |
| Student portrait (SP) | 7 (47 KB, 64–344 px) | Smiling students in "ASPIRE" hoodies or T-shirts, one holding a certificate | AI | Yes: captioned as named toppers with ranks | Results hero, selections walls (results, why-aspire, campuses), home "Audited results" | `figma__master__raw_11.jpg`, `figma__master__raw_2.jpg`, `figma__batch-finder__raw_5.jpg` |
| Classroom / lab / exam hall / group (CL) | 16 (841 KB, all 512×279) | Lecture halls, smart boards, labs, CBT hall, doubt desk | AI | No | Every course page (4 each), why-aspire, demo-class, student-portal, campuses, BOH | `figma__master__raw_1.jpg`, `figma__master__raw_13.jpg`, `figma__demo__raw_1.jpg`…`raw_3.jpg`, `figma__lms__raw_2.jpg`, `figma__boh__raw_2.jpg`, `figma__admissions__raw_1.jpg` |
| Event / celebration (EV) | 2 (+1 "video thumbnail" used as an event photo) | "Brain of Himachal felicitation ceremony", award ceremony | AI | Implied | BOH scholarship; why-aspire "Annual Merit Conclave" | `figma__boh__raw_1.jpg` |
| Campus / building (CA) | 3 (176 KB) | Glass tower "Aspire Academy", mountain campus, reception interior in a UI frame | AI (buildings don't exist) | No | Campus cards (home, campuses, about, why-aspire), campus heroes | `figma__master__raw_14.jpg`, `figma__master__raw_16.jpg`, `figma__master__raw_4.jpg` |
| Hostel (HO) | 2 (114 KB) | Dining hall, two-bed study room | AI | No | Residential page (room tiers, day-in-life collage), campus galleries | `figma__residential__raw_2.jpg`, `figma__residential__raw_3.jpg` |
| Faculty photo (FA) | 14: 12 in `figma/faculty`, 2 in `figma/batch-finder` (380 KB; 512×279 scenes plus 96–172 px headshots) | Teachers at boards and labs, headshots | AI | **Yes**: all 8 faculty names, with ratings and credentials | Faculty index and 8 profiles, campus pages, course pages (3 each), about, blog author avatars, home demo-class cards | `figma__faculty__raw_1.jpg`, `raw_4.jpg`, `raw_7.jpg`, `raw_11.jpg` |
| Testimonial portrait / video poster (TE) | 5 (138 KB) | Parent couples, an army officer (SSB testimonial), a father and son, a counselling scene | AI | Yes: parent names | Demo-class, campus "Families" sections, batch-finder, blog | `figma__demo__parents_thakur.jpg` (others: sheets `crops/sheet-figma-demo.jpg`, `crops/sheet-figma-batch-finder.jpg`) |
| Video thumbnail (VT) | 2 (88 KB) | YouTube-style thumbnails with big text (a "neet ranker" interview, a "Kangra to AIIMS" story) | AI | Yes, as text in the image | Why-aspire video testimonials and "merit conclave", faculty profile, Dharamshala | — (sheet `crops/sheet-figma-master.jpg`: `raw_15`, `raw_8`) |
| UI mock-up (UI) | 4 (157 KB) | Screenshots of an imaginary LMS or app containing AI photos | AI | Sometimes | Faculty "Inspect the quality of classroom delivery" video cards, testimonials | sheet `crops/sheet-figma-faculty.jpg` (`raw_9`, `raw_14`) |
| Map (MP) | 1 PNG (Google Maps screenshot, 512×512, 144 KB) + 5 Google Maps iframes | Shimla area map; live embeds per campus and on contact | Real map tiles | — | Residential (image); 4 campus pages and contact (iframe) | `figma__residential__raw_1.png` |
| Blog cover (BC) | 8 (632 KB, 1200×630) + 8 `-og.jpg` | AI pool image + dark overlay + "Aspire IIT & Medical · Blog" strip | AI-derived | No | Blog index, posts, Open Graph | `blog__dropper-year-strategy-jee-neet.jpg`, `blog__neet-biology-ncert-line-by-line-method.jpg` |
| Aspire logo (LG) | 1 SVG + favicons + `og-default.png` | Wordmark | — | — | Header, footer | `brand__logo.svg`, `brand__og-default.png` |
| Icons | 3,102 visible Material Symbols glyphs (about 59 per page) + about 8 inline SVGs per page | UI icons (`location_on`, `bed`, `groups`, …) | — | — | Everywhere | — |
| Video | ~20 slots, 2 YouTube IDs (generic sample videos) | Lecture samples, parent and student testimonials, recordings | Placeholder | — | Home, why-aspire, faculty and profiles, demo-class, student-portal | — |
| Downloads | 23 PDF cards (18 resources, 4 BOH, 1 batch-finder) | Icon cards, **no document thumbnails** | — | — | Resources, BOH, batch-finder | — |
| Charts / infographics | Stat counters (text) and one small SVG on student-portal | No real charts | — | — | — | — |
| Landscape / nature, stock photos | **0** | — | — | — | — | — |

There are no illustrations other than the AI photos above, no `<video>` elements, no `<canvas>` and no lightbox.

## 4. Presentation patterns (aspire2)

- **Hero slider (home):** a dark 736 px band whose background is the real NEET poster (512 px upscaled to 1440 px under a gradient). It contains a 3-slide carousel (`x-data { i, n: 3, timer }`, auto-advance, prev/next arrows). Each slide is a poster crop with a caption naming a faculty member, and the lead form sits beside it.
- **Tabs with images:**
  - home "Which batch" has 4 tabs × 2 thumbnails;
  - home "Experience the faculty" has 4 campus tabs × 3 class cards (thumbnail + 44 px faculty avatar + "seats left");
  - residential has a room-tier selector (3 tiers, photo per tier).
- **Result-card grid:** the "Results spotlight" (home 4×2, results 4×3) has 278 px square cards with filter chips (All / JEE / NEET) and "Show more rankers", which adds 8 at a time from `rankers.json`. Each card shows the crest, the name, the college and "Exam Year · Verified".
- **Result cards as round avatars:** course pages show "Recent selections from this track" as 4–8 small circles, each with name and college.
- **Selections wall:** results, why-aspire and campus pages have 12 of 18 cards visible, plus "Show more results (6 more)". Each card has a 56–72 px round avatar (AI portrait, or an initial letter when there is no photo), rank badges ("AIR 312", "675 / 720", "State Rank #2"), the allotted college, a roll-number line and the campus, together with search, year and campus filters and a "Download Merit Gazette PDF" button.
- **Campus gallery:** campus pages have a hero photo plus a strip of 6 thumbnails; clicking a thumbnail switches the hero (`active = n`). There is no lightbox, and the gallery mixes campus, classroom and hostel images.
- **Card grids with photos:** these are used for campuses (4), faculty (6 with ratings), course catalogue (7), "other batches" (3) and blog (8). Images are 16:9 or 3:2 crops, about 294–393 px wide.
- **Video cards:** a thumbnail (or a dark card) with a play button and duration/views opens a modal that injects a `youtube-nocookie` iframe on click (`x-data { playing: null }`).
- **Collages:** the residential "Day in the life" (3 photos) and the why-aspire masterclass mosaic (1 wide + 3 small).
- **Map:** a Google Maps iframe (16:9, lazy) plus an "Open in Google Maps" link on each campus page and on contact. The residential page uses a static map screenshot.
- **No marquees or tickers, no lightbox, no masonry, no counters next to images.** Stats are text tiles.
- **Header:** two different header and nav variants exist across pages (home-style vs "Step N of 8" journey style). There is also a floating WhatsApp button and a call button.
- **Image tech:**
  - 554 `<img>` tags on 53 pages, of which 489 are visible in the initial state.
  - 500 use `loading="lazy"`, all have width and height attributes, and none use `srcset` or `<picture>`.
  - Delivered formats: 365 JPEG, 64 WebP, 65 SVG and 1 PNG requests.
  - 21 visible instances are upscaled beyond their natural width.
- **Alt text:** 443 tags have alt text and 111 have an empty alt; none is missing. Median alt length is 32 characters. Alt quality is mixed:
  - **misleading**: posters described as classrooms; AI faces given real names and "verified result card";
  - **duplicated**: the same image carries different alts on different pages.

## 5. Page-by-page inventory (aspire2, 1440 px)

Codes: RC result card · TP topper poster · SP student portrait (AI) · CL classroom/lab (AI) · EV event (AI) · CA campus (AI) · HO hostel (AI) · FA faculty (AI) · TE testimonial (AI) · VT video thumbnail (AI) · UI app mock-up (AI) · BC blog cover · MP map. "9/20" = visible in the initial state / present in the DOM (other tabs, slides, templates). Image share = image area ÷ (full width × main height) / ÷ (1280 px content column × main height). Icons = inline SVG + Material Symbols glyphs (visible).

| Page | Height px | Image share | Visuals by type | Distinct files | Icons |
|---|---:|---:|---|---:|---:|
| `/` | 7306 | 23.6% / 25.3% | TP 9/20, FA 3/10, CA 3/7, CL 1/3, SP 4, RC 8/16 | 25 | 8 + 91 |
| `/why-aspire` | 5423 | 21.1% / 24.1% | CL 7, UI 1, VT 3, FA 3, SP 4, CA 3 | 18 | 8 + 61 |
| `/batch-finder` | 4398 | 11.7% / 13.2% | CL 2, SP 7, FA 2, TE 4 | 8 | 8 + 59 |
| `/demo-class` | 4516 | 7.9% / 9% | CL 3, TE 2 | 5 | 8 + 77 |
| `/residential-campuses` | 5211 | 15.9% / 18.1% | HO 10/11, MP 2 | 3 | 8 + 61 |
| `/student-portal` | 3374 | 7.2% / 8% | SP 1, CL 4 | 5 | 10 + 49 |
| `/boh-scholarship` | 4040 | 7.4% / 8.3% | EV 2, CL 2 | 4 | 8 + 54 |
| `/admissions` | 3650 | 4.2% / 4.6% | CL 1 | 1 | 8 + 46 |
| `/faculty` | 5785 | 12.3% / 13.6% | FA 12, UI 2 | 14 | 8 + 70 |
| `/about` | 9571 | 9.9% / 11.1% | FA 7, CA 3, CL 1, UI 1, TE 2 | 14 | 8 + 91 |
| `/courses` | 3265 | 19.8% / 22% | CL 7 | 6 | 8 + 26 |
| `/contact` | 4412 | 5.3% / 5.9% | MP 1 (iframe) | 1 | 8 + 53 |
| `/campuses` | 2683 | 16.4% / 18.4% | CA 4, CL 1, HO 2 | 6 | 8 + 42 |
| `/faqs` | 5368 | 0% | — | 0 | 8 + 69 |
| `/results` | 4567 | 21.1% / 23.7% | SP 8/9, RC 12/24, FA 1/4, TE 0/2 | 21 | 8 + 60 |
| `/resources` | 4773 | 2.7% / 3% | CL 1 (+18 PDF icon cards) | 1 | 8 + 139 |
| `/privacy-policy`, `/terms`, `/refund-policy` | 3904–5097 | 0% | — | 0 | 8 + 16–22 |
| `/blog` | 4282 | 20.1% / 22.1% | BC 8, FA 6, TE 2 | 12 | 8 + 31 |
| 8 × `/blog/<post>` | 8263–9839 | 7.3–8.9% / 8.1–9.8% | BC 4, FA 3–5 (author/related), TE 0–2 | 7–8 | 8 + 47–49 |
| `/faculty/er-neeraj-thakur`, `/faculty/dr-priya-chauhan` | 3193 | 8.5% / 9.8% | FA 3 | 3 | 8 + 35–36 |
| `/faculty/er-raman-sharma` | 4847 | 9.1% / 10.2% | FA 5, UI 1, TE 2 | 8 | 8 + 61 |
| `/faculty/dr-shalini-sharma` | 4939 | 10.5% / 11.9% | FA 5, UI 1, CL 1, VT 1 | 8 | 8 + 56 |
| `/faculty/prof-arun-kaundal` | 4930 | 9.2% / 10.3% | FA 6 | 6 | 8 + 50 |
| `/faculty/er-raman-verma` | 4443 | 12.2% / 13.8% | FA 5, CL 1 | 5 | 8 + 46 |
| `/faculty/er-vivek-chauhan` | 4241 | 11.1% / 12.4% | FA 5 | 4 | 8 + 45 |
| `/faculty/dr-arvind-swaminathan` | 4241 | 12.8% / 14.4% | FA 5, CL 1 | 5 | 8 + 46 |
| `/campuses/shimla` | 6745 | 12.1% / 13.6% | CA 4, CL 4/7, HO 2/4, FA 5, SP 5, TE 3, UI 1, MP 1 | 21 | 8 + 98 |
| `/campuses/hamirpur` | 6418 | 9.9% / 11.1% | CA 4, CL 3/5, HO 1/2, FA 3, SP 1, TE 2, MP 1 | 13 | 8 + 82 |
| `/campuses/dharamshala` | 6392 | 9.9% / 11.1% | CA 4, CL 4/7, FA 2, SP 1, VT 1, MP 1 | 12 | 8 + 77 |
| `/campuses/kullu` | 5927 | 10.7% / 12% | CA 3, CL 3/4, HO 2/4, FA 1, SP 1, MP 1 | 10 | 8 + 70 |
| `/courses/jee-neet-pinnacle-2027`, `class-12-intensive`, `dropper-special`, `dual-jee-neet`, `dropper-intensive` | 5475–7478 | 5.4–7.7% / 6–8.6% | CL 4, RC 4, FA 3 | 10–11 | 8 + 53–89 |
| `/courses/ssb-alpha`, `ssb-alpha-engineering`, `jee-advanced-2026` | 5939–7724 | 5.3–7.1% / 5.9–7.9% | CL 4, RC 8, FA 3 | 14–15 | 8 + 54–86 |
| `/courses/ssb-alpha-medical`, `neet-medical-2026` | 7253–7351 | 5.3–5.5% / 5.9–6.1% | CL 4, SP 3, FA 4 | 11 | 8 + 91–92 |
| `/courses/brain-of-himachal-foundation`, `junior-foundation`, `pre-foundation` | 4810–6509 | 5.8–8.4% / 6.5–9.4% | CL 4, FA 1–3 | 5–7 | 8 + 49–71 |

**Site averages (53 pages):** 9.3 visible images per page; image share 11.0 % of the content column on non-legal pages (9.9 % full width); average page height 5,806 px.
**At 375 px:** home is 16,316 px tall with 23.6 % image share and 28 visible images; results is 7,988 px with 18.3 % and 21.

### Section order (visual types per section, image share of that section)

- **`/`:**
  1. Hero: TP slider and TP background (100 %)
  2. Which batch: TP thumbnails in tabs, parent quote card (7 %)
  3. Experience the faculty: class cards with TP/CL/CA thumbnails + FA avatars in campus tabs; PDF vault (11 %)
  4. Audited results: 4 SP avatars + 2 video testimonial cards (2 %)
  5. Results spotlight: RC 4×2 + filters (33 %)
  6. 4 regional centres: CA cards + hostel thumbnails (15 %)
  7. CTA band (0 %)
- **`/results`:**
  1. Hero with a single SP portrait (16 %)
  2. Results spotlight: RC 4×3 + filters + show more (40 %)
  3. Selections wall: 12 cards with SP/FA avatars, badges, search and filters (2 %)
- **`/why-aspire`:**
  1. Hero: CL photo in the lead card (14 %)
  2. Daily regimen: large CL photo (27 %)
  3. Faculty and masterclasses: wide "merit conclave" VT + 3 CL + FA avatars (39 %)
  4. Audited ranks: SP avatars + 2 VT video cards (9 %)
  5. Campuses: CA cards (22 %)
- **`/faculty`:**
  1. Hero: FA lecture still with a "LIVE" badge (15 %)
  2. 6 faculty cards with FA photo, rating, credentials (24 %)
  3. Doubt-desk roster table, no images
  4. "Inspect the quality of classroom delivery": 3 UI/FA video cards (21 %)
  5. Parent and ranker quotes with FA avatars
  6. Consultation form
- **`/faculty/<slug>`:**
  1. Hero portrait (20 %)
  2. About
  3. "Watch X teach": UI video card
  4. Testimonials
  5. Demo-class slots
  6. More leads: 3 FA cards (24 %)
- **`/campuses/shimla`:**
  1. Hero gallery: 6 photos + 6 thumbnails (27 %)
  2. Facilities (icons)
  3. Hostel charter (icons)
  4. Faculty: 3 FA cards (24 %)
  5. Selections: 8 SP avatars (4 %)
  6. Families: 40 px TE avatars
  7. Directions: Google Maps iframe + demo-class list (13 %)
  8. Other centres: 3 CA cards (28 %)
- **`/residential-campuses`:**
  1. Hero: 3 thumbnails (hostel, map, classroom) + inspection form (7 %)
  2. Room-tier selector: large HO photo + 3 tier thumbnails (25 %)
  3. Day in the life: HO dining collage (22 %)
  4. Girls residency: HO photo + 4-campus directory + map screenshot (14 %)
  5. Parent quote band
- **`/about`:**
  1. Hero: FA portrait (17 %)
  2. Mission
  3. Teaching approach (text)
  4. 13-year timeline (text)
  5. Founder quote: FA (24 %)
  6. Leadership: 4 FA (29 %)
  7. 4 campuses: CA (18 %)
  8. Registrations (text)
  9. Parent and ranker quotes
  10. Key facts
- **`/courses/<slug>`:**
  1. Hero: CL photo + price card (19 %)
  2. Regimen
  3. Inclusions and subject plan (icons)
  4. Fee plans (text)
  5. Recent selections: 4–8 RC as round avatars (2 %)
  6. Faculty: 3 FA (6 %)
  7. FAQ + form
  8. Other batches: 3 CL cards (23 %)
- **`/demo-class`:** hero and vault are text and icons; "Sit inside an actual lecture": 3 CL video cards (22 %); parent endorsements: 2 TE phone-format video cards.
- **`/boh-scholarship`:** brackets beside an EV felicitation photo; 12 district centres beside CL exam-hall photos + EV; 4 PDF downloads.
- **`/student-portal`:** a dashboard mock-up with an SP avatar and a small SVG chart; "Digital vault and smartboard recordings": 4 CL video thumbnails (21 %).
- **`/contact`:** desks (text); Google Maps iframe; FAQ. **`/resources`:** 1 CL hero image; 18 PDF cards with icons only.

## 6. Totals (aspire2)

| Type | Files | KB | Format | Typical size |
|---|---:|---:|---|---|
| Result cards (real) | 715 | 15,253 | WebP | 326×330, 640×713–775, 475×446 (median width 475) |
| Classroom / lab (AI) | 16 | 841 | JPEG | 512×279 |
| Blog covers (AI-derived) | 8 | 632 | JPEG | 1200×630 |
| Faculty (AI) | 14 | 380 | JPEG | 512×279; 96×172 headshots |
| Topper posters (real) | 4 | 210 | JPEG | 512×73–284 |
| Campus (AI) | 3 | 176 | JPEG | 512×279 |
| UI mock-ups (AI) | 4 | 157 | JPEG | 512×279, 286×512 |
| Map screenshot | 1 | 144 | PNG | 512×512 |
| Event (AI) | 2 | 143 | JPEG | 512×279 |
| Testimonial (AI) | 5 | 138 | JPEG | 147×80 … 286×512 |
| Hostel (AI) | 2 | 114 | JPEG | 512×279 |
| Video thumbnails (AI) | 2 | 88 | JPEG | 512×286, 458×256 |
| Student portraits (AI) | 7 | 47 | JPEG | 64–344 px |
| Logo / Open Graph | 2 | 40 | SVG, PNG | 176×44, 1200×630 |
| **Total** | **785** | **18,363** | 715 WebP, 67 JPEG, 2 PNG, 1 SVG | — |

The 70-file pool (non-ranker) totals 3,110 KB, an average of 44 KB per file. Only 12 distinct result cards are visible on the crawled pages in their initial state, and the rest load via "Show more".

**Identifiable people:**

- **Real students:** 715 result cards (about 708–712 distinct students, see `docs/demo-data-import.md`), each **named** on the card, in the caption and in the alt; plus about 46 students on the 4 posters, named in the artwork.
- **Not real:** every faculty, parent, "topper on the selections wall" and classroom face is AI-generated. In 165 image instances an AI face is captioned with one of 23 person names, and 4 AI faces are each used for 2–3 different named people.
- No real faculty or campus photograph exists anywhere on the demo.

## 7. Comparison with our site (aspire.thechunkmedia.com, demo mode)

Our codes: RC result card (demo badge) · ST Unsplash stock (labelled) · LS landscape (home hero only) · AIp AI students "postcard" (labelled "Illustration") · IL small AI illustrations (journey/goal/trophy) · CAi AI centre illustrations (labelled "Illustrative image") · plus an SVG Himachal map with pins and an SVG bar chart.

| Page | Height px | Image share | Visuals by type (visible[/in DOM]) | Distinct files | Icons (inline SVG) |
|---|---:|---:|---|---:|---:|
| `/` | 7605 | 36.6% / 39.3% | LS 1, AIp 1, RC 22/62, ST 10, CAi 2, IL 1, SVG map + SVG bar chart | 47 | 85 |
| `/about` | 7489 | 35.7% / 42.9% | ST 12, IL 1, RC 24 | 37 | 28 |
| `/programs` | 4024 | 39.1% / 44.2% | ST 10, RC 8/15 | 18 | 37 |
| `/programs/{jee-neet-pinnacle-2027, class-12-intensive, dropper-special}` | ~3644 | 36.4% / 38.5% | ST 6, RC 8/15 | 14 | 32 |
| `/programs/junior-foundation` | 3657 | 38.5% / 40.1% | ST 7 (no cards for Foundation) | 7 | 30 |
| `/results` | 9360 | 20.1% / 22.7% | RC 23/57, ST 7, IL 1 | 41 | 102 |
| `/centres` | 6265 | 39.4% / 44.4% | ST 7, CAi 3, SVG map | 10 | 83 |
| `/hostels` | 8854 | 37.3% / 42.1% | ST 14 | 14 | 59 |
| `/admissions` | 6115 | 38% / 45.6% | ST 6, IL 4, RC 12 | 22 | 34 |
| `/resources` | 4730 | 37.9% / 45.5% | ST 6, RC 6/32 | 22 | 49 |
| `/resources/<article>` (2) | ~2240 | 32–34% / 38.5–40.7% | ST 4 | 4 | 22 |
| `/contact` | 4979 | 37% / 44.4% | ST 8 | 8 | 54 |
| `/privacy`, `/terms` | 5086 / 2980 | 9.6–17.8% / 11.5–20.4% | ST 3 | 3 | 20 |

**Site averages (17 pages):** 14.9 visible images per page; image share 40.4 % of the content column on non-legal pages (35.7 % full width); average height 5,091 px.
**At 375 px:** home is 12,134 px with 30.9 % image share and 31 visible images; results is 13,846 px with 10.3 % and 20.
**Files seen:** 81 distinct raster files (33 result-card files in this crawl, 27 stock photos, 10 raster icons, 5 illustrations, 4 centre illustrations, 1 landscape, 1 hero illustration). All are delivered as **WebP**, 164 of 411 `<img>` tags have `srcset` (result cards are `unoptimized` by design), 8 small instances are upscaled, and alt text has a median length of 51 characters.
**People:** the only real people are the result-card students (119 visible instances, with a DEMO badge detected near 95 of them; name shown only via `canShowStudentName()`). Stock people are never named, and the hero students are labelled "Illustration".

### Equivalent pages, side by side (content-column image share; main visual types)

| Topic | aspire2 | Ours |
|---|---|---|
| Home | 25 %: poster hero slider, tabbed thumbnails, AI faculty avatars, 4 AI topper avatars, 2 video cards, RC 4×2 + filters, AI campus cards | 39 %: landscape + AI-students hero, 2 RC mosaics (3×3 + "See all" tile), stock bands, SVG map + centre illustration, SVG bar chart, RC marquee in the CTA |
| Results | 24 %: AI portrait hero, RC 4×3 + exam filter + show more, selections wall with avatars + badges + search/year/campus filters | 23 %: RC marquee, stories with stock + trophy illustration, archive (text cards + stock), rankers list with an RC grid of 25 + table |
| Programs index | 22 %: 7 AI classroom cards | 44 %: 10 stock + RC mosaic |
| Program detail | 6–9 %: AI classroom hero, 4–8 RC as round avatars, 3 AI faculty, 3 batch cards | 38–40 %: 6–7 stock + RC mosaic (Foundation: stock only) |
| Centres | 18 % index + 11–14 % per campus: AI campus photos, 6-photo gallery, faculty, selections, map iframe | 44 %: labelled region stock + 3 labelled centre illustrations + SVG map; **no centre detail pages** |
| Hostels | 18 %: room-tier selector, dining collage, map screenshot (all AI hostel images) | 42 %: 14 labelled stock (dorm, thali, desk lamp, study room) |
| About / why | 11 % about, 24 % why-aspire: AI faculty, campus, classroom, merit-conclave event photo | 43 %: 12 stock + 2 RC mosaics |
| Faculty | 14 % index + 8 profiles: 6–8 AI portraits, lecture-video cards, roster | **No page** (faculty data imported, no photos) |
| Admissions | 5 %: 1 AI lab photo | 46 %: stock + 4 step illustrations + RC mosaic |
| Resources / blog | 3 % resources (PDF icon cards), 22 % blog index, ~9 % posts (branded AI covers) | 46 % resources (stock + RC marquee), 2 articles at ~40 % (stock) |
| Contact | 6 %: Google Maps iframe only | 44 %: 8 stock |
| Demo class, BOH scholarship, student portal, batch finder | 8–13 %: AI classroom, event and testimonial images, video cards | No equivalent pages (BOH is folded into admissions as "Scholarships") |

## 8. Gap list

**Visual types the demo uses that we don't:**

1. Faculty photos and a faculty section: index cards with photo, credentials and rating, profile pages, faculty avatars on program and centre pages. (All AI on the demo.)
2. Classroom, lab and exam-hall photos tied to Aspire: Aspire-branded boards and hoodies. (AI on the demo; our equivalents are generic labelled stock.)
3. Event and celebration photos: felicitation ceremony, merit conclave. (AI on the demo.)
4. Campus and building photos with a **per-campus gallery** (hero + thumbnail switcher). We have labelled AI centre illustrations and no centre detail pages.
5. Hostel photos by room tier and a "day in the life" collage. We use stock.
6. **Topper posters and banners**: real Aspire artwork, Hindi headlines.
7. **Video**: lecture samples, parent and student testimonials, recorded classes. All are placeholders on the demo, but the card + click-to-load modal pattern exists.
8. **Map embeds**: a Google Maps iframe per campus + "Open in Google Maps". We have an SVG overview map.
9. Branded blog and article covers (1200×630 with a brand strip) for listing cards and Open Graph.
10. Results as **round avatars inside small "selection" cards** with rank badges, and per-program "recent selections from this track".

**Things we do differently (and mostly better):**

- **Image area:** about 40 % vs about 11 %. Our pages are image-rich. The demo has many types but shows them small.
- **Result cards:** we use mosaics (2×3 … 6×2 with a "See all results" tile), a marquee, and an archive grid of 25 beside a table. The demo uses a 4×N grid with exam filters and "Show more", plus round avatars on course pages.
- **Labelling and honesty:** stock is labelled "illustrative", AI imagery is labelled "Illustration" or "Illustrative image", result cards carry DEMO badges, and names are consent-gated. The demo labels nothing and claims "verified" and "audited" next to AI faces.
- **Stock photos and landscapes:** we use Unsplash stock and one landscape in the home hero. The demo uses no stock and no landscapes, only AI images and real posters and cards.
- **Data visuals:** we have an SVG bar chart of results by year and an SVG centre map. The demo has neither (only text stat tiles).
- **Delivery:** we serve WebP with `srcset` through `next/image`; the demo serves fixed 512 px JPEGs, some upscaled.
- **Consistency:** one header. The demo has two header and nav variants.

## 9. Prioritised recommendations

| # | Adopt | Why | Conditions, consent and licensing |
|---|---|---|---|
| 1 | **Results page patterns from the demo:** exam filter chips (All / JEE / NEET) + year filter + "Show more" paging on the result-card grid; "Recent selections from this track" (filtered cards) on each program page; a per-centre selection strip once records carry a centre. | Uses assets we already have; the demo shows these patterns convert results into proof at the point of decision. | Same consent gate as today (D-031): cards only for `published` + `granted` records. Rankers have no centre field, so per-centre strips need Aspire data. |
| 2 | **Real videos with a click-to-load modal:** a thumbnail card with a play overlay that opens a `youtube-nocookie` iframe only on click. Use it for lecture samples (programs, faculty) and testimonials (results, home). | High trust and engagement; no third-party load until click; the pattern is already proven on the demo. | Needs Aspire's **real** videos (footer links to their YouTube channel). Don't reuse the demo's 2 sample IDs. Testimonial videos need written consent (guardian consent for minors). Use real YouTube thumbnails or Aspire-supplied stills, not AI. |
| 3 | **Faculty section** (index + profile pages + avatars on program and centre pages). | Parents look for "who teaches"; the demo has it on 20+ pages; our faculty data is already imported. | Real headshots supplied by Aspire, with each teacher's consent. Until then use text or initials cards. **Never** AI or stock faces beside a real teacher's name (D-019). |
| 4 | **Real campus, classroom, lab, hostel and event photos**, with a per-centre gallery (hero + thumbnails) and a hostel room-tier selector. | These are the demo's most "institutional" visual types; real ones would replace our generic stock. | Ask Aspire for a photo set (shot list: each centre exterior and entrance, classrooms in session, labs, test hall, hostel rooms per tier, dining, felicitation events). Get photographer rights and assignment, and student and guardian releases where faces are identifiable; prefer wide or back-facing shots. Keep "illustrative" labels on anything that isn't Aspire's own. |
| 5 | **Aspire's own results posters / topper banners** (e.g. "13 साल, बेमिसाल", the NEET selection posters) as a results banner strip or hero slide on home and results. | Authentic, recognisable to the local audience, bilingual brand voice. | Needs the **original high-resolution files** (the demo has 512 px crops only, upscaled about 2.8× in its hero), confirmation that Aspire owns the artwork, and consent for every student shown, because a poster carries about 12–20 students with names. Alt text must describe the poster. |
| 6 | **Map embeds** on centre pages (click-to-load Google Maps, or a static map image linking to directions) next to our SVG overview map. | Practical for parents visiting; the demo has one per campus. | Coordinates and addresses must be confirmed by Aspire (map links are currently on the "excluded until confirmed" list in `docs/demo-data-import.md`). Load the iframe only on consent or click (privacy, performance). |
| 7 | **Branded article covers** (a 1200×630 template: photo + navy overlay + logo strip) for `/resources` articles and Open Graph. | Consistent sharing previews; cheap to build. | Use licensed stock or Aspire photos, not AI people. |
| 8 | **Round-avatar "selection" cards with rank badges** (compact results in program, centre and admissions contexts). | Fits more proof into a small space than full cards. | Avatar = the student's own result card (cropped) or initials; never a stand-in face. Show rank badges only where verified ("AIR", "675/720" claims need Aspire confirmation). |

**Do not adopt:**

- any `/media/figma/*` image from the demo: AI-generated, generator and terms unknown, fictional people and buildings shown as Aspire's;
- AI faces next to real names, or one face reused for several people;
- real students' posters used as generic "classroom" thumbnails with mismatched alt text;
- "verified" / "audited" / "100 %" labels on cards;
- 512 px images upscaled into heroes;
- two header variants.

## 10. Files

Scratch folder: `C:\Users\ADMIN\AppData\Local\Temp\claude\c--Users-ADMIN-aspire-2\b14df18b-965d-49a0-b7d8-e2fc393bfa53\scratchpad\aspire2-audit\`

- `samples\`: 37 representative files (33 pool images + 4 result cards; 1.7 MB). **They include real students' result cards and posters, so they are personal data and should be deleted when no longer needed.**
- `crops\sheet-*.jpg`: labelled contact sheets of every pool file (12 sheets), used for classification.
- `shots\`: empty. The 1440 and 375 screenshots were deleted by the lead to free disk space; they can be regenerated with `shots.mjs` when space allows.
- `data\pages\*.json`: per-page raw capture for 53 + 17 pages at 1440 and 4 at 375.
- `data\summary.json`, `data\tables.md`: aggregated counts.
- `data\figma-map.json`: the manual classification.
- `data\pool-meta.json`, `data\heads.json`: bytes and dimensions.
- `data\rankers_all.json`: the 715-item endpoint dump. It contains names: personal data, scratch only, not for the repo.
- Scripts: `crawl.mjs` + `extract.js` (capture), `analyze.mjs`, `tables.mjs`, `totals.mjs`, `altstats.mjs`, `names.mjs`, `avg.mjs`, `samples.mjs`, `head.mjs`, `shots.mjs`, `cdp-lib.mjs`.

No browser profile remains: all temporary Chrome profiles were deleted and all headless Chrome processes were closed.
