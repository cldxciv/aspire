# Public API

Owner: BE. Covers the public route handlers under `src/app/api/` (portal APIs under `/api/admin|student|parent` and `/api/session` are documented in `docs/auth-and-portals.md`).

Implementation: route files in `src/app/api/**/route.ts` stay thin; logic lives in `src/lib/server/**`. Content is read only through `src/lib/data.ts`. Contracts: `src/lib/contracts/api.ts` (envelope, D-007) and `src/lib/contracts/enquiry.ts` (enquiry schema, D-008).

## Conventions

Every response is JSON in the shared envelope, with a matching HTTP status:

```jsonc
{ "ok": true, "data": [ ... ] }                       // ApiList<T>
{ "ok": true, "data": { ... } }                       // ApiItem<T>
{ "ok": false, "error": "<code>", "message": "...", "fieldErrors": { "field": ["..."] } } // ApiError
```

- `Cache-Control: no-store` on every response from these routes.
- Error `message`s are user-safe and never contain internals.
- `error` codes: `bad_request`, `forbidden`, `not_found`, `validation`, `rate_limited`, `server_error` (plus `unauthenticated` / `not_configured` used by portal routes).
- Methods that a route doesn't export get Next.js's automatic `405` (plain, not JSON). `OPTIONS` is answered automatically with an `Allow` header. **No CORS headers are sent by any route**, so other origins can't call them from a browser.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/enquiries` | Validate and forward an enquiry |
| GET | `/api/programs` | List programs (`?exam=`) |
| GET | `/api/programs/[slug]` | One program |
| GET | `/api/centres` | List centres (`?q=&exam=`) |
| GET | `/api/centres/[slug]` | One centre |
| GET | `/api/results` | List published results (`?year=&exam=`) |
| GET | `/api/result-cards/[file]` | One result-card image (webp), same visibility rule as student names (D-031) |
| GET | `/api/health` | Liveness + non-secret config state |
| GET / POST / DELETE | `/api/lead-gate` | Lead gate: status, share contact details once (pass cookie), forget / withdraw ([below](#lead-gate-apilead-gate)) |
| POST | `/api/lead-gate/usage` | Note one use of a browser-only tool on the family's lead |
| GET | `/api/mocktest/papers/readiness` | Exam-pattern mocks: can a paper be made for this slot and language? ([below](#exam-pattern-mock-papers-apimocktestpapers); being built) |
| POST | `/api/mocktest/papers` | Generate a practice paper, or get this month's ranked paper (being built) |
| GET | `/api/mocktest/papers/[id]` | Resume a generated paper (being built) |
| POST | `/api/mocktest/papers/[id]/report` | Report a problem with one question (being built) |
| GET | `/api/qb/figures/[id]` | A figure of an approved question-bank question (being built) |

The Rancho route (`/api/ask`) enforces the lead gate; the mock-test score route (`/api/mocktest/score`) asks for it too, but guests keep attempts in the browser, so it is lead capture rather than access control: see [Lead gate on server-enforced tools](#lead-gate-on-server-enforced-tools).

---

## POST /api/enquiries

Accepts the enquiry forms (the 3-step home page "hero" form, `/admissions`, `/contact`, plus the former single-step home "quick" card, still accepted for pages loaded before the hero form shipped — D-021) and passes valid ones to the configured destination. **The API only answers `received` when a configured destination accepted the enquiry.**

### Request

- `Content-Type: application/json` (an optional `charset` must be `utf-8`).
- Body ≤ **10 KB** (10,240 bytes, counted while streaming as well as from `Content-Length`).
- Must come from this site (see [Origin check](#origin-check-csrf)).
- Body: one of the `enquirySchema` variants, discriminated by `source`:

| Field | hero | admissions | contact | quick | Rules |
|---|---|---|---|---|---|
| `source` | `"hero"` | `"admissions"` | `"contact"` | `"quick"` | required |
| `name` | ✓ | ✓ | ✓ | ✓ | 2–80 chars, trimmed (the student's name except on contact) |
| `classOrExam` | ✓ | – | – | – | one of the 12 values in `HERO_CLASS_EXAM_OPTIONS` (e.g. `jee-class-11`, `neet-dropper`, `foundation-class-9`, `not-sure-class-12`). **Input only:** after validation it is replaced by `currentClass` + `programInterest` (see below) |
| `guardianName` | ✓ | – | – | – | parent/guardian name: 2–80 chars, trimmed (D-021a). Missing, blank or 1 char → "Enter the parent or guardian's name"; > 80 → "Parent or guardian name is too long" |
| `phone` | ✓ | ✓ | ✓ | ✓ | Indian mobile: optional `+91`/`91`/`0`, then 10 digits starting 6–9; spaces/hyphens ignored (`+91 98765 43210` ok) |
| `email` | opt¹ | opt | opt | opt | valid email or `""` |
| `message` | opt | opt | opt | opt | ≤ 1000 chars |
| `consent` | ✓ | ✓ | ✓ | ✓ | must be `true` |
| `consentVersion` | ✓ | ✓ | ✓ | ✓ | id of the consent sentence shown (`CONSENT_VERSIONS`, currently `"2026-10-20.v2"`, D-039). Sent by the forms' hidden input; missing/unknown → 422 (a page from before the change gets "refresh and try again") |
| `context` | opt | opt | opt | opt | attribution only (D-039): `page` (site path ≤ 200), `locale` (`en`/`hi`), `utm_source/medium/campaign/term/content` (≤ 100 each), `tool` (`predictor`/`mock-test`/`ask`/`planner`), `toolExam` + `toolBand` (predictor only, e.g. `jee-main`, `score-180-189`), `referrer` (external host ≤ 100). Each value is validated strictly; an invalid value is **dropped**, never a 422 |
| `website` | opt | opt | opt | opt | **honeypot** — leave empty |
| `currentClass` | (derived) | ✓ | – | ✓ | `class-6-8`, `class-9`, `class-10`, `class-11`, `class-12`, `dropper` |
| `programInterest` | (derived) | ✓ | – | ✓ | `jee`, `neet`, `foundation`, `integrated`, `not-sure` |
| `intent` | – | – | – | opt | `enquiry` (default) or `scholarship` |
| `preferredCentre` | opt | opt | – | – | `"not-sure"`, `""`, or the slug of a centre `getCentres()` currently publishes (enforced server-side; free text or an unpublished centre → 422) |
| `topic` | – | – | ✓ | – | `course-information`, `admissions`, `scholarship`, `centre-information`, `other` |
| `district` | opt | opt | opt | – | lead routing (D-045): one of Himachal's 12 district ids (`bilaspur`, `chamba`, `hamirpur`, `kangra`, `kinnaur`, `kullu`, `lahaul-spiti`, `mandi`, `shimla`, `sirmaur`, `solan`, `una`), `outside-hp`, or `""`. The forms show it while no centre is chosen (hero step 3, admissions, contact). Anything else → 422 "Select a district from the list". The server passes it to the CRM as the family's place, which routes the lead to that district's team |

¹ Accepted by the contract, but the hero form does not ask for an email address (D-021a), so hero enquiries normally arrive without one.

Unknown keys are dropped. For `hero`, any `currentClass` / `programInterest` the client sends is ignored: the pair always comes from `classOrExam`, so a combination that is not offered (e.g. NEET for Class 6–8) can't be submitted.

**Hero form steps.** The contract exports one schema per step (`heroStudentStepSchema`: `name`, `classOrExam`; `heroContactStepSchema`: `guardianName` and `phone` (required), `email` (optional, not rendered by the hero UI); `heroDetailsStepSchema`: `preferredCentre`, `message`, `consent`) plus `validateHeroStep(step, payload)` and `heroStepOfField(field)`. The client validates one step at a time with them and POSTs **once**, at final submit; the server validates the whole `hero` variant. A 422's `fieldErrors` keys are the field names above, so `heroStepOfField(key)` gives the step to return to.

### Processing order

1. Origin / CSRF check → `403`
2. Content type → `415`
3. Per-IP rate limit → `429` (only requests that passed 1–2 count)
4. Body size / UTF-8 → `413` / `400`
5. JSON parse; must be an object → `400`
6. `enquirySchema.safeParse` + `preferredCentre` check → `422`
7. Honeypot (after validation, so bots see exactly what a person would)
8. `ENQUIRY_STORE=crm` (default, D-039): per-mobile-number cap (5 captures / rolling 24 h → `429`) → store as a CRM lead (`src/lib/server/lead-sink.ts` → `captureLead`) **and** forward to the webhook when configured → `201` if either kept it, else `500`.
   `ENQUIRY_STORE=off`: destination only, as before → `200` / `201` / `500`.

### Responses

| Status | Body | When |
|---|---|---|
| 201 | `{ ok: true, status: "received", reference: "ENQ-XXXXXXXXXX", message }` | Stored as a CRM lead and/or the webhook returned 2xx. After a **stored** lead (not honeypot, not capped, not a store failure) it also carries `Set-Cookie: aspire_tool_pass=…` unless the lead gate is off or the browser already holds a signed pass: the free tools then open in this browser without asking. That pass keeps the enquiry's consent version and never notes tool use. Body unchanged. |
| 200 | `{ ok: true, status: "not_configured", message }` | Valid, but the store is off and no destination is configured — **nothing was sent or stored**. The UI must say so. |
| 400 | `bad_request` | Malformed JSON, non-object body, invalid UTF-8, invalid `Content-Length` |
| 403 | `forbidden` | Failed origin check |
| 413 | `bad_request` | Body over 10 KB |
| 415 | `bad_request` | `Content-Type` is not `application/json` |
| 422 | `validation` + `fieldErrors` | Schema errors (`z.flattenError(...).fieldErrors`), e.g. `{ "phone": ["Enter a valid 10-digit mobile number"] }` |
| 429 | `rate_limited` + `Retry-After: <seconds>` header | More than 5 requests from this IP in 10 minutes, or (store on) more than 5 captures for one mobile number in 24 hours |
| 500 | `server_error` | Neither the lead store nor the webhook kept it (store failure and no/failed webhook; webhook failure with the store off) or an unexpected error. Message says nothing was submitted. |

`413` and `415` reuse the `bad_request` code because the frozen `ApiErrorCode` union has no dedicated codes; clients should branch on the HTTP status.

`reference` is `ENQ-` plus 10 random Crockford-base32 characters (no I/L/O/U). It is random, so it reveals nothing about volume.

### Origin check (CSRF)

`src/lib/server/request-guards.ts → checkSameOrigin` (deny by default):

- `Origin` present: it must equal the request's own host (`X-Forwarded-Host`, else `Host`, compared without the scheme so TLS-terminating proxies work) **or** the origin of `NEXT_PUBLIC_SITE_URL`. `Origin: null`, malformed and non-http(s) origins are rejected.
- `Origin` absent: `Sec-Fetch-Site` must be `same-origin` or `none`.
- Neither header: rejected. All current browsers send `Origin` on POST, so this only blocks non-browser clients that don't identify an origin.
- `Sec-Fetch-Site: cross-site` is always rejected.

Together with the JSON-only content type (cross-origin JSON needs a CORS preflight, and no CORS headers are sent), this blocks cross-site form posts and `fetch` calls.

### Rate limiting

`src/lib/server/rate-limit.ts`: an in-memory sliding-window log, **5 requests per client IP per rolling 10 minutes**. Only allowed requests are recorded, so `Retry-After` is exact and a blocked client can't extend its own block. Memory is bounded (10,000 keys, least-recently-used eviction, and expired keys are swept).

- **Single instance only.** Each server process or serverless instance has its own counters, which reset on restart or cold start. A shared store (e.g. Redis/Upstash) is needed before multi-instance hosting.
- Client IP = first `X-Forwarded-For` hop, then `X-Real-IP`, else the shared bucket `"unknown"`. The first hop is only trustworthy when the hosting proxy **overwrites** `X-Forwarded-For` (Vercel does). Behind a proxy that appends, clients can rotate fake IPs. `next start` without a proxy fills it from the socket only when the header is absent.
- The IP is used only as an in-memory key. It is never logged or forwarded.

### Honeypot

The forms render a visually hidden `website` input. If it is non-empty after validation, the API returns exactly what a genuine submission would get for the current configuration (`200 not_configured`, or `201 received` with a fresh reference in webhook mode), but **nothing is forwarded**. The log records outcome `honeypot`. Known trade-off: a person whose browser autofills the hidden field would see a success message although nothing was sent. The field uses `autocomplete="off"`, `tabindex="-1"` and `aria-hidden` to make that unlikely.

### Lead store (ENQUIRY_STORE, D-039)

`ENQUIRY_STORE` (read per request): unset / `crm` → every valid, non-honeypot enquiry becomes (or is appended to) a CRM lead with its consent version, language, text and time (`src/lib/server/enquiry-consent.ts`) and the validated `context`; `off` / `none` → previous behaviour; any other value → off plus config warning `enquiry_store_unknown`. A store failure is logged as `store_<code>` and never hidden: the response is `received` only if the webhook took it instead. Log entries add `store` (`stored`/`duplicate`/`failed`) and `forward` (`sent`/`failed`/`none`); outcome `phone_rate_limited` for the per-phone cap (keys are hashes; numbers are never kept or logged).

### Destinations

Selected by `ENQUIRY_DESTINATION` at request time (`src/lib/server/env.ts`, adapters in `src/lib/server/destinations/`):

| Value | Behaviour |
|---|---|
| unset, `""`, `none` | Validate only. Responds `200 not_configured`. Nothing is sent or stored. |
| `webhook` | POST to `ENQUIRY_WEBHOOK_URL`, signed with `ENQUIRY_WEBHOOK_SECRET`. |
| anything else | Treated as `none`; logs config warning `enquiry_destination_unknown`. |

The webhook falls back to `none` (still `200 not_configured`, plus a one-time `config` warning in the log) when the URL is missing or invalid, contains credentials, or is not `https:` (plain `http://localhost` is allowed outside production), or when the secret is missing or shorter than 16 characters. The site therefore never claims receipt when it couldn't deliver.

#### Webhook request

```http
POST <ENQUIRY_WEBHOOK_URL>
Content-Type: application/json; charset=utf-8
User-Agent: AspireWeb-Enquiries/1
X-Aspire-Signature-256: sha256=<hex HMAC-SHA256(secret, raw body)>
X-Aspire-Enquiry-Reference: ENQ-XXXXXXXXXX
```

```json
{
  "reference": "ENQ-7K3M9Q2XWD",
  "receivedAt": "2026-10-19T10:00:00.000Z",
  "consentAt": "2026-10-19T10:00:00.000Z",
  "enquiry": {
    "source": "admissions",
    "name": "…",
    "phone": "+919876543210",
    "email": "…",
    "consent": true,
    "currentClass": "class-11",
    "programInterest": "jee",
    "preferredCentre": "shimla",
    "message": "…"
  }
}
```

- `enquiry` is the validated, normalised enquiry: the phone has its spaces and hyphens stripped, `intent` defaults to `enquiry` (quick only), and the honeypot and empty optional fields are removed. For `hero`, `classOrExam` is replaced by `currentClass` + `programInterest`, so every source that asks about class and program forwards the same two fields.

Hero example (`enquiry` only; the envelope is identical):

```json
{
  "source": "hero",
  "name": "…",
  "guardianName": "…",
  "phone": "+919876543210",
  "preferredCentre": "not-sure",
  "message": "…",
  "consent": true,
  "currentClass": "dropper",
  "programInterest": "neet"
}
```

**Payload changes** (the envelope, signature scheme and `User-Agent: AspireWeb-Enquiries/1` are unchanged; all changes are additive):

| Date | Change |
|---|---|
| 2026-10-20 (D-021, D-021a) | New `source` value `"hero"`; new key `guardianName` (hero only, always present for hero). Hero enquiries carry `currentClass` + `programInterest` like quick/admissions, never `classOrExam`, and normally no `email`. |
| 2026-10-20 (D-039) | New top-level keys `consentVersion` (always) and `context` (validated attribution, only when non-empty). The `enquiry` object is unchanged (it never contains them). |
- `consentAt` is the server time of the submission. The schema requires `consent: true`.
- Any **2xx** means accepted (→ `201 received`). Any other status, a redirect (redirects are **not followed**), a network error or more than **8 s** → `500 server_error`. There are no retries, because the visitor is waiting for the response.

#### Verifying the signature (receiver side)

Sign and compare over the **exact raw body bytes** before parsing:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

function isValidSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
```

Receiver recommendations:

- Reject a `receivedAt` older than ~5 minutes, to limit replay.
- Deduplicate on `reference`.
- Respond 2xx only after the enquiry is durably stored.
- Treat all fields as untrusted text. If they land in a spreadsheet, neutralise values starting with `=`, `+`, `-` or `@` (formula injection).
- Treat `source` as an open set and ignore keys you don't recognise: new form variants and optional fields are added without a version bump (see "Payload changes").

### Logging

`src/lib/server/logger.ts` writes one JSON line per request:

```json
{"ts":"…","level":"info","event":"enquiry","outcome":"received","durationMs":412,"reference":"ENQ-…","source":"quick"}
```

- Allowed fields: `outcome`, `durationMs`, `reference`, `source` and a short `reason` code (for example `origin_mismatch`, `invalid_json`, `timeout`, `http_503`, `exception_TypeError`).
- Never logged: name, parent/guardian name, phone, email, message, IP address, request body, webhook URL or secret, or any `Error.message` (JSON and fetch errors can echo input or URLs).
- Config warnings are logged once per process: `{"event":"config","code":"enquiry_webhook_secret_missing"}`.

---

## GET /api/programs

`?exam=JEE|NEET|Foundation|Integrated` (optional, case-insensitive).

- `200` `ApiList<Program>` (`src/lib/types.ts`).
- `400 bad_request` with `fieldErrors` for an invalid or repeated `exam`.

An empty parameter (`?exam=`) is treated as absent. Unknown parameters are ignored.

## GET /api/programs/[slug]

- `200` `ApiItem<Program>`
- `404 not_found` for unknown, unpublished or malformed slugs.

## GET /api/centres

- `?q=` (optional, ≤ 100 chars) matches name or district, case-insensitive.
- `?exam=` (optional) filters on the exams a centre offers.
- `200` `ApiList<Centre>`; `400` on invalid parameters.

Placeholder centres currently list no programs, so any `exam` filter returns `[]` until verified data exists.

## GET /api/centres/[slug]

- `200` `ApiItem<Centre>`
- `404 not_found`

## GET /api/results

- `?year=YYYY` (optional, 2000–2100).
- `?exam=` (optional).
- `200` `ApiList<PublicResult>`; `400` on invalid parameters.

Only records `getResults()` publishes are returned: published, and consent not pending. On top of that, `studentDisplayName` is included **only** when `consentStatus === "granted"`, and the internal `verifiedBy` field is never exposed. Results content is intentionally empty for now (D-009), so the response is `{ ok: true, data: [] }`.

`photo` (a result-card image) is part of the same consent whitelist as the name: it appears only with `granted` consent, never for placeholder records with pending consent, even in preview.

## GET /api/result-cards/[file]

- `file`: `ranker-<id>.webp` (anything else is a `404`).
- `200` `image/webp`, `Cache-Control: private, max-age=3600`, `X-Robots-Tag: noindex, nofollow, noimageindex`; otherwise the JSON `404` envelope (`not_found`).

Serves the result cards in `private/result-cards/` (D-031: a student's photo, college and name — personal data). A file is served only while a visible record whose name may be shown carries it (`canServeResultCard()` → `canShowStudentName()`): in development / preview with placeholder content, or with `granted` consent. **In production every card is a `404`** while the imported records are placeholders with pending consent; an unknown and a hidden file look the same. Request time only (`connection()`). Behind the preview password gate like every `/api` route (D-027). Components load it with `next/image` `unoptimized`, so no optimised copy is cached under `/_next/image`.

## GET /api/health

```json
{ "ok": true, "data": { "status": "ok", "time": "2026-10-19T10:00:00.000Z", "enquiries": "not_configured", "placeholderContent": false } }
```

`enquiries` is `connected` when a valid webhook destination is configured, otherwise `not_configured`. Server components can get the same status word with `getEnquiryDeliveryStatus()` (`src/lib/server/env.ts`; never returns the URL or secret). A prerendered page reads it at build time, so it can be stale after an environment change — forms must still branch on the actual API response. `placeholderContent` mirrors `showPlaceholderContent()`; it should be `false` in production. The response never includes URLs, secrets or versions.

---

## Lead gate (`/api/lead-gate`)

Contact details once per browser before a free tool's result (D-043; design and full contract: `docs/lead-gate-plan.md` §5). **Owner decision 21 Oct 2026: `LEAD_GATE=required` on the live site now, although it shows sample data**; the form says so (GET `sample`). Code: `src/lib/lead-gate/**` (contract `contract.ts`, client-safe), routes `src/app/api/lead-gate/**`, client kit `src/components/lead-gate/**`.

Every response: D-007 envelope, `Cache-Control: no-store`, `X-Robots-Tag: noindex`. Every write is same-origin only (403). Logs carry fixed codes only: never the name, phone, IP, token, pass hash, lead id, context or body. Limiters are in memory (single instance) and key IPv6 addresses by /64.

**Cookie `aspire_tool_pass`.** HttpOnly, SameSite=Lax, Path=/, Secure in production, Max-Age 180 days, fixed expiry. Value `lg1.<passId>.<expiresAtSeconds>.<sig>` (HMAC-SHA256 with `LEAD_GATE_SECRET`). The server stores only SHA-256(passId) in `crm_gate_passes`. A stolen cookie can only unlock tools and add tool-use notes to that lead; it reveals nothing. Cleared by "Not you?" (DELETE), withdrawal, sign-out (`/api/auth/logout`), erase, expiry, a retired consent version or a rotated secret.

**Access order** (`resolveLeadGateAccess`, request time only; **owner decision 22 Oct 2026**): gate off → open (`via: "off"`); a signed-in **student or parent account with a mobile number on file** → open (`session`, nothing stored); live pass → open (`pass`, signed in or not); else locked. Being signed in does not open the gate by itself: **staff and admins always get the visitor's form**, and accounts have no phone field yet (`accountMobileOnFile()` is false), so today **every student and parent is asked once too**, with the name pre-filled. `required` degrades to `optional` while the flood breaker is tripped.

### GET /api/lead-gate → 200

`{ ok: true, data: { mode: "off" | "optional" | "required", unlocked, via: "off" | "session" | "pass" | null, recordsUse, expiresAt: ISO | null, sample, prefill } }`. `sample` = results currently come from sample data (the form then shows `leadGate.sampleData`). `prefill` = `{ studentName: string | null, submittedBy: "student" | "parent" } | null`: only for a signed-in student or parent account that is asked (a student's own name; a parent's linked learner when exactly one is linked; the account's role), else null (guests, staff, admins, gate off, accounts let through). It is the account's own data to its own browser; no lead field is ever returned. 429 at 600 / 10 min per IP bucket; 500. Re-issues a refreshed session cookie and clears a dead pass cookie.

### POST /api/lead-gate (≤ 4 KB)

Body: `{ studentName (2–80), phone (Indian mobile, implausible numbers refused), currentClass (class-6-8 … dropper), submittedBy: "student" | "parent", consent: true, consentVersion: "2026-10-21.gate.v1", tool: "predictor" | "mock-test" | "ask" | "planner", context?: { page, locale, utm_*, referrer, toolExam, toolBand }, website? }` (`website` = honeypot).

| Status | When |
|---|---|
| 403 | Cross-origin |
| 200 `{ unlocked: true, via: "off" \| "session" }` | Gate off, or a student / parent account with a mobile on file (none yet): nothing stored, body not read. Signed-in staff and admins continue like visitors |
| 429 | 60 / 10 min per IP bucket; or the per-number cap (5 new submissions / 24 h) when that number has no lead yet (`X-Lead-Gate-Limit: phone`) |
| 415 / 413 / 400 / 422 | Content type, size, JSON, schema (`fieldErrors`; a `consentVersion` error means a stale page) |
| 201 | Honeypot: the normal body and a cookie that never works; nothing stored |
| 503 `not_configured` | Flood breaker (`LEAD_GATE_MAX_NEW_LEADS_PER_HOUR`, default 300): "Sharing details is paused right now. Nothing was saved." The gate is optional meanwhile |
| 201 `{ unlocked: true, via: "pass", recordsUse, expiresAt }` + `Set-Cookie` | Captured as a CRM lead (source `tool`, dedupe by number, consent text from the server registry) and a pass, in one transaction; this browser's previous pass revoked. Past the per-number cap the pass binds to the existing lead without a new submission. **Byte-identical for a new and an existing family; never names anyone** |
| 500 | Store failure: "We couldn't save your details. Nothing was saved. Please try again." No cookie |

An existing lead is never reopened, re-assigned or given a weaker consent by the gate (`docs/crm.md` §11). Sent while signed in to a **student or parent** account, the submission entry also records `accountId` (the opaque account id) and `accountRole`; nothing else is copied from the account, the account itself is never changed (no phone is written to it), and the link is scrubbed on erase. Staff and admin submissions carry no account link.

### DELETE /api/lead-gate[?withdraw=1] → 200 `{ forgotten: true, withdrawn }`

Same-origin; 30 / 10 min per IP bucket; idempotent; always expires the cookie. `withdraw=1` ("Stop Aspire contacting me") with a live pass: every pass of the lead revoked, an open lead closed as lost / not interested (enrolled leads keep their stage), a `consent_withdrawn` timeline entry, audit `crm.gate_withdraw`.

### POST /api/lead-gate/usage (≤ 1 KB) → 200 `{ recorded, reason? }`

Body `{ tool: "predictor" | "planner", exam, band? (predictor only: "score-a-b" / "percentile-a-b"), key? (planner only: `"countdown"` = the homepage exam countdown, noted as its own entry `countdown-<exam>` with `feature: "countdown"`; any other value 422; dropped for the predictor), page? }`. `ask` and `mock-test` → 422 (their own routes record them; a browser cannot spoof them). `reason`: `off` | `session` | `no_pass` | `not_recorded` (e.g. a pass from an enquiry, or `LEAD_GATE_RECORD_USE` excludes it). 429 at 600 / 10 min per IP bucket or 120 / hour per pass. One `tool_use` entry per lead + tool + key + India day (merged, `uses` counted); deleted after 90 days; never moves the lead's last activity. The client ignores failures.

## Lead gate on server-enforced tools

"Locked" follows the access order above: a signed-in admin, staff member, student or parent without a pass is locked too (owner decision 22 Oct 2026). A locked browser gets **401** with header `X-Lead-Gate: required` and body `{ ok: false, error: "unauthenticated", message, gate: "lead" }` (`leadGateRequiredResponse`). Clients treat a response as the gate **only** when `isLeadGateResponse(response)` (status 401 + that header); any other 401 keeps its old meaning. Browser-only tools (predictor, homepage widget, planner) cannot be enforced: their tables ship to the page, so their gate is lead capture, not access control.

- **`POST /api/ask` (Rancho):** after the same-origin and configuration checks and **before** the allowance check and the body (≤ 5.6 MB) is read: locked → the gate 401 (log outcome `gate_required`); nothing read, reserved or counted. A browser unlocked by a pass is charged per IP **and** per family (`scope: "lead"`, hashed with the day); a pass never raises an allowance and the global daily cap stays the real ceiling. On a counted answer only (`end_turn` / `max_tokens`) one note `{ tool: "ask", key: "rancho" }`: never the question, subject, topic, answer or a photo flag. Every response re-issues cookies via `applyLeadGateCookies`. `GET /api/ask` adds `access: "open" | "gate_required" | "gate_optional"` to `AskStatus`.
- **`POST /api/mocktest/score`:** after the IP limit and before the body: locked and not grandfathered → the gate 401 ("Share a contact number once to see your score."); nothing scored (sample tests included). Grandfathered (never gated): an attempt that started before `LEAD_GATE_SINCE` (as implemented: the body's `startedAt`, the browser's own record), and an attempt the browser marks `seen: true` because its score is already stored on the device (scored without a pass, no tool-use note). The body (≤ 16 KB) is always read before the gate decides. Body gains `record?: true`, sent only for the first scoring of a local attempt; then, via a pass only, one note `{ tool: "mock-test", key: testId, testId, exam, scoreBand }` (10-point band, e.g. `pct-40-49`). Tests of 60 minutes or more ask in the runner before `/api/mocktest/start`. Scoring a new attempt through `/score` is gated for every role like a guest's (22 Oct 2026).
- **`POST /api/mocktest/attempts`:** saving scores the attempt, so the save follows the same rule (after the student role, the per-student limit and the body; before the test lookup): locked → the same gate 401, nothing scored or saved. Never gated: `seen: true` (new optional body field; the result page sends it because it saves a result already shown) and a `startedAt` before `LEAD_GATE_SINCE`. A retried save of an attempt this student already saved at the same test (same `testId` and `attemptId`) gets 200 with the stored row and the scoring of its STORED answers, never a scoring of the retry's body; the same `attemptId` with another test is gated like a new attempt. Generated papers: after the paper is found (404 first); never gated when the paper's server `created_at` is before `LEAD_GATE_SINCE` or the paper was already scored (answers locked, e.g. by `/score` on the result page). `seen` is ignored for papers (every result view scores the paper first, so an unscored paper was never seen), and a ranked paper (scored only here) is asked at its first save. The session is read once, with the gate, so a renewed session cookie is re-issued. No tool-use note is written by a save. Viewing saved attempts (`GET`) is the student's own data and stays ungated.

## Exam-pattern mock papers (`/api/mocktest/papers`)

**Status: being built (22 Oct 2026, package QB-MOCKTEST-API).** This section is the contract from `docs/question-bank-plan.md` §B9–B13. It was first written before the routes landed, then re-checked against the landed route files (`src/app/api/mocktest/papers/**`, `src/lib/mocktest/generated.ts`, `src/lib/mocktest/service.ts`) on 22 Oct 2026 by reading the source; nothing was run. The route code and the request schemas in `src/lib/mocktest/schemas.ts` are authoritative; the Integrate stage makes the final check. Decisions D-050, D-051, D-056; operator guide `docs/question-bank.md`. The question-bank admin APIs (`/api/admin/qb/**`) are portal APIs, listed in `docs/question-bank.md` §15.

Every response uses the D-007 envelope and `Cache-Control: no-store` (except the figure route). Writes are same-origin only (403). Rate limits are in memory, per IP (single instance; a school lab shares one IP, hence the high per-IP numbers). The routes call `ensureQbSeeded()` at request time only, never from static code.

| Method | Path | Does | Limit |
|---|---|---|---|
| GET | `/api/mocktest/papers/readiness?slot=…` | Readiness of the published blueprint: `full` / `short` / `thin` overall and per language, question counts, and the ranked window's status. **Answers before any lead gate**, so a family is never asked for details for a slot that cannot make a paper | 300 / 10 min per IP |
| POST | `/api/mocktest/papers` | Practice: generate a new paper. Ranked: return this month's shared paper (a repeat request returns the same paper) | 150 / 10 min and 600 / day per IP; 10 / hour per signed-in student |
| GET | `/api/mocktest/papers/[id]` | The paper again (resume after a reload), with any answer-key corrections applied. Token in the `X-Paper-Token` header | 300 / 10 min per IP |
| POST | `/api/mocktest/papers/[id]/report` | "Report a problem" for one question: kind `wrong_answer` \| `question_error` \| `figure` \| `hindi` \| `out_of_syllabus` \| `other`, optional note. Creates a staff report and flags the question `student_report`. **Stores no account ID and no IP address** | 20 / hour per IP |
| GET | `/api/qb/figures/[id]` | A figure image (PNG / JPEG / WebP). Served only when an **approved** version of a question references it, else 404. `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'` | 1,200 / 10 min per IP |

Slots: `jee-main`, `neet-ug`, `jee-adv`, `boh-class-10`. A slot without a published blueprint, or with `QB_GENERATION_ENABLED=0`, gets no paper.

**`POST /api/mocktest/papers`.** The body names the slot, the mode (`practice` or `ranked`), the language (`en` or `hi`), whether to add the official compensatory time (practice only; such attempts are never ranked), and up to 5 recent papers the browser holds, so a guest's new paper avoids questions just seen. A paper has a 22-character base64url ID and a 43-character base64url bearer **token**, returned once; the server stores only its SHA-256. A JEE Advanced request returns a set of two papers (Paper 1 and Paper 2) sharing one token. The response carries the runner payload, the duration and maximum score, and the **composition** (counts by source and official years, difficulty spread, whether the paper is a shorter set or uses sample questions, the Hindi shortfall and any relaxed rules), which the page shows before the start. As implemented: `{ slot, mode?, language?, compensatory?, recent?: { paperId, token }[] ≤ 5 }` (JSON ≤ 2 KB) → 201 `{ token, resumed, setId, papers }`; a repeated ranked request → 200 with `resumed: true` and `token: null` (the owner's session opens it).
- `503` while `QB_GENERATION_ENABLED=0`; `404` for an unknown slot.
- `409 bank_thin` (with the readiness) when even the shortest allowed set cannot be made; `409 ranked_off` / `ranked_unavailable` for the ranked paper; `422` for compensatory time on a ranked paper. The page then says "coming soon: the bank has X of Y questions".
- Ranked: signed-in students only; one paper per student per slot per India month (`month-YYYY-MM`); the month is "unavailable" when no full paper can be made.
- Papers expire: guests' after 14 days (`QB_PAPER_GUEST_RETENTION_DAYS`), students' after 30 days, except papers a saved attempt uses.
- **Runner payload whitelist:** never answers, solutions, sources, difficulty, the staff-only `claimedSource` / `aspireRef`, staff IDs or import IDs. Source labels and difficulty appear only in the result, after scoring.
- Lead gate: for papers of 60 minutes or more the browser asks for contact details **before** this call (`gateAtStart`, fails open), after readiness.

**`GET /api/mocktest/papers/[id]`.** The token is checked in constant time; the student who owns a paper needs no token. A wrong token, an unknown ID and an expired paper all give the same 404. **Token transport:** `GET /api/mocktest/papers/[id]` reads it from the `X-Paper-Token` header; `/score` and `/attempts` take `paperToken` in the JSON body, and `/report` takes `token` in the body. It never travels in the URL, so it never reaches access logs. Ranked papers open with the owner's session only.

**Changes to the existing mock-test routes** (all additive):
- **`POST /api/mocktest/score`:** the body gains optional `paperId` (`^[A-Za-z0-9_-]{22}$`) and `paperToken` (`^[A-Za-z0-9_-]{43}$`), and an answer may be an array for one-or-more-correct questions (whole numbers 0–9, at most 10). Marking adds JEE Advanced partial marks (`per_correct_option`), numerical ranges and the integer rule. The lead-gate order and grandfathering are unchanged, except that "started before `LEAD_GATE_SINCE`" uses the paper's server `created_at`, not the browser's `startedAt`; tool-use notes use the key `bp-<slot>`. Practice papers: the first scoring stores a hash of the answers and the result; the same answers re-score (applying any answer-key correction); **different answers → `409 paper_already_scored`**. The score, per-question right / wrong and each question's source label and difficulty (`paperQuestionMeta`) come with the score, after submission and never during the test; correct answers and solutions only after `created_at` + `minDurationMs(duration)` (a quarter of the paper's time, at least 5 minutes; `paperRelease`). **Ranked papers → `409 use_attempts`**, so `/score` can never reveal a ranked key. Question statistics are recorded once per paper (compare-and-set) and only when the elapsed time is plausible. The rank projection is null for shorter sets, sample papers and exams without predictor tables.
- **`/api/mocktest/attempts`:** saves a generated paper's attempt once (`qb_attempt_papers.paper_id` is unique). Ranked: the score at save, a tie-break vector from the blueprint's official rules computed at save, and the solutions held until the month closes. Practice attempts use the test ID `bp-<slot>`, ranked `bp-<slot>-ranked`, so a practice attempt never blocks a ranked board entry.
- **`/api/mocktest/leaderboard`:** boards `bp-<slot>-ranked` per month, ordered by score and then the tie-break vector (`compareRankedEntries`; time is never used; equal entries share a rank and are listed by save time). Attempts with compensatory time are unranked and labelled. The fixed weekly tests keep `compareEntries` unchanged.
- **`/api/mocktest/verify/[id]`:** shows "score updated after an answer-key correction on <date>" when a correction re-scored the attempt (corrections re-score saved attempts and boards in one transaction).

---

## Page layout (`/api/admin/page-layout`, `/api/page-layout/preview/exit`)

Section order and visibility of the 10 public pages (D-084, `docs/page-layout-plan.md` §9). D-007 envelope with private headers (`no-store`, `X-Robots-Tag`).

| Method + path | Who | Body | Responses |
|---|---|---|---|
| `GET /api/admin/page-layout/[page]` | any admin | – | 200 `{ page, revision, published: { sections, custom, updatedAt, updatedBy }, draft, history[20] }` · 401 / 403 · 404 unknown page |
| `POST /api/admin/page-layout/[page]` | effective super admin, same-origin | JSON ≤ 4 KB, strict: `{ action: "save_draft", revision, sections: [{ key, hidden }] (≤ 32) }` or `{ action: "discard_draft" \| "publish" \| "reset", revision }` | 200 new state · 401 / 403 · 404 · 409 stale `revision` · 413 / 415 · 422 `fieldErrors.sections`: `not_last:<key>`, `cannot_hide:<key>`, `duplicate:<key>`, `none_visible`, `no_draft` · 429 (60 writes per user per 10 min, `Retry-After`) |
| `POST /api/admin/page-layout/preview` | effective super admin, same-origin | form `page`, `lang` (≤ 1 KB) | 303 to the public page with Draft Mode on · 303 back to the editor for an unknown page or a non-super-admin · 403 envelope cross-origin |
| `POST /api/page-layout/preview/exit` | anyone, same-origin (outside the portal API, so it works after sign-out) | form `page?`, `lang?` (≤ 1 KB) | 303 to that page (registry paths only), else to `/` of `lang` · 403 envelope cross-origin |

Publish and reset call `revalidateTag("page-layout:<page>", { expire: 0 })`; saving or discarding a draft revalidates nothing (drafts render only in Draft Mode, never cached). Every successful write is in `page_layout_history` and the audit log (`layout.save_draft`, `layout.discard_draft`, `layout.publish`, `layout.reset`, target `page-layout:<page>`, flat details `{ page, revision, moved, hidden, shown, order }`). Unknown, pinned and missing section keys are not errors: the server drops or re-inserts them at their default position.

## Lead routing (`/api/admin/super-admins`, `/api/crm/**`, `/api/integrations/meta/**`)

Staff APIs (docs/crm.md §12 has the full table; design `docs/lead-routing-plan.md` §21). JSON envelope (D-007), `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, same-origin writes, zod, body limits. **Every write that the plan calls super-admin-only is refused with 403 for anyone else on the server**, whatever the UI shows.

| Method & path | Who | Notes |
|---|---|---|
| GET `/api/admin/super-admins` · PUT `/api/admin/super-admins/:userId` | admin · super admin (current password) | 409 `last_super_admin`, 422 `not_admin` |
| `/api/crm/areas/**`, PUT `/api/crm/availability`, PATCH `/api/crm/leads/:leadId/area`, GET/PUT `/api/crm/settings/routing` | reads: manager, admin · writes: super admin (reassign / availability / change area also for area heads, within their areas) | areas, people, aliases, merge, set up from centre, re-route, unmatched places, resolver |
| GET/PUT `/api/crm/settings/speed`, GET `/api/crm/sla`, GET `/api/crm/sla/summary`, GET `/api/crm/dashboard` | reads scoped · PUT super admin | calling hours + first-call rule; queues; alert-strip summary (polled every 60 s); dashboard |
| POST `/api/crm/import/preview`, `/api/crm/import/batches`, `…/:batchId/rows`, `…/:batchId/finish` · GET `/api/crm/import/batches` | super admin · admin (history) | ≤ 256 KB / 250 rows per request; 20 batches and 400 chunks per hour per user |
| GET/PUT `/api/crm/integrations/meta`, PUT/DELETE `…/secrets`, POST `…/actions`, GET `…/inbox` | GET status: admin, manager · the rest: super admin | secrets are write-only; 503 `not_configured` without `INTEGRATIONS_SECRET` |
| GET `/api/integrations/meta/webhook` | Meta (public) | handshake: `hub.mode=subscribe`, constant-time `hub.verify_token`, `hub.challenge` echoed as text (`[0-9A-Za-z_-]{1,128}`), else 403 / 400 |
| POST `/api/integrations/meta/webhook` | Meta (public) | ≤ 2 MB; `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(App Secret, raw body) else 401; 503 without the key or App Secret; 600 / min per IP; answers `{"ok":true}` at once and fetches the leads after the response. Exempt from the preview password (`src/proxy.ts`) |
| POST `/api/integrations/meta/sync` | loopback cron only | 404 unless `INTEGRATIONS_CRON_TOKEN` is set; needs `Authorization: Bearer <token>`, a loopback `Host`, no proxy headers |

`GET /api/crm/leads` also takes `area` (area id, `none`, `tool_signups`) and `sla` (`open`, `overdue`, `escalated`). `POST /api/admin/users` with `role: "staff"`, and every change to a staff account, is super-admin-only; a non-super-admin changing a super admin's account gets 403 ("Only a super admin can change a super admin's account.").

## Admin console Phase 1b (`/api/crm/**`, `/[lang]/crm/home`)

Staff APIs of the admin console Phase 1b (D-078 – D-083; `docs/crm.md` §13 has the pages; design
`docs/admin-phase-1b-plan.md` §8). Same rules as lead routing: D-007 envelope, `Cache-Control: no-store`,
`X-Robots-Tag: noindex, nofollow`, same-origin writes, strict zod, body limits (8 KB; settings documents 32 KB). A lead
the viewer cannot see is 404 (never "forbidden"), an erased lead 409. Super-admin-only writes are refused with 403 for
anyone else on the server.

| Method & path | Who | Body / query | Responses |
|---|---|---|---|
| GET `/[lang]/crm/home` | anyone | – | 307 to the role's home (admin `/admin`, area head `/crm/dashboard`, counsellor `/crm/today`, question-bank-only staff `/admin/questions`, other staff `/crm`; signed out → login `next=/crm/home`) |
| GET `/api/crm/leads/:leadId/outcome[?taskId=]` | sees the lead | – | 200 `FollowUpContextView` · 404 · 409 erased |
| POST `/api/crm/leads/:leadId/outcome` | sees the lead | `{ contact: { channel: "call"\|"whatsapp", outcome, note?, template?: { key, lang } } \| null, taskId?, next: { kind: "preset", preset: "later_today"\|"tomorrow"\|"in_3_days" } \| { kind: "at", at } \| { kind: "none", reason: "wrong_number"\|"closing"\|"has_other_task" }, nextTitle?, markNotReachable?, markLostWrongNumber? }` | 201 (one atomic write: task done → follow-up → contact → optional lost) · 404 · 409 · 422 (no `next`; `contact: null` without `taskId`; outside 08:00–21:00 IST; more than 5 min in the past; template not approved) |
| GET `/api/crm/templates?context=general` | everyone in the CRM | – | 200 approved templates of that context |
| GET `/api/crm/templates?all=1` | area heads, admins | – | 200 every template (missing seed drafts are added) · 403 counsellors |
| PUT `/api/crm/templates/:key` | super admin | `{ lang: "en"\|"hi"\|"hinglish", body, expectedVersion }` | 200 (approved → draft) · 403 · 409 stale · 422 unknown slot, slot at the start or end, > 700 |
| POST `/api/crm/templates/:key/status` | super admin | `{ status: "approved"\|"retired"\|"draft", expectedVersion }` | 200 · 403 · 409 |
| PUT `/api/crm/templates/links` | super admin | `{ prospectusUrl: string \| null, expectedVersion }` | 200 · 403 · 409 · 422 (https, ≤ 300) |
| GET / PUT `/api/crm/leads/:leadId/details` | sees the lead | PUT: partial strict `LeadMoreDetails` (`null` clears; second number = an Indian mobile ≠ the main number; joining session current or next) | 200 · 404 · 409 erased · 422; GET is audited `crm.lead_view` |
| GET `/api/crm/leads/:leadId/duplicates` | sees the lead | – | 200 `DuplicateMatch[]` (≤ 5, only leads the viewer sees) |
| POST `/api/crm/leads/:leadId/duplicates` | sees both leads, and admin, manager or the assignee of either | `{ otherLeadId, action: "dismiss" }` | 200 · 403 · 404 · 422 |
| GET `/api/crm/lost-review?days=7\|14\|30&assignee=<id\|unassigned>` | area heads (scope), admins | – | 200 `LostReviewReport` · 403 counsellors |
| POST `/api/crm/lost-review/:leadId` | area heads, admins | `{ lostAt (exact ISO from the list), decision: "kept"\|"reopened", reopenTo?, assigneeId?, followUp?: { kind: "preset", preset } \| { kind: "at", at } }` | 200 · 403 · 404 · 409 (erased, no longer lost, already reviewed) · 422 |
| GET `/api/crm/targets?period=S2026` | admins, area heads (own centres) | – | 200 `TargetGrid` · 403 counsellors · 422 not a session key |
| PUT `/api/crm/targets` | super admin | `{ period, metric, cells: [{ centreSlug, program, value 0–100000 }], expectedUpdatedAt }` (≤ 32 KB) | 200 · 403 · 409 stale (code `bad_request`) · 422 |
| GET `/api/crm/sources?range=30d\|90d\|session` or `from=YYYY-MM-DD&to=YYYY-MM-DD`, `&centre=<slug\|none>` | area heads (scope), admins | – | 200 `SourcesReport` · 403 counsellors · 422 unusable range or centre |
| GET / PUT `/api/crm/settings/centre-links` | read: area heads, admins · PUT: super admin | PUT `{ centres: { <slug>: { mapsUrl } }, expectedVersion }` (≤ 32 KB; https Google Maps hosts, ≤ 300) | 200 · 403 · 409 · 422 `centres.<slug>.mapsUrl` |

Changed: `GET /api/crm/leads` (and the Enquiries page and CSV export) also takes `contact=none`, `signups=hide` and
`created=today|week|over24h` (IST; replaces `createdFrom` / `createdTo`), and `centre` now matches the effective centre
(own centre, else the routing area's default centre). `POST /api/admin/users` for a staff login without `crm.crmRole`
answers 422 `{ fieldErrors: { crm: ["Choose the CRM role."] } }`. `GET /api/admin/users` adds `crm.areaIds`,
`crm.areaNames` (`{ id, en, hi, active }`), `crm.awayUntil` and `crm.openLeads` to staff accounts.

## Rendering and caching (Next.js 16, Cache Components)

- The list routes read `request.nextUrl.searchParams`, so they render per request. The request is read first and outside any `try/catch` so Next.js can bail out of prerendering cleanly.
- `/api/health` calls `await connection()` so it reflects the running server's environment.
- The `[slug]` routes use `generateStaticParams`, documented for route handlers under Cache Components:
  - Programs use `getProgramSlugs()`, which always returns at least one entry.
  - Centres use the visible centres, or `STATIC_PARAM_FALLBACK`.
  - Known slugs are prerendered at build time; unknown slugs render on request. Prerendered `404`s are accepted by the build.
  - Placeholder visibility for these routes follows the **build-time** environment, as the pages do.
  - These routes have been type-checked against the route types from `next typegen`, but **`next build` has not yet been run against them**.
- `POST` handlers are never prerendered or cached.

## Environment variables

All of these are listed in `.env.example`. Only `NEXT_PUBLIC_SITE_URL` is public.

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `ENQUIRY_STORE` | POST /api/enquiries, `getEnquiryDeliveryStatus()` | `crm` | `crm` (store leads, D-039) or `off`; anything else = off + warning |
| `ENQUIRY_DESTINATION` | POST /api/enquiries, /api/health | `none` | `none` or `webhook` |
| `ENQUIRY_WEBHOOK_URL` | webhook adapter | – | `https://` required (`http://localhost` allowed outside production). No credentials in the URL. Treated as a secret: never logged. |
| `ENQUIRY_WEBHOOK_SECRET` | webhook adapter | – | ≥ 16 chars, 32+ random chars recommended (`openssl rand -hex 32`). Server-only. |
| `NEXT_PUBLIC_SITE_URL` | origin check | – | Its origin is also accepted as a same-site `Origin` |
| `SHOW_PLACEHOLDER_CONTENT` | content routes (via `data.ts`), /api/health | dev on / prod off | D-005 |
| `NODE_ENV` | webhook URL policy | – | Set by Next.js |
| `LEAD_GATE` | `/api/lead-gate*`, `/api/ask`, `/api/mocktest/score`, `/api/mocktest/attempts` (POST), `/api/enquiries` (pass cookie) | `off` | `off` / `optional` / `required` (live site: `required`, owner decision 21 Oct 2026). Forced off with `ENQUIRY_STORE=off` or no usable secret in production; sample data does not force it off. Read per request: change `.env` and recreate the container, no rebuild |
| `LEAD_GATE_SECRET` | pass cookie | – | ≥ 32 chars, server-only. Required in production (dev: per-process fallback). Rotating it re-asks every browser |
| `LEAD_GATE_RECORD_USE` | tool-use notes | `all` | `all` / `parent` / `off`; unknown → `off` |
| `LEAD_GATE_ASSIGN` | new gate leads | `auto` | `auto` (same rules as enquiries) or `none` (Unassigned queue) |
| `LEAD_GATE_MAX_NEW_LEADS_PER_HOUR` | flood breaker | `300` | Above it: 503 on new captures and the gate degrades to optional |
| `LEAD_GATE_SINCE` | `/api/mocktest/score`, `/api/mocktest/attempts` (POST) | – | ISO date-time of switch-on; mock attempts started earlier are never gated (generated papers: compared with the paper's server `created_at`) |
| `INTEGRATIONS_SECRET` | CSV import, Meta Lead Ads, erase suppressions (`src/lib/server/secret-box.ts`) | – | Opaque, ≥ 43 chars (`openssl rand -base64 48`). Seals the Meta secrets (AES-256-GCM) and keys the CSV refs and erase fingerprints. **Set before deploying lead routing**; without it import and Meta answer 503 `not_configured` and an erase writes no suppression. Never in backups; a restore needs the same key |
| `INTEGRATIONS_SECRET_PREVIOUS` | secret box | – | Only during a key rotation (opens old envelopes and hashes until resealed) |
| `INTEGRATIONS_CRON_TOKEN` | `POST /api/integrations/meta/sync` | – | Optional, ≥ 32 chars. Enables the loopback Meta sync cron (deploy/README.md) |
| `QB_GENERATION_ENABLED` | `/api/mocktest/papers*` | on | `0` = no new exam-pattern papers (kill switch; `POST /api/mocktest/papers` → 503). Read by `src/lib/mocktest/generated.ts` |
| `QB_PAPER_GUEST_RETENTION_DAYS` | `/api/mocktest/papers*` | `14` | How long guests' generated papers are kept. Being built: nothing reads it yet (QB-CORE-B papers) |
| `QB_FIGURE_DIR` | `/api/qb/figures/[id]` | `<folder of AUTH_DB_PATH>/qb-figures` | Where question-bank figures are stored. Being built: nothing reads it yet (QB-CORE-B figures) |
| `QB_IMPORT_*`, `QB_FIGURE_QUOTA_MB` | admin import and figure upload only | – | See `docs/question-bank.md` §13 |

## Known limitations

- The rate limiter is in-memory and single-instance, and relies on a trustworthy `X-Forwarded-For` (see above).
- No persistence: with `none`, enquiries are validated and then discarded. With `webhook`, the receiver is the system of record.
- No retry queue: a webhook outage returns `500` and the visitor is asked to try again or contact Aspire directly.
- Honeypot responses return immediately; a webhook-mode genuine submission takes as long as the webhook does. This timing difference is observable.
- No CAPTCHA. Add one only with owner and privacy approval if spam gets past the honeypot and rate limit.

## Tests

```bash
npx vitest run src/lib/contracts/enquiry.test.ts src/lib/server src/app/api/enquiries src/app/api/content-routes.test.ts src/test
```

| Area | Test file |
|---|---|
| Schema cases per source (phone formats, consent, email); hero variant, `classOrExam` mapping, step schemas and step/full-schema parity | `src/lib/contracts/enquiry.test.ts` |
| Rate limiter window | `src/lib/server/rate-limit.test.ts` |
| Origin guard, content type, client IP, body limit | `src/lib/server/request-guards.test.ts` |
| Destination config parsing, `getEnquiryDeliveryStatus` | `src/lib/server/env.test.ts` |
| Webhook signing, timeout and failures | `src/lib/server/destinations/webhook.test.ts` |
| Service: reference, honeypot, payload, centre check (admissions + hero) | `src/lib/server/enquiry-service.test.ts` |
| POST handler end to end (all sources), including a no-PII-in-logs assertion on every test | `src/app/api/enquiries/route.test.ts` |
| GET routes and health | `src/app/api/content-routes.test.ts` |
| No mockup placeholder strings (fake phone, centres, stats, names) in `src/components` / `src/app` | `src/test/mockup-strings.test.ts` |
| Lead gate: token, contract, config, limits, consent registry, en/hi parity | `src/lib/lead-gate/lead-gate-lib.test.ts` |
| Lead gate routes (GET / POST / DELETE / usage), enquiry pass cookie, sign-out, no-PII logs | `src/app/api/lead-gate/lead-gate-api.test.ts` |
| Gate leads, passes, tool-use notes, withdrawal, erase | `src/lib/crm/gate.test.ts` |
| `/api/ask` and `/api/mocktest/score` gate 401, per-family allowance, tool-use notes | `src/app/api/ask/ask-route.test.ts`, `src/app/api/mocktest/mocktest-api.test.ts` (tool owners) |
| Exam-pattern papers: generate → resume → score, wrong token / expired 404, answer lock 409, ranked `use_attempts`, `bank_thin`, readiness before the gate, review delay, payload whitelist, rate limits, report without account or IP, figure route (planned in the plan's QB-MOCKTEST-API list; **being built, not yet run**) | `src/app/api/mocktest/**`, `src/app/api/qb/figures/[id]/` (QB-MOCKTEST-API) |
