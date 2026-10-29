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
| Create staff accounts (`/api/admin/users`) | — | — | — | super admin only (D-044, §12) | — |

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

Since lead routing, staff logins are **super-admin only**; §12.5 has the current steps.

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

## 12. Lead routing: super admin, areas, the 1-hour call rule, Meta and CSV intake (D-044 – D-048)

Design: `docs/lead-routing-plan.md` (Part 3 is the contract). Code: `src/lib/crm/{arrival,settings,sla-state,lead-ops-types}.ts`,
`src/lib/crm/{routing,sla,meta,intake}/**`, `src/lib/auth/super-admin.ts`, `src/lib/server/secret-box.ts`. The three seams
`@/lib/crm/routing`, `@/lib/crm/sla`, `@/lib/crm/meta` are the only way the packages reach each other.

### 12.1 Roles (additions to §1)

- **Super admin (SA, D-044)** = an enabled `admin` account with an active row in `superadmin_grants` (not a new role;
  sessions are unchanged; checked per request). With exactly one enabled admin and no grant rows, the first request makes
  that admin SA (audited `auth.super_admin_bootstrap`); otherwise `npm run auth:super-admin -- list | grant | revoke |
  reset-password <login id>` on the server. At least one effective SA always exists (409/403 `last_super_admin`).
  Grant/revoke in Admin → Users needs the SA's current password. A non-SA cannot reset, disable or edit an SA
  (403, `superAdminTarget`).
- **SA only:** staff logins (create / edit / disable / reset, `PUT /api/crm/staff/:userId`), assignment rules, routing
  mode, areas and people, calling hours and the speed rule, CSV import, Meta settings / secrets / actions / inbox.
  Ordinary admins and managers see every settings page read-only ("Read-only: only a super admin can change this").
- **Area head** = CRM `manager` who is a member of one or more areas (`crm_staff_scope.mode = 'areas'`): sees leads
  assigned to them, leads routed to their areas, leads at their areas' centres, plus areas with no head of their own
  that their centre serves (one hop). An areas-scope manager with zero areas sees only assigned leads. A manager
  without a scope row keeps the legacy centre scope (listed under "Review" on the Areas page).
- **Executive** = CRM `counsellor` in an area (assigned leads only, unchanged). Staff land on `/crm/today`.

| Action | executive | area head | admin | super admin |
|---|---|---|---|---|
| Dashboard `/crm/dashboard` | — | own areas | all | all + Meta health, Unassigned, Tool sign-ups |
| SLA lists (`/api/crm/sla?view=`) | `mine` | `mine`, `area` | all but the SA queues | all (`escalated`, `unassigned`, `tool_signups`) |
| Away until … | self | self + own members | — | anyone |
| Reassign uncalled / open leads of a person | — | own members | — | ✓ |
| Change a lead's area | — | leads they see | — | ✓ |
| Settings pages | — | read | read | edit |
| CSV import | — | — | history | ✓ |
| Meta | — | status | status | ✓ (secrets never shown) |

### 12.2 API (additions to §3; same envelope, headers, same-origin writes and zod)

| Method & path | Who | Body / query → data |
|---|---|---|
| GET `/api/admin/super-admins` | admin | → `{ items, youAreSuperAdmin, bootstrapPending }` |
| PUT `/api/admin/super-admins/:userId` | SA | `{ superAdmin, currentPassword }`; 409 `last_super_admin`, 422 `not_admin` |
| GET `/api/crm/areas`, GET `/api/crm/areas/resolve?q=&state=` | manager, admin | `CrmArea[]` / `AreaResolution` |
| POST `/api/crm/areas`; PATCH `…/:areaId`; PUT `…/:areaId/members`; POST/DELETE `…/:areaId/aliases`; POST `…/merge`, `…/setup-from-centre`, `…/reroute`; GET `…/unmatched`; PUT `…/people/:userId` | SA | §13.6 of the plan |
| POST `/api/crm/areas/reassign` | SA; area head for own members | `{ fromUserId, scope: "uncalled" \| "open", toUserId? }` → `{ moved }` |
| PUT `/api/crm/availability` | self; area head for own members; SA | `{ userId, awayUntil \| null, note? }` (≤ 60 days) |
| PATCH `/api/crm/leads/:leadId/area` | SA; a manager who sees the lead | `{ areaId \| null }` |
| GET/PUT `/api/crm/settings/routing` | read manager/admin; write SA | `{ mode: "areas" \| "legacy", expectedVersion }` |
| GET/PUT `/api/crm/settings/speed` | read manager/admin; write SA | `{ callingHours?, speedRule?, expectedVersion: { … } }` → `{ callingHours, speedRule, recomputed }` |
| GET `/api/crm/sla?view=mine\|area\|escalated\|unassigned\|tool_signups`, GET `/api/crm/sla/summary` | scoped (a view beyond the role → 403) | `SlaQueuePage` / `SlaSummary` |
| GET `/api/crm/dashboard?from&to&area` | manager (area in scope, else 403), admin | `DashboardData` |
| POST `/api/crm/import/preview`, POST `/api/crm/import/batches`, POST `…/batches/:batchId/rows`, POST `…/batches/:batchId/finish`; GET `/api/crm/import/batches` | SA (GET: admin) | ≤ 256 KB and ≤ 250 rows per request |
| GET/PUT `/api/crm/integrations/meta`; PUT/DELETE `…/meta/secrets`; POST `…/meta/actions`; GET `…/meta/inbox?status=` | GET admin/manager (status only); the rest SA | secrets are write-only (`{ set, updatedAt, keyOk }`) |
| GET/POST `/api/integrations/meta/webhook` | Meta (public; HMAC-SHA256 of the raw body with the App Secret) | handshake / `{ ok: true }` |
| POST `/api/integrations/meta/sync` | loopback + `Authorization: Bearer $INTEGRATIONS_CRON_TOKEN` | `{ processed, enqueued }`; 404 without the token |

