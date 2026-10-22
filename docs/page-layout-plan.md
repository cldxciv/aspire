# Page layout: reorder and show/hide sections (Home and inner pages)

**Status:** plan, ready to build (2026-10-22). Live release when planned: `3394b3d`.
**Owner's request (verbatim):** "do we have the functionality to manage the website content on each page or the page design like on the hompage we should be able to set the section's position up or down". The owner chose "Homepage + inner pages" for the reorder and show/hide control. On 2026-10-22 the owner added: "complete and deploy it with best decision. i will be afk now but i want it deployed. deploy multiple agents ... multi agents to complete asap".
**Builds on:** D-044 super admin (lead routing, `src/lib/auth/super-admin.ts`), D-007 API envelope, D-028 Hindi review.
**Not in scope:** editing words and photos. That is Phase 3, which will reuse this draft → preview → publish model and history table.

---

## Owner summary

**What you get.** The admin console gets a new screen, **Website & content → Page layout**. On it you:

1. pick one of 10 pages: Home, About, Admissions, Programs, Results, Centres, Hostels, Resources, Contact or Student tools;
2. see that page's sections listed from top to bottom;
3. move a section up or down with buttons (no dragging, so it also works with a keyboard and on a tablet);
4. show or hide a section;
5. **save a draft**, then **preview** it on the real page (only you see it, with a "Draft preview" banner at the top);
6. **publish** it, which puts it live straight away;
7. **reset** a page to its original order at any time;
8. read a **history** of who changed what and when. Each change also goes into the Activity log.

**Rules the screen enforces:**
- The top banner always stays first, and the closing "enquire" band always stays last.
- On the homepage, the student tools section can never be the last section (your rule).
- Sections that buttons and links elsewhere on the website point to can be moved but never hidden. Examples are the admission enquiry form, the FAQs and the contact form. The same applies to the section that carries a page's "verified / demo" note.
- Every page keeps at least one visible section that always shows.

**Who can change it.** Only a **super admin** can change layouts. Other admins can open the screen and see the live order and the history, but cannot change anything.

**Nothing changes until someone publishes.** Until then every page looks exactly as it does today, with the same order and the same colours. When you reorder sections, the white and light-grey section backgrounds keep alternating correctly.

**Speed.** Pages stay pre-built and fast. Publishing refreshes only the page you changed.

**After this is deployed:**
- Open the **Users** page and check that you are marked as a super admin. If the site has more than one admin and nobody has been marked yet, the server command `npm run auth:super-admin -- grant <login id>` does it.
- Just after a release, the first visit to a page may show the original order once. After that it shows your published order.

---

## 1. Facts checked (repo + Next 16.4.2 docs, 2026-10-22)

### Caching and rendering
- **Caching mode.** `cacheComponents: true` and `partialPrefetching: true` are on. No `"use cache"` exists in `src/` yet.
- **Synchronous SQLite counts as "predictable" I/O.**
  - A page that read the database without `"use cache"` would have the result baked in at build time and never refreshed. So the layout read must be `"use cache"` + `cacheTag`, and publishing must revalidate the tag.
  - Route handlers cannot use `updateTag`. They use `revalidateTag(tag, profile: string | { expire?: number })`; the one-argument form is deprecated. The repo uses `revalidateTag(tag, { expire: 0 })` (`04-functions/revalidateTag.md`).
- **`cacheLife`** (`04-functions/cacheLife.md` → "Prerendering behavior"):
  - A cache entry is left out of the prerender only when `revalidate` is 0, `expire` is under 5 minutes, or `stale` is under 30 seconds.
  - Presets: `"minutes"` = stale 5 min / revalidate 1 min / expire 1 h. `"max"` = 5 min / 30 days / 1 year.
  - Only one `cacheLife` call may run per invocation. Conditional branches are fine.
- **Draft Mode with Cache Components** (`02-guides/draft-mode.md`, `dist/server/request/draft-mode.js`):
  - `(await draftMode()).isEnabled` can be read inside `"use cache"`. While it is on, cached functions re-run on every request and the page is served `no-store`.
  - It returns `false` during build or prerender without making the page dynamic.
  - `enable()` and `disable()` work only in route handlers or server actions.
  - A route handler's mutable cookies are merged into **any** `Response` it returns (`app-route/module.js`, `appendMutableCookies` before returning). So `new Response(null, { status: 303, headers: { Location } })` carries the draft cookie.
- **Next APIs outside the Next runtime.**
  - `cacheTag()` and `cacheLife()` throw when `process.env.__NEXT_USE_CACHE` is unset (the case under vitest). `draftMode()` throws with no request store.
  - About 23 tests render site pages directly (`await Page()` then `renderToStaticMarkup`), so the loader skips these calls when `NODE_ENV === "test"`. Next compiles `NODE_ENV` in, so this check is true in every Next build.
  - Under vitest an unset `AUTH_DB_PATH` resolves to an in-memory database (`resolveDbPath`), so reading the database in tests is safe.
  - `renderToStaticMarkup` cannot render async components outside `<Suspense>`, so every new piece of page UI must be synchronous.
- **Build environment.**
  - `NEXT_PHASE === "phase-production-build"` is set before the static workers start (`next/dist/build/index.js:1232`). It is not set at runtime.
  - The Docker build has no database: `AUTH_DB_PATH` is set only at runtime, and calling `getDb()` at build would create `/app/.data/aspire.sqlite` inside the image. The loader must not touch the database during the build.

### Proxy, auth and super admin
- **Proxy.** `/api/(student|parent|admin|crm)/**` is a portal API (`src/lib/auth/paths.ts` `PORTAL_API`). `src/proxy.ts` answers **401 JSON before the handler runs** when there is no session cookie. Other `/api/**` paths pass through (`isNonLocalizedPath`). The optional preview-access Basic-auth gate applies everywhere.
- **Super admin** (D-044) is already in `src/lib/auth/super-admin.ts`:
  - `isSuperAdmin(userId, db = getDb(), now = Date.now())` first runs the one-time bootstrap rule: with zero grants and exactly one enabled admin, that admin becomes super admin.
  - `requireSuperAdmin(request, { write })` is `requireAdmin` (same-origin check for writes, signed-in admin, 401/403, temporary-password 403) followed by 403 "Only a super admin can do this." It logs as `admin_users`.
  - Grants are made with `upsertGrant(db, { userId, via: "admin" | "cli" | "bootstrap", by, now })` in `src/lib/db/super-admins.ts`. The server command is `npm run auth:super-admin -- grant <login id>` (`SUPER_ADMIN_CLI`).
  - `PortalAccess` is `{ kind: "session"; session: Session } | { kind: "preview" }`.
- **Helpers that exist:**
  - `src/lib/auth/responses.ts`: `portalApiError(code, message?, { status?, fieldErrors?, headers? })`, `portalApiItem(data)`, `privateApiHeaders()`
  - `src/lib/auth/request.ts`: `rejectCrossOrigin(request)`, which returns a rejection or null; and `parseJsonBody`
  - `src/lib/server/request-guards.ts`: `readBodyWithLimit`
  - `src/lib/server/rate-limit.ts`: `SlidingWindowRateLimiter#check(key)`
  - `src/lib/auth/log.ts`: `exceptionCode`
  - `src/lib/auth/route-helpers.ts`: `requireAdmin`
  - `src/i18n/config.ts`: `htmlLang`
  - `src/i18n/paths.ts`: `localePath`
  - `ApiErrorCode` has no `conflict` code.

### Database and audit log
- **Audit details.** `recordAudit` → `sanitizeAuditDetails` keeps only string, number, boolean and null values (at most 20 keys; strings are cut at 200 characters). Arrays and objects are **silently dropped**.
- **Feature schemas.** `src/lib/db/features/index.ts` now lists `predictor, mocktest, ask, planner, mcp, crm, superadmin, crm_intake, qb`.
  - `src/lib/qb/core-db.test.ts` asserts that `qb` is last.
  - `src/lib/db/db.test.ts` has the table-prefix regex **twice** (about lines 92 and 102): `(predictor|mocktest|ask|planner|mcp|crm|qb|superadmin)`.

### Admin console files
- **Audit labels.** `AuditLog.tsx` `ACTION_KEYS` has 14 entries. Lead routing's `auth.super_admin_*` actions are not in it yet, and lead routing may add them.
- **Nav.** In `areas.ts`, the `website` group is `[{ key: "website", href: "/admin/website", icon: MonitorCheck }]`. `portal-ui.test.ts` has `ADMIN_PAGES` at about line 703. `ListOrdered` is available in lucide-react 1.59.
- **Reading `?page=`.** `admin/audit/page.tsx` reads `searchParams` inside `<Suspense>` within the session branch of `PortalGate`. Cache Components requires this pattern.

### Public pages
- **In-page anchors other places link to** (so their sections cannot be hidden):
  - `/admissions#enquiry` (about 50 links)
  - `/admissions#faqs`
  - `#next-steps`
  - `#downloads` and `/resources#downloads`
  - `#articles`
  - `#contact-form`
  - `#hostels-by-campus`, which includes `/hostels#hostel-<slug>`
  - `/centres#<slug>`, which needs the centre directory
- **Default tone.** `Section`, `BleedSplit` and `CtaBleedSplit` all default to `tone="white"`.
- **Homepage rhythm today.** Sections that bring their own background (the stats band, the navy centres split, the photo CTA) restart the white/surface rhythm at white after them. `StatsBand` renders `null` when it has no items, and `CentresShowcase` renders `null` when there are no centres.

### Decision log
- The decision log reaches D-058. The integrator takes the next free number.

---

## 2. Decisions ("best decision" on the owner's behalf)

