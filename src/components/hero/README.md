# Page hero kit (`@/components/hero`)

Inner-page heroes from the owner-approved hero canvas (2026-10-22, "can we have different heros for
different pages like it is in the artifact"). One shared kit; each page group gets its own look:

| Design | What it is | Pieces |
|---|---|---|
| **A · proof up front** | pill eyebrow, big serif headline with a gold phrase, lead, two CTAs, up to 3 proof stats, tilted photo collage with a result card and a corner chip | `HeroFrame layout="split"` + `ProofStats` + `HeroCollage` (+ `RanchoChip` or `NextBatchCard compact`) |
| **B · Himalayan editorial** | ridge + gold sun art, gold capitals eyebrow, large headline with a gold hand-drawn underline, CTAs, white "Next batch" card | `HeroFrame art="ridges" layout="editorial"` + `NextBatchCard` (or `HeroProgramCard`, or no aside) |
| **C · results ribbon** | headline, year pills, a row of result cards stepping every 5 s, Pause | `HeroFrame layout="wide"` + `footer={<ResultsRibbon/>}` |
| **D · program picker** | chips switch a facts strip and a program card | `HeroPanel art="ridges"` + `ProgramPicker copy={<HeroCopy/>}` |
| **E · centre finder** | district select → that district's centre card with actions + illustrative map | `HeroPanel` + `CentreFinder copy={<HeroCopy/>}` |

## Page → hero mapping (binding)

| Page | Hero |
|---|---|
| About | **A**: `ProofStats` from `getStats("headline")`, `HeroCollage` (stock photos + optional result card) with `RanchoChip` |
| Admissions | **A**, with `NextBatchCard compact` in the collage corner instead of the Rancho chip |
| Programs list | **B frame + D**: `HeroPanel art="ridges"` → `ProgramPicker` |
| Program page `/programs/[slug]` | **B frame**, that program's own facts (`HeroFactsStrip` from `programHeroFacts`) in `below`, `HeroProgramCard` (no "see program" link) or `NextBatchCard` as aside — no picker |
| Results | **C** |
| Centres list, centre page `/centres/[slug]`, Contact | **E** (`CentreFinder`; centre page: `defaultDistrict` = that centre's district; Contact: `actions={["call","whatsapp","directions"]}`) |
| Hostels, Resources (+ article pages), Tools hub, Rancho app page (if it uses PageHero), any other inner page | **B frame** (`art="ridges"`) with that page's one main action |
| Privacy, Terms, Login, Forgot password | today's quiet `PageHero` (default variant), unchanged |

Either import the pieces from `@/components/hero`, or use `PageHero variant="rich"` (same props as
`HeroFrame`); `PageHero` without `variant` is the quiet hero, exactly as before.

## Honesty rules (all pieces enforce them)

- Every fact comes from the data accessors (`src/lib/data.ts`) or the page's messages. Nothing is
  estimated: a missing value, `null`, `NaN`, `""` or an owner-to-fill slot like `[N]` / `[Start date]`
  is **omitted** (`isFilled()`); a row, stat, fact, title or button simply disappears. Programs have no
  start date, seats or fees in the data, so "Next batch" dates / "Seats left" do not render today.
- Placeholder records (`status: "placeholder"`, shown only in demo mode) carry the DEMO badge
  (`common.labels.demo`) on stats, facts cards, program cards, centre cards and result cards.
- Result cards only from `getResultCards()` (D-031: consent rule built in, empty in production),
  only on general pages (About, Admissions, Results), never beside a centre, campus or hostel.
- Photos: stock / approved assets with their visible label ("Illustrative stock photo"). The ridge
  art is an illustration (no landscape photos outside the home hero).
- Rancho is the snow-leopard mascot (`RanchoMascot`, decorative in `RanchoChip`).
- In production (no placeholder content) the islands render the copy with your `fallback` aside;
  `ResultsRibbon` renders nothing (show the page's fallback photo instead).

## Components

All are Server Components unless marked **client island**; islands get server-rendered defaults and
work without JavaScript (see each). Strings are props: put them in the page's own namespace, en + hi.

### `HeroFrame` (server) — `HeroFrameProps`
`HeroCopyProps` + `{ art?: "ridges" | "none"; layout?: "split" | "editorial" | "wide"; aside?: ReactNode; asideAlign?: "center" | "start" | "end"; footer?: ReactNode; panelClassName?: string }`.
Without `aside` the copy keeps a readable width (`max-w-3xl`). `art="ridges"` also picks the larger
`xl` headline. `layout="wide"` puts a short aside (one CTA) at the end of the headline row from `lg`.

### `HeroCopy` (server) — `HeroCopyProps`
`{ title; highlight?; highlightStyle?: "gold" | "underline"; size?: "lg" | "xl"; eyebrow?; eyebrowStyle?: "pill" | "caps"; lead?: ReactNode; actions?: ReactNode; below?: ReactNode; crumbs?: Crumb[]; homeLabel?; homeHref?; breadcrumbLabel?; headingId?; className? }`.
Breadcrumb (Home prepended, `aria-current="page"` on the last crumb), optional eyebrow, the page's
only `<h1>` (`highlight` must appear verbatim in `title`; otherwise the headline renders plain), lead,
`actions` (full width on phones, a row from `sm`) and `below` (stats, facts …). The headline is
sized by the copy column (container units), so it fits beside an aside on tablets.

### `HeroPanel` (server)
`{ art?: "ridges" | "none"; className?; children }` — the navy `HERO_PANEL` shell (`data-surface="dark"`,
container + gutters, ridge art and its bottom room). Wrap `ProgramPicker` / `CentreFinder` in it.

### `HeroAction` (server-safe)
`{ href; children; variant?: "primary" | "secondary" | "dark" | "outline" | "link"; icon?; newTabLabel?; className?; "aria-label"? }`
— 48 px CTA link. Internal paths via next/link; `tel:` / `https:` as `<a>`. `newTabLabel`
(`common.labels.opensInNewTab`) opens a new tab and says so to screen readers. Use `primary` +
`secondary` on the navy panel, `dark` / `outline` / `link` on white cards.

### `ProofStats` (server)
`{ stats: { value?: string | number | null; label: string; placeholder?: boolean }[]; label: string; demoLabel: string; max?: number; className? }`
— A's gold figures with dividers; only figures with a value (max 3); nothing when none.
Feed it `getStats("headline", locale)` mapped to `{ value: s.value, label: s.label, placeholder: s.status === "placeholder" }`.

### `HeroFactsStrip` (server-safe)
`{ facts: { label: string; value?: string | number | null }[]; label?: string; max?: number; className? }` — D's `<dl>` strip.

### `HeroCollage` (server)
`{ photos: { image: ImageAsset; label?: string; position?: string }[]; result?: CollageResult | null; resultBadge: string; demoLabel: string; chip?: ReactNode; priority?: boolean; className? }`
— first photo large (preloaded, LCP), second small. `result` = one `ResultCard` from
`getResultCards()` (pass `cards[0]`; `undefined` in production → no card). Fixed boxes, static tilt.

### `RanchoChip` (server)
`{ href; title; action; className? }` — "Stuck on a doubt? / Ask Rancho →" link with Rancho's face.

### `NextBatchCard` (server)
`{ eyebrow: string; title?: string | null; rows?: { label; value?; placeholder? }[]; action?: { label; href }; secondary?: { label; href }; demoLabel?; placeholder?; compact?; className? }`
— rows only for values that exist; no date → no title. E.g. rows `[{ label: t.centres, value: centres.map(c => c.name).join(" · "), placeholder: centres.some(isPlaceholder) }]`.

### `HeroProgramCard` (server-safe)
`{ program: Pick<PickerProgram, "eyebrow" | "title" | "summary" | "highlights" | "placeholder">; action?; secondary?; demoLabel: string; id?; className? }`.

### `ResultsRibbon` — **client island**
`{ cards: RibbonCard[]; labels: RibbonLabels; defaultYear?: number | "all"; autoPlay?: boolean; intervalMs?: number; className? }`
- `cards = pickRibbonCards(await getResultCards(undefined, locale))` (newest 3 years, ≤ 8 each, exams alternating).
- Shared carousel logic (`carousel-utils` / `carousel-env`): one card every 5 s (`AUTOPLAY_MS`),
  instant steps under reduced motion, visible Pause / Play first in the tab order (a Pause sticks),
  keyboard focus pauses, rests off screen / in a hidden tab, previous / next buttons, focusable
  labelled row (arrow keys), polite position announcements when not rotating.
- Server HTML: default year's cards, pressed pill, no buttons until hydration. No JS: pills hidden,
  scrollbar shown. Empty list → renders nothing.

### `ProgramPicker` — **client island**
`{ copy: ReactNode; programs: PickerProgram[]; defaultSlug?: string; labels: PickerLabels; secondary?: { label; href }; fallback?: ReactNode; className? }`
- `programs = (await getPrograms(undefined, locale)).map(p => pickerProgram(p, { href: localePath(`/programs/${p.slug}`, locale), factLabels: t.card.facts, upTo: t.units.upTo, trackLabels: t.tracks }))` (`t = programs` messages).
- Chip = class level as stated (override with `chip`); facts = class, duration, batch size when present.
- Server HTML: the default program's facts and card. No JS: chips hidden, a list of program links shown.

### `CentreFinder` — **client island**
`{ copy: ReactNode; centres: FinderCentre[]; districts: FinderDistrict[]; defaultDistrict?: string; labels: FinderLabels; actions?: ("page" | "call" | "whatsapp" | "directions")[]; fallback?: ReactNode; className? }`
- `const raw = await getCentres(undefined, locale)`;
  `centres = finderCentres(raw, { pageHref: (slug) => localePath(`/centres/${slug}`, locale), whatsapp: contact?.whatsapp ?? null })`
  (`contact = await getContactDetails(locale)`); `districts = finderDistricts(raw, locale)`.
- District → centre: `centreForDistrict()` — the centre whose `servesDistricts` names it, else the one
  located in it, else the closest pin. `defaultDistrict` accepts an id or a name (a centre page passes
  its centre's `district`); default = the head campus's district.
- Labelled 48 px select of the 12 districts (`HP_DISTRICTS`, data in `src/content/hp-districts.ts`),
  card with name, address · phone, DEMO / head-campus badges and the actions (first one gold), map
  (`CentreMap`, `role="img"` named by `labels.mapLabel`, visible "not to scale" caption).
- Server HTML: the default district's card and map. No JS: select and card hidden, every centre listed.

## Suggested strings (add to the page's own namespace, en + hi)

`RibbonLabels` (results): listLabel "Results from Aspire's previous batches" / "Aspire के पिछले बैचों के परिणाम";
yearGroup "Show results from" / "किस साल के परिणाम देखें"; allYears "All years" / "सभी साल";
pause "Pause the results" / "परिणाम रोकें"; play "Play the results" / "परिणाम चलाएँ";
previous "Previous results" / "पिछले परिणाम"; next "Next results" / "अगले परिणाम";
position "{current} of {total}" / "{total} में से {current}"; hint "A new card every 5 seconds" / "हर 5 सेकंड में नया कार्ड";
demo = `common.labels.demo`.

`PickerLabels` (programs): group "Choose a program" / "प्रोग्राम चुनें"; seeProgram "See the full program" / "पूरा प्रोग्राम देखें";
selected "Showing {title}" / "दिखाया जा रहा है: {title}"; demo = `common.labels.demo`.

`FinderLabels` (centres, contact): district "Your district" / "आपका ज़िला";
centreFor "Aspire centre for {district}" / "{district} के लिए Aspire केंद्र";
mapLabel "Illustrative map of Aspire's {count} centres in Himachal Pradesh: {names}" / "हिमाचल प्रदेश में Aspire के {count} केंद्रों का सांकेतिक नक्शा: {names}";
mapNote "Illustrative map, not to scale" / "सांकेतिक नक्शा, पैमाने के अनुसार नहीं"; headCampus "Head campus" / "मुख्य कैंपस";
page "View centre" / "केंद्र देखें"; call "Call" / "कॉल करें"; whatsapp "WhatsApp" / "व्हाट्सऐप"; directions "Directions" / "रास्ता देखें";
listTitle "Our centres" / "हमारे केंद्र"; opensInNewTab / demo = `common.labels.*`.

## Example (Programs list)

```tsx
<HeroPanel art="ridges">
  <ProgramPicker
    copy={<HeroCopy title={t.hero.title} highlight={t.hero.highlight} highlightStyle="underline" size="xl"
      eyebrow={t.hero.eyebrow} eyebrowStyle="caps" lead={t.hero.lead} crumbs={[{ label: t.list.crumb }]}
      homeLabel={common.labels.home} homeHref={localePath("/", locale)}
      actions={<HeroAction href={localePath("/admissions#enquiry", locale)}>{t.hero.cta}</HeroAction>} />}
    programs={views} labels={pickerLabels} secondary={{ label: t.hero.counselling, href: localePath("/admissions#enquiry", locale) }}
    fallback={<Image … />}
  />
</HeroPanel>
```

## Layout and accessibility notes

- Columns from `md` (tablet ≈ 55 / 45), `lg` 50 / 50 (`split`) or 62 / 38 (`editorial`); fixed image
  boxes, server-rendered defaults: no layout shift. Tested shapes: 375 / 768 / 1024 / 1280.
- `data-surface="dark"` panel (gold focus rings), white cards `data-surface="light"` (blue rings);
  all controls ≥ 44 px; decorative SVG / icons `aria-hidden`; colours keep text ≥ 4.5:1 on every
  ridge band (gold on the lightest band 4.75:1); the snow caps are faint (30 %) so white text on one keeps 4.8:1.
- Tests: `hero-data.test.ts` (pure helpers, district → centre mapping, data honesty) and
  `hero-components.test.ts` (server render en / hi, a11y attributes, no slots, production mode).
