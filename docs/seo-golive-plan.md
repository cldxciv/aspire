# Search go-live pack (SEO, SMO, AEO, GEO): design and build plan

**Doc:** `docs/seo-golive-plan.md`
**Status:** design and build plan, 22 Oct 2026, revised after an adversarial review (verdicts in §0). Nothing here is built yet. Facts were checked read-only against:
- the Release 1 tree (`5a2d7cb`) and the Next 16 docs in `node_modules/next/dist/docs`
- live read-only fetches on 22 Oct 2026 of aspireiit.in (the old WordPress site), aspire.thechunkmedia.com (the new site, demo mode) and aspire2.thechunkmedia.com (the earlier demo)

**What it implements:**
- `docs/admin-console-plan.md` §3.5 (the rows marked Phase 4) and §2.3 section 5.
- Decision 17: the domain is aspireiit.in.
- Decision 21: no Google Analytics or Meta pixel; cookie-free counts later (Phase 5).
- Decision 22: answer crawlers and training crawlers may read public pages; private areas are always blocked.
- The owner approved all 23 defaults on 21 Oct 2026.

**Release:** R4. It starts after Phase 2 Integrate (R3). It can start earlier, after Phase 1b Integrate (R2), but only while no Phase 2 or Phase 3a package is running (§1.1).
**It ships switched off.** While the site is in demo mode, robots.txt stays `Disallow: /`, every page stays noindex, and nothing in this pack changes what search engines, AI crawlers or link previews see (§2).
**Decision ids:** D-085 to D-091. D-084 (page layout) is the highest id in use; D-059 to D-083 are taken by other plans; D-069 is unused (left alone). Re-grep before recording: `grep -rhoE "D-0[0-9]{2}" docs/*.md | sort -u`.
**Database:** one idempotent feature schema, `seo` (tables `seo_*`), after `page_layout` and before `qb`, which stays last. No core migration.
**New npm dependencies:** none. Share images use `next/og` (already used by three routes) with its bundled Geist font only. No font file is added.

---

## Owner summary

### How we are doing on search today (the honest answer)

- **aspireiit.in is still your old WordPress website, and Google ranks it today.**
  - Its sitemaps list 109 pages, 3 posts and 17 student testimonial pages. The pages include 25 town pages ("NEET coaching in Mandi", "JEE coaching in Solan" and so on), 28 result pages, 26 course pages, the centre pages, about, admissions and contact pages, and the NEET rank predictor.
  - It carries a Google Search Console verification tag, Google Analytics and Google Tag Manager.
- **The new website is hidden from Google and AI engines on purpose.** It runs in demo mode on a temporary address (robots.txt `Disallow: /`, every page "noindex"). That is right while it shows demo data.
- **The real risk is launch day.** When aspireiit.in moves to the new website, every old address must forward to the right new page. Otherwise Google drops the rankings those pages have earned. This pack ships a ready list of 108 suggested forwards, built from the old site's own sitemaps.
- **No fact has been confirmed yet.** The content register has no verified row. Every centre address, phone, timing, social link and result is still "needs approval", so today there is nothing true we can safely give Google, Maps or AI assistants.
- **Already in place:**
  - English and Hindi addresses for every page, with language links
  - a sitemap
  - private areas kept out of search
  - once Phase 1b lands, a count of enquiries that come from Google, Google Maps and AI assistants
- **What changed outside (checked 22 Oct 2026):**
  - Google stopped showing FAQ rich results on 7 May 2026, and retired "Course info" results in 2025.
  - Event results now need a real place and public registration.
  - Google says AI answers need no special markup. AI Overviews are switched on or off in Search Console, not on the website.
  - For "NEET coaching in Mandi" searches, **each centre's Google Business Profile matters more than anything on the website.**

### What this release adds (all built now)

1. **Old links keep working.** 108 suggested forwards from the old aspireiit.in pages to the new ones (town pages to the centre that serves that district, result pages to Results, and so on). You accept them group by group. They are permanent (301) forwards and start working the moment aspireiit.in points at the new site.
2. **Page titles and share previews.** For every public page you set the Google title and description and the WhatsApp preview text. The console shows how the page would look in Google and on WhatsApp, and warns when text is missing, too long, used twice, or sounds like a claim the coaching rules restrict ("guaranteed", "100%", "No. 1").
3. **Share images.** Every page, program, centre, article and the scholarship test gets a clean 1200 × 630 card in English. Hindi pages use the English card (see "Honest limits").
4. **Business facts.** One sheet for the institute (name, phone, email, social profiles) and one for each centre (address, map pin, phone, enquiry-desk hours, Google Maps and Business Profile links, courses).
   - Each fact is **Verified** or **Not verified**. Changing a fact makes it unverified again.
   - Only verified facts are given to search engines and AI tools. Anything unverified is left out, never guessed.
5. **One web page per centre** (`/centres/hamirpur` and so on), each with:
   - the address, a phone link and enquiry-desk hours
   - an "Open in Google Maps" link
   - the courses run there and the next scholarship test at that centre
   - an enquiry form with the centre already chosen
   - local results, but only with written permission and the details the coaching-advertising rules require (none today)
6. **Google Business Profile checklist** for each centre: the same name, address and phone everywhere, the website link, hours, real photos, and replies to reviews.
7. **Who may read the site.** Search engines and link previews are always allowed. AI "answer" crawlers (ChatGPT search, Claude, Perplexity) and AI training crawlers are allowed under decision 22, and you can block either group with one click. Private areas are always blocked. Search Console and Bing codes are set here. Daily counts of AI crawler visits, with no IP address read or kept.
8. **llms.txt**, a short plain-text guide to Aspire for AI tools, built only from confirmed facts.
9. **Social sharing.** Your social profile links, and WhatsApp share texts (English, Hindi, Hinglish) with tagged links, so shared visits show up in "Where enquiries come from".

### What works when

| | Now (demo, temporary address) | Launch day (aspireiit.in, switch off) | Switch on |
|---|---|---|---|
| Google and AI engines may read the site | No | Yes | Yes |
| Old-address forwards | Saved; "Test a URL" works | **Working** | Working |
| Your crawler blocks and Copilot opt-out | Saved | **Applied** | Applied |
| Search Console and Bing codes | Saved | **Sent** | Sent |
| Centre pages | Visible with DEMO labels (still hidden from Google) | Visible | Plus search data and share buttons |
| Your titles, share previews, share cards | Preview only | Not used yet | **Used** |
| Structured data, llms.txt | No | No | **Yes** |
| AI crawler visit counts | No | No | **Yes** |

- There is one switch, **"Open the site to search engines with the go-live pack"**, under *Google & AI search → Overview*.
- It **cannot be turned on** until the site has left demo mode, is configured for aspireiit.in, **and** the page you are using was opened at aspireiit.in (this proves the server sees the right address).
- Safety net: any request that arrives at another address (the temporary one, for example) is always marked "noindex", and its robots.txt says `Disallow: /`, even after launch.

### What we need from you

1. **Verified centre facts.** For each centre: the exact address with PIN code, the phone number Aspire controls, enquiry-desk hours, the Google Maps link, and which courses run there. For the institute: the name exactly as on the signage and the Business Profiles, and the official social profile links. Open conflicts to settle: C1–C4 (centre addresses), C6 (admissions email), C7 (hours), C30 (which towns have centres) and C41 (region served).
2. **Google Business Profile access.** Manager access to each centre's profile, or the name of whoever manages them, so the checklist can be done and the website link changed on launch day.
3. **The old website's addresses.** We already have every address in the old sitemaps. Please confirm the suggested forwards, and send any old address that is not in the sitemaps: brochures, QR codes, ads, WhatsApp messages, and Justdial or Sulekha listings.
4. **Search Console access** to the current aspireiit.in property, and who set it up. It shows which old pages get visits and links, and keeping it avoids starting from zero.
5. **Domain access** (registrar or DNS login, or the person who manages it). Only the website records change. Email on @aspireiit.in keeps working.
6. **A decision on aspire2.thechunkmedia.com**, the earlier demo: retire it at launch with a forward to aspireiit.in (recommended).

### What you can do now (nothing goes public)

1. **Business facts:** type and verify the institute's name and each centre's address, phone, hours and map links. Check them against signage and each Google Business Profile.
2. **Google Business Profile:** work through the checklist for each centre. This is offline work, and the most useful local step.
3. **Forwards:** accept, change or turn off each group of suggested forwards.
4. **Titles:** review the warnings on *Page titles & share previews*.
5. **Google Analytics:** export any old reports you want to keep. The old Analytics and Tag Manager stop at launch (decision 21).

### At launch (about an hour with the developer; §16)

1. Point aspireiit.in at the new server (website records only; email records untouched), and forward the temporary address to it.
2. Rebuild in production mode. Forwards, crawler choices and verification tags start working at once.
3. Check that old addresses forward and that the server sees aspireiit.in. Then turn the switch on.
4. Keep or set up Search Console with one DNS record, import the site into Bing, and submit the sitemap.
5. Test a few pages and a WhatsApp preview, and change each Business Profile's website link to its centre page.

Crawlers re-read robots.txt within about a day.

### Honest limits

- **Towns without a centre** (Mandi, Solan, Una, Bilaspur, Kinnaur, Rampur, Rohru): their old town pages forward to the centre serving that district. We do not make town pages for towns without a centre, because Google treats them as "doorway pages". Rankings for those town searches may drop. A complete Business Profile for each centre matters more.
- **Google Analytics and Tag Manager stop at launch** (decision 21: cookie-free counts come in Phase 5).
- **FAQ and course markup** no longer earn special Google results. They are added only to help search engines and AI tools read the facts.
- **AI answers cannot be measured automatically.** The Overview page has a monthly 10-question check.
- **Hindi share cards are not possible with today's card tool** (it cannot join Hindi letters correctly). Hindi pages use the English card.
- **Crawler visit counts trust the name a bot gives.** A fake name cannot be told apart in this release, and the table says so.

### Decisions taken by default (each can be changed later)

| # | Question | Default used |
|---|---|---|
| S1 | How the go-live switch works | A console switch for super admins. It works only out of demo mode, with the site configured for aspireiit.in and the admin's own page opened at aspireiit.in. Emergency off in the server settings: `SEO_PACK_DISABLED=true` (also stops the forwards and counting). |
| S2 | The temporary address | Never indexed. The site stays hidden unless it is configured for aspireiit.in, and any request arriving at another address gets "noindex" and a `Disallow: /` robots.txt. |
| S3 | Centre pages before launch | Visible on the demo site with DEMO labels (the demo site is hidden from search anyway). Their search parts follow the switch. |
| S4 | AI crawlers (decision 22) | Allow answer crawlers, user-triggered fetchers and training crawlers on public pages. Private areas are always blocked. "Keep Aspire out of Microsoft Copilot answers" is off. Your blocks apply from launch day, with or without the switch. |
| S5 | Search Console and Bing | A DNS record for the whole domain (recommended). Keep the existing aspireiit.in property if Aspire controls its Google account. Meta-tag codes are optional and are sent from launch day. Bing imports from Search Console. |
| S6 | Hindi share cards | Not in this release. Hindi pages use the English card. |
| S7 | Hindi pages whose main text is still English | When the switch is on, these are left out of search (noindex, follow), the language link and the sitemap, so Google does not see near-duplicates. |
| S8 | Old-address forwards | 108 suggestions from the old sitemaps, listed as *Suggested*; they work only once accepted. 301s, kept at least one year, pointing only to pages on this site. They work from launch day. |
| S9 | Structured data | Only verified facts and approved content. No star ratings or reviews of our own centres, ever. FAQ and course markup carry no promise of special results. A test event is marked up only for a slot a super admin confirms is held at a verified centre address. |
| S10 | Results on centre pages | Shown only with written permission given after the result, plus course name, duration and whether the course was paid (CCPA coaching guidelines). None today; the consent register (Phase 3a) supplies them. The demo shows a notice and no names. |
| S11 | Who edits | Super admins. Other admins can read every page. |
| S12 | Crawler counts | Per day, bot and type of page, by the name the bot gives. Not checked against the bot owners' address lists in this release. **No IP address is read, stored or logged by the app.** Kept 400 days. |
| S13 | `/faculty` | Stays a temporary (302) redirect in the code, as you asked on 20 Oct. Making it permanent needs your OK. |
| S14 | Monthly AI-answer check | A manual list of 10 questions on the Overview page. |
| S15 | `/scholarship-test` in the sitemap | Not added (Phase 2 decided this). It is found through centre pages, campaign links and `/links`. |
| S16 | Old town pages | Forward to the centre that serves that district. No new town pages without a centre. |
| S17 | aspire2.thechunkmedia.com | Recommended: retire it at launch with a forward to aspireiit.in's home page. It is "noindex" today, so no rankings depend on it. Not part of the forward list. |

**Where this goes beyond the approved plan:** WebSite (site-name) markup and the ItemList of courses. FAQ and Course markup are included without any promise of special results, as the approved plan says.
**Left for later (on "What's coming"):** Instagram posts as links (Phase 5), IndexNow (with the Phase 3c editors), Hindi share cards (needs a card tool that joins Hindi letters), checking crawler addresses against the bot owners' lists, a chart of crawler visits, and a change history for page titles (the audit log records who changed which page and when).

---

## 0. Review record (lead's verdicts on the adversarial review of 22 Oct 2026)

Every claim marked "verified" was re-checked read-only by the lead.

