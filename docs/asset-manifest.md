# Asset manifest: temporary stock photography

The owner approved free **Unsplash-licensed** stock photos as **temporary** imagery until Aspire supplies its own.
Every image below is `temporary stock: replace with Aspire-owned`.

- **Licence:** [Unsplash License](https://unsplash.com/license). Free to use commercially without permission. Attribution is
  not required, but credits are kept here. The licence does not allow selling unaltered copies or compiling the photos into a
  competing service. It also **does not** grant model or property releases. People in these photos must never be presented
  as Aspire students, staff, toppers or endorsers, and no place may be presented as an Aspire centre.
- **Licence check (2026-10-19):** each photo's Unsplash record was checked individually. All 12 have `premium: false`,
  `plus: false` and `sponsorship: null`, and all are served from `images.unsplash.com`. **No Unsplash+ / premium or
  sponsored image is used.**
- **Licence check, round 2 (2026-10-20):** the 24 photos added for D-030 (rows 13–36) were checked the same way, through
  each photo's own record (`unsplash.com/napi/photos/{id}`). All 24 have `premium: false`, `plus: false` and
  `sponsorship: null`, are `photo-…` ids (not `premium_photo-…`) and were downloaded from `images.unsplash.com` (not
  `plus.unsplash.com`). **No Unsplash+ / premium or sponsored image is used.**
- **Served locally** from `public/images/stock/` (no hotlinking). Files were downloaded as JPEG through Unsplash's CDN
  resize parameters (`?w=…&fm=jpg&q=80`). The hero is 2000px wide and the rest are 1200px. Round 2 files are 1600px wide
  (portrait ones 1200px wide), each under 350 KB.
- **Registry:** `src/content/images.ts` (`stockImages`) holds `src`, real pixel `width`/`height` and alt text. Alt text
  describes what is visible, never "Aspire students/faculty/campus".
- **Avoided on purpose:** recognisable brands or logos (a microscope photo with a maker's name and a highlighter photo
  with a brand logo were rejected), other institutions' names or uniforms, school signage, results celebrations, and
  building exteriors that could pass for an Aspire centre.

## Images

| # | File (`public/images/stock/`) | Used on | Alt text (registry) | Photographer | Unsplash URL | Licence | Downloaded | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | `himalaya-dhauladhar-ridge-hero.jpg` | Home hero background (`src/components/home/HomeHero.tsx`); rendered decorative (`alt=""`) under the navy overlay | Snow-capped Dhauladhar mountain range in Himachal Pradesh under a clear blue sky | [Abhinav](https://unsplash.com/@fujiguy_) | [HTpsGjjpeHM](https://unsplash.com/photos/a-view-of-a-mountain-range-with-snow-on-it-HTpsGjjpeHM) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 2 | `himalaya-blue-ridge.jpg` | Contact page: decorative strip at the foot of the "Contact details" card (`alt=""`) | Layered Himalayan ridges in soft blue morning light | [Lay Naik](https://unsplash.com/@laynaik21) | [iq0xdwrPay8](https://unsplash.com/photos/snow-covered-mountains-during-daytime-iq0xdwrPay8) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 3 | `physics-equation-whiteboard.jpg` | IIT JEE program (`programs.ts` → `image`): program cards (Home, /programs, "Other programs") and /programs/iit-jee | A hand writing a physics integral on a whiteboard | [Jeswin Thomas](https://unsplash.com/@jeswinthomas) | [hecib2an4T4](https://unsplash.com/photos/person-writing-on-white-paper-hecib2an4T4) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 4 | `stethoscope-medical-textbooks.jpg` | NEET program: cards and /programs/neet | A stethoscope and a pencil resting beside a stack of textbooks | [Bermix Studio](https://unsplash.com/@bermixstudio) | [00heEp9LFP0](https://unsplash.com/photos/a-stethoscope-sitting-on-top-of-a-pile-of-books-00heEp9LFP0) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 5 | `young-student-writing.jpg` | Foundation program: cards and /programs/foundation | A young student concentrating while writing | [Dhruv Bhatt](https://unsplash.com/@dhruvvbhatt) | [1PWvnRm21gg](https://unsplash.com/photos/young-boy-looking-at-a-tablet-screen-1PWvnRm21gg) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 6 | `students-taking-notes-class.jpg` | Integrated Programs: cards and /programs/integrated | Students writing notes side by side during a class | [Aswin Thomas Bony](https://unsplash.com/@aswintb) | [SPO0ST4nVbY](https://unsplash.com/photos/a-group-of-men-sitting-at-a-table-writing-on-paper-SPO0ST4nVbY) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 7 | `classroom-desks-sunlight.jpg` | About: "Learning, practice and revision" grid, caption "Classroom learning" (cropped 1200×900 from a portrait original) | An empty classroom with rows of desks lit by afternoon sunlight | [Himanshu More](https://unsplash.com/@aslihimanshu_00) | [scIRFbMeIfw](https://unsplash.com/photos/a-room-filled-with-tables-and-chairs-next-to-a-window-scIRFbMeIfw) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 8 | `science-lab-pipette-experiment.jpg` | About grid, caption "Hands-on science practice" | Gloved hands using a pipette to add coloured liquid to test tubes | [Julia Koblitz](https://unsplash.com/@jkoblitz) | [RlOAwXt2fEA](https://unsplash.com/photos/scientist-using-pipette-with-test-tubes-in-lab-RlOAwXt2fEA) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 9 | `library-reading-student.jpg` | About grid, caption "Reading and revision" | A student reading at a table in a library lined with bookshelves | [Praveen Gupta](https://unsplash.com/@praveeeeeeeen) | [YhfxJpa_Ch0](https://unsplash.com/photos/woman-reading-book-inside-the-library-YhfxJpa_Ch0) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 10 | `mentoring-conversation-table.jpg` | Admissions: top of the "What happens next?" card | Two people talking across a small table in a bright room | [Christina @ wocintechchat.com](https://unsplash.com/@wocintechchat) | [eF7HN40WbAQ](https://unsplash.com/photos/two-women-sitting-on-chair-eF7HN40WbAQ) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 11 | `maths-homework-notebook.jpg` | Article "Building a weekly revision plan" (`articles.ts` → `coverImage`): card thumbnail on /resources and related lists, and the article page | Handwritten algebra practice in a squared notebook with a pencil | [Rishi](https://unsplash.com/@rishiunsplasher) | [rYwsJLyhvC4](https://unsplash.com/photos/a-pencil-sitting-on-top-of-a-piece-of-paper-rYwsJLyhvC4) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |
| 12 | `open-notebook-planning-desk.jpg` | Article "Choosing the right program": card thumbnail and article page | An open lined notebook with a pencil and a highlighter on a wooden table | [Kelly Sikkema](https://unsplash.com/@kellysikkema) | [wN7hxU_P0aI](https://unsplash.com/photos/a-white-and-black-hat-wN7hxU_P0aI) | Unsplash License | 2026-10-19 | temporary stock: replace with Aspire-owned |

### Technical details

| # | File | Pixels (read from file) | Size | Source (Unsplash CDN) |
|---|---|---|---|---|
| 1 | `himalaya-dhauladhar-ridge-hero.jpg` | 2000 × 1249 | 504 KB | `photo-1637896175022-7165f16fb523?w=2000&fm=jpg&q=80` |
| 2 | `himalaya-blue-ridge.jpg` | 1200 × 800 | 105 KB | `photo-1631377954848-6d38edd5510f?w=1200&fm=jpg&q=80` |
| 3 | `physics-equation-whiteboard.jpg` | 1200 × 796 | 48 KB | `photo-1596495577886-d920f1fb7238?w=1200&fm=jpg&q=80` |
| 4 | `stethoscope-medical-textbooks.jpg` | 1200 × 771 | 134 KB | `photo-1676313496812-f8fc7c4304cf?w=1200&fm=jpg&q=80` |
| 5 | `young-student-writing.jpg` | 1200 × 676 | 101 KB | `photo-1757841336140-63bb8d353346?w=1200&fm=jpg&q=80` |
| 6 | `students-taking-notes-class.jpg` | 1200 × 900 | 137 KB | `photo-1686624386665-4cd01b96d0f6?w=1200&fm=jpg&q=80` |
| 7 | `classroom-desks-sunlight.jpg` | 1200 × 900 | 121 KB | `photo-1688789029020-6c5b8b22305a?w=1200&h=900&fit=crop&fm=jpg&q=80` |
| 8 | `science-lab-pipette-experiment.jpg` | 1200 × 753 | 111 KB | `photo-1614935151651-0bea6508db6b?w=1200&fm=jpg&q=80` |
| 9 | `library-reading-student.jpg` | 1200 × 900 | 170 KB | `photo-1544456203-0af5a69f5789?w=1200&fm=jpg&q=80` |
| 10 | `mentoring-conversation-table.jpg` | 1200 × 800 | 102 KB | `photo-1573497620053-ea5300f94f21?w=1200&fm=jpg&q=80` |
| 11 | `maths-homework-notebook.jpg` | 1200 × 520 | 112 KB | `photo-1739858446889-b20d63614d73?w=1200&fm=jpg&q=80` |
| 12 | `open-notebook-planning-desk.jpg` | 1200 × 800 | 105 KB | `photo-1661732017124-815ab968a6a8?w=1200&fm=jpg&q=80` |

All sources are on `https://images.unsplash.com/`. Total ≈ 1.75 MB on disk. `next/image` serves resized, re-encoded
variants at the default quality.

## Round 2: image-rich pages (D-030, added 2026-10-20)

Sourced so every public page can carry 2–4 photos. The registry keys are in `src/content/images.ts` (`stockImages`), each
with a comment naming its suggested page(s). **Not wired into any page yet**: the M4 page agents place them. Rules for
use:

- **Landscapes show the region and are never presented as a centre.** Caption them with the region ("Dharamshala
  region"), never "our centre", "our campus" or an address.
- **Faces:** faculty information was removed, so the teacher photo is from behind on purpose. People are never captioned
  as Aspire students, staff or toppers, and are never placed beside a real name, rank or score.
- **Results:** `mountainTrail` and `graduateSilhouette` are neutral aspiration images. Do not pair them with rank
  claims.

| # | File (`public/images/stock/`) | Suggested use | Alt text (registry key) | Photographer | Unsplash URL | Licence | Downloaded | Status |
|---|---|---|---|---|---|---|---|---|
| 13 | `shimla-hill-town-panorama.jpg` | About hero/intro; Centres (Shimla region); Contact | The hill town of Shimla spread across forested ridges under a blue sky (`shimlaPanorama`) | [Naman Pandey](https://unsplash.com/@nmnp) | [y3nWJ-QznP4](https://unsplash.com/photos/city-near-mountain-under-blue-sky-during-daytime-y3nWJ-QznP4) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 14 | `seminar-students-from-behind.jpg` | About; Programs overview | Students seen from behind, seated in rows facing a presenter in a bright room (`seminarFromBehind`) | [Sam Balye](https://unsplash.com/@sambalye) | [w1FwDvIreZU](https://unsplash.com/photos/people-sitting-on-chair-w1FwDvIreZU) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 15 | `teacher-chalkboard-from-behind.jpg` | About (teaching); IIT JEE detail | A teacher, seen from behind, writing equations on a chalkboard full of formulas (`teacherChalkboard`) | [Vitaly Gariev](https://unsplash.com/@silverkblack) | [zHXST3gGIdI](https://unsplash.com/photos/teacher-writing-math-equations-on-a-chalkboard-zHXST3gGIdI) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 16 | `table-discussion-notebooks.jpg` | About (study groups); Admissions (counselling conversation) | People around a table with open notebooks, one pointing at a page with a pen (`tableDiscussion`) | [sarah b](https://unsplash.com/@sixthcitysarah) | [BJqzjxwQhK8](https://unsplash.com/photos/a-few-people-working-at-a-table-BJqzjxwQhK8) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 17 | `hand-writing-notebook-solutions.jpg` | IIT JEE (problem-solving); Results | A hand writing worked solutions in a notebook with a red pencil (`notebookSolutions`) | [eleni koureas](https://unsplash.com/@elenikoureas) | [2MH5KECTvz8](https://unsplash.com/photos/person-writing-on-white-paper-2MH5KECTvz8) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 18 | `chemistry-glassware-lab-bench.jpg` | NEET / IIT JEE (chemistry) | Laboratory flasks, tubing and a brown reagent bottle on a dimly lit bench (`chemistryGlassware`) | [Egor Myznik](https://unsplash.com/@vonshnauzer) | [C5pAjKmUSJE](https://unsplash.com/photos/laboratory-glassware-sits-on-a-dark-illuminated-table-C5pAjKmUSJE) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 19 | `plant-cell-micrograph.jpg` | NEET (biology) | Stained cross-section of a plant stem under a microscope, showing cells around a vascular bundle (`plantCellMicrograph`) | [Bioscience Image Library by Fayette Reynolds](https://unsplash.com/@berkshirecommunitycollege) | [HC4kAQIUrfM](https://unsplash.com/photos/a-close-up-view-of-a-plant-cell-HC4kAQIUrfM) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 20 | `young-student-notebook-pencil.jpg` | Foundation | A young girl, head bowed, writing in a notebook with a pencil (`youngStudentNotebook`) | [Sudhakar Chandra](https://unsplash.com/@sudhakarchandra) | [wBzxapFHSOk](https://unsplash.com/photos/young-girl-writing-in-a-notebook-with-a-pencil-wBzxapFHSOk) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 21 | `pocket-watch-calculus-worksheet.jpg` | Programs (test series / exam prep); program detail | A pocket watch, a pencil and an eraser on squared paper filled with handwritten calculus (`pocketWatchWorksheet`) | [Luka Savcic](https://unsplash.com/@luka2231) | [evixqxe715k](https://unsplash.com/photos/silver-and-white-round-analog-watch-beside-white-printer-paper-evixqxe715k) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 22 | `mountain-ridge-trail-snow-peaks.jpg` | Results (aspiration); Home | A narrow trail along a ridge leading towards snow-capped mountain peaks (`mountainTrail`) | [Dheeraj Singh khani](https://unsplash.com/@dskhani) | [o1Xz7wmqiEQ](https://unsplash.com/photos/a-dirt-road-in-the-middle-of-a-mountain-range-o1Xz7wmqiEQ) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 23 | `graduate-silhouette-cap-sky.jpg` | Results (no face visible) | Silhouette of a person in a graduation cap and gown against a pale sky (`graduateSilhouette`) | [Christian Agbede](https://unsplash.com/@chriscreations__) | [LBu00oeIvnk](https://unsplash.com/photos/silhouette-of-a-graduate-in-a-cap-and-gown-LBu00oeIvnk) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 24 | `dhauladhar-peaks-triund-dharamshala.jpg` | Centres (Dharamshala / Kangra region) | Snow-dusted Dhauladhar peaks above Dharamshala, seen from Triund with boulders in the foreground (`dhauladharTriund`) | [Nik V](https://unsplash.com/@nickverm) | [BzO5EBSCXv4](https://unsplash.com/photos/snowy-mountains-dominate-a-dramatic-landscape-BzO5EBSCXv4) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 25 | `kullu-valley-solang-snow-range.jpg` | Centres (Kullu region) | Snow-covered peaks rising above the Kullu valley near Solang, Himachal Pradesh (`kulluValley`) | [Alik Ghosh](https://unsplash.com/@alikghosh) | [A8SjT0_yAKA](https://unsplash.com/photos/snow-covered-mountain-during-daytime-A8SjT0_yAKA) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 26 | `hamirpur-hills-dhauladhar-morning.jpg` | Centres (Hamirpur region); Legal (calm landscape) | Forested hills near Hamirpur, Himachal Pradesh, with the snowy Dhauladhar range on the horizon (`hamirpurHills`) | [Nomad Bikers](https://unsplash.com/@nomadbikers) | [GQvhAIjEnGE](https://unsplash.com/photos/white-and-brown-trees-painting-GQvhAIjEnGE) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 27 | `bunk-bed-dorm-room.jpg` | Hostels (dorm-style room) | A neatly made metal bunk bed beside a tall window, with folded linen on the lower bunk (`bunkBedRoom`) | [Marcus Loke](https://unsplash.com/@marcusloke) | [WQJvWU_HZFo](https://unsplash.com/photos/black-metal-bunk-bed-WQJvWU_HZFo) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 28 | `steel-thali-meal-tray.jpg` | Hostels (meals) | A steel thali with rotis, a vegetable curry and dal beside a steel tumbler (`steelThali`) | [Gayatri Malhotra](https://unsplash.com/@gmalhotra) | [mlwXrYYAOms](https://unsplash.com/photos/cooked-food-on-round-tray-mlwXrYYAOms) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 29 | `desk-lamp-notebook-evening.jpg` | Hostels (evening study) | A desk lamp lighting an open handwritten notebook and a pen in a dark room (`deskLampEvening`) | [Barney Goodman](https://unsplash.com/@bgoodpic) | [LOk7sNVCNJU](https://unsplash.com/photos/a-lit-desk-lamp-illuminates-a-notebook-and-pen-LOk7sNVCNJU) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 30 | `study-desk-through-window.jpg` | Hostels (study room); Resources | A person studying at a desk, seen through a wooden window frame (`studyThroughWindow`) | [Yanhao Fang](https://unsplash.com/@alamanga) | [QR-XQbUVC1s](https://unsplash.com/photos/a-person-studying-at-a-desk-with-books-QR-XQbUVC1s) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 31 | `signing-form-pen-hands.jpg` | Admissions (application / documents) | Hands signing a paper form with a pen (`signingForm`) | [Scott Graham](https://unsplash.com/@amstram) | [OQMZwNd3ThU](https://unsplash.com/photos/man-writing-on-paper-OQMZwNd3ThU) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 32 | `students-walking-campus-path.jpg` | Admissions; Home | Two people with backpacks, seen from behind, walking along a sunlit path between lawns (`studentsWalkingPath`) | [Austin](https://unsplash.com/@austin_7792) | [b8h25oRs89Y](https://unsplash.com/photos/two-people-walking-on-a-path-in-a-park-b8h25oRs89Y) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 33 | `winding-hill-road-barot.jpg` | Contact (getting here); Centres | A road winding through terraced green hillsides and forest near Barot, Himachal Pradesh (`hillRoadBarot`) | [Hardik Monga](https://unsplash.com/@hardikmonga) | [G_jT5-pkbw4](https://unsplash.com/photos/a-winding-road-in-the-middle-of-a-lush-green-hillside-G_jT5-pkbw4) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 34 | `books-stack-notebook-pen.jpg` | Resources; Legal (privacy, terms) | A stack of old hardback books beside a spiral notebook and a pen on a wooden table (`booksAndNotebook`) | [Debby Hudson](https://unsplash.com/@hudsoncrafted) | [asviIGR3CPE](https://unsplash.com/photos/pile-of-books-beside-white-printer-paper-and-black-ballpoint-pen-asviIGR3CPE) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 35 | `laptop-notebook-study-hands.jpg` | Resources (online material) | Hands typing on a laptop beside a blank spiral notebook and a pencil (`laptopStudy`) | [Kelly Sikkema](https://unsplash.com/@kellysikkema) | [kA50vHmCxbk](https://unsplash.com/photos/a-person-typing-on-a-laptop-kA50vHmCxbk) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |
| 36 | `library-bookshelf-aisle.jpg` | Resources (library / reading) | A long library aisle lined with shelves of books (`libraryAisle`) | [Zetong Li](https://unsplash.com/@zetong) | [xYyJAC0IdyI](https://unsplash.com/photos/a-long-row-of-books-in-a-library-xYyJAC0IdyI) | Unsplash License | 2026-10-20 | temporary stock: replace with Aspire-owned |

### Round 2 technical details

Place names in the alt text come from the photographer's location on the Unsplash record (Shimla; Triund Top,
Dharamshala; Solang Valley Road, Burwa (Kullu district); Khatrod, Hamirpur; Barot). "mozjpeg" means the CDN JPEG was
fetched at q=92 and re-encoded locally with sharp (mozjpeg, q=76) to stay under 350 KB at 1600px.

| # | File | Pixels (read from file) | Size | Source (Unsplash CDN, `images.unsplash.com/…`) |
|---|---|---|---|---|
| 13 | `shimla-hill-town-panorama.jpg` | 1600 × 1067 | 292 KB | `photo-1597074866923-dc0589150358?w=1600` → mozjpeg |
| 14 | `seminar-students-from-behind.jpg` | 1600 × 1129 | 289 KB | `photo-1570616969692-54d6ba3d0397?w=1600&fm=jpg&q=78` |
| 15 | `teacher-chalkboard-from-behind.jpg` | 1600 × 900 | 194 KB | `photo-1758685848754-0aa566b4ddf4?w=1600&fm=jpg&q=78` |
| 16 | `table-discussion-notebooks.jpg` | 1600 × 1071 | 149 KB | `photo-1668092548064-730e05fd0324?w=1600&fm=jpg&q=78` |
| 17 | `hand-writing-notebook-solutions.jpg` | 1600 × 1067 | 239 KB | `photo-1588451658749-a65f4fc8763e?w=1600&fm=jpg&q=78` |
| 18 | `chemistry-glassware-lab-bench.jpg` | 1600 × 1065 | 167 KB | `photo-1742137587512-1276fbcf973c?w=1600&fm=jpg&q=78` |
| 19 | `plant-cell-micrograph.jpg` | 1600 × 902 | 345 KB | `photo-1714844437236-de8ef1c7286f?w=1600&fm=jpg&q=78` |
| 20 | `young-student-notebook-pencil.jpg` | 1600 × 1067 | 277 KB | `photo-1757877151735-e48f41c26393?w=1600&fm=jpg&q=78` |
| 21 | `pocket-watch-calculus-worksheet.jpg` | 1600 × 1067 | 289 KB | `photo-1609155035300-15e1ffa95f12?w=1600&fm=jpg&q=78` |
| 22 | `mountain-ridge-trail-snow-peaks.jpg` | 1600 × 900 | 312 KB | `photo-1723289390135-25a9298236df?w=1600&fm=jpg&q=78` |
| 23 | `graduate-silhouette-cap-sky.jpg` | 1600 × 1067 | 104 KB | `photo-1777186475752-fb520366b805?w=1600&fm=jpg&q=78` |
| 24 | `dhauladhar-peaks-triund-dharamshala.jpg` | 1600 × 1143 | 277 KB | `photo-1747973174651-8feed2d1a6ee?w=1600` → mozjpeg |
| 25 | `kullu-valley-solang-snow-range.jpg` | 1600 × 1067 | 235 KB | `photo-1616942986550-ea6469c08530?w=1600` → mozjpeg |
| 26 | `hamirpur-hills-dhauladhar-morning.jpg` | 1600 × 1063 | 231 KB | `photo-1571931932062-ddad532e80d9?w=1600&fm=jpg&q=78` |
| 27 | `bunk-bed-dorm-room.jpg` | 1200 × 1527 | 236 KB | `photo-1555854877-bab0e564b8d5?rect=2850,0,3143,4000&w=1200&fm=jpg&q=78` (right-hand crop: excludes a sign letter on the building outside the window) |
| 28 | `steel-thali-meal-tray.jpg` | 1600 × 1067 | 336 KB | `photo-1546833999-b9f581a1996d?w=1600&fm=jpg&q=78` |
| 29 | `desk-lamp-notebook-evening.jpg` | 1200 × 1600 | 156 KB | `photo-1781690643160-73d0743dfbde?w=1200&h=1600&fit=crop&fm=jpg&q=78` |
| 30 | `study-desk-through-window.jpg` | 1600 × 1067 | 191 KB | `photo-1756032433560-56547efed550?w=1600&fm=jpg&q=78` |
| 31 | `signing-form-pen-hands.jpg` | 1600 × 1068 | 177 KB | `photo-1450101499163-c8848c66ca85?w=1600&fm=jpg&q=78` |
| 32 | `students-walking-campus-path.jpg` | 1200 × 1600 | 237 KB | `photo-1763890763432-17c9a529da20?w=1200&h=1600&fit=crop` → mozjpeg |
| 33 | `winding-hill-road-barot.jpg` | 1600 × 1067 | 320 KB | `photo-1686150569573-588926f1a581?w=1600` → mozjpeg |
| 34 | `books-stack-notebook-pen.jpg` | 1600 × 1060 | 178 KB | `photo-1517673132405-a56a62b18caf?w=1600&fm=jpg&q=78` |
| 35 | `laptop-notebook-study-hands.jpg` | 1600 × 1067 | 211 KB | `photo-1663524789611-2c8330848379?w=1600&fm=jpg&q=78` |
| 36 | `library-bookshelf-aisle.jpg` | 1600 × 1065 | 238 KB | `photo-1683178861337-ca70ef8c0db3?w=1600` → mozjpeg |

Round 2 total ≈ 5.6 MB on disk (all files sRGB JPEG).

### Round 2: rejected on purpose

- **Brands or logos:** two microscope photos (OLYMPUS / maker name on the body), a desk telephone (Panasonic logo), a
  laptop at night ("MacBook Pro" under the screen, Apple logo on a second shot), a counselling photo with a Dell logo, and
  stopwatches with a maker's name on the dial.
- **Other institutions:** a lecture-hall photo whose record places it at AIIMS Bhubaneswar (a NEET target institute, so
  it could imply an affiliation), the Trinity College "Long Room" library (instantly recognisable), a Shanghai Library
  aisle with shelf signage, a graduation cap with a university seal, and photos posted by institution accounts (a business
  school, an aviation academy).
- **Uniforms or signage:** Indian classroom photos showing school uniforms, ties and school banners; a hostel-room photo
  with a large sign letter outside the window (used only as a right-hand crop, row 27).
- **Results or celebration:** cap-tossing crowds, decorated caps with years or slogans, and graduates holding diplomas.
- **Unsplash+ / Getty:** many of the best Indian-family, counselling and classroom results were `premium: true` and were
  skipped.

### Round 2: gaps

- **Counselling with an Indian parent, student and counsellor:** no standard-licence photo was found; every match was
  Unsplash+ (Getty / Curated Lifestyle). Use `tableDiscussion` (faces out of frame) or the existing
  `mentoringConversation` until Aspire supplies its own photo.
- **Microscope:** no logo-free microscope photo was found, so biology uses `plantCellMicrograph`.
- **Phone or helpdesk:** no logo-free option was found, so Contact uses `hillRoadBarot` or `shimlaPanorama`.

## How to replace

1. **Get the photo and the rights.** Use photos Aspire owns or has written permission to use. For identifiable students
   or parents, get documented consent (guardian consent for minors) before publishing. Exteriors must show the real,
   verified centre.
2. **Prepare the file.** Use sRGB JPEG (or WebP) with no text burned in. Make the hero about 2000px wide and under about
   600 KB, and everything else about 1200px wide and under about 400 KB.
3. **Add it** under `public/images/` (for example `public/images/aspire/`, not `stock/`) with a descriptive kebab-case name.
4. **Update the registry entry** in `src/content/images.ts`: `src`, the file's real `width`/`height`, and alt text. Once
   Aspire has verified it, the alt text may name Aspire (for example "Students in an Aspire physics class, Shimla").
   Entries are referenced from `src/content/programs.ts`, `src/content/articles.ts`, `src/components/home/HomeHero.tsx`,
   `src/app/(site)/about/page.tsx`, `src/app/(site)/admissions/page.tsx` and `src/app/(site)/contact/page.tsx`
   (paths before the M4 `[lang]` move; round-2 keys are referenced from wherever the page agents place them, so search
   for the key). Rename the key or add a new one as needed.
5. **Clean up.** Delete the replaced stock file and update its row here. When all three About photos are Aspire-owned,
   remove the "Illustrative stock photos…" note under the About page grid. If the hero photo
   changes, re-check text contrast over its brightest area (white and gold text must stay at WCAG AA or better).
6. **Verify.** Run `npx tsc --noEmit` and `npx eslint`, then do a visual check at 360/768/1440px.

## Aspire generated assets (`public/assets/aspire/`)

Supplied by the owner on 2026-10-19 with `public/assets/aspire/README.txt`: "individually cropped from a generated asset contact sheet … visual placeholders, not verified photographs of Aspire campuses, staff, students, or actual results." Registered in `src/content/aspire-assets.ts`, rendered via `<AspireImage>` (D-019).

| Item | Value |
|---|---|
| Origin | AI-generated contact sheet (generator, prompt author and commercial-use terms **not recorded** — owner to supply before launch) |
| Size | 84–425 px wide; each entry has a `maxWidth` it must never exceed |
| People | AI people, several wearing "ASPIRE"-printed hoodies (`hero-students`, `classroom-learning`, `students-group-study`, `student-boy-1`, `student-boy-2`); `students-group-study` shows an Apple logo. Never beside a real name; never presented as Aspire students |
| Current use of `hero-students` | Homepage hero "postcard" only, visibly labelled "Illustration", `alt=""`, `xl` + `tall` viewports (D-023, owner choice 2026-10-20) |
| Centre buildings | Illustrative only, always labelled "Illustrative image"; **`palampur-centre` / `solan-centre` must not be used** (no such Aspire centres); Kullu has no image |
| Feature icons | Six have the source filename baked in below the icon; `AspireImage` crops them (`crop: "top-square"`) — clean versions requested |
| Status | temporary — replace with Aspire-owned, consented photography and official brand assets before launch |

### `hero-students-large.jpg` (added 2026-10-20, D-023a)
| Item | Value |
|---|---|
| Origin | Photo-only crop (440×435, no UI or text) of the AI-generated students from the owner's approved design `reference/homepage/01-approved-first-fold.png` (region x 590–1030, y 76–511), JPEG q92, 50 KB |
| Shows | Three AI-generated students in navy "ASPIRE"-printed hoodies against Himalayan mountains — **not real Aspire students** |
| Use | Homepage hero only, beside the headline on desktop / after the form on mobile, ≤ 460 px wide, visible "Illustration" label, `alt=""` |
| Status | temporary — replace with a consented Aspire photo shoot before launch (see UX brief: landscape ≥ 2560×1440, group in the 38–68% horizontal band) |

## Result cards (`private/result-cards/`, added 2026-10-20, D-031)

| Item | Value |
|---|---|
| Origin | **Aspire's own result cards** from the owner's demo site (`aspire2.thechunkmedia.com/rankers.json` → `/media/rankers/*.webp`), imported by `scripts/import-result-cards.mjs`. Ownership of the artwork and photos to be confirmed by Aspire |
| Shows | A real student in an Aspire hoodie, a college badge (e.g. "NIT Hamirpur", "MBBS · Tanda") and the student's name — **personal data** |
| Files | 715 × `ranker-<demo id>.webp`, re-encoded with sharp to ≤ 400 px wide, webp quality 78; 8.92 MB in total. **Not in `public/`** (public files are served unconditionally and `/images/` skips the preview gate, D-027) |
| Registry | `src/content/result-photos.ts` (generated sizes + mapping) → `photo` on `RankerRecord` in `src/content/results.ts`; alt text "&lt;Name&gt; — &lt;Institute&gt;, &lt;Exam&gt; &lt;Year&gt; result card" (Hindi: "… का परिणाम कार्ड") |
| Served by | `GET /api/result-cards/[file]` only — same rule as student names (`canShowStudentName()`): preview / development with placeholder content, or `granted` consent. 404 in production while consent is pending. Rendered `unoptimized` (no `/_next/image` copies) |
| Used by | `ResultCardMosaic`, `ResultCardMarquee` (`src/components/results/`), via `getResultCards()`; always with the DEMO badge while placeholder |
| Status | **preview-only until Aspire confirms written consent** (student or guardian) for each card and name, and ownership of the images. Decide before launch whether the folder ships in production images and belongs in git |