| # | Decision |
|---|---|
| D1 | **Fixed parts.** Each page's hero is always first. The page draws it and it is never stored. The closing CTA is pinned last where a page has one (home, about, programs, results, centres, hostels, resources), and so is the /tools closing note. Admissions and contact have no closing band, so all their sections are movable. |
| D2 | **Non-hideable sections.** Some sections can be moved but not hidden: those that other places link to by anchor (*linked*), those that carry the page's "demo / verified" notice (*notice*), and those that are the page's main content (*core*). See §3. |
| D3 | **Save draft → preview draft → publish.** Publish publishes the saved draft, which is what was previewed. A per-page `revision` number guarantees that nobody changed it in between. A stale revision gets 409. |
| D4 | **Reset to default** publishes the original order immediately (after an inline confirmation) and deletes any draft. "Default" means "no stored row", so the page keeps following future code changes. |
| D5 | **Who may edit: effective super admins** (`isSuperAdmin`, D-044). Other admins see the screen read-only: the live order per page and the history. The only seam is `src/lib/page-layout/access.ts` (`isLayoutEditor` / `requireLayoutEditor`). |
| D6 | **Preview uses Next Draft Mode.**<br>• The enable route is `/api/admin/page-layout/preview`, for super admins only.<br>• The **exit route is `/api/page-layout/preview/exit`, outside the portal API**, so "Exit preview" works even after sign-out (the proxy would otherwise answer 401 JSON).<br>• The draft cookie stays in that browser until "Exit preview" or the browser closes. This is accepted: a draft order is not secret, and a draft is never cached or shown to visitors. |
| D7 | **Caching.**<br>• **Build:** the default order, with `cacheLife({ stale: 300, revalidate: 1, expire: 600 })`. It is still prerendered and refreshed on the first request.<br>• **Runtime:** `cacheLife("max")`, tagged `page-layout:<page>` plus the global tag `page-layout`.<br>• **Database read failure:** `cacheLife("minutes")` and the default order.<br>• **Publish and reset** call `revalidateTag(pageLayoutTag(page), { expire: 0 })`.<br>• **Consequence:** right after a release, the first visit to a page path may still show the original order once. From then on the stored layout shows. A warm-up after deploy removes even that (§12.6). |
| D8 | **Background tone** always comes from position (§4). The **photo side** comes from position only where today's photo sides already follow position in every content mode: about, admissions, results, contact and tools. Elsewhere it stays fixed. |
| D9 | **Results page notice.** The "demo / verified" notice goes into whichever of `stories` or `archive` renders first. `archive` cannot be hidden. |
| D10 | **/tools hero card** lists all 4 tools in layout order, hidden ones included, because the tool pages still exist. |
| D11 | **Storage.**<br>• One SQLite feature, `page_layout`, with one table for draft and published layouts and one append-only history table with before/after snapshots.<br>• Each change also writes a core `audit_log` row (`layout.*`) with **flat** details only: `{ page, revision, moved, hidden, shown, order }`.<br>• The page's revision is the newest history id for that page. |
| D12 | **Validation.**<br>• Unknown and pinned keys are ignored. Sections missing from a stored or submitted list are inserted at their default position.<br>• Real violations get 422: duplicates, hiding a non-hideable section, `not_last`, `none_visible`.<br>• A stored layout that breaks a rule (possible only after a code change) falls back to the default and is logged. |
| D13 | **"Nothing visible" means "no visible section that always shows".** A page must keep at least one visible section that is not conditional. Otherwise a production page could be left with only a hero and a closing band. |
| D14 | **Blocked controls use `aria-disabled="true"`, never `disabled`** (move buttons, show checkboxes, Save, Preview, Publish, Reset). They stay focusable, the handler ignores them, and the reason is linked with `aria-describedby`, so keyboard and screen-reader users actually reach it. |
| D15 | **These 10 routes become regenerating rather than fully static.** They are still prerendered at build, then re-rendered on the server with the runtime environment.<br>• Build-time values must match runtime: `SHOW_PLACEHOLDER_CONTENT` (compose passes the same value to build and run) and `ENQUIRY_STORE` (default `crm`).<br>• The integrator confirms this. |

---

## 3. Section registry (`src/lib/page-layout/registry.ts`, client-safe)

**Column legend.**
- **bg:** *toned* means white or surface by position. *own* means the section brings its own background and restarts the rhythm at white after it.
- **keep:** the section can be moved but not hidden. The reason is shown to the editor:
  - *linked*: anchors or links on the site lead here;
  - *notice*: it carries the page's demo/verified note;
  - *core*: it is the main content of the page.
- **cond:** rendered only when its data exists. It gets a hint in the editor, and it does not count as an "always-shown" section for `not_last` or `none_visible`.

### Home `/`
| key | en label | hi label | flags |
|---|---|---|---|
| hero | Top banner and enquiry form | ऊपरी बैनर और पूछताछ फ़ॉर्म | pin first |
| stats | Aspire at a glance (key figures) | Aspire एक नज़र में (मुख्य आँकड़े) | own, cond |
| results | Results, year by year | वर्षवार परिणाम | |
| programs | Programs | प्रोग्राम | |
| tools | Free student tools | मुफ़्त विद्यार्थी टूल्स | **notLast** |
| why | Why Aspire | Aspire ही क्यों | |
| centres | Our centres | हमारे केंद्र | own, cond |
| life | Student life | विद्यार्थी जीवन | |
| voices | Voices from families | परिवारों की बातें | cond |
| impact | Results list by year (chart) | वर्षवार परिणाम सूची (चार्ट) | cond |
| resources | Guidance articles | मार्गदर्शन लेख | cond |
| cta | Closing invitation to enquire | अंत में पूछताछ का आमंत्रण | pin last, own |

### About `/about`
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner | ऊपरी बैनर | pin first |
| story | Our story | हमारी कहानी | |
| mission | Our mission | हमारा मिशन | cond |
| approach | How learning is organised | पढ़ाई कैसे होती है | |
| values | Our principles | हमारे सिद्धांत | |
| results | Results from previous batches | पिछले बैचों के परिणाम | |
| journey | Milestones | हमारी उपलब्धियाँ | cond |
| explore | Hostels and campuses | हॉस्टल और कैंपस | |
| spaces | Learning spaces (photos) | पढ़ाई की जगहें (फ़ोटो) | |
| cta | Closing invitation to enquire | अंत में पूछताछ का आमंत्रण | pin last |

### Admissions `/admissions` (no pinned last)
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner | ऊपरी बैनर | pin first |
| enquiry | Admission enquiry form | प्रवेश पूछताछ फ़ॉर्म | keep linked |
| next | What happens next | आगे क्या होता है | keep linked |
| results | Results from previous batches | पिछले बैचों के परिणाम | |
| scholarships | Scholarships | छात्रवृत्ति | cond |
| downloads | Prospectus and test papers | प्रॉस्पेक्टस और टेस्ट पेपर | cond |
| faqs | Frequently asked questions | अक्सर पूछे जाने वाले प्रश्न | keep linked |

### Programs list `/programs`
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner and program picker | ऊपरी बैनर और प्रोग्राम चुनने का विकल्प | pin first |
| directory | Program list | प्रोग्राम सूची | keep core |
| tracks | Preparation tracks | तैयारी के ट्रैक | |
| guide | What each program page covers | हर प्रोग्राम पेज में क्या मिलेगा | |
| cta | Closing invitation to enquire | अंत में पूछताछ का आमंत्रण | pin last |

### Results `/results`
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner | ऊपरी बैनर | pin first |
| stories | Student stories | विद्यार्थियों की कहानियाँ | cond |
| archive | Results archive | परिणाम संग्रह | keep notice |
| rankers | Rankers list | रैंकर सूची | cond |
| method | How results are published | परिणाम कैसे प्रकाशित होते हैं | |
| cta | Closing invitation to enquire | अंत में पूछताछ का आमंत्रण | pin last |

### Centres `/centres`
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner and centre finder | ऊपरी बैनर और केंद्र खोजें | pin first |
| directory | Centre directory | केंद्र सूची | keep linked |
| districts | Districts each campus serves | हर कैंपस किन ज़िलों के लिए है | |
| cta | Closing invitation to enquire | अंत में पूछताछ का आमंत्रण | pin last |

### Hostels `/hostels`
**Page note** (`pages.hostels.note`):
- en "Until hostel details are verified, this page shows one 'details coming soon' section instead of the sections below."
- hi "हॉस्टल का विवरण सत्यापित होने तक इस पेज पर नीचे के सेक्शन की जगह एक 'विवरण जल्द आएगा' सेक्शन दिखता है।"

| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner | ऊपरी बैनर | pin first |
| intro | Hostel overview | हॉस्टल का परिचय | keep notice |
| campuses | Hostels by campus | कैंपस के अनुसार हॉस्टल | keep linked, cond |
| care | Safety, study and care | सुरक्षा, पढ़ाई और देखभाल | |
| rooms | Rooms | कमरे | cond |
| day | A day in residence | हॉस्टल में एक दिन | cond |
| cta | Closing invitation to enquire | अंत में पूछताछ का आमंत्रण | pin last |

### Resources `/resources`
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner | ऊपरी बैनर | pin first |
| types | Find what you need | ज़रूरत की चीज़ ढूँढें | |
| downloads | Planners, papers and prospectus | प्लानर, पेपर और प्रॉस्पेक्टस | keep linked, cond |
| articles | Study guidance and updates | पढ़ाई का मार्गदर्शन और अपडेट | keep linked |
| results | Results from previous batches | पिछले बैचों के परिणाम | |
| cta | Closing invitation to enquire | अंत में पूछताछ का आमंत्रण | pin last |

### Contact `/contact` (no pinned last)
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner and centre finder | ऊपरी बैनर और केंद्र खोजें | pin first |
| form | Enquiry form | पूछताछ फ़ॉर्म | keep linked |
| details | Contact details | संपर्क विवरण | |
| help | Help choosing a program or centre | प्रोग्राम या केंद्र चुनने में मदद | |
| desks | Campus admissions desks | कैंपस प्रवेश डेस्क | cond |

### Student tools `/tools`
| key | en | hi | flags |
|---|---|---|---|
| hero | Top banner with links to each tool | ऊपरी बैनर और हर टूल के लिंक | pin first |
| rancho | Rancho app card | रैंचो ऐप कार्ड | own (white band) |
| predictor | Rank and college predictor | रैंक और कॉलेज प्रेडिक्टर | |
| mockTests | Mock tests | मॉक टेस्ट | |
| ask | Ask Rancho (doubt solver) | रैंचो से पूछें (डाउट) | |
| planner | Study planner | स्टडी प्लानर | |
| note | Closing note about saving your work | अंत की सूचना (काम सहेजने के बारे में) | pin last |

### Hints for conditional sections (full sentences, `pages.<page>.sections.<key>.hint`)
| Section(s) | en | hi |
|---|---|---|
| home.stats | Shown only when the key figures are verified. | यह सेक्शन तभी दिखता है जब आँकड़े सत्यापित हों। |
| home.centres | Shown only when centre details are verified. | यह सेक्शन तभी दिखता है जब केंद्रों का विवरण सत्यापित हो। |
| home.voices | Shown only when testimonials are approved. | यह सेक्शन तभी दिखता है जब प्रशंसापत्र स्वीकृत हों। |
| home.impact | Shown only when the results list is published. | यह सेक्शन तभी दिखता है जब परिणाम सूची प्रकाशित हो। |
| home.resources | Shown only when articles are published. | यह सेक्शन तभी दिखता है जब लेख प्रकाशित हों। |
| about.mission, about.journey | Shown only when the institute profile is verified. | यह सेक्शन तभी दिखता है जब संस्थान का प्रोफ़ाइल सत्यापित हो। |
| admissions.scholarships | Shown only when scholarship-test dates are verified. | यह सेक्शन तभी दिखता है जब छात्रवृत्ति टेस्ट की तारीख़ें सत्यापित हों। |
| admissions.downloads, resources.downloads | Shown only when downloads are published. | यह सेक्शन तभी दिखता है जब डाउनलोड प्रकाशित हों। |
| results.stories | Shown only when featured results are verified. | यह सेक्शन तभी दिखता है जब चुने हुए परिणाम सत्यापित हों। |
| results.rankers | Shown only when the rankers list is published. | यह सेक्शन तभी दिखता है जब रैंकर सूची प्रकाशित हो। |
| hostels.campuses, hostels.rooms, hostels.day | Shown only when hostel details are verified. | यह सेक्शन तभी दिखता है जब हॉस्टल का विवरण सत्यापित हो। |
| contact.desks | Shown only when campus desk details are verified. | यह सेक्शन तभी दिखता है जब कैंपस डेस्क का विवरण सत्यापित हो। |

