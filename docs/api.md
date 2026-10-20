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
| 201 | `{ ok: true, status: "received", reference: "ENQ-XXXXXXXXXX", message }` | Stored as a CRM lead and/or the webhook returned 2xx |
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
