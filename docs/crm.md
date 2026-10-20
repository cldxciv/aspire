# CRM — lead & admission engine (M7, Phase 1)

Owner: **CRM-CORE**. Decisions: D-037 – D-042 (`docs/m7-crm-plan.md`). This file is the contract for
CRM-CAPTURE (public forms → leads) and CRM-UI (staff workspace `/crm`). It is kept stable; additive
changes only.

- Types + constants (client-safe): `src/lib/crm/types.ts` — import from `@/lib/crm/types` in client components.
- Services (server-only): `src/lib/crm/index.ts` — import from `@/lib/crm` in route handlers / server components.
- SQL lives only in `src/lib/crm/repo/**` (D-037: a later move to Postgres touches only that layer).
- Schema: `src/lib/db/features/crm.ts` (`crm_*` tables, idempotent). Core migration 2 in
  `src/lib/db/connection.ts` adds the `staff` role.

## 1. Roles and permissions (D-038)

Core role **`staff`** (users table). CRM membership lives in `crm_staff`: `crm_role` = `counsellor` |
`manager`, `centre_slugs` (empty = all centres), `active`. Core **admins** use the CRM too, without a
membership row. A `staff` account WITHOUT an active membership row gets 403 from every CRM API.

| Action | counsellor | manager (scoped) | manager (unscoped) | admin | student / parent / guest |
|---|---|---|---|---|---|
| See a lead (list, detail, report rows) | assigned to them | lead centre ∈ scope, or assigned to them | all | all | — |
| Create a lead (walk-in / phone) | ✓ (assigned to self) | ✓ | ✓ | ✓ | — |
| Stage, notes, call/WhatsApp log, tasks, edit fields | on leads they see | on leads they see | ✓ | ✓ | — |
| Assign / unassign | — | leads they see → staff whose scope covers the lead's centre | any active staff | any active staff | — |
| My tasks | own | own | own | own | — |
| Funnel report | own leads | scope | all | all | — |
| CSV export (audited) | — | scope | all | all | — |
| Erase a lead (D-042) | — | — | — | ✓ | — |
| List staff / rules | — | read | read | read + write | — |
| Create staff accounts (`/api/admin/users`) | — | — | — | ✓ | — |

- Leads a viewer may not see answer **404** (no existence leak). Wrong role → 403, signed out → 401,
  temporary password not yet changed → 403 (same gate as the other portal APIs).
- `staff` reaches only `/crm/**` (pages) and `/api/crm/**` + `/api/auth/**` + `/api/session`. Every
  other portal API lists explicit roles and denies `staff` (deny by default). Staff never get
  student/parent portal data.
- Sign-in: the login form has a **Staff** tab (`role: "staff"`). The Admin and Staff tabs both accept
  admin and staff accounts (the role always comes from the account record). Staff land on `/crm`;
  admins keep landing on `/admin` and may open `/crm` (and `next=/crm/...` works for both).
- `/crm` and `/hi/crm/**` are portal paths: signed out → localised login with `next`; always
  `X-Robots-Tag: noindex, nofollow`; **no preview mode** (lead data area).

## 2. Integration notes

### CRM-UI (pages `/crm/**`, `src/components/crm/**`)
- `Role` now includes `"staff"`. `portalAreas` (`src/components/portal/areas.ts`) needs a `staff`
  entry (TypeScript requires it: `Record<Role, …>`), home `/crm`.
- Page gate: `requireCrmPage(path, locale)` from `@/lib/crm/page` (server-only, render under
  `<Suspense>`): returns `{ kind: "viewer", viewer, permissions }` or `{ kind: "no_membership" }` (a
  staff account with no active CRM membership — show a "not set up yet, ask an admin" panel);
  redirects to login when signed out / wrong role, and to the change-password page while a
  temporary password is pending. It wraps `requirePortalAccess(["staff", "admin"], …)`.
- Server components may call the services directly with that `viewer` (they are synchronous,
  read the DB, and return plain JSON-safe objects with ISO dates). Client components use the APIs.
- Phones: lists (`listLeads`, GET `/api/crm/leads`, `myTasks`) carry only a MASKED phone
  (`+91 ••••• •1234`) plus `phoneLast4`; the full E.164 number is only in `LeadDetail` (the audited
  `getLead` / GET `/api/crm/leads/:id`) and in the audited CSV export.