### Registry shape
Use `as const satisfies`, so the key unions are typed:

```ts
export const LAYOUT_PAGE_KEYS = ["home","about","admissions","programs","results","centres","hostels","resources","contact","tools"] as const;
export type LayoutPageKey = (typeof LAYOUT_PAGE_KEYS)[number];
export interface LayoutSectionDef {
  readonly key: string;                         // /^[a-z][a-zA-Z0-9]{0,39}$/
  readonly pin?: "first" | "last";              // "first" only for "hero"
  readonly keep?: "linked" | "notice" | "core"; // not hideable; the editor shows the reason
  readonly background?: "toned" | "own";        // default "toned"
  readonly conditional?: boolean;
  readonly notLast?: boolean;
}
export interface LayoutPageDef { readonly path: string; readonly sections: readonly LayoutSectionDef[] }
export const LAYOUT_PAGES = { home: { path: "/", sections: [ { key: "hero", pin: "first" }, { key: "stats", background: "own", conditional: true }, … ] }, … } as const satisfies Record<LayoutPageKey, LayoutPageDef>;
export type LayoutSectionKey<P extends LayoutPageKey> = Exclude<(typeof LAYOUT_PAGES)[P]["sections"][number]["key"], "hero">;
export const isLayoutPageKey = (v: unknown): v is LayoutPageKey => …;
export function sectionDef(page: LayoutPageKey, key: string): LayoutSectionDef | undefined;
export function isHideable(def: LayoutSectionDef): boolean;   // !def.pin && !def.keep
export function pinnedLastKey(page: LayoutPageKey): string | null;
export function movableKeys(page: LayoutPageKey): string[];  // default order, without pins
// Paths shared by the banner, the API and the editor:
export const PAGE_LAYOUT_ADMIN_PATH = "/admin/page-layout";
export const PAGE_LAYOUT_API = "/api/admin/page-layout";
export const PAGE_LAYOUT_PREVIEW_PATH = "/api/admin/page-layout/preview";
export const PAGE_LAYOUT_PREVIEW_EXIT_PATH = "/api/page-layout/preview/exit"; // outside the portal API (D6)
```

**Shared types** (`src/lib/page-layout/types.ts`, client-safe). Both server and client import these:
- `StoredEntry = { key: string; hidden: boolean }`
- `LayoutIssue = { code: "not_last" | "none_visible"; key?: string }`
- `LayoutAction = "save_draft" | "discard_draft" | "publish" | "reset"`
- `PageLayoutStateView` (§5)
- `ResolvedPageLayout<P>` (§6)

---

## 4. Rendering model (`src/components/page-layout/render.tsx`, synchronous, server-safe)

```ts
export type SectionContext<K extends string> = {
  key: K;
  tone: "white" | "surface";   // own-background sections get "white" and ignore it
  side: "right" | "left";      // tone === "white" ? "right" : "left"; used only on the D8 pages
  rendered: readonly K[];      // keys actually rendered, in order (results notice rule)
};
export type SectionSlot<K extends string> = ((ctx: SectionContext<K>) => ReactNode) | null | false | undefined;
export type LayoutSlots<P extends LayoutPageKey> = { readonly [K in LayoutSectionKey<P>]: SectionSlot<LayoutSectionKey<P>> };

export function renderLayoutSections<P extends LayoutPageKey>(layout: ResolvedPageLayout<P>, slots: LayoutSlots<P>): ReactNode[];
export function PageLayoutFrame<P extends LayoutPageKey>(p: { layout: ResolvedPageLayout<P>; banner: ReactNode; hero: ReactNode; slots: LayoutSlots<P> }): ReactNode;
// renders <>{banner}{hero}{renderLayoutSections(layout, slots)}</>
```

**Algorithm:**
1. `rendered = layout.order.filter(k => slots[k])`.
2. Set `next = "white"`.
3. For each rendered key:
   - **own background:** `tone = "white"`, then `next = "white"`.
   - **toned:** `tone = next`, then flip `next`.
4. Wrap each result in `<Fragment key={key}>`.

**Slot contract (binding on every page).** A slot is `null` or `false` exactly when today's code would render nothing for it: either a data condition, or a component that returns `null`. That keeps the rhythm identical.

**At the default layout this reproduces every page's current tones:**
- **Home, demo mode:** stats (own), results W, programs S, tools W, why S, centres (own), life W, voices S, impact W, resources S.
- **Home, production:** the same without the own-background sections that render nothing.
- **Inner pages:** alternate from white after the hero.
- **Tools:** rancho card (own), then predictor W.

**Preview banner** (`src/components/page-layout/preview-banner.tsx`):
- `export async function layoutPreviewBanner(layout): Promise<ReactNode>` is an async *function*, not a component.
  - It returns `null` unless `layout.preview` is set.
  - Otherwise it reads `getLocale()` and `getMessages("layout")` and returns the synchronous `<LayoutPreviewBanner>`.
- `<LayoutPreviewBanner>` is an `<aside aria-labelledby>` with:
  - a gold accent and an `<h2>` reading "Draft preview";
  - one sentence (`banner.draft` when `hasDraft`, else `banner.noDraft`);
  - `<form method="post" action={PAGE_LAYOUT_PREVIEW_EXIT_PATH}>` with hidden `page` and `lang` and a submit button "Exit preview";
  - a link "Back to the layout editor" to `` `${localePath(PAGE_LAYOUT_ADMIN_PATH, locale)}?page=${page}` ``.
- Targets are at least 44 px. The banner sits in the flow above the hero and is never fixed or sticky.

---

## 5. Storage

### `src/lib/db/features/page-layout.ts` (import-free, idempotent; export `schema`)
```sql
CREATE TABLE IF NOT EXISTS page_layout_state (
  page TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
  sections TEXT NOT NULL,              -- JSON [{"key":"results","hidden":false}, …] movable sections only
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (page, stage)
);
CREATE TABLE IF NOT EXISTS page_layout_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save_draft', 'discard_draft', 'publish', 'reset')),
  before_sections TEXT NOT NULL,       -- normalised JSON, see below
  after_sections TEXT,                 -- normalised JSON, or NULL for discard_draft / reset
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS page_layout_history_page_idx ON page_layout_history (page, id);
```
- There is no CHECK on `page`, so new pages need no table rebuild. The code validates page keys.
- Register `{ name: "page_layout", sql: pageLayout }` in `features/index.ts` **immediately before `qb`**, which stays last.
- Add `page_layout` to **both** prefix regexes in `src/lib/db/db.test.ts`.

**What the history rows hold** (always normalised against the registry at write time):

| action | before_sections | after_sections |
|---|---|---|
| save_draft | the draft before, else the live order | the new draft |
| discard_draft | the draft that was discarded | NULL |
| publish | the live order before (the default when there is no row) | the new live order |
| reset | the live order before | NULL (the default) |

### `src/lib/page-layout/store.ts` (server-only; uses `getDb`, `withTransaction`, `recordAudit`)
- `readStage(db, page, stage): StoredEntry[] | null` parses JSON defensively. Invalid JSON or a non-array counts as missing.
- `revisionOf(db, page)` = `SELECT COALESCE(MAX(id), 0) FROM page_layout_history WHERE page = ?`.
- `readLayoutForRender(page, preview)` returns `{ ok: true; entries: StoredEntry[] | null; source: "default" | "published" | "draft"; hasDraft: boolean } | { ok: false }`.
  - It never throws. On error it catches, logs `{ event: "page_layout", action: "read", outcome: "error", reason: exceptionCode(e) }` and returns `{ ok: false }`.
  - In preview it reads the draft, falling back to the published row.
- `getPageLayoutState(db, page, historyLimit = 20): PageLayoutStateView` and `listPageLayoutStates(db): Record<LayoutPageKey, PageLayoutStateView>`.
  - Both LEFT JOIN `users.display_name` for `updated_by` and `actor_id`.
  - Sections are always normalised against the current registry.

**The single write path:**
```ts
applyLayoutAction(db, { page, action, revision, entries?, actorId: string | null, now })
  → { ok: true; state: PageLayoutStateView }
  | { ok: false; error: "conflict" }
  | { ok: false; error: "invalid"; issues: string[] }
  | { ok: false; error: "no_draft" }
```

It runs inside `withTransaction` (BEGIN IMMEDIATE):
1. **Revision check.** If `revisionOf(db, page) !== revision`, return `conflict`.
2. **The action:**
   - `save_draft`: `validateEntries` (§7), then upsert the draft row with the normalised entries.
   - `discard_draft`: requires a draft row (else `no_draft`); delete it.
   - `publish`: requires a draft row (else `no_draft`). Re-validate it, copy it to `published` and delete the draft. **If it equals the default order, delete the published row instead**, so the page is default again.
   - `reset`: delete both rows. Allowed even when nothing is stored, and it still writes history.
3. **History.** Append a history row with the before/after values from the table above.
4. **Audit.** `recordAudit(db, { actorId, action: "layout." + action, target: "page-layout:" + page, details, now })`. The details are flat (D11):
   - `page`;
   - `revision` (the new history id);
   - `moved`, `hidden`, `shown`: counts from `describeChanges(before, after ?? <live order after the action>)`;
   - `order`: a comma-separated list of the after-order, with hidden keys prefixed by `-`, for example `"results,programs,-why,tools,life"`. It is `"default"` for reset and for a publish that returns to the default; discard leaves it out.
5. **Return** `{ ok: true, state: getPageLayoutState(db, page) }`.

```ts
// src/lib/page-layout/types.ts
export interface PageLayoutStateView {
  page: LayoutPageKey;
  revision: number;
  published: { sections: StoredEntry[]; custom: boolean; updatedAt: number | null; updatedBy: string | null };
  draft: { sections: StoredEntry[]; updatedAt: number; updatedBy: string | null } | null;
  history: { id: number; action: LayoutAction; actor: string | null; at: number; before: StoredEntry[]; after: StoredEntry[] | null }[];
}
```

---

## 6. Loader (`src/lib/page-layout/loader.ts`, server-only)

