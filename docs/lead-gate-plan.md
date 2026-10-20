# Lead gate: contact details once before free tools' results

Status (21 Oct 2026): **core implemented by GATE-CORE, switched OFF by default.** Tool integrations (WP2–WP9) and the
privacy/legal work (WP10) are pending. Proposed decision **D-043** (supersedes D-033 "lead capture = link to the
enquiry form" and partly D-034 "guests' data stays in their browser").

Owner request (verbatim): *"every tool should be a data collection point before showing the result of any tool collect
the contact information of the submitee."*

Lead's binding defaults, and where this plan deviates (each deviation is flagged ⚑ and argued in §2):

| Binding default | Plan |
|---|---|
| One short form: student name, mobile/WhatsApp (E.164 dedupe), class, "I am a: student / parent", consent tick + version registry | Kept. ⚑ The mobile field is labelled **"Parent's or guardian's mobile (WhatsApp)"** (students are asked for a parent's number). ⚑ A **new consent version** `2026-10-21.gate.v1` in the same registry (v2 says "about this enquiry", lists email and does not disclose tool notes). |
| Asked once per browser; then all tools unlock | Kept: a signed `aspire_tool_pass` cookie + a server row, **180 days** (⚑ not 365). A stored enquiry also unlocks the browser. |
| Each later tool use recorded on the same lead (tool + non-sensitive summary; never Rancho questions/photos or answers) | Kept, ⚑ minimised and switchable: `LEAD_GATE_RECORD_USE=all|parent|off`; Rancho records only "Rancho used" (no subject, no photo flag); one entry per tool + key + day; 90-day expiry; never moves the retention clock. |
| Signed-in students/parents skip it | Kept: any verified session skips it (staff/admin too); nothing is stored for account holders. |
| No OTP | Kept (D-041). Risks in §12. |
| Reuse capture/dedupe/assignment pipeline | Kept (`captureLead`), ⚑ with gate rules: an existing lead is never reopened, re-assigned or given a weaker consent. `LEAD_GATE_ASSIGN=none` offers an Unassigned queue. |
| Rate limits that don't block a family using several tools | Kept: one unlock per browser; generous status/usage limits; IPv6 per /64; a per-phone cap that never locks a family out. |
| Privacy notice + DPDP parental-consent risk flagged | §11 (en + hi drafts), §12 (checklist section 17). |
| (implicit) on now | ⚑ **Off by default and forced off while sample data is shown** (the live site runs on placeholder data: a real family must never trade a phone number for a made-up rank, D-032). |

---

## 1. How it works

1. A tool host (predictor, planner, mock-test result, Rancho) validates its own input first, then calls
   `gate.requestAccess()`. If the browser is unlocked (gate off, signed in, a pass, a remembered "skip", or the server
   can't be reached for a browser-only tool) the result shows at once.
2. Otherwise `<LeadGateForm>` appears inline (never a modal) where the result would be. One submit →
   `POST /api/lead-gate` → `captureLead` (source `tool`, dedupe by +91 number, consent text from the registry,
   attribution) **and** a pass row in one transaction → `Set-Cookie: aspire_tool_pass` → every tool on every tab opens.
3. Later uses: browser-only tools (predictor, planner) send a one-line summary to `POST /api/lead-gate/usage`;
   Rancho and mock-test scores are recorded by their own server routes. One `tool_use` timeline entry per tool + key +
   India day; counsellors see "Rank predictor · JEE Main · score 180–189 · 3× today".
4. Under every unlocked result: "Your contact details are shared on this browser · **Not you?** · **Stop Aspire
   contacting me**" (no name, ever).
5. Server-enforced tools (`/api/ask`, `/api/mocktest/score`) answer a locked browser with a 401 carrying
   `X-Lead-Gate: required`; nothing is read, reserved or scored.

---

## 2. Critique resolution (every blocker and major; minors too)

Critique 0 = privacy/legal lens, critique 1 = abuse/UX/engineering lens.

| # | Finding (severity) | Decision | What changed / why |
|---|---|---|---|
| 0.0 | Demo site would trade real numbers for SAMPLE results (blocker) | **Accepted** | `LEAD_GATE` defaults to `off`; forced `off` while `showPlaceholderContent()` (unless `LEAD_GATE_ALLOW_SAMPLE_DATA=true`, staging QA only); hosts also skip the gate when their result comes from sample data (predictor `hasSampleData`, sample mock tests). Turning it on is an explicit `.env` change after the §10 preconditions. |
| 0.1 | Tool-use log tracks children for marketing (major) | **Partly** | Recording stays (binding default) but: own switch `LEAD_GATE_RECORD_USE=all|parent|off` (counsel can stop or limit it without code); Rancho records only that it was used (no subject, no photo flag); mock tests record only the first scoring of an attempt (never re-scores or print views); 90-day TTL; never bumps `last_activity_at`. **Rejected:** default-off recording, because the lead made recording a binding default; flagged as TG-2. |
| 0.2 | One tick, three purposes; lead consent overwritten (major) | **Partly** | Accepted: each pass stores its `consent_version`; a pass whose version is no longer accepted is dead (re-ask); a gate capture never overwrites an existing lead's consent fields (the submission activity keeps the gate sentence); lead detail shows the sentence matching the lead's version; tests prove each endpoint rejects the other's version. Rejected for v1: a second optional "note my tool use" tick (binding default is one tick; the switch covers "no recording"; `record_use` per pass already allows an opt-in tick later without a schema change). |
| 0.3 | Unlocks reopen lost leads; no do-not-contact (major) | **Partly** | Accepted: gate captures never reopen or re-assign (submission gets `onLostLead`); "Stop Aspire contacting me" closes the lead as `not_interested`, which the gate never reopens; TG-4 reworded as a question. Deferred (§9): a do-not-contact list that survives erase (needs an HMAC phone key, a secret and staff UI). Until then an erased number that comes back starts a new lead (tested, documented). |
| 0.4 | Ask for the parent's mobile (major) | **Partly** | Accepted: label "Parent's or guardian's mobile (WhatsApp)", student hint "enter your parent's or guardian's number"; one consent sentence that names both declarations ("…or I am the student and my parent or guardian agrees"), so the stored text matches what was ticked; `submittedBy` on the submission and the pass; `LEAD_GATE_RECORD_USE=parent`. Rejected: removing class 6–8 (Foundation starts at class 8; same options as the enquiry forms) — flagged in TG-2; WP9 marks `submittedBy=student` leads "confirm with a parent first". |
| 0.5 / 1.4 | Build-time `TOOL_GATE` vs Docker runtime env (major) | **Accepted** | The mode is read only at request time by API routes; `<LeadGateNote>` renders from the live `GET /api/lead-gate`; static page copy must be mode-agnostic; the mock-test start screen checks the live status. Rollback = change `.env` + `docker compose up -d` (recreate), no rebuild. |
| 0.6 | Shared computers: 365-day pass, first child's name (major) | **Mostly** | No name anywhere (also fixes 1.0); lifetime 180 days; "Not you?" + sign-out clear it; kiosk guidance for centre machines (gate off on kiosks or "Not you?" after each use). Rejected: session-only pass / "remember me" tick and a same-day usage window — they contradict "asked once per browser". |
| 0.7 | Privacy notice `{tbc}`; no withdrawal (major) | **Accepted** | Filling `about.p2`, `rights.p1/p2`, `retention.p1`, `tools.p2`, `access.p2` is a hard precondition (§10). Self-service withdrawal built (`DELETE /api/lead-gate?withdraw=1`). Notice drafts include attribution data (§11). The inline form itemises data, purpose, "no OTP", how long and how to stop. |
| 0.8 | Tool use restarts retention; no purge job (major) | **Accepted** | `recordToolUse` never touches `last_activity_at`; `tool_use` rows expire after 90 days (hourly sweep). The retention purge for unconverted `source=tool` leads (CRM-3) is a precondition, owned by CRM-CORE. |
| 0.9 / 1.16 | Gating data the family already has (major) | **Accepted as a rule** | Never gate existing data: stored guest plans and plan edits stay open (only creating the first plan is gated); mock attempts started before `LEAD_GATE_SINCE` or with a local score stay open; the homepage countdown is not gated. |
| 0.10 | Optional-mode nagging (minor) | **Accepted** | "Continue without sharing" remembered 30 days (`aspire.leadgate.skip.v1`, cleared by sign-out); same-size button as submit. |
| 0.11 | No "Sign in instead" (minor) | **Accepted** | Every form links to `/login`. Limitation: `/login?next=` only accepts portal paths, so the visitor lands in the portal, not back on the tool (auth owner's call). |
| 0.12 | Copy list incomplete; HT-1/HT-2 contradict (minor) | **Accepted** | Full list in §11.4; the "won't be asked again" line now says "in this browser for up to 6 months, unless you clear cookies, sign out or choose 'Not you?'"; the cookie is described as not essential. |
| 0.13 | MCP passes tool_use meta to AI assistants (minor) | **Accepted (docs) / flagged** | `tool_use` meta IS personal data once on a lead. The MCP owner should strip `band`, `scoreBand` from `tool_use` in `activityOut` (src/lib/mcp/tools/crm.ts) or the notice must name AI-assistant processing under service providers (TG-8). Not changed here (outside this package). |
| 0.14 | Class not needed (minor) | **Rejected / Accepted** | Class kept required: the purpose is course counselling and class decides the course and counsellor (same as every enquiry form). Photo flag dropped. |
| 1.0 | Response reveals the existing family's child's name (blocker) | **Accepted** | No lead field in any public response; the 201 body is byte-identical for a new and an existing family (tested). |
| 1.1 | Reopens wrong_number / not_interested (major) | **Accepted** | See 0.3 (tested). |
| 1.2 | Junk leads, IPv6 rotation, no ceiling (major) | **Accepted** | All gate limiters key IPv6 by /64; a flood breaker (`LEAD_GATE_MAX_NEW_LEADS_PER_HOUR`, default 300) pauses new captures (503) and degrades the gate to `optional`; `LEAD_GATE_ASSIGN=none` = Unassigned queue (default `auto` per the binding default: owner question); first-call script in TG-5; daily gate-lead count → WP9 reports. |
| 1.3 | A pass does not bound AI spend (major) | **Accepted (contract §5.6)** | With a pass, `/api/ask` checks and reserves BOTH the IP key and a per-lead key; the global cap stays the real ceiling — the owner is told so plainly. |
| 1.5 | Browser-only tools fail closed (major) | **Accepted** | Two policies: browser-only tools fail OPEN (no answer within 5 s, 429, 5xx, offline → result shown, nothing recorded; after a failed submit, "Show my result without saving"); server-enforced tools fail closed. |
| 1.6 | Usage recording is the riskiest element (major) | **Partly** | See 0.1. `last_tool_use_at` not added (no inbox need yet). |
| 1.7 | 3-hour mock test held hostage (major) | **Accepted** | Tests ≥ 60 minutes ask at the START (runner intro, before `/api/mocktest/start`); `/score` stays enforced; sign-in link everywhere. |
| 1.8 | Enquired families asked again (major) | **Accepted (a) / deferred (b)** | (a) Built: a stored enquiry sets the pass cookie (`record_use=0`, enquiry consent version), body unchanged. (b) One-tap "Request a call back" for pass holders → Phase 2 (§9); the admissions form still dedupes meanwhile. |
| 1.9 | Work-package cycle and overlaps (major) | **Accepted** | GATE-CORE shipped contract + messages + parity tests together; remaining packages and their dependencies in §14; `/ask` and `/score` sections of docs/api.md go to the lead (WP10). |
| 1.10 | Predictor gates before validating (minor) | **Accepted** | Integration rule §8.1. |
| 1.11 | Negative score band; uses count page views (minor) | **Accepted** | `mockScoreBand` → `pct-below-0` (tested); record only with `record: true` from ResultView's first scoring. |
| 1.12 | 401 ambiguity; optional mode unrepresentable (minor) | **Accepted** | Gate only when `X-Lead-Gate: required` (+ body `gate: "lead"`); `isLeadGateResponse()`; `AskStatus.access` gains `gate_optional`; skip remembered. |
| 1.13 | Phone cap locks a family out; honeypot traps autofill (minor) | **Accepted** | Past the cap the pass binds to the existing lead without a new activity (429 only if that number has no lead); honeypot hits logged; the local hint is written only after the server confirms the pass. |
| 1.14 | Tools consent overwrites enquiry consent (minor) | **Accepted** | See 0.2; WP9 lists every consent with its date. |
| 1.15 | Focus jumps; pending Rancho turn (minor) | **Accepted** | Focus moves only after an explicit submit (`focusOnMount`); `gateOpen` derived (asked and no unlock since); `onUnlocked({ byThisHost })`: Rancho auto-sends only when its own form unlocked, else shows "Send now"; Rancho panel switches to `showModal` / full height while the form shows. |
| 1.17 | Implausible-number error generic; Hindi gaps; untrue line (minor) | **Accepted** | `isImplausibleMobile` in the client-safe contract with its own message key (en + hi); every Hindi string filled. |
| 1.18 | Session refresh; must-change-password mismatch (minor) | **Accepted** | `resolveLeadGateAccess` returns the `CurrentSession`; `applyLeadGateCookies` re-issues a refreshed session cookie and clears a dead pass cookie. Rule: ANY verified session skips the gate (no lead for account holders); allowances unchanged (`resolveAsker` still charges password-change sessions as guests: allowance ≠ identity). Tested. |
| 1.19 | Interactive flows untested (minor) | **Accepted** | Store logic is DOM-free and fully unit-tested with fake deps; manual browser checklist §13.2. |

---

## 3. Data model and CRM (implemented)

**Lead source / tool values.** Gate captures use the existing source **`tool`** (`GATE_LEAD_SOURCE`, already in
`PUBLIC_LEAD_SOURCES`). `lead.tool` = the tool that asked first (first touch): `predictor` | `mock-test` | `planner` |
`ask` (= Rancho on /tools/ask, /rancho, the floating chat and the homepage Ask tab). `lead.page` is locale-free (`/` =
homepage widget). `CaptureLeadInput.submittedBy?: "student" | "parent"` is kept on the submission activity.

**`captureLead(input, now, { gate, assignNew })`** (src/lib/crm/capture.ts). With `gate: true`, an EXISTING lead:
never reopened (submission meta `onLostLead: true`), never re-assigned, consent version/time kept when it has one.
`assignNew: false` leaves a new lead Unassigned. Enquiries are unchanged.

**Activity kinds** (`ACTIVITY_TYPES`, no DB CHECK, no migration):

| kind | meta | notes |
|---|---|---|
| `submission` (gate) | `source:"tool"`, `tool`, `page`, `toolExam`, `toolBand` (predictor), `locale`, `consentTextVersion:"2026-10-21.gate.v1"`, `consentLocale`, `consentText`, `submittedBy`, `filled`, `onLostLead?` | one per unlock (not past the phone cap) |
| `tool_use` | `tool`, `key`, `exam?`, `band?` (predictor), `testId?` + `scoreBand?` (mock test), `page?`, `uses`, `lastAt` | one per lead + tool + key + IST day; `key` = exam (predictor, planner), test id (mock test), `rancho`; deleted 90 days after last use and on erase; no audit row |
| `consent_withdrawn` | `via:"lead_gate"`, `browsersForgotten` | + `stage_change` to `lost`/`not_interested` unless lost/enrolled; audited `crm.gate_withdraw` |

**Table `crm_gate_passes`** (appended, idempotent, to src/lib/db/features/crm.ts; FK → `crm_leads(id) ON DELETE CASCADE`):
`pass_hash` PK (SHA-256 of the pass id; the id is never stored) · `lead_id` · `created_at` · `expires_at` ·
`consent_version` · `submitted_by` (`student`/`parent`/NULL) · `record_use` (0/1). Indexes `(lead_id, created_at)`,
`(expires_at)`; plus `crm_activities (type, at)` for the TTL sweep. SQL only in src/lib/crm/repo/gate-passes.ts (D-037).

**Services** (src/lib/crm/gate.ts, exported from `@/lib/crm`): `unlockGateLead` (capture + pass, one transaction;
sweeps expired; ≤ 10 passes per lead) · `issueGatePassForLead` (after a stored enquiry) · `findGatePass` ·
`revokeGatePass` · `revokeGatePassesForLead` · `recordToolUse` · `sweepToolUse` · `withdrawGateConsent`.

**Erase (D-042).** `eraseLead` deletes the lead's passes and all `tool_use` rows, keeps `submittedBy`/`onLostLead`
on the stub, audit details `{ gateBrowsers, toolUsesDeleted }`.

**Lead detail.** `consentText` now shows the sentence behind the lead's own `consentTextVersion`.

**Reports / UI (WP9).** Label `tool_use` ("Used a free tool") and `consent_withdrawn`; summary lines such as
"Rank predictor · JEE Main · score 180–189 · 3× today", "Mock test · <test> · 40–49 %", "Rancho", "Study planner ·
NEET"; "Submitted by: student / parent"; source `tool` → "Free tool (contact before result)"; list every consent with
its date; flag `submittedBy=student` "confirm with a parent first"; daily count of gate leads. Until WP9 ships these
entries render with the generic "other" label.

---

## 4. Configuration (runtime env only; `.env.example` updated)

| Variable | Values | Effect |
|---|---|---|
| `LEAD_GATE` | `off` (default) · `optional` · `required` | Forced `off` with `ENQUIRY_STORE=off`, while sample data is shown, or without a secret in production. Unknown value → off + warning. |
| `LEAD_GATE_SECRET` | ≥ 32 chars | HMAC key for the cookie. Required in production (dev: per-process fallback). Rotating it re-asks every browser. |
| `LEAD_GATE_RECORD_USE` | `all` (default) · `parent` · `off` | Which passes note tool use. Unknown → `off`. |
| `LEAD_GATE_ASSIGN` | `auto` (default) · `none` | Auto-assign new gate leads, or leave them Unassigned. |
| `LEAD_GATE_ALLOW_SAMPLE_DATA` | `true` | Staging QA only. |
| `LEAD_GATE_MAX_NEW_LEADS_PER_HOUR` | int (default 300) | Flood breaker. |
| `LEAD_GATE_SINCE` | ISO date-time | When the gate was switched on: earlier mock attempts are never gated. |

---

## 5. Contracts

All routes: Node route handlers; D-007 envelope; `Cache-Control: no-store`, `X-Robots-Tag: noindex`; same-origin on
every write; logs carry fixed codes only (never name, phone, IP, token, pass hash, lead id, context or body).
Contract types: src/lib/lead-gate/contract.ts (client-safe).

### 5.1 Token and cookie
- Cookie `aspire_tool_pass`: HttpOnly, SameSite=Lax, Path=/, Secure in production, Max-Age = 180 days.
- Value `lg1.<passId>.<expiresAtSeconds>.<sig>`: `passId` = 32 random bytes base64url; `sig` = HMAC-SHA256
  (`LEAD_GATE_SECRET`, `lg1.<passId>.<exp>`), base64url, compared in constant time.
- Server lookup (`resolveLeadGateAccess`): signature + expiry checked first (no DB work for junk); then
  `crm_gate_passes` by SHA-256(passId) joined to a non-erased lead, `expires_at > now`, and `consent_version` in
  `ACCEPTED_PASS_CONSENT_VERSIONS` (gate versions + enquiry versions). Fixed expiry, no sliding.
- Order: gate off → `off`; any verified session → `session`; live pass → `pass`; else locked. `required` degrades to
  `optional` while the flood breaker is tripped. A dead cookie is cleared in the response.
- Cleared by: "Not you?" (DELETE), withdrawal (all passes of the lead), sign-out (`/api/auth/logout`), erase, expiry,
  a retired consent version, a rotated secret. Sign-out also removes the local hints (`clearToolStorage`, prefix
  `aspire.leadgate.`).
- Threat model: a stolen cookie can only unlock tools and append `tool_use` rows to that lead; it reveals nothing.

### 5.2 `GET /api/lead-gate` → 200
`{ ok:true, data:{ mode:"off"|"optional"|"required", unlocked:boolean, via:"off"|"session"|"pass"|null, recordsUse:boolean, expiresAt:ISO|null } }`
· 429 (600 / 10 min per IP bucket) · 500. Prerender bail-outs re-throw. Re-issues a refreshed session cookie; clears a
dead pass cookie.

### 5.3 `POST /api/lead-gate` (≤ 4 KB)
Body: `{ studentName (2–80), phone (enquiry phoneSchema + implausible check), currentClass (CLASS_OPTIONS),
submittedBy:"student"|"parent", consent:true, consentVersion:"2026-10-21.gate.v1", tool:"predictor"|"mock-test"|"ask"|"planner", context?: {page, locale, utm_*, referrer, toolExam, toolBand}, website? }`.
Order and answers:
1. 403 cross-origin.
2. Gate off → 200 `{unlocked:true, via:"off"}`; signed in → 200 `{via:"session"}` (nothing stored, body unread).
3. 429 per IP bucket (60 / 10 min).
4. 415 / 413 / 400 / 422 (`fieldErrors`; `consentVersion` error = stale page).
5. Honeypot → 201 with the normal body and a cookie that never works; nothing stored.
6. Flood breaker → 503 `not_configured` "Sharing details is paused right now. Nothing was saved."
7. Per-phone cap (5 new submissions / 24 h, hashed key, own limiter): past it the pass binds to the existing lead
   with no new submission; if the number has no lead → 429 with `X-Lead-Gate-Limit: phone`.
8. Capture + pass in one transaction; previous pass of this browser revoked. 201
   `{ unlocked:true, via:"pass", recordsUse, expiresAt }` + Set-Cookie — identical for new and existing families.
9. Store failure → 500 "We couldn't save your details. Nothing was saved. Please try again." — no cookie.

### 5.4 `DELETE /api/lead-gate[?withdraw=1]` → 200 `{ forgotten:true, withdrawn:boolean }`
Same-origin; 30 / 10 min per IP bucket; idempotent; always expires the cookie. `withdraw=1` with a live pass:
`withdrawGateConsent` (all passes revoked, open lead → lost/not_interested, `consent_withdrawn` entry, audited).

### 5.5 `POST /api/lead-gate/usage` (≤ 1 KB) → 200 `{ recorded:boolean, reason?:"off"|"session"|"no_pass"|"not_recorded" }`
Body `{ tool:"predictor"|"planner", exam, band? (predictor only, "score-a-b"/"percentile-a-b"), page? }`; `ask` /
`mock-test` → 422 (recorded server-side, cannot be spoofed). 429 at 600 / 10 min per IP bucket or 120 / hour per
pass. The client ignores failures and forgets its hint on `no_pass`.

### 5.6 `/api/ask` guest enforcement — contract for the BACKEND owner (not applied yet)
POST order (★ = new):
1. same-origin (403) → configured (503).
2. ★ `const gate = await resolveLeadGateAccess();` — it already calls `getCurrentSession()`; use `gate.session` instead
   of a second call.
3. ★ `if (gate.enforce) { askLog({ ...logBase, outcome: "gate_required" }); return applyLeadGateCookies(leadGateRequiredResponse("Share a contact number once to get answers from Rancho."), gate); }`
   — BEFORE `exhaustedAllowance` and BEFORE `parseJsonBody` (the ≤ 5.6 MB body is never read); nothing reserved or counted.
4. `resolveAsker(gate.session, …)` unchanged (must-change-password sessions are charged as guests).
5. ★ Spend bound per family (critique 1.3): when `gate.via === "pass"`, check AND reserve both `{scope:"ip", id}` and
   `{scope:"lead", id: gate.pass.leadId}` (each `guestDaily`); refuse when either is used up. `UsageKey.scope` gains
   `"lead"` (hashed with the day like the others). Global cap unchanged; a pass never raises an allowance. Tell the
   owner: the global cap is the real ceiling.
6. Body, reservation, streaming unchanged.
7. ★ On a counted answer only (`end_turn` / `max_tokens`): `recordLeadGateToolUse(gate, { tool: "ask", key: "rancho" })`
   — never the question, topic, subject, answer or a photo flag. Refusals, upstream errors, aborts record nothing.
8. ★ Every response goes through `applyLeadGateCookies(response, gate)` (replaces `withSessionCookie`).

GET: `AskStatus.access = gate.unlocked ? "open" : gate.mode === "required" ? "gate_required" : "gate_optional"`.
Client (ask-client.ts, rancho-chat.ts): failure kind `"gate"` ONLY when `isLeadGateResponse(response)`.
Tests to add: 401 + header when locked with the body stream never read (spy) and `reserveQuestion` not called;
session → streams, no `tool_use`; pass → streams + one `tool_use {tool:"ask", key:"rancho"}`; refusal/upstream error →
none; optional/off → no 401; GET `access` values; a pass used from two IPs shares the per-lead allowance;
must-change-password session → no gate, guest allowance.

### 5.7 `/api/mocktest/score` — contract for the mock-test owner (not applied yet)
After the IP limit, BEFORE the body: `gate = await resolveLeadGateAccess()`; if `gate.enforce` and the attempt is not
grandfathered → `leadGateRequiredResponse("Share a contact number once to see your score.")`; nothing scored.
Grandfathered (never gated): an attempt whose server-recorded start (from `/api/mocktest/start`) is before
`gate.since`. Body gains `record?: true`, sent by ResultView only for the FIRST scoring of a local attempt (no
`LocalAttempt.score` yet); then, via pass only, `recordLeadGateToolUse(gate, { tool:"mock-test", key: testId, testId,
exam, scoreBand: mockScoreBand(score, max) })` in try/catch. Signed-in flows (`/attempts`) unchanged.

### 5.8 `/api/enquiries` (implemented; body contract unchanged)
After a STORED enquiry (CRM mode; not honeypot, not capped, not store-failed) the 201 also carries
`Set-Cookie: aspire_tool_pass=…` unless the gate is off or the browser already holds a signed pass. That pass keeps the
enquiry's consent version and `record_use = 0` (tool use is never noted under the enquiry sentence).

### 5.9 `/api/auth/logout` (implemented)
Also revokes the pass behind `aspire_tool_pass` and expires the cookie.

---

## 6. Client kit (src/components/lead-gate; implemented)

- `useLeadGate({ tool, enforced?, onUnlocked? })` → `{ status, mode, via, recordsUse, gateOpen, requestAccess(),
  markRequired(), closeGate(), recordUse(summary), forget(), formProps }`. `gateOpen` = asked and no unlock since, so it
  closes when ANY host or tab unlocks; `onUnlocked({ byThisHost, via })`.
- `<LeadGateForm {...gate.formProps} messages={t} summary? variant="panel"|"compact" headingLevel={2|3} submitLabel? focusOnMount? privacyHref? signInHref? />`
  — its own `<form>`, inline; fields name → parent's mobile → class → "I am the" radiogroup → consent (unticked, hidden
  `consentVersion`) → honeypot; status line (`role=status`), small print, "remember" line, "Sign in instead".
  Optional mode: "Continue without sharing" (same size). Browser-only tools after a server/network/rate failure: "Show
  my result without saving".
- `<LeadGateNote messages={t} />` — up-front disclosure from the live mode; nothing when off/satisfied/unknown.
- `<LeadGateIdentity messages={t} onForgotten? />` — under results unlocked by this browser's pass; no name; "Not
  you?" and "Stop Aspire contacting me" (confirm step).
- Store (`leadGateStore`): one in-flight status request; hint `aspire.leadgate.v1` `{until ≤ 24 h, recordsUse, mode}`
  written only after the server confirms a pass; skip `aspire.leadgate.skip.v1` (30 days); `storage` event sync;
  fail-open for browser-only tools; `markRequired()` on the gate 401.
- Transport: `isLeadGateResponse(response)` for tool owners.
- Messages: namespace `leadGate` (en + hi), registered in src/i18n/messages/{types,index}.ts; hosts pass it from the
  server (`getMessages("leadGate")` / `messagesFor(locale, "leadGate")`).
- A11y: visible labels; `aria-required`; `aria-invalid` + `aria-describedby` on errors; focus to the first invalid
  field; radiogroup fieldset with legend; ≥ 44 px targets; heading `tabIndex=-1` focused only after a user action; the
  gate is never inside an `aria-live` region (only its own status line is); never pre-ticked.
- Honesty: say up front a number is needed; never "verify"/"OTP sent"; never "saved" unless the server stored it;
  skip only in optional mode; never claim results are "being prepared".

---

## 7. Abuse and limits (single instance, in memory — same caveat as enquiries)

| What | Limit / behaviour |
|---|---|
| Unlock per IP bucket (IPv6 /64) | 60 / 10 min (own limiter; never touches the enquiry allowance) |
| New submissions per number | 5 / 24 h (hashed key); past it: pass bound to the existing lead, no new activity |
| New gate leads, site-wide | breaker at `LEAD_GATE_MAX_NEW_LEADS_PER_HOUR` (300): 503 + gate degrades to optional |
| Status | 600 / 10 min per IP bucket |
| Usage | 600 / 10 min per IP bucket; 120 / h per pass; merged per day anyway |
| Forget | 30 / 10 min per IP bucket |
| Bodies | 4 KB unlock, 1 KB usage |
| Junk | honeypot (dead cookie, logged), implausible numbers rejected with an honest message, counsellors mark `wrong_number` (never reopened by the gate) |
| AI spend | `/api/ask` 401 before allowance and body; per-lead + per-IP allowance for passes; global cap is the real ceiling |

What the gate cannot do (tell the owner plainly): the predictor, homepage widget and planner run in the browser with
their tables shipped to the page — their gate is lead capture UX, not access control (devtools bypass it).
`/api/predictor/card` stays public for share previews (a crafted URL shows a band; accepted). Only `/api/ask` and
`/api/mocktest/score` are truly enforced.

---

## 8. Per-tool integration points (owners: see §14)

Pattern for a browser-only tool:

```tsx
const gate = useLeadGate({ tool: "predictor", onUnlocked: () => show(pendingResult) });
async function onSubmit(e) { e.preventDefault(); const r = compute(); if (r.status !== "ok") return showErrors(r);
  if (isSample || (await gate.requestAccess())) show(r); }
{gate.gateOpen && <LeadGateForm {...gate.formProps} messages={tGate} summary={{ exam, band }} />}
// after a result is shown: gate.recordUse({ exam, band, page: location.pathname }); under it: <LeadGateIdentity messages={tGate} />
```

8.1 **Predictor (full page)** — PredictorApp: validate first (`matchColleges` / `valueError`), gate only when the
outcome is `ok` and the data is not sample (`hasSampleData`); call `preventDefault` synchronously and show a pending
label while `requestAccess()` runs; render the panel form in the result `<section>` (outside the input form);
`onUnlocked` → show the result, focus its heading; `recordUse({ exam, band })` per explicit submit with an ok result
(band from `shareBucketFor` + `bucketRange` + `predictorBand`); live what-if edits are not re-gated;
`<LeadGateIdentity>` under the result title; `<LeadGateNote>` near the submit; rewrite `form.privacy`.
8.2 **Homepage widget, predictor** — HomeToolsPredictor: same, `variant="compact"`, in the result slot; announcement
only after unlock; HomeTools (server component) passes `messagesFor(locale, "leadGate")`; page stays static.
8.3 **Homepage widget, planner countdown** — NOT gated (public fact; critiques 0.9 / 1.15).
8.4 **Mock tests** — runner intro: `<LeadGateNote>`; tests ≥ 60 min call `requestAccess()` before
`/api/mocktest/start` (form on the start screen); `/score` per §5.7; `useScoredAttempt`: a response with
`isLeadGateResponse` → state `locked` (+ `gate.markRequired()`); ResultView `locked` → panel form ("Your test is
submitted and saved on this device") with `enforced`; `onUnlocked` → reload; certificate/parent-report pages → a note
and a link to the result page (no second form); MyAttempts unchanged.
8.5 **Study planner** — guest mode only, first plan generation only: hold `pendingSettings`, form under PlanForm in
the same card, `onUnlocked` → apply + `recordUse({ exam })`; existing guest plans and edits never gated; offline →
fail-open; account mode never gated; identity line in the status row.
8.6 **Rancho** — /tools/ask (AskAspire / RanchoChat), /rancho (RanchoChat), floating chat (RanchoChatPanel), homepage
Ask tab: all go through `/api/ask` (§5.6). On `isLeadGateResponse` (or `AskStatus.access` gate_*) hold the question
and photo, `gate.markRequired()`, render `<LeadGateForm enforced variant="compact">` in the answer area / dialog log
(its own form, composer disabled, dialog via `showModal`/full height while it shows). `onUnlocked({ byThisHost })`:
own form → resend once automatically; unlocked elsewhere → "Unlocked — Send now". "New chat" clears the pending turn.
Rancho's in-chat tool cards (e.g. predict_rank) are covered by the `/api/ask` gate.
8.7 **CRM UI** — WP9 (§3).

---

## 9. Known limitations and Phase 2

- Do-not-contact list surviving erase (HMAC phone key, staff UI) — needed before high volume (critique 0.3).
- One-tap "Request a call back" for pass holders (`POST /api/lead-gate/callback`: same-origin, pass required, adds a
  `submission` with `topic: "callback"` + tool context, 1 / day / lead) instead of re-asking on /admissions.
- Retention purge job for unconverted `source=tool` leads (CRM-3; precondition).
- `LeadGateForm` interactive flows run only in a browser (no DOM in vitest): manual checklist §13.2.
- In-memory limiters and breaker: single instance only (as enquiries).
- `/login?next=` cannot return to a tool.

---

## 10. Rollout preconditions and rollback

Turn `LEAD_GATE` on only when ALL hold: official predictor tables and real mock tests are loaded (sample data off);
the privacy notice `{tbc}` items are filled and §11 is published in en + hi; counsel has answered TG-1, TG-2, TG-4
(recommendation: start with `optional`); the retention purge (CRM-3) exists; WP2–WP9 shipped in ONE release with the
copy changes of §11.4; HT-1/HT-2 rewritten; `LEAD_GATE_SECRET` set; `LEAD_GATE_SINCE` set to the switch-on time;
`/` , `/tools/predictor`, `/tools/planner` still static in the `next build` route table.
Rollback: `LEAD_GATE=off` (or `optional`) in `.env`, then `docker compose up -d` (recreate; no rebuild). Pages need no
change because the note reads the live mode.

---

## 11. Privacy notice and copy (WP10, lead-owned files: legal.ts en/hi + privacy page)

### 11.1 New section "Free student tools: contact details before results"
**en**
- When this is switched on, the free tools (rank & college predictor, mock-test scores, study planner and Rancho) ask
  once for contact details before showing a result, unless you are signed in to an Aspire account. We ask for: the
  student's name, a parent's or guardian's mobile number (WhatsApp), the class, and whether you are the student or a
  parent or guardian, plus your consent.
- Why: so that Aspire's counsellors can call or WhatsApp your family about Aspire's courses and admissions. The
  details join the same admission record as the enquiry forms (one record per mobile number), with the same staff
  access, logging and retention.
- With the details we also keep: the page you were on, the campaign tags of the link you arrived by, the website that
  referred you, which tool asked, and for the rank predictor the exam and score range shown.
- While this browser holds your details, Aspire may note which tools are used here, merged into one entry per tool
  per day: the rank predictor's exam and score range; the mock test and a 10-point score range (for example 40–49%);
  the study planner's exam; and that Rancho was used. We never record your answers, questions, photos, exact scores,
  category, state, gender or dates. These notes are deleted after 90 days.
- No OTP is sent, so please use a number your family really uses. If someone used your number, tell Aspire and the
  record will be corrected or deleted.
- Under every unlocked result, "Not you?" makes this browser forget your details, and "Stop Aspire contacting me"
  withdraws your consent: every browser forgets your details, tool notes stop, and Aspire stops contacting you about
  the tools. Signing out also makes the browser forget them. To have your details deleted: {tbc}.

**hi**
- यह सुविधा चालू होने पर, मुफ़्त टूल (रैंक और कॉलेज प्रेडिक्टर, मॉक टेस्ट के स्कोर, स्टडी प्लानर और Rancho) परिणाम दिखाने से
  पहले एक बार संपर्क विवरण पूछते हैं, जब तक आप Aspire खाते में साइन इन न हों। हम पूछते हैं: विद्यार्थी का नाम, माता-पिता या
  अभिभावक का मोबाइल नंबर (WhatsApp), कक्षा, और आप विद्यार्थी हैं या माता-पिता/अभिभावक, साथ में आपकी सहमति।
- क्यों: ताकि Aspire के काउंसलर Aspire के कोर्स और प्रवेश के बारे में आपके परिवार को कॉल या WhatsApp कर सकें। ये विवरण
  पूछताछ फ़ॉर्म वाले उसी प्रवेश रिकॉर्ड में जुड़ते हैं (हर मोबाइल नंबर का एक रिकॉर्ड), और उन पर स्टाफ़ की वही पहुँच, लॉगिंग और
  रखने की अवधि लागू होती है।
- इन विवरणों के साथ हम यह भी रखते हैं: आप किस पेज पर थे, जिस लिंक से आप आए उसके कैंपेन टैग, आपको भेजने वाली वेबसाइट, किस
  टूल ने पूछा, और रैंक प्रेडिक्टर के लिए दिखाई गई परीक्षा और अंकों की सीमा।
- जब तक इस ब्राउज़र में आपके विवरण हैं, Aspire यह नोट कर सकता है कि यहाँ कौन-से टूल इस्तेमाल हुए, हर टूल की हर दिन एक
  प्रविष्टि में: रैंक प्रेडिक्टर की परीक्षा और अंकों की सीमा; मॉक टेस्ट और 10 अंकों की स्कोर-सीमा (जैसे 40–49%); स्टडी प्लानर
  की परीक्षा; और यह कि Rancho इस्तेमाल हुआ। हम आपके उत्तर, प्रश्न, फ़ोटो, सटीक स्कोर, श्रेणी, राज्य, लिंग या तारीख़ें कभी दर्ज
  नहीं करते। ये नोट 90 दिन बाद हटा दिए जाते हैं।
- कोई OTP नहीं भेजा जाता, इसलिए कृपया वही नंबर दें जो आपका परिवार सच में इस्तेमाल करता है। अगर किसी ने आपका नंबर डाल दिया
  हो, तो Aspire को बताएँ; रिकॉर्ड ठीक कर दिया जाएगा या हटा दिया जाएगा।
- हर खुले परिणाम के नीचे “आप नहीं हैं?” चुनने पर यह ब्राउज़र आपके विवरण भूल जाता है, और “Aspire मुझसे संपर्क न करे” चुनने पर
  आपकी सहमति वापस हो जाती है: हर ब्राउज़र आपके विवरण भूल जाता है, टूल के नोट बंद हो जाते हैं, और Aspire टूल के बारे में आपसे
  संपर्क करना बंद कर देता है। साइन आउट करने पर भी ब्राउज़र इन्हें भूल जाता है। अपने विवरण हटवाने के लिए: {tbc}।

### 11.2 Cookies (replace p1, add p3)
**en p1:** This website does not use analytics or advertising tools, or embedded third-party content such as maps or
chat widgets. It sets only the cookies described below. If that changes, this notice will be updated first.
**en p3:** Free tools: after you share contact details (or send an enquiry), the website sets a cookie
(“aspire_tool_pass”) that lets the tools show results in this browser without asking again for up to 6 months. It
holds a random signed code, not your details, and cannot be read by scripts on the page. It is not needed for the
website to work: it links your use of the tools on this browser to the details you shared. It is removed when you
choose “Not you?”, sign out, or clear your cookies. The browser also keeps a small note (“aspire.leadgate.v1”, and
“aspire.leadgate.skip.v1” if you chose to continue without sharing) that holds no personal details.
**hi p1:** यह वेबसाइट एनालिटिक्स या विज्ञापन टूल, या मैप या चैट विजेट जैसी बाहरी सामग्री का इस्तेमाल नहीं करती। यह केवल
नीचे बताई गई कुकीज़ सेट करती है। अगर यह बदलता है, तो यह सूचना पहले अपडेट की जाएगी।
**hi p3:** मुफ़्त टूल: संपर्क विवरण साझा करने (या पूछताछ भेजने) के बाद वेबसाइट एक कुकी (“aspire_tool_pass”) सेट करती है,
जिससे टूल इस ब्राउज़र में 6 महीने तक दोबारा पूछे बिना परिणाम दिखा सकते हैं। इसमें एक रैंडम, हस्ताक्षरित कोड होता है, आपके
विवरण नहीं, और पेज की स्क्रिप्ट इसे पढ़ नहीं सकतीं। वेबसाइट चलाने के लिए यह ज़रूरी नहीं है: यह इस ब्राउज़र पर टूल के इस्तेमाल
को आपके साझा किए गए विवरणों से जोड़ती है। “आप नहीं हैं?” चुनने, साइन आउट करने या कुकीज़ साफ़ करने पर यह हट जाती है।
ब्राउज़र एक छोटा नोट भी रखता है (“aspire.leadgate.v1”, और बिना साझा किए आगे बढ़ने पर “aspire.leadgate.skip.v1”), जिसमें
कोई निजी विवरण नहीं होता।

### 11.3 Tools items (privacy.tools.items)
- **Predictor (replace) en:** Rank & college predictor: your inputs are used to calculate your result in your browser.
  If the tools ask for contact details first (see “Free student tools: contact details before results”), the exam and
  score range are kept with those details; your exact score, category, state and gender are never kept. The link of a
  shared result card contains only the exam and a score range.
  **hi:** रैंक और कॉलेज प्रेडिक्टर: आपकी जानकारी से परिणाम आपके ब्राउज़र में ही निकाला जाता है। अगर टूल पहले संपर्क विवरण
  पूछते हैं (देखें “मुफ़्त विद्यार्थी टूल: परिणाम से पहले संपर्क विवरण”), तो परीक्षा और अंकों की सीमा उन विवरणों के साथ रखी
  जाती है; आपका सटीक स्कोर, श्रेणी, राज्य और लिंग कभी नहीं रखे जाते। साझा किए गए परिणाम कार्ड के लिंक में केवल परीक्षा और
  अंकों की सीमा होती है।
- **Mock tests (append) en:** If you shared contact details to see your score, the test and a 10-point score range are
  noted with them. **hi:** अगर आपने अपना स्कोर देखने के लिए संपर्क विवरण साझा किए हैं, तो टेस्ट और 10 अंकों की स्कोर-सीमा
  उनके साथ नोट की जाती है।
- **Planner (append) en:** If you shared contact details to make a plan, the exam is noted with them; your dates and
  progress stay in this browser. **hi:** अगर आपने प्लान बनाने के लिए संपर्क विवरण साझा किए हैं, तो परीक्षा उनके साथ नोट की
  जाती है; आपकी तारीख़ें और प्रगति इसी ब्राउज़र में रहती हैं।
- **Rancho (append) en:** If you shared contact details to use the tools, Aspire notes that Rancho was used (not your
  question, its subject or your photo). **hi:** अगर आपने टूल इस्तेमाल करने के लिए संपर्क विवरण साझा किए हैं, तो Aspire यह
  नोट करता है कि Rancho इस्तेमाल हुआ (आपका प्रश्न, उसका विषय या आपकी फ़ोटो नहीं)।
- **Collect table:** add a "Student tools" column: student's name ✓, parent's/guardian's mobile ✓, class ✓,
  student-or-parent ✓, email —, message —.

### 11.4 Copy that becomes untrue and must change in the SAME release
home.ts `tools.points.free` ("no sign-up needed") and `points.private`; the HomeTools doc comment; tools.ts
`hero.lead` ("No sign-up needed to start") and the hub note; predictor.ts `form.privacy`; mocktest.ts list
description; planner.ts privacy, intro, settings.privacy; ask.ts / rancho.ts / ranchoApp.ts privacy notes;
docs/ask-aspire.md ("Guests: nothing is stored except a hashed per-day question counter"); checklist rows HT-1 / HT-2;
"Free" meta titles and JSON-LD `isAccessibleForFree` (ask counsel, TG-7); external posts that say "no sign-up".
Use mode-agnostic wording (e.g. "Free. You may be asked for a contact number once before results").

---

## 12. DPDP / legal checklist — proposed section 17 "Contact details before tool results (added 21 Oct 2026)"

- **TG-1 — Consent must be free, specific, informed, unconditional, limited to necessary data (DPDP Act 2023 s.6(1)).**
  Making marketing contact a condition of a free calculation may be held not "necessary" or not freely given. Decide
  `required` vs `optional` (config only). Recommendation: launch `optional` until counsel signs off.
- **TG-2 — Children (s.9).** s.9(1) verifiable parental consent before processing a child's data; self-declared
  "I am the parent / my parent agrees" with no OTP is not verifiable. s.9(3) bars tracking / behavioural monitoring /
  targeted advertising directed at children — the per-day `tool_use` notes are the closest fit
  (`LEAD_GATE_RECORD_USE=parent|off` exists). DPDP Rules 2025: Rule 10 verifiable-consent methods phase in about 18
  months after notification (≈ May 2027 — counsel to confirm); the Fourth Schedule educational-institution exemption
  likely does not cover marketing to prospects. Counsel to advise: parent's number only? age question? class 6–8? purge
  or reconfirm `submittedBy=student` leads before Rule 10 applies?
- **TG-3 — Dark patterns (CCPA Guidelines 2023):** forced action, bait-and-switch, nagging, interface interference.
  Mitigations built: up-front note from the live mode, long tests ask at the start, existing data never gated,
  remembered and equal-weight skip in optional mode, never pre-ticked, honest status copy.
- **TG-4 — Consent wording and channels** (`2026-10-21.gate.v1`, en + hi; phone + WhatsApp only, no email). Question,
  not a claim: is an unverified web tick (stored version, text, time) enough to call DND-registered numbers under TRAI
  TCCCPR 2018, given the person who ticked may not own the number?
- **TG-5 — No OTP / wrong numbers.** Procedure: counsellor first-call script reconfirms the number holder and their
  consent before any pitch; mark `lost: wrong_number` (the gate never reopens it); erase on request. Gap: no
  do-not-contact list across erase yet (§9).
- **TG-6 — Retention.** Pass 6 months; `tool_use` 90 days; leads per CRM-3 (proposal: unconverted 18 months after last
  activity — tool use never extends it); erase deletes passes and tool notes. Purge job required before launch.
- **TG-7 — Marketing copy** (§11.4): "Free … no sign-up needed" claims, meta titles, JSON-LD, social posts.
- **TG-8 — Notice completeness and processors.** `about.p2` (data fiduciary + contact), `rights.p1/p2` (access,
  correction, erasure, withdrawal, grievance, Board), `retention.p1`, `tools.p2`, `access.p2` (service providers,
  including AI assistants that staff use on lead data through MCP — Anthropic) must be filled before any mode but `off`.
- Extends FP-11 / CRM-2 / LG-1. Add every `leadGate` string and the §11 drafts to docs/hindi-review-register.md.

---

## 13. Test strategy

### 13.1 Automated (vitest, node, `--maxWorkers=1`)
- src/lib/lead-gate/lead-gate-lib.test.ts — token sign/verify/expiry/tamper/wrong secret/malformed; contract (each
  field, implausible numbers, stale consent, endpoints reject each other's versions, usage schema refuses ask/mock-test,
  `mockScoreBand` edges incl. negative); config (default off, sample data, store off, no/short secret, dev fallback,
  switches, `LEAD_GATE_SINCE`); IPv6 /64 buckets; flood breaker; consent registry = messages (en + hi); en/hi key and
  placeholder parity; no "verify"/"OTP sent"/"Ask Aspire".
- src/lib/crm/gate.test.ts — capture as `tool` with submitter/consent/attribution; Unassigned option; dedupe into an
  enquiry lead without consent downgrade; lost lead never reopened (enquiry still reopens); phone cap binds without a
  submission / `no_lead`; previous pass revoked, ≤ 10 per lead, expiry sweep; all-or-nothing transaction;
  `recordToolUse` per-day merge, IST midnight, per-tool facts only, refuses erased/unknown; TTL sweep; erase deletes
  passes + tool notes (audit counts); withdrawal (stage, activities, audit, not undone by the gate, enrolled kept).
- src/app/api/lead-gate/lead-gate-api.test.ts — GET locked/off/sample/session (student, parent, must-change-password),
  prerender bail-out; POST happy path + cookie attributes + Secure in production + only hash stored; identical body
  new vs existing and no names; 422 per field / implausible / stale version; 403/415/413/400; IP limit + IPv6 /64;
  phone cap; honeypot; session/off 200; store failure 500 without cookie or leaked details; breaker 503 → optional →
  recovers; tampered/expired/erased → locked + cookie cleared; DELETE forget/idempotent/cross-origin; withdraw;
  usage recorded/merged/page stripped; ask/mock-test 422; no_pass/session/off/not_recorded; per-pass 429; the gate 401
  helper + `isLeadGateResponse`; `resolveLeadGateAccess` + `recordLeadGateToolUse`; sign-out clears the pass; a stored
  enquiry sets a non-recording pass (body unchanged), not for honeypot/off; logs never contain name, phone, IP, token,
  context or secret.
- src/components/lead-gate/lead-gate-ui.test.ts — store (single request, hint written only when confirmed, corrupt /
  expired hints, throwing storage, fail-open, offline, submit events with host id, markRequired, skip only optional +
  remembered, forget, recordUse + `no_pass`, cross-tab sync); transport outcome mapping; form model (payload, contract
  validation, stale consent, localisation, attribution); static render en + hi (labels, aria-required, unticked
  consent + version, honeypot, one form, radiogroup, links, no skip unless optional); note/identity visibility;
  `useLeadGate` initial binding.
- Tool owners add: §5.6 / §5.7 tests; per-host pure gate reducers (predictor, homepage predictor, planner, ask, chat)
  incl. offline / 5xx / 429 fail-open; "/ , /tools/predictor, /tools/planner still static" in the build route table.

### 13.2 Manual browser checklist (once, before switching on)
en + hi; 320 px and 1366 px; keyboard only (tab order, focus to the heading after submit, first invalid field);
screen reader (labels, radiogroup, status line); two tabs (unlock in one, the other opens); cookie cleared while the
hint exists (server tools re-ask, browser tools recover after `no_pass`); private window; offline planner; optional
mode skip remembered; "Not you?" and "Stop Aspire contacting me"; sign-out then reload; enquiry form then predictor
(no second ask); a 3-hour mock test asks at the start.

---

## 14. Files and work packages

**Done (GATE-CORE, uncommitted):** src/lib/lead-gate/{contract,config,token,limits,log,server,handlers}.ts (+ test);
src/app/api/lead-gate/route.ts, usage/route.ts (+ test); src/components/lead-gate/{lead-gate-client,lead-gate-store,
use-lead-gate,lead-gate-form-model}.ts, LeadGateForm.tsx, LeadGateNote.tsx, LeadGateIdentity.tsx (+ test);
src/i18n/messages/{en,hi}/leadGate.ts + registration lines in types.ts/index.ts; src/lib/crm/gate.ts,
repo/gate-passes.ts (+ test) and edits to types.ts, capture.ts, admin.ts, leads.ts, access.ts, index.ts,
repo/activities.ts; src/lib/db/features/crm.ts (appended DDL); src/lib/server/enquiry-consent.ts (registry),
enquiry-capture.ts (lead id), enquiry-handler.ts (Set-Cookie); src/app/api/auth/logout/route.ts; src/lib/mocktest/
shared-device.ts (+ timing.test.ts expectation); .env.example; this file.

**Remaining (each after the agents now editing those files finish; ship together in one release with §11):**
WP2 predictor (§8.1) · WP3 homepage widget (§8.2–8.3) · WP4 mock tests incl. `/score` (§5.7, §8.4) · WP5 planner
(§8.5) · WP6 `/api/ask` (§5.6) · WP7 Ask page + /rancho · WP8 floating chat (§8.6) · WP9 CRM UI + reports + MCP strip
(§3, 0.13) · WP10 lead: privacy notice §11, checklist §12, D-043, docs/crm.md + docs/api.md + docs/mcp.md +
docs/integration-status.md, Hindi register, rollout §10. CRM-CORE: retention purge (CRM-3).

---

## 15. Open questions for the owner

1. Launch mode: `optional` (recommended until counsel answers TG-1/TG-2) or `required`?
2. Tool-use notes: `all` (current default per the lead), `parent`, or `off` until counsel answers TG-2?
3. Gate leads: auto-assign like enquiries (default) or an Unassigned "Free tool users" queue (`LEAD_GATE_ASSIGN=none`)?
4. Pass lifetime 6 months (proposed) — or 12 months?
5. Approve the consent sentence `2026-10-21.gate.v1` and the changed marketing copy (§11.4).
6. Should these leads also go to the enquiry webhook if one is configured? (Recommendation and current behaviour: CRM only.)
7. Should a family that shared details get a larger daily Rancho allowance? (Current: no; a pass is bounded per IP and per family.)
