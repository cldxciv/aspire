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
- **Served locally** from `public/images/stock/` (no hotlinking). Files were downloaded as JPEG through Unsplash's CDN
  resize parameters (`?w=…&fm=jpg&q=80`). The hero is 2000px wide and the rest are 1200px.
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
   `src/app/(site)/about/page.tsx`, `src/app/(site)/admissions/page.tsx` and `src/app/(site)/contact/page.tsx`.
   Rename the key or add a new one as needed.
5. **Clean up.** Delete the replaced stock file and update its row here. When all three About photos are Aspire-owned,
   remove the "Illustrative stock photos…" note under the About page grid. If the hero photo
   changes, re-check text contrast over its brightest area (white and gold text must stay at WCAG AA or better).
6. **Verify.** Run `npx tsc --noEmit` and `npx eslint`, then do a visual check at 360/768/1440px.