```ts
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { draftMode } from "next/headers";

export const PAGE_LAYOUT_TAG = "page-layout";
export const pageLayoutTag = (page: LayoutPageKey) => `page-layout:${page}`;
/** Next's cache / request APIs exist only in the Next runtime; vitest renders pages without them. */
const IN_NEXT = process.env.NODE_ENV !== "test";
/** Build: still prerendered (stale ≥ 30 s, expire ≥ 5 min, cacheLife.md), refreshed on the first request (D7). */
const BUILD_LIFE = { stale: 300, revalidate: 1, expire: 600 } as const;

export async function getPageLayout<P extends LayoutPageKey>(page: P): Promise<ResolvedPageLayout<P>> {
  "use cache";
  const building = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD; // the image has no database
  const preview = IN_NEXT && !building ? (await draftMode()).isEnabled : false;
  const read = building
    ? ({ ok: true, entries: null, source: "default", hasDraft: false } as const)
    : readLayoutForRender(page, preview);
  if (IN_NEXT) {
    if (building) cacheLife(BUILD_LIFE);
    else cacheLife(read.ok ? "max" : "minutes"); // exactly one call per invocation
    cacheTag(pageLayoutTag(page), PAGE_LAYOUT_TAG);
  }
  return resolvePageLayout(page, read.ok ? read.entries : null, {
    source: read.ok ? read.source : "default",
    preview: preview ? { hasDraft: read.ok && read.hasDraft } : null,
  });
}
```

`ResolvedPageLayout<P>` is serialisable:
```ts
{ page: P;
  entries: { key: LayoutSectionKey<P>; hidden: boolean }[];   // all movable sections, in order
  order: LayoutSectionKey<P>[];                                // visible movable sections, then the pinned-last key
  source: "default" | "published" | "draft";
  preview: { hasDraft: boolean } | null }
```

---

## 7. Validation (`src/lib/page-layout/resolve.ts`, pure and client-safe; the editor imports it too)

**`normalizeEntries(page, stored | null): StoredEntry[]`** never throws:
1. `null` gives the default order.
2. Drop unknown keys, pinned keys (`hero`, the pinned-last key) and repeats. The first occurrence wins.
3. `hidden` becomes `hidden === true && isHideable(def)`.
4. Each movable key that is missing, taken in default order, is inserted right after the nearest preceding default-order sibling that is present in the list, else at index 0.

**`layoutIssues(page, entries): LayoutIssue[]`**:
- `not_last` (with `key`): raised for each visible `notLast` section unless at least one **later** entry is visible and not `conditional`.
- `none_visible`: raised when no entry is both visible and not `conditional` (D13).

**`validateEntries(page, submitted)`** is used for API writes:
1. Collect `duplicate:<key>` and `cannot_hide:<key>`, checked **before** normalising.
2. Normalise.
3. Add `layoutIssues`, coded as `not_last:<key>` or `none_visible`.
4. Return `{ ok: true, entries } | { ok: false, issues: string[] }`.

Unknown, pinned and missing keys are not errors (D12).

**`resolvePageLayout(page, stored, meta)`:**
1. Normalise.
2. If `layoutIssues` is non-empty, use the default and log `{ event: "page_layout", action: "resolve", outcome: "fallback" }`. This is reachable only after a registry change.
3. `order` = visible keys + the pinned-last key.

**`defaultPageLayout(page)`**: the default `ResolvedPageLayout`, for tests and the read-only preview.

**`describeChanges(before, after)`** returns `{ moved: { key, from, to }[]; hidden: string[]; shown: string[] }`:
- **moved:** keys outside the longest common subsequence of the two orders. n ≤ 16, so O(n²) is fine.
- **Positions** are 1-based page positions counting the hero as 1, so the first movable entry is 2. Hidden entries are counted too. This matches the editor's row numbers.

**`sameOrder(a, b)`**: true when two entry lists have the same keys, order and hidden flags (used for "equals default" and "dirty").

---

## 8. Access (`src/lib/page-layout/access.ts`, server-only)

```ts
import { requireAdmin } from "@/lib/auth/route-helpers";
import { isSuperAdmin, requireSuperAdmin } from "@/lib/auth/super-admin";

/** SUPER-ADMIN SEAM (D-044): the only place that decides who may change page layouts. */
export function isLayoutEditor(session: Session): boolean {
  return session.role === "admin" && isSuperAdmin(session.userId);
}

/** edit → requireSuperAdmin (same-origin for writes, admin, super admin); else requireAdmin. Writes are rate-limited. */
export async function requireLayoutEditor(request: Request, opts: { write: boolean; edit: boolean }): Promise<GuardResult>;

export function layoutLog(action: string, outcome: string, reason?: string): void; // one JSON line, event "page_layout", fixed codes only
export function layoutServerError(action: string, error: unknown): Response;        // unstable_rethrow(error) FIRST, log exceptionCode, 500 envelope
```

- **Rate limit:** writes are limited to 60 per user per 10 minutes (`SlidingWindowRateLimiter`, key = `userId`). Going over returns 429 `portalApiError("rate_limited", …, { headers: { "Retry-After": seconds } })`. There is no read limit. Export `resetLayoutRateLimitForTests()`, which calls the limiter's `reset()`, so API tests do not share counts.
- **No duplicated checks.** Same-origin and role checks are not re-implemented here; the super-admin guard's log name (`admin_users`) is accepted. Each route still writes one `layoutLog` line.

---

## 9. Admin API

All JSON responses use the D-007 envelope (`portalApiItem` / `portalApiError`, both with `privateApiHeaders`: `no-store`, `X-Robots-Tag`).

| Method + path | Who | Body | Responses |
|---|---|---|---|
| `GET /api/admin/page-layout/[page]` | admin | – | 200 `PageLayoutStateView` · 401/403 · 404 unknown page |
| `POST /api/admin/page-layout/[page]` | super admin, same-origin | JSON ≤ 4 KB: `{ action: "save_draft", revision, sections }` \| `{ action: "discard_draft" \| "publish" \| "reset", revision }` | 200 new state · 401/403 · 404 · 409 stale revision · 422 · 429 |
| `POST /api/admin/page-layout/preview` | super admin, same-origin | form `page`, `lang` (≤ 1 KB) | 303 to the page (draft mode on) · on failure 303 to the editor · 403 envelope for cross-origin |
| `POST /api/page-layout/preview/exit` | anyone, same-origin | form `page?`, `lang?` (≤ 1 KB) | 303 to that page, else `/` (registry paths only, so no open redirect) · 403 envelope for cross-origin |

### Zod schema (`src/lib/page-layout/schemas.ts`, `.strict()`)
- `revision: z.number().int().min(0).max(2 ** 31)`
- `sections: z.array(z.object({ key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/), hidden: z.boolean() }).strict()).max(32)`
- a discriminated union on `action`

### `[page]` route
**Order of checks:** guard (GET `{ write: false, edit: false }`; POST `{ write: true, edit: true }`) → `isLayoutPageKey` (404) → body (400 / 422) → `applyLayoutAction(getDb(), …, actorId: session.userId, now: Date.now())`.

**Errors:**
- **409:** `portalApiError("bad_request", "This page's layout changed since you opened it.", { status: 409 })`. The client keys on status 409.
- **422:** `portalApiError("validation", "The layout breaks a rule.", { fieldErrors: { sections: issues } })`. Codes: `not_last:<key>`, `cannot_hide:<key>`, `duplicate:<key>`, `none_visible`, `no_draft`.

**After a successful `publish` or `reset`:** call `revalidateTag(pageLayoutTag(page), { expire: 0 })`. Do **not** revalidate on `save_draft` or `discard_draft` (draft pages are always rendered fresh).

**Logging:** one `layoutLog` line per request (`get` / `save_draft` / … with `ok` / `conflict` / `invalid` / `forbidden` / `error`). Unexpected errors go to `layoutServerError`.

### Preview route
1. Run `rejectCrossOrigin(request)`. If it rejects, return a 403 envelope.
2. `readBodyWithLimit(request, 1024)`, then `URLSearchParams`.
   - `lang` = `isLocale(v) ? v : "en"`.
   - The editor URL is `` `${localePath(PAGE_LAYOUT_ADMIN_PATH, lang)}?page=${page}` ``, without `?page` when the page is invalid.
3. Unknown `page`: 303 to the editor.
4. `requireLayoutEditor(request, { write: true, edit: true })`. On failure, 303 to the editor: a signed-out user is sent on to sign in, and a plain admin sees the read-only notice.
5. `(await draftMode()).enable()`.
6. Return `new Response(null, { status: 303, headers: { Location: localePath(LAYOUT_PAGES[page].path, lang), "Cache-Control": "no-store" } })`. The Location is a relative path, so the redirect is safe behind nginx. Next adds the draft cookie.

### Exit route (`src/app/api/page-layout/preview/exit/route.ts`)
1. Run `rejectCrossOrigin` (403 envelope).
2. Read the form as above.
3. `(await draftMode()).disable()`.
4. Return 303 to `localePath(LAYOUT_PAGES[page].path, lang)` when both are valid. Otherwise 303 to `localePath("/", lang valid ? lang : "en")`.

No session is needed. The response is plain `no-store`.

---

## 10. Admin screen

### Files and nav
**Page:** `src/app/[lang]/(portal)/admin/page-layout/page.tsx`, following `admin/audit/page.tsx`:
- `generateMetadata` uses `layout.meta`.
- `<PortalGate area="admin" path="/admin/page-layout">`, which branches on the access kind:
  - **`kind === "session"`:**
    - `<Suspense fallback={checkingAccess}>` around an async child.
    - The child awaits `searchParams`; `initialPage = isLayoutPageKey(p) ? p : "home"`.
    - It renders `<PageLayoutEditor canEdit={isLayoutEditor(access.session)} locale t states={listPageLayoutStates(getDb())} initialPage>`.
  - **`kind === "preview"`** (data-free): `<PageLayoutEditor canEdit={false} previewAccess states={defaultStateViews()} initialPage="home">`.
    - `defaultStateViews()` comes from `editor-model.ts`: revision 0, default published, no draft, empty history.
    - The `layout.previewAccess` notice is shown.

**Nav:** in `src/components/portal/areas.ts`, add `{ key: "pageLayout", href: "/admin/page-layout", icon: ListOrdered }` after `website` in the `website` group. Add `portal.nav.pageLayout` = "Page layout" / "पेज लेआउट".

**Audit labels:** in `AuditLog.tsx`, **append** to `ACTION_KEYS`:

| action | key | en | hi |
|---|---|---|---|
| `layout.save_draft` | `layoutSaveDraft` | Page layout draft saved | पेज लेआउट का ड्राफ़्ट सहेजा |
| `layout.discard_draft` | `layoutDiscardDraft` | Page layout draft discarded | पेज लेआउट का ड्राफ़्ट हटाया |
| `layout.publish` | `layoutPublish` | Page layout published | पेज लेआउट प्रकाशित किया |
| `layout.reset` | `layoutReset` | Page layout reset to the original order | पेज लेआउट मूल क्रम पर लौटाया |

The keys go in `portal.admin.audit.actions`, en and hi.