- Links (detail only): `tel:${lead.phone}` and `https://wa.me/${lead.phone.slice(1)}` (D-041). After
  the staff member calls/messages, POST `/contacts` to log it — nothing is sent by the system.
- Timeline names: assignment entries carry `meta.fromName` / `meta.toName` and task entries
  `meta.assigneeName` (staff display names, resolved when the lead is read); who did it is
  `actorName` (`actorId: null` = automatic).
- Tool ids: one spelling everywhere, the enquiry contract's (`predictor`, `mock-test`, `ask`,
  `planner`); early rows stored as `mocktest` are returned as `mock-test`.

### Capture (`/api/enquiries` → `src/lib/server/lead-sink.ts`, now owned by CRM-CORE)
```ts
import { captureLead, leadInputFromEnquiry } from "@/lib/crm";
const input = leadInputFromEnquiry(enquiry, { consentTextVersion, consentAt, context, reference });
const result = captureLead(input, Date.now()); // sync; { ok, leadId, isNew, assigneeId } | { ok: false, error }
```
- `leadInputFromEnquiry` is structural (works with the current contract and additive changes):
  `name` → `studentName` (hero/admissions/quick) or `contactName` (contact); `guardianName`;
  `preferredCentre` (`not-sure` → none); `topic` / `intent` → submission meta. Without `extras` it
  takes the enquiry's own `consentVersion` and `context` (`leadContextFromEnquiry`: snake_case utm →
  camelCase; tool ids unchanged).
- `lead-sink.ts` (`crmLeadSink`) is the adapter the enquiry handler uses: it passes the consent
  version + time + **language + exact sentence** (`consent.locale`, `consent.text`), the reference,
  and the context with the **page language** (`context.locale`) and the predictor's
  **exam + score band** (`context.toolExam`, `context.toolBand`). These are kept on the submission
  activity's `meta` (`consentLocale`, `consentText`, `locale`, `toolExam`, `toolBand`) as proof of
  consent / attribution; `LeadDetail.consentLocale` / `consentText` show the latest.
- Page paths are stored locale-free; %-encoded paths are decoded once (any-script letters, digits,
  `/ _ . ~ -`; ≤ 200 chars). The referrer is stored as a host only (`www.google.com`).
- Call it only after validation, the honeypot check and the consent tick (D-039). It never throws
  for bad input (returns `{ ok: false }`), but can throw on database errors — treat as "not stored".
- `captureLead` writes the audit row (`crm.lead_capture`, no personal data) itself.

## 3. API (all under `/api/crm`, JSON envelope `{ ok, data }` / `{ ok:false, error, message, fieldErrors? }`)