| Point | Verdict | What changed |
|---|---|---|
| A1 old site is live and indexed | **Accepted** (verified: page-sitemap 109, post-sitemap 3, wpt-testimonial-sitemap 17; Yoast robots) | Owner summary rewritten. Seeds replaced by the real old-site list (§5.G.1, 108 rules, `/wpt-testimonial/*` as one prefix rule). The aspire2 paths are **dropped** rather than kept conditionally: aspire2 is noindex, so no ranking depends on them (S17). `/rankers.json` dropped. Owner note on towns without a centre (S16). |
| A2 old-site continuity at the DNS move | **Accepted, one change** | Runbook: keep the existing Search Console property, change only A/AAAA records, keep MX/TXT, GA4/GTM stops (decision 21), test the two-hop forward. Verification metas are sent whenever the site is not hidden. Change: the old verification token is **not** committed or pre-filled; the owner confirms who controls that Google account and pastes the code (§5.F). |
| A3 redirects independent of the switch | **Accepted and generalised** | Principle (§2.1): leaving demo mode on aspireiit.in turns on continuity (redirects, verification tags) and the owner's restrictions (crawler blocks, Copilot opt-out); the switch turns on additions. `SEO_PACK_DISABLED` stops the proxy step entirely. |
| A4 host guard bypass | **Accepted, extended** | `searchPrerequisites()` reads `NEXT_PUBLIC_SITE_URL` at call time; unset or invalid = not final. Request-host guard in the proxy (sync, no DB). The golive PUT also needs the admin's request host to be a production host, which catches nginx not forwarding `Host`. Production-case robots tests stub the env. |
| A5 enquiry form preset | **Accepted** (verified: EnquiryForm.tsx:121, :203, :377) | Centre page uses `variant="admissions"`; reset restores `defaultCentre ?? "not-sure"`; test added. |
| B1 Event venue text | **Accepted** | `location.name` is the verified brand name; the address is the verified centre address. The typed venue is shown to the super admin only. |
| B2 markup matching visible content | **Accepted** | `areaServed` dropped from the centre markup (the districts list is unverified demo data, so no visible section is added). `BreadcrumbJsonLd` takes the same props the page passes to `HeroBreadcrumbs`. The centre hero finder is fed from the resolved NAP. |
| B3 cross-page `@id` | **Accepted** | References are inlined `{ "@type", "@id", name, url }`; every `@id` uses the English path. |
| B4 next/og remote fetches | **Accepted, softer on save** (verified: `fonts.googleapis.com` and twemoji in `@vercel/og/index.node.js`) | Card text is mapped to ASCII punctuation and limited to printable ASCII; any other text falls back to the default title or the site card. Saving is not refused (the same title is fine for Google); the editor warns. Test: `fetch` is never called during a card render. |
| B5 drop the Hindi font test | **Accepted** | Font test, font file, the `share` setting and its audit codes removed. S6 = not in this release. |
| B6 open redirect | **Accepted** | `isSafeInternalPath()` (origin check plus refusals of `\`, `%5C`, `%2F%2F`, controls, whitespace) on save, on import and on load; schema CHECKs. Location is **absolute on the request's own origin** (`request.nextUrl.clone()`), as the existing `/en` redirect does; `NextResponse.redirect` needs an absolute URL. |
| B7 shadowing and reserved paths | **Accepted, two changes** | Reserved list covers `/go`, `/links`, `/scholarship-test`, `/rancho`, `/login`, `/forgot-password`, `/manifest.webmanifest`, `/faculty`. Change 1: the list is hand-written and a **test** derives the top-level segments from `src/app` and fails on drift (`src/app` is not in the standalone runtime). Prefix covering a live page is an error. Change 2: re-validation runs in the console and the go-live checklist, **not** in the proxy (the proxy must not load content). |
| B8 `/go/` and crawlers | **Accepted** | `/go/` disallowed in basic and live (harmless before Phase 2 ships). |
| C1 over-broad invalidation | **Accepted** | Render settings (`golive`, `crawlers`, `verification`) tagged `seo:settings`; console-only settings (`gbp`, `checklist`) are never cached and never revalidate. Page meta per page tag `seo:meta:<pageKey>`. |
| C2 short-lived production builds | **Accepted** | Stated in §8 and the deploy notes; hidden mode reads no cache (tested). |
| C3 database in the proxy | **Accepted, different mechanism** | The proxy uses its own small `node:sqlite` handle (`proxy/db.ts`: no `server-only`, no schema run, `busy_timeout = 50`), `BEGIN IMMEDIATE`, skip on busy. Range-list downloads are moot (cut, D5). A build check closes SEO-ROUTING; Plan B is written down. |
| C4 proxy signature | **Accepted** | `proxy(request, event?)`; existing tests call `proxy(request)` unchanged; without an event, the flush is skipped. |
| D1 Article not "beyond the plan" | **Accepted** (verified: admin plan line 248) | Fixed. |
| D2 1b not landed | **Accepted** (verified: `areas.ts` has the search group; `status.ts` and `admin/search/page.tsx` do not exist yet) | Reworded; precondition kept. |
| D3 centre titles | **Accepted, different formula** | "{services} coaching in {town}" plus the site suffix (fits 60 characters); fallback "Coaching centre in {town}". Town = verified `displayName`, else the finder's short name. |
| D4 NAP consistency with footer and Contact | **Accepted** | Consistency panel and checklist item `nap`. |
| D5 default cuts | **Accepted** | Crawler IP verification, page-title history and restore, and the visits chart are out. |
| D6 no Phase 3a package running | **Accepted** | Added to §1.1. |
| D7 JSON-LD outside `PageLayoutFrame` slots | **Accepted** | §5.B. |
| D8 `withSeo` for invisible entities | **Accepted** | Returns `base`. |
| D9 privacy wording | **Accepted** | "The app stores no IPs"; nginx logs are named. |
| D10 aspire2 | **Accepted** as an owner decision | S17 and runbook. |
| E missing tests | **Accepted** | Each added to the package acceptance lists. |

---

# Part 1. Design

## 1. Preconditions and ground rules

### 1.1 Start conditions (hard)

1. **Phase 1b Integrate is done and green.** The following must exist (on 22 Oct only the first and last do):
   - `src/components/portal/areas.ts` with the `search` group and `searchOverview → /admin/search`
   - `src/app/[lang]/(portal)/admin/search/page.tsx` (1B-SOURCES)
   - `src/lib/console/status.ts` (1B-HOUSEKEEPING)
   - `src/components/portal/audit-labels.ts`
   - `src/lib/crm/console/centre-links.ts` `getCentreLinks`

   If any is missing, SEO-CORE stops and reports.
2. **No Phase 2 or Phase 3a package is running.** SEO-CORE edits `src/lib/db/features/index.ts` and `src/lib/data.ts`; SEO-META edits public `(site)` pages; SEO-CENTRES edits `EnquiryForm` / `HeroEnquiryForm`. Phase 2 (P2-PUBLIC) and Phase 3a may touch the same files.
   - Preferred: start after Phase 2 Integrate (R3).
   - If R3 has not landed, SEO-META leaves `scholarship-test/**` untouched and SEO-INTEGRATE wires the Event markup later.
3. **Re-read every shared file immediately before editing it.** Adapt this plan's names to the real ones and report every difference.

### 1.2 Rules for every package

1. **Next 16.** Before writing code, read `node_modules/next/dist/docs/` on:
   - metadata: `generate-metadata.md` (With Cache Components), `robots.md`, `sitemap.md`, `image-response.md`
   - `02-guides/json-ld.md`
   - Proxy: `file-conventions/proxy.md` (Node runtime, `NextFetchEvent`), `02-guides/redirecting.md`, `next-config-js/skipTrailingSlashRedirect.md`
   - Cache Components: `use cache`, `cacheLife`, `cacheTag`, `revalidateTag`, `connection`
   - route handlers

   Route handlers only, never Server Actions. Portal pages follow the `PortalGate` pattern: session and header reads go under `<Suspense>`.
2. **APIs** live under `/api/admin/seo/**`. The proxy already adds `no-store` and `X-Robots-Tag` for portal APIs. Every API:
   - guards through `src/lib/seo/access.ts`: super admin for writes, admin for reads
   - uses the D-007 envelope
   - accepts same-origin writes only
   - validates input with strict zod
   - limits bodies to 8 KB (64 KB for the redirect CSV import)
   - allows 60 writes per 10 min per user
3. **SQL** lives only in `src/lib/seo/repo/*.ts` (D-037), except the proxy's own handle in `src/lib/seo/proxy/db.ts` (§5.G). Read paths never open a write transaction. Other features' tables (`crm_test_*`, `crm_fact_*`) are only SELECTed, and only after checking that they exist in `sqlite_master`.
4. **Console pages** (`/admin/search/**`) are English only (decision 5), with strings as constants in the module. **Public strings** are in English and Hindi: `src/i18n/messages/{en,hi}/seo.ts` (SEO-CORE) and the `page.*` subtree of `{en,hi}/centres.ts` (SEO-CENTRES). Report every Hindi line for `docs/hindi-review-register.md`.
5. **Machine limits:**
   - no `next build`, dev server or browser on the owner's PC (only the CI build and Integrate)
   - vitest only on the package's listed paths, with `--maxWorkers=1`
   - at most one `npx tsc --noEmit` per package, at the end
   - eslint on the files touched
6. **Audit:** every write is audited through `seoAudit()` with codes from `SEO_AUDIT` (§7.3). Details hold ids, enum values and lengths only. No detail key may match `pass|hash|token|secret|salt|cookie|credential`; verification codes are never written to the audit log.
7. **Never touch:**
   - `src/components/home/**`, `src/components/ui/*carousel*`, `src/components/hero/**` (import only)
   - `src/lib/crm/**`: import only `getCentreLinks` and types
   - `src/lib/lead-gate/**`, `src/lib/ask/**`, `src/lib/mocktest/**`, `src/lib/qb/**` (read-only imports allowed)
   - `next.config.ts`, `package.json`, `deploy/**` (Integrate only)
   - `src/app/api/predictor/card/**`
   - the predictor and planner JSON-LD blocks and their tests
8. **Stubs:** SEO-CORE writes the stub files of §4.4 with their final signatures. The receiving package replaces each stub completely, and nobody else edits it.

### 1.3 Other workstreams

- **Phase 2 (R3)** owns `/scholarship-test`, `/links`, `/go/[code]`, `crm_test_events` / `crm_test_slots` and the fact sheet (`crm_fact_*`). This pack reads them through guarded adapters (§5.D) and works whether or not R3 has shipped.
- **Phase 3a (approvals and consent)** will change what `src/lib/data.ts` treats as visible. This pack reads visibility only through `data.ts`, so it follows automatically. Local results on centre pages wait for 3a's disclosure data (§5.E).
- **Phase 3b (announcements)** supplies announcement share cards and share texts later through one seam (`getAnnouncementForShare`, a stub that returns null).
- **Phase 3c (editors)** must not add separate SEO fields to content; it links to *Page titles & share previews*. When 3c publishes a slug, it must call `redirectShadows(path)` (§5.G) and warn if an active redirect would hide the new page. When 3c ships, it adds IndexNow pings.

---

## 2. The launch switch

### 2.1 Three modes and one principle

**Principle.** Leaving demo mode on aspireiit.in turns on *continuity* (old-address forwards, verification tags) and the owner's *restrictions* (crawler blocks, Copilot opt-out). The console switch turns on *additions* (title overrides, share cards, structured data, llms.txt, share buttons, crawler counting).

| Mode | When | What visitors and crawlers get |
|---|---|---|
| **hidden** | Demo mode (`showPlaceholderContent()` is true), **or** the configured site origin (`NEXT_PUBLIC_SITE_URL`, read at call time) is unset, invalid, not https, or not a production host | Today's demo behaviour: robots `User-agent: *` / `Disallow: /`, layout `noindex, nofollow`. Nothing from this pack is served. The proxy step returns before any database access. |
| **basic** | Not hidden, and the console switch is off, `SEO_PACK_DISABLED=true`, or the setting cannot be read | R1 production behaviour plus continuity and restrictions (§2.3). With `SEO_PACK_DISABLED=true` or unreadable settings: exactly R1 plus the `/go/` disallow, and the proxy step does nothing. |
| **live** | Not hidden, the switch is on, and the pack is not disabled | Everything in §2.3, column "live" |

The **request-host guard** (§2.3) runs in basic and live, independently of the switch and of `SEO_PACK_DISABLED`.

**`src/lib/seo/prereq.ts`** (SEO-CORE; pure and env-only; the only SEO module the proxy imports besides the proxy and redirect modules):

```ts
export const PRODUCTION_HOSTS = ["aspireiit.in", "www.aspireiit.in"] as const; // decision 17
export interface SearchPrerequisites {
  demo: boolean;            // showPlaceholderContent()
  siteOriginFinal: boolean; // https origin of NEXT_PUBLIC_SITE_URL whose host is in PRODUCTION_HOSTS; unset/invalid → false
  packDisabled: boolean;    // SEO_PACK_DISABLED === "true"
  open: boolean;            // !demo && siteOriginFinal  (i.e. not hidden)
  canGoLive: boolean;       // open && !packDisabled
}
export function searchPrerequisites(env: NodeJS.ProcessEnv = process.env): SearchPrerequisites;
/** First X-Forwarded-Host value, else Host; lowercased, port and trailing dot stripped; null if absent. */
export function requestHost(headers: Headers): string | null;
export function isProductionHost(host: string | null): boolean;
export const ROBOTS_TXT_DISALLOW_ALL = "User-agent: *\nDisallow: /\n";
```

- It must not import `server-only` modules. It repeats the six-line origin parse of `getSiteOrigin` (`src/lib/server/env.ts:121`); a test asserts equal results for a table of inputs. It does **not** use `siteConfig.url`, whose fallback is `https://aspireiit.in` when the env is unset.
- **`src/lib/seo/mode.ts`** (server):

  ```ts
  export type SearchMode = "hidden" | "basic" | "live";
  /** hidden → no cache read at all; basic when disabled; else reads getRenderSettings().golive. Build time → never "live". */
  export async function searchMode(): Promise<SearchMode>;
  export async function isSearchLive(): Promise<boolean>;
  export function searchModeLabel(mode: SearchMode, p: SearchPrerequisites): string;
  ```

- **Fail closed:** any read error gives `basic`, never `live`.
- **Tests:** `NODE_ENV=test` with `SHOW_PLACEHOLDER_CONTENT` unset means demo, so the mode is `hidden` and no database or cache is touched.

### 2.2 The switch itself

- **Stored in** `seo_settings`, setting `golive`, as `{ on: boolean, changedAt: number | null }`, with an optimistic `version`; `updated_by` holds the setter.
- **Who can change it:** super admins only, through `PUT /api/admin/seo/settings/golive`.
  - Turning it on returns **409 `prerequisites`** with the failing items (`demo`, `domain`, `packDisabled`, `requestHost`) unless `canGoLive` holds **and** `isProductionHost(requestHost(request.headers))`. The last item proves that nginx forwards the public host to the app.
  - Turning it off is always allowed.
- **Confirm dialog, turning on:** "Search engines and AI crawlers will get structured data, share cards, your page titles, llms.txt and share buttons, and crawler visits will be counted. Crawlers re-read robots.txt within about a day."
- **Confirm dialog, turning off:** "Structured data, share cards, your page titles, llms.txt, share buttons and crawler counting stop. Old-address forwards, verification tags and your crawler choices keep working. Pages already in Google stay there for a while."
- **After a change:** `revalidateTag("seo", { expire: 0 })` refreshes every loader tagged `seo`, and `invalidateSeoProxyState()` makes the proxy reload within one request (at most 60 s if the proxy runs in another context; §5.G).
- **Audit:** `seo.golive_on` / `seo.golive_off`.

### 2.3 What changes per surface

| Surface | hidden (demo) | basic | live |
|---|---|---|---|
| `robots.txt` | `Disallow: /` (exact R1 object) | R1 rules plus `/go/` in `disallow`, plus one `{ userAgent: [blocked tokens], disallow: "/" }` group when the policy blocks any crawler, plus sitemap. Pack disabled or settings unreadable: R1 plus `/go/` only. Never 5xx. | basic plus `Allow: /api/predictor/card` in `*` |
| Request-host guard (proxy, sync) | off | on: a request whose host is not in `PRODUCTION_HOSTS` gets `X-Robots-Tag: noindex, nofollow` on its response, and `/robots.txt` on that host is answered with `ROBOTS_TXT_DISALLOW_ALL` | on |
| `<meta name="robots">` | `noindex, nofollow` (layout) | none; `noarchive` when the Copilot opt-out is set | as basic, plus `noindex, follow` on untranslated Hindi detail pages (S7) |
| Search Console / Bing meta tags | none | when codes are saved | when codes are saved |
| Redirect map (proxy) | off (console "Test a URL" works) | 301s (off when `SEO_PACK_DISABLED`) | 301s |
| Title and description overrides | not applied (console previews only) | not applied | applied |
| Open Graph / X card | R1 (site name, locale; predictor card) | R1 | full `og:title` (no branding), description, clean `og:url`, `og:image` 1200 × 630 with width, height and alt, `twitter:card=summary_large_image` on every public page |
| `/og/*` share images | signed-in admins only; otherwise 404 | same | public, cached |
| JSON-LD | none from this pack (R1's predictor and planner blocks unchanged) | same | Organization, WebSite, centre LocalBusiness, Course / ItemList, Article, BreadcrumbList, FAQPage, Event, from verified facts and approved content only |
| `/llms.txt` | 404 | 404 | generated (§5.F) |
| AI crawler counting | off | off | on |
| Share buttons on pages | hidden | hidden | shown where an approved share text exists |
| Centre pages | visible, DEMO-labelled (S3) | visible for published centres | plus JSON-LD and share buttons |
| Sitemap | R1 plus centre pages | same | plus: untranslated Hindi detail URLs and their `hi-IN` links omitted |
| hreflang on pages | R1 | R1 | `hi-IN` only where the Hindi page is translated (S7) |
| `/admin/status` "Google indexing" | "Hidden from search (demo mode)" or "Hidden from search (not on aspireiit.in)" | "Open to search engines (go-live pack off)" or "(go-live pack disabled on the server)" | "Open to search engines (go-live pack on)" |

### 2.4 Tests for the switch (SEO-CORE)

- Each mode for each combination of the demo flag, `NEXT_PUBLIC_SITE_URL` (aspireiit.in, www, http://aspireiit.in, the temporary domain, localhost, unset, garbage), `SEO_PACK_DISABLED` and the stored `golive`.
- `searchPrerequisites` agrees with `getSiteOrigin` on every input; `requestHost` handles `X-Forwarded-Host` lists, ports and case.
- In hidden mode `searchMode()` calls no loader (spy on `getRenderSettings`).
- A settings read error gives basic.
- PUT `golive` on with failing prerequisites gives 409 with the items, including `requestHost` when the request host is the temporary domain.
- An admin who is not a super admin gets 403.
- Turning on audits and revalidates the `seo` tag.
- `robots()` output is exact for hidden, basic (default policy; blocked training group; disabled) and live. Production-case tests stub `NEXT_PUBLIC_SITE_URL=https://aspireiit.in` and `SHOW_PLACEHOLDER_CONTENT=false`.
- Verification metas are present in basic and live, absent in hidden.

---

## 3. Data model (feature schema `seo`)

`src/lib/db/features/seo.ts` (SEO-CORE):
- **Idempotent:** only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. It imports no project files at runtime.
- **Placement:** appended to `FEATURE_SCHEMAS` after `page_layout`, before `qb`.
- **Test prefix:** `src/lib/db/db.test.ts` adds `seo` to both prefix regexes.
- **Personal data:** none (no IPs, no user agents, no visitor data). User ids appear only in `*_by` columns with `ON DELETE SET NULL`.
- **No foreign keys to Phase 2 tables**, because they may not exist.
- Column names avoid SQLite keywords (`MATCH`, `KEY`, `ACTION`). In the TypeScript template string the backslash literal is written `'\\'`.

```sql
-- Settings. Render settings: golive, crawlers, verification. Console-only: gbp, checklist (SEO_SETTING_KEYS).
CREATE TABLE IF NOT EXISTS seo_settings (
  setting TEXT PRIMARY KEY CHECK (length(setting) BETWEEN 1 AND 40),
  value TEXT NOT NULL CHECK (length(value) <= 20000),                  -- JSON, zod per setting
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL
);

-- Per-page title / description / share overrides. page_key: 'home' | 'program:<slug>' | 'article:<slug>' | 'centre:<slug>' | 'test' | …
CREATE TABLE IF NOT EXISTS seo_page_meta (
  page_key TEXT NOT NULL CHECK (length(page_key) BETWEEN 1 AND 120),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'hi')),
  title TEXT CHECK (title IS NULL OR length(title) <= 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 320),
  share_title TEXT CHECK (share_title IS NULL OR length(share_title) <= 100),
  share_description TEXT CHECK (share_description IS NULL OR length(share_description) <= 200),
  card TEXT NOT NULL DEFAULT 'auto' CHECK (card IN ('auto', 'default')),
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (page_key, locale)
);

-- Business facts. scope 'org' or 'centre:<slug>'; field from FACT_FIELDS (code). Saving resets to draft.
CREATE TABLE IF NOT EXISTS seo_facts (
  scope TEXT NOT NULL CHECK (scope = 'org' OR (scope LIKE 'centre:%' AND length(scope) BETWEEN 8 AND 68)),
  field TEXT NOT NULL CHECK (length(field) BETWEEN 1 AND 40),
  value_en TEXT NOT NULL CHECK (length(value_en) BETWEEN 1 AND 2000),   -- text, or JSON for hours / programs
  value_hi TEXT CHECK (value_hi IS NULL OR length(value_hi) <= 2000),
  source_note TEXT CHECK (source_note IS NULL OR length(source_note) <= 200),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified')),
  verified_at INTEGER,
  verified_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (scope, field),
  CHECK ((status = 'verified') = (verified_at IS NOT NULL))
);

-- Redirects (proxy, 301). Paths normalised in code; internal paths only (isSafeInternalPath), also enforced here.
CREATE TABLE IF NOT EXISTS seo_redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL UNIQUE CHECK (length(source) BETWEEN 2 AND 300 AND substr(source, 1, 1) = '/'
    AND substr(source, 1, 2) <> '//' AND instr(source, '\') = 0),
  kind TEXT NOT NULL DEFAULT 'exact' CHECK (kind IN ('exact', 'prefix')),
  target TEXT NOT NULL CHECK (length(target) BETWEEN 1 AND 300 AND substr(target, 1, 1) = '/'
    AND substr(target, 1, 2) <> '//' AND instr(target, '\') = 0),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('active', 'suggested', 'off')),
  origin TEXT NOT NULL DEFAULT 'admin' CHECK (origin IN ('seed', 'admin', 'import')),
  seed_group TEXT CHECK (seed_group IS NULL OR length(seed_group) BETWEEN 1 AND 40),
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS seo_redirects_status_idx ON seo_redirects (status, kind);
CREATE INDEX IF NOT EXISTS seo_redirects_group_idx ON seo_redirects (seed_group, status);
CREATE TABLE IF NOT EXISTS seo_redirect_hits (
  redirect_id INTEGER NOT NULL REFERENCES seo_redirects (id) ON DELETE CASCADE,
  day TEXT NOT NULL CHECK (length(day) = 10),                           -- IST YYYY-MM-DD
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (redirect_id, day)
);

-- Crawler visits: aggregates only, never an IP or a user agent. `verified` is always 'unknown' in R4
-- (IP-range checks are a later item); the column stays so that later item needs no migration.
CREATE TABLE IF NOT EXISTS seo_crawler_visits (
  day TEXT NOT NULL CHECK (length(day) = 10),
  bot TEXT NOT NULL CHECK (length(bot) BETWEEN 1 AND 40),               -- CRAWLERS[].id
  path_group TEXT NOT NULL CHECK (path_group IN ('page', 'robots', 'sitemap', 'llms', 'share_image', 'private', 'api', 'redirect', 'other')),
  verified TEXT NOT NULL DEFAULT 'unknown' CHECK (verified IN ('yes', 'no', 'unknown')),
  hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (day, bot, path_group, verified)
);

-- Scholarship-test slots a super admin confirmed are held at a centre's verified address (Event markup).
CREATE TABLE IF NOT EXISTS seo_event_places (
  slot_id TEXT PRIMARY KEY CHECK (length(slot_id) BETWEEN 1 AND 64),    -- crm_test_slots.id (no FK: Phase 2 may be absent)
  centre_slug TEXT NOT NULL CHECK (length(centre_slug) BETWEEN 1 AND 60),
  confirmed_at INTEGER NOT NULL,
  confirmed_by TEXT REFERENCES users (id) ON DELETE SET NULL
);

-- WhatsApp share texts (staff copy + public share buttons). text_key from SHARE_TEXT_KEYS (code).
CREATE TABLE IF NOT EXISTS seo_share_texts (
  text_key TEXT NOT NULL CHECK (length(text_key) BETWEEN 1 AND 40),
  lang TEXT NOT NULL CHECK (lang IN ('en', 'hi', 'hinglish')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 700),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  approved_at INTEGER,
  approved_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (text_key, lang)
);
```

**Seeding:** `seo_redirects` seeds and `seo_share_texts` drafts are inserted per row with `INSERT OR IGNORE`, from the admin actions *Load suggestions*, never by the schema. A deleted seed therefore never comes back by itself.

**Retention:** the counter flush deletes `seo_crawler_visits` and `seo_redirect_hits` rows older than 400 days, at most once a day.

---

## 4. Shared contracts (SEO-CORE writes these; frozen once SEO-CORE finishes)

### 4.1 `src/lib/seo/types.ts` (client-safe, no I/O)

```ts
export type SearchMode = "hidden" | "basic" | "live";
export const SEO_SETTING_KEYS = ["golive", "crawlers", "verification", "gbp", "checklist"] as const;
export const RENDER_SETTING_KEYS = ["golive", "crawlers", "verification"] as const;   // cached, tag seo:settings
export const CONSOLE_SETTING_KEYS = ["gbp", "checklist"] as const;                    // uncached, never revalidate
export type CrawlerGroup = "search" | "answer" | "user" | "training" | "preview";
export type Allow = "allow" | "block";
export interface CrawlerPolicy {
  groups: { answer: Allow; user: Allow; training: Allow };     // search + preview are always allowed
  overrides: Partial<Record<CrawlerId, Allow>>;                 // zod refuses search and preview ids
  bingNoArchive: boolean;
  reviewedAt: number | null;
}
export const DEFAULT_CRAWLER_POLICY: CrawlerPolicy; // all "allow", {}, false, null (decision 22)
export interface VerificationCodes { google: string | null; bing: string | null }
export interface GoLiveTicks { oldUrlsConfirmed: number | null; searchConsoleReady: number | null; aiCheckStarted: number | null }
export type GbpItemKey = "verified" | "name" | "address" | "phone" | "category" | "website" | "hours" | "photos" | "reviews" | "posts" | "listings";
export type GbpState = Record<string /* centre slug */, Partial<Record<GbpItemKey, number /* done at */>>>;
export interface RenderSettings { golive: { on: boolean; changedAt: number | null }; crawlers: CrawlerPolicy; verification: VerificationCodes }

export type SeoPageRef =
  | { kind: "static"; key: StaticPageKey }
  | { kind: "program"; slug: string }
  | { kind: "article"; slug: string }
  | { kind: "centre"; slug: string }
  | { kind: "test" };
export type StaticPageKey = "home" | "about" | "admissions" | "programs" | "results" | "centres" | "hostels"
  | "resources" | "contact" | "tools" | "tools-ask" | "predictor" | "mock-tests" | "leaderboard" | "planner"
  | "rancho" | "privacy" | "terms" | "scholarship-test";
export function pageKeyOf(ref: SeoPageRef): string;          // "home" | "program:<slug>" | … | "test"
export type ShareCardKind = "site" | "page" | "program" | "centre" | "article" | "test" | "announcement";
export interface ShareCardRef { kind: ShareCardKind; key: string }   // key = page key / slug / event code
export interface ShareImage { url: string; width: 1200; height: 630; alt: string }

export const FACT_FIELDS = {
  org: ["name", "alternateName", "legalName", "description", "foundingYear", "telephone", "email", "logo", "regionServed",
        "social.facebook", "social.instagram", "social.youtube", "social.linkedin", "social.x", "social.telegram"],
  centre: ["displayName", "street", "locality", "region", "postalCode", "lat", "lng", "telephone", "email",
           "hours", "hoursNote", "mapsUrl", "gbpUrl", "programs"],
} as const;
// centre.displayName = the town as on the signage and the Business Profile address (e.g. "Dharamshala").
export interface OpeningHoursRow { days: ("Mo"|"Tu"|"We"|"Th"|"Fr"|"Sa"|"Su")[]; opens: string; closes: string } // "HH:MM"
export interface VerifiedOrg {
  name?: string; alternateName?: string; legalName?: string; description?: { en: string; hi?: string };
  foundingYear?: number; telephone?: string; email?: string; logo?: string; regionServed?: string; sameAs: string[];
  verifiedAt: Record<string, number>;
}
export interface VerifiedCentre {
  slug: string; displayName?: { en: string; hi?: string };
  address?: { street: string; locality: string; region: string; postalCode: string; country: "IN" }; // all four verified, else absent
  geo?: { lat: number; lng: number }; telephone?: string; email?: string;
  hours?: OpeningHoursRow[]; hoursNote?: { en: string; hi?: string };
  mapsUrl?: string; gbpUrl?: string; programs?: ExamTrack[];
  verifiedAt: Record<string, number>;
}
export interface VerifiedFacts { org: VerifiedOrg; centres: Record<string, VerifiedCentre> }
export interface PageMetaOverride { title: string | null; description: string | null; shareTitle: string | null; shareDescription: string | null; card: "auto" | "default"; version: number }
export type CrawlerId = (typeof CRAWLERS)[number]["id"];   // re-exported from crawlers/registry.ts
export type PathGroup = "page" | "robots" | "sitemap" | "llms" | "share_image" | "private" | "api" | "redirect" | "other";
export interface CrawlerHit { bot: CrawlerId; pathGroup: PathGroup }   // no IP, no verified flag in R4
```

### 4.2 Server helpers (SEO-CORE)

| Module | Exports | Notes |
|---|---|---|
| `prereq.ts` (pure) | `PRODUCTION_HOSTS`, `searchPrerequisites(env)`, `requestHost(headers)`, `isProductionHost(host)`, `ROBOTS_TXT_DISALLOW_ALL` | §2.1. Proxy-safe. |
| `mode.ts` | `searchMode()`, `isSearchLive()`, `searchModeLabel(mode, prereq)` | §2.1 |
| `runtime.ts` (`"use cache"`) | `getRenderSettings()` (tags `seo`, `seo:settings`), `getPageMetaOverride(pageKey, locale)` (tags `seo`, `seo:meta:<pageKey>`), `getVerifiedFacts()` (tags `seo`, `seo:facts`); `SEO_TAG = "seo"`, `seoTag(part)` | Build: defaults (`golive` off, policy default, no codes, no overrides, no facts) with `BUILD_LIFE` like the page-layout loader (stale 300, revalidate 1, expire 600). Runtime: `cacheLife("max")`; a failed read uses the defaults with `cacheLife("minutes")`. Same pattern and comments as `src/lib/page-layout/loader.ts`. Called only after `searchPrerequisites().open` is true. |
| `settings.ts` | `readSeoSetting(key)` (uncached), `writeSeoSetting(key, value, { expectedVersion, actor, now })` | zod per key, optimistic version, audit. Render keys: `revalidateTag(seoTag("settings"), { expire: 0 })` and `invalidateSeoProxyState()`. Console keys: no revalidation. |
| `pages.ts` | `SEO_PAGES` (static key → `{ path, namespace }`), `pathOf(ref)`, `defaultMetaFor(ref, locale)`, `isRefVisible(ref)` (via `data.ts`), `allPageRefs()` (static, plus programs, articles and centres by **all** slugs, with a `visible` flag) | Server-only |
| `breadcrumbs.ts` | `crumbTrail({ crumbs, homeLabel, homeHref }, { path })` → `{ name, path }[]` | Mirrors `HeroBreadcrumbs` exactly (Home prepended; the last crumb, which has no href, takes the page's own path). A test renders `HeroBreadcrumbs` with the same props and compares names and hrefs. |
| `routes.ts` | `staticPublicRoutes`, `availableToolRoutes()`, `availableExamRoutes()` (moved verbatim out of `sitemap.ts`), `RESERVED_SEGMENTS`, `isReservedPath(path)`, `isLivePublicPath(path)` | `RESERVED_SEGMENTS` is hand-written: every top-level segment under `src/app` and `src/app/[lang]/(*)/` (including `go`, `links`, `scholarship-test`, `rancho`, `login`, `forgot-password`, `og`, `llms.txt`, `manifest.webmanifest`, `faculty`, `api`, private areas). `routes.test.ts` reads the directories and fails on drift. |
| `metadata.ts` | `withSeo(base: Metadata, ref: SeoPageRef, opts: { locale: Locale; path: string; share?: ShareCardRef; image?: "keep" }): Promise<Metadata>` | §5.B. Not live, or the entity is not visible: returns `base` unchanged (strict equality test). |
| `hindi.ts` | `hindiReady(ref)`: true for static pages; else true when the Hindi overlay in `src/content/hi/*` has the kind's main fields (program: title, shortDescription, description; article: title, summary, body; centre: name, summary) | S7 |
| `access.ts` | `isSeoEditor(session)`, `requireSeoAccess(request, { write })` (`requireSuperAdmin` for writes, `requireAdmin` for reads; 60 writes per 10 min per user) | Like `src/lib/page-layout/access.ts` |
| `audit.ts` | `SEO_AUDIT` (§7.3), `seoAudit(db, code, { actor, target, details, now })` | — |
| `warnings.ts` (client-safe) | `titleWarnings(text, { locale, suffix })`, `descriptionWarnings(text, locale)`, `shareWarnings(...)`, `claimWords(text)`, `duplicateTitles(rows)`, `graphemeLength(text)` (`Intl.Segmenter`), `cardTextWarning(text)` | §5.B thresholds |
| `card-glyphs.ts` (client-safe) | `cardText(text): string \| null` | Maps ’ ‘ → `'`, “ ” → `"`, – — → `-`, … → `...`, · • → `-`, NBSP → space; returns null if anything outside printable ASCII (U+0020–U+007E) remains. Used by the card renderer and the editor warning. |
| `golive.ts` | `goLiveChecklist(now, request)` → items `{ key, status: "done" \| "todo" \| "blocker" \| "info", label, detail, href }` | §5.A |
| `robots-rules.ts` (pure) | `robotsFor(mode, policy \| null, siteUrl): MetadataRoute.Robots`; `PRIVATE_PATHS` (moved from robots.ts); `GO_PATH = "/go/"` | §5.F |
| `crawlers/registry.ts` (client-safe) | `CRAWLERS` (§5.F table), `crawlersIn(group)`, `blockedCrawlers(policy)` | — |
| `proxy/registry.ts` | `seoProxyRegistry()` (`globalThis[Symbol.for("aspire.seoProxy")]`: `{ loadedAt, live, redirects, prefixes, pending: { crawler: Map, redirect: Map }, lastFlush, lastPrune, seenAt }`), `invalidateSeoProxyState()`, `markProxySeen(now)`, `proxySeenAt()` | ROUTING fills the state. `seenAt` lets the Overview show whether the proxy shares memory with the app. |
| `redirects/safe-path.ts` (pure) | `isSafeInternalPath(p)` | Starts with exactly one `/`; no `\`, no `%5C`/`%5c`, no `%2F%2F` (any case), no control characters or whitespace; `new URL(p, "https://x.invalid").origin === "https://x.invalid"`; at most 300 characters. |
| `redirects/normalize.ts`, `redirects/match.ts` (pure) | `normalizeSourcePath(raw)`, `buildRedirectTable(rows)` (drops unsafe rows), `matchRedirect(table, pathname, search)` → `{ id, path, search } \| null` | §5.G. Shared by the proxy and the console tester. |

### 4.3 Public components (SEO-CORE)

- `src/components/seo/JsonLdScript.tsx`: `<JsonLdScript data={object | object[]} />` renders one `<script type="application/ld+json">`. It escapes `<`, `>`, `&`, U+2028 and U+2029 as `\uXXXX`, and renders nothing for null or an empty array.
- `src/components/seo/console/shared/**`: `SeoShell` (heading, ModeBanner, back link), `ModeBanner` ("Hidden from search (demo mode): everything here is saved but not served until launch", or the basic/live text), `FactStatus` chip (text plus icon, never colour only), `LengthHint`, `CodeBlock` (with copy).

### 4.4 Stubs (final signatures; the receiver replaces them)

| Stub | Receiver | Stub behaviour |
|---|---|---|
| `src/lib/seo/share/cards.ts`: `shareImageFor(ref: ShareCardRef, locale): Promise<ShareImage \| null>`; `shareCardForPage(ref: SeoPageRef): ShareCardRef` | SEO-SHARE | `null`; `{ kind: "site", key: "site" }` |
| `src/components/seo/ShareLinks.tsx`: `<ShareLinks textKey path title slots locale />` | SEO-SHARE | renders nothing |
| `src/components/seo/jsonld/index.tsx`: `OrganizationJsonLd({ locale })`, `WebSiteJsonLd({ locale })`, `BreadcrumbJsonLd({ crumbs, homeLabel, homeHref, path, locale })`, `CourseJsonLd({ program, locale })`, `CourseListJsonLd({ programs, locale })`, `ArticleJsonLd({ article, locale })`, `FaqJsonLd({ faqs })`, `CentreJsonLd({ nap, slug, locale })`, `TestEventsJsonLd({ locale })` | SEO-FACTS | each renders `null` |
| `src/lib/seo/crawlers/classify.ts`: `classifyCrawler({ userAgent, pathname, redirected }): CrawlerHit \| null` | SEO-CRAWLERS | `null` |

---

## 5. Feature specs

### A. Overview, go-live switch and checklist (SEO-CORE; `/admin/search`)

- **Page:** the existing 1B-SOURCES page is kept, with two sections added above its enquiry numbers.
  1. **Search status card:**
     - the mode label and one sentence on what search engines see now
     - the switch (super admins; others see the state read-only)
     - "Last changed by … on …"
     - when the switch is off and it cannot be turned on, the reasons ("The site is in demo mode", "The site is not configured for aspireiit.in", "This page was opened at {host}, not aspireiit.in", "The go-live pack is disabled on the server")
     - one line "Request host seen by the app: {host}" and "Proxy shares memory with the app: yes / not yet seen" (from `proxySeenAt()`)
  2. **Go-live checklist**, computed by `golive.ts` (header reads under Suspense):

| Key | Status rule | Label |
|---|---|---|
| `mode` | blocker unless out of demo mode | Leave demo mode (Phase 3a approvals first) |
| `domain` | blocker unless the configured site address is aspireiit.in | Site configured for aspireiit.in |
| `requestHost` | blocker unless this page was opened at a production host | The server sees aspireiit.in (nginx forwards the host) |
| `orgName` | todo until `org.name` is verified | Institute name verified (needed for any structured data) |
| `centres` | done when every visible centre has a verified address; otherwise "2 of 4" | Centre addresses verified |
| `nap` | todo while the footer or Contact page phone, email or address (`getContactDetails()`, published content) differ from the verified facts | Footer, Contact page and centre pages show the same details |
| `crawlers` | todo until `crawlers.reviewedAt` is set | AI crawler policy reviewed |
| `verification` | done when `searchConsoleReady` is ticked or a Google code is saved | Search Console ready (DNS record recommended) |
| `redirects` | todo while any `suggested` rows remain ("57 of 108 decided") | Old-address forwards decided |
| `redirectShadow` | todo, marked "Fix now", while an active rule's source is a live public page | No forward hides a live page |
| `oldUrls` | manual tick | Old addresses outside the sitemaps collected (brochures, QR codes, ads, listings) |
| `titles` | info: count of pages with warnings | Titles and descriptions reviewed |
| `gbp` | info: done items over the total | Google Business Profile checklist |
| `aiCheck` | info, manual tick | Monthly AI-answer check started |

  Only `mode`, `domain` and `requestHost` block the switch (§2.2). Manual ticks go to `PUT /api/admin/seo/settings/checklist`.
- **Also on the page:**
  - links to the six SEO pages
  - a note: "Google's AI Overviews and AI Mode are switched in Search Console (Settings → Search generative AI), not here. Leave it on Include (decision 22)."
  - the **monthly AI-answer check** as a static list. Ask ChatGPT, Gemini / Google AI Mode, Perplexity and Copilot each month:
    1. best NEET coaching in Hamirpur
    2. JEE coaching in Shimla
    3. NEET coaching near Mandi
    4. Aspire IIT & Medical Kullu address
    5. Aspire IIT & Medical contact number
    6. Aspire IIT & Medical fees
    7. scholarship test for NEET coaching in Himachal
    8. is Aspire IIT & Medical good for droppers
    9. हमीरपुर में NEET कोचिंग
    10. Aspire IIT Medical reviews

    Each month, note whether Aspire is named and whether the facts are right. When an answer is wrong, fix the source (website facts, Business Profile, Justdial / Sulekha listings), not the AI.
- **Also replaced:** 1b's line "Full search tools come at go-live (Phase 4)" becomes "Search tools are below. Forwards and crawler choices start at launch; the rest starts when the switch is on."
- **`/admin/status`:** the "Google indexing" row uses `searchModeLabel()`.
- **Tests:** checklist statuses from a seeded database; the `nap` difference; `requestHost` from headers; a 409 on PUT `golive` with prerequisites failing; admins read, non-admins 403; the status row in all states; preview mode (`PORTAL_PREVIEW`) renders without data.

### B. Page titles, descriptions and share previews (SEO-META)

**`withSeo` (SEO-CORE implements it; every wired public page calls it).** Not live, or `!isRefVisible(ref)`: `return base` (an article's not-found metadata never gains an `og:url`). In live mode:
1. **Title:** `override.title` → `article.seoTitle` (articles) → `base.title`. The layout template adds " | Aspire IIT & Medical" (23 characters), except on the home page (absolute).
2. **Description:** `override.description` → `article.seoDescription` → `base.description`.
3. **`openGraph`** is built **in full**, because metadata merges shallowly. This also fixes today's article page, which drops siteName and locale:
   - `type` (`article` for articles, else `website`), `siteName`, `locale`, `alternateLocale`
   - `url` = the absolute canonical, clean (no query)
   - `title` = `shareTitle` → the page title **without the brand suffix**
   - `description` = `shareDescription` → description
   - `images: [shareImageFor(card)]`, where card is `card === "default"` → site card, else `shareCardForPage(ref)`. With `opts.image === "keep"` (predictor), the page's own image is kept.
4. **`twitter`:** `{ card: "summary_large_image", title, description, images }`.
5. **`alternates`:** keeps the canonical. When `!hindiReady(ref)`, `hi-IN` is dropped from `languages`, and the Hindi URL gets `robots: { index: false, follow: true }`.
6. **Copilot opt-out:** when `crawlers.bingNoArchive` is set, any `robots` object `withSeo` sets also carries `noarchive: true` (page-level `robots` replaces the layout's).

**Console `/admin/search/pages`** (admins read, super admins edit):

- **List:**
  - Columns: page, language, title (as Google gets it, with length), description (length), share image (thumbnail), chips, Edit.
  - Rows: every `allPageRefs()` entry × en/hi. Hidden entities are marked "Not on the site (not approved)".
  - Filters: language, "Only with warnings".
  - Chips:
    - **Missing:** empty after fallbacks
    - **Using default:** no override
    - **Too long:** title over 60 characters including the suffix (Devanagari: over 50 grapheme clusters); description over 155 (Devanagari: over 130)
    - **Too short:** description under 50
    - **Used on another page:** the same effective title
    - **Claim words:** guarantee(d), assured, 100%, best, No. 1 / number one / #1, top, topper, rank 1, selection rate, success rate, sure-shot; Hindi गारंटी, पक्का, सर्वश्रेष्ठ, नंबर 1, टॉप
    - **Card uses default title** (English rows): `cardText(shareTitle ?? title)` is null, so the share card shows the default title
    - **Hindi not translated:** S7
  - Warnings never block saving.
- **Editor `/admin/search/pages/[pageKey]?lang=en|hi`:**
  - Fields: title, description, share title, share description, share image (*This page's card* / *Site card*). Defaults are shown as placeholders.
  - Live counters through `LengthHint`, in words ("Too long by 12 characters") and an `aria-live="polite"` region (debounced).
  - **Google preview:** a `<figure>` with the site name, a URL breadcrumb, the title cut at 600 px and the description cut at 920 px, measured with canvas `measureText` in 20 px / 14 px Arial. The figcaption reads "Google may rewrite titles and descriptions."
  - **WhatsApp preview:** the card image (`/og/...`; admins can load it in any mode), the share title cut at 2 lines and the share description cut at about 80 characters, plus the domain. Note: "WhatsApp shows about 80 characters."
  - Buttons: *Save*, *Reset to default*. No history (the audit log records who changed which page and when).
  - While not live the ModeBanner says "Saved, applied when the switch is on."
- **API:** `GET|PUT|DELETE /api/admin/seo/pages/[pageKey]?locale=` (DELETE = reset). Body `{ title?, description?, shareTitle?, shareDescription?, card, expectedVersion }`; text is trimmed, whitespace collapsed, control characters and `<>` refused. `pageKey` must be a static key or an existing slug (any status); 409 when the version is stale.
- **Server side:** `src/lib/seo/page-meta/service.ts` and `repo/page-meta.ts`; each write is audited (`seo.page_meta_save` / `_reset`) and calls `revalidateTag(seoTag(\`meta:${pageKey}\`), { expire: 0 })`.
- **Wiring every public page (SEO-META):** each `generateMetadata` returns `withSeo(base, ref, { locale, path })`. JSON-LD components are placed in the page body **outside any `PageLayoutFrame` slot** (home, about, admissions, programs, results, hostels, centres, contact, resources use the frame), so layout reorders never drop or duplicate them. `BreadcrumbJsonLd` is placed only on pages that render a visible hero breadcrumb, and gets **the same `crumbs`, `homeLabel` and `homeHref` the page passes to its hero** (hoisted into one constant).

| Page | ref | JSON-LD placed |
|---|---|---|
| `(site)/page.tsx` | static `home` | `OrganizationJsonLd`, `WebSiteJsonLd` |
| `about`, `results`, `hostels`, `contact`, `privacy`, `terms`, `rancho`, `tools`, `tools/ask`, `tools/mock-tests`, `…/leaderboard`, `tools/planner` | static | `BreadcrumbJsonLd` where a hero breadcrumb is rendered |
| `tools/predictor` | static, `image: "keep"` | `BreadcrumbJsonLd` if crumbs are rendered (existing WebApplication block untouched) |
| `admissions` | static | `BreadcrumbJsonLd`, `FaqJsonLd` with **the same FAQ array the page renders** |
| `programs/page.tsx` | static | `BreadcrumbJsonLd`, `CourseListJsonLd` with the rendered programs |
| `programs/[slug]` | program | `BreadcrumbJsonLd`, `CourseJsonLd`, `<ShareLinks textKey="program">` at the end of main content |
| `resources/page.tsx` | static | `BreadcrumbJsonLd` |
| `resources/[slug]` | article (`withSeo` replaces its partial openGraph) | `BreadcrumbJsonLd`, `ArticleJsonLd`, `<ShareLinks textKey="article">` |
| `tools/mock-tests/exam/[slot]` | static `mock-tests` | `BreadcrumbJsonLd` if crumbs are rendered |
| `scholarship-test` (only if R3 shipped) | test | `BreadcrumbJsonLd`; `TestEventsJsonLd` **inside the page's existing Suspense** after `connection()` |

  Not touched: login, forgot-password, the mock-test attempt / result / report / certificate / verify pages (all noindex), `/links` (noindex), and `centres/**` (SEO-CENTRES).
- **Tests:**
  - per page, in mocked live mode: `og:url` absolute and query-free, `og:title` without the brand, `twitter:card`, image 1200 × 630, siteName and locale present
  - in hidden and basic modes, every wired page's metadata is strictly equal to its pre-change output
  - an invisible article keeps `{ title: notFoundTitle }` only
  - an untranslated Hindi program gets `noindex, follow` and no `hi-IN`; with `bingNoArchive`, `noarchive` too
  - breadcrumb JSON-LD equals the rendered hero breadcrumb (names and hrefs)
  - JSON-LD sits outside `PageLayoutFrame` (render with a reordered layout; exactly one script)
  - each warning rule, including Devanagari grapheme counting, Hindi claim words and the card-text warning
  - service versioning and reset; API 403 / 409 / 422

### C. Share images (SEO-SHARE)

- **Route `src/app/og/[kind]/[file]/route.tsx`:** `GET /og/<kind>/<key>.<locale>.<v>.png`.
  - The path is file-like, so the proxy passes it through without locale rewriting.
  - It is **outside `/api/`**, so X and LinkedIn, which honour robots.txt, can fetch it.
- **Input validation:**
  - `kind` must be in the `ShareCardKind` enum; `file` must match `^([a-z0-9-]{1,80})\.(en|hi)\.([0-9a-f]{8})\.png$`.
  - The card text comes **only** from content or database lookups by that key (`getProgram`, `getCentre` plus verified facts, `getArticle`, the page registry plus override, Phase 2's open event by code, 3b's stub). Query strings are never read, and no request value reaches SVG text, attributes or styles.
  - An unknown key, or an entity that is not visible, returns 404.
- **Who can load it:** not live: only a signed-in admin (`requireAdmin`; otherwise 404), with `Cache-Control: private, no-store`. Live: public. Always `X-Robots-Tag: noindex`.
- **Rendering:**
  - `ImageResponse` at 1200 × 630 with the predictor card's palette (navy `#0B2D5B` / `#123A73`, gold `#F4C44E`) and **only the font bundled with `next/og` (Geist Regular)**. Flat design: no photos, no remote fetches.
  - **No remote fetch, ever.** `@vercel/og` fetches Google Fonts or twemoji for any glyph missing from the given fonts. Every text field passes through `cardText()`; a field that returns null is dropped, and if the title is unusable the card falls back to the site card's text. Hindi locale cards always use the English text of the same entity.
  - **No unverified claims:** text is limited to the brand name, the page or entity title, one subtitle (program: class level · duration; centre: "{town} centre"; article: category; test: "Registration open till {date}"), and the domain.
  - Font size steps 64 / 56 / 48 by length; text is cut at a word boundary with "...".
  - **Version `v`:** the first 8 hex characters of the SHA-256 of `{ templateVersion, kind, key, text fields }`. Matching `v`: `Cache-Control: public, max-age=604800, immutable`. Mismatch: the current card with `max-age=300`, so stale Facebook URLs still work.
- **Cost on one CPU:** an in-memory LRU on `globalThis[Symbol.for("aspire.ogCache")]` (at most 32 entries / 4 MB of PNG bytes, read with `await res.arrayBuffer()`); cache misses limited to 20 per minute per IP (`getClientIp`; the IP is used only as the in-memory limiter key, never stored or logged), 429 with `Retry-After`; every template at or under 300 KB with the longest allowed text.
- **`shareImageFor(ref, locale)`** replaces the stub: `{ url: "/og/<kind>/<key>.en.<v>.png", width, height, alt }` with alt "{title}: Aspire IIT & Medical" (always the English card), or null when the entity is not visible. Announcement cards return null until 3b (`getAnnouncementForShare` stub in `share/sources.ts`).
- **Tests:** kind and file regex rejections; not live and signed out gives 404; a hidden entity gives 404; version-match headers; LRU eviction by bytes; limiter; 300 KB per template; no `searchParams` read (static check); **`globalThis.fetch` is never called while rendering any template, including text with Devanagari, emoji and typographic punctuation** (spy); Hindi pages get the English card URL.

### D. Business facts and structured data (SEO-FACTS)

**Console `/admin/search/facts`** (admins read; super admins edit and verify):

- **Institute section and one tab per centre.** The tabs list content centres of any status. Centres outside the content list get no row; the conflict about the centre network is item C30.
- **Each field row shows:**
  - the value (English, plus Hindi where it is shown on Hindi pages: name, description, displayName, hoursNote)
  - a **Verified** chip with the date and who verified it, **Not verified: do not publish**, or **Not set**
  - "Where this came from" (`source_note`)
  - *Edit* and *Mark verified*. Verifying needs the checkbox "I checked this against signage, an official document or the Google Business Profile."
- **Saving any change resets the field to not verified.** *Unverify* is also available.
- **Validation (zod plus helpers):**
  - phone `^\+91\d{10}$`; PIN `^\d{6}$`
  - lat/lng at least 5 decimals; outside Himachal (lat 30.3–33.3, lng 75.5–79.1) gives a warning
  - maps and GBP links: `https:` only, hosts `maps.app.goo.gl`, `www.google.com`/`google.com` with a `/maps` path, `g.page`, `goo.gl` with a `/maps` path
  - social links: the host must match the network (facebook.com, instagram.com, youtube.com, linkedin.com, x.com/twitter.com, t.me)
  - email domain other than `aspireiit.in`: warning (conflict C6)
  - hours: up to 7 rows, `HH:MM` 24-hour, opens before closes; label "Enquiry desk hours: must match the Google Business Profile"
  - programs: a subset of `ExamTrack`
  - logo: a site path `^/assets/[a-z0-9/_-]+\.png$` that exists at verify time (no raster logo exists today, so Organization `logo` is omitted)
  - `org.name` warnings: `|`, a run of 6 or more digits, or the words coaching, classes, best, near, NEET, JEE (Business Profile rule: no keywords in the name)
  - `displayName`: one town name, no keywords
  - `regionServed`: the note "Conflict C41: confirm before verifying"
- **Suggestions panel** per field, each with *Use this* (copies into a draft, never verifies):
  1. "From the website's demo data (unverified)", from `src/content`
  2. "From Google Maps links (Phase 1b)", from `getCentreLinks()`
  3. "From the counsellors' fact sheet, verified {date}", from Phase 2 verified `crm_fact_entries` slots `centre_address`, `centre_map_link`, `desk_phone`, `desk_hours`, read only when the table exists
- **Consistency panel:** differences between the verified search facts and (a) the fact sheet, (b) the 1b map links, (c) **what the site shows today**: `getContactDetails()` (footer and Contact page) and the published content centre fields. Example: "The footer phone +91… differs from this verified phone. Name, address and phone must match everywhere." Feeds checklist item `nap`.
- **Structured-data preview** per institute or centre: a `CodeBlock` of exactly what would be published, built from **production-visible data** (published content only, even in demo), with "Will be published when the switch is on" or "Not published: needs a verified address (street, town, state and PIN)".
- **Scholarship test markup** (only when the Phase 2 tables exist): every open or upcoming event × active slot shows the venue as typed, with the toggle "This slot is held at the {town} centre's verified address". It writes `seo_event_places` through `PUT /api/admin/seo/events/places/[slotId] { centreSlug | null }`, audited `seo.event_place_confirm` / `_clear`. Only centres with a verified address can be chosen.

**API:** `GET /api/admin/seo/facts`; `PUT /api/admin/seo/facts/[scope]/[field]` with `{ valueEn, valueHi?, sourceNote?, expectedVersion }`; `POST …/verify` with `{ expectedVersion, confirm: true }`; `POST …/unverify`. Scope is `org` or `centre:<slug>` for an existing content slug. Each write revalidates `seoTag("facts")`. Audit: `seo.fact_save`, `seo.fact_verify`, `seo.fact_unverify` (details: scope, field).

**JSON-LD builders (`src/lib/seo/jsonld/**`, pure) and components.**
- **Gates:** each component checks `isSearchLive()`. Each builder returns null when a required fact is missing.
- **Ids** always use the **English** path; `url` follows the page locale:
  - Organization `{site}/#organization`; WebSite `{site}/#website`
  - centre `{site}/centres/{slug}#centre`; course `{site}/programs/{slug}#course`
- **Cross-page references are inlined:** `organizer`, `publisher`, `provider` and `parentOrganization` are `{ "@type": "EducationalOrganization", "@id": "{site}/#organization", "name", "url" }`, because Google does not resolve `@id` across pages.

| Type | Where | Requires | Properties (each only if verified, published or set) | Never |
|---|---|---|---|---|
| `EducationalOrganization` | home | `org.name` verified | `name`, `alternateName`, `legalName`, `url`, `logo`, `description` (page locale), `foundingDate`, `telephone`, `email`, `sameAs` (verified social links), `contactPoint` `{ telephone, contactType: "admissions", availableLanguage: ["en","hi"] }` if telephone, `areaServed` if `regionServed` | `aggregateRating`, `review`, awards, results claims |
| `WebSite` | home | `org.name` | `name`, `alternateName`, `url`, `inLanguage: ["en-IN","hi-IN"]` | `potentialAction` |
| `["EducationalOrganization","LocalBusiness"]` | each centre page | `org.name` plus the full verified address | `name` (the brand, the same for every location), `address` (PostalAddress, `addressCountry: "IN"`), `geo`, `telephone`, `email`, `url` (the centre page), `openingHoursSpecification` (from `hours`), `hasMap` (verified `mapsUrl`), `sameAs` (`gbpUrl`), `parentOrganization` (inlined) | `image`, `priceRange`, `areaServed`, ratings, reviews |
| `Course` | `programs/[slug]` | published program plus `org.name` | `name`, `description` (shortDescription), `provider` (inlined), `url`, `educationalLevel` (classLevel), `inLanguage` | fees, dates, outcomes |
| `ItemList` of `Course` | `/programs` | 3 or more published programs plus `org.name` | `itemListElement[{ position, url }]` with unique URLs | — |
| `Article` | `resources/[slug]` | published article | `headline`, `description` (summary), `datePublished`, `author` (only if set, as `Person` name), `publisher` (inlined) if `org.name`, `mainEntityOfPage`, `inLanguage` | `image` unless it is the article's own cover |
| `BreadcrumbList` | pages with a visible hero breadcrumb | the hero's crumbs | `itemListElement` from `crumbTrail(...)`, identical to the visible crumbs | — |
| `FAQPage` | `/admissions` | at least one published FAQ, **the array the page renders** | `mainEntity[{ Question, acceptedAnswer }]` | any promise of a special result |
| `Event` (one per confirmed slot) | `/scholarship-test` | an event with `status = 'open'` and an open registration window; a slot with `active = 1` and a `seo_event_places` row; that centre's verified address; `org.name` | `name` (event `name_en`/`name_hi` only), `startDate` / `endDate` (ISO with `+05:30`, from `starts_at` and `duration_minutes`), `eventStatus: EventScheduled`, `eventAttendanceMode: OfflineEventAttendanceMode`, `location` (`Place` `{ name: org.name, address: the verified PostalAddress }`), `organizer` (inlined), `offers` `{ url: /scholarship-test, validFrom: registration_opens_at }`, `description` (intro, cut at 300) | the typed venue text, price, online-only tests, slabs, results |

- **`CentreJsonLd({ nap, slug, locale })`** takes the **resolved NAP object the page renders** (§5.E), so markup and page cannot differ; the builder still refuses any field whose source is not `verified`.
- **Test-event adapter:** `src/lib/seo/sources/test-events.ts` provides `openTestSlotsForMarkup(now)` and `nextTestAtCentre(slug, now)` (CENTRES uses the latter). It checks `sqlite_master` for `crm_test_events` and `crm_test_slots` first and returns `[]` / null when absent; it reads only the columns of Phase 2's B3 schema; it is called only under Suspense after `connection()`.
- **Tests:**
  - per builder: complete; missing a required fact gives null; an unverified fact is never present
  - **no `aggregateRating` or `review` key anywhere** (recursive over every builder's output)
  - every `@id` has no `/hi/` segment; cross-page references carry `@type`, `name` and `url`
  - escaping in `JsonLdScript` (`</script>` in text)
  - FAQ uses only the passed array; ItemList is null with 2 programs
  - Event: no confirmation, no verified address, a closed window, or missing Phase 2 tables each give null; the date carries `+05:30`; `location.name` is the brand and never the typed venue
  - facts API: verify needs `confirm`, saving resets to draft, version 409
  - validators, suggestions, consistency differences (including `getContactDetails()`)
  - preview built from published-only data even in demo

### E. Centre pages and Google Business Profile checklist (SEO-CENTRES)

**NAP resolver `src/lib/seo/centres/nap.ts`:** `centreNap(centre, facts, locale)` → `{ town, address?, phone?, email?, hours?, hoursNote?, mapsUrl?, programs?, source: Record<field, "verified" | "published" | "demo">, checkedAt? }`.
- Order: **verified search facts**, then published content fields, then (demo only) placeholder fields labelled DEMO.
- `mapsUrl` only from a verified fact, through `safeDirectionsUrl`.
- `town` = verified `displayName` → else the first word of the content `name` (the rule `finderCentres` uses for `shortName`).
- `services` label from the verified `programs` fact, else published content `programs`: JEE and NEET → "JEE & NEET"; one of them → that one; neither → none.

**Route `src/app/[lang]/(site)/centres/[slug]/page.tsx`:**
- `generateStaticParams` from `getCentreSlugs()` (SEO-CORE adds it to `data.ts`: all slugs of any status, else `STATIC_PARAM_FALLBACK`). The page calls `getCentre(slug, locale)` and runs `notFound()` when the centre is not visible (published, or placeholder in demo; S3).
- Sections, in order (one h1, then h2):
  1. **Hero:** `HeroPanel` + `CentreFinder` with `defaultDistrict = centre.district` and `actions: ["call", "directions"]` (hero README "E"). The finder gets the centre list with **this centre's `phone`, `address` and `directionsUrl` replaced by the resolved NAP** (other centres unchanged), so the hero and the Visit section always agree. Breadcrumb Home › Centres › {town}. h1 `page.heading`. DEMO badge for a placeholder.
  2. **Visit the centre** (from `centreNap`): `<address>`; a `tel:` link (`aria-label` "Call the {town} centre"); an email link; hours as a `<dl>` (days in the page locale via `Intl`) with the hours note; "Open in Google Maps" only from a verified `mapsUrl` (`target=_blank rel="noopener noreferrer"` plus visually hidden "(opens in a new tab)"); "Address and timings checked by Aspire on {date}" for verified facts, "Demo details: not yet confirmed by Aspire" for placeholders.
  3. **Courses at this centre:** the resolved programs, linking to `/programs?track=`. Empty: "Ask the centre which courses run here this session."
  4. **Getting here / Hostel / At the centre:** content `travelTimes`, `transportNote`, `hostelNote`, `facilities` (published or demo only). `head` is never rendered.
  5. **Next scholarship test here** (Suspense plus `connection()`; fixed-height fallback): `nextTestAtCentre(slug, now)` gives the event name, date and time (IST), and "Register for the test" to `/scholarship-test`. Absent when there is none.
  6. **Results from this centre** (Suspense plus `connection()`):
     - Production: `getResults({ centreSlug: slug })` filtered by `canShowStudentName` **and** `resultDisclosure(record)` not null (`src/lib/seo/centres/results.ts`, a stub returning null until Phase 3a records course, duration and paid/free with consent obtained after selection, CCPA 2024). Each item shows name, exam, rank or outcome, course and duration, paid or free, and "Shown with each student's written permission, given after their result." No records: no section.
     - Demo: **no names**; only "Demo: real results appear here only with each student's written permission."
  7. **Ask the {town} centre:** `EnquiryForm variant="admissions"` with `centreOptions` (as on `/admissions`) and **`defaultCentre={slug}`**.
  8. **Share:** `<ShareLinks textKey="centre" … />` (live only).
  9. **Other centres:** links to the other visible centre pages.
  10. Structured data, outside any layout slot: `<CentreJsonLd nap={nap} slug={slug} locale={locale} />` and `<BreadcrumbJsonLd …same hero crumbs… />`.
- **Metadata:** `withSeo({ title, description, alternates }, { kind: "centre", slug }, …)`, with title `page.metaTitle` ("{services} coaching in {town}", e.g. "JEE & NEET coaching in Hamirpur", 54 characters with the suffix) or `page.metaTitleFallback` ("Coaching centre in {town}") when there is no services label.
- **Unique content per page:** each page carries that centre's own address, hours, map, courses, travel and test date. No templated filler, and a page exists only for a real centre record (doorway-page rule).

**`EnquiryForm` / `HeroEnquiryForm` (additive):**
- New optional prop `defaultCentre?: string`. When it matches an option, it sets the select's `defaultValue` and the initial `centreChoice`; otherwise the existing "not-sure".
- After a successful submit, `centreChoice` resets to `defaultCentre ?? "not-sure"` (matching what `form.reset()` restores), so the district field stays in sync.
- No other behaviour changes; the enquiry contract and server are untouched.

**`centres/page.tsx`:** the finder `pageHref` becomes `/centres/{slug}`; metadata wrapped in `withSeo` (static `centres`); `<BreadcrumbJsonLd>` added; `CentreDirectory` cards gain "See centre page". `#slug` anchors stay, so existing links from home, contact, hostels and results keep working.

**Console `/admin/search/centres`:** one card per content centre:
- page status ("On the website" / "Not on the website: centre not approved yet" / "Demo") with the URL
- facts completeness (address, phone, hours, map, Business Profile link: verified or not, linking to the facts tab)
- structured data ("Will be published" / "Missing: …")
- the **tagged Business Profile link** `{site}/centres/{slug}?utm_source=google&utm_medium=gbp&utm_campaign=gbp-{slug}` with *Copy* and the warning "Add this to the Business Profile only after aspireiit.in points at the new site (decision 17)"
- the **checklist** (ticks in setting `gbp` through the CORE settings API; audit `seo.gbp_check`):
  1. Profile verified by Google
  2. Name is exactly "{org name}" with no keywords, the same for every centre
  3. Address matches this website
  4. Phone is a local number Aspire controls and matches
  5. One main category, the most specific (check the exact name in the profile, for example "Coaching center")
  6. Website link is the tagged centre page link
  7. Hours are the enquiry-desk hours and match the website (or leave hours empty)
  8. At least 10 real photos of the centre (no stock photos)
  9. Reply to every review; never offer anything for a review
  10. Post test dates and new batches as profile posts
  11. Justdial, Sulekha and other listings use the same name, address and phone

**Copy, `src/i18n/messages/{en,hi}/centres.ts`, `page.*`** (Hindi lines are machine drafts for the register):

| Key | English | Hindi (draft) |
|---|---|---|
| `page.metaTitle` | {services} coaching in {town} | {town} में {services} कोचिंग |
| `page.metaTitleFallback` | Coaching centre in {town} | {town} में कोचिंग सेंटर |
| `page.metaDescription` | Aspire IIT & Medical's {town} centre: address, phone, enquiry-desk hours and directions. Ask about courses and visits. | {town} में Aspire IIT & Medical का सेंटर: पता, फ़ोन, पूछताछ डेस्क का समय और रास्ता। कोर्स और विज़िट के बारे में पूछें। |
| `page.heading` | {town} centre | {town} सेंटर |
| `page.visitTitle` | Visit the centre | सेंटर आएँ |
| `page.addressLabel` / `phoneLabel` / `emailLabel` | Address / Phone / Email | पता / फ़ोन / ईमेल |
| `page.callAria` | Call the {town} centre | {town} सेंटर को कॉल करें |
| `page.hoursLabel` | Enquiry desk hours | पूछताछ डेस्क का समय |
| `page.mapLink` | Open in Google Maps | Google Maps में खोलें |
| `page.newTab` | (opens in a new tab) | (नए टैब में खुलेगा) |
| `page.checkedOn` | Address and timings checked by Aspire on {date}. | पता और समय Aspire ने {date} को जाँचा। |
| `page.demoNote` | Demo details: not yet confirmed by Aspire. | डेमो जानकारी: Aspire ने अभी पुष्टि नहीं की है। |
| `page.programsTitle` | Courses at this centre | इस सेंटर पर कोर्स |
| `page.programsUnknown` | Ask the centre which courses run here this session. | इस सत्र में यहाँ कौन-से कोर्स चलते हैं, सेंटर से पूछें। |
| `page.travelTitle` / `hostelTitle` / `facilitiesTitle` | Getting here / Hostel / At the centre | यहाँ कैसे पहुँचें / हॉस्टल / सेंटर पर सुविधाएँ |
| `page.testTitle` / `page.testCta` | Next scholarship test here / Register for the test | यहाँ अगली स्कॉलरशिप परीक्षा / परीक्षा के लिए रजिस्टर करें |
| `page.resultsTitle` | Results from this centre | इस सेंटर के परिणाम |
| `page.resultsConsent` | Shown with each student's written permission, given after their result. | हर छात्र की लिखित अनुमति से दिखाया गया, जो परिणाम के बाद ली गई। |
| `page.resultsDemo` | Demo: real results appear here only with each student's written permission. | डेमो: असली परिणाम यहाँ केवल हर छात्र की लिखित अनुमति से दिखेंगे। |
| `page.resultCourse` | Course: {course} · {duration} · {paid} | कोर्स: {course} · {duration} · {paid} |
| `page.paidCourse` / `page.freeCourse` | Paid course / Free course | शुल्क वाला कोर्स / निःशुल्क कोर्स |
| `page.enquiryTitle` / `page.enquiryLead` | Ask the {town} centre / We'll pass your enquiry to the {town} centre. | {town} सेंटर से पूछें / आपकी पूछताछ हम {town} सेंटर तक पहुँचाएँगे। |
| `page.otherCentres` | Other centres | अन्य सेंटर |
| `page.seeCentrePage` | See centre page | सेंटर का पेज देखें |

**Tests:**
- static params include every slug plus the fallback; a hidden centre gives 404; both locales render
- the resolver prefers verified facts, labels demo, and derives `town` and `services` as specified
- the map link appears only when verified; no `head` in the markup
- the hero finder card and the Visit section show the same phone and address
- `CentreJsonLd` gets the same NAP object the page renders
- the results section is absent in production without a disclosure, and shows no names in demo
- the test section with and without Phase 2 tables
- `EnquiryForm` (admissions variant): `defaultCentre` preselects; an unknown slug stays "not-sure"; after a successful submit the centre and district fields return to the preset (in the existing forms suite)
- headings order and `<address>` present; new-tab label present
- the directory links to the centre page and the anchors still exist
- the GBP link format; the checklist write is super admin only

### F. Crawlers, robots, verification, visit counts and llms.txt (SEO-CORE for robots, layout and registry; SEO-CRAWLERS for the rest)

**Crawler registry (`CRAWLERS`, SEO-CORE).** `id`, `ua` (case-insensitive token match; null for control-only tokens), `group`, `robotsToken`, `vendor`, `honoursRobots`. Values from the 22 Oct research; changing them needs a code release.

| id / token | Group | Honours robots.txt |
|---|---|---|
| Googlebot | search | yes |
| bingbot | search | yes |
| Applebot | search | yes |
| OAI-SearchBot | answer | yes (about 24 h) |
| Claude-SearchBot | answer | yes |
| PerplexityBot | answer | yes |
| Meta-WebIndexer | answer | not stated |
| ChatGPT-User | user | "may not apply" |
| Claude-User | user | yes |
| Perplexity-User | user | "generally ignores" |
| Meta-ExternalFetcher | user | may bypass |
| GPTBot | training | yes |
| ClaudeBot | training | yes |
| CCBot | training | yes |
| Meta-ExternalAgent | training | not stated |
| Google-Extended | training | control token only (no visits) |
| Applebot-Extended | training | control token only |
| facebookexternalhit, WhatsApp, Twitterbot, LinkedInBot | preview | (always allowed) |

**`robotsFor(mode, policy, siteUrl)`** (SEO-CORE, pure). `src/app/robots.ts` becomes `async`: hidden → no settings read; otherwise it reads `getRenderSettings()` inside try/catch and falls back to `robotsFor("basic", null, …)` (R1 plus `/go/`); it never throws.

- **hidden:** `{ rules: { userAgent: "*", disallow: "/" } }`, the exact object asserted today.
- **basic:**

  ```ts
  { rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/", "/go/", ...privatePathsBothLocales] },
      // only when non-empty: every blocked crawler's robotsToken, one group, full block
      { userAgent: blockedTokens, disallow: "/" },
    ],
    sitemap: `${siteUrl}/sitemap.xml` }
  ```

  With a null policy (disabled or unreadable) the second group is absent. With decision 22's default policy the output is the `*` group only.
- **live:** basic with `allow: ["/", "/api/predictor/card"]` in `*`.
- A named group **always** blocks everything. Allowed bots are never named: a crawler obeys only its most specific group, so naming an allowed bot would drop the private-path rules.
- `search` and `preview` crawlers can never be blocked (zod). A per-bot override beats its group.
- The Copilot opt-out (`bingNoArchive`) is page metadata (layout in basic and live; `withSeo` in live), not robots.txt.
- **Tests:** exact objects for hidden, basic (default, training blocked, null policy) and live; no named group without `Disallow: /`; private paths and `/go/` present in `*` for both locales; a blocked training group lists GPTBot, ClaudeBot, CCBot, Meta-ExternalAgent, Google-Extended and Applebot-Extended; Googlebot can never be blocked; update `src/app/robots-sitemap.test.ts` and `src/i18n/i18n.test.ts` (robots blocks, about lines 177–218) to `await robots()` with the production env stubbed.

**Root layout (SEO-CORE, `src/app/[lang]/layout.tsx`):** `robots: { index: false, follow: false }` when `searchPrerequisites().open` is false (demo **or** non-final origin), exactly as today when in demo. When open: `verification: { google, other: { "msvalidate.01": bing } }` for saved codes, and `robots: { noarchive: true }` when `bingNoArchive` is set. Reading the render settings here makes every page's cache life follow `BUILD_LIFE` after a production build (§8).

**Sitemap (SEO-CORE)** uses `routes.ts` and adds `/centres/{slug}` for visible centres (`lastModified` = the newest `verifiedAt` when set). In live mode, for programs, articles and centres where `!hindiReady`, it lists the English URL only, without the `hi-IN` link. It never contains private, `/en`, `/api`, `/og` or `/go` URLs (the existing assertion is extended).

**Console `/admin/search/crawlers`** (SEO-CRAWLERS):
1. **Who may read the site:**
   - three radio groups (Answer crawlers / User-triggered fetchers / Training crawlers: Allow or Block), each with its member list and notes: "User-triggered fetchers may ignore robots.txt." "Blocking training stops future use only." "Google-Extended covers Gemini training and grounding; it does not change Google Search or AI Overviews."
   - a per-bot override table; search engines and link previews shown as "Always allowed"
   - "Keep Aspire's text out of Microsoft Copilot answers (adds `noarchive`)"
   - note "Your choices apply from launch day, with or without the switch."
   - *Save* (PUT `crawlers`, sets `reviewedAt`; audit `seo.crawler_policy_save`)
2. **robots.txt:** two `CodeBlock`s, "Served now ({mode})" and "Served after launch", rendered by `robotsFor`, plus "Crawlers cache robots.txt for up to a day."
3. **Verification:**
   - Google code (`^[A-Za-z0-9_-]{20,100}$`) and Bing code (`^[A-Za-z0-9]{16,64}$`) through PUT `verification` (audit `seo.verification_save`; the values are never audited)
   - advice: "Recommended: verify the whole domain in Search Console with a DNS TXT record (no code needed here), then import the site into Bing Webmaster Tools from Search Console."
   - **old-site note:** "The old aspireiit.in home page carries a Google verification tag. If Aspire controls the Google account that owns that Search Console property, paste the same code here before launch so verification is not lost. If not, verify with your own DNS record and remove the old owner in Search Console." No code is pre-filled.
4. **Sitemap:** counts by section (pages, programs, articles, centres, tools; Hindi left out), and a link to `/sitemap.xml`.
5. **Crawler visits (last 30 IST days):** a table per bot: group, fetches, robots.txt fetches, top page type, last seen day, and "Not checked: the name could be faked"; a "Link previews" row (WhatsApp, Facebook, X, LinkedIn) labelled "Each preview fetch is usually one share"; footnote "Counts are fetches, not people. The app reads and stores no IP address. AI answers that mention Aspire cannot be counted; see the monthly check on the Overview." Not live: "Counting starts when the switch is on." No chart in R4.

**Counting (SEO-CRAWLERS replaces the `classify.ts` stub; SEO-ROUTING calls it from the proxy):**
- `classifyCrawler({ userAgent, pathname, redirected })` tests the user agent against one precompiled case-insensitive regex built from `CRAWLERS` (most specific tokens first; `Google-Extended` and `Applebot-Extended` never match a visit).
- On a match it derives `pathGroup`: `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/og/` or `/api/predictor/card` (share_image), private paths in both locales, `/api/`, redirected, file-like (other), else page.
- **It takes no IP and returns no IP.** The user agent is matched and dropped; neither is stored or logged.
- **Tests:** UA matrix (including the WhatsApp UA and `Google-Extended` never matching), path groups, the signature has no IP (type test), no user agent in any stored row or log call (spy).

**`/llms.txt` (`src/app/llms.txt/route.ts`, SEO-CRAWLERS):**
- `GET` returns 404 unless live. Live: `await connection()`, built by `src/lib/seo/llms.ts`, `Content-Type: text/plain; charset=utf-8`, `Cache-Control: public, max-age=3600`.
- **Content** only from verified facts and published content, with absolute URLs and markdown links:
  - `# {org.name}` (no file at all without a verified name)
  - `> {org.description.en}` (if verified)
  - `## Programs`: `[title](url): shortDescription`
  - `## Centres`: `[{town} centre](url): verified address; phone`
  - `## Admissions`: admissions page, plus the scholarship test if one is open
  - `## Free tools`: available tool routes from `routes.ts`, with their page descriptions
  - `## Optional`: Hindi site, articles, privacy, terms
  - No region-served line unless verified (C41). No numbers, results or claims.
- **Tests:** 404 when not live; no unverified value; markdown link syntax; H1 first; added to the prerender bail-out test (Integrate).

### G. Redirects (SEO-ROUTING)

**Proxy integration (`src/proxy.ts`).** The signature becomes `proxy(request: NextRequest, event?: NextFetchEvent)`; existing tests keep calling `proxy(request)`. The preview gate stays first, unchanged; the rest of the existing body moves unchanged into an inner `route(request)`, and the exported `proxy` wraps it:

```ts
export function proxy(request: NextRequest, event?: NextFetchEvent) {
  const gate = /* existing preview gate, unchanged */;  if (gate) return gate;
  markProxySeen(Date.now());                              // one property write, every mode
  const guard = hostGuard(request);                       // src/lib/seo/proxy/host-guard.ts (sync, env + headers)
  if (guard.robotsResponse) return guard.robotsResponse;  // /robots.txt on a non-production host when open
  const seo = seoProxyStep(request, event);               // src/lib/seo/proxy/step.ts: a 301, or null
  const response = seo ?? route(request);
  if (guard.noindex) response.headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
  return response;
}
```

- **Host guard:** active only when `searchPrerequisites().open`. When the request host is not a production host, `noindex` is true, and `/robots.txt` is answered with `ROBOTS_TXT_DISALLOW_ALL` (`text/plain`, `Cache-Control: public, max-age=300`). It never reads the database.
- **SEO step, cheap exit:** when `!open` or `packDisabled`, it returns null immediately with no database access, which keeps `proxy.test.ts` and demo mode unchanged.
- **Otherwise**, `ensureFresh(now)` reloads the registry when it is older than 60 s or invalidated: the `golive` flag, active exact rules into a `Map`, and up to 100 active prefix rules sorted by length, descending; every row passes `isSafeInternalPath` again.
- **Database access in the proxy (`src/lib/seo/proxy/db.ts`):** a lazily opened `node:sqlite` `DatabaseSync` on the same file as `resolveDbPath()` (its logic repeated, with an equality test), **without** `server-only`, without running schemas, with `PRAGMA busy_timeout = 50`. A missing table or any error → fail open. Tests inject a handle (`setProxyDbForTests`).
- **On a load error** it keeps the last state (or empty) and retries after 60 s. It fails open: no redirect and no counting, never an error page.
- **For GET/HEAD on an eligible path** (not reserved by `isReservedPath`, not private in either locale, not `/api`, `/_next`, `/og`, `/go`, robots, sitemap, llms or `.well-known`): `matchRedirect(table, pathname, search)`. On a hit it clones `request.nextUrl`, sets `pathname` and `search`, and returns `NextResponse.redirect(url, 301)` with `Cache-Control: public, max-age=3600`. The Location is therefore absolute on the request's own origin. It adds a redirect hit (`id|day`). Prefetch requests (`Purpose`/`Sec-Purpose: prefetch`) redirect without counting. This works in basic and live.
- **If live only:** `classifyCrawler(...)` adds to the pending crawler map (keys `day|bot|group`, at most 2,000 keys; beyond that, drop and log the fixed code `seo.counter_overflow` once per minute). A redirected crawler hit is counted with `pathGroup: "redirect"`.
- **Flush**, when 60 s or more have passed and an `event` exists: `event.waitUntil(flush())` writes both pending maps in **one** `BEGIN IMMEDIATE` transaction (`INSERT … ON CONFLICT DO UPDATE SET hits = hits + ?`); on `SQLITE_BUSY` it keeps the maps (cap still applies) and retries next minute; it prunes rows older than 400 days once a day. The console calls `flushSeoCounters()` before reading counts (same context only; otherwise counts lag by up to 60 s).
- **Shared state:** the registry lives on `globalThis[Symbol.for("aspire.seoProxy")]`. If the proxy runs in a separate context, it still loads and flushes on its own (60 s bound). Admin writes call `invalidateSeoProxyState()` for an immediate effect in the same context. The Overview shows whether the proxy has been seen in the app's context (`proxySeenAt()`).
- **Old WordPress URLs end in `/`.** Next's automatic trailing-slash redirect (308) runs **before** the proxy (`skipTrailingSlashRedirect.md`), so an old address takes two hops (308, then 301). Google follows both; the runbook tests it. Sources are stored without the trailing slash.
- **Build gate and Plan B.** SEO-ROUTING ends with one off-PC CI build (admin plan §5.2). If that CI does not exist yet, the orchestrator runs one `docker build` on the server with no container swap. **Plan B** if the proxy bundle cannot load `node:sqlite`: redirects move to a catch-all `src/app/[lang]/(site)/[...missing]/page.tsx` that calls `permanentRedirect()` (308) on a match and `notFound()` otherwise, under Suspense after `connection()`, and crawler counting is dropped from R4. ROUTING reports which plan shipped.

**Matching rules (`normalize.ts` / `match.ts`, SEO-CORE):**
- **Source normalisation:** percent-decode once, lowercase, collapse `//`, strip a trailing `/` (except root), strip the query and hash, reject `..`, at most 300 characters.
- **Exact rules:** a `Map` lookup. **Prefix rules:** the source ends with `/*`; the rest of the path is appended to the target if the target ends with `/*` (`/courses/*` → `/programs/*`), else everything goes to the fixed target. Exact beats prefix; the longest prefix wins.
- **The incoming query string is kept**; the target's own query wins on key clashes.

**Validation on save and import (`validate.ts`):**
- source and target pass `isSafeInternalPath` (§4.2)
- the target is not private, not under `/api`, `/og` or `/go`
- **no chains:** the target is not itself an active source and not a `next.config` redirect source (`/faculty`, `/hi/faculty`); the error suggests the final target; import offers flattening
- no loops
- the source is not `/`, a locale root, a private path, or reserved (`isReservedPath`)
- **the source must not be a live public page** (`isLivePublicPath`); a prefix rule that covers any live page is an **error**
- at most 1,000 rules (warning at 800)
- a target that does not resolve to a known route pattern gives a warning ("This page may not exist")
- `redirectShadows(path)` (exported) lists active rules that would hide `path`; the console list shows a "Hides a live page" chip from it at read time, and checklist item `redirectShadow` uses it.

**Console `/admin/search/redirects`:**
- a list with source, target, kind, status, group, hits in 30 days, last hit, note, and chips
- a banner: "{n} suggested forwards from the old website: accept, change or turn off each group"
- per seed group: *Accept all in this group* (audit `seo.redirect_accept_group`, count only)
- *Add* (source, target, exact or prefix, note) with the hint "Avoid student names in addresses; use a prefix rule"
- *Import*: paste up to 500 `old,new` CSV lines → preview with errors, chains flattened and duplicates shown → *Confirm*
- **Test a URL:** "Would forward to … (301)" / "No forward: page exists" / "No forward: would show Not found"; works in any mode
- *Turn off* / *Delete*; deleting a rule hit in the last 365 days asks "Keep forwards for at least a year."
- while hidden: "Saved; forwards work from launch day."

**API:** `GET|POST /api/admin/seo/redirects`; `PATCH|DELETE /api/admin/seo/redirects/[id]` with `expectedVersion`; `POST /api/admin/seo/redirects/import` (64 KB); `POST /api/admin/seo/redirects/test` (30 per minute per user); `POST /api/admin/seo/redirects/seed`; `POST /api/admin/seo/redirects/groups/[group]/accept`. Every write calls `invalidateSeoProxyState()`. Audit: `seo.redirect_create`, `_update`, `_delete`, `_import` (counts), `_seed` (counts), `_accept_group` (counts).

#### G.1 Seed list (old aspireiit.in sitemaps, fetched 22 Oct 2026)

`seeds.ts` holds these 108 rows (107 exact, 1 prefix), status `suggested`, origin `seed`, each with its `seed_group` and note "Old aspireiit.in page". Targets follow the demo `servesDistricts` for towns, which is unverified: the owner confirms. A week before launch, the runbook re-fetches the old sitemaps and adds any new page.

| `seed_group` | Old addresses (stored without the trailing slash) | Suggested target | Note |
|---|---|---|---|
| `old-towns` (25) | `/neet-coaching-in-hamirpur`, `/jee-coaching-in-hamirpur`, `/neet-coaching-centers-in-una`, `/jee-coaching-in-una`, `/neet-coaching-in-bilaspur`, `/jee-coaching-in-bilaspur` | `/centres/hamirpur` | serving centre (Hamirpur, Una, Bilaspur) |
| | `/neet-coaching-in-dharamshala`, `/jee-coaching-in-dharamshala`, `/neet-coaching-in-kangra`, `/jee-coaching-in-kangra` | `/centres/dharamshala` | serving centre (Kangra) |
| | `/neet-coaching-in-kullu`, `/jee-coaching-in-kullu`, `/neet-coaching-in-mandi`, `/jee-coaching-in-mandi` | `/centres/kullu` | serving centre (Kullu, Mandi) |
| | `/neet-coaching-in-shimla`, `/jee-coaching-in-shimla`, `/neet-coaching-in-solan`, `/jee-coaching-in-solan`, `/neet-coaching-in-kinnaur`, `/jee-coaching-in-kinnaur`, `/neet-coaching-in-rampur-bushahr`, `/jee-coaching-in-rampur-bushahr`, `/jee-coaching-in-rohru` | `/centres/shimla` | serving centre (Shimla, Solan, Kinnaur) |
| | `/neet-coaching-in-himachal-pradesh`, `/jee-coaching-himachal-pradesh` | `/centres` | state-wide page |
| `old-centres` (4) | `/aspire-hamirpur`, `/aspire-dharamshala`, `/aspire-kullu`, `/head-office-shimla` | `/centres/hamirpur`, `/centres/dharamshala`, `/centres/kullu`, `/centres/shimla` | same centre |
| `old-results` (28) | `/engineering-result`, `/engineering-result-2015` … `/engineering-result-2025` (11), `/medical-result`, `/medical-result-2015` … `/medical-result-2025` (11), `/foundation-result`, `/jee-result-2026`, `/6-october-2024-result`, `/achievements` | `/results` | — |
| `old-testimonials` (1 prefix) | `/wpt-testimonial/*` | `/results` | one prefix rule, so no student name is stored (§6 rule 9) |
| `old-courses` (26) | `/courses`, `/kvpy`, `/iit-jee-target`, `/iit-jee-test-series`, `/iit-jee-test-series-2`, `/iit-jee-crash-courses`, `/neet-crash-courses`, `/neet-test-series`, `/neet-target-courses`, `/online-programs-test-series`, `/jee-main`, `/jee-main-advanced`, `/neet-ug-pre-medical`, `/foundation-6th-10th`, `/for-class-vi`, `/for-class-vii`, `/for-class-viii`, `/for-class-ix`, `/class-x`, `/class-xi-ssb-n-m`, `/class-xi-ssb-med`, `/class-xii-ssb-n-m`, `/class-xii-ssb-med`, `/ssb-batch`, `/josh`, `/aspire-digital` | `/programs` | re-point to a program page once programs are approved |
| `old-about` (6) | `/about-us`, `/introduction`, `/director-message`, `/why-choose-us`, `/gallery`, `/aspire-iit-medical-redefining-coaching-in-himachal-pradesh` | `/about` | — |
| `old-admissions` (4) | `/admission`, `/admission-rule`, `/online-admission`, `/enquiry-form` | `/admissions` | — |
| `old-boh` (2) | `/glimpses-of-boh`, `/glimpses-of-boh-uttarakhand` | `/admissions` | change to `/scholarship-test` once it is live |
| `old-contact` (5) | `/contact-us`, `/feedback-and-suggestion`, `/fee-deposit-mode`, `/careers`, `/job-opportunity` | `/contact` | fee and job pages: owner to decide |
| `old-resources` (4) | `/exam-details`, `/syllabus-3`, `/download`, `/news-update` | `/resources` | — |
| `old-policies` (2) | `/privacy-policy`, `/term-and-condition` | `/privacy`, `/terms` | — |
| `old-tools` (1) | `/neet-2026-rank-predictor` | `/tools/predictor` | — |

No rule: `/`, `/results` (live on the new site; the trailing-slash 308 handles `/results/`), `/test`, `/hello-world`, `/category/*`, `/author/*` (Not found is right for these). The earlier aspire2 demo paths are not seeded (S17).

**Tests:**
- normalisation (case, trailing slash, `//`, encoded characters, `..`)
- exact beats prefix; the longest prefix wins; the tail is copied; the query is kept
- **open redirect:** `/\evil.com`, `/%5Cevil.com`, `/%2F%2Fevil.com`, `//evil.com`, `/\tevil.com`, `https://evil.com`, a target with a space or control character: each refused on save, on import, by the schema CHECK where applicable, and dropped by `buildRedirectTable`; a matched Location always has the request's origin
- validation: chain (including `/faculty`), loop, shadowing (exact and prefix as errors), private, external, `/api`, `/og`, `/go`, `/links`, every `RESERVED_SEGMENTS` entry
- seed idempotency; seed count 108; no seed source contains a testimonial slug; every seed target passes validation; group accept
- import preview and flattening
- proxy: hidden mode touches no database (spy on the handle factory); basic mode redirects and does not count; live mode redirects and counts; Location absolute on the request origin; prefetch not counted; private paths never redirected; flush is one `BEGIN IMMEDIATE` transaction; busy skip keeps the maps; overflow cap; a load error fails open; no `event` → no flush
- host guard: open + temporary host → `X-Robots-Tag: noindex, nofollow` on a page response and `Disallow: /` for `/robots.txt`; production host → no header; hidden → guard off
- `proxy.test.ts`: every existing case unchanged, plus the SEO step and host-guard cases

### H. Social profiles and WhatsApp share texts (SEO-SHARE; `/admin/search/social`)

- **Social profiles:** six rows (Facebook, Instagram, YouTube, LinkedIn, X, Telegram) editing the `org` facts `social.*` **through the facts API**, with the same verify flow, showing where each is used: "Search engines (sameAs) when the switch is on". Suggestions come from `institute.ts` and are unverified. The site footer is not changed by this pack.
- **WhatsApp share texts:**
  - keys `home`, `program`, `centre`, `article`, `scholarship_test`, `announcement` (3b); English, Hindi and Hinglish
  - slots `{title}`, `{centre}` (the town label), `{date}`, `{link}`; `{link}` is required
  - drafts loaded per key with `INSERT OR IGNORE`, status draft; claim-word warnings apply
  - *Approve* (super admin; editing an approved text sends it back to draft); preview with a sample entity
  - tagged link `{site}{localePath(path)}?utm_source=whatsapp&utm_medium=social&utm_campaign=share-{key}&utm_content={slug}`; the canonical and `og:url` stay clean, and `enquiry-context.ts` already records these tags
  - seed drafts (English):
    - home: "Aspire IIT & Medical: courses, centres and admissions. {link}"
    - program: "{title} at Aspire IIT & Medical. Details and how to enquire: {link}"
    - centre: "Aspire IIT & Medical, {centre} centre: address, timings and how to visit. {link}"
    - article: "{title} (Aspire IIT & Medical): {link}"
    - scholarship_test: "Aspire scholarship test: {title}, {date}. Register here: {link}"
    - announcement: "{title}: {link}"

    Hindi and Hinglish drafts are machine-written and marked for review. No text names a student; a results share text does not exist until consent and disclosure data exist (Phase 3a).
  - **Staff tools on each entity row:** *Copy text* and *Open WhatsApp* (`https://wa.me/?text=` plus the encoded text). Before launch both show "Preview only: links point at the temporary address until launch" and are disabled.
- **Public `ShareLinks`** (replaces the stub; server wrapper plus a small client island):
  - renders only when live **and** an approved text exists for the page locale (cached read, tag `seo:share`); Hindi without an approved Hindi text: only *Copy link*
  - "Share on WhatsApp" link (`wa.me`, `rel="noopener"`, label "(opens WhatsApp)")
  - *Copy link* button (`navigator.clipboard`, result in `aria-live="polite"`: "Link copied" / "Couldn't copy. Select the link and copy it.")
  - rendered in the static shell, so it causes no layout shift
- **API:** `GET /api/admin/seo/share-texts`, `PUT /api/admin/seo/share-texts/[key]/[lang]`, `POST …/approve`, `POST /api/admin/seo/share-texts/seed`. Writes revalidate `seoTag("share")`. Audit: `seo.share_text_save`, `seo.share_text_approve`, `seo.share_text_seed`.
- **Public copy, `src/i18n/messages/{en,hi}/seo.ts`** (SEO-CORE creates final keys):

| Key | English | Hindi (draft) |
|---|---|---|
| `share.heading` | Share this page | यह पेज शेयर करें |
| `share.whatsapp` | Share on WhatsApp | WhatsApp पर शेयर करें |
| `share.opensWhatsApp` | (opens WhatsApp) | (WhatsApp खुलेगा) |
| `share.copy` | Copy link | लिंक कॉपी करें |
| `share.copied` | Link copied | लिंक कॉपी हो गया |
| `share.copyFailed` | Couldn't copy. Select the link and copy it. | कॉपी नहीं हो सका। लिंक चुनकर कॉपी करें। |

- **Tests:** slot fill with `{link}` required; claim warnings; approval reset on edit; tagged-link format with the canonical untouched; ShareLinks hidden when not live or unapproved; copy feedback a11y markup; social URLs validated per network.

### I. Hindi pages in search (SEO-CORE)

`hindiReady(ref)` drives three things in live mode:
- `withSeo`: the Hindi URL gets `noindex, follow`, and `hi-IN` is dropped from both versions' language links
- the sitemap omits the Hindi URL and its `hi-IN` link
- the console chip "Hindi not translated"

Static pages are always ready (typed Hindi messages). `x-default` keeps pointing at English. A Hindi page's `<title>` stays Hindi when a Hindi override exists; otherwise the existing Hindi message title is used.

---

## 6. Honesty rules (every package; Integrate checks them)

1. **Verified or omitted.** Structured data, llms.txt, share cards and share texts use only `seo_facts` rows with `status = 'verified'` and content with `status = 'published'`. A missing optional property is left out; a missing required property drops the whole object. Nothing is inferred, defaulted or copied from demo data.
2. **No self-reviews.** Never `aggregateRating` or `review` for Aspire or its centres; a test enforces this. Never rewards for reviews.
3. **Markup matches what is visible.** Centre pages render the same resolved NAP object the markup receives, and the hero shows the same values. FAQ markup takes the page's own FAQ array. Event markup appears only on the page that lists that slot. Breadcrumb markup takes the hero's own crumbs. No `areaServed` on centres (nothing visible backs it).
4. **No promises.** Console copy says "Google may or may not show this". FAQ and Course markup carry no claim of special results. AI visibility is never scored; crawler counts are labelled "fetches, not people" and "not checked".
5. **Coaching-advertising rules (CCPA, 13 Nov 2024; Ministry of Education guidelines, Jan 2024):** results only with written consent obtained after selection, plus course, duration and paid/free; claim-word warnings on titles, descriptions and share texts; no success rates, ranks or guarantees on cards.
6. **DEMO labels.** Every console SEO page shows the ModeBanner while hidden. Placeholder content on centre pages carries DEMO badges and the "not yet confirmed" note. Previews built during demo use production-visible data and say so.
7. **Business Profile consistency.** One brand name for every location. Hours are enquiry-desk hours only. The website link points at the centre's own page, never at a redirect. Footer, Contact page and centre pages show the same details (checklist `nap`).
8. **Hindi.** No `hi-IN` pairing for untranslated pages. No Hindi share cards in R4. Every Hindi line goes to the review register (decision 19).
9. **Privacy.** The app reads no IP for crawler counting and stores no IP, user agent or visitor data; the share-image limiter keeps an IP only as an in-memory key. No personal data in any `seo_*` table; no student name in a redirect source (testimonial pages use one prefix rule). Tagged links carry campaign tags only. Note: the server's nginx access logs keep IPs, as they do today; that is outside the app.
10. **Private stays private.** robots.txt is never the only guard. Private pages keep auth plus `X-Robots-Tag: noindex` (proxy), because user-triggered fetchers may ignore robots.txt.
11. **No remote calls from public renders.** Share cards never trigger a font or emoji fetch (tested).

---

## 7. Permissions, API and audit

### 7.1 Permissions

| Action | Super admin | Admin | Others |
|---|---|---|---|
| Read every `/admin/search/**` page, previews, counts | Yes | Yes | No (403 / redirect) |
| Switch, crawler policy, verification codes, checklist ticks, GBP ticks | Yes | No | No |
| Edit titles and share texts, approve texts, edit and verify facts, confirm event places, redirects | Yes | No | No |
| Load `/og/*` before the switch is on | Yes | Yes | No (404) |

### 7.2 API summary (all `/api/admin/seo/**` go through `requireSeoAccess`, the D-007 envelope and `no-store`)

| Route | Methods | Package |
|---|---|---|
| `/api/admin/seo/settings/[key]` | GET, PUT (`expectedVersion`; keys `golive`, `crawlers`, `verification`, `gbp`, `checklist`) | CORE |
| `/api/admin/seo/pages/[pageKey]` | GET, PUT, DELETE | META |
| `/api/admin/seo/facts` and `/facts/[scope]/[field]` (+ `/verify`, `/unverify`) | GET; PUT; POST | FACTS |
| `/api/admin/seo/events/places/[slotId]` | PUT | FACTS |
| `/api/admin/seo/redirects` (+ `/[id]`, `/import`, `/test`, `/seed`, `/groups/[group]/accept`) | GET, POST; PATCH, DELETE; POST | ROUTING |
| `/api/admin/seo/share-texts` (+ `/[key]/[lang]`, `/approve`, `/seed`) | GET; PUT; POST | SHARE |
| `/og/[kind]/[file]` | GET (public when live) | SHARE |
| `/llms.txt` | GET (public when live) | CRAWLERS |
| `/robots.txt`, `/sitemap.xml` | GET | CORE (robots on a non-production host: ROUTING's host guard) |

### 7.3 Audit codes (`SEO_AUDIT`; English labels in `audit-labels.ts`, Integrate)

| Code | Label |
|---|---|
| `seo.golive_on` / `seo.golive_off` | Opened / closed the go-live pack |
| `seo.crawler_policy_save` | Changed which crawlers may read the site |
| `seo.verification_save` | Changed the Search Console / Bing codes |
| `seo.checklist_tick` | Ticked a go-live checklist item |
| `seo.gbp_check` | Updated a centre's Business Profile checklist |
| `seo.page_meta_save` / `_reset` | Changed / reset a page title or share preview |
| `seo.fact_save` / `seo.fact_verify` / `seo.fact_unverify` | Changed / verified / unverified a business fact |
| `seo.event_place_confirm` / `_clear` | Confirmed / cleared a test slot's centre address |
| `seo.redirect_create` / `_update` / `_delete` / `_import` / `_seed` / `_accept_group` | Forward added / changed / deleted / imported / suggestions loaded / group accepted |
| `seo.share_text_save` / `_approve` / `_seed` | WhatsApp share text changed / approved / drafts loaded |

---

## 8. Performance and caching

- **Public pages stay static.** Metadata and JSON-LD read `"use cache"` loaders:
  - render settings tagged `seo:settings`, facts `seo:facts`, approved share texts `seo:share`, page meta **per page** `seo:meta:<pageKey>`; everything also carries `seo`
  - console-only settings (`gbp`, `checklist`) are read uncached and never revalidate anything, so a checklist tick does not refresh the site
  - console writes call `revalidateTag(…, { expire: 0 })` on the narrowest tag
  - `generateMetadata` never reads request data
- **Production builds become short-lived (accepted).** Out of demo mode, the root layout and `withSeo` read the render settings, which at build time carry `BUILD_LIFE` (revalidate 1). About 80 pages therefore regenerate once on their first request after each production deploy, on one vCPU. In hidden mode (today), `searchMode()` returns before any cached read, so demo builds keep their current cache life (tested). The deploy notes say so.
- **Request-time parts** are only the ones with dates or people: the next test date, local results and the scholarship-test Event, under `<Suspense>` after `connection()`, with fixed-height fallbacks.
- **No layout shift:** JSON-LD is invisible, share links are in the static shell, and centre-page images have width and height.
- **Proxy hot path:** hidden: one env check and one property write. Open: one host comparison, one `Map` lookup and at most 100 prefix comparisons; live adds one regex test. Database reads at most every 60 s through the proxy's own handle with a 50 ms busy timeout; writes at most every 60 s in one `BEGIN IMMEDIATE` transaction, skipped when busy. No per-request database access. No network calls.
- **Share images:** rendered at request time, LRU 32 entries / 4 MB, a week of HTTP caching when versioned, 20 cache misses per minute per IP, flat templates, 300 KB or less per PNG, no remote fetches. No `opengraph-image.tsx` (that prerenders at build).
- **robots.txt** is under 2 KB, from a tagged cache. **sitemap.xml** stays dynamic as today. **llms.txt** is one small read plus an hour of HTTP caching.
- **Disk:** a few hundred kilobytes of database rows. No font file, no new npm packages.
- **Core Web Vitals targets** (75th percentile, mobile): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Integrate runs one headless Lighthouse pass on home, a program page and a centre page, and reports any drop against R3.

---

## 9. Accessibility

- **Console:** every input has a `<label>`; errors go to an error summary focused after a failed save; length and warning hints use text plus an icon, are linked through `aria-describedby`, and are announced politely; status chips carry words; tables have captions and `scope`; previews are `<figure>`s with real text and a figcaption; the switch is a real `<button>` with `aria-pressed` and a confirmation dialog (focus trapped and returned); code blocks have *Copy* buttons with an announced result; targets are at least 44 px; check the sidebar at 768 px with six new items.
- **Centre pages:** one h1, then h2 sections; `<address>`; phone and email links with clear names; the external map link marked "(opens in a new tab)"; the preselected centre is the selected `<option>`, so it is announced; the enquiry form keeps its labels and error summary; share copy feedback through `aria-live`; the Hindi page has `lang="hi"`, English fallback fields carry `lang="en"` (existing `localized()` behaviour).

---

## 10. Copy rules

- Console strings are English constants in each module (decision 5). Nav labels are bilingual and live in `portal.ts` (SEO-CORE):

| Key | English | Hindi |
|---|---|---|
| `nav.searchPages` | Page titles & share previews | पेज टाइटल और शेयर प्रीव्यू |
| `nav.searchFacts` | Business facts | बिज़नेस जानकारी |
| `nav.searchCentres` | Centre pages & Google profile | सेंटर पेज और Google प्रोफ़ाइल |
| `nav.searchCrawlers` | Crawlers & verification | क्रॉलर और सत्यापन |
| `nav.searchRedirects` | Old-address forwards | पुराने पतों का रीडायरेक्ट |
| `nav.searchSocial` | Social sharing | सोशल शेयरिंग |

- **Terms used everywhere:** "Verified" / "Not verified: do not publish" / "Not set"; "Hidden from search (demo mode)"; "Open to search engines"; "go-live pack"; "share preview"; "share card"; "forward" (owner copy) / "redirect" (technical copy); "crawler"; "answer crawlers", "training crawlers", "user-triggered fetchers"; "Business Profile" (never "GMB").
- **Never in any copy:** "rank #1", "guaranteed", "rich results", "AI score", "will appear in ChatGPT".

---

## 11. Risks

| Risk | What we do |
|---|---|
| Old aspireiit.in rankings are lost at the DNS move | 108 seed forwards from the old sitemaps, working from launch day without the switch; Search Console property kept; re-fetch of the old sitemaps a week before launch; two-hop test in the runbook |
| Email on @aspireiit.in breaks at the DNS move | Only A/AAAA records for `@` and `www` change; nameservers, MX, SPF, DKIM and other TXT records are left alone (runbook) |
| The temporary domain gets indexed | Hidden unless configured for aspireiit.in (env read at call time; unset = hidden), plus the request-host guard |
| nginx does not forward the public host, so the live site marks itself noindex | The switch refuses until the admin's request host is a production host; Overview shows the host seen; runbook checks headers before and after |
| Wrong facts reach Google, Maps or AI | Verified-only; editing resets verification; consistency panel including the footer; previews from production-visible data |
| The proxy bundle cannot load `node:sqlite` | Build gate at the end of SEO-ROUTING; Plan B (catch-all page with `permanentRedirect`, counting dropped) |
| A database lock stalls the proxy | Own handle with a 50 ms busy timeout; `BEGIN IMMEDIATE`; skip on busy; reads at most every 60 s |
| The proxy runs in a separate context | It loads and flushes on its own (60 s bound); Overview shows whether it is shared |
| A robots.txt error stops crawling for 12 h | `robots.ts` never throws (falls back to R1 plus `/go/`); tested |
| Open redirect or hijacked live pages | `isSafeInternalPath` on save, import, load and in the schema; reserved and live-page shadow checks as errors; chain and loop checks |
| Doorway or thin centre pages | Pages only for real centre records, each with its own facts; no town pages without a centre |
| Towns without a centre lose rankings | Stated to the owner (S16); Business Profiles and real centre pages instead |
| Share-image CPU on 1 vCPU, or remote font fetches | LRU, versioned caching, rate limit, flat design, ASCII-only card text, no-fetch test |
| Spoofed bot names inflate counts | Labelled "not checked"; IP verification is a later item |
| Too much is switched at once | One switch with instant off; `SEO_PACK_DISABLED`; per-fact unverify; per-rule off; forwards independent of the switch |
| Other streams edit the same files | Start after R3 with no Phase 2 or 3a package running; one owner per file; re-read before editing |
| CCPA or DPDP breach through results or tags | Consent plus disclosure gate; no names in demo; no personal data stored |
| Over-promising | §6 rule 4; the owner summary states the limits |

---

## 12. Decisions to record (SEO-INTEGRATE; re-grep the ids first)

- **D-085 Search go-live switch.** Three modes: hidden (demo mode, or `NEXT_PUBLIC_SITE_URL` unset, invalid or not an aspireiit.in / www https origin, read at call time), basic, live. Leaving demo mode on the final domain turns on continuity (redirects, verification metas) and restrictions (crawler blocks, `noarchive`); the super-admin console switch (`seo_settings.golive`) turns on additions, and is refused unless out of demo, on the final domain and requested through a production host. `SEO_PACK_DISABLED=true` forces basic and stops the proxy SEO step. Fail closed to basic. A proxy request-host guard marks every response on a non-production host `noindex, nofollow` and serves `Disallow: /` robots.txt there.
- **D-086 Crawler policy and counting.** Groups search, answer, user, training, preview (`CRAWLERS`); decision 22 default allow all; robots.txt names only fully blocked bots (`Disallow: /`), private paths and `/go/` stay in `*`; search engines and link previews always allowed; Google-Extended does not control AI Overviews (Search Console does); optional `noarchive` for Copilot. Daily counts per bot and page type by user agent only, live mode only; no IP read or stored; 400 days. IP-range verification deferred.
- **D-087 Structured data from verified facts.** `seo_facts` with per-field verification; saving resets. Organization, WebSite, `["EducationalOrganization","LocalBusiness"]` per centre, Course / ItemList, Article, BreadcrumbList (from the hero's crumbs), FAQPage (no promise), Event for confirmed slots (Place name = brand, verified address). Required properties missing → object omitted. `@id` on English paths; cross-page references inlined. Never ratings, reviews, `areaServed` on centres, or images of centres. Suggestions never auto-verify.
- **D-088 Centre pages.** `/centres/[slug]` for visible centres. NAP resolver: verified facts, then published content, then demo; the hero, the Visit section and the markup use the same resolved object. Maps link only when verified. Title "{services} coaching in {town}". Enquiry form (admissions variant) preset through `defaultCentre`, reset to it after submit. Local results only with consent obtained after selection plus a CCPA disclosure (stub until Phase 3a); no names in demo. Per-centre Business Profile checklist and tagged link `utm_medium=gbp`.
- **D-089 Titles and share cards.** `seo_page_meta` overrides (no history; the audit log records changes). `withSeo` builds the full Open Graph and X card (og:title without branding, clean og:url) in live mode and returns `base` otherwise or for invisible entities. Soft warnings: 60 / 155 characters (Devanagari 50 / 130 clusters), WhatsApp 80, duplicates, claim words, card text. `/og/<kind>/<key>.<locale>.<v>.png` outside `/api`, versioned, LRU-cached, data by key only, Geist only, ASCII card text, never a remote fetch; English cards on Hindi pages. WhatsApp share texts (approved only) with `utm_source=whatsapp&utm_medium=social`.
- **D-090 Redirects.** `seo_redirects` (exact and prefix) read by the proxy (Node runtime) through its own `node:sqlite` handle and a 60 s registry; active in basic and live. 301 with an absolute Location on the request's origin; query kept. Internal targets only (`isSafeInternalPath`), no chains (including next.config sources), loops, reserved paths or shadowing of live pages. Seeds from the old aspireiit.in sitemaps are suggestions, accepted by group. Old trailing-slash URLs take two hops (Next's 308, then 301). Hits counted per day. Keep at least a year. `/faculty` stays next.config's 302.
- **D-091 Hindi in search and llms.txt.** Untranslated Hindi detail pages: `noindex, follow`, no `hi-IN` link, no sitemap entry (live only). No Hindi share cards in R4. `/llms.txt` live only, from verified and published data, markdown links, no claims.

---

# Part 2. Build packages

## 13. Packages and waves

**Order:**
1. **SEO-CORE** runs alone.
2. **Wave 1** (three agents at most): SEO-FACTS, SEO-SHARE, SEO-ROUTING (ends with the build gate, §5.G).
3. **Wave 2** (three agents): SEO-META, SEO-CENTRES, SEO-CRAWLERS.
4. **SEO-INTEGRATE.**

If the owner's PC struggles, run two agents at a time: FACTS + ROUTING, then SHARE + CRAWLERS, then META + CENTRES.

**File ownership:**
- After CORE, every path has exactly one owner. Packages read CORE files and never edit them. A CORE stub becomes its receiver's file.
- **Shared suites, one editor at a time:** `db.test.ts`, `robots-sitemap.test.ts`, `i18n.test.ts` (robots and sitemap blocks): CORE. `portal-ui.test.ts`: CORE (nav), then INTEGRATE (roadmap). `proxy.test.ts`: ROUTING. The forms suite covering `EnquiryForm`: CENTRES. `prerender-bailout.test.ts`: INTEGRATE.

**Dependencies:** META waits for FACTS (JSON-LD components) and SHARE (`ShareLinks`, `shareImageFor`). CENTRES waits for FACTS (`CentreJsonLd`, the test-event adapter) and SHARE. CRAWLERS waits for ROUTING, which calls its classifier.

## 14. Integrate, verify, deploy (SEO-INTEGRATE, one agent)

1. **Wiring:**
   - confirm that no stub is left
   - remove the shipped items `titles`, `businessFacts`, `centrePages`, `crawlers`, `redirects` and `social` from `console-roadmap.ts` and `portal.admin.coming`; add or keep as "Later": Instagram posts, IndexNow, Hindi share cards, crawler IP verification, crawler visit chart, page-title history
   - add `seo.*` labels to `audit-labels.ts`
   - add `/og/[kind]/[file]` and `/llms.txt` to the prerender bail-out test
   - optionally point 1b's Maps card tagged link at `/centres/<slug>` (one line; skip if not trivial)
2. **Docs:**
   - D-085 to D-091 in `docs/agent-decisions.md`
   - an SEO section in `docs/api.md`
   - a "Search facts" section in `docs/content-verification.md`: NAP for search is verified in the console; C1–C4, C6, C7, C30 and C41 are resolved there; the old aspireiit.in site is listed as a source
   - Hindi lines in `docs/hindi-review-register.md`
   - approval-checklist items SEO-1 to SEO-7: business facts, Business Profile access and checklist, old-address forwards and extra old addresses, Search Console access, DNS access (website records only), results disclosure (CCPA), aspire2 decision
   - the "Domain move and search go-live" runbook (§16) and the short-lived-build note (§8) in `deploy/README.md`
3. **Checks:**
   - full `vitest --maxWorkers=2`, one `tsc`, eslint on all touched files
   - the off-PC CI build: `next build` succeeds; `.next/prerender-manifest.json` still lists every static page, plus `/centres/[slug]` for the 4 slugs in both locales; robots.txt is prerendered
   - **production-mode smoke in CI** (`scripts/seo-smoke.mjs`, one CI step): start the standalone server with `NEXT_PUBLIC_SITE_URL=https://aspireiit.in`, `SHOW_PLACEHOLDER_CONTENT=false`, a temporary database with the seeds accepted; then `curl -H "Host: aspireiit.in"`: `/neet-coaching-in-mandi/` → 308 then 301 to `/centres/kullu`; `/robots.txt` is the basic object with `/go/`; no `X-Robots-Tag` on `/`. With `Host: aspire.thechunkmedia.com`: `/robots.txt` is `Disallow: /` and `/` carries `X-Robots-Tag: noindex, nofollow`. No deploy involved.
4. **Headless pass (demo build, one Chrome):**
   - `/robots.txt` still `Disallow: /`; no `ld+json` on any page except predictor and planner; `/llms.txt` gives 404; `/og/site/site.en.00000000.png` signed out gives 404
   - `/centres/hamirpur` and `/hi/centres/hamirpur` render with DEMO labels, the enquiry form preselects Hamirpur, and no student names appear
   - every `/admin/search/**` page opens for an admin; editing controls appear only for a super admin
   - sidebar at 768 px; Lighthouse mobile on home, a program page and a centre page (§8)
5. **Deploy** with demo mode on (switch off), as the owner's "deploy everything" asks:
   - keep the current image and one rollback image; prune the builder
   - after deploy: the checks of step 4 on the server, `/api/health` unchanged, thechunkmedia.com and aspire2.thechunkmedia.com still answering 200
   - read the Overview's "Proxy shares memory with the app" line and report it (the 60 s bound of §5.G)
   - check that nginx's `location /` for this site has `proxy_set_header Host $host;` and report (the launch block must have it)
   - tag the release `release-YYYY-MM-DD.N`

## 15. If time runs short (cut in this order; each cut item goes to "What's coming")

Already cut by default: Hindi share cards and the font test, crawler IP verification, the crawler visit chart, page-title history and restore.

1. FAQPage and Article markup.
2. WhatsApp share texts and public `ShareLinks` (social profiles stay).
3. Redirect CSV import (single add and group accept stay).
4. The Event markup adapter.
5. Crawler visit counting (policy, robots and verification stay).

**Never cut:** the switch and its gate, the request-host guard, robots modes, verified-only facts, centre pages, redirects with the old-site seeds, and title overrides.

## 16. Go-live runbook (owner plus developer, at launch)

1. **A week before the DNS change:**
   - re-fetch the old sitemaps (`/sitemap_index.xml` and its children) and add any new page to the forwards
   - collect old addresses outside the sitemaps (brochures, QR codes, ads, listings); tick `oldUrls`
   - decide every forward group; verify the institute name and each centre's address and phone; align the footer and Contact page (`nap`)
   - finish each Business Profile checklist except the website link
   - confirm who controls the existing Search Console property; if Aspire does, paste its Google code in *Verification*
   - export any Google Analytics reports to keep (GA4 and GTM stop at launch, decision 21)
   - note the current DNS records (screenshot or zone export)
2. **Server (ops):**
   - an nginx server block for `aspireiit.in` and `www.aspireiit.in` copied from the current one (keeping `proxy_set_header Host $host;`), plus a certbot certificate
   - a 301 from `www` to the apex
   - **a 301 from `aspire.thechunkmedia.com/*` to `https://aspireiit.in$request_uri`, kept for at least a year**
   - aspire2.thechunkmedia.com: if the owner agrees (S17), a 301 to `https://aspireiit.in/`
3. **DNS:**
   - change **only** the A/AAAA records for `@` and `www` to the server; do **not** change nameservers; leave MX, SPF, DKIM, DMARC and other TXT records untouched (campus mail on @aspireiit.in)
   - keep the domain registration renewed
4. **Rebuild:**
   - set `NEXT_PUBLIC_SITE_URL=https://aspireiit.in` and `SHOW_PLACEHOLDER_CONTENT=false` (Phase 3a approvals done first, so the site is not empty); deploy
   - check `/admin/status` says "Open to search engines (go-live pack off)" and the Overview shows the request host `aspireiit.in`
   - `curl -sI https://aspireiit.in/` has no `X-Robots-Tag`; `curl -sI https://aspire.thechunkmedia.com/` is a 301
   - test five old addresses with their trailing slash (two hops: 308 then 301) and one `/wpt-testimonial/...` address
5. **Console:** *Overview* → turn the switch on; check that `/robots.txt` shows the `*` group with `/api/predictor/card` allowed and the sitemap line; check that `/llms.txt`, one `/og/...png` and one centre page's structured data load.
6. **Search Console:** keep the existing property or add a Domain property through a DNS TXT record; submit `/sitemap.xml`; use the Change of Address tool only if the old site lived on a different domain (it did not, so normally not needed); leave Settings → Search generative AI on **Include** (decision 22); tick "Search Console ready". Bing Webmaster Tools: import from Search Console.
7. **Checks:** Rich Results Test on home, one program page and one centre page; Facebook Sharing Debugger on home and one program page; share one link to yourself on WhatsApp.
8. **Business Profiles:** add each centre's tagged website link and check that name, address and phone match the page.
9. **After launch:** week 1: crawler-visit table, Search Console coverage and the "Not found" report for old addresses missed; monthly: the AI-answer check; keep the forwards for at least a year.

## 17. Build packages (machine-readable)

PACKAGES:

```json
[
  {
    "key": "SEO-CORE",
    "title": "Search go-live core: seo schema, prerequisites and modes, runtime loaders, withSeo, robots/sitemap/layout, settings API, guards, overview, nav, contracts and stubs",
    "dependsOn": [],
    "owns": [
      "src/lib/db/features/seo.ts",
      "src/lib/db/features/index.ts",
      "src/lib/db/db.test.ts",
      "src/lib/db/seo-schema.test.ts",
      "src/lib/seo/types.ts",
      "src/lib/seo/prereq.ts",
      "src/lib/seo/mode.ts",
      "src/lib/seo/settings.ts",
      "src/lib/seo/runtime.ts",
      "src/lib/seo/pages.ts",
      "src/lib/seo/breadcrumbs.ts",
      "src/lib/seo/routes.ts",
      "src/lib/seo/metadata.ts",
      "src/lib/seo/hindi.ts",
      "src/lib/seo/access.ts",
      "src/lib/seo/audit.ts",
      "src/lib/seo/warnings.ts",
      "src/lib/seo/card-glyphs.ts",
      "src/lib/seo/golive.ts",
      "src/lib/seo/robots-rules.ts",
      "src/lib/seo/crawlers/registry.ts",
      "src/lib/seo/proxy/registry.ts",
      "src/lib/seo/redirects/safe-path.ts",
      "src/lib/seo/redirects/normalize.ts",
      "src/lib/seo/redirects/match.ts",
      "src/lib/seo/repo/settings.ts",
      "src/lib/seo/repo/read.ts",
      "src/lib/seo/repo/golive.ts",
      "src/lib/seo/core.test.ts",
      "src/lib/seo/prereq.test.ts",
      "src/lib/seo/metadata.test.ts",
      "src/lib/seo/robots-rules.test.ts",
      "src/lib/seo/routes.test.ts",
      "src/lib/seo/breadcrumbs.test.ts",
      "src/lib/seo/redirects/match.test.ts",
      "src/lib/seo/share/cards.ts (stub, handed to SEO-SHARE)",
      "src/components/seo/ShareLinks.tsx (stub, handed to SEO-SHARE)",
      "src/components/seo/jsonld/index.tsx (stub, handed to SEO-FACTS)",
      "src/lib/seo/crawlers/classify.ts (stub, handed to SEO-CRAWLERS)",
      "src/components/seo/JsonLdScript.tsx",
      "src/components/seo/console/shared/**",
      "src/components/seo/console/overview/**",
      "src/app/robots.ts",
      "src/app/sitemap.ts",
      "src/app/robots-sitemap.test.ts",
      "src/i18n/i18n.test.ts (robots and sitemap blocks only)",
      "src/app/[lang]/layout.tsx",
      "src/lib/data.ts (additive getCentreSlugs only)",
      "src/app/api/admin/seo/settings/[key]/route.ts",
      "src/app/api/admin/seo/settings/settings-api.test.ts",
      "src/app/[lang]/(portal)/admin/search/page.tsx",
      "src/lib/console/status.ts (Google indexing row only)",
      "src/components/portal/areas.ts",
      "src/components/portal/portal-ui.test.ts (nav block)",
      "src/i18n/messages/en/portal.ts (nav labels only)",
      "src/i18n/messages/hi/portal.ts (nav labels only)",
      "src/i18n/messages/en/seo.ts",
      "src/i18n/messages/hi/seo.ts",
      "src/i18n/messages/types.ts",
      "src/i18n/messages/index.ts"
    ],
    "task": "Read docs/seo-golive-plan.md fully (sections 0-4, 5.A, 5.B withSeo, 5.F robots/layout/sitemap/registry, 5.G matching and safe-path rules, 5.I, 6-8) and AGENTS.md; read node_modules/next/dist/docs on generate-metadata (With Cache Components), robots, sitemap, use cache, cacheLife, cacheTag, revalidateTag, route handlers, json-ld. PRECONDITION (1.1): Phase 1b integrate landed (areas.ts search group, admin/search/page.tsx, src/lib/console/status.ts, audit-labels.ts, src/lib/crm/console/centre-links.ts) and no Phase 2 or Phase 3a package is running; otherwise STOP and report. Re-read each shared file before editing. BUILD: (1) feature schema seo exactly as section 3 (column names setting/kind/text_key; backslash and // CHECKs; seed_group), appended after page_layout and before qb; add seo to both prefix regexes in db.test.ts; schema test (idempotent twice, CHECKs reject bad values incl. '/\\evil.com' and '//evil.com'). (2) types.ts exactly as 4.1. prereq.ts (pure, no server-only import): PRODUCTION_HOSTS, searchPrerequisites(env) reading NEXT_PUBLIC_SITE_URL at call time with the getSiteOrigin parse repeated (unset/invalid/http/non-production = not final), requestHost(headers), isProductionHost, ROBOTS_TXT_DISALLOW_ALL; prereq.test.ts asserts equality with getSiteOrigin over a table. mode.ts: searchMode (hidden returns before any cache read; basic when packDisabled; fail closed to basic; build never live), isSearchLive, searchModeLabel. (3) runtime.ts 'use cache' loaders getRenderSettings (tags seo, seo:settings), getPageMetaOverride(pageKey, locale) (tags seo, seo:meta:<pageKey>), getVerifiedFacts (tags seo, seo:facts) with the page-layout build-default pattern; repo/read.ts SQL; VerifiedFacts only from status verified rows, address only when street, locality, region and postalCode are all verified. (4) settings.ts with zod per key and optimistic version and audit; render keys revalidate seo:settings and call invalidateSeoProxyState, console keys (gbp, checklist) are uncached and never revalidate; settings API GET/PUT for golive, crawlers, verification, gbp, checklist with requireSeoAccess; golive on returns 409 prerequisites (demo, domain, packDisabled, requestHost) unless canGoLive and the request host is a production host. (5) pages.ts (registry, defaultMetaFor, isRefVisible, allPageRefs); breadcrumbs.ts crumbTrail mirroring HeroBreadcrumbs (test renders HeroBreadcrumbs and compares); routes.ts by moving staticRoutes, availableToolRoutes and availableExamRoutes out of sitemap.ts unchanged, plus RESERVED_SEGMENTS (hand-written; routes.test.ts reads src/app and src/app/[lang]/(*) top-level directories and fails on drift), isReservedPath and isLivePublicPath; hindi.ts; warnings.ts (5.B thresholds, claim words en and hi, card-text warning); card-glyphs.ts cardText; access.ts; audit.ts with SEO_AUDIT of 7.3; golive.ts checklist of 5.A incl. requestHost, nap (getContactDetails vs verified facts) and redirectShadow (reads seo_redirects and isLivePublicPath). (6) metadata.ts withSeo exactly as 5.B (returns base unchanged when not live or the entity is invisible; full openGraph and twitter when live; hindiReady rules; noarchive merged into any robots it sets). (7) robots-rules.ts and crawlers/registry.ts as 5.F (basic includes /go/ and blocked groups; null policy = R1 plus /go/; live adds Allow /api/predictor/card); robots.ts async, hidden reads nothing, try/catch to robotsFor('basic', null); sitemap.ts adds visible /centres/<slug> and the live-mode Hindi omissions and never lists /go; update robots-sitemap.test.ts and i18n.test.ts to await robots() and stub NEXT_PUBLIC_SITE_URL=https://aspireiit.in plus SHOW_PLACEHOLDER_CONTENT=false in production cases. (8) Root layout: robots noindex,nofollow when not open (demo OR non-final origin); when open, verification metas for saved codes and noarchive when bingNoArchive. (9) data.ts: add getCentreSlugs() only. (10) proxy/registry.ts (incl. markProxySeen, proxySeenAt), redirects safe-path.ts (isSafeInternalPath per 4.2), normalize.ts and match.ts (buildRedirectTable drops unsafe rows; matchRedirect returns { id, path, search }) with tests incl. every open-redirect case of 5.G. (11) Write the stubs of 4.4 with final signatures. (12) JsonLdScript with escaping; console shared components; /admin/search overview additions (status card with request host and proxy-seen lines, switch with confirm dialogs, checklist, monthly AI-answer list, Search Console note) keeping 1b's sections; status.ts indexing row via searchModeLabel. (13) Nav: six items under the search group (/admin/search/pages, facts, centres, crawlers, redirects, social) with the en/hi labels of section 10; register the seo namespace (en/hi seo.ts with the share keys of 5.H). Tests per 2.4 and the listed suites. Run: npx vitest run src/lib/seo src/lib/db src/app/robots-sitemap.test.ts src/i18n/i18n.test.ts src/app/api/admin/seo src/components/portal/portal-ui.test.ts --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. No new dependencies, no next build, no dev server.",
    "acceptance": [
      "seo schema is idempotent, appended after page_layout and before qb, uses no SQLite keyword column names, and its CHECKs refuse backslash and // paths; db.test.ts green with the seo prefix",
      "searchPrerequisites reads NEXT_PUBLIC_SITE_URL at call time, treats unset or invalid as not final, matches getSiteOrigin on every tested input, and imports no server-only module",
      "searchMode returns hidden for demo or a non-final origin without any cache read (spied), basic when the switch is off, disabled or unreadable, and live only when prerequisites hold and golive is on",
      "robots() is async, returns the exact R1 demo object when hidden, R1 plus /go/ (plus blocked groups) when basic, the live shape of 5.F, and never throws",
      "No named robots group ever lacks Disallow: /; search and preview crawlers can never be blocked",
      "withSeo returns base unchanged when not live or for an invisible entity; when live, og:url is absolute and query-free, og:title has no brand suffix, twitter card is summary_large_image, untranslated Hindi detail pages get noindex,follow without hi-IN, and noarchive is merged when set",
      "Verification metas render when open (basic and live) and never when hidden",
      "Sitemap lists visible centre pages and never private, /en, /api, /og or /go URLs",
      "PUT golive on returns 409 with the failing items (incl. requestHost from the temporary host); only super admins write; render-setting writes are audited and revalidate seo:settings; gbp and checklist writes revalidate nothing",
      "isSafeInternalPath and buildRedirectTable refuse /\\evil.com, %5C, %2F%2F, //, control characters and whitespace",
      "RESERVED_SEGMENTS test fails when a top-level route directory is added without updating the list",
      "crumbTrail output equals the rendered HeroBreadcrumbs for the same props",
      "getVerifiedFacts never returns an unverified value and drops a partial address",
      "All 4.4 stubs exist with final signatures; overview and nav render for admins in preview mode",
      "vitest (listed paths, --maxWorkers=1), one tsc and eslint are green"
    ]
  },
  {
    "key": "SEO-FACTS",
    "title": "Business facts sheet, suggestions and consistency (incl. footer and Contact page), JSON-LD builders and components, scholarship-test event places",
    "dependsOn": ["SEO-CORE"],
    "owns": [
      "src/lib/seo/facts/**",
      "src/lib/seo/jsonld/**",
      "src/lib/seo/sources/**",
      "src/lib/seo/repo/facts.ts",
      "src/lib/seo/repo/event-places.ts",
      "src/lib/seo/repo/sources.ts",
      "src/components/seo/jsonld/**",
      "src/app/api/admin/seo/facts/**",
      "src/app/api/admin/seo/events/**",
      "src/app/[lang]/(portal)/admin/search/facts/**",
      "src/components/seo/console/facts/**"
    ],
    "task": "Read docs/seo-golive-plan.md sections 0, 4, 5.D, 5.E (the NAP object CentreJsonLd receives), 5.H (social profiles use the facts API), 6, 7 and the SEO-CORE report; read node_modules/next/dist/docs/01-app/02-guides/json-ld.md and the route handler docs. Build the facts service (save resets to draft, verify requires confirm:true, unverify, optimistic version, audit seo.fact_*, revalidateTag seo:facts) with the validators of 5.D (phone, PIN, lat/lng with Himachal warning, map, GBP and social host allowlists, email domain warning, hours rows, programs subset, logo path existing at verify, org.name and displayName keyword warnings, regionServed C41 note). Suggestions from src/content (demo, unverified), getCentreLinks (1b) and Phase 2 verified crm_fact_entries slots centre_address, centre_map_link, desk_phone, desk_hours read only after checking sqlite_master. Consistency differences against the fact sheet, the 1b map links, getContactDetails() (footer and Contact page) and published content centre fields. API routes of 7.2 for facts and events/places. Console /admin/search/facts: institute section and per-centre tabs, field rows with chips, edit drawer, verify checkbox, suggestions with Use this, consistency panel, structured-data preview from production-visible (published-only) data, and the scholarship-test markup section (only when Phase 2 tables exist; the typed venue shown to the super admin; only centres with a verified address selectable). Pure builders in src/lib/seo/jsonld for every row of the 5.D table: @id always on the English path, url in the page locale, cross-page references inlined as {@type, @id, name, url}, no areaServed or image on centres, Event location {name: org.name, address: verified PostalAddress}. Replace the CORE stub components (each checks isSearchLive, renders JsonLdScript or null); BreadcrumbJsonLd takes the hero's crumbs/homeLabel/homeHref and uses crumbTrail; CentreJsonLd takes the resolved NAP object and refuses any field whose source is not verified. Test-event adapter src/lib/seo/sources/test-events.ts: openTestSlotsForMarkup(now) and nextTestAtCentre(slug, now), guarded by sqlite_master, returning [] or null without Phase 2. Write all 5.D tests incl. a recursive check that no output contains aggregateRating or review and that no @id contains /hi/. Run: npx vitest run src/lib/seo/facts src/lib/seo/jsonld src/lib/seo/sources src/components/seo/jsonld src/app/api/admin/seo/facts src/app/api/admin/seo/events --maxWorkers=1; eslint on touched files; one npx tsc --noEmit.",
    "acceptance": [
      "Saving any fact resets it to not verified; verify needs confirm:true and a super admin; stale versions get 409",
      "Builders omit every unverified or absent property and return null when a required one is missing",
      "No builder output anywhere contains aggregateRating or review; no @id contains a /hi/ segment; cross-page references carry @type, @id, name and url",
      "LocalBusiness uses the brand name, the full verified PostalAddress, geo, telephone, openingHoursSpecification and hasMap only when verified, and never image or areaServed",
      "ItemList is emitted only for 3 or more published programs; FAQ uses only the passed array; BreadcrumbList equals the hero crumbs",
      "Event is emitted only for an open event, an active confirmed slot and a centre with a verified address; startDate carries +05:30; location.name is the brand, never the typed venue",
      "Without Phase 2 tables, the adapters return empty results",
      "Suggestions never verify anything; the consistency panel lists differences incl. the footer and Contact page details",
      "Components render nothing unless live; JsonLdScript escapes </script>",
      "vitest (listed paths), one tsc and eslint green"
    ]
  },
  {
    "key": "SEO-SHARE",
    "title": "Share images (/og) with no remote fetches, social profiles page, WhatsApp share texts and public ShareLinks",
    "dependsOn": ["SEO-CORE"],
    "owns": [
      "src/app/og/[kind]/[file]/route.tsx",
      "src/app/og/og-route.test.ts",
      "src/lib/seo/share/**",
      "src/lib/seo/repo/share-texts.ts",
      "src/components/seo/ShareLinks.tsx",
      "src/components/seo/ShareLinksClient.tsx",
      "src/components/seo/share-links.test.ts",
      "src/app/api/admin/seo/share-texts/**",
      "src/app/[lang]/(portal)/admin/search/social/**",
      "src/components/seo/console/social/**"
    ],
    "task": "Read docs/seo-golive-plan.md sections 0, 4, 5.C, 5.H, 6, 8 and the SEO-CORE report; read node_modules/next/dist/docs on image-response and route handlers, and src/app/api/predictor/card/route.tsx as the template. Build GET /og/[kind]/[file] exactly as 5.C: kind enum and file regex, data only from lookups by key (never searchParams, never request values in SVG), 404 for unknown or invisible entities, admin-only with private no-store when not live, public when live, X-Robots-Tag noindex, ImageResponse 1200x630 with the predictor palette and ONLY the Geist font bundled with next/og (no font file added), every text field through CORE cardText (null fields dropped; unusable title falls back to the site card text) so @vercel/og never fetches Google Fonts or twemoji, flat templates for site, page, program, centre, article and test (announcement returns null via a getAnnouncementForShare stub), length-stepped fonts, an 8-hex version from SHA-256 of the inputs, immutable caching when the version matches and max-age=300 otherwise, a globalThis LRU of 32 entries and 4 MB, and 20 cache misses per minute per IP via getClientIp (in-memory key only, never stored or logged). Replace the CORE stubs shareImageFor (always the English card URL, also on Hindi pages) and shareCardForPage. Share texts: service, repo, seed drafts of 5.H (INSERT OR IGNORE), slot fill with {link} required, claim warnings, approve (editing returns to draft), tagged links utm_source=whatsapp&utm_medium=social&utm_campaign=share-<key>&utm_content=<slug>, cached approved-text reader tagged seo:share, API of 7.2. Console /admin/search/social: social profiles (via the facts API, same verify flow), share texts editor and preview, staff Copy / Open WhatsApp disabled before launch with the note. Replace the ShareLinks stub (renders only when live and an approved text exists; Hindi without an approved text shows Copy link only; aria-live copy feedback). Tests per 5.C and 5.H incl. a 300 KB bound per template with the longest text and a spy proving globalThis.fetch is never called while rendering any template with Devanagari, emoji and typographic punctuation in the inputs. Run: npx vitest run src/app/og src/lib/seo/share src/components/seo/share-links.test.ts src/app/api/admin/seo/share-texts --maxWorkers=1; eslint; one npx tsc --noEmit.",
    "acceptance": [
      "/og cards render 1200x630 PNG of 300 KB or less for every template with the longest allowed text",
      "globalThis.fetch is never called during any card render, whatever the stored text contains",
      "No request value other than the validated kind and key reaches rendering; searchParams are never read",
      "When not live, signed-out requests get 404 and admins get private no-store; when live the route is public with the versioned cache headers",
      "LRU respects 32 entries / 4 MB; cache misses are limited per IP without storing the IP",
      "Hindi pages use the English card URL",
      "Share texts need {link}, warn on claim words, and only approved texts are used; editing returns to draft",
      "Tagged links carry the utm tags while canonical and og:url stay clean",
      "ShareLinks renders nothing unless live and approved; copy feedback is announced",
      "vitest (listed paths), one tsc and eslint green"
    ]
  },
  {
    "key": "SEO-ROUTING",
    "title": "Proxy: request-host guard, SEO step with its own sqlite handle, 301 redirect map active in basic and live, counters with flush; old-site seeds; redirects console and API; build gate",
    "dependsOn": ["SEO-CORE"],
    "owns": [
      "src/proxy.ts",
      "src/proxy.test.ts",
      "src/lib/seo/proxy/db.ts",
      "src/lib/seo/proxy/host-guard.ts",
      "src/lib/seo/proxy/state.ts",
      "src/lib/seo/proxy/step.ts",
      "src/lib/seo/proxy/flush.ts",
      "src/lib/seo/proxy/proxy-step.test.ts",
      "src/lib/seo/redirects/validate.ts",
      "src/lib/seo/redirects/service.ts",
      "src/lib/seo/redirects/seeds.ts",
      "src/lib/seo/redirects/csv.ts",
      "src/lib/seo/redirects/redirects.test.ts",
      "src/lib/seo/repo/redirects.ts",
      "src/lib/seo/repo/counters.ts",
      "src/lib/seo/repo/proxy-state.ts",
      "src/app/api/admin/seo/redirects/**",
      "src/app/[lang]/(portal)/admin/search/redirects/**",
      "src/components/seo/console/redirects/**",
      "src/app/[lang]/(site)/[...missing]/page.tsx (Plan B only, if the build gate fails)"
    ],
    "task": "Read docs/seo-golive-plan.md sections 0, 2, 4, 5.G incl. G.1, 5.F (counting interface), 6, 8 and the SEO-CORE report; read node_modules/next/dist/docs on proxy (Node runtime, NextFetchEvent/waitUntil), 02-guides/redirecting.md and next-config-js/skipTrailingSlashRedirect.md. Edit src/proxy.ts per 5.G: signature proxy(request, event?: NextFetchEvent); the existing body moves unchanged into an inner route(request); after the preview gate: markProxySeen, hostGuard (only when searchPrerequisites().open: non-production request host -> X-Robots-Tag noindex,nofollow on the response and ROBOTS_TXT_DISALLOW_ALL for /robots.txt; no database), then seoProxyStep, then route. proxy/db.ts: lazily opened node:sqlite DatabaseSync on the resolveDbPath file (logic repeated, equality test), no server-only import, no schema run, busy_timeout 50, test seam setProxyDbForTests. step.ts: cheap exit with no database access when not open or packDisabled; ensureFresh (60 s TTL or invalidated) via state.ts and repo/proxy-state.ts into the CORE registry with buildRedirectTable; fail open on load errors (retry after 60 s); for eligible GET/HEAD paths (not reserved, private, api, _next, og, go, robots, sitemap, llms, .well-known) matchRedirect -> NextResponse.redirect(clone of request.nextUrl with path and search, 301) with Cache-Control public max-age=3600 in basic AND live, redirect hit counted, prefetch not counted; live only: classifyCrawler (CORE stub, real in SEO-CRAWLERS; no IP passed) into the pending map (2,000-key cap, fixed overflow code); flush.ts every 60 s or more via event.waitUntil (skipped without an event) in one BEGIN IMMEDIATE transaction (INSERT ... ON CONFLICT DO UPDATE), skip and keep the maps on SQLITE_BUSY, daily prune older than 400 days; export flushSeoCounters. Redirect service: validate.ts per 5.G (isSafeInternalPath on both sides, no chains incl. next.config /faculty sources, no loops, reserved paths, live-page shadowing as an error incl. prefix coverage, caps), redirectShadows(path) export, seeds.ts with exactly the 108 rows of G.1 (status suggested, origin seed, seed_group, INSERT OR IGNORE), csv.ts import preview with flattening, group accept, audit seo.redirect_*, invalidateSeoProxyState on every write. API of 7.2 and console /admin/search/redirects (list with hits and Hides-a-live-page chips, suggestions banner, group accept, add, import, Test a URL in any mode, off and delete with the one-year confirm). Tests per 5.G; keep every existing proxy.test.ts case unchanged and add the SEO step and host-guard cases. Run: npx vitest run src/proxy.test.ts src/lib/seo/proxy src/lib/seo/redirects src/app/api/admin/seo/redirects --maxWorkers=1; eslint; one npx tsc --noEmit. BUILD GATE: ask the orchestrator for one off-PC CI build (or, if no CI exists yet, one server docker build with no container swap); if the proxy bundle cannot load node:sqlite, switch to Plan B of 5.G (catch-all page with permanentRedirect, counting dropped) and report which plan shipped.",
    "acceptance": [
      "In hidden mode the proxy returns before any database access (spied) and every existing proxy test passes unchanged with proxy(request)",
      "Open + non-production request host: every response carries X-Robots-Tag noindex,nofollow and /robots.txt is Disallow: /; production host: no header",
      "In basic and live, an active exact or prefix rule returns a 301 whose Location has the request's own origin, with the query kept; private, reserved, api, og, go, robots, sitemap and llms paths are never redirected",
      "Every open-redirect case of 5.G is refused on save and import and dropped on load",
      "Validation refuses chains (incl. /faculty), loops, reserved and private sources, and sources (exact or prefix) that shadow live pages",
      "seeds.ts holds exactly the 108 rows of G.1, loads idempotently as suggested, stores no testimonial slug, and every target passes validation",
      "Counting happens only in live mode; counters are flushed at most every 60 s in one BEGIN IMMEDIATE transaction; busy skips keep the maps; the pending-key cap holds; prefetch is not counted; no event means no flush",
      "A database error in the proxy fails open (no redirect, no counting, no error page)",
      "Every redirect write invalidates the proxy registry and is audited",
      "The build gate passed, or Plan B shipped and is reported",
      "vitest (listed paths), one tsc and eslint green"
    ]
  },
  {
    "key": "SEO-META",
    "title": "Page titles, descriptions and share previews console, and wiring withSeo plus JSON-LD and ShareLinks into every public page",
    "dependsOn": ["SEO-FACTS", "SEO-SHARE"],
    "owns": [
      "src/lib/seo/page-meta/**",
      "src/lib/seo/repo/page-meta.ts",
      "src/app/api/admin/seo/pages/**",
      "src/app/[lang]/(portal)/admin/search/pages/**",
      "src/components/seo/console/pages/**",
      "src/app/[lang]/(site)/page.tsx",
      "src/app/[lang]/(site)/about/page.tsx",
      "src/app/[lang]/(site)/admissions/page.tsx",
      "src/app/[lang]/(site)/programs/page.tsx",
      "src/app/[lang]/(site)/programs/[slug]/page.tsx",
      "src/app/[lang]/(site)/results/page.tsx",
      "src/app/[lang]/(site)/hostels/page.tsx",
      "src/app/[lang]/(site)/resources/page.tsx",
      "src/app/[lang]/(site)/resources/[slug]/page.tsx",
      "src/app/[lang]/(site)/contact/page.tsx",
      "src/app/[lang]/(site)/privacy/page.tsx",
      "src/app/[lang]/(site)/terms/page.tsx",
      "src/app/[lang]/(site)/rancho/page.tsx",
      "src/app/[lang]/(site)/tools/page.tsx",
      "src/app/[lang]/(site)/tools/ask/page.tsx",
      "src/app/[lang]/(site)/tools/predictor/page.tsx (metadata wrapper and breadcrumb only)",
      "src/app/[lang]/(site)/tools/planner/page.tsx (metadata wrapper and breadcrumb only)",
      "src/app/[lang]/(site)/tools/mock-tests/page.tsx",
      "src/app/[lang]/(site)/tools/mock-tests/leaderboard/page.tsx",
      "src/app/[lang]/(site)/tools/mock-tests/exam/[slot]/page.tsx",
      "src/app/[lang]/(site)/scholarship-test/page.tsx (only if Phase 2 shipped; metadata wrapper, breadcrumb, TestEventsJsonLd inside its Suspense)",
      "src/app/[lang]/(site)/seo-wiring.test.ts"
    ],
    "task": "Read docs/seo-golive-plan.md sections 0, 4, 5.B, 5.D (placement table), 5.H (ShareLinks placement), 6, 8, 9 and the SEO-CORE, SEO-FACTS and SEO-SHARE reports; read node_modules/next/dist/docs on generate-metadata (With Cache Components) and json-ld. Build the page-meta service and repo (save and reset, no history table, optimistic version, audit seo.page_meta_save/_reset, revalidateTag seo:meta:<pageKey>; text trimmed and whitespace-collapsed, control characters and angle brackets refused; pageKey must be a static key or an existing slug) and the API of 7.2. Console /admin/search/pages: list over allPageRefs x en/hi with chips from warnings.ts (missing, using default, too long, too short, used on another page, claim words, card uses default title, Hindi not translated), filters, and an editor with LengthHint counters, a Google preview (canvas measureText, 600 px title and 920 px description in Arial), a WhatsApp preview (card image from /og, two-line title, about 80-character description) and reset. Then wire every page in the owns list per the 5.B wiring table: generateMetadata returns withSeo(base, ref, { locale, path }) (predictor with image: 'keep'); hoist each page's hero crumbs/homeLabel/homeHref into one constant passed to both the hero and BreadcrumbJsonLd, and add BreadcrumbJsonLd only where a hero breadcrumb is rendered; place every JSON-LD component outside any PageLayoutFrame slot; pass the exact data the page renders (FAQ array on admissions, programs list on /programs, the program or article object on detail pages); add ShareLinks on program and article detail pages. Re-read each page file before editing; if a page is mid-edit by another stream, stop and report. Do not touch login, forgot-password, mock-test attempt/result/report/certificate/verify, links, or centres/**. Tests per 5.B plus a wiring test: for each wired page in mocked live mode, metadata has an absolute query-free og:url, summary_large_image, siteName and locale; in hidden and basic modes metadata strictly equals the pre-change output; breadcrumb JSON-LD equals the rendered crumbs; exactly one JSON-LD script per type under a reordered page layout. Run: npx vitest run src/lib/seo/page-meta src/app/api/admin/seo/pages src/app/[lang]/(site)/seo-wiring.test.ts --maxWorkers=1 plus any existing page suites touched; eslint; one npx tsc --noEmit.",
    "acceptance": [
      "Every page in the wiring table calls withSeo and renders its JSON-LD components with the page's own data, outside PageLayoutFrame slots",
      "BreadcrumbList appears only on pages with a visible hero breadcrumb and equals it",
      "In hidden and basic modes, every wired page's metadata and markup is unchanged from before",
      "In live mode, every wired page has full openGraph incl. siteName and locale, a clean og:url, og:title without branding, and a 1200x630 image; an invisible article keeps only its not-found title",
      "Overrides apply only in live mode; reset works; one page's save revalidates only that page's meta tag",
      "Warnings follow the thresholds incl. Devanagari grapheme counts, Hindi claim words and the card-text warning; warnings never block saving",
      "Previews render with text alternatives; only super admins can save",
      "vitest (listed paths), one tsc and eslint green"
    ]
  },
  {
    "key": "SEO-CENTRES",
    "title": "Centre pages per town with one resolved NAP for hero, page and markup, enquiry form preset, centres directory links, local results gate, Google Business Profile console",
    "dependsOn": ["SEO-FACTS", "SEO-SHARE"],
    "owns": [
      "src/app/[lang]/(site)/centres/[slug]/page.tsx",
      "src/app/[lang]/(site)/centres/page.tsx",
      "src/components/centres/page/**",
      "src/components/centres/CentreDirectory.tsx (card link to the centre page only)",
      "src/lib/seo/centres/**",
      "src/components/forms/EnquiryForm.tsx (additive defaultCentre prop and its reset only)",
      "src/components/forms/HeroEnquiryForm.tsx (additive defaultCentre prop only)",
      "the existing forms test suite covering EnquiryForm (grep; defaultCentre cases only)",
      "src/i18n/messages/en/centres.ts (page.* keys)",
      "src/i18n/messages/hi/centres.ts (page.* keys)",
      "src/app/[lang]/(portal)/admin/search/centres/**",
      "src/components/seo/console/centres/**"
    ],
    "task": "Read docs/seo-golive-plan.md sections 0, 4, 5.E, 5.D (CentreJsonLd and the test-event adapter), 6, 8, 9 and the SEO-CORE, SEO-FACTS and SEO-SHARE reports; read src/components/hero/README.md (centre page = hero E), src/components/hero/finder-data.ts and node_modules/next/dist/docs on dynamic routes, generateStaticParams with Cache Components, connection and Suspense. Build src/lib/seo/centres/nap.ts centreNap exactly per 5.E (verified facts, then published content, then demo with labels; mapsUrl only verified via safeDirectionsUrl; town = verified displayName else the first word of the content name; services label from programs). Build /centres/[slug] per 5.E: generateStaticParams from getCentreSlugs, notFound for invisible centres, hero E with defaultDistrict and actions call and directions where the finder's copy of this centre has phone, address and directionsUrl replaced by the resolved NAP, h1 page.heading, the sections in order (never head), next test (Suspense + connection via nextTestAtCentre), local results (Suspense + connection; production requires canShowStudentName AND resultDisclosure, a stub returning null in src/lib/seo/centres/results.ts; demo shows the notice with no names), EnquiryForm variant='admissions' with centreOptions and defaultCentre, ShareLinks textKey centre, other centres, CentreJsonLd with the same NAP object and BreadcrumbJsonLd with the hero crumbs (both outside any layout slot), metadata via withSeo with page.metaTitle ('{services} coaching in {town}') or page.metaTitleFallback and page.metaDescription. Add the optional defaultCentre prop to EnquiryForm and HeroEnquiryForm (select defaultValue and initial centreChoice when it matches an option; after a successful submit reset centreChoice to defaultCentre ?? 'not-sure'; otherwise unchanged). centres/page.tsx: finder pageHref to /centres/<slug>, withSeo, BreadcrumbJsonLd; CentreDirectory cards gain 'See centre page' while #slug anchors stay. Messages page.* in en and hi exactly as the 5.E table (report Hindi lines). Console /admin/search/centres: per-centre cards with page status, facts completeness, structured-data status, the tagged GBP link with copy and the domain warning, and the 11-item checklist stored through the CORE settings API key gbp. Tests per 5.E. Run: npx vitest run src/lib/seo/centres src/components/centres src/app/[lang]/(site)/centres <forms suite> --maxWorkers=1; eslint; one npx tsc --noEmit.",
    "acceptance": [
      "/centres/<slug> is statically generated for every slug; invisible centres 404; both locales render",
      "The hero finder card, the Visit section and CentreJsonLd use the same resolved NAP; the map link appears only when verified; head is never rendered",
      "Titles follow '{services} coaching in {town}' with the fallback, and stay within 60 characters with the suffix for the four centres",
      "In production no result appears without consent and a disclosure; in demo no student name appears",
      "The admissions-variant enquiry form preselects the centre via defaultCentre, returns to it after a successful submit, and is unchanged without the prop",
      "The directory links to centre pages while #slug anchors still resolve",
      "The GBP link uses utm_source=google&utm_medium=gbp&utm_campaign=gbp-<slug>; only super admins tick the checklist",
      "Headings, address element, link names and new-tab labels meet section 9",
      "vitest (listed paths), one tsc and eslint green"
    ]
  },
  {
    "key": "SEO-CRAWLERS",
    "title": "Crawler policy console, robots preview, verification codes, user-agent classification (no IP), visits table, llms.txt",
    "dependsOn": ["SEO-ROUTING"],
    "owns": [
      "src/lib/seo/crawlers/classify.ts",
      "src/lib/seo/crawlers/report.ts",
      "src/lib/seo/crawlers/crawlers.test.ts",
      "src/lib/seo/repo/crawlers.ts",
      "src/lib/seo/llms.ts",
      "src/app/llms.txt/route.ts",
      "src/app/llms.txt/llms.test.ts",
      "src/app/[lang]/(portal)/admin/search/crawlers/**",
      "src/components/seo/console/crawlers/**"
    ],
    "task": "Read docs/seo-golive-plan.md sections 0, 4, 5.F, 6, 8, 9 and the SEO-CORE and SEO-ROUTING reports; read node_modules/next/dist/docs on route handlers and connection. Replace the classify.ts stub per 5.F: classifyCrawler({ userAgent, pathname, redirected }) with one precompiled case-insensitive regex from CRAWLERS (most specific first; Google-Extended and Applebot-Extended never match visits) and the pathGroup derivation; it takes no IP and stores or logs nothing. report.ts and repo/crawlers.ts: 30-day per-bot table (fetches, robots.txt fetches, top page type, last seen, 'Not checked: the name could be faked') and the link-preview row, calling flushSeoCounters first. Console /admin/search/crawlers with the five parts of 5.F: policy form (PUT crawlers via the CORE settings API; sets reviewedAt; note that choices apply from launch day), robots.txt now / after launch code blocks from robotsFor, verification codes (PUT verification; values never audited; the old-site note, no pre-filled code), sitemap counts, visits table (no chart); not-live note 'Counting starts when the switch is on'. /llms.txt route per 5.F: 404 unless live; await connection(); content only from verified facts and published content with markdown links and absolute URLs; no file without a verified org name; text/plain; public max-age=3600. Tests per 5.F incl. a spy proving no user agent appears in stored rows or log calls and a type test that the classifier has no IP parameter. Run: npx vitest run src/lib/seo/crawlers src/app/llms.txt --maxWorkers=1; eslint; one npx tsc --noEmit.",
    "acceptance": [
      "Every crawler in the registry classifies correctly; Google-Extended never counts as a visit; WhatsApp previews count as preview",
      "The classifier takes no IP; no IP or user agent is stored, logged or returned anywhere (spy-tested)",
      "The policy console saves via the settings API, shows both robots.txt previews and the Google-Extended / AI Overviews note",
      "Verification codes are validated, never audited, and never pre-filled",
      "/llms.txt is 404 unless live and, when live, contains only verified and published data with markdown links",
      "The visits table labels counts as fetches, not checked",
      "vitest (listed paths), one tsc and eslint green"
    ]
  },
  {
    "key": "SEO-INTEGRATE",
    "title": "Integrate, document, production-mode smoke in CI, verify in demo mode, deploy switched off",
    "dependsOn": ["SEO-META", "SEO-CENTRES", "SEO-CRAWLERS"],
    "owns": [
      "src/components/portal/console-roadmap.ts",
      "src/i18n/messages/en/portal.ts (admin.coming items only)",
      "src/i18n/messages/hi/portal.ts (admin.coming items only)",
      "src/components/portal/audit-labels.ts (seo.* labels)",
      "src/components/portal/portal-ui.test.ts (roadmap block)",
      "src/app/api/prerender-bailout.test.ts",
      "scripts/seo-smoke.mjs",
      "the existing off-PC CI workflow file (one smoke step)",
      "docs/agent-decisions.md",
      "docs/api.md",
      "docs/content-verification.md",
      "docs/hindi-review-register.md",
      "docs/aspire-approval-checklist.md",
      "deploy/README.md",
      "small fixes in any SEO-owned file, reported per file"
    ],
    "task": "Read docs/seo-golive-plan.md sections 0 and 11-16 and every package report. Confirm that no 4.4 stub remains. Remove the shipped roadmap and coming items (titles, businessFacts, centrePages, crawlers, redirects, social) and list as later: Instagram posts, IndexNow, Hindi share cards, crawler IP verification, crawler visit chart, page-title history; add English seo.* labels of 7.3 to audit-labels.ts; add /og/[kind]/[file] and /llms.txt to the prerender bail-out test; optionally switch 1b's Maps-card tagged link to /centres/<slug> if it is a one-line change. Record D-085 to D-091 (re-grep ids first; renumber only if taken) in agent-decisions.md; add the SEO API section to api.md, the Search facts section to content-verification.md (C1-C4, C6, C7, C30, C41 resolved in the console; the old aspireiit.in site listed as a source), the Hindi lines to hindi-review-register.md, items SEO-1 to SEO-7 to aspire-approval-checklist.md, and the section 16 runbook plus the short-lived-build note of section 8 to deploy/README.md. Run the full vitest --maxWorkers=2, one tsc and eslint; run the off-PC CI next build and check the prerender manifest (all static pages still static; /centres/[slug] for 4 slugs x 2 locales; robots.txt prerendered); add and run the production-mode smoke of section 14 step 3 in CI (standalone server, production env, temporary seeded database, Host-header curls; no deploy). Headless pass on the demo build per section 14 step 4 (one Chrome), Lighthouse mobile on home, a program page and a centre page. Deploy with demo mode on and the switch off; post-deploy checks of section 14 step 5 incl. the Overview's proxy-shared line and the nginx Host header check; keep the current and one rollback image; tag the release.",
    "acceptance": [
      "No stub remains; nav, roadmap and audit labels are complete; the prerender bail-out test covers /og and /llms.txt",
      "Full test suite, tsc and eslint green; CI build green with the prerender manifest as expected",
      "The CI production-mode smoke shows: old trailing-slash URL -> 308 -> 301 to the centre page on Host aspireiit.in; basic robots with /go/; no X-Robots-Tag on the production host; Disallow: / and X-Robots-Tag noindex,nofollow on Host aspire.thechunkmedia.com",
      "On the deployed demo site: robots.txt is Disallow: /, /llms.txt is 404, signed-out /og is 404, no new ld+json on any page, and centre pages render with DEMO labels and no student names",
      "Every /admin/search page opens for admins; editing controls appear only for super admins",
      "The proxy-shared result and the nginx Host header finding are reported",
      "Decisions D-085 to D-091, the api.md section, the verification and Hindi registers, the approval items SEO-1 to SEO-7 and the go-live runbook are recorded",
      "Lighthouse mobile shows no regression against R3 on the three pages",
      "The release is tagged, with the current and one rollback image kept"
    ]
  }
]
```