**Client files** (`src/components/page-layout/`):
- `PageLayoutEditor.tsx` (`"use client"`)
- `LayoutSectionList.tsx`
- `LayoutHistoryList.tsx`
- `editor-model.ts` (pure)
- `editor-api.ts` (fetch helpers that return typed results by status)

### Screen, top to bottom
1. **Header** (`PortalPageHeader`): `layout.title` and `layout.lead`. When `canEdit` is false, a read-only notice (`readOnly.title` / `readOnly.body`, or `previewAccess`).

2. **Page picker.** A native `<select id>` with a visible `<label>` "Page" and the hint linked by `aria-describedby`.
   - Option text is `<name>`, plus ` — <state>` where the state is `picker.unsaved`, `picker.draft` or `picker.custom`, in that priority.
   - Local edits are kept per page in client state, so switching pages loses nothing.
   - `beforeunload` warns while any page has unsaved changes.
   - `?page=` is updated with `history.replaceState`.

3. **Status lines.**
   - Live: `status.liveDefault`, or `status.liveCustom` with the date and name.
   - Draft: `status.draft` or `status.noDraft`.
   - `status.unsaved` when the page has unsaved changes.
   - A link "View the live page" plus `<span class="sr-only">(opens in a new tab)</span>`, with `target="_blank" rel="noopener"`.
   - **Dates:**
     - Format with `Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })`.
     - Every element that prints a formatted date gets `suppressHydrationWarning`, as `UserManager.tsx` does.
     - A missing name uses `history.someone`.