Every response: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`. Writes: same-origin
(403), `Content-Type: application/json` (415), body ≤ 8 KB (413), zod validation (422 with
`fieldErrors`). Rate limits per user (in-memory, single node): 600 reads / 5 min, 120 writes / 5 min,
10 exports / hour → 429 with `Retry-After`.

| Method & path | Who | Request | Response `data` |
|---|---|---|---|
| GET `/api/crm/me` | staff member, admin | — | `{ viewer: CrmViewer, permissions: CrmPermissions }` |
| GET `/api/crm/leads` | all | query: `stage` (stage or `open`), `centre` (slug or `none`), `program`, `source`, `assignee` (id, `me`, `unassigned`), `due` (`today`/`overdue`), `q`, `createdFrom`, `createdTo`, `sort` (`recent_activity`/`newest`/`oldest`/`due`/`name`), `page` (1…), `pageSize` (1–100, default 25) | `LeadPage` |
| POST `/api/crm/leads` | all | `ManualLeadInput` | 201 `{ leadId, isNew }` (existing phone → same lead, `isNew: false`, 200) |
| GET `/api/crm/leads/:id` | all (record check) | — | `LeadDetail` (audited `crm.lead_view`) |
| PATCH `/api/crm/leads/:id` | all (record check; `assigneeId` manager/admin) | `{ stage?, lostReason?, assigneeId?: string \| null, fields?: Partial<Record<EditableLeadField, string \| null>> }` | `LeadDetail` |
| POST `/api/crm/leads/:id/notes` | all | `{ body }` (1–2000 chars) | 201 `LeadActivity` |
| POST `/api/crm/leads/:id/contacts` | all | `{ channel: "call" \| "whatsapp", outcome: ContactOutcome, body? }` | 201 `LeadActivity` |
| POST `/api/crm/leads/:id/tasks` | all | `{ title, dueAt (ISO), assigneeId? }` | 201 `LeadTask` |
| POST `/api/crm/leads/:id/erase` | admin | `{ confirm: true, reason?: "family_request" \| "consent_withdrawn" \| "wrong_or_test" \| "no_longer_needed" \| "other" }` (`ERASE_REASONS`; kept on the erase entry and the audit row) | `{ leadId, erasedAt }` |
| PATCH `/api/crm/tasks/:taskId` | assignee, or anyone who sees the lead | `{ done: true }` | `LeadTask` |
| GET `/api/crm/tasks` | all | `range` = `today` / `overdue` / `upcoming` / `open` (default) / `done` | `MyTask[]` |
| GET `/api/crm/reports` | all (scoped) | `from`, `to` (ISO; default last 30 days) | `FunnelReport` (incl. `byTool`) |
| GET `/api/crm/export` | manager, admin | same filters as the list | `text/csv` attachment (audited `crm.export`) |
| GET `/api/crm/staff` | manager, admin | — | `CrmStaffMember[]` |
| PUT `/api/crm/staff/:userId` | admin | `StaffInput` (user must have role `staff`) | `CrmStaffMember` |
| GET `/api/crm/rules` | manager, admin | — | `AssignmentRule[]` |
| PUT `/api/crm/rules` | admin | `{ rules: AssignmentRuleInput[] }` (≤ 50; replaces all) | `AssignmentRule[]` |

Admin users API (existing, extended): `POST /api/admin/users` accepts `role: "staff"` with
`crm: { crmRole: "counsellor" | "manager", centreSlugs?: string[] }` (default: counsellor, all
centres) — the account and its membership are created in one transaction, both audited.
`GET /api/admin/users[?role=staff]` adds `crm: { crmRole, centreSlugs, active } | null` to staff users.

## 4. Data model (`src/lib/db/features/crm.ts`)

- `crm_staff` (user_id PK → users ON DELETE CASCADE, crm_role, centre_slugs JSON array, active, created/updated, created_by)
- `crm_leads` (id, created/updated_at, stage, furthest_stage, lost_reason, assigned_to → users ON DELETE SET NULL,
  centre_slug, program_interest, current_class, source, tool, page, referrer, utm_source/medium/campaign/term/content,
  student_name, guardian_name, contact_name, phone_e164 (UNIQUE when not null), email, message,
  consent_text_version, consent_at, staff_edited JSON, submission_count, last_activity_at, next_task_due_at,
  erased_at, erased_by). Indexes for the inbox: (assigned_to, last_activity_at), (centre_slug, …), (stage, …),
  (next_task_due_at), (created_at).
- `crm_activities` (id, lead_id → crm_leads CASCADE, type, body (staff note / call note, or the family's
  message on a `submission`), meta JSON (structured facts only), actor_id, at)
- `crm_tasks` (id, lead_id CASCADE, title, due_at, done_at, assignee_id, created_by, created_at, done_by)
- `crm_assignment_rules` (id, centre_slug|null, program_interest|null, member_ids JSON, active, position)
- `crm_rr_cursors` (scope_key PK, last_user_id, updated_at) — round-robin positions.

Times are epoch ms in SQLite, ISO strings in every service/API shape.

## 5. Capture, dedupe, assignment (D-039, D-040)

1. Consent required (`consent.textVersion` non-empty) → else `consent_missing`.
2. Phone → E.164: strip spaces/hyphens/brackets; accept `+91`/`91`/`0` prefix + 10 digits starting 6–9 →
   `+91XXXXXXXXXX`; anything else → `invalid_phone`.
3. **Dedupe** by `phone_e164` (one lead per family). Existing lead: append a `submission` activity,
   `submission_count + 1`, fill fields that are EMPTY and NOT staff-edited, update consent version/time,
   attribution (page/utm/tool) only if empty, latest non-empty `message` replaces the old one.
   A `lost` lead that enquires again is reopened to `new` (stage_change activity by the system).
4. **Auto-assignment** (new leads only): first active rule matching (centre + program) > (centre, any
   program) > (any centre, program) > (any, any) whose pool has active counsellors/managers → round-robin
   in that pool; else round-robin among active **counsellors** whose scope covers the lead's centre
   (empty scope = any centre); else unassigned ("Unassigned" queue, `assignee=unassigned`).
   Round-robin = next member id after the last one assigned in that pool (stable when the pool changes).

## 6. Stages, tasks

- Any stage may move to any other (staff correct mistakes). `lost` requires `lostReason`; leaving
  `lost` clears it. `furthest_stage` keeps the highest funnel stage reached (reports).
- Tasks: `dueAt` within −1 day … +2 years. Overdue = open and due before now. "Today" = the
  Asia/Kolkata calendar day. A lead's `next_task_due_at` = earliest open task.

## 7. Privacy, audit, retention, erase (D-042)

- Audit (`audit_log`, actions `crm.*`): `lead_capture`, `lead_create`, `lead_view`, `lead_update`
  (field names only), `stage_change`, `assign`, `note_add`, `contact_log`, `task_create`, `task_done`,
  `export` (row count + filter keys, never the search text), `lead_erase`, `staff_upsert`, `rules_set`.
  Details never contain names, phone numbers, emails, messages or note text.
- CSV export: admin/manager only, scoped, max 5000 rows; every cell that starts with `=`, `+`, `-`,
  `@`, tab or CR is prefixed with `'` (formula injection) — so phone numbers export as `'+91…`.
  No messages or notes in the export.
- Erase (admin): wipes names, phone, email, message, referrer, every activity body (notes, call notes,
  submission messages), task titles (open tasks are closed), the enquiry reference and any other
  meta key that is not a known non-personal fact (source, tool, page, consent version/language/text,
  stage changes, outcomes…); keeps an anonymised stub (stage, source, centre, program, class, dates, assignee)
  so funnel counts stay right. Erased leads leave the inbox (`includeErased` for admins), cannot be
  edited, and a new enquiry from the same phone creates a fresh lead. Lead gate (§11): erase also deletes
  the lead's gate passes (every browser is asked again) and all its `tool_use` entries; the audit
  details carry `{ gateBrowsers, toolUsesDeleted }`; `submittedBy` / `onLostLead` stay on the stub.
- Retention: TBC by Aspire (proposal: erase unconverted leads 18 months after last activity). Tool-use
  notes are deleted 90 days after their last use (hourly sweep) and never move `last_activity_at`.
  The retention purge (CRM-3) is **not built yet**, although the gate is on (checklist §17 TG-6).

## 8. Migration notes (core migration 2)

- `users.role` CHECK widened to include `staff` by rebuilding the table (SQLite cannot alter a
  CHECK): foreign keys OFF outside the transaction → create `users_rebuild_m7` → copy → drop
  `users` → rename → recreate `users_role_idx` → `PRAGMA foreign_key_check` must be empty (else
  ROLLBACK and the app refuses to start with a clear error) → commit → foreign keys back ON.
  Child tables (sessions, parent_links, mcp_tokens, ask_topics, mocktest_*, planner_*) reference
  `users` by name and keep working (tested on an old-schema database with data:
  `src/lib/db/migration-staff.test.ts`).
- A long-running dev server applies new core migrations / feature schemas to its open connection
  on the next `getDb()` after a code reload (no restart needed).
- Rollback: the rebuilt table is a superset; old code reading it works, but old code would refuse
  to map a `staff` row (`users.role holds an unknown value`) — disable staff accounts before rolling
  back.

## 9. How to create staff

1. Admin portal → Users → create account with role **Staff** (or `POST /api/admin/users`
   `{ role: "staff", displayName, loginId, crm: { crmRole: "manager", centreSlugs: ["shimla"] } }`).
   The temporary password is shown once; the user changes it at first sign-in.
2. Change role/scope/active later: `PUT /api/crm/staff/:userId`. Disable the account: `PATCH /api/admin/users/:id`.
3. Optional: assignment rules (`PUT /api/crm/rules`).
4. Dev: the live check created `dev.crm.manager` (manager, all centres); its password is in
   `.data/dev-credentials.txt` (git-ignored, never printed).

## 10. Open items

- Retention period (D-042) and its purge job (CRM-3). The privacy notice now describes enquiries and the
  lead gate (`legal.ts` `privacy.toolContact`), with the periods still "to be confirmed".
- Lead gate: no do-not-contact list that survives erase (an erased number that comes back starts a new
  lead); in-memory limiters and flood breaker (single node); one-tap "Request a call back" for pass
  holders is Phase 2 (docs/lead-gate-plan.md §9).
- Merge of two leads of one family with different phones (activity type `merge` is reserved).
- Rate limits are in-memory per process (single node, like auth/enquiries).
- A counsellor entering a walk-in whose phone already has a lead learns its id but cannot open it
  unless it is theirs (ask a manager to reassign).

## 11. Lead gate: contact details before free tools' results (D-043)

Design and full contract: `docs/lead-gate-plan.md` (§3 data model, §5 routes). **Owner decision 21 Oct 2026:
`LEAD_GATE=required` on the live site now, with an honest sample-data line in the form** (risks for counsel:
`docs/aspire-approval-checklist.md` §17). Public routes: `docs/api.md` → "Lead gate".

- **Source and tool.** Gate captures use source **`tool`** (shown as "Free tool (contact before result)");
  `lead.tool` is the tool that asked first (`predictor` | `mock-test` | `planner` | `ask` = Rancho on every surface),
  `lead.page` locale-free (`/` = homepage widget).
- **`captureLead(input, now, { gate: true, assignNew })`**: dedupe by +91 number as usual, but an EXISTING lead is never
  reopened (submission meta `onLostLead: true`), never re-assigned, and keeps its consent version/time when it has
  one (the submission keeps the gate sentence). `LEAD_GATE_ASSIGN=none` → `assignNew: false` (new leads Unassigned).
  `CaptureLeadInput.submittedBy: "student" | "parent"` is kept on the submission.
- **Activity kinds** (no migration):

  | kind | meta | notes |
  |---|---|---|
  | `submission` (gate) | `source: "tool"`, `tool`, `page`, `toolExam`, `toolBand` (predictor), `locale`, `consentTextVersion: "2026-10-21.gate.v1"`, `consentLocale`, `consentText`, `submittedBy`, `filled`, `onLostLead?` | one per unlock (none past the per-number cap) |
  | `tool_use` | `tool`, `key`, `exam?`, `band?` (predictor), `testId?` + `scoreBand?` (mock test), `page?`, `uses`, `lastAt` | one per lead + tool + key + India day; `key` = exam (predictor, planner), test id (mock test), `rancho`; deleted 90 days after last use and on erase; no audit row; never answers, questions, photos, exact scores, category, state, gender or dates |
  | `consent_withdrawn` | `via: "lead_gate"`, `browsersForgotten` | "Stop Aspire contacting me": all passes revoked; open lead → `lost` / `not_interested` (enrolled kept); audited `crm.gate_withdraw` |

- **Table `crm_gate_passes`** (`pass_hash` PK = SHA-256 of the pass id, `lead_id` → `crm_leads` ON DELETE CASCADE,
  `created_at`, `expires_at` (180 days, fixed), `consent_version`, `submitted_by`, `record_use`); ≤ 10 per lead; SQL
  only in `src/lib/crm/repo/gate-passes.ts`. A stored enquiry also issues a pass (`record_use = 0`, enquiry consent
  version): tool use is never noted under the enquiry sentence.
- **Services** (`@/lib/crm`): `unlockGateLead`, `issueGatePassForLead`, `findGatePass`, `revokeGatePass`,
  `revokeGatePassesForLead`, `recordToolUse`, `sweepToolUse`, `withdrawGateConsent`.
- **Lead detail / UI (WP9).** `consentText` shows the sentence behind the lead's own `consentTextVersion`; every
  consent is listed with its date; `tool_use` reads "Used a free tool" with one-line summaries ("Rank predictor ·
  JEE Main · score 180–189 · 3× today", "Mock test · <test> · 40–49 %", "Rancho", "Study planner · NEET");
  `submittedBy = student` is flagged "confirm with a parent first"; reports add a daily count of gate leads.
- **MCP.** `get_lead` returns `tool_use` entries WITHOUT `band` / `scoreBand` (stripped in `src/lib/mcp/tools/crm.ts`,
  critique 0.13): AI assistants see which tool was used, not the score range (`docs/mcp.md`).
- **Settings** (runtime `.env`, no rebuild): `LEAD_GATE` (`off` / `optional` / `required`), `LEAD_GATE_SECRET`,
  `LEAD_GATE_RECORD_USE` (`all` / `parent` / `off`), `LEAD_GATE_ASSIGN` (`auto` / `none`),
  `LEAD_GATE_MAX_NEW_LEADS_PER_HOUR` (300), `LEAD_GATE_SINCE`.
- **First call (no OTP).** Proposed procedure, pending Aspire's approval (checklist TG-5): confirm who holds the number
  and that they agree to be contacted before any pitch; otherwise mark `lost: wrong_number` (the gate never reopens
  it); erase on request.