Changed: `GET /api/crm/leads` gains `area` (an id, `none`, `tool_signups`) and `sla` (`open`, `overdue`, `escalated`);
lists and `LeadDetail` carry `area` and `sla` (detail also `routing`, `origins`, `confirmConsent`). `POST /api/admin/users`
for `role: "staff"` is SA-only and takes `crm.areaIds`. `PUT /api/crm/staff/:userId` and `PUT /api/crm/rules` are SA-only.

### 12.3 Data model (features `superadmin`, then `crm_intake`, after `crm`; additive, `crm_leads` is never altered)

`superadmin_grants` · `crm_settings` (versioned JSON documents: `calling_hours`, `speed_rule`, `routing`, `areas_seed`,
`meta_config`, `meta_status`) · `crm_areas`, `crm_area_centres`, `crm_area_aliases`, `crm_area_members`,
`crm_staff_scope`, `crm_staff_availability` · `crm_lead_routing` (one row per lead: area, how matched, typed place) ·
`crm_sla_clocks` (one open first-call clock per lead) · `crm_external_refs` (`meta` lead ids and keyed `csv` refs:
idempotency) · `crm_erase_suppressions` (keyed hash of an erased family's phone) · `crm_import_batches` ·
`crm_meta_inbox` · `crm_integration_secrets` (AES-256-GCM envelopes, key `INTEGRATIONS_SECRET`).

### 12.4 Routing and the first-call rule (replaces §5 step 4 in areas mode)

1. **Area:** the family's centre → that centre's area; else the place they typed (website `district`, Meta
   district/city answer, CSV column, Add enquiry) through the resolver (aliases, Hindi names, spellings, fuzzy ≤ 1–2;
   "Bilaspur, Chhattisgarh" stays outside HP; `dharampur` is ambiguous). 12 districts are seeded once (no audit rows).
2. **Assignee:** the area's own eligible people (enabled, active, not away; executives, or heads with "takes leads"),
   preferring those tied to the effective centre → else the team of the area's serving centre (borrow) → else the legacy
   rules / centre round-robin (which skip anyone in an area) → else the area's queue, or **Unassigned** (SA), or
   **Tool sign-ups** for lead-gate-only arrivals (never auto-assigned in areas mode). Picking is load-aware (fewest open
   first-call clocks; ties by round-robin). `routing.mode = "legacy"` keeps today's rules.
3. **Clock:** new / reopened / first-enquiry arrivals from the policy's sources start a clock: due = arrival + 60
   working minutes inside the IST calling hours (default Mon–Sat 09:00–19:00, Sun 10:00–13:00, carried over across
   closing). Tier 1 (60 min) alerts the responsible heads (digest per executive), tier 2 (240 min) the SAs. The first
   human call / WhatsApp log or a move to contacted resolves it; `no_answer` / `busy` / `switched_off` create "Call again"
   tasks (+2 working hours, then next opening + 1 h, at most 3); "reached" is reported separately. Imported clocks are
   reported apart from live ones. In-app only (D-041): chip, Call now, alert strip, tab count, optional chime.
4. **Intake:** Meta Lead Ads come by webhook → inbox → Graph fetch (`appsecret_proof`, v26.0) → `captureLead` with
   `origin`, chronology-aware attach and erase suppression; CSV/TSV files are parsed in the browser and re-validated on
   the server, attach-only for existing families, idempotent through the refs.

### 12.5 Staff via the super admin (replaces §9 steps 1–2)

1. CRM → Settings → **Areas & people**: "Set up from centre" (pick a centre, its heads, its executives) or edit each
   area's people; "Create login" there (or Admin → Users, role Staff, as a super admin). The temporary password is shown
   once.
2. Change role / scope / active later in the same screen or `PUT /api/crm/staff/:userId` (SA). Disable the account:
   `PATCH /api/admin/users/:id` (SA for staff).
3. Calling hours and the 1-hour rule: CRM → Settings → **Calling hours & speed**.

## 13. Admin console Phase 1b: numbers, one-step follow-up, WhatsApp templates, family record, sources (D-078 – D-083)

Plan: `docs/admin-phase-1b-plan.md`. Everything below is additive: one new feature schema, new routes and pages, and
small changes to the inbox query. No new dependencies and no new environment variables.

### 13.1 Role home and navigation

- `GET /[lang]/crm/home` (a route handler, `PORTAL_HOME.staff`) answers 307: CRM admin → `/admin`, area head →
  `/crm/dashboard`, counsellor → `/crm/today`, question-bank-only staff → `/admin/questions`, other staff → `/crm`,
  students and parents → their portal, signed out → login with `next=/crm/home`, a pending temporary password → the
  change-password page. A staff sign-in now lands on `/crm/home`.
- Staff sidebar: Today's calls, Enquiries, Pipeline, **Admissions done** (all roles), Reports …; area heads and admins
  also get a **Manage** group (Targets, WhatsApp templates, Lost enquiries to review) and **Lead generation** (Where
  enquiries come from). Admin console: Lead generation, Google & AI search (`/admin/search`) and Settings → Site status
  (`/admin/status`). The MCP page is called "AI assistant access".

### 13.2 Pages

| Page | Who | What |
|---|---|---|
| `/admin` (top) and `/crm/dashboard` (top) | admins; area heads (their centres) | Five numbers by effective centre + Total, and Needs attention. `/admin` shows today and week; the dashboard shows week only and leaves out lead routing's own unassigned / tool sign-up tiles. Signed-out preview: "—" and "Preview · no live data", no database read. |
| `/crm/targets` | read: admins, area heads (own centres); edit: super admins | Session targets per centre × programme (JEE, NEET, Foundation, Integrated, Any); "Show optional targets" for enquiries and counselling. |
| `/crm/admissions` | everyone in the CRM (scoped) | Admissions done per session and centre, 50 per page; erased rows are counted without a name. |
| `/crm/templates` | read: area heads, admins; edit/approve/retire: super admins | The WhatsApp templates and the prospectus link. |
| `/crm/lost` | area heads, admins | Lost enquiries to review (7 / 14 / 30 days, by counsellor), Keep lost / Reopen…, and the lost-reasons-by-counsellor table. |
| `/crm` (Enquiries) | everyone in the CRM | Quick views (presets), removable filter chips, the filter form folded into "Filters (n on)" below `lg`; list rows show "Kullu (from area)" when the centre comes from the area. |
| `/crm/sources` | area heads (own scope, read-only), admins | Where enquiries come from: channels, Google Maps, AI assistants, campaign tags, referring sites, landing pages, how they heard, Free tools & Rancho, weekly trend; Centre links card (`#maps`, super-admin edit, tagged GBP link with a copy button). |
| `/admin/search` | admins (English) | Search and AI numbers that can be measured today (30 and 90 days); promises no rankings. |
| `/admin/status` | admins (English) | Site status (release, mode, disk with a 3 GB warning, database, backups "Not set up (deferred)", integrations) and the static go-live summary. |
| `/admin/users` | admins (staff creation: super admins) | People: role chips with counts; staff rows show CRM role, access, areas, older centre scope, away-until and open enquiries. |
| `/admin/audit` | admins | Readable labels for every audit code; repeated enquiry views and AI-assistant tool calls grouped (every entry still listed). |
| Lead page | anyone who sees the lead | "Log a call" and every Done open the one-step call dialog; WhatsApp composer with "Did you send it?"; More details; Possible duplicates. |

### 13.3 API (same envelope, private headers, same-origin writes, strict zod)

| Method & path | Who | Body / query → data |
|---|---|---|
| GET `/api/crm/leads/:leadId/outcome[?taskId=]` | sees the lead | → `FollowUpContextView` (presets, suggestion inputs, attempts, open task, calling hours, slot values); 409 erased |
| POST `/api/crm/leads/:leadId/outcome` | sees the lead | `{ contact: {channel, outcome, note?, template?: {key, lang}} \| null, taskId?, next: {kind:"preset",preset} \| {kind:"at",at} \| {kind:"none",reason}, nextTitle?, markNotReachable?, markLostWrongNumber? }` → 201; one atomic write; 422 without `next`, outside 08:00–21:00 IST, or a template that is not approved |
| GET `/api/crm/templates?context=general` / `?all=1` | approved: everyone; `all`: area heads, admins | `WaTemplate[]` (missing seed drafts are added on the first read) |
| PUT `/api/crm/templates/:key` | super admin | `{ lang, body, expectedVersion }`; an approved template returns to draft; 409 stale |
| POST `/api/crm/templates/:key/status` | super admin | `{ status: "approved" \| "retired" \| "draft", expectedVersion }` |
| PUT `/api/crm/templates/links` | super admin | `{ prospectusUrl \| null, expectedVersion }` (https, ≤ 300) |
| GET/PUT `/api/crm/leads/:leadId/details` | sees the lead | partial `LeadMoreDetails` (`null` clears); GET audited `crm.lead_view`; 409 erased |
| GET `/api/crm/leads/:leadId/duplicates`; POST `{ otherLeadId, action: "dismiss" }` | sees the lead (dismiss: sees both, and admin, manager or assignee of either) | `DuplicateMatch[]` (≤ 5) |
| GET `/api/crm/lost-review?days=7\|14\|30&assignee=` | area heads, admins | `LostReviewReport` |
| POST `/api/crm/lost-review/:leadId` | area heads, admins | `{ lostAt, decision: "kept" \| "reopened", reopenTo?, assigneeId?, followUp? }` |
| GET/PUT `/api/crm/targets?period=S2026` | read: admins, area heads; PUT: super admin | `TargetGrid`; PUT `{ period, metric, cells, expectedUpdatedAt }`, 409 stale (code `bad_request`) |
| GET `/api/crm/sources?range=30d\|90d\|session` (or `from`/`to`) `&centre=<slug\|none>` | area heads, admins | `SourcesReport` |
| GET/PUT `/api/crm/settings/centre-links` | read: area heads, admins; PUT: super admin | each centre's Google Maps link; 409 stale |

Changed: `GET /api/crm/leads` (and the Enquiries page and export) gains `contact=none` (no call or WhatsApp logged
yet), `signups=hide` (leave out free-tool sign-ups) and `created=today|week|over24h` (IST; replaces
`createdFrom`/`createdTo`). **`centre` now matches the effective centre**: the lead's own centre, else its routing area's
default centre (`none` = neither). `LeadSummary.effectiveCentreSlug` carries it. `POST /api/admin/users` for a staff login
without `crm.crmRole` answers 422. `logContact` takes `extra: { template, lang }` (kept on the timeline entry and after
erase). Lead links accept `back=/crm/leads/<id>` (back kind `lead`).

### 13.4 Data model (feature `crm_console`, applied right after `crm_intake`; `CREATE … IF NOT EXISTS` only)

| Table | Key | Notes |
|---|---|---|
| `crm_lead_details` | `lead_id` | second phone (E.164), school, board, hostel, target exam / year, heard via, referred by, joining session, best time, who decides. Erase wipes the second phone, school and referred-by. |
| `crm_lead_attribution` | `lead_id` | the referrer host kept after erase (written only by erase). |
| `crm_targets` | `(period, centre_slug, program, metric)` | `S2026` = 1 Apr 2026 – 31 Mar 2027 IST; month periods allowed by the CHECK but unused in 1b. |
| `crm_wa_templates` | `key` | `context`, `status` draft / approved / retired, three bodies (≤ 700), `version`. |
| `crm_duplicate_dismissals` | `(lead_a, lead_b)`, `lead_a < lead_b` | "Not the same family". |
| `crm_lost_reviews` | `(lead_id, lost_at)` | kept / reopened per lost event. |

Open vocabularies (board, exam, heard via, best time, who decides, programme, metric, template context) have length
CHECKs only and are validated in code. Settings documents `centre_links` and `wa_links` live in `crm_settings`.
Nothing is backfilled; the schema applies itself on the first database open.

### 13.5 Audit codes (details never hold family data or URLs)

`settings.targets_update {period, metric, cells}` · `settings.template_update {key, lang, version}` ·
`settings.template_status {key, status}` · `settings.wa_links_update {version}` · `settings.centre_links_update
{centres, version}` · `crm.lead_details_update {fields}` · `crm.duplicate_dismiss {otherLeadId}` · `crm.lost_review
{decision}` · `crm.contact_log` gains `template`. Labels: `src/components/portal/audit-labels.ts`.