4. **List.** An `<h2 id>` "Sections, top to bottom" over an `<ol aria-labelledby>`. Each row shows its page position as a visible number.
   - **Fixed rows** (hero, pinned last): the number, the label, and a lock icon (`aria-hidden`) with the text "Always first" or "Always last". No controls.
   - **Movable rows:** the number, the label, the conditional hint (muted, full sentence), and a "Hidden" badge when hidden.
   - **Move up / Move down:**
     - native `<button type="button">`, at least 44×44;
     - an icon (`aria-hidden`) plus an `sr-only` text `row.moveUp` / `row.moveDown`.
   - **Show checkbox** (WCAG 2.5.8 and 2.5.3):
     - a native checkbox inside a `<label>` at least 44 px tall;
     - the visible text is `row.show` ("Show on page"), followed by an `sr-only` `row.showFor` ("({section})");
     - it is controlled.
   - **Blocked controls (D14):**
     - They use `aria-disabled="true"`. The handler returns early and the controlled checkbox stays as it was. Activating a blocked control puts its reason into the status region.
     - The reason element is linked with `aria-describedby`:
       - **Rule reasons** are visible in the row: `reasons.notLast`, `reasons.noneVisible`, `keep.<reason>`.
       - **Top and bottom reasons** (`reasons.atTop`, `reasons.atBottom`) are `sr-only`.
     - A move or toggle is blocked when the candidate layout would have an issue that the current layout does not have (compare `layoutIssues(candidate)` with the current issues).
   - **Focus:**
     - Keep refs keyed by `${key}:${direction}`.
     - The click handler records the button to refocus, and a `useLayoutEffect` calls `.focus()` after the update.
     - Focus therefore stays on the same button in the moved row, even when it is now blocked. This is needed because React physically moves the row's node on "Move down".
   - **Announcements:** a polite `role="status"` region reads `announce.moved` (position = the row's page number; total = all rows including fixed ones), `announce.hidden` or `announce.shown`.

5. **Validation summary.** `role="alert"`, rendered only while issues exist (for example, after a 422 or an inconsistent reload). It lists the reason texts.

6. **Action bar.** It is in the normal flow and not sticky (WCAG 2.4.11). Buttons are at least 44 px tall. Blocked states use `aria-disabled` plus a reason linked by `aria-describedby`.

   | Button | When it is shown or blocked |
   |---|---|
   | **Save draft** | Primary while dirty. Blocked when not dirty (`actions.saveNothing`) or while there are issues. Shows `actions.saving` while busy. |
   | **Undo changes** | Shown only while dirty. Goes back to the saved draft, else the published order. |
   | **Preview draft** | `<form method="post" action={PAGE_LAYOUT_PREVIEW_PATH} target="_blank">` with hidden `page` and `lang`. Blocked while dirty (`actions.previewNeedsSave`) or with no draft (`actions.previewNoDraft`); the submit is then prevented. |
   | **Publish draft** | Blocked with no draft (`actions.publishNeedsDraft`) or while dirty (`actions.publishNeedsSave`). |
   | **Discard draft** | Shown only when a draft exists. |
   | **Reset to the original order** | Blocked when the live order is already the default and there is no draft (`actions.resetNothing`). |

   - **Confirmations.** Publish, Discard and Reset each open an inline confirm region: `role="group"`, `aria-labelledby` its title, a body, a confirm button and a cancel button. Focus goes to the confirm button. Escape or Cancel closes the region and returns focus to the trigger.
   - **Outcomes:**
     - **Success:** the `done.*` message goes in the status region, and the server state replaces the local state.
     - **409:** `errors.conflict` appears, with a "Reload" button that GETs the page state and replaces local edits.
     - **422:** the codes are mapped to reason texts in the summary.
     - **401** `errors.signedOut` · **403** `errors.forbidden` · **429** `errors.rateLimited` · network failure `errors.network` · anything else `errors.generic`.

7. **History.** An `<h2>` "History" over a `<ul>`, newest first, 20 entries.
   - Each item reads "{date} — {action sentence}". For `save_draft` and `publish`, add ": " followed by the `describeChanges(before, after)` parts joined with "; ", or `history.noChange`.
   - Example: "22 Oct 2026, 4:05 pm — Anu published: Free student tools moved from position 5 to 7; Voices from families hidden".
   - `reset` and `discard_draft` show only the action sentence.
   - When the actor's account is gone, the name is `history.someone`.
   - With no history: `history.empty`.

**Tablet and phone:**
- Rows use flex-wrap; below `sm` the controls group wraps under the label.
- No drag anywhere (WCAG 2.5.7).
- Use the existing tokens (`text-navy`, `text-muted`, the gold admin accent) and the focus rings already in place.

---

## 11. Messages: new namespace `layout`

**Files:** `src/i18n/messages/en/layout.ts` and `hi/layout.ts`.
- They are plain objects with **no `as const`**, matching the existing file headers. The Hindi file is typed `Messages<"layout">`.
- Register them in `messages/index.ts` and `types.ts`.
- Add a row for `hi/layout.ts` to `docs/hindi-review-register.md` (machine draft, staff-facing).

**Placeholders.** Strings use `{name}`-style placeholders.

**Hindi agreement.** Section labels differ in gender and number. So any Hindi verb that would agree with `{section}` instead agrees with "सेक्शन", and the label is quoted: “{section}” सेक्शन …

| key | en | hi |
|---|---|---|
| meta.title | Page layout | पेज लेआउट |
| meta.description | Choose the order of the sections on each website page and which ones are shown. | वेबसाइट के हर पेज पर सेक्शन का क्रम और कौन-से सेक्शन दिखें, यह चुनें। |
| title | Page layout | पेज लेआउट |
| lead | Move sections up or down and choose which ones are shown. Visitors see a change only after you publish it. | सेक्शन को ऊपर या नीचे करें और चुनें कि कौन-से दिखें। विज़िटर को बदलाव प्रकाशित करने के बाद ही दिखेगा। |
| readOnly.title | Only a super admin can change page layouts | पेज लेआउट केवल सुपर एडमिन बदल सकते हैं |
| readOnly.body | You can see the order that is live on each page and its history. | आप हर पेज का अभी लाइव क्रम और उसका इतिहास देख सकते हैं। |
| previewAccess | Preview: sign in as an admin to see the saved layouts. | प्रीव्यू: सहेजे गए लेआउट देखने के लिए एडमिन के रूप में साइन इन करें। |
| picker.label | Page | पेज |
| picker.hint | The list below shows this page's sections from top to bottom. | नीचे की सूची में इस पेज के सेक्शन ऊपर से नीचे के क्रम में हैं। |
| picker.unsaved / draft / custom | unsaved changes / draft / custom order | बिना सहेजे बदलाव / ड्राफ़्ट / बदला हुआ क्रम |
| status.liveDefault | Live now: the original order. | अभी लाइव: मूल क्रम। |
| status.liveCustom | Live now: a custom order, published {date} by {name}. | अभी लाइव: बदला हुआ क्रम, {date} को {name} ने प्रकाशित किया। |
| status.draft | Draft saved {date} by {name}. Not live yet. | ड्राफ़्ट {date} को {name} ने सहेजा। अभी लाइव नहीं है। |
| status.noDraft | No draft. | कोई ड्राफ़्ट नहीं। |
| status.unsaved | You have changes that are not saved. | आपके कुछ बदलाव अभी सहेजे नहीं गए हैं। |
| viewLive / newTab | View the live page / (opens in a new tab) | लाइव पेज देखें / (नए टैब में खुलता है) |
| list.heading | Sections, top to bottom | सेक्शन, ऊपर से नीचे |
| row.position | Position {n} | स्थान {n} |
| row.fixedFirst / fixedLast | Always first / Always last | हमेशा सबसे ऊपर / हमेशा सबसे नीचे |
| row.hidden | Hidden | छिपा हुआ |
| row.moveUp / moveDown | Move {section} up / Move {section} down | {section} को ऊपर ले जाएँ / {section} को नीचे ले जाएँ |
| row.show | Show on page | पेज पर दिखाएँ |
| row.showFor | ({section}) | ({section}) |
| keep.linked | Always shown: buttons and links elsewhere on the website lead to this section. | हमेशा दिखता है: वेबसाइट के दूसरे बटन और लिंक इसी सेक्शन पर ले जाते हैं। |
| keep.notice | Always shown: it carries the page's note on which information is verified. | हमेशा दिखता है: इसमें पेज की वह सूचना है कि कौन-सी जानकारी सत्यापित है। |
| keep.core | Always shown: this is the main content of the page. | हमेशा दिखता है: यह पेज की मुख्य सामग्री है। |
| reasons.notLast | {section} can't be the last section: keep an always-shown section below it. | “{section}” सेक्शन सबसे आख़िर में नहीं रखा जा सकता: इसके नीचे कोई ऐसा सेक्शन रखें जो हमेशा दिखता हो। |
| reasons.noneVisible | Keep at least one section visible that doesn't depend on verified details. | कम से कम एक ऐसा सेक्शन दिखता रहना चाहिए जो सत्यापित जानकारी पर निर्भर न हो। |
| reasons.atTop / atBottom | Already at the top. / Already at the bottom. | पहले से सबसे ऊपर है। / पहले से सबसे नीचे है। |
| announce.moved | {section} moved to position {position} of {total}. | “{section}” सेक्शन अब {total} में से स्थान {position} पर है। |
| announce.hidden / shown | {section} will be hidden. / {section} will be shown. | “{section}” सेक्शन छिपा दिया जाएगा। / “{section}” सेक्शन दिखाया जाएगा। |
| actions.save / saving | Save draft / Saving… | ड्राफ़्ट सहेजें / सहेजा जा रहा है… |
| actions.saveNothing | No changes to save. | सहेजने के लिए कोई बदलाव नहीं है। |
| actions.undo | Undo changes | बदलाव वापस लें |
| actions.preview | Preview draft | ड्राफ़्ट का प्रीव्यू देखें |
| actions.previewNeedsSave | Save your changes to preview them. | प्रीव्यू के लिए पहले बदलाव सहेजें। |
| actions.previewNoDraft | Save a draft to preview it. | प्रीव्यू के लिए पहले ड्राफ़्ट सहेजें। |
| actions.publish | Publish draft | ड्राफ़्ट प्रकाशित करें |
| actions.publishNeedsDraft | Save a draft before publishing. | प्रकाशित करने से पहले ड्राफ़्ट सहेजें। |
| actions.publishNeedsSave | Save your changes before publishing. | प्रकाशित करने से पहले अपने बदलाव सहेजें। |
| actions.publishTitle / publishBody | Publish this order? / Visitors will see it on the {page} page straight away. | यह क्रम प्रकाशित करें? / विज़िटर को {page} पेज पर यह तुरंत दिखेगा। |
| actions.publishNow | Publish now | अभी प्रकाशित करें |
| actions.discard | Discard draft | ड्राफ़्ट हटाएँ |
| actions.discardTitle / discardBody | Discard the draft? / The live page does not change. | ड्राफ़्ट हटाएँ? / लाइव पेज में कोई बदलाव नहीं होगा। |
| actions.discardNow | Discard now | अभी हटाएँ |
| actions.reset | Reset to the original order | मूल क्रम पर वापस जाएँ |
| actions.resetNothing | This page already uses the original order. | यह पेज पहले से मूल क्रम में है। |
| actions.resetTitle / resetBody | Go back to the original order? / This puts the original order live straight away and deletes any draft for this page. | मूल क्रम पर वापस जाएँ? / इससे मूल क्रम तुरंत लाइव हो जाएगा और इस पेज का ड्राफ़्ट हट जाएगा। |
| actions.resetNow / cancel / reload | Reset now / Cancel / Reload | अभी वापस जाएँ / रद्द करें / दोबारा लोड करें |
| done.saved | Draft saved. Preview it, then publish. | ड्राफ़्ट सहेज लिया गया। प्रीव्यू से जाँचें, फिर प्रकाशित करें। |
| done.published | Published. The {page} page now uses this order. | प्रकाशित हो गया। {page} पेज अब इसी क्रम में दिखता है। |
| done.discarded / reset | Draft discarded. / The original order is live again. | ड्राफ़्ट हटा दिया गया। / मूल क्रम फिर से लाइव है। |
| errors.conflict | Someone else changed this page's layout. Reload to see their changes (your unsaved changes will be lost). | किसी और ने इस पेज का लेआउट बदल दिया है। उनके बदलाव देखने के लिए दोबारा लोड करें (आपके बिना सहेजे बदलाव हट जाएँगे)। |
| errors.forbidden | Only a super admin can change page layouts. | पेज लेआउट केवल सुपर एडमिन बदल सकते हैं। |
| errors.signedOut | Your session has ended. Sign in again. | आपका सत्र समाप्त हो गया है। फिर से साइन इन करें। |
| errors.validation | Please fix the problems listed above. | ऊपर बताई गई समस्याएँ ठीक करें। |
| errors.rateLimited | Too many changes in a short time. Wait a minute and try again. | थोड़े समय में बहुत ज़्यादा बदलाव हुए। एक मिनट रुककर फिर कोशिश करें। |
| errors.network | Could not reach the server. Check your connection and try again. | सर्वर से संपर्क नहीं हो सका। अपना कनेक्शन जाँचकर फिर कोशिश करें। |
| errors.noDraft | There is no saved draft to publish. | प्रकाशित करने के लिए कोई सहेजा हुआ ड्राफ़्ट नहीं है। |
| errors.generic | Something went wrong. Please try again. | कुछ गड़बड़ हो गई। कृपया फिर कोशिश करें। |
| history.heading / empty | History / No changes yet: this page uses the original order. | इतिहास / अभी कोई बदलाव नहीं: यह पेज मूल क्रम में है। |
| history.someone | Someone | किसी व्यक्ति |
| history.actions.saveDraft | {name} saved a draft | {name} ने ड्राफ़्ट सहेजा |
| history.actions.publish | {name} published | {name} ने प्रकाशित किया |
| history.actions.reset | {name} reset to the original order | {name} ने मूल क्रम वापस लगाया |
| history.actions.discardDraft | {name} discarded the draft | {name} ने ड्राफ़्ट हटाया |
| history.moved | {section} moved from position {from} to {to} | “{section}” सेक्शन स्थान {from} से {to} पर गया |
| history.hid / showed | {section} hidden / {section} shown | “{section}” सेक्शन छिपाया गया / “{section}” सेक्शन दिखाया गया |
| history.noChange | no change to the order | क्रम में कोई बदलाव नहीं |
| banner.title | Draft preview | ड्राफ़्ट प्रीव्यू |
| banner.draft | You are previewing the draft layout of this page. Visitors still see the published layout. | आप इस पेज के ड्राफ़्ट लेआउट का प्रीव्यू देख रहे हैं। विज़िटर को अभी भी प्रकाशित लेआउट दिखता है। |
| banner.noDraft | Preview mode is on. This page has no draft, so you see its published layout. | प्रीव्यू मोड चालू है। इस पेज का कोई ड्राफ़्ट नहीं है, इसलिए आपको प्रकाशित लेआउट दिख रहा है। |
| banner.exit / back | Exit preview / Back to the layout editor | प्रीव्यू बंद करें / लेआउट एडिटर पर वापस जाएँ |
| pages.&lt;page&gt;.name | Home, About, Admissions, Programs, Results, Centres, Hostels, Resources, Contact, Student tools | होम, परिचय, प्रवेश, प्रोग्राम, परिणाम, केंद्र, हॉस्टल, संसाधन, संपर्क, विद्यार्थी टूल्स |
| pages.hostels.note | §3 | §3 |
| pages.&lt;page&gt;.sections.&lt;key&gt;.label / .hint | §3 tables | §3 tables |

`history.someone` is always used before "ने", so the Hindi is the oblique form "किसी व्यक्ति".

**Label helpers** (`src/components/page-layout/labels.ts`, client-safe):
- `pageName(t, page)`
- `sectionLabel(t, page, key)`
- `sectionHint(t, page, key)`, which returns `string | null`
- `keepReason(t, def)`
- `fill(template, values)`, which replaces `{name}` placeholders

---

## 12. Work packages

### 12.0 Rules for every package
- **Order.** CORE-1 runs first. When it reports done, CORE-2, PAGES-A and PAGES-B run **in parallel**: at most 3 agents, because the owner's PC is limited. The INTEGRATOR runs last.
- **Every prompt starts with the owner's request, quoted verbatim:** "do we have the functionality to manage the website content on each page or the page design like on the hompage we should be able to set the section's position up or down"; the choice "Homepage + inner pages"; and on 2026-10-22: "complete and deploy it with best decision. i will be afk now but i want it deployed. deploy multiple agents ... multi agents to complete asap". Any other relayed owner message is a side question that the orchestrator has already answered, and it does not cancel the task.
- **Read first:** this plan, `AGENTS.md`, and the Next docs on `use cache` / `cacheTag` / `cacheLife` / `revalidateTag` / draft mode in `node_modules/next/dist/docs/`.
- **Machine limits.** No `tsc`, no `next build`, no dev server, no browser. Run only your own vitest files with `--maxWorkers=1`, and eslint on the files you touched. Do not commit.
- **Never edit:**
  - `src/lib/crm/**`, `src/components/crm/**`
  - `src/lib/auth/**` (reading is fine)
  - `src/lib/qb/**` (except reading `core-db.test.ts`), `src/lib/mocktest/**`
  - `src/app/api/{qb,mocktest,crm,admin/qb,admin/super-admins}/**`
  - `src/components/{qb,qb-admin,qb-import}/**`
  - `src/app/[lang]/(portal)/{crm,admin/questions}/**`
  - `package.json`
  - another package's files
- **No new dependencies.**
- **Shared files** (only the package named for them may touch them): re-read the file **immediately** before a minimal edit of only your own lines. Other workflows (lead routing, question bank) edit some of them at the same time.
- **Found a registry or message mistake** in PAGES-A or PAGES-B? Report it in your result; do not edit CORE files.
- **Golden parity.** Every package that changes a site page does this before editing that page:
  1. Add a temporary vitest file `src/components/page-layout/__golden_<package>.test.ts` that renders the page component for `en` and `hi`, with `SHOW_PLACEHOLDER_CONTENT` true and false (the way the existing page tests switch it), and writes each HTML string to `<your session scratchpad>/golden/<page>-<locale>-<mode>.before.html` (absolute path).
  2. Run it.
  3. After the refactor, write `.after.html` and compare. Normalise React `useId` tokens with `/«[^»]*»|_R_[0-9a-zA-Z_]*_|:R[0-9a-zA-Z]*:/g`; everything else must be **byte-identical**.
  4. Delete the temporary file.
  5. Report "golden parity: N/N identical".
- **Result format.** Return the files created or changed, the test commands with their pass counts, golden parity, and anything for the integrator.

### 12.1 CORE-1: foundation and homepage (first; the other three wait for it)

**New files:**
- `src/lib/page-layout/registry.ts` (§3)
- `src/lib/page-layout/types.ts` (§3, §5, §6)
- `src/lib/page-layout/resolve.ts` (§7)
- `src/lib/page-layout/store.ts` (§5)
- `src/lib/page-layout/loader.ts` (§6)
- `src/lib/db/features/page-layout.ts` (§5)
- `src/components/page-layout/render.tsx` (§4)
- `src/components/page-layout/preview-banner.tsx` (§4)
- `src/components/page-layout/labels.ts` (§11)
- `src/i18n/messages/en/layout.ts`, `src/i18n/messages/hi/layout.ts` (§11, with all §3 labels and hints)
- Tests: `src/lib/page-layout/registry.test.ts`, `resolve.test.ts`, `store.test.ts`; `src/components/page-layout/render.test.ts`; `src/components/home/home-layout.test.ts`

**Shared edits** (re-read each file first; touch only these lines):
- `src/lib/db/features/index.ts`: the import, plus `{ name: "page_layout", sql: pageLayout }` immediately before `qb`.
- `src/lib/db/db.test.ts`: add `page_layout` to **both** prefix regexes.
- `src/i18n/messages/index.ts` and `src/i18n/messages/types.ts`: register `layout`.
- `src/components/home/StatsBand.tsx`: add `export function statsBandHasItems(stats: Stat[]): boolean`, using the same `STAT_SLOTS` filter the component uses.
- `src/app/[lang]/(site)/page.tsx`: homepage wiring (after the golden "before" capture):
  ```tsx
  const layout = await getPageLayout("home");          // in the first Promise.all
  const slots: LayoutSlots<"home"> = {
    stats: statsBandHasItems(stats) ? () => <StatsBand stats={stats} locale={locale} /> : null,
    results: ({ tone }) => <ResultsShowcase … tone={tone} />, programs: …, tools: …, why: …,
    centres: centres.length > 0 ? () => <CentresShowcase centres={centres} locale={locale} /> : null,
    life: …, voices: pickHomeTestimonials(testimonialsEn).length > 0 ? … : null,
    impact: yearCounts.length > 0 ? … : null, resources: articles.length > 0 ? … : null,
    cta: () => <CtaBand … />,
  };
  return <PageLayoutFrame layout={layout} banner={await layoutPreviewBanner(layout)} hero={<HomeHero … />} slots={slots} />;
  ```
  Remove the two `toned` arrays and `renderSections`, and update the doc comment. Each null condition must match exactly what renders nothing today.
- `docs/hindi-review-register.md`: append one row for `src/i18n/messages/hi/layout.ts` ("Page layout editor, preview banner, section labels and hints; staff-facing", machine draft).

**Tests:**
- **`registry.test.ts`:**
  - keys are unique per page and match the regex;
  - `hero` is first with `pin: "first"`, and nothing else is pinned first;
  - at most one pin last, placed last;
  - `LAYOUT_PAGE_KEYS` equals `Object.keys(LAYOUT_PAGES)`;
  - each default order has no `layoutIssues`;
  - every key has an en and hi label, every conditional section has an en and hi hint, every keep section's reason exists, and `pages.hostels.note` exists in both languages;
  - every `pageLayoutTag(page)` is 256 characters or fewer;
  - paths start with `/`, and `PAGE_LAYOUT_PREVIEW_EXIT_PATH` is not a portal API path (`isPortalApiPath` is false).
- **`resolve.test.ts`:**
  - `null` gives the default;
  - unknown keys, pinned keys and duplicates are dropped;
  - missing keys go in at their default spot: a stored home list without `voices` puts it after `life`, and consecutive missing keys keep their order;
  - non-hideable keys are forced visible;
  - `not_last` on home: tools last among visible sections, and tools followed only by conditional sections;
  - `none_visible` when only conditional sections are visible (D13);
  - `validateEntries` reports `duplicate:` and `cannot_hide:` before normalising, and ignores unknown keys;
  - a stored layout that breaks a rule falls back to the default (with a log spy);
  - `describeChanges`: a single move is one `moved` entry with positions counting the hero as 1, and hidden/shown work;
  - `sameOrder`.
- **`render.test.ts`:**
  - home default tones for demo-shaped and production-shaped slots (null `stats`, `centres` and `voices`);
  - own-background sections reset the rhythm;
  - null slots do not affect the rhythm;
  - a reorder still alternates;
  - `ctx.rendered` and `ctx.side`;
  - `PageLayoutFrame` renders banner, then hero, then sections;
  - `LayoutPreviewBanner` markup: the form `action` equals `PAGE_LAYOUT_PREVIEW_EXIT_PATH`, hidden `page` and `lang`, the back link, en and hi.
- **`store.test.ts`** (in-memory DB, `resetDatabaseForTests()` in `beforeEach`):
  - the first `save_draft` with revision 0 gives revision ≥ 1;
  - a stale revision gives `conflict`;
  - `publish` and `discard_draft` without a draft give `no_draft`;
  - publish copies the draft and clears it;
  - publishing the default order deletes the published row (`custom: false`);
  - reset deletes both rows;
  - history before/after values follow the §5 table, newest first, with joined display names (and null when the actor is deleted);
  - `audit_log` rows have `action` `layout.*`, target `page-layout:<page>`, and **flat** details (`order` is a string, `moved`/`hidden`/`shown` are numbers);
  - a corrupt JSON row is treated as missing;
  - `readLayoutForRender` returns `{ ok: false }` when the query throws, for example on a closed DB.
- **`home-layout.test.ts`:**
  - At default, in both modes, today's section order (section `id` / `aria-labelledby` markers) and `bg-white` / `bg-surface` classes are kept.
  - With a published custom layout (`applyLayoutAction` `save_draft` then `publish`, `actorId: null`): the order changes, a hidden section is absent, the tones still alternate, and `cta` stays last.

**Run:**
```
npx vitest run src/lib/page-layout src/components/page-layout/render.test.ts src/components/home src/lib/db/db.test.ts src/lib/db/migration-staff.test.ts src/lib/qb/core-db.test.ts src/i18n --maxWorkers=1
```
Then eslint on the touched files. Golden parity: the homepage, en and hi, both modes (4 files).

### 12.2 CORE-2: admin API, screen, nav, audit labels (after CORE-1; parallel with PAGES-A/B)

**New files:**
- `src/lib/page-layout/access.ts` (§8)
- `src/lib/page-layout/schemas.ts` (§9)
- `src/app/api/admin/page-layout/[page]/route.ts`
- `src/app/api/admin/page-layout/preview/route.ts`
- `src/app/api/page-layout/preview/exit/route.ts`
- `src/app/[lang]/(portal)/admin/page-layout/page.tsx`
- `src/components/page-layout/PageLayoutEditor.tsx`, `LayoutSectionList.tsx`, `LayoutHistoryList.tsx`, `editor-model.ts`, `editor-api.ts`
- Tests: `src/app/api/admin/page-layout/page-layout-api.test.ts`, `src/components/page-layout/editor-model.test.ts`, `src/components/page-layout/editor-ui.test.ts`

**Shared edits** (re-read first; append only):
- `src/components/portal/areas.ts`: one nav item (§10), with the `ListOrdered` import.
- `src/i18n/messages/en/portal.ts` and `hi/portal.ts`: `nav.pageLayout` and the 4 `admin.audit.actions` keys only.
- `src/components/portal/AuditLog.tsx`: 4 `ACTION_KEYS` entries at the end. Keep any `auth.super_admin_*` entries that lead routing added.
- `src/components/portal/portal-ui.test.ts`: add `"/admin/page-layout"` to `ADMIN_PAGES`.

**`page-layout-api.test.ts`** follows the `src/app/api/admin/users/admin-users.test.ts` pattern:
- `vi.mock("next/headers")` returns `cookies`, plus `draftMode: async () => draft` with `draft = { isEnabled: false, enable: vi.fn(), disable: vi.fn() }`.
- `vi.mock("next/cache")` provides a `revalidateTag` spy.
- Use the **real** `@/lib/auth/super-admin`. Make the editor with `upsertGrant(db, { userId: A, via: "cli", by: null, now })`, and leave a second admin B with no grant. Do not mock the module: `requireSuperAdmin` calls `isSuperAdmin` internally, so a module mock would not reach it.

Cases:
- 401 when signed out, and 403 for a student, on GET and POST;
- 403 for a cross-origin POST;
- 404 for an unknown page;
- GET works for plain admin B; POST by B is 403;
- 422 codes (`not_last:tools`, `cannot_hide:enquiry`, `duplicate:x`, `none_visible`, `no_draft`);
- 409 on a stale revision;
- save → publish → reset as A, with `revalidateTag("page-layout:home", { expire: 0 })` called **only** on publish and reset;
- `audit_log` rows for each action;
- 429 after 60 writes;
- **preview:**
  - A posts `lang=hi&page=about`: `enable` is called and the response is 303 with `Location: /hi/about`;
  - B gets a 303 to `/hi/admin/page-layout?page=about`, and `enable` is not called;
  - an unknown page redirects to the editor;
  - cross-origin gets 403;
- **exit:** with no session, `disable` is called and the response is 303 to the page; an unknown page goes to `/`; `lang=hi` with no page goes to `/hi`.

**`editor-model.test.ts`:**
- move and toggle;
- blocked reasons via `layoutIssues` comparison: moving tools last on home, hiding the last always-shown section, hiding a keep section, at top, at bottom;
- dirty detection with `sameOrder`;
- announcement text (en and hi): position and total;
- history sentence building, including `history.someone`;
- `defaultStateViews()`.

**`editor-ui.test.ts`** uses `renderToStaticMarkup` in en and hi:
- labels;
- every `aria-describedby` / `aria-labelledby` target exists;
- `aria-disabled` on blocked controls, with no `disabled` attribute;
- the checkbox `<label>` contains "Show on page" plus the sr-only section;
- the read-only variant has no move, show or action controls;
- the preview form's `action` equals `PAGE_LAYOUT_PREVIEW_PATH`, with `target="_blank"` and hidden `page` and `lang`;
- the history list text.

**Run:**
```
npx vitest run src/app/api/admin/page-layout src/components/page-layout/editor-model.test.ts src/components/page-layout/editor-ui.test.ts src/components/portal/portal-ui.test.ts --maxWorkers=1
```
Then eslint on the touched files.

### 12.3 PAGES-A: about, admissions, programs list, results, centres (after CORE-1)

**Files:**
- `src/app/[lang]/(site)/{about,admissions,programs,results,centres}/page.tsx` (not `programs/[slug]`)
- `src/components/page-layout/pages-a-layout.test.ts`

**Pattern for every page:**
- `getPageLayout("<page>")` in the first `Promise.all`;
- a `LayoutSlots<"<page>">` object;
- `<PageLayoutFrame layout banner={await layoutPreviewBanner(layout)} hero={…} slots>`;
- delete the local `order` / `tone()` / `side()` helpers;
- each section's `tone` comes from `ctx.tone`;
- every data condition becomes a null slot.

**Per page:**
- **about:**
  - Replace `profileSections` and `pendingSections` with `profileSlots(profile)` / `pendingSlots()` that return the `story`, `mission`, `approach`, `values` and `journey` slots.
    - Profile mode: approach and values are null when their lists are empty; journey is null with no milestones.
    - Pending mode: mission and journey are null.
  - `results`, `explore`, `spaces` and `cta` are shared.
  - `FillMediaSplit imageSide={ctx.side}` for story, mission, approach and values.
  - Accepted: in profile mode with an empty `profile.approach`, the later photo sides follow position. That differs from today, and golden parity does not hit it.
- **admissions:**
  - `enquiry`: keep `id`, `imageFirstOnMobile={false}` and `splitFrom="lg"`; `imageSide={ctx.side}`.
  - `next`: `id="next-steps"`, `imageSide={ctx.side}`.
  - `results`, `scholarships` (cond), `downloads` (cond), `faqs`.
- **programs:**
  - `directory`, `tracks`;
  - `guide`: `BleedSplit tone={ctx.tone}`, with `imageSide="left"` fixed;
  - `cta`: `CtaBleedSplit tone={ctx.tone}`, default side.
- **results:**
  - `stories` (cond on `featured.length`), `archive`, `rankers` (cond), `method`, `cta`; tone and side come from ctx.
  - `noticeHost = ctx.rendered.find(k => k === "stories" || k === "archive")`. Stories shows the notice when it is the host; archive shows its wrapped notice when it is the host.
  - The laurel shows when `ctx.tone === "white"`.
- **centres:**
  - `directory`;
  - `districts`: `BleedSplit tone={ctx.tone}`, with `imageSide="right"` fixed;
  - `cta`: `tone={ctx.tone}`, with `imageSide="left"` fixed.

**Golden parity:** all 5 pages, en and hi, both modes (20 files), captured before any edit.

**`pages-a-layout.test.ts`** (in-memory DB, reset per test), for each page:
- the default order of the section `aria-labelledby` / `id` markers and their `bg-white` / `bg-surface` classes, in both modes;
- one published custom layout (`applyLayoutAction` `save_draft` then `publish`, `actorId: null`) with a move plus a hide: the order changes, the hidden section is absent, and tones alternate;
- a keep section stored as hidden still renders;
- on results, hiding `stories` moves the notice into `archive`.

**Run:**
```
npx vitest run src/components/page-layout/pages-a-layout.test.ts src/components/about src/components/centres src/components/programs src/components/results src/components/home/pages-hi.test.ts src/test/no-landscapes.test.ts --maxWorkers=1
```
Then eslint on the touched files. A failure that comes from a PAGES-B page is not yours: report it.

### 12.4 PAGES-B: hostels, resources, contact, tools (after CORE-1; parallel with PAGES-A)

**Files:**
- `src/app/[lang]/(site)/{hostels,resources,contact,tools}/page.tsx`
- `src/components/page-layout/pages-b-layout.test.ts`

**Per page:**
- **hostels:**
  - Call the loader before the `!info` branch.
  - `!info` renders `banner`, the hero and the existing empty section, unchanged; the layout is not applied.
  - With info: `intro`, `campuses` (cond; keep `id="hostels-by-campus"` and the per-campus ids), `care`, `rooms` (cond on `hasRooms`), `day` (cond on `hasDay`), `cta`.
  - Tone comes from ctx; photo sides stay fixed as today.
- **resources:**
  - `types` (`tone={ctx.tone}`), `downloads` (cond on `profile && hasDownloads`; keep `id="downloads"`), `articles` (keep `id="articles"`), `results`, `cta`.
  - Every `hasDownloads ? … : …` tone ternary becomes `ctx.tone`; sides stay fixed.
- **contact:**
  - `form`: `id="contact-form"`, `tone={ctx.tone}`, `imageSide={ctx.side}`.
  - `details`: `imageSide={ctx.side}`.
  - `help`, `desks` (cond).
  - Pass `tone` explicitly everywhere.
- **tools:**
  - `rancho` is the existing white band, unchanged (own background).
  - `predictor`, `mockTests`, `ask` and `planner` are each built from the `TOOLS` entry with that key, with `tone={ctx.tone}` and `imageSide={ctx.side}`. Keep the `<Suspense>` around `AskStatusBadge`.
  - `note` uses `tone={ctx.tone}`.
  - The hero `ToolLinksCard` order follows `layout.entries` filtered to the tool keys, hidden tools included (D10).

**Golden parity:** all 4 pages, en and hi, both modes (16 files).

**`pages-b-layout.test.ts`:** the same checks as PAGES-A for each page, plus:
- hostels with no info ignores a stored layout;
- on tools, a reordered layout changes the hero card order, and a hidden tool is still listed in the card.

**Run:**
```
npx vitest run src/components/page-layout/pages-b-layout.test.ts "src/app/[lang]/(site)/tools/tools-hero.test.ts" src/components/hostels src/components/contact src/components/resources src/components/pwa/rancho-app.test.ts src/components/about/pages-b.test.ts src/components/results/discovery-pages.test.ts --maxWorkers=1
```
Then eslint on the touched files.

### 12.5 Shared-file ownership summary
| File | Owner | Lines |
|---|---|---|
| `src/lib/db/features/index.ts` | CORE-1 | 1 import + 1 entry before `qb` |
| `src/lib/db/db.test.ts` | CORE-1 | 2 regexes |
| `src/i18n/messages/index.ts`, `types.ts` | CORE-1 | `layout` registration |
| `src/components/home/StatsBand.tsx` | CORE-1 | `statsBandHasItems` export |
| `docs/hindi-review-register.md` | CORE-1 | 1 row |
| `src/components/portal/areas.ts` | CORE-2 | 1 nav item + import |
| `src/i18n/messages/{en,hi}/portal.ts` | CORE-2 | `nav.pageLayout` + 4 audit action labels |
| `src/components/portal/AuditLog.tsx` | CORE-2 | 4 `ACTION_KEYS` entries |
| `src/components/portal/portal-ui.test.ts` | CORE-2 | `ADMIN_PAGES` entry |

### 12.6 INTEGRATOR (after all four report done)
1. **Reconcile.**
   - Fix any registry or message issue the page packages reported. These are CORE files.
   - Check that the shared lists hold both sets of entries:
     - `features/index.ts` ends `…, crm, superadmin, crm_intake, page_layout, qb`;
     - `AuditLog.tsx` has the 4 `layout.*` entries plus any `auth.super_admin_*` entries;
     - `portal.ts` en and hi have matching keys;
     - both `db.test.ts` regexes.
2. **Full verification.** Run these one at a time, with no other agents or dev servers running:
   1. `npx tsc --noEmit`
   2. eslint on all changed files
   3. `npx vitest run --maxWorkers=2`
   4. `npx next build`

   The build log must still list the 10 pages as prerendered, now showing a revalidate time (D15). There must be no `.data/` directory created by the build.
3. **Build vs runtime env.** Confirm that the build-time `SHOW_PLACEHOLDER_CONTENT` and `ENQUIRY_STORE` (build args and compose) match the runtime `.env` (D15).
4. **Hands-on check** (dev server or `next start`, desktop / tablet / mobile, en and hi):
   - every page at default looks unchanged;
   - as a super admin: move tools down on Home, save, preview (the banner appears and "Exit preview" works, also after signing out), publish; the live page changes on the next load;
   - Reset brings back the original order;
   - the history and the Activity log show the entries;
   - keyboard-only: Tab, Space and Enter on the move buttons, the announcements, focus staying on "Move down", and the inline confirmations;
   - a plain admin sees the read-only view.
5. **Deploy** with the usual backup-first steps (`deploy/README.md`). The new tables are created on first open. Add to `deploy/README.md`:
   - **Post-release note:** "After a release, the first visit to each of the 10 pages may still show the original order once."
   - **Optional warm-up:**
     ```sh
     for p in / /about /admissions /programs /results /centres /hostels /resources /contact /tools; do curl -s -o /dev/null https://aspire.thechunkmedia.com$p; curl -s -o /dev/null https://aspire.thechunkmedia.com/hi${p%/}; done
     ```
   - **Super admin check:** open Users and confirm that at least one effective super admin exists. If there is none (more than one admin and no grants), run `cd /opt/aspire-web && docker compose exec app npm run auth:super-admin -- grant <login id>`.
   - **Rollback:** use "Reset to the original order" per page, or roll back the release. The tables are then simply unused.
6. **Docs.**
   - Record the next free decision (D-059 or later), "Page layout": the registry, D1–D15, draft-mode preview, the exit route outside the portal API, and that Phase 3 (words and photos) will reuse the draft → preview → publish model and the history table.
   - Add the 4 routes to `docs/api.md`.

---

## Appendix A: design review outcome (2026-10-22)

| # | Point | Verdict | Reason / where applied |
|---|---|---|---|
| 1 | "Exit preview" breaks after sign-out | **Accept** | Verified: `PORTAL_API` in `paths.ts` and the proxy's 401 before the handler. The exit route moved to `/api/page-layout/preview/exit` (D6, §3, §9). A registry test asserts it is not a portal API path. |
| 2 | Audit details lost | **Accept** | Verified: `sanitizeAuditDetails` keeps only primitive values. Details are now flat counts plus an `order` string (D11, §5). The full lists stay in `page_layout_history`. |
| 3 | Wire the super-admin check now | **Accept, with a different test approach** | Verified the exports and signatures. `isLayoutEditor` / `requireLayoutEditor` are wired in CORE-2 (§8). The tests use the real module and `upsertGrant` rather than `vi.mock`, because `requireSuperAdmin` calls `isSuperAdmin` inside the same module, where a mock does not reach. Deploy step added (§12.6). |
| 4 | Focus lost on "Move down" | **Accept** | React's keyed reorder moves the node of the row that moves down. Refs plus `useLayoutEffect`, and `aria-disabled` for blocked controls (D14, §10). |
| 5 | Redirects behind nginx | **Accept (relative Location)** | Verified that `appendMutableCookies` is applied to any returned `Response`. A plain `Response` with a relative `Location` built by `localePath()`, so `getSiteOrigin` is not needed (§9). |
| 6 | Shorter build-time cache window | **Accept** | Verified the thresholds in `cacheLife.md`. `BUILD_LIFE = { stale: 300, revalidate: 1, expire: 600 }` (§6). The owner-facing wording stays conservative ("may show the original order once") and the warm-up stays as an optional step: how old a build-time entry looks after a container start depends on Next's cache-file timestamps, which were not verified. |
| 7 | Date hydration mismatch | **Accept** | `suppressHydrationWarning` on every element that prints a date (§10). |
| 8 | Hindi grammar | **Accept** | Quoted label + "सेक्शन" for every agreeing verb, `history.someone` = "किसी व्यक्ति", full hint sentences, no `as const`, a review-register row (§3, §11, CORE-1). |
| 9 | Empty pages possible | **Accept** | `none_visible` now requires a visible non-conditional section (D13, §7). The message is reworded. |
| 10 | Clashes with lead routing and the question bank | **Accept** | Both regexes; insert before `qb`; append in `AuditLog`; re-read rules; shared-file table §12.5; integrator check. |
| 11 | `?page=` read inside `<Suspense>` | **Accept** | Matches `admin/audit/page.tsx` (§10). |
| 12 | Checkbox target size | **Accept** | A label at least 44 px tall with visible "Show on page" and an sr-only "({section})", so the visible words are part of the name (§10, §11). |
| 13 | Drop the read rate limit | **Accept** | Admin GETs are cheap; the write limit stays (§8). |
| 14 | Drop `ctx.index` | **Accept** | No section uses it (§4). |
| 15 | Preview 403/404 into a new tab | **Accept, refined** | Guard failures and unknown pages 303 to the editor. Cross-origin stays a 403 envelope, because it is never a real click from the editor (§9). |
| 16 | Pages become regenerating | **Accept** | D15 and integrator step 3. |
| 17 | About photo-side edge case | **Accept** | Documented in PAGES-A. |

No point was rejected outright. Points 3, 5, 6 and 15 were adopted with the changes noted.
