# Admin console Phase 2, "Admission season": build plan

- **Readers:** the owner (Part A, one page) and the build agents (Parts B and C).
- **Status:** final, 22 Oct 2026. Revised after the critic review; every point and how it was resolved is in Appendix A.
- **Release:** R3. It ships after R1 (the current tree with lead routing and the question bank) and R2 (Phase 1b).
- **Base:** the tree after LR integrate, QB integrate and Phase 1b integrate, with `npx tsc --noEmit` green.
- **Sources:** `docs/admin-console-plan.md` §2.1, §2.3, §3, §4, §5, §7 (owner approved all 23 defaults on 21 Oct; backups deferred; website editors are Phase 3 and not here); `docs/lead-routing-plan.md` §11–§17, §20–§24; `docs/question-bank-plan.md` (D-050–D-058); `docs/admissions-agent-plan.md` (Asha) and `docs/admissions-agent-voice.md` §5.4, §7; the read-only map of 04:30 IST; the code as it stood when this was finalised.
- **Code state when finalised:** LR-CORE has landed (`src/lib/db/features/{superadmin,crm-intake}.ts`, `src/lib/crm/{lead-ops-types,arrival,settings,sla-state}.ts`, `src/lib/crm/routing/index.ts`, `src/lib/crm/intake/**`, `requireCrmSuperAdmin`, `CrmViewer.superAdmin | areaScope | channel`). `src/lib/crm/sla/index.ts` still holds LR-SLA stubs; `/crm/dashboard` and `docs/admin-phase-1b-plan.md` do not exist yet. Every Phase 1b name below is the expected name and must be checked in code first (B0).
- **Decision ids:** Phase 2 records **D-070 to D-077**. D-059 to D-068 are proposed by `docs/admissions-agent-plan.md` (Asha, line 11), and Phase 1b uses D-078 to D-083. The integrate stage re-runs `grep -rhoE "D-0[0-9]{2}" docs/*.md | sort -u` and renumbers only if a number is taken.
- **Database:** one new idempotent feature schema, `crm_admission`. No core migration (`SCHEMA_VERSION` stays 2). Every table is `crm_*`, so `db.test.ts` needs no edit.
- **New npm dependencies:** none. The QR encoder is written in-house (D-074).

---

# Part A. For the owner (one page)

## A1. What changes for staff after R3

- **Scholarship test (BOH), start to finish.** An admin adds a test with its classes, registration dates, and centres, times and seats. **Parents or guardians** register at `/scholarship-test` (or a counsellor or the front desk registers them). Each student gets a roll number and an admit card to print or show on a phone. Reception ticks who came; a centre manager types or uploads the scores; a super admin sets the scholarship slabs; an admin presses **Publish results**. Each family's record then shows the result, and their counsellor gets an **offer call** due within 48 hours. A report shows registrations, attendance, scores, slabs and later admissions by centre. **No results are shown online.**
- **Visits & demo classes.** Counsellors book a centre visit or 3–7 days of trial classes from a family's page. Each centre has a day and week list. Booking and attending move the family along the pipeline and create the next follow-up. Staff can add a booking to their phone calendar.
- **Fact sheet.** One page per centre: batches, start dates, timings, fees and instalments, hostel, and common answers. It **starts empty**. Each fact shows "verified" or "not verified"; only verified facts fill WhatsApp messages. **Fees, instalments and scholarship facts are verified by a super admin**; other facts by an admin.
- **Walk-in desk.** One reception login per centre, made by a super admin. Reception adds walk-ins, finds a family by typing the full mobile number, tells the counsellor "they're here", and checks in visits and test candidates. Reception never sees notes, history or the pipeline, and never receives enquiries or tasks.
- **Paper enquiries.** The existing "Import leads" page also takes seminar forms, newspaper coupons and paper test forms, records how each family agreed to be contacted, and tags where the forms came from.
- **Campaign links & QR codes.** Short links and printable QR codes for posters, seminars and ads; opens per day, enquiries, counselling, admissions and test registrations per campaign; an Instagram "link in bio" page. Print views say **"TEST, do not print"** until the site address is aspireiit.in.
- **Families.** Add a brother or sister to the same family; managers can merge two enquiries that are one family (never automatic). Later forms from the merged number land on the right family.
- **Data & privacy (admin).** A register of erase and "stop contacting us" requests, the retention clean-up with a dry run first, and a log of exports and imports. Also a read-only **Roles & permissions** table, and first-call speed by centre on the Dashboard.
- **WhatsApp stays manual.** Every message opens WhatsApp with the text ready; it is logged only after staff confirm "I sent it".

## A2. Decisions taken by default while you were away (each can be changed later)

| # | Question | Default used |
|---|---|---|
| P2-Q1 | Online BOH through the mock-test engine? | Not in R3; after the question bank's BOH pattern is confirmed. The console says "Online version: not available yet". |
| P2-Q2 | Slabs | Score bands per test ("from score X → Y %", up to 12), set by a super admin. No % appears anywhere until set. |
| P2-Q3 | Slabs on the public page? | No; a super admin can switch it on per test. |
| P2-Q4 | Results online? | No. The counsellor calls (offer call within 48 h); a "result is ready" WhatsApp draft has no score. |
| P2-Q5 | Registration fee | Nothing collected online; an optional "fee note" is shown as typed. |
| P2-Q6/7 | Who registers online, and consent | **The parent or guardian** fills the form, with today's enquiry consent sentence unchanged. Students cannot self-register until counsel says they may (new checklist item). |
| P2-Q8 | Admit card link | Shown once after a new registration. A repeat registration shows no link: the counsellor resends it. The link's secret part is never stored in server logs, and it works until 2 days after the test day. |
| P2-Q9 | Front desk | Decision 15 as written: one login per centre; on a phone match it sees name, class and counsellor only. |
| P2-Q10 | New WhatsApp drafts | 5 drafts in English, Hindi and Hinglish (visit confirmed, demo confirmed, visit reminder, test registered, result ready), "awaiting your approval". |
| P2-Q11 | Fact sheet editing | Managers (own centres) and admins draft; admins verify; **super admins verify fees, instalments and scholarship facts**. Any edit un-verifies. |
| P2-Q12 | Test editing | Admins create tests and publish results; managers edit slots, check-in and scores for their centres; slabs and registration targets are super-admin only. |
| P2-Q13 | Paper import | Super admin only, as today. |
| P2-Q14 | Merging | Admins and managers who can see both; one way; the merged copy becomes "lost: duplicate". |
| P2-Q15 | Retention clean-up | Dry run by admins; real run by super admins with typed confirmation; 18 months since the **last real contact** for unconverted families, 6 months for tool-only (decision 20, pending legal review). No schedule. |
| P2-Q16 | QR printing | Watermarked until aspireiit.in; **scan one printed QR before mass printing** (checklist item). |
| P2-Q17 | Test registrations and the 1-hour rule | They start the first-call clock. |
| P2-Q18 | Bookings | Visit 45 min; demo 3 days (3–7); no automatic reminders; a "send reminder" button for tomorrow's visits. |
| P2-Q19 | Spam limits on the public form | 20 registrations per 10 minutes per network address (schools and mobile networks share addresses) and 3 per hour per mobile number. |
| P2-Q20 | "Bring this card" line | A prefilled, editable line in each test's "What to bring", not fixed text. |
| P2-Q21 | Asha (later) | Asha reuses these lists (children in a family, fact sheet, bookings) instead of building her own. |
| P2-Q22 | Erasing a family who sat the test | Name, score, %, rank, roll number and admit link are removed; only an anonymous "registered / attended" row remains so test counts stay right. |

## A3. What you do after R3 is live (about an hour)

1. **Reception logins** (super admin): CRM → Settings → Front desk logins.
2. **The test** (admin): Scholarship test → New test: names in English and Hindi, roll prefix (for example `BOH26`), classes, dates, what to bring, rules, and per centre a slot with the venue **as it should be printed**, date, reporting time, start time and seats. Then **Open**.
3. **Slabs and targets** (super admin): the test's Settings tab.
4. **Fact sheet:** managers enter batches, fees, timings and map links; you verify fees and scholarship facts, admins verify the rest.
5. **Approve the 5 WhatsApp drafts** where the Phase 1b templates are approved.
6. **1-hour rule:** if the speed settings were saved before R3, tick "Scholarship test" under "Sources that start the 1-hour clock".
7. **Share `/scholarship-test`** through campaign links, QR codes and `/links` (it is not in the website menu). Print QR codes only on aspireiit.in, after scanning one test print.

Honest limits: nothing is sent automatically (D-041, decision 23); no payments, offers or letters (Phase 6); facts, dates, fees and slabs are blank until you enter them; click counts are opens, not people, and up to a minute of counts can be lost on a restart; Hindi is a machine draft until reviewed.

---

# Part B. Technical design

## B0. Preconditions (P2-CORE does this before writing anything)

1. **Start condition.** LR integrate, QB integrate and Phase 1b integrate are done and `npx tsc --noEmit` is green. If not, stop and report.
2. **Re-read the built code, not the plans:** `src/lib/crm/{types,access,http,page,capture,leads,tasks,admin,gate}.ts`, `src/lib/crm/{lead-ops-types,arrival,settings}.ts`, `src/lib/crm/sla/**`, `src/lib/crm/routing/**`, `src/lib/crm/intake/**`, `src/lib/crm/repo/{leads,activities,areas-core,gate-passes,staff,staff-ops}.ts`, `src/lib/auth/{paths,accounts}.ts`, `src/components/crm/{LeadDetailView,CrmGate,CrmBlocks,format}.tsx|ts`, `src/components/crm/settings/SettingsHub.tsx`, `src/components/portal/{areas.ts,PortalShell.tsx}`, `src/i18n/messages/{types,index}.ts`, `src/i18n/paths.ts`, `src/lib/db/features/index.ts`, `docs/admin-phase-1b-plan.md` and its built files.
3. **Greps:** decision ids (D-070–D-077 free); every `CREATE TABLE` in `src/lib/db/features` (none of the B3 names exist); `erase_request|privacy_request` (if Phase 1b built an erase-request store, use it and skip `crm_privacy_requests`).
4. **Map the Phase 1b seams** and write the mapping into the P2-CORE report:

| What Phase 2 needs from 1b (expected name) | Used by | If 1b didn't build it |
|---|---|---|
| `runAtomic` (rolls back on a returned failure) | every Phase 2 write service | CORE adds `runInTx` in `admission/system.ts` |
| Exported lead-scope SQL (`scopedLeadWhere`) | bookings, registrations, first response, privacy | CORE exports `leadScopeSql` from `repo/leads.ts`, built on the private `scopeClause` (never a copy) |
| `consoleCentres` / `consolePermissions` | `viewerCentres`, `admissionCan` | CORE implements `viewerCentres` itself; `admissionCan` derives flags from `crmPermissions` |
| WhatsApp template store `crm_wa_templates` with a `context` column (`general` / `booking` / `test`), per-key seeding (`INSERT OR IGNORE`), `TemplateKey` = validated string, and the slot registry `TEMPLATE_SLOTS` | visits, test, desk | CORE keeps the 5 drafts as constants in `src/lib/crm/admission/templates.ts`, with approval state in `crm_settings` key `adm_wa_templates` (`{ [key]: { approvedAt, approvedBy, overrides? } }`), and its own `AdmissionSlot` list |
| WhatsApp "Did you send it?" return-confirm helper and a log call that carries `meta.template` | every Phase 2 WhatsApp button | CORE adds `src/components/admission/whatsapp/**` (sessionStorage + focus-return confirm) and `POST /api/crm/admission/whatsapp-sent` |
| Slot filler | fact sheet | Phase 2's message builder calls `factSlotValues()` directly |
| Activity-log label registry (English) | all `adm.*` / `leadgen.*` codes | CORE adds `ADM_AUDIT_LABELS` and the minimal lookup in `AuditLog.tsx` |
| Erase hook registry | personal side tables | CORE calls `eraseAdmissionData(db, leadId, actorId, now)` inside `eraseLead`'s transaction |
| Enquiry details side table + setter (`onlyEmpty`) | paper import, merge, walk-in "how they heard" | those columns are skipped (preview note) |
| Duplicate-suggestion component | merge | merge starts from the family panel only |
| People list | desk badge | the desk logins page is the only list of desk accounts |
| Channel classifier `src/lib/crm/console/channels.ts`, `CHANNELS`, `IMPORTED_SQL` | "where enquiries come from" | nothing to edit |
| `/crm/home` role-landing route | desk landing | `requireCrmPage` redirect from `/crm/today` is enough |
| "Needs attention" registry; admissions-done query | optional lines; sibling admissions | skipped (integrate notes it) |

## B1. Already built elsewhere: wired or reused, not rebuilt

| Need | Built by | Phase 2 does |
|---|---|---|
| Capture, dedupe by phone, consent proof | `captureLead`, `createManualLead` | Calls them (source `scholarship_test`, `submissionMeta`); desk tweak only (B4.4) |
| Routing, assignment, Away, bulk reassign | LR-ROUTING | Nothing; `setUserAreas` refuses desk users (B2.1) |
| 1-hour clock, calling hours, `createFollowUpTask`, first-response stats | LR-SLA | Uses `addWorkingMinutes`, `createFollowUpTask`; adds by-centre first response |
| Super admin, SA-only staff logins | LR-CORE | Desk logins follow the same rule (`requireCrmSuperAdmin`) |
| CSV import (consent basis, idempotency, attach-only, Excel damage) | LR-IMPORT | Extends it for paper forms (B5.7); no second importer |
| CSV decode/parse | `src/lib/crm/intake/{decode,csv}.ts` | Reused in the browser for score uploads |
| Paper generator, `slotReadiness` | QB | Read-only readiness line for `boh-class-10` |
| ICS builder | `src/lib/planner/ics.ts` `buildIcs` | Booking calendar files |
| Gate-pass cap | `MAX_GATE_PASSES_PER_LEAD`, `trimGatePasses` | Used by merge |
| Enquiry context | `collectEnquiryContext` (`src/components/forms/enquiry-context.ts`), `leadContextFromEnquiry` (`capture.ts`) | Imported read-only by the public form and handler |
| Consent sentence `2026-10-20.v2` | `src/lib/server/enquiry-consent.ts` | Reused verbatim; file not edited |
| **Asha** (`docs/admissions-agent-plan.md`, R5) | later | **Phase 2's tables are canonical.** Asha must reuse `crm_lead_students` (not `adm_students`), `crm_fact_*` (not `adm_facts`), `crm_bookings` (not `adm_requests` kind `visit`), and the desk facts `desk_phone` / `desk_hours` (not `agent_centres` desk hours). B3 creates the columns Asha needs now, because feature schemas cannot ALTER later. Visit tasks go to the lead's assignee, never to a desk login. |
| **R4 SEO pack** (JSON-LD from facts) | later | Reads only `status = 'verified'` fact rows. |

## B2. Roles, the front desk and deny-by-default

### B2.1 The front-desk model (D-073)

**A front-desk login is a `staff` account with an active `crm_desk_staff` row and no `crm_staff` row.** It is never in an assignment pool (LR pools, rules and round-robin read `crm_staff` / `crm_area_members`), never in assignee pickers, and the `crm_staff` role CHECK is never widened.

**Viewer resolution (`resolveCrmViewer`, CORE edit):** an active `crm_staff` row wins, as today. Otherwise an active `crm_desk_staff` row on an enabled account returns `{ userId, displayName, role: "counsellor", centreSlugs: desk.centreSlugs, frontDesk: true }`. With role `counsellor` the lead scope is "assigned to me", and nothing is ever assigned to a desk login, so the desk sees **no leads** through any existing service. Pending temporary password → `null`, as today.

**Membership writes refuse desk users (CORE):** the staff-membership write service behind `PUT /api/crm/staff/[userId]` (and Phase 1b's People, if it writes membership) and LR's `setUserAreas` (`src/lib/crm/routing/index.ts`) return 422 `desk_account` for a user with an active `crm_desk_staff` row. Desk-account creation refuses users with an active `crm_staff` row (422 `already_crm_member`).

**Deny-by-default, three layers:**
1. **APIs.** `requireCrm(request, { …, allowDesk?: true })`: a desk viewer without `allowDesk` gets 403, reason `desk_not_allowed`. Only these routes pass `allowDesk` (`DESK_ALLOWED_ROUTES` in `src/lib/crm/admission/types.ts`):
   - `GET /api/crm/me`
   - `POST /api/crm/desk/families`, `POST /api/crm/desk/arrivals`, `POST /api/crm/desk/walk-ins`, `GET /api/crm/desk/today`, `POST /api/crm/desk/test-search`
   - `PATCH /api/crm/bookings/[bookingId]` (actions `checkin`, `no_show`; own centre; today)
   - `POST /api/crm/scholarship-test/registrations` (own centre's slots only: on-the-spot registration)
   - `PATCH /api/crm/scholarship-test/registrations/[regId]` (actions `checkin`, `absent`, `undo_checkin`; own centre)
   - `GET /api/crm/facts` (own centre)
2. **Pages.** `requireCrmPage(path)`: a desk viewer on any path other than `/crm/desk` and `/crm/facts` is redirected to `/crm/desk`. Staff land on `PORTAL_HOME.staff`; if Phase 1b made that `/crm/home`, CORE adds desk → `/crm/desk` there; otherwise `/crm/today` redirects.
3. **Chrome.** The sidebar shows only "Walk-in desk" and "Fact sheet". The top bar's "Find an enquiry" becomes "Find a family" (`/crm/desk`, focuses the phone field) and "+ Add enquiry" becomes "+ Walk-in" (`/crm/desk?add=1`). `SlaAlertStrip` and `AwayToggle` are not rendered for desk viewers.

**Nothing personal in URLs.** Phone numbers, names and search terms travel in POST bodies, never in query strings: the desk lookup, the desk test search and the console's registration search are POSTs, and page URLs keep only ids, tabs and filters. A test asserts that no desk link or fetch URL contains a run of 10 digits.

**Route sweep test (CORE writes it; integrate re-runs it):** `import.meta.glob("/src/app/api/crm/**/route.ts")` imports every handler; each exported method is called with a mocked desk session; every result is 403 except the allow-listed `(method, path)` pairs.

### B2.2 Capabilities (`src/lib/crm/admission/permissions.ts`, `admissionCan(viewer, cap, ctx?)`)

`viewerCentres(db, viewer)` → `"all"` or slugs: admin all; area manager the centres of `areaScope`; legacy manager `centreSlugs` (empty = all); counsellor `[]`; desk its desk centres. It wraps Phase 1b's centre helper when one exists. Super admin = `crmPermissions(viewer).isSuperAdmin`. Lead-level checks use `canSeeLead`.

| Capability | Counsellor | Manager | Admin | SA | Desk |
|---|---|---|---|---|---|
| `facts.read` | ✓ | ✓ | ✓ | ✓ | own centre |
| `facts.edit` (centre) | — | own centres | ✓ | ✓ | — |
| `facts.verify` (topics other than fees / scholarship) | — | — | ✓ | ✓ | — |
| `facts.verify_money` (batches; entries with topic `fees` or `scholarship`) | — | — | — | ✓ | — |
| `test.view` | own leads' registrations | own centres + own leads | all | all | today, own centre (minimal) |
| `test.events.manage` | — | — | ✓ | ✓ | — |
| `test.slots.edit` (centre) | — | own centres | ✓ | ✓ | — |
| `test.slabs.edit`, `test.targets.edit` | — | — | — | ✓ | — |
| `test.register` (lead) | own leads | scoped leads | ✓ | ✓ | own centre's slots (walk-in) |
| `test.checkin` (slot centre) | — | own centres | ✓ | ✓ | own centre |
| `test.scores` (slot centre) | — | own centres | ✓ | ✓ | — |
| `test.publish`, `test.correct_score` | — | — | ✓ | ✓ | — |
| `test.report`, `test.export` | — | own centres | ✓ | ✓ | — |
| `test.admit_link` (mint / rotate) | own leads | scoped leads | ✓ | ✓ | — |
| `bookings.create` (lead) | own leads | scoped leads | ✓ | ✓ | — |
| `bookings.update` (booking) | own leads or host | own centres | ✓ | ✓ | check-in / no-show, own centre, today |
| `bookings.view` | own leads + hosted | own centres + scoped leads | all | all | today, own centre (minimal) |
| `desk.use` | — | ✓ | ✓ | ✓ | ✓ |
| `desk.accounts.view` | — | read, without login ids | read, with login ids | ✓ | — |
| `desk.accounts.edit` | — | — | — | ✓ | — |
| `campaigns.view` | — | ✓ | ✓ | ✓ | — |
| `campaigns.edit` | — | — | ✓ | ✓ | — |
| `students.edit` (lead) | own leads | scoped | ✓ | ✓ | — |
| `merge` (both leads visible) | — | ✓ | ✓ | ✓ | — |
| `privacy.view`, `privacy.record`, `retention.dry_run` | — | — | ✓ | ✓ | — |
| `retention.run` | — | — | — | ✓ | — |

`/admin/permissions` renders this table plus LR §22 from a data module; a test checks it against `admissionCan` / `crmPermissions` (B5.10).

## B3. Data model: `src/lib/db/features/crm-admission.ts` (P2-CORE)

**Rules:**
- Idempotent `CREATE TABLE` / `CREATE INDEX IF NOT EXISTS` only; no runtime imports (loaded by plain Node); no ALTER of anything. Every column a later version or Asha needs is created now.
- **SQL CHECKs only for closed state machines** (status columns, 0/1 flags, lengths, ranges, attendance). **Open vocabularies** (exam, kind, via, channel, topic, source, created_via, received_via, request kind, student status) get a length CHECK only and are validated in zod against the TypeScript tuples in `admission/types.ts`, so new values never need a table rebuild.
- Times are epoch ms; ids are `randomUUID()` unless noted.
- Registered in `src/lib/db/features/index.ts` as `{ name: "crm_admission", sql }`, appended after `crm_intake` and after any Phase 1b schema.

```sql
-- Front desk (D-073): a staff account with this row and NO crm_staff row.
CREATE TABLE IF NOT EXISTS crm_desk_staff (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  centre_slugs TEXT NOT NULL DEFAULT '[]',                 -- JSON, 1–3 slugs (decision 15: normally one)
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);

-- Children in one family (D-076). Canonical for Asha too (replaces adm_students).
CREATE TABLE IF NOT EXISTS crm_lead_students (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  student_name TEXT NOT NULL CHECK (length(student_name) BETWEEN 1 AND 80),
  current_class TEXT CHECK (current_class IS NULL OR length(current_class) <= 40),
  program_interest TEXT CHECK (program_interest IS NULL OR length(program_interest) <= 40),
  exam_target TEXT CHECK (exam_target IS NULL OR length(exam_target) <= 40),         -- Asha; unused in R3
  centre_slug TEXT CHECK (centre_slug IS NULL OR length(centre_slug) <= 60),
  mode TEXT CHECK (mode IS NULL OR length(mode) <= 20),                               -- Asha; unused in R3
  source TEXT NOT NULL DEFAULT 'staff' CHECK (length(source) BETWEEN 1 AND 20),       -- lead|submission|staff|assistant (zod)
  status TEXT NOT NULL DEFAULT 'enquiring' CHECK (length(status) BETWEEN 1 AND 20),   -- enquiring|admitted|not_joining|removed (zod)
  status_at INTEGER,
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_lead_students_lead_idx ON crm_lead_students (lead_id);
-- At most one row mirroring the lead's own student (R3 never writes one; Asha may).
CREATE UNIQUE INDEX IF NOT EXISTS crm_lead_students_main_uq ON crm_lead_students (lead_id) WHERE source = 'lead';

-- Scholarship tests (D-070).
CREATE TABLE IF NOT EXISTS crm_test_events (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 3 AND 8),          -- roll prefix, A–Z0–9 (zod)
  exam TEXT NOT NULL DEFAULT 'BOH' CHECK (length(exam) BETWEEN 1 AND 20),   -- 'BOH' only in R3 (zod)
  name_en TEXT NOT NULL CHECK (length(name_en) BETWEEN 3 AND 80),
  name_hi TEXT CHECK (name_hi IS NULL OR length(name_hi) <= 80),
  classes TEXT NOT NULL DEFAULT '[]',                                       -- JSON LEAD_CLASSES
  intro_en TEXT, intro_hi TEXT,                                             -- ≤ 600 (zod)
  bring_en TEXT, bring_hi TEXT,                                             -- ≤ 300; form prefills an editable draft (P2-Q20)
  rules_en TEXT, rules_hi TEXT,                                             -- ≤ 1000
  fee_note_en TEXT, fee_note_hi TEXT,                                       -- ≤ 200
  max_score REAL CHECK (max_score IS NULL OR max_score > 0),
  sections TEXT NOT NULL DEFAULT '[]',                                      -- JSON [{key,labelEn,labelHi,max}] ≤ 6
  registration_opens_at INTEGER,
  registration_closes_at INTEGER,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'results_published', 'archived')),
  slabs TEXT NOT NULL DEFAULT '[]',                                         -- JSON [{minScore, percent}] ≤ 12
  slabs_version INTEGER NOT NULL DEFAULT 0,                                 -- 0 = never set; ≥ 1 = set (may be [])
  slabs_set_at INTEGER,
  slabs_set_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  show_slabs_publicly INTEGER NOT NULL DEFAULT 0 CHECK (show_slabs_publicly IN (0, 1)),
  targets TEXT NOT NULL DEFAULT '{}',                                       -- JSON {centreSlug: registrations}
  online_slot TEXT,                                                         -- QB slot id; unused in R3
  results_published_at INTEGER,
  results_published_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_test_events_status_idx ON crm_test_events (status, registration_closes_at);

CREATE TABLE IF NOT EXISTS crm_test_slots (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES crm_test_events (id) ON DELETE CASCADE,
  centre_slug TEXT NOT NULL,                                                -- routing/assignment only
  venue_en TEXT NOT NULL CHECK (length(venue_en) BETWEEN 3 AND 200),       -- printed as typed
  venue_hi TEXT CHECK (venue_hi IS NULL OR length(venue_hi) <= 200),
  starts_at INTEGER NOT NULL,
  reporting_at INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 300),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 5000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  CHECK (reporting_at <= starts_at)
);
CREATE INDEX IF NOT EXISTS crm_test_slots_event_idx ON crm_test_slots (event_id, starts_at);
CREATE INDEX IF NOT EXISTS crm_test_slots_centre_idx ON crm_test_slots (centre_slug, starts_at);

CREATE TABLE IF NOT EXISTS crm_test_registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES crm_test_events (id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL REFERENCES crm_test_slots (id) ON DELETE RESTRICT,  -- slots are deactivated, never deleted
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  student_id TEXT REFERENCES crm_lead_students (id) ON DELETE SET NULL,     -- NULL = not linked (main student or unconfirmed)
  roll_seq INTEGER NOT NULL CHECK (roll_seq BETWEEN 1 AND 9999),            -- kept on erase so numbers are never reused
  roll_no TEXT,                                                             -- `${code}-${seq 4 digits}`; NULL after erase
  student_name TEXT CHECK (student_name IS NULL OR length(student_name) BETWEEN 1 AND 80),  -- NULL only after erase
  name_key TEXT NOT NULL CHECK (length(name_key) BETWEEN 1 AND 120),        -- normalised name; 'erased:<id>' after erase
  current_class TEXT CHECK (current_class IS NULL OR length(current_class) <= 40),
  via TEXT NOT NULL CHECK (length(via) BETWEEN 1 AND 20),                   -- public|staff|desk (zod); Asha may add assistant
  campaign_code TEXT CHECK (campaign_code IS NULL OR length(campaign_code) BETWEEN 3 AND 40),  -- utm_campaign of THIS registration
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),
  attendance TEXT NOT NULL DEFAULT 'unknown' CHECK (attendance IN ('unknown', 'present', 'absent')),
  checked_in_at INTEGER,
  checked_in_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  score REAL CHECK (score IS NULL OR score BETWEEN -10000 AND 10000),
  section_scores TEXT,                                                      -- JSON {key: number}
  score_via TEXT CHECK (score_via IS NULL OR length(score_via) <= 20),      -- hand|csv|online (zod)
  scored_at INTEGER,
  scored_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  rank INTEGER,
  scholarship_percent INTEGER CHECK (scholarship_percent IS NULL OR scholarship_percent BETWEEN 0 AND 100),
  result_at INTEGER,
  offer_task_id TEXT,
  admit_token_hash TEXT,                                                    -- SHA-256 of the admit link token
  admit_token_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_test_reg_seq_uq ON crm_test_registrations (event_id, roll_seq);
CREATE UNIQUE INDEX IF NOT EXISTS crm_test_reg_roll_uq ON crm_test_registrations (event_id, roll_no)
  WHERE roll_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_test_reg_admit_uq ON crm_test_registrations (admit_token_hash)
  WHERE admit_token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_test_reg_once_uq ON crm_test_registrations (event_id, lead_id, name_key)
  WHERE status = 'registered';
CREATE INDEX IF NOT EXISTS crm_test_reg_lead_idx ON crm_test_registrations (lead_id);
CREATE INDEX IF NOT EXISTS crm_test_reg_slot_idx ON crm_test_registrations (slot_id, status, attendance);
CREATE INDEX IF NOT EXISTS crm_test_reg_campaign_idx ON crm_test_registrations (campaign_code) WHERE campaign_code IS NOT NULL;

-- Visits & demo classes (D-071). Canonical for Asha's visit requests too (status 'requested').
CREATE TABLE IF NOT EXISTS crm_bookings (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  student_id TEXT REFERENCES crm_lead_students (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 20),                 -- visit|demo (zod)
  centre_slug TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  days INTEGER NOT NULL DEFAULT 1 CHECK (days BETWEEN 1 AND 7),
  host_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  program_note TEXT CHECK (program_note IS NULL OR length(program_note) <= 80),   -- wiped on erase
  note TEXT CHECK (note IS NULL OR length(note) <= 200),                          -- wiped on erase
  status TEXT NOT NULL DEFAULT 'booked'
    CHECK (status IN ('requested', 'booked', 'attended', 'no_show', 'cancelled')),  -- R3 never writes 'requested'
  status_at INTEGER,
  status_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_via TEXT NOT NULL DEFAULT 'staff' CHECK (length(created_via) BETWEEN 1 AND 20),  -- staff|desk|family|assistant (zod)
  campaign_code TEXT CHECK (campaign_code IS NULL OR length(campaign_code) BETWEEN 3 AND 40),  -- NULL for staff bookings
  checked_in_at INTEGER,
  checked_in_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  task_id TEXT,
  reschedules INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  CHECK (kind = 'demo' OR days = 1)
);
CREATE INDEX IF NOT EXISTS crm_bookings_centre_idx ON crm_bookings (centre_slug, starts_at);
CREATE INDEX IF NOT EXISTS crm_bookings_lead_idx ON crm_bookings (lead_id, starts_at);
CREATE INDEX IF NOT EXISTS crm_bookings_host_idx ON crm_bookings (host_id, starts_at);
CREATE INDEX IF NOT EXISTS crm_bookings_status_idx ON crm_bookings (status, starts_at);

-- Fact sheet (D-072). Starts empty; nothing is seeded. Canonical for Asha (adm_facts) and R4 JSON-LD.
CREATE TABLE IF NOT EXISTS crm_fact_batches (
  id TEXT PRIMARY KEY,
  centre_slug TEXT NOT NULL,
  program TEXT NOT NULL CHECK (length(program) BETWEEN 1 AND 40),          -- LEAD_PROGRAMS except not-sure (zod)
  class_label TEXT NOT NULL CHECK (length(class_label) BETWEEN 1 AND 40),  -- LEAD_CLASSES (zod)
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  medium TEXT CHECK (medium IS NULL OR length(medium) <= 20),               -- english|hindi|both (zod)
  starts_on TEXT,                                                           -- YYYY-MM-DD (zod)
  timings TEXT CHECK (timings IS NULL OR length(timings) <= 120),
  fee_total_inr INTEGER CHECK (fee_total_inr IS NULL OR fee_total_inr BETWEEN 0 AND 10000000),
  instalments TEXT NOT NULL DEFAULT '[]',                                   -- JSON [{label, amountInr, dueNote}] ≤ 8
  hostel_note TEXT CHECK (hostel_note IS NULL OR length(hostel_note) <= 200),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  source_note TEXT CHECK (source_note IS NULL OR length(source_note) <= 200),   -- where the figure came from
  review_by INTEGER,                                                        -- optional re-check date
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'archived', 'demo')),  -- R3 never writes 'demo'
  verified_at INTEGER,
  verified_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_fact_batches_centre_idx ON crm_fact_batches (centre_slug, status, starts_on);

CREATE TABLE IF NOT EXISTS crm_fact_entries (
  id TEXT PRIMARY KEY,
  centre_slug TEXT,                                                         -- NULL = every centre
  programme TEXT CHECK (programme IS NULL OR length(programme) <= 40),      -- NULL = every programme
  kind TEXT NOT NULL CHECK (kind IN ('slot', 'qa')),
  slot_key TEXT CHECK (slot_key IS NULL OR length(slot_key) <= 40),         -- FACT_SLOT_KEYS (zod)
  topic TEXT CHECK (topic IS NULL OR length(topic) <= 40),                  -- FACT_TOPICS (zod)
  question_en TEXT CHECK (question_en IS NULL OR length(question_en) <= 200),
  question_hi TEXT CHECK (question_hi IS NULL OR length(question_hi) <= 200),
  value_en TEXT NOT NULL CHECK (length(value_en) BETWEEN 1 AND 1000),
  value_hi TEXT CHECK (value_hi IS NULL OR length(value_hi) <= 1000),
  disclosure TEXT CHECK (disclosure IS NULL OR length(disclosure) <= 300),  -- Asha: results claims; unused in R3 UI
  consent_ref TEXT CHECK (consent_ref IS NULL OR length(consent_ref) <= 80),
  source_note TEXT CHECK (source_note IS NULL OR length(source_note) <= 200),
  review_by INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'verified', 'archived', 'demo')),
  verified_at INTEGER,
  verified_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  CHECK ((kind = 'slot' AND slot_key IS NOT NULL) OR (kind = 'qa' AND question_en IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_fact_slot_uq
  ON crm_fact_entries (COALESCE(centre_slug, '*'), COALESCE(programme, '*'), slot_key)
  WHERE kind = 'slot' AND status IN ('draft', 'verified');
CREATE INDEX IF NOT EXISTS crm_fact_entries_centre_idx ON crm_fact_entries (centre_slug, kind, status, position);

-- Campaign links & QR (D-074).
CREATE TABLE IF NOT EXISTS crm_campaigns (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 3 AND 40),          -- [a-z0-9-]; becomes utm_campaign
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  channel TEXT NOT NULL CHECK (length(channel) BETWEEN 1 AND 20),          -- CAMPAIGN_CHANNELS (zod)
  centre_slug TEXT,
  starts_on TEXT, ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_campaign_links (
  code TEXT PRIMARY KEY CHECK (length(code) BETWEEN 4 AND 12),             -- /go/<code>; [a-z0-9], no look-alikes
  campaign_id TEXT NOT NULL REFERENCES crm_campaigns (id) ON DELETE CASCADE,
  target TEXT NOT NULL CHECK (length(target) BETWEEN 1 AND 40),            -- LINK_TARGETS key (zod allow-list)
  locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'hi')),
  utm_source TEXT NOT NULL CHECK (length(utm_source) BETWEEN 1 AND 40),
  utm_medium TEXT NOT NULL CHECK (length(utm_medium) BETWEEN 1 AND 40),
  label TEXT CHECK (label IS NULL OR length(label) <= 60),
  bio_label_en TEXT CHECK (bio_label_en IS NULL OR length(bio_label_en) <= 40),
  bio_label_hi TEXT CHECK (bio_label_hi IS NULL OR length(bio_label_hi) <= 40),
  bio_position INTEGER,                                                     -- non-NULL = on /links
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_campaign_links_campaign_idx ON crm_campaign_links (campaign_id);
CREATE TABLE IF NOT EXISTS crm_campaign_clicks (
  code TEXT NOT NULL REFERENCES crm_campaign_links (code) ON DELETE CASCADE,
  day TEXT NOT NULL,                                                        -- YYYY-MM-DD, IST
  clicks INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day)
);

-- Data & privacy (D-077). Skip crm_privacy_requests if Phase 1b built an erase-request store (B0.3).
CREATE TABLE IF NOT EXISTS crm_privacy_requests (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES crm_leads (id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 20),                 -- erase|stop_contact|access|correction (zod)
  received_via TEXT NOT NULL CHECK (length(received_via) BETWEEN 1 AND 20), -- phone|whatsapp|email|in_person|letter|web (zod)
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'declined')),
  handled_at INTEGER,
  handled_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 200),   -- no personal data (UI says so)
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_privacy_requests_status_idx ON crm_privacy_requests (status, received_at);
CREATE INDEX IF NOT EXISTS crm_privacy_requests_lead_idx ON crm_privacy_requests (lead_id);
CREATE TABLE IF NOT EXISTS crm_retention_runs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'run')),
  policy TEXT NOT NULL,                                                     -- JSON {unconvertedMonths, toolOnlyMonths}
  matched_unconverted INTEGER NOT NULL DEFAULT 0,
  matched_tool_only INTEGER NOT NULL DEFAULT 0,
  erased INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'partial', 'failed')),
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

-- Merge (D-076).
CREATE TABLE IF NOT EXISTS crm_lead_merges (
  from_lead_id TEXT PRIMARY KEY REFERENCES crm_leads (id) ON DELETE CASCADE,
  into_lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  merged_at INTEGER NOT NULL,
  merged_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  moved TEXT NOT NULL DEFAULT '{}'                                          -- JSON counts only
);
CREATE INDEX IF NOT EXISTS crm_lead_merges_into_idx ON crm_lead_merges (into_lead_id);
```

**Erase (`eraseAdmissionData(db, leadId, actorId, now)`, inside `eraseLead`'s transaction; CORE):**

| Table | What erase does |
|---|---|
| `crm_lead_students` | Deletes the family's rows |
| `crm_test_registrations` | Nulls `student_name`, `roll_no`, `section_scores`, `score`, `rank`, `scholarship_percent`, `admit_token_hash`, `admit_token_expires_at`; sets `name_key = 'erased:' \|\| id`. Keeps `roll_seq` (so numbers are never reused), `attendance`, `status`, `slot_id`, `via`, `campaign_code`. Erased rows count in registration and attendance figures only |
| `crm_bookings` | Nulls `note`, `program_note`, `student_id`; keeps the count fields |
| `crm_privacy_requests` | Open `erase` requests for the lead become `done`, handled by the erasing admin |
| `crm_lead_merges` | Every live stub merged into this lead (recursively, ≤ 5 hops) is erased in the same transaction with the same reason |
| `crm_fact_*`, `crm_campaign_*`, `crm_desk_staff` | Untouched (no family data) |

## B4. Shared contracts and helpers (P2-CORE)

### B4.1 Client-safe types (`src/lib/crm/admission/types.ts`)

All constants and the request/response shapes of every Phase 2 endpoint (B7). Highlights:

```ts
export const ADMISSION_LEAD_SOURCES = ["scholarship_test", "paper_form"] as const;   // added to KNOWN_LEAD_SOURCES labels
export const BOOKING_KINDS = ["visit", "demo"] as const;
export const BOOKING_STATUSES = ["requested", "booked", "attended", "no_show", "cancelled"] as const;
export const BOOKING_CREATED_VIA = ["staff", "desk", "family", "assistant"] as const;
export const TEST_EXAMS = ["BOH"] as const;
export const TEST_EVENT_STATUSES = ["draft", "open", "closed", "results_published", "archived"] as const;
export const REGISTRATION_VIA = ["public", "staff", "desk"] as const;
export const ATTENDANCE = ["unknown", "present", "absent"] as const;
export const STUDENT_SOURCES = ["lead", "submission", "staff", "assistant"] as const;
export const STUDENT_STATUSES = ["enquiring", "admitted", "not_joining", "removed"] as const;
export const FACT_SLOT_KEYS = ["centre_address", "centre_map_link", "desk_phone", "desk_hours", "prospectus_link",
  "meet_person", "bring_list_visit", "hostel_summary", "transport_note"] as const;
export const FACT_TOPICS = ["centre", "fees", "hostel", "scholarship", "documents", "transport", "other"] as const;
export const MONEY_FACT_TOPICS = ["fees", "scholarship"] as const;               // verify = super admin
export const CAMPAIGN_CHANNELS = ["poster", "seminar", "newspaper", "instagram", "whatsapp", "gbp", "event", "other"] as const;
export const LINK_TARGETS = { home: "/", scholarshipTest: "/scholarship-test", admissions: "/admissions", contact: "/contact",
  tools: "/tools", predictor: "/tools/predictor", mockTests: "/tools/mock-tests", planner: "/tools/planner", rancho: "/rancho",
  centres: "/centres", programs: "/programs", hostels: "/hostels", results: "/results", links: "/links" } as const;
export const PAPER_SOURCES = ["seminar", "newspaper_coupon", "paper_test_form", "poster", "other"] as const;
export const PRIVACY_REQUEST_KINDS = ["erase", "stop_contact", "access", "correction"] as const;
export const PRIVACY_RECEIVED_VIA = ["phone", "whatsapp", "email", "in_person", "letter", "web"] as const;
export const ADMISSION_TEMPLATE_IDS = ["visit_confirmed", "demo_confirmed", "visit_reminder", "test_registered", "test_result_ready"] as const;
export const DESK_ALLOWED_ROUTES: readonly { method: string; path: string }[] = [ /* B2.1 list */ ];
export interface Slab { minScore: number; percent: number }          // sorted ascending, unique, percent 0–100
export interface SectionDef { key: string; labelEn: string; labelHi: string | null; max: number | null }
export function nameKey(name: string): string;                      // NFKC, lower case, letters/digits/spaces, collapsed
```

### B4.2 Activity types (edit `src/lib/crm/types.ts`)

Add `"booking"`, `"test"` and `"desk"` to `ACTIVITY_TYPES`:

```
booking { bookingId, kind: visit|demo, event: booked|rescheduled|attended|no_show|cancelled, centre, startsAt (ISO), days? }
test    { eventId, slotId?, event: registered|cancelled|moved|checked_in|absent|result|result_corrected|resend_requested,
          rollNo?, centre?, score?, max?, percent?, rank?, via? }
desk    { event: arrived, centre }
```

- `KEEP_META_KEYS` (`admin.ts`) += `bookingId`, `eventId`, `slotId`, `event`, `kind`, `centre`. `rollNo`, `score`, `rank`, `percent`, `startsAt` are dropped on erase.
- `LeadDetailView.tsx` gets one `case "booking": case "test": case "desk":` calling `admissionTimelineLines(activity, t, locale)` from `src/components/admission/timeline.ts`; strings in `crm.lead.timeline.admission.*`; icons `CalendarDays`, `GraduationCap`, `DoorOpen`.

### B4.3 System actions, channels and transactions (`src/lib/crm/admission/system.ts`)

- **`CrmViewer.channel`** gains `"system"`, and **`ContactLogVia`** (`src/lib/crm/lead-ops-types.ts:377`) gains `"system"`. `leads.ts` already passes `viewer.channel ?? "ui"` to `onContactLogged`; LR-SLA resolves clocks only for `via === "ui"`. CORE confirms this in the built SLA code (one-line edit in `src/lib/crm/sla/**` only if needed). Check-in, scores and publication move stages but are not contact with the family, so they never count as the first call.
- **`systemViewerFor(actor)`** returns the actor's id and name with `role: "admin"`, `centreSlugs: []`, `channel: "system"`. Used only inside Phase 2 services **after** `admissionCan` has passed. The real actor stays on audit and activity rows. Not exported from `@/lib/crm`; a test asserts nothing outside `src/lib/crm/admission/**` imports it.
- **`advanceStage(viewer, leadId, target, now, { channel })`**: forward only (`stageOrdinal`); never moves `enrolled`; reopens `lost` when the target is `counselling_booked` or later; calls `changeStage` so LR hooks and audit fire.
- **Transactions:** Phase 1b's `runAtomic` if it exists, else `runInTx(db, fn)` wrapping `withTransaction` and throwing `AbortTx(result)` on an inner failure so everything rolls back.

### B4.4 Desk tweak in `createManualLead` (`src/lib/crm/capture.ts`)

When `viewer.frontDesk`: no counsellor self-assign (a new lead goes through LR's `onLeadArrival` with `manual: true`); `centreSlug` is forced to one of the desk's centres; the answer's `canOpen` is always `false`; `onDuplicate` is forced to `"report"` (a desk never appends to an existing family through this path). Other roles unchanged.

### B4.5 HTTP helper (`src/lib/crm/admission/http.ts`)

`requireAdmission(request, { route, write, cap, allowDesk?, bodyKind?, limit? })` wraps `requireCrm` (same origin, membership, rate limit), checks `admissionCan(viewer, cap)` without context (context checks are in services), reads the body with LR's `bodyLimit` (8 KB default; 256 KB for score chunks), and returns `{ viewer, centres }`. Responses are `no-store`, `X-Robots-Tag: noindex`, D-007 envelope; conflicts are 409 `bad_request` with `fieldErrors`; the error-code list stays frozen.

### B4.6 Lead scope SQL and the merge-following phone lookup (edit `src/lib/crm/repo/leads.ts`)

- `leadScopeSql(scope, leadIdExpr)` → `EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = <expr> AND …)`: a two-line wrapper over Phase 1b's `scopedLeadWhere` when it exists, else built on the private `scopeClause` (never copied).
- **`findLeadByPhone(db, phone)` follows merges.** When the row it finds is `stage = 'lost'` with `lost_reason = 'duplicate'` and has a `crm_lead_merges` row, it returns the surviving lead (≤ 5 hops; a cycle or a missing survivor returns the stub). Every caller (`captureLead`, `createManualLead`, the lead gate `gate.ts`, the CSV import `intake/import-backend.ts`, and Meta through intake) therefore lands on the family's live lead and never reopens the stub. `findLeadByPhoneRaw(db, phone)` returns the row holding the number (merge code and uniqueness checks only).

### B4.7 Audit (`src/lib/crm/admission/audit.ts`)

`ADM_AUDIT` constants and `admAudit(db, …)` → `recordAudit`. Details hold counts, ids and enums only. No detail key may match `/pass|hash|token|secret|salt|cookie|credential/i` (use `admitLink`, `gateBrowsers`). Labels in B10.

### B4.8 WhatsApp in Phase 2

- **Slots.** Phase 2 uses Phase 1b's single slot registry, a superset aligned with `docs/admissions-agent-voice.md`: `student_first_name, parent_name, counsellor_name, centre, centre_map_link, prospectus_link, date, time, test_date, batch_start, days, test_name, roll_no, reporting_time, venue, admit_link, bring_list, meet_person`. CORE widens 1b's registry if any are missing. `factSlotValues` returns `Partial<Record<TemplateSlot, string>>` against that registry.
- **Drafts.** CORE registers the 5 drafts (B5.12) in 1b's store with `context = 'booking'` or `'test'`, status "awaiting approval", seeded per key (`INSERT OR IGNORE`). The general composer lists only `context = 'general'`; Phase 2 buttons open their own context with the booking or registration filled in. Fallback per B0.4.
- **Sending.** A Phase 2 WhatsApp button opens `wa.me/<digits>?text=` and stores `{ leadId, template, lang }` in sessionStorage (the `call-return.ts` pattern). When the tab regains focus it asks **"Did you send it?" Sent / Not sent**. Only **Sent** logs a `whatsapp` contact (`outcome: message_sent`, `meta.template`, `meta.lang`). Opening alone logs nothing, resolves no clock and creates no task.

### B4.9 Seams (stubs written by P2-CORE; ownership passes to the named package)

| Stub (signature frozen after CORE) | Safe stub behaviour | Owner |
|---|---|---|
| `admission/test/register.ts`: `registerForTest(db, actor: CrmViewer \| null, input: RegisterInput, now): CrmResult<RegisterResult>` (`actor = null` = public; caller holds the transaction) | `fail("conflict", "not ready")` | P2-TEST |
| `admission/test/admit.ts`: `admitCardByToken(token, now): AdmitCardData \| null`; `mintAdmitLink(db, regId, now): string` (returns `/scholarship-test/admit#t=<token>`, unprefixed) | `null` / throws | P2-TEST |
| `admission/test/desk.ts`: `deskTestCheckins(viewer, { q, slotId? }, now): DeskTestList` | empty list | P2-TEST |
| `admission/test/public.ts`: `openEventsForPublic(now): PublicEvent[]` | `[]` | P2-TEST |
| `admission/facts/slots.ts`: `factSlotValues(db, centreSlug, now, opts?: { locale; program? }): Partial<Record<TemplateSlot, string>>` | `{}` | P2-FACTS-PRIVACY |
| `admission/campaigns/bio.ts`: `listBioLinks(locale): BioLink[]` | `[]` | P2-GROWTH |
| `src/components/admission/test/LeadTestPanel.tsx` (async server component, props `{ viewer, lead, locale, now }`) | renders nothing | P2-TEST |
| `src/components/admission/visits/LeadVisitsPanel.tsx` (same props) | renders nothing | P2-VISITS-DESK |
| `src/components/admission/family/LeadFamilyPanel.tsx` (same props) | renders nothing | P2-FAMILY |
| `src/components/admission/family/LeadMergeBanner.tsx` (same props) | renders nothing | P2-FAMILY |
| `src/components/admission/public/AdmitCard.tsx` (props `{ data: AdmitCardData; locale; printable }`) | plain fields list | P2-PUBLIC |
| `src/components/admission/growth/FirstResponseByCentre.tsx` (props `{ viewer, range, locale }`) | renders nothing | P2-GROWTH |

`src/components/admission/LeadAdmissionPanel.tsx` (CORE) renders Family, Visits, Test in order. The lead page passes it to `LeadDetailView` as a new optional `admission?: ReactNode` (under the details card, own `<Suspense>`), and `LeadMergeBanner` as `admissionBanner?: ReactNode` (top of the page). With these slots, P2-FAMILY edits no shared CRM file except Phase 1b's duplicate card.

### B4.10 Channel classifier (Phase 1b's `src/lib/crm/console/channels.ts`; CORE edit)

Add channel `paper_forms` (`source = 'paper_form'`, right after the CSV-import rule) and `scholarship_test` (`source = 'scholarship_test'`, after the Meta rule), with en/hi labels; extend `IMPORTED_SQL` to include `source = 'paper_form'`. Classifier tests for both.

## B5. Feature specifications

### B5.1 Scholarship test: staff side (P2-TEST, D-070)

**Pages**
- **`/crm/scholarship-test`** (list): cards with name, status chip (Draft / Registration open / Registration closed / Results published / Archived), test dates (first to last slot), registration window, scoped counts (registered, present, scored), and "against target" only when set. Admins see **New test**. Empty state: "No scholarship test set up yet. An administrator adds the test, its centres and times here." Counsellors: "When a test is open, you can register your families from their page."
- **`/crm/scholarship-test/[eventId]`**, tabs as links (`?tab=`), by role:
  1. **Registrations** (everyone, scoped): filters slot / centre / attendance in the URL; the search box (roll, last 4 digits, name) posts to `POST …/registrations/search` (no search term in the URL). Table: roll, student, class, slot, via, counsellor, attendance, score and % once published, link to the lead (`?back=/crm/scholarship-test/<id>`). Rows whose name differs from the lead's student and have no `student_id` show **Confirm as sibling** (creates a `crm_lead_students` row, `source = 'submission'`). Phones never shown. 50 per page.
  2. **Test day** (manager own centres, admin): slot picker (default today's slot at the viewer's centre), search box, rows ≥ 48 px with **Present** (undo within 10 s), live counter "Present 120 of 300 registered", **Mark the rest absent** after the slot ends (confirm with count), **Register on the spot** (capacity permitting).
  3. **Scores** (manager own centres, admin): by hand (present candidates, inline numeric + section inputs, per-row PATCH) or **Upload CSV** (template `roll_no,score[,<section keys>],absent`; browser decode with LR's `decodeCsvBytes` / `parseCsv`; row-error preview: unknown roll, cancelled, above max, not a number; apply in chunks ≤ 250, one transaction each). Counter "Scored 240 of 260 present". Editable until published; afterwards only an admin's **Correct a score** (single row, reason required, `result_corrected` entry, offer-task title updated).
  4. **Results** (admin publishes; managers read): slab preview (slab → count; "below the lowest slab: no scholarship"); if slabs are not set: "Slabs are not set. Only a super admin can set them (Settings tab)" and publish disabled until `slabs_version ≥ 1`. **Publish results**: confirm with counts, then a client loop `POST …/publish {batch: 200}` until `remaining = 0` with a progress bar; resumable and idempotent (rows with `result_at` are skipped). Afterwards: rank, score, %, offer-call state (open / done / overdue / unassigned), assignee, filter "Offer call overdue".
  5. **Report** (manager own centres, admin): B6.1; CSV export without phones (`adm.test_export`, export limiter).
  6. **Settings**: event fields (admin; `bring_en` / `bring_hi` prefilled for a new test with the editable draft "This admit card (printed or on your phone)" and its Hindi); slots table (admin; managers for own centres; a slot with registrations cannot change centre); **slabs editor** (SA; sorted, unique, 0–100; optimistic `slabs_version`; "no slabs for this test" confirmation); **show slabs publicly** (SA); **registration targets per centre** (SA); read-only line "Online version: not available yet" from QB `slotReadiness("boh-class-10")` in try/catch ("unknown" on error).
- **`/crm/scholarship-test/[eventId]/admit/[regId]`**: staff print view with `AdmitCard`, **Copy family link** and **Send on WhatsApp** (`test_registered`). Both mint a new link and warn "The old link stops working".
- **`LeadTestPanel`**: the family's registrations (test, roll, slot, attendance, score / % once published); actions **Register for a test** (event open or upcoming; slot; student = main, a sibling, or a new name that adds a sibling, `source = 'staff'`; class), **Move to another slot**, **Cancel**, **Admit card**, **Send on WhatsApp**, **Confirm as sibling**.

**Rules**
1. **Status.** draft → open needs ≥ 1 active future slot and a valid window (missing open date = now; missing close date = the last slot's reporting time). **Publicly visible** = `open`, now inside the window, ≥ 1 active future slot. "Registration closed" is manual or shown once the window has passed.
2. **`registerForTest`** runs inside the caller's `BEGIN IMMEDIATE` transaction (race-free capacity and roll numbers):
   1. The slot is active and belongs to the event. Public: event publicly visible and slot in the future. Staff/desk: event `open` or `closed` (not published) and the slot has not ended (test-day walk-ins).
   2. `nameKey(studentName)`; an existing `registered` row with the same `(event, lead, name_key)` → returns it with `alreadyRegistered: true` and **mints nothing**.
   3. `count(registered in slot) < capacity`; managers and admins may pass `overCapacity: true` (audited).
   4. `roll_seq = max + 1` per event (> 9999 → conflict); `roll_no = ${code}-${seq padded to 4}`.
   5. Student link: staff with `studentId` → must belong to the lead; staff with a new sibling name → create `crm_lead_students` (`source = 'staff'`). **Public registrations never create sibling rows**: the typed name is stored on the registration only, `student_id` NULL, and staff confirm later.
   6. `campaign_code` from the input (public: the request context's `utm_campaign` when it matches `^[a-z0-9-]{3,40}$`, else NULL).
   7. `test` activity `registered`. **No stage change**; the first-call clock starts only through capture (B5.2).
3. **Check-in** sets `present` and calls `advanceStage → test_taken` with `channel: "system"`. **Absent** changes no stage. **Undo** reverts attendance only (stage stays).
4. **Scores:** `score ≤ max_score` when set; each section ≤ its max; a scored candidate with `attendance = unknown` becomes `present` (counted, with a warning).
5. **Publish**, per registration with `score` set and `result_at` NULL: competition rank among scored registrations of the event (1, 2, 2, 4); `scholarship_percent` from slabs (highest `minScore ≤ score`, else 0); `test` activity `result`; `advanceStage → test_taken` (system); offer task via `createFollowUpTask` (title "Offer call: {test} result ({percent} % scholarship)", or "Result call: {test}" when 0; due `result_at + 48 h`; assignee = the lead's assignee; `onlyIfNoOpenTask` not set). Unassigned lead → no task, row shows "Unassigned". Event becomes `results_published` when nothing remains. Audit `adm.test_results_publish` with counts per batch.
6. **Cancel** frees capacity, writes `test` `cancelled`, nulls the admit token.

### B5.2 Public registration, admit card and bio-link page (P2-PUBLIC)

**`/scholarship-test`** (and `/hi/scholarship-test`)
- Static shell (prerendered): h1 "Scholarship test registration" and a neutral 3-step "How it works" (register → get your admit card → take the test at your centre; your counsellor calls with the result).
- Under `<Suspense>`: `await connection()`, then `openEventsForPublic(now)`. Per open event, all staff-typed: name in the page locale (falling back to English with `lang="en"`), intro, eligible classes, closing date, fee note (if set), slabs (only if `show_slabs_publicly` and set), what to bring.
- **Form (`RegistrationForm`, client).** A line above the fields: "To be filled in by the student's parent or guardian." Fields: student name (2–80), parent or guardian name (2–80), **parent or guardian's mobile** (enquiry-contract phone rule), class (the event's classes only), slot radios grouped by venue ("Mon 24 Nov · report 9:30, starts 10:00 · {venue}"; full slots disabled and labelled "Full"; **no seat counts**), the consent checkbox with the exact `forms.shared.consent` sentence (`2026-10-20.v2`) and its privacy link, hidden honeypot `website`. **No student/parent selector**; `submittedBy` is recorded as `parent`. The client sends `collectEnquiryContext(locale)` as `context`.
- **States:** submitting; field errors with a focused error summary; slot just filled (409 → "This time is now full. Please choose another." and the list refreshes); closed (409); rate-limited (429); **registered** ("You're registered. Roll number BOH26-0042. Save or print your admit card now." with **Open admit card** and **Print**); **received** ("Thank you. This student may already be registered. Your counsellor will confirm and send the admit card.").
- **No event open:** "Registration is not open yet. Leave your number and our counsellor will tell you when it opens." plus the existing `EnquiryForm` (variant `quick`; the family picks "Scholarship"; that file is not edited).
- Metadata from messages; site-default robots; not added to the sitemap or header.

**`POST /api/scholarship-test/registrations`** (public). Order: same origin → JSON ≤ 8 KB → zod → honeypot (non-empty → the fake-success shape, nothing stored, as the enquiry handler does) → limiters (per IP 20 per 10 min, per phone 3 per hour) → one `withTransaction`:
1. `captureLead({ source: "scholarship_test", studentName, guardianName, phone, currentClass, centreSlug: slot.centre_slug, consent: { textVersion: "2026-10-20.v2", at, locale, text: CONSENT_TEXTS[v2][locale] }, context: leadContextFromEnquiry(context), submittedBy: "parent" }, now, { submissionMeta: { testEventId } })`;
2. `registerForTest(db, null, { leadId, eventId, slotId, studentName, currentClass, via: "public", campaignCode }, now)`; a failure rolls back the capture too;
3. new registration → `mintAdmitLink`; existing → no link, a `test` activity `resend_requested`, and a task "Resend admit card: {test}" for the assignee (due now) unless an open task with that title already exists.

Response (same shape both ways): `201 { status: "registered" | "received", rollNo: string | null, admitUrl: string | null, eventName, slot: { venue, startsAt, reportingAt } | null }`; `admitUrl` = `localePath("/scholarship-test/admit") + "#t=<token>"`. Logs carry fixed codes only.

**Admit card: `/scholarship-test/admit#t=<token>`**
- The token sits in the URL **fragment**, which browsers never send to the server: it stays out of nginx logs, app logs and `Referer`. The page is fully static; a client loader reads `location.hash` and calls `POST /api/scholarship-test/admit { token }` (same origin, 2 KB, per-IP limiter 30 per 10 min, `no-store`, `noindex`) → `AdmitCardData` or one 404 for invalid, expired or cancelled.
- Shows: "Aspire IIT & Medical", test name, **roll number** (large), student name and class, venue as typed, date, reporting time, start time, duration, what to bring, rules. No phone, score, slab or QR. Invalid: "This admit card link is not valid. Please contact your centre."
- Metadata `robots: noindex, nofollow`, `referrer: no-referrer`. Print CSS hides site chrome and fits one A4 page.
- Token: 32 random bytes, base64url; only the SHA-256 is stored; expiry = end of the IST day of the event's last slot + 2 days. Erase and cancel null it; staff rotation replaces it.

**`/links`** (Instagram bio page): under Suspense `listBioLinks(locale)` → large buttons in `bio_position` order pointing at `/go/<code>`; heading "Aspire IIT & Medical", line "Quick links"; `noindex`; empty: "Nothing here yet." with a link home.

### B5.3 Visits & demo classes (P2-VISITS-DESK, D-071)

**`/crm/visits`**: centre filter (`viewerCentres`), Day / Week, previous / next / Today, **Book a visit** ("Find the family": name or last 4 digits within scope, posted, then the form). Agenda grouped by day with real headings: time, kind chip ("Visit" / "Demo · day 2 of 5"), family display name, host, status chip (text), actions **Arrived**, **Didn't come**, **Change time**, **Cancel**, **WhatsApp confirmation**, **Add to my calendar**. Summary strip (B6.2). "Tomorrow: reminders" with **Send reminder** (`visit_reminder`). Empty: "No visits booked for this week. Book one from a family's page." Scope: counsellor own leads + hosted; manager own centres + scoped leads; admin all.

**Booking form** (dialog): kind (visit / demo); student (main, sibling, or another child → sibling, `source = 'staff'`); centre (lead's centre by default, limited to viewer's centres); date and time (IST); duration (visit 45 default, 15–480); days (demo 3–7, default 3); host (default the lead's assignee; managers/admins may pick active staff whose scope covers the centre); batch or class (demo, ≤ 80); note (≤ 200). Start ≥ now − 7 days; a past date offers "Record a visit that already happened" (created `attended`). Outside 08:00–20:00 or a host overlap → warning only. `created_via = 'staff'`.

**Effects** (`bookVisit`, `updateBooking`, one transaction each):

| Action | Stage | Task | Timeline |
|---|---|---|---|
| Book (future) | `advanceStage → counselling_booked`, `channel: "ui"` (staff spoke to the family) | `createFollowUpTask` "Visit at {centre}: meet the family" (or "Demo classes start at {centre}"), due `starts_at`, assignee host ?? lead assignee | booked |
| Arrived | `advanceStage → visited_or_demo` (system) | booking task completed; "Follow up after the visit" due +1 day, unless an open task created after this booking exists (Phase 1b's rhythm) | attended |
| Didn't come | — | booking task completed; "No-show: offer a new time" due `addWorkingMinutes(now, 120)` | no_show |
| Cancel | — | booking task completed | cancelled |
| Change time | — | old task completed, new one at the new start; `reschedules + 1` | rescheduled |

Optimistic `version` on PATCH. Desk: `checkin` / `no_show` only, own centre, today. Tasks always go to staff, never to a desk login. `GET /api/crm/bookings/[bookingId]/ics` → `buildIcs`, summary "Aspire {visit|demo classes} at {centre}", description = the console link only (**no names**). `LeadVisitsPanel`: the family's bookings (newest first) with the same actions, plus **Book a visit** and **Book demo classes**.

### B5.4 Walk-in desk and front-desk logins (P2-VISITS-DESK, D-073)

**`/crm/desk`** (tablet-first: 768 px portrait and 1024 px landscape; phones work):
1. **Header:** desk centre and today's date.
2. **Find a family:** full 10-digit mobile only (no partial search). `POST /api/crm/desk/families { phone }` → at most one **family card**: student name (and siblings' first names), class, counsellor's name, today's bookings and registrations at this centre. No stage, notes, history, consent or other phones. The number stays in component state, never in the URL. Limiter 60 lookups per 10 minutes per desk user; audited `adm.desk_lookup` (target = lead id).
   - **They're here: tell the counsellor** → `POST /api/crm/desk/arrivals { phone }`: re-finds the lead, writes a `desk` activity `{ event: "arrived", centre }` through `systemViewerFor(desk)` and `createFollowUpTask("At the {centre} desk now", due now, the assignee)`. **No new enquiry, no consent claim, no reopen, no stage change.** No assignee → the task is created unassigned and the desk sees "No counsellor is assigned. Please call the centre manager." If the family's latest word was "stop contacting me" (`withdrawn`), the action is **blocked**: "This family asked us not to contact them. Please ask the centre manager."
   - **Check in** a booking or registration on the card.
   - **Not found:** "No family with this number. Add them as a new walk-in" (opens the form with the number filled from state).
3. **New walk-in form:** student name, parent or guardian name, mobile, class and program, centre (fixed), "How did you hear about us?" (Phase 1b's options if they exist), consent method (required, default "In person"), note (≤ 200). `POST /api/crm/desk/walk-ins` → `createManualLead` (desk rules, B4.4); a duplicate returns the family card. Success: "Added. {Counsellor} has been told" or "Added. A manager will assign a counsellor".
4. **Today's visits** at the desk centre with **Arrived** / **Didn't come**.
5. **Test check-in** (only when a slot at this centre is today): `POST /api/crm/desk/test-search { q, slotId }` → `deskTestCheckins` (roll, last 4 digits or name, today's slots at this centre only); **Present**; counter; **Register on the spot** when capacity allows.

**`/crm/settings/desk`** (front-desk logins): super admin edits; admins read with login ids; managers read **without** login ids (LR's `ReadOnlyNotice`). Table: name, login id (where allowed), centre, active, last sign-in if available. **Create login** → `POST /api/crm/desk/accounts { displayName, loginId, centreSlug }` (SA, same origin) → `adminCreateUser(session, { role: "staff", … }, now, { onCreated: (db, user) => insertDeskRow })`, one transaction, **no `crm_staff` row**, temporary password returned once. `PATCH /api/crm/desk/accounts/[userId]` edits centre and active. Disable and password reset use the existing SA-only account actions.

### B5.5 Fact sheet (P2-FACTS-PRIVACY, D-072)

**`/crm/facts?centre=<slug>`**: centre picker (desk: own centre only). Sections: **Centre basics** (`FACT_SLOT_KEYS` for this centre and "all centres"); **Batches & fees** (name, program, class, medium, start date, timings, total fee in ₹ formatted `en-IN`, instalments, hostel note, note); **Scholarship test** (read-only from tests: next open or upcoming test with a slot here, slabs if set; "Not set" otherwise); **Answers for families** (Q&A by topic, client-side search). Each fact shows **Verified** (date, by whom), **Not verified: check before telling a family** (amber, icon and text), **Not set**, or (never in R3) **DEMO**. **Copy** per fact; **Print fact sheet** (unverified printed with "(not verified)"). **Edit drawer** (managers own centres, admins): typed fields; URLs `https:` only; map links `maps.app.goo.gl`, `google.com/maps`, `g.page`, `goo.gl/maps`; real dates; integer money ≥ 0; optional "Where this figure came from" (`source_note`). **Saving any change resets to "not verified".** **Mark verified**: admins for non-money facts; **super admins** for batches and for entries with topic `fees` or `scholarship`. **Archive**: admins and the drafting manager. Empty: "Nothing entered for this centre yet. Facts are added by your centre manager and checked by an administrator."

**`factSlotValues`**: only `verified` rows; centre-specific before "all centres"; `value_hi` for Hindi templates when set, else English. Supplies `centre_map_link`, `prospectus_link`, `meet_person`, `bring_list` (from `bring_list_visit`, booking context only), `test_date` (next open event slot at the centre, locale-formatted), `batch_start` (earliest verified batch `starts_on` matching the lead's program, only if exactly one program matches). Everything else is typed by staff. R4 JSON-LD and Asha read only verified rows.

### B5.6 Campaign links & QR (P2-GROWTH, D-074)

**`/crm/campaigns`** (admin edits; managers read): name, channel, centre, links, opens (30 days), enquiries, reached counselling, admitted, test registrations. **New campaign** (admin): name, code (auto-slug, editable, `[a-z0-9-]`), channel, centre, dates.
**`/crm/campaigns/[campaignId]`**: links table (label, `{origin}/go/{code}`, target name, locale, utm source/medium with channel defaults — poster `poster`/`offline`, newspaper `newspaper`/`offline`, instagram `instagram`/`social`, whatsapp `whatsapp`/`social`, gbp `google_business`/`local` — "show on /links" with en/hi label, opens 30 days); actions **Copy**, **QR (SVG)**, **QR (PNG)**, **Print**, **Archive**; opens-per-day chart (30 days) with a table alternative; B6.3 numbers.
**`/crm/campaigns/[campaignId]/print/[code]`**: QR ≥ 4 cm, short URL in text below, campaign label; **"TEST, do not print"** watermark and banner unless `getSiteOrigin()`'s host is `aspireiit.in` or `www.aspireiit.in`, plus the line "Scan one printed copy with a phone before printing many".

**`/go/<code>`** (`src/app/go/[code]/route.ts`; CORE adds `go` to `NON_LOCALIZED_PREFIX` in `src/i18n/paths.ts`): cached link lookup (60 s TTL); unknown or archived → `302 Location: /`; otherwise `302` with a **relative** `Location: {localePath(target, locale)}?utm_source=…&utm_medium=…&utm_campaign={campaign.code}&utm_content={code}`; `Cache-Control: no-store`, `X-Robots-Tag: noindex`. `HEAD` and `Purpose: prefetch` / `Sec-Purpose: prefetch` redirect without counting. Counter: `globalThis[Symbol.for("aspire.campaignClicks")] = { pending: Map<"code|day", n>, lastFlush }` (≤ 5,000 keys; beyond that drop and log a fixed code); flush = one transaction of `INSERT … ON CONFLICT DO UPDATE SET clicks = clicks + ?`, run when `now − lastFlush ≥ 60 s` on any `/go` request and before any campaigns page or API read. Read `node_modules/next/dist/docs` on route handlers first; add the route to the prerender bail-out test (integrate).

**QR encoder** (`src/lib/crm/admission/campaigns/qr/{encode,svg,png}.ts`, server-only): byte mode; EC level M at versions 1–3, else L at 1–5 (all single-block: no interleaving, no version-information area); payload over 106 bytes → `qr_too_long` (short links ≤ 45 characters); mask by the four ISO penalty rules. SVG: one `<path>`, 4-module quiet zone, `role="img"`, `<title>` = URL. PNG: 8-bit grayscale, `node:zlib` `deflateSync`, CRC-32 table, 10 px per module. Downloads audited `leadgen.qr_download`.

### B5.7 Paper enquiry import (P2-GROWTH extends LR-IMPORT, D-075)

On `/crm/settings/import` (still super-admin only):
- A new consent basis **"Paper forms the families filled in and signed (seminar, coupon, test form)"** mapping to method `written`, with a required **"Where did these forms come from?"** (`PAPER_SOURCES`) and an optional **Campaign** (active campaigns).
- Per-row column `consent_method`: "signed" → `written`; "in person" / "walk-in" → `in_person`; "phone" / "call" → `phone`; "whatsapp" / "sms" → `message`. A valid value overrides the batch basis; an unknown value makes the row invalid (`consent_method`).
- Paper batches: source `paper_form`; context utm `source = <paperSource>`, `medium = offline`, `campaign = <campaign.code | null>`; `submissionMeta: { importBatch, paperSource, consentMethod }`.
- If Phase 1b exposes a details setter (`onlyEmpty`), map school, board, how they heard and alternate phone; otherwise those columns are ignored with a preview note.
- Unchanged: idempotency, attach-only for existing families, Excel-damage blocking, chunks, limits. The 1b classifier counts these as `paper_forms` (B4.10).

### B5.8 Families: siblings and merge (P2-FAMILY, D-076)

**`LeadFamilyPanel` "Students in this family":** the main student from the lead (read-only here; edit via Edit details), plus `crm_lead_students` rows (name, class, program, status, note). Add, edit, and **remove** (sets `status = 'removed'`; hard delete only on erase). `admitted` sets `status_at`. The panel also holds **Merge another enquiry into this family** (search within scope, posted).

**Merge** (`POST /api/crm/leads/[leadId]/merge { fromLeadId, confirm: true }`): admin or manager; both leads visible (`canSeeLead`); neither erased nor already merged; never the same lead. The dialog lists what moves (counts) and says it is one-way. Also started from Phase 1b's duplicate-suggestion card (FAMILY adds the action there). In one transaction, keeping A and merging B:
1. Move B's activities, tasks, bookings, registrations, students and LR `crm_external_refs` to A; move gate passes, then `trimGatePasses(db, A, MAX_GATE_PASSES_PER_LEAD)`. A registration that would violate `crm_test_reg_once_uq` on A is cancelled on B's side and counted as `duplicateRegistrations`.
2. Phase 1b details: fill A's empty fields from B; B's phone becomes A's alternate phone if empty. 1b duplicate dismissals referencing B are deleted.
3. Close B's open SLA clock (`closeSlaClock(closed)`).
4. B → `lost`, reason `duplicate` (system viewer); wipe B's names, email and message. **B's phone stays on the stub** so the unique index keeps the number pointing at the family; `findLeadByPhone` follows the merge (B4.6).
5. Insert `crm_lead_merges`; write `merge` activities on A (`{ from, moved }`) and B (`{ into }`); recompute `next_task_due_at` for both.
6. Audit `crm.lead_merge` with count keys `activities, tasks, bookings, registrations, duplicateRegistrations, students, externalRefs, gateBrowsers, toolUses` (no key containing "pass").

`LeadMergeBanner` on B: "Merged into {A}" with a link (only if the viewer can see A). Erasing A erases its stubs (CORE, B3).

### B5.9 First-call speed by centre (P2-GROWTH)

A card "First call speed by centre" on `/crm/dashboard` (mounted by CORE), using the dashboard's range and the viewer's scope; definitions in B6.4. It uses LR's clock definitions and never repeats LR's own tiles.

### B5.10 Roles & permissions (`/admin/permissions`, P2-FACTS-PRIVACY, English only)

One read-only table: rows = capabilities in plain words; columns = Super admin, Admin, Centre manager, Counsellor, Front desk, Question-bank author/reviewer. Built from `src/components/admission/permissions/permissions-table.ts` (B2.2 + LR §22). Static, so shown in preview mode. A test checks every row against `admissionCan` / `crmPermissions` for a fixture viewer of each role.

### B5.11 Data & privacy (`/admin/privacy`, P2-FACTS-PRIVACY, English only, admin)

1. **Requests:** open first (kind, received via, date, family link, age in days); **Record a request** (find by full phone or name within admin scope, posted; nothing stored about families not found); **Close** with an outcome note (UI: "no personal details"; the server strips digit runs of 10 or more); `erase` requests link to the existing erase dialog and close automatically on erase. The open count feeds Phase 1b's "Needs attention" if a registry exists.
2. **Clean-up (decision 20, pending CRM-3):** **last real contact** = the latest `at` of activities of type `submission, created, call, whatsapp, note, stage_change, booking, test, desk, tool_use` (fallback `created_at`); automatic tasks and assignments never count.
   - *Unconverted*: not erased; current and furthest stage ≠ `enrolled`; last real contact < now − 18 IST calendar months; no open task created by a person (`created_by` not NULL); no future booking or registration.
   - *Tool-only*: `source = 'tool'`, `furthest_stage = 'new'`, no `call` / `whatsapp` activity, last real contact older than 6 months.
   - **Dry run** (admin): counts per rule and 20 sample lead links, recorded in `crm_retention_runs`. **Run** (SA): needs a dry run in the last 24 h and the typed confirmation `ERASE <n>`; a client loop `POST …/retention/run {batch: 200}` erases each lead with `eraseLead(SA, id, now, { reason: "no_longer_needed" })`, one transaction per batch, with progress. No schedule.
3. **Exports & imports log:** last 100 `audit_log` rows with actions `crm.export`, `adm.test_export`, `crm.import_start`, `crm.import`, `leadgen.qr_download` (actor, time, counts), via `admission/repo/privacy.ts`.
4. **Withdrawals:** count of `consent_withdrawn` activities in the last 30 days, no list.

Preview mode: "Preview: no data".

### B5.12 WhatsApp drafts (CORE registers them as "awaiting approval")

| Template (context) | Draft |
|---|---|
| `visit_confirmed` (booking) | **EN** "Namaste {parent_name} ji, your visit to Aspire's {centre} centre is booked for {date} at {time}. Address and map: {centre_map_link}. {meet_person} will meet you at reception. To change the time, just reply here." · **HI** "नमस्ते {parent_name} जी, Aspire के {centre} सेंटर में आपकी विज़िट {date} को {time} बजे के लिए बुक है। पता और मैप: {centre_map_link}। रिसेप्शन पर {meet_person} आपसे मिलेंगे। समय बदलना हो तो यहीं जवाब दीजिए।" · **Hinglish** "Namaste {parent_name} ji, Aspire ke {centre} centre mein aapki visit {date} ko {time} baje book hai. Address aur map: {centre_map_link}. Reception par {meet_person} aapse milenge. Time badalna ho to yahin reply kijiye." |
| `demo_confirmed` (booking) | **EN** "Namaste {parent_name} ji, {student_first_name} can attend demo classes at our {centre} centre for {days} days from {date}, {time}. Please come to reception on the first day. Map: {centre_map_link}." · **HI** "नमस्ते {parent_name} जी, {student_first_name} हमारे {centre} सेंटर में {date} से {days} दिन डेमो क्लास ले सकते हैं, समय {time}। पहले दिन रिसेप्शन पर आइए। मैप: {centre_map_link}।" · **Hinglish** "Namaste {parent_name} ji, {student_first_name} hamare {centre} centre mein {date} se {days} din demo class le sakte hain, time {time}. Pehle din reception par aaiye. Map: {centre_map_link}." |
| `visit_reminder` (booking) | **EN** "Reminder: your visit to Aspire's {centre} centre is tomorrow, {date} at {time}. Map: {centre_map_link}. Reply here if you need to change it." · **HI** "याद दिला दें: Aspire के {centre} सेंटर में आपकी विज़िट कल, {date} को {time} बजे है। मैप: {centre_map_link}। समय बदलना हो तो यहीं जवाब दीजिए।" · **Hinglish** "Yaad dila dein: Aspire ke {centre} centre mein aapki visit kal, {date} ko {time} baje hai. Map: {centre_map_link}. Time badalna ho to yahin reply kijiye." |
| `test_registered` (test) | **EN** "Namaste {parent_name} ji, {student_first_name} is registered for {test_name}. Roll number: {roll_no}. Date: {test_date}; please report by {reporting_time} at {venue}. Admit card: {admit_link}. Please bring: {bring_list}." · **HI** "नमस्ते {parent_name} जी, {student_first_name} का {test_name} के लिए रजिस्ट्रेशन हो गया है। रोल नंबर: {roll_no}। तारीख़: {test_date}; {reporting_time} तक {venue} पहुँचें। एडमिट कार्ड: {admit_link}। साथ लाएँ: {bring_list}।" · **Hinglish** "Namaste {parent_name} ji, {student_first_name} ka {test_name} ke liye registration ho gaya hai. Roll number: {roll_no}. Date: {test_date}; {reporting_time} tak {venue} pahunchiye. Admit card: {admit_link}. Saath laayiye: {bring_list}." |
| `test_result_ready` (test) | **EN** "Namaste {parent_name} ji, {student_first_name}'s {test_name} result is ready. {counsellor_name} from Aspire will call you to explain it. You can also reply here with a good time to call." · **HI** "नमस्ते {parent_name} जी, {student_first_name} का {test_name} रिज़ल्ट आ गया है। Aspire से {counsellor_name} आपको कॉल करके समझाएँगे। चाहें तो यहीं कॉल के लिए सही समय बता दीजिए।" · **Hinglish** "Namaste {parent_name} ji, {student_first_name} ka {test_name} result aa gaya hai. Aspire se {counsellor_name} aapko call karke samjhayenge. Chahein to yahin call ke liye sahi time bata dijiye." |

No draft contains a fact; every fact is a slot. In the test context `bring_list` and `venue` come from the event and slot; in the booking context `bring_list` comes from the verified `bring_list_visit` fact. A missing slot keeps the send button disabled (`aria-disabled` button, not a link) until staff type it.

## B6. Reports and metric definitions (exact, scoped; no estimates)

### B6.1 Scholarship test report (per event; centre filter)

| Metric | Definition |
|---|---|
| Registered / Cancelled | `count(status = 'registered')` / `count(status = 'cancelled')` |
| Against target | Only when `targets[centre]` is set: "120 of 200 (60 %)" |
| Present / Absent / Not marked | `attendance` among registered |
| Attendance rate | `present / registered` (null when 0) |
| Scored | `score IS NOT NULL` (erased rows are never scored) |
| Score distribution | 10 buckets of width `max_score / 10` when set, else 10 equal buckets between observed min and max |
| Mean / median / highest | Over scored rows (median in JS) |
| Per slab | Scored rows with `minScore_i ≤ score < minScore_{i+1}`, plus "below the lowest slab" |
| Offer calls | Created = `offer_task_id` set; done = task `done_at` set; on time = `done_at − result_at ≤ 48 h`; unassigned = published rows without a task |
| After the test | Distinct leads with a present registration: "offer or later" = stage ∈ {offer, enrolled}; admitted = `enrolled`; admission rate = admitted / distinct present leads |
| By source and campaign | Grouped by `via`, and by the registration's own `campaign_code` (null → "No campaign") |

All rows also by centre and by slot. Erased families count in registration and attendance only.

### B6.2 Visits (header of `/crm/visits`, visible range)

| Metric | Definition |
|---|---|
| Booked | Bookings with `starts_at` in range, status ≠ `requested` |
| Attended / Didn't come / Cancelled | By status |
| No-show rate | `no_show / (attended + no_show)` (null when 0) |
| Moved on | Distinct leads with an attended booking in range whose `furthest_stage` ordinal ≥ `applied`; admitted = `enrolled` |

### B6.3 Campaigns

| Metric | Definition |
|---|---|
| Opens | `sum(clicks)` over the range, labelled "Opens (scans and clicks, not people)" |
| Enquiries | `count(crm_leads WHERE utm_campaign = code AND created_at in range)`; UI: "New families only; families already on file are not counted again." |
| Reached counselling | Of those, `furthest_stage` ordinal ≥ `counselling_booked` |
| Admitted | Of those, stage = `enrolled` |
| Test registrations | Registrations with `campaign_code = code` (new **and** known families) |
| Opens → enquiry | `enquiries / opens`, shown with "rough" |

### B6.4 First-call speed by centre (LR clocks)

`crm_sla_clocks` with `reason IN ('new', 'reopened')` and `started_at` in range, joined to `crm_leads.centre_slug` (null → "No centre"), scope via `leadScopeSql`: clocks; resolved; met (`met = 1`); met rate = met / resolved; median `work_ms / 60000` over resolved; open overdue now = `resolved_at IS NULL AND due_at < now`. Imported clocks (`reason = 'import'`) shown separately.

## B7. API summary (D-007 envelope; `no-store`, `noindex`; same-origin writes; zod; limits)

| Method and path | Who | Body / query → data |
|---|---|---|
| GET/POST `/api/crm/scholarship-test/events` | view scoped / create admin | list / `EventInput` → `EventDetail` |
| GET/PATCH `…/events/[eventId]` | scoped / admin | `{ …fields, status?, expectedVersion }` |
| PUT `…/events/[eventId]/slabs` | SA | `{ slabs, showPublicly, expectedVersion }` |
| PUT `…/events/[eventId]/targets` | SA | `{ targets: Record<centre, number \| null> }` |
| POST `…/events/[eventId]/slots`; PATCH `/api/crm/scholarship-test/slots/[slotId]` | admin; manager own centre | `SlotInput` |
| POST `…/events/[eventId]/registrations/search` | scoped | `{ slotId?, attendance?, q?, page }` → `RegistrationPage` |
| POST `/api/crm/scholarship-test/registrations` | `test.register` (**desk**: own centre) | `{ leadId?, eventId, slotId, studentId?, studentName, currentClass?, overCapacity?, walkIn? }` (desk walk-in carries the B5.4 family fields instead of `leadId`) |
| PATCH `/api/crm/scholarship-test/registrations/[regId]` | per action; **desk: checkin / absent / undo_checkin** | `{ action: cancel \| move \| checkin \| absent \| undo_checkin \| correct_name \| correct_score \| confirm_sibling, … }` |
| POST `…/registrations/[regId]/admit-link` | `test.admit_link` | → `{ admitUrl }` |
| POST `…/events/[eventId]/scores?preview=1` | `test.scores` (256 KB) | `{ rows ≤ 250 }` → per-row status |
| POST `…/events/[eventId]/absent-rest` | `test.checkin` | `{ slotId }` → `{ marked }` |
| POST `…/events/[eventId]/publish` | admin | `{ batch ≤ 200, expectedSlabsVersion }` → `{ processed, remaining, tasks, unassigned }` |
| GET `…/events/[eventId]/report?centre` | `test.report` | `TestReport` |
| GET `…/events/[eventId]/export` | `test.export` (export limiter) | CSV, no phones |
| POST `/api/scholarship-test/registrations` | **public** | B5.2 |
| POST `/api/scholarship-test/admit` | **public** | `{ token }` → `AdmitCardData` / 404 |
| GET/POST `/api/crm/bookings?from&to&centre&host` | scoped / `bookings.create` | `BookingPage` / `BookingInput` |
| PATCH `/api/crm/bookings/[bookingId]` | per action; **desk: checkin / no_show** | `{ action, …, expectedVersion }` |
| GET `/api/crm/bookings/[bookingId]/ics` | `bookings.view` | `text/calendar` |
| POST `/api/crm/desk/families` | **desk**, manager, admin | `{ phone }` → `DeskFamilyCard \| null` |
| POST `/api/crm/desk/arrivals`, `/api/crm/desk/walk-ins`, `/api/crm/desk/test-search` | **desk**, manager, admin | B5.4 |
| GET `/api/crm/desk/today` | **desk**, manager, admin | `{ bookings, testSlots }` |
| GET/POST `/api/crm/desk/accounts`; PATCH `…/[userId]` | read manager/admin; write SA | B5.4 |
| GET `/api/crm/facts?centre` | `facts.read` (**desk**) | `FactSheet` |
| POST/PATCH `/api/crm/facts/batches[/id]`, `/api/crm/facts/entries[/id]` | `facts.edit` | typed input + `expectedVersion` |
| POST `/api/crm/facts/{batches\|entries}/[id]/verify` / `archive` | `facts.verify` / `facts.verify_money` / editor | — |
| GET/POST `/api/crm/campaigns`; GET/PATCH `…/[campaignId]` | view manager / edit admin | `CampaignInput` |
| POST `…/[campaignId]/links`; PATCH `/api/crm/campaigns/links/[code]` | admin | `LinkInput` |
| GET `/api/crm/campaigns/links/[code]/qr?format=svg\|png` | `campaigns.view` | image |
| GET `/go/[code]` | public | 302 |
| GET/POST/PATCH `/api/crm/leads/[leadId]/students[/id]` | `students.edit` | `StudentInput` (removal = PATCH status `removed`) |
| POST `/api/crm/leads/[leadId]/merge` | `merge` | `{ fromLeadId, confirm: true }` |
| GET/POST/PATCH `/api/admin/privacy/requests[/id]` | admin | B5.11 |
| POST `/api/admin/privacy/retention/dry-run`; POST `…/retention/run` | admin / SA | `{ batch ≤ 200, runId, confirm }` |
| GET `/api/admin/privacy/log` | admin | last 100 rows |
| POST `/api/crm/admission/whatsapp-sent` (only if 1b has no equivalent) | `bookings.view` or `test.view` on the lead | `{ leadId, template, lang }` |
| Changed: `/api/crm/me` | `allowDesk`; returns `frontDesk` | — |

## B8. Copy, messages and Hindi

- **Namespaces** (registered by CORE in `src/i18n/messages/{types,index}.ts`): `admission` (staff; `en/admission.ts`, `hi/admission.ts` with common keys — status chips, centre and slot labels, empty states, errors, confirm dialogs, "Not set", "Verified", "Not verified", the WhatsApp "Did you send it?" strings — importing nested files each owned by one package: `admission-test.ts`, `admission-visits.ts`, `admission-desk.ts`, `admission-facts.ts`, `admission-campaigns.ts`, `admission-family.ts`) and `admissionPublic` (`admission-public.ts`, P2-PUBLIC).
- **Other files:** `crm.ts` (CORE: `nav.{visits,scholarshipTest,facts,desk,campaigns}`, `sources.{scholarship_test,paper_form}`, `lead.timeline.types.{booking,test,desk}`, `lead.timeline.admission.*`, `lead.backTo.{visits,test}`); `portal.ts` (CORE: nav `permissions`, `privacy`, `crmNav` names); `crm-import.ts` (GROWTH: paper-form keys). `/admin/permissions` and `/admin/privacy` are English only (decision 5), with copy in `copy.ts` beside their components.
- **Glossary:** Scholarship test स्कॉलरशिप टेस्ट · Admit card एडमिट कार्ड · Roll number रोल नंबर · Present / Absent उपस्थित / अनुपस्थित · Visit विज़िट · Demo class डेमो क्लास · Walk-in desk वॉक-इन डेस्क · Fact sheet फ़ैक्ट शीट · Verified जाँची हुई · Not verified: check before telling a family अभी जाँची नहीं गई — परिवार को बताने से पहले पक्का कर लें · Not set अभी भरी नहीं गई · Slab स्लैब · Offer call ऑफ़र कॉल · Campaign link कैंपेन लिंक · Reporting time पहुँचने का समय. The UI says "Admit card".
- **Sample keys:** `admissionPublic.register.title` "Scholarship test registration" / "स्कॉलरशिप टेस्ट रजिस्ट्रेशन"; `admissionPublic.register.forParent` "To be filled in by the student's parent or guardian." / "यह फ़ॉर्म विद्यार्थी के माता-पिता या अभिभावक भरें।"; `…register.notOpen` "Registration is not open yet. Leave your number and our counsellor will tell you when it opens." / "रजिस्ट्रेशन अभी शुरू नहीं हुआ है। अपना नंबर छोड़ दीजिए — रजिस्ट्रेशन शुरू होते ही हमारे काउंसलर आपको बताएँगे।"; `…register.slotFull` "This time is now full. Please choose another." / "यह समय भर गया है। कृपया दूसरा चुनें।"; `…register.success` "You're registered. Roll number {roll}. Save or print your admit card now." / "रजिस्ट्रेशन हो गया। रोल नंबर {roll}। अपना एडमिट कार्ड अभी सेव या प्रिंट कर लीजिए।"; `…register.received` "Thank you. This student may already be registered. Your counsellor will confirm and send the admit card." / "धन्यवाद। हो सकता है इस विद्यार्थी का रजिस्ट्रेशन पहले से हो। आपके काउंसलर पुष्टि करके एडमिट कार्ड भेज देंगे।"; `…admit.invalid` "This admit card link is not valid. Please contact your centre." / "यह एडमिट कार्ड लिंक मान्य नहीं है। कृपया अपने सेंटर से संपर्क करें।"; `admission.visits.book` "Book a visit" / "विज़िट बुक करें"; `admission.visits.arrived` / `noShow` "Arrived / Didn't come" / "आ गए / नहीं आए"; `admission.desk.find` "Find a family by mobile number" / "मोबाइल नंबर से परिवार खोजें"; `admission.desk.tellCounsellor` "They're here: tell the counsellor" / "परिवार आ गया है — काउंसलर को बताएँ"; `admission.whatsapp.didSend` "Did you send it?" / "क्या आपने मैसेज भेज दिया?"; `admission.test.publishConfirm` "Adds the result to {count} families' records and creates {count} offer calls." / "{count} परिवारों के रिकॉर्ड में रिज़ल्ट जुड़ेगा और {count} ऑफ़र कॉल बनेंगी।"
- **Rules:** Hindi files typed `Messages<…>`; no mock district names or sample phone numbers in `src/components`, `src/app`, `src/i18n` (mockup-strings guard; placeholders say "Your town" / "10-digit mobile number"); each package lists its Hindi lines in its report; integrate adds them to `docs/hindi-review-register.md` as machine drafts.

## B9. Accessibility (WCAG 2.2 AA) and tablet rules

- Targets ≥ 24 × 24 px (2.5.8); check-in and desk buttons ≥ 44 px high with ≥ 8 px gaps; visible focus never hidden by sticky bars (2.4.11; existing `scroll-padding-top`).
- No dragging (2.5.7): calendars are agenda lists; rescheduling is a form.
- Forms: labels on every field; required marked in text; a focused error summary linked to fields; `aria-describedby` hints; `autocomplete` (`name`, `tel-national`); `inputmode="numeric"` for phone and scores.
- Status: `role="status"` announcements (check-in counter, saves, progress bars with `aria-valuenow`); chips carry text; the amber "Not verified" chip has an icon and text at ≥ 4.5:1.
- Tables: `<caption>`, `scope`; cards with the same headings on phones; charts with a table alternative (single hue, labelled axes).
- Undo on "Present" is a real button, focus stays on the row, announced.
- Print views: real text; QR images with `alt` = URL. The "Did you send it?" prompt is a dialog that traps and returns focus.
- Language: Hindi strings on English pages carry `lang="hi"`; English fallbacks on Hindi pages carry `lang="en"`.
- Layout: 16 px gutter; no horizontal scroll at 320 px; desk checked at 768 × 1024 and 1024 × 768; every action keyboard-reachable.

## B10. Audit labels (English; registered in Phase 1b's label registry)

| Code | Label |
|---|---|
| `adm.test_event_create` / `adm.test_event_update` | Created / updated a scholarship test |
| `adm.test_slot_upsert` | Changed a test centre or time |
| `adm.test_slabs_set` / `adm.test_targets_set` | Set scholarship slabs / registration targets |
| `adm.test_register` / `adm.test_register_cancel` / `adm.test_register_move` | Registered a student for the test / cancelled / moved slot |
| `adm.test_checkin` / `adm.test_absent` | Checked a candidate in / marked absent |
| `adm.test_score` / `adm.test_score_correct` | Entered test scores / corrected a published score |
| `adm.test_results_publish` | Published test results |
| `adm.test_export` / `adm.admit_link` | Exported the registration list / made an admit card link |
| `adm.booking_create` / `adm.booking_update` / `adm.booking_checkin` | Booked a visit or demo / changed a booking / checked a visitor in |
| `adm.fact_save` / `adm.fact_verify` / `adm.fact_archive` | Saved / verified / archived a fact |
| `adm.desk_account_create` / `adm.desk_account_update` | Created / changed a front-desk login |
| `adm.desk_lookup` / `adm.desk_walkin` / `adm.desk_arrival` | Front desk: looked up a family / added a walk-in / told the counsellor a family arrived |
| `adm.student_add` / `adm.student_update` / `adm.student_remove` | Added / changed / removed a student in a family |
| `adm.whatsapp_sent` | Logged a WhatsApp message staff sent |
| `crm.lead_merge` | Merged two enquiries into one family |
| `leadgen.campaign_create` / `leadgen.campaign_update` / `leadgen.link_create` / `leadgen.link_update` / `leadgen.qr_download` | Campaigns and links |
| `adm.privacy_request_create` / `adm.privacy_request_close` | Recorded / closed a privacy request |
| `settings.retention_dry_run` / `settings.retention_run` | Ran a clean-up dry run / ran the clean-up |

`adm.desk_lookup` entries are grouped on screen like `crm.lead_view`.

## B11. Honesty rules (tested)

1. No seeded facts, slabs, targets, dates, fees or GBP links; "Not set" until entered.
2. Unverified facts never fill templates and always carry the warning, including in print. `demo` facts are never written in R3.
3. The public page shows only staff-entered event fields plus neutral process copy: no seat counts, no "limited seats", no % unless slabs are set **and** shown publicly, no claims about the test's history or reach.
4. Admit cards print the venue as typed on the slot, never placeholder centre content.
5. Reports show computed counts only; empty sections say "No data yet"; "against target" only when a target exists.
6. "Opens" are labelled "not people"; campaign enquiries say "new families only".
7. Messages are never described as "sent" by the system: the button says "Open in WhatsApp", and the log reads "WhatsApp message (you sent)" only after staff confirm.
8. QR print views carry "TEST, do not print" until the production domain is set.
9. Staff-entered Phase 2 records are real and carry no DEMO badge; the site's demo banner remains.

## B12. MCP

No MCP changes in Phase 2. Services take a viewer and return `CrmResult`, so Asha's plan can later add an `admission` MCP service (`list_test_events`, `get_fact_sheet`, `list_bookings`, `register_for_test`, `book_visit`) without refactoring.

## B13. Server and performance limits

- Long jobs (score upload, publish, retention, paper import) are client-driven chunks of ≤ 200–250 rows, one transaction each, resumable. No request runs a long loop on the single CPU.
- Click counters in memory, flushed at most once a minute. Read paths never open a write transaction (the public page and admit card are reads).
- No new dependencies; one click row per link per day; QR images generated on request, never stored.
- Body limits: 8 KB default; 256 KB only for score chunks (under nginx's 1 MB default; no nginx change).

---

# Part C. Delivery

## C1. Packages and order

```
P2-CORE (alone)
  → chain 1: P2-TEST → P2-PUBLIC → P2-GROWTH
  → chain 2: P2-VISITS-DESK → P2-FACTS-PRIVACY → P2-FAMILY (also after P2-TEST)
  → integrate and deploy stage (alone) → R3
```

Two chains after CORE keep at most 2 agents running on the owner's PC. Packages are file-disjoint and talk only through CORE contracts and seams. GROWTH and FAMILY can be dropped without affecting the others (C11).

## C2. Rules for every package

1. Run only your listed vitest paths with `--maxWorkers=1`; eslint on touched files; **one** `npx tsc --noEmit` at the end (wait if another agent runs tsc). No `next build`, no dev server, no browser (only integrate uses one headless Chrome).
2. No npm dependencies. No commits.
3. Before writing a page or route handler, read the matching page in `node_modules/next/dist/docs/` (AGENTS.md). Pages follow `CrmGate` / `PortalGate`; anything reading the session, database or request sits under `<Suspense>` (`await connection()` when nothing else reads the request); route handlers only, no Server Actions.
4. Never edit: files owned by another package; `src/lib/crm/index.ts`; `src/components/crm/api.ts`; `src/lib/lead-gate/**`; `src/components/lead-gate/**`; `src/lib/ask/**`; `src/components/home/**`; `src/components/ui/*carousel*`; `src/app/sitemap.ts`; `next.config.ts`; `src/proxy.ts`; `package.json`; `deploy/**`; `src/lib/mocktest/**`, `src/lib/qb/**` (read-only imports allowed); the enquiry contract; `src/components/forms/**` (read-only imports allowed); `src/lib/server/enquiry-consent.ts`.
5. Frozen after CORE: `src/lib/crm/admission/types.ts`, the seam signatures (B4.9), `permissions.ts`, `system.ts`, the schema file. A package that needs a change reports it and does not make it.
6. Change leads, stages and tasks only through services (`captureLead`, `createManualLead`, `advanceStage`, `createFollowUpTask`, `completeTask`, `logContact`), never raw SQL. All Phase 2 SQL lives in `src/lib/crm/admission/repo/*.ts` (D-037).
7. Audit every write without personal data (B4.7); logs use fixed codes only (`crmLog` style). Nothing personal in URLs (B2.1).
8. Messages: only your own nested message pair (en + hi); list Hindi lines in your report.
9. Every new `/admin` widget renders without data in preview mode.

## C3. P2-CORE (alone, first)

**NEW:** `src/lib/db/features/crm-admission.ts`; `src/lib/crm/admission/{types,permissions,system,audit,http,erase,time,templates}.ts`; `src/lib/crm/admission/repo/{desk,students,erase}.ts`; seam stubs (B4.9) `src/lib/crm/admission/test/{register,admit,desk,public}.ts`, `src/lib/crm/admission/facts/slots.ts`, `src/lib/crm/admission/campaigns/bio.ts`; `src/components/admission/{LeadAdmissionPanel.tsx,timeline.ts,shared-api.ts}`; `src/components/admission/whatsapp/**` (send button + "Did you send it?" confirm; wraps 1b's helper if it exists); stubs `src/components/admission/{test/LeadTestPanel.tsx,visits/LeadVisitsPanel.tsx,family/LeadFamilyPanel.tsx,family/LeadMergeBanner.tsx,public/AdmitCard.tsx,growth/FirstResponseByCentre.tsx}`; `src/app/api/crm/admission/whatsapp-sent/route.ts` (only if 1b has no log endpoint carrying `meta.template`); messages `src/i18n/messages/{en,hi}/{admission,admission-test,admission-visits,admission-desk,admission-facts,admission-campaigns,admission-family,admission-public}.ts` (skeletons; nested ones may be near-empty).

**EDIT** (re-read each immediately before a minimal edit):

| File | Change |
|---|---|
| `src/lib/db/features/index.ts` | Append `crm_admission` |
| `src/lib/crm/types.ts` | `ACTIVITY_TYPES` += booking, test, desk; `CrmViewer.frontDesk?`; `channel` += `"system"`; `ADMISSION_LEAD_SOURCES` in the known sources for labels |
| `src/lib/crm/lead-ops-types.ts` | `ContactLogVia` += `"system"`; default speed-rule `sources` += `scholarship_test` |
| `src/lib/crm/sla/**` | Only if the built SLA resolves on anything but `via === "ui"` |
| `src/lib/crm/access.ts` | Desk branch in `resolveCrmViewer` |
| `src/lib/crm/http.ts` | `allowDesk` (403 `desk_not_allowed`) |
| `src/lib/crm/page.ts` | Desk page allow-list and redirect |
| `src/lib/crm/capture.ts` | Desk rules in `createManualLead` (B4.4) |
| `src/lib/crm/admin.ts` | `KEEP_META_KEYS`; `eraseAdmissionData`; cascade erase of merged stubs (or registration in 1b's erase hook) |
| `src/lib/crm/repo/leads.ts` | `leadScopeSql`; `findLeadByPhone` follows merges; `findLeadByPhoneRaw` |
| `src/lib/crm/routing/index.ts` | `setUserAreas` refuses desk users (422 `desk_account`) |
| Staff-membership write service (LR `PUT /api/crm/staff/[userId]` path; 1b People if it writes membership) | Refuse desk users |
| `src/app/api/crm/me/route.ts` | `allowDesk`; returns `frontDesk` |
| `src/app/[lang]/(portal)/crm/home/route.ts` (if 1b built it) | desk → `/crm/desk` |
| `src/components/crm/LeadDetailView.tsx` | `admission` and `admissionBanner` slot props; booking/test/desk timeline cases and icons |
| `src/app/[lang]/(portal)/crm/leads/[id]/page.tsx` | Pass `<LeadAdmissionPanel>` and `<LeadMergeBanner>` |
| `src/components/crm/format.ts` | `BackKind` += `visits`, `test`; `parseBackParam` accepts `/crm/visits` (`?centre&date&view`) and `/crm/scholarship-test/<id>` (`?tab` kept) |
| `src/components/crm/CrmGate.tsx` | Skip `SlaAlertStrip` for desk |
| `src/components/crm/CrmBlocks.tsx` | Hide `AwayToggle` for desk |
| `src/components/crm/settings/SettingsHub.tsx` | "Front desk logins" card |
| `src/app/[lang]/(portal)/crm/dashboard/page.tsx` | Mount `<FirstResponseByCentre>` |
| `src/components/portal/areas.ts` | Nav `visits`, `scholarshipTest`, `facts`, `desk` (managers + desk), `campaigns` (managersOnly; also admin "Lead generation"); admin `permissions` (access group) and `privacy` (settings group); `visibleStaffNavKeys(level: "desk" \| "counsellor" \| "manager")` |
| `src/components/portal/PortalShell.tsx` | Desk nav and top-bar variants |
| `src/i18n/messages/{types,index}.ts` | Register `admission`, `admissionPublic` |
| `src/i18n/messages/{en,hi}/{crm,portal}.ts` | Keys in B8 |
| `src/i18n/paths.ts` | `go` in `NON_LOCALIZED_PREFIX` |
| Phase 1b files (only what exists; B0.4 mapping) | Slot registry superset; 5 drafts with `context`; `channels.ts` (B4.10); audit label registry (B10); People list desk badge |

**Tests.** NEW: `src/lib/db/admission-schema.test.ts` (tables exist; idempotent double apply; every CHECK; open-vocabulary columns accept a new value; partial unique indexes: once per event/lead/name_key, roll seq, roll no when not null, admit hash, fact slot, one `source='lead'` student); `src/lib/crm/admission/core.test.ts` (`admissionCan` matrix incl. `facts.verify_money`; `viewerCentres` legacy and area managers; `advanceStage` forward-only, never moves `enrolled`, reopens lost; `systemViewerFor` import guard; transaction rollback on inner failure; `eraseAdmissionData` on every table incl. roll_no / percent / rank nulled and roll_seq kept; erase cascade to a merged stub; `via: "system"` never resolves a clock with the real LR-SLA module); `src/lib/crm/admission/merge-follow.test.ts` (a merge row inserted by hand: `captureLead`, `createManualLead`, the lead gate and a CSV import row with B's number all land on A and B stays lost; ≤ 5 hops; cycle-safe); `src/app/api/crm/desk-deny.test.ts` (route sweep); `src/app/api/crm/desk-urls.test.ts` (no 10-digit run in desk links/fetch URLs — static scan of `src/components/admission/desk/**` and `src/app/[lang]/(portal)/crm/desk/**` plus a render check once those exist; integrate re-runs); `src/components/admission/timeline.test.ts`; WhatsApp confirm helper test (open without confirm logs nothing). UPDATE: `src/lib/crm/crm-services.test.ts` (desk walk-in not self-assigned, `canOpen` false, centre forced, report mode forced; other roles unchanged); `src/lib/crm/crm-console.test.ts` (desk branch; `crm_staff` wins; `setUserAreas` and staff write refuse desk users); `src/components/crm/crm-ui.test.ts` (nav per level, back parsing); `src/components/portal/portal-ui.test.ts`; the i18n paths test (`go` passes through); `src/lib/db/db.test.ts` and `src/test/mockup-strings.test.ts` must pass unchanged.

**Run:** `npx vitest run src/lib/db src/lib/crm src/app/api/crm src/components/crm src/components/portal src/components/admission src/i18n --maxWorkers=1`, eslint on touched files, one tsc.

**Acceptance:** all existing suites pass; a desk session gets 403 on every non-allow-listed CRM API and is redirected to `/crm/desk` from every other CRM page; a desk user is never picked by assignment (through `onLeadArrival`); erasing a lead clears Phase 2 personal fields and erases merged stubs; phone lookups follow merges at all four call sites; the lead page renders with empty stubs; nav tests pass for desk, counsellor, manager and admin; the report lists the B0.4 mapping and every stub's original content (for C11).

## C4. P2-TEST (after CORE)

**Owns:** `src/lib/crm/admission/test/**` (replaces the 4 stubs; adds `events.ts`, `slots.ts`, `slabs.ts`, `roll.ts`, `scores.ts`, `results.ts`, `report.ts`, `score-csv.ts` and tests); `src/lib/crm/admission/repo/tests.ts`; `src/app/api/crm/scholarship-test/**`; `src/app/[lang]/(portal)/crm/scholarship-test/**`; `src/components/admission/test/**`; `src/i18n/messages/{en,hi}/admission-test.ts`.

**Must test:** status rules and public visibility; roll numbers sequential and gap-free under 50 interleaved registrations, format `CODE-0001`; capacity (full → conflict; `overCapacity` only managers/admins; cancel frees a seat); duplicate by `(event, lead, name_key)` → existing row, `alreadyRegistered`, **no new token, old token still valid**; a different name on the same lead → a second registration; public path never creates `crm_lead_students`, staff path does; Confirm as sibling; check-in → `test_taken` via system with the SLA clock still open (real LR-SLA); absent leaves the stage; undo; desk check-in only own centre, today, 403 elsewhere; score CSV (header mapping, sections, row errors, chunk idempotency, above-max rejected, unknown + score → present); slabs (validation, version conflict, SA-only; publish blocked until `slabs_version ≥ 1`); publish (competition ranks with ties, slab boundaries, offer task +48 h for the assignee without skip-if-open, unassigned counted, resumable batches without double activities, `results_published`); correct a score (admin only, `result_corrected`); every B6.1 formula on a fixture incl. erased rows counted in attendance only and per-campaign by `campaign_code`; target shown only when set; export without phones, export limiter; scope (counsellor own leads; manager own centres); registration search is POST; audit details pass the sanitiser.

**Run:** `npx vitest run src/lib/crm/admission/test src/app/api/crm/scholarship-test src/components/admission/test --maxWorkers=1`.

## C5. P2-VISITS-DESK (after CORE)

**Owns:** `src/lib/crm/admission/visits/**`, `src/lib/crm/admission/desk/**`, `src/lib/crm/admission/repo/bookings.ts`; `src/app/api/crm/bookings/**`, `src/app/api/crm/desk/**`; `src/app/[lang]/(portal)/crm/visits/**`, `src/app/[lang]/(portal)/crm/desk/page.tsx`, `src/app/[lang]/(portal)/crm/settings/desk/page.tsx`; `src/components/admission/visits/**`, `src/components/admission/desk/**`; `src/i18n/messages/{en,hi}/admission-{visits,desk}.ts`.

**Must test:** booking validation (demo 3–7; visit days 1; past within 7 days → attended; centre within `viewerCentres`; host scope); effects table (book = `ui` resolves the clock; attended = system; tasks created and completed; no-show due `addWorkingMinutes(now, 120)`; reschedule; version conflict; tasks never assigned to a desk user); no second follow-up when one exists; ICS valid VCALENDAR in IST without names; scope per role; day/week ranges across IST midnight; WhatsApp buttons log only after "Sent". Desk: lookup is POST, exact 10 digits (partial → 400), limiter 60 / 10 min, card keys snapshot (no forbidden fields), no 10-digit run in any desk URL; arrival writes a `desk` activity and a task to the assignee, creates no lead, no consent, no reopen, no stage change; withdrawn family blocked; unassigned family → unassigned task + message; walk-in new → LR assignment (not the desk user), duplicate → card; today list limited to the desk centre; check-in refuses other centres and days. Desk accounts: SA only, one transaction, no `crm_staff` row, temporary password once, `already_crm_member`, disabled account → viewer `null`, managers get no login ids.

**Run:** `npx vitest run src/lib/crm/admission/visits src/lib/crm/admission/desk src/app/api/crm/bookings src/app/api/crm/desk src/components/admission/visits src/components/admission/desk --maxWorkers=1`.

## C6. P2-PUBLIC (after P2-TEST)

**Owns:** `src/app/[lang]/(site)/scholarship-test/page.tsx`, `src/app/[lang]/(site)/scholarship-test/admit/page.tsx`, `src/app/[lang]/(site)/links/page.tsx`; `src/app/api/scholarship-test/registrations/route.ts`, `src/app/api/scholarship-test/admit/route.ts`; `src/lib/crm/admission/public/**`; `src/components/admission/public/**` (`RegistrationForm`, `SlotPicker`, `SuccessPanel`, `ReceivedPanel`, `NotOpenPanel`, `AdmitCardLoader`, `AdmitCard` replacing the stub, `BioLinks`); `src/i18n/messages/{en,hi}/admission-public.ts`.

**Must test:** handler order (origin → size → zod → honeypot → limiters → transaction); capture + registration atomic (a full slot rolls back the lead); stored consent equals `CONSENT_TEXTS[v2][locale]`; `submittedBy = parent`, `submissionMeta.testEventId`, source `scholarship_test`, context utm stored and `campaign_code` set; no student/parent selector in the form; a lost family reopens per capture rules; class outside the event → 422; closed → 409; duplicate → `status: "received"`, `admitUrl: null`, old token still valid, resend task created once, no `crm_lead_students` row; same response keys both ways; limiters (20 per 10 min per IP, 3 per hour per phone). Admit: token only in the fragment; API valid / expired / cancelled / erased; noindex and no-referrer metadata; no phone, score or slab in the markup. Public page: static shell prerenders (no request reads outside Suspense); full slots disabled with no counts; no % unless set and shown; Hindi falls back per field with `lang`. `/links`: only bio links, all `/go/`, empty state. Form a11y: labels and error-summary render test. Verify against the real `registerForTest` (TEST has landed).

**Run:** `npx vitest run src/lib/crm/admission/public src/app/api/scholarship-test src/components/admission/public --maxWorkers=1`.

## C7. P2-FACTS-PRIVACY (after P2-VISITS-DESK)

**Owns:** `src/lib/crm/admission/facts/**` (replaces the `slots.ts` stub), `src/lib/crm/admission/repo/facts.ts`, `src/app/api/crm/facts/**`, `src/app/[lang]/(portal)/crm/facts/page.tsx`, `src/components/admission/facts/**`, `src/i18n/messages/{en,hi}/admission-facts.ts`; `src/app/[lang]/(portal)/admin/permissions/page.tsx`, `src/components/admission/permissions/**`; `src/lib/crm/admission/privacy/**`, `src/lib/crm/admission/repo/privacy.ts`, `src/app/api/admin/privacy/**`, `src/app/[lang]/(portal)/admin/privacy/page.tsx`, `src/components/admission/privacy/**`.

**Must test:** fact validation (URLs, map hosts, dates, money, instalments ≤ 8, open topics validated by zod); edit resets verification; verify: admin for non-money, **SA for batches and fees/scholarship entries** (admin → 403); managers edit only own centres; desk reads own centre only; slot uniqueness per centre/programme; `factSlotValues` (verified only; centre before all-centres; Hindi fallback; `test_date` from the next open event; `batch_start` only on a single program match; `demo` rows never used); print shows "(not verified)". Permissions page rows match `admissionCan` / `crmPermissions` for each role fixture. Privacy: create and close; digit runs stripped from notes; erase closes open erase requests. Retention: last-real-contact rule (a system `task_created` or assignment does not keep a lead; a person-created open task does); unconverted and tool-only selection; run needs dry run within 24 h, SA and typed confirmation; batches of 200, resumable; each erase through `eraseLead` (audited). Exports log reads only the listed actions. Preview mode renders without data.

**Run:** `npx vitest run src/lib/crm/admission/facts src/lib/crm/admission/privacy src/app/api/crm/facts src/app/api/admin/privacy src/components/admission/facts src/components/admission/permissions src/components/admission/privacy --maxWorkers=1`.

## C8. P2-GROWTH (after P2-PUBLIC)

**Owns:** `src/lib/crm/admission/campaigns/**` (incl. the `bio.ts` stub, `clicks.ts`, `qr/**`), `src/lib/crm/admission/repo/campaigns.ts`, `src/app/go/[code]/route.ts`, `src/app/api/crm/campaigns/**`, `src/app/[lang]/(portal)/crm/campaigns/**`, `src/components/admission/campaigns/**`, `src/i18n/messages/{en,hi}/admission-campaigns.ts`; paper import (this phase only): `src/lib/crm/intake/{rows,import,fields}.ts` and their tests, `src/components/crm/import/**`, `src/app/api/crm/import/**` (only if a schema field is added), `src/i18n/messages/{en,hi}/crm-import.ts`; `src/lib/crm/admission/reports/first-response.ts`, `src/lib/crm/admission/repo/first-response.ts`, `src/components/admission/growth/FirstResponseByCentre.tsx`.

**Must test:** QR (RS EC codewords for the 1-M vector: data `32 91 11 120 209 114 220 77 67 64 236 17 236 17 236 17` → EC `196 35 39 119 235 215 231 226 93 23`; all 32 format-information strings; finder, timing and alignment positions v1–v5; byte-mode bitstream with terminator and `0xEC 0x11` padding; a test-only decoder round-trip for 200 random URLs over every version and level with zero RS syndromes; `qr_too_long`; PNG signature, IHDR, IDAT inflate, CRC; SVG well-formed with `<title>`). `/go`: unknown or archived → `/`; utm composed and encoded; relative `Location`; prefetch and HEAD not counted; flush batching and IST day key; pending cap; no write transaction per request. Campaign codes unique; targets only from the allow-list; B6.3 formulas incl. test registrations by `campaign_code` for a known family; watermark by host. Paper import: paper basis requires a source; `consent_method` synonyms and invalid value; source `paper_form` with utm stored; **all existing LR import tests still pass**. First response: B6.4 on fixtures, import clocks separate, scope applied.

**Run:** `npx vitest run src/lib/crm/admission/campaigns src/lib/crm/admission/reports src/app/go src/app/api/crm/campaigns src/components/admission/campaigns src/components/admission/growth src/lib/crm/intake src/components/crm/import src/app/api/crm/import --maxWorkers=1`.

## C9. P2-FAMILY (after P2-FACTS-PRIVACY and P2-TEST)

**Owns:** `src/lib/crm/admission/family/**`, `src/lib/crm/admission/repo/move.ts`, `src/app/api/crm/leads/[leadId]/students/**`, `src/app/api/crm/leads/[leadId]/merge/route.ts`, `src/components/admission/family/**` (replaces `LeadFamilyPanel` and `LeadMergeBanner`; adds `MergeDialog`), `src/i18n/messages/{en,hi}/admission-family.ts`; handed over for this package only: Phase 1b's duplicate-suggestion component (Merge action). It does **not** edit `capture.ts`, `admin.ts` or `LeadDetailView.tsx` (CORE did the redirect, the erase cascade and the slots).

**Must test:** students CRUD, scope, removal = status `removed`, erase deletes them; merge: every moved table and its counts; gate passes trimmed with `trimGatePasses(…, MAX_GATE_PASSES_PER_LEAD)`; duplicate registration on A cancelled on B's side and counted; 1b details filled only where empty, alternate phone set; B's clock closed; B `lost` / `duplicate` with personal fields wiped and phone kept; merge activities on both; `next_task_due_at` recomputed; refusals (same lead, erased, already merged, not visible, counsellor); atomic (injected failure leaves both unchanged); audit details keep every count key; after a merge a capture, a manual walk-in and a gate submission with B's number land on A; erase A erases B.

**Run:** `npx vitest run src/lib/crm src/app/api/crm/leads src/components/admission/family src/components/crm --exclude "src/lib/crm/intake/**" --exclude "src/components/crm/import/**" --maxWorkers=1` (GROWTH may be editing those folders at the same time).

## C10. Integrate and deploy stage (one agent, alone, after every package)

1. **Checks:** `npx tsc --noEmit`; `npx vitest run src/lib --maxWorkers=1`; `npx vitest run --exclude "src/lib/**" --maxWorkers=1`; `npx eslint .`; the desk route sweep and the desk-URL test again (now with every route).
2. **Wiring:** replace any remaining stubs (or keep them for a dropped package); remove shipped items from `console-roadmap.ts` and `portal.admin.coming` (`factSheet`, `visits`, `scholarshipTest`, `importPaper`, `campaignLinks`, `frontDesk`, `rolesTable`, `privacy`; drop `p2` only if all shipped); add `/scholarship-test`, `/scholarship-test/admit`, `/links` and `/go` to the prerender bail-out test pattern; optional Phase 1b "Needs attention" lines (offer calls overdue, today's visits not checked in, open privacy requests) if a registry exists; check the sidebar at 768 px and, if the admission group scrolls, move Campaign links under "Lead generation" for admins and group Visits / Scholarship test / Walk-in desk / Fact sheet under an "Admission season" sub-heading.
3. **Docs:** `docs/crm.md` (front desk, bookings, tests, facts, campaigns, merge); `docs/api.md` (B7); `docs/integration-status.md` (incl. "Asha must reuse crm_lead_students, crm_fact_*, crm_bookings"); a dated three-line pointer at the top of the data-model section of `docs/admissions-agent-plan.md` saying the same (no rewrite); `docs/aspire-approval-checklist.md` (P2-Q1–P2-Q22 as P2-1–P2-22, plus "approve the 5 WhatsApp drafts", "counsel: may a student self-register for BOH? (DPDP, FP-11, TG-*)", "scan one printed QR before mass printing", "QR printing only after the domain is final"); `docs/hindi-review-register.md`; `docs/agent-decisions.md` D-070–D-077 (re-grep; renumber only if taken).
4. **Browser pass** (one headless Chrome, sequential): `/scholarship-test` in English and Hindi at 375 px and 1024 px (not-open state, then open state with a registration); admit card on screen and in print preview; `/crm/desk` at 768 × 1024 and 1024 × 768; `/crm/visits` week view; `/crm/facts`; QR print view (watermark visible); keyboard-only registration and check-in; no horizontal scroll at 320 px.
5. **Smoke integration test** (route handlers on a temporary `AUTH_DB_PATH`): SA creates a desk login → desk 403 on `/api/crm/leads`, 200 on `/api/crm/desk/today`; admin creates an event and slots and opens it → a public registration gives `CODE-0001` and a working admit card via the API; the lead has source `scholarship_test` and an open clock; a repeat public registration → `received`, old link still works; the desk checks in → `test_taken`, clock still open; a manager uploads scores by CSV; SA sets slabs; admin publishes in 2 batches → offer tasks +48 h and timeline results; a counsellor books a visit (clock resolves); the desk marks it arrived → `visited_or_demo`; a paper import with a seminar source → `paper_form` leads with utm `offline`; a campaign link → 302 with utm, clicks counted after a flush; merge two leads → a re-submission, a gate submission and a CSV row with the merged number land on the survivor; erase the survivor → registrations and bookings anonymised, the stub erased.
6. **Deploy R3** (the owner's AFK authorisation covers it; follow `deploy/README.md` with these R3 specifics):
   1. **Gate:** CI cannot run without a push, so the gate is steps 1–5 plus the server build. Commit locally on `feature/admin-phase-2` (from the R2 commit; message ends with the attribution line in force). Push only if the permission system allows it; otherwise list the exact commands for the owner.
   2. **Disk:** `df -h /` must show ≥ 3 GB free (the same threshold as `disk-check.sh`). Run `docker builder prune -f`. Still under 3 GB → delete the oldest rollback `aspire-web` image, keeping the live image as the new rollback (authorised; report it). Never touch other sites' images.
   3. **DB snapshot** (live data includes minors): `VACUUM INTO` through `node:sqlite` inside the running container, `PRAGMA integrity_check`, then move it to `/opt/aspire-web/backups/pre-<sha>.sqlite` (mode 600). `deploy/backup.sh` is not installed on the server; do not install it (backups deferred by the owner).
   4. **Upload:** `git -c core.autocrlf=false archive --format=tar.gz` of the commit → `ssh -i ~/.ssh/aspire_deploy root@69.62.76.109 'cat > /opt/aspire-web/release-<sha>.tar.gz'` → compare `sha256sum` → untar into `release/`.
   5. **Build** with the low-disk watchdog (`RELEASE=<sha>-demo`; background build; kill under 300 MB free; revert `RELEASE` on failure), then `docker builder prune -f`. Confirm `.next/prerender-manifest.json` in the image still lists home, about and tools in both languages. Confirm `NEXT_PUBLIC_SITE_URL` is set in `.env` without printing the file. No new environment variables; no nginx change.
   6. **Start:** `docker compose up -d`; `docker compose ps` healthy; open the database (`GET /api/ask`), then read-only check that `crm_test_events` and `crm_bookings` exist and `PRAGMA user_version` is unchanged.
   7. **After deploy:** `/scholarship-test` and `/hi/scholarship-test` → 200 "not open yet"; `/scholarship-test/admit` → 200 (invalid-link state without a fragment); `/links` → "Nothing here yet."; `/go/nonexistent` → 302 to `/`; `/api/health` unchanged; `/crm/desk` signed out → sign-in; an admin opens every new page without errors; thechunkmedia.com and aspire2.thechunkmedia.com still answer 200. Keep exactly the current and one rollback image; tag `release-YYYY-MM-DD.N`.
   8. **Blocked:** if ssh, upload or push is refused by the permission system, stop, put the exact commands into the owner walkthrough, and leave the release unapplied. Never work around a refusal.
   9. **Rollback:** previous `RELEASE` + `docker compose up -d`. The Phase 2 tables are additive and ignored by the earlier image; restore the snapshot only if data went wrong.
7. **Owner walkthrough:** A3 as a short click-by-click list in the final report, with any staged commands from 6.8.

## C11. Dropping a package that fails review

The integrate stage deletes the package's new files, restores its CORE stubs (content recorded in the P2-CORE report), restores files only that package edited in this phase (`git diff` / `git checkout -- <paths>`), removes its nav items, and keeps its roadmap items in "What's coming". GROWTH and FAMILY are designed to be droppable; TEST, PUBLIC, VISITS-DESK and FACTS-PRIVACY are the release core. If GROWTH is dropped, `listBioLinks` stays a stub and `/links` (PUBLIC) shows its empty state; remove `/links` from any shared material until GROWTH ships.

## C12. Risks

| Risk | Mitigation |
|---|---|
| Phase 1b or LR code differs from the plans | B0 reads the built code; every 1b seam has a fallback |
| The front desk sees or receives leads or tasks | No `crm_staff` row; counsellor scope with nothing assigned; `setUserAreas` and staff writes refuse desk users; route sweep; page redirect; card key snapshot; tasks always to staff |
| Stage moves count as the first call | `channel` / `ContactLogVia` `"system"`; tested with the real SLA module |
| Opening WhatsApp counted as contact | Logged only after "Did you send it? → Sent" |
| Merge corrupts data or the stub reopens | One transaction; full CRM regression; `findLeadByPhone` follows merges for every caller; droppable package |
| Minors' data on the admit link | 256-bit token in the URL fragment (not logged, not in Referer), hash stored, expiry test day + 2, noindex, no-referrer, minimal fields, staff-only rotation, wiped on erase |
| Registration spam or enumeration | Same origin, honeypot, IP and phone limiters, atomic capacity; duplicates get no link. Residual: someone with the parent's number and the child's exact name learns a registration exists (no card data) — accepted |
| Long jobs block the single CPU | Client-driven chunks ≤ 250; in-memory click counters |
| Schema cannot change later | Open vocabularies validated in zod; Asha's columns created now |
| QR codes scan wrong on posters | Single-block versions; RS and format known-answer tests; decoder round-trip; watermark; owner scans one print before mass printing |
| Owner's PC runs out of RAM | Two chains; `--maxWorkers=1`; one tsc per agent; one Chrome in integrate only |
| VPS disk | No dependencies; compact tables; images never stored; 3 GB check, builder prune, oldest rollback image removed if needed |
| Retention erases too much or too little | Last-real-contact rule; manual only; dry run within 24 h; SA + typed count; `eraseLead` per lead |
| Hindi quality | Machine-draft register; staff glossary |

## C13. Decisions to record (integrate records them)

- **D-070 Scholarship test in the console.** Events with per-centre slots, staff-typed venues and capacity. Public registration at `/scholarship-test` by the parent or guardian, consent v2 unchanged, source `scholarship_test`, starts the 1-hour clock. Roll numbers `CODE-NNNN` per event, never reused. Admit card by an expiring hashed token carried in the URL fragment; public repeats get no link (staff resend). Check-in; scores by hand or CSV; SA-set slabs (no % until set); admin publishes in batches; result on the timeline with an offer-call task at +48 h. Online BOH deferred. No public results.
- **D-071 Visits & demo classes.** `crm_bookings` (visit; demo 3–7 days; status `requested` reserved for Asha). Booking moves to `counselling_booked` as a human contact; attending moves to `visited_or_demo` as a system action. Tasks for the visit, the follow-up and no-shows always go to staff. Staff `.ics` files without names. Reminders are manual WhatsApp, logged only after staff confirm sending. Canonical for Asha's visit requests.
- **D-072 Fact sheet.** Typed batches, slot facts and Q&A per centre; starts empty; managers and admins draft; admins verify; super admins verify fees, instalments and scholarship facts; any edit un-verifies; only verified facts fill message slots, Asha and R4 JSON-LD. Canonical for Asha's facts.
- **D-073 Front desk.** A staff account with a `crm_desk_staff` row and no `crm_staff` row: never assignable, never in areas. Deny-by-default APIs (`allowDesk`) and pages. Lookup by full mobile number in a POST body, minimal card. "They're here" writes an activity and a task, never a new enquiry or consent. Logins are SA-only.
- **D-074 Campaign links & QR.** Campaigns and links tables; `/go/<code>` outside locale routing with a relative 302 carrying utm tags; daily counts in memory, flushed every 60 s; in-house single-block QR encoder (SVG, PNG); print watermark until aspireiit.in; `/links` bio page; test registrations attributed by the registration's own campaign.
- **D-075 Paper enquiry import.** An extension of LR-IMPORT, still SA-only: paper-form basis with a required paper source and optional campaign; per-row consent method; source `paper_form` with utm `offline`; its own channel in the sources report.
- **D-076 Families.** Children in `crm_lead_students` (canonical for Asha; public registrations never add children, staff confirm). Merge by admins and managers: one-way, atomic; the merged lead becomes `lost: duplicate` and keeps its phone; every phone lookup follows merges; erase cascades.
- **D-077 Data & privacy.** A privacy request register (or Phase 1b's); retention per decision 20 measured from the last real contact; dry run by admins, run by SA with typed confirmation, batches via `eraseLead`, no schedule until CRM-3; exports and imports log; read-only roles table.

---

# Appendix A. How each critique point was resolved

K-numbers follow the critic's order. "N/A" points concern Phase 1b only; the 1b plan resolves them.

| ID | Point | Decision | What Phase 2 does / why | Where |
|---|---|---|---|---|
| K1 | Decision ids collide with Asha | **Accept** (header) | Phase 2 keeps D-070–D-077; the header records that Asha proposes D-059–D-068 (the Asha plan now says D-068, checked today) and 1b uses D-078–D-083. Integrate re-greps. | Header, C13 |
| K2 | Phase 2 tables duplicate Asha's | **Accept** | Phase 2 tables declared canonical; Asha columns created now (`crm_lead_students.source/centre_slug/exam_target/mode`, one `source='lead'` row; facts `programme/source_note/review_by/disclosure/consent_ref`, status `demo` reserved; bookings `created_via`, status `requested`); desk facts replace `agent_centres` desk hours; visit tasks go to the assignee, never a desk login; R4 reads verified facts only. The Asha plan cannot be edited now, so integrate adds a dated pointer. | B1, B3, D-071/72/76, C10.3 |
| K3 | Merge redirect only in `captureLead` | **Accept** (stronger) | Verified four call sites (`capture.ts:271`, `:541`, `gate.ts:87`, `intake/import-backend.ts:46`). The follow lives inside `findLeadByPhone` itself (CORE), checked only for `lost/duplicate` rows; `findLeadByPhoneRaw` for merge code; tests for every caller. | B4.6, C3 |
| K4 | WhatsApp slots and keys mismatch | **Accept** | Drafts rewritten to `parent_name`, `student_first_name`, `counsellor_name` and the voice doc's `date` / `time`; registered with `context` booking/test; per-key seeding; fallback store if 1b lacks it. | B4.8, B5.12, B0.4 |
| K5 | Dashboard numbers vs list links | N/A | 1b only. | — |
| K6 | Public re-registration hands out and rotates the admit link | **Accept** | Public duplicates get `status: "received"`, no link, no rotation, a resend task; same response keys; public path never creates siblings (name stored on the registration; staff confirm). Residual "a registration exists" signal documented and accepted (phone limiter, no card data). | B5.1 rule 2, B5.2, C12 |
| K7 | Phones and tokens in URLs | **Accept** (different fix for admit) | Desk lookup, desk test search and registration search are POST; numbers kept in component state; a test bans 10-digit runs in desk URLs. Admit token moves to the URL **fragment** (never sent to the server, so never logged or leaked by Referer) and the card loads by POST; expiry = test day + 2. Better than either suggested option. | B2.1, B5.2, B5.4 |
| K8 | CHECK enums on growing lists | **Accept** | Length CHECK + zod for exam, kind, via, channel, topic, source, created_via, privacy kind and received_via, student status, medium, program; SQL CHECK kept for state machines. | B3 rules |
| K9 | WhatsApp logged on open | **Accept** (Phase 2 buttons) | Open → "Did you send it?" → only "Sent" logs; opening alone logs nothing and resolves no clock. | B4.8, C5 tests |
| K10 | Phase 2 sources invisible to the classifier | **Accept** | CORE adds `paper_forms` and `scholarship_test` channels and extends `IMPORTED_SQL`. | B4.10, C3 |
| K11 | "I am the student" contradicts consent v2 | **Accept** | Selector dropped; parent/guardian contact fields; v2 verbatim; `submittedBy = parent`; counsel checklist item; no new consent version. | B5.2, A2 P2-Q6/7, C10.3 |
| K12 | Deploy steps reference an uninstalled backup script | **Accept** | Explicit R3 deploy block: VACUUM INTO snapshot, 3 GB check with builder prune and oldest-rollback removal, local gate instead of CI, blocked-upload stop rule. (The status-page threshold is 1b's.) | C10.6 |
| K13 | `CallReturnPrompt.tsx` ownership | N/A | 1b only. | — |
| K14 | Conflicting dashboard tiles | N/A for 1b; **Accept** for Phase 2's card | The first-call card uses LR's clock definitions and a distinct title, and repeats no LR tile. | B5.9 |
| K15 | Re-implements 1b helpers | **Accept** | `runAtomic`, `scopedLeadWhere`, 1b centre helper reused when present (B0.4); Phase 2 versions only as fallbacks; `admissionCan` derives flags from `crmPermissions`. | B0.4, B4.3, B4.6 |
| K16 | Desk landing vs `/crm/home` | **Accept** | CORE adds desk → `/crm/desk` to `crm/home/route.ts` if 1b built it; otherwise the `/crm/today` redirect. | B2.1, C3 |
| K17 | `ContactLogVia` also needs `"system"` | **Accept** | Verified at `lead-ops-types.ts:377`; CORE widens it and tests with the real SLA module. | B4.3, C3 |
| K18 | Desk users in areas; managers see login ids | **Accept** | `setUserAreas` refuses desk users (422 `desk_account`); managers see no login ids. | B2.1, B2.2, B5.4 |
| K19 | "They're here" re-runs `createManualLead` | **Accept** | Arrival writes a `desk` activity and a task through the system viewer: no new consent, reopen or stage change; withdrawn families are blocked; `createManualLead` only for new walk-ins (report mode forced). | B4.4, B5.4 |
| K20 | Merge audit keys and gate-pass trimming | **Accept** | Count keys `gateBrowsers`, `toolUses`; `trimGatePasses(db, A, MAX_GATE_PASSES_PER_LEAD)` (verified `gate.ts:33`); audit-keys test. | B5.8, C9 |
| K21 | Wave C / integrate test runs | **Accept** | FAMILY no longer edits `capture.ts`; its run uses `--exclude` for intake and import (vitest 4.1.12 supports it); integrate splits vitest into `src/lib` and the rest. Page-layout note is 1b's. | C9, C10.1 |
| K22 | Kept roll numbers and retention timestamps | **Accept** | Erase nulls `roll_no`, `scholarship_percent`, `rank` (keeps `roll_seq` so numbers are never reused, plus attendance and status); retention measured from the last real contact; system tasks never keep a lead. | B3 erase, B5.11 |
| K23 | Campaign measurement misses known families | **Accept** | `campaign_code` on registrations and bookings; test registrations counted by it; "new families only" kept for Enquiries. | B3, B6.3 |
| K24 | Scope creep and unverifiable steps | **Accept** (Phase 2 parts) | Scan check replaced by tests + watermark + owner checklist item; "bring this card" is a prefilled editable draft. 1b parts N/A. | B5.1, B5.6, C10.3 |
| K25 | Uneven edit rights | **Partly** | **Accept:** fees, instalments and scholarship facts verified by SA only. **Reject:** campaign links stay admin-editable, because links can only point to an allow-list of our own pages and carry no facts or prices; the console plan gives them to admins. Decision 12 note is 1b's. | B2.2, B5.5 |
| K26 | 1b nits; sidebar length | N/A; sidebar **Accept** | Integrate checks the sidebar at 768 px and regroups Phase 2 items if it scrolls; Phase 2's send buttons are `aria-disabled` buttons until ready. | C10.2, B5.12 |

---

# PACKAGES

```json
[
  {
    "key": "P2-CORE",
    "title": "Phase 2 core: schema, desk deny-by-default, shared contracts, seams, shared-file edits",
    "dependsOn": [],
    "owns": [
      "src/lib/db/features/crm-admission.ts",
      "src/lib/db/features/index.ts",
      "src/lib/db/admission-schema.test.ts",
      "src/lib/crm/admission/types.ts",
      "src/lib/crm/admission/permissions.ts",
      "src/lib/crm/admission/system.ts",
      "src/lib/crm/admission/audit.ts",
      "src/lib/crm/admission/http.ts",
      "src/lib/crm/admission/erase.ts",
      "src/lib/crm/admission/time.ts",
      "src/lib/crm/admission/templates.ts",
      "src/lib/crm/admission/core.test.ts",
      "src/lib/crm/admission/merge-follow.test.ts",
      "src/lib/crm/admission/repo/desk.ts",
      "src/lib/crm/admission/repo/students.ts",
      "src/lib/crm/admission/repo/erase.ts",
      "src/lib/crm/admission/test/register.ts (stub)",
      "src/lib/crm/admission/test/admit.ts (stub)",
      "src/lib/crm/admission/test/desk.ts (stub)",
      "src/lib/crm/admission/test/public.ts (stub)",
      "src/lib/crm/admission/facts/slots.ts (stub)",
      "src/lib/crm/admission/campaigns/bio.ts (stub)",
      "src/components/admission/LeadAdmissionPanel.tsx",
      "src/components/admission/timeline.ts",
      "src/components/admission/timeline.test.ts",
      "src/components/admission/shared-api.ts",
      "src/components/admission/whatsapp/**",
      "src/components/admission/test/LeadTestPanel.tsx (stub)",
      "src/components/admission/visits/LeadVisitsPanel.tsx (stub)",
      "src/components/admission/family/LeadFamilyPanel.tsx (stub)",
      "src/components/admission/family/LeadMergeBanner.tsx (stub)",
      "src/components/admission/public/AdmitCard.tsx (stub)",
      "src/components/admission/growth/FirstResponseByCentre.tsx (stub)",
      "src/app/api/crm/admission/whatsapp-sent/route.ts (only if 1b has no equivalent)",
      "src/app/api/crm/desk-deny.test.ts",
      "src/app/api/crm/desk-urls.test.ts",
      "src/app/api/crm/me/route.ts",
      "src/i18n/messages/en/admission*.ts",
      "src/i18n/messages/hi/admission*.ts",
      "src/i18n/messages/types.ts",
      "src/i18n/messages/index.ts",
      "src/i18n/messages/en/crm.ts",
      "src/i18n/messages/hi/crm.ts",
      "src/i18n/messages/en/portal.ts",
      "src/i18n/messages/hi/portal.ts",
      "src/i18n/paths.ts",
      "src/lib/crm/types.ts",
      "src/lib/crm/lead-ops-types.ts",
      "src/lib/crm/sla/** (one-line edit only if needed)",
      "src/lib/crm/access.ts",
      "src/lib/crm/http.ts",
      "src/lib/crm/page.ts",
      "src/lib/crm/capture.ts",
      "src/lib/crm/admin.ts",
      "src/lib/crm/repo/leads.ts",
      "src/lib/crm/routing/index.ts",
      "the staff-membership write service behind PUT /api/crm/staff/[userId]",
      "src/app/[lang]/(portal)/crm/home/route.ts (if it exists)",
      "src/app/[lang]/(portal)/crm/leads/[id]/page.tsx",
      "src/app/[lang]/(portal)/crm/dashboard/page.tsx",
      "src/components/crm/LeadDetailView.tsx",
      "src/components/crm/format.ts",
      "src/components/crm/CrmGate.tsx",
      "src/components/crm/CrmBlocks.tsx",
      "src/components/crm/settings/SettingsHub.tsx",
      "src/components/portal/areas.ts",
      "src/components/portal/PortalShell.tsx",
      "src/components/portal/AuditLog.tsx (only if 1b has no label registry)",
      "Phase 1b files: WhatsApp slot registry and template store seeding, src/lib/crm/console/channels.ts, audit label registry, People list desk badge (only what exists)",
      "src/lib/crm/crm-services.test.ts",
      "src/lib/crm/crm-console.test.ts",
      "src/components/crm/crm-ui.test.ts",
      "src/components/portal/portal-ui.test.ts",
      "the i18n paths test"
    ],
    "task": "Read docs/admin-phase-2-plan.md fully (Parts B and C3) and AGENTS.md first. B0: stop and report if LR integrate, QB integrate or Phase 1b integrate has not landed or `npx tsc --noEmit` is red. Re-read every file listed in B0.2 in code (not plans); run the B0.3 greps (decision ids D-070..D-077 free; none of the B3 table names exist; whether 1b built an erase-request store); write the B0.4 seam mapping (which 1b names exist: runAtomic, scopedLeadWhere, consoleCentres/consolePermissions, crm_wa_templates with a context column and TEMPLATE_SLOTS, a WhatsApp return-confirm helper and log call with meta.template, label registry, erase hook, details setter, duplicate card, People list, channels.ts, /crm/home) into your report. Then build exactly section C3: (1) the crm_admission feature schema from B3 verbatim (open vocabularies length-checked only; registered after crm_intake and any 1b schema); (2) src/lib/crm/admission/{types,permissions,system,audit,http,erase,time,templates}.ts and repo/{desk,students,erase}.ts per B2.2, B4.1-B4.8 (admissionCan incl. facts.verify_money; viewerCentres; systemViewerFor not exported from @/lib/crm; advanceStage forward-only; runAtomic reuse or runInTx; requireAdmission; ADM_AUDIT with sanitiser-safe keys; nameKey); (3) the seam stubs of B4.9 with the exact signatures and safe behaviour, and record each stub's content in your report; (4) the WhatsApp send button with the 'Did you send it?' confirm (sessionStorage + focus return; only Sent logs whatsapp/message_sent with meta.template and meta.lang) reusing 1b's helper if present, plus POST /api/crm/admission/whatsapp-sent only if 1b has no log call carrying meta.template; register the 5 drafts of B5.12 with context booking/test as awaiting approval in 1b's store (INSERT OR IGNORE per key) and widen 1b's slot registry to the B4.8 superset, or the crm_settings fallback; (5) every edit in the C3 EDIT table: activity types booking/test/desk, CrmViewer.frontDesk and channel 'system', ContactLogVia 'system' (confirm LR-SLA resolves only via 'ui'), speed-rule default sources += scholarship_test, resolveCrmViewer desk branch, requireCrm allowDesk with DESK_ALLOWED_ROUTES, requireCrmPage desk redirect, createManualLead desk rules (B4.4), KEEP_META_KEYS, eraseAdmissionData (B3 erase table: null roll_no, scholarship_percent, rank, names, scores, tokens; keep roll_seq) and the recursive erase of merged stubs inside eraseLead's transaction, leadScopeSql, findLeadByPhone following crm_lead_merges only for lost/duplicate rows (<= 5 hops, cycle-safe) plus findLeadByPhoneRaw, setUserAreas and the staff-membership write refusing desk users (422 desk_account), /api/crm/me allowDesk + frontDesk, crm/home desk landing if that route exists, LeadDetailView admission and admissionBanner slots and timeline cases, the lead page passing LeadAdmissionPanel and LeadMergeBanner, format.ts back kinds, CrmGate/CrmBlocks desk chrome, SettingsHub card, dashboard mount of FirstResponseByCentre (if the dashboard page exists), areas.ts nav items and visibleStaffNavKeys(level), PortalShell desk variants, message registration of admission and admissionPublic with all nested en/hi skeletons, crm.ts and portal.ts keys (B8), go in NON_LOCALIZED_PREFIX, 1b channels.ts (paper_forms, scholarship_test, IMPORTED_SQL), 1b audit label registry entries (B10), People desk badge. Write the tests listed in C3 (admission-schema, core, merge-follow at all four call sites incl. gate.ts and intake import, desk-deny route sweep via import.meta.glob with a mocked desk session, desk-urls 10-digit scan, timeline, WhatsApp confirm helper) and update crm-services, crm-console, crm-ui, portal-ui and the i18n paths tests. Run: npx vitest run src/lib/db src/lib/crm src/app/api/crm src/components/crm src/components/portal src/components/admission src/i18n --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. Obey C2 (no deps, no commits, no next build, never-edit list). Report: seam mapping, stub contents, every shared file touched, Hindi lines added.",
    "acceptance": [
      "All existing suites in the run command pass, plus the new CORE tests; tsc and eslint clean",
      "A desk session gets 403 (desk_not_allowed) on every CRM API route not in DESK_ALLOWED_ROUTES and is redirected to /crm/desk from every other CRM page",
      "A desk user is never picked by assignment through onLeadArrival, cannot be added to an area (422 desk_account) or given a crm_staff row",
      "via 'system' never resolves a first-call clock with the real LR-SLA module",
      "findLeadByPhone follows a merge for captureLead, createManualLead, the lead gate and the CSV import; the stub stays lost",
      "Erasing a lead clears every Phase 2 personal field per the B3 erase table and erases merged stubs",
      "The lead page renders with all stubs; nav tests pass for desk, counsellor, manager and admin",
      "The report lists the B0.4 mapping, each stub's original content and the Hindi lines"
    ]
  },
  {
    "key": "P2-TEST",
    "title": "Scholarship test: events, slots, registration, check-in, scores, slabs, publish, report (staff side)",
    "dependsOn": ["P2-CORE"],
    "owns": [
      "src/lib/crm/admission/test/**",
      "src/lib/crm/admission/repo/tests.ts",
      "src/app/api/crm/scholarship-test/**",
      "src/app/[lang]/(portal)/crm/scholarship-test/**",
      "src/components/admission/test/**",
      "src/i18n/messages/en/admission-test.ts",
      "src/i18n/messages/hi/admission-test.ts"
    ],
    "task": "Read docs/admin-phase-2-plan.md B5.1, B6.1, B7 (scholarship-test rows), B2.2, B4.8, B4.9, B9, B10, B11 and C4, plus the CORE report. Read node_modules/next/dist/docs on pages and route handlers before writing them. Replace the 4 test stubs keeping their frozen signatures: registerForTest (runs in the caller's transaction; rules B5.1.2 exactly: slot/event checks for public vs staff/desk, nameKey dedupe returning the existing row with alreadyRegistered and minting nothing, capacity with overCapacity for managers/admins audited, roll_seq max+1 and CODE-0001 format, staff sibling creation with source 'staff', public never creates crm_lead_students, campaign_code from input, test activity, no stage change), mintAdmitLink (32 random bytes base64url, SHA-256 stored, expiry end of IST day of the last slot + 2 days, returns /scholarship-test/admit#t=<token>), admitCardByToken, deskTestCheckins (today's slots at the desk centre only), openEventsForPublic. Add events.ts, slots.ts, slabs.ts, roll.ts, scores.ts, results.ts (competition ranks, slab mapping, offer task via createFollowUpTask due result_at + 48 h to the assignee without onlyIfNoOpenTask, unassigned counted, batches of <= 200 resumable, results_published), report.ts (every B6.1 metric; erased rows counted in registration/attendance only; per campaign by campaign_code), score-csv.ts (client-safe mapping over LR decodeCsvBytes/parseCsv). All SQL in repo/tests.ts. Build every API route of B7 under /api/crm/scholarship-test with requireAdmission (registration search is POST; desk allowed only on POST registrations for own-centre slots and PATCH registrations checkin/absent/undo_checkin), and the pages /crm/scholarship-test, /crm/scholarship-test/[eventId] (tabs Registrations, Test day, Scores, Results, Report, Settings with SA-only slabs/targets, prefilled editable bring_en/bring_hi draft, read-only QB slotReadiness line in try/catch) and /crm/scholarship-test/[eventId]/admit/[regId] (AdmitCard from CORE stub props; Copy family link and Send on WhatsApp both mint and warn), and LeadTestPanel (register, move, cancel, admit card, WhatsApp via the CORE send button with test context, Confirm as sibling). Check-in and publish use advanceStage with channel 'system'. Messages only in admission-test.ts (en + hi). Write and run the tests listed in C4 'Must test'. Run: npx vitest run src/lib/crm/admission/test src/app/api/crm/scholarship-test src/components/admission/test --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. Obey C2.",
    "acceptance": [
      "An admin creates a test with 2 slots and opens it; a counsellor registers a lead from the lead page and the admit view renders",
      "A manager checks in (stage test_taken, first-call clock still open), uploads scores by CSV and sees the report with every B6.1 metric",
      "The SA sets slabs; the admin publishes in batches; the counsellor has an offer call due +48 h and the result on the timeline",
      "A duplicate registration returns the existing roll without minting or invalidating the old token; public registrations never create sibling rows",
      "Desk check-in works only at its own centre and today; all other desk calls 403",
      "Export has no phone column; no search term appears in a URL; audit details pass the sanitiser",
      "All tests in the run command pass; tsc and eslint clean"
    ]
  },
  {
    "key": "P2-VISITS-DESK",
    "title": "Visits & demo classes, walk-in desk and front-desk logins",
    "dependsOn": ["P2-CORE"],
    "owns": [
      "src/lib/crm/admission/visits/**",
      "src/lib/crm/admission/desk/**",
      "src/lib/crm/admission/repo/bookings.ts",
      "src/app/api/crm/bookings/**",
      "src/app/api/crm/desk/**",
      "src/app/[lang]/(portal)/crm/visits/**",
      "src/app/[lang]/(portal)/crm/desk/page.tsx",
      "src/app/[lang]/(portal)/crm/settings/desk/page.tsx",
      "src/components/admission/visits/**",
      "src/components/admission/desk/**",
      "src/i18n/messages/en/admission-visits.ts",
      "src/i18n/messages/hi/admission-visits.ts",
      "src/i18n/messages/en/admission-desk.ts",
      "src/i18n/messages/hi/admission-desk.ts"
    ],
    "task": "Read docs/admin-phase-2-plan.md B2.1, B2.2, B5.3, B5.4, B6.2, B7 (bookings and desk rows), B4.8, B9, B10, B11 and C5, plus the CORE report. Read node_modules/next/dist/docs on pages and route handlers first. Build bookVisit and updateBooking (one transaction each; the B5.3 effects table exactly: book = advanceStage counselling_booked with channel 'ui'; attended = advanceStage visited_or_demo via the system viewer; tasks via createFollowUpTask/completeTask, never assigned to a desk user; no-show task due addWorkingMinutes(now, 120); reschedule; optimistic version; past-within-7-days recorded as attended; created_via 'staff'), all SQL in repo/bookings.ts, the ICS route via buildIcs with no names, /crm/visits (agenda by day, day/week, centre filter, summary strip per B6.2, tomorrow reminders with the CORE WhatsApp send button in booking context, posted family search), LeadVisitsPanel replacing the stub. Build the desk: /crm/desk tablet-first page; POST /api/crm/desk/families {phone} (exact 10 digits, limiter 60 per 10 min per user, minimal card, audited adm.desk_lookup, number kept in component state never in a URL); POST /api/crm/desk/arrivals (re-find by phone; desk activity {event:'arrived', centre} through systemViewerFor plus createFollowUpTask to the assignee; no lead creation, no consent, no reopen, no stage change; withdrawn families blocked; unassigned -> unassigned task and message); POST /api/crm/desk/walk-ins (createManualLead with desk rules; duplicate -> card); GET /api/crm/desk/today; POST /api/crm/desk/test-search calling deskTestCheckins; desk check-in on bookings (checkin/no_show own centre today). Build /crm/settings/desk and /api/crm/desk/accounts (SA writes via adminCreateUser with onCreated inserting crm_desk_staff in one transaction, no crm_staff row, temporary password once, 422 already_crm_member; admins read with login ids, managers without). Messages only in admission-visits.ts and admission-desk.ts (en + hi). Write and run the tests in C5 'Must test'. Run: npx vitest run src/lib/crm/admission/visits src/lib/crm/admission/desk src/app/api/crm/bookings src/app/api/crm/desk src/components/admission/visits src/components/admission/desk --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. Obey C2.",
    "acceptance": [
      "A counsellor books a visit from the lead page: stage counselling_booked, the first-call clock resolves, a task is due at the visit time",
      "The desk checks the visitor in: stage visited_or_demo and a follow-up exists (no duplicate when one already exists)",
      "The desk adds a walk-in that lands with an executive (never the desk user); a duplicate shows the family card",
      "The desk finds an existing family by full number via POST and 'They're here' creates only a desk activity and a task for the assignee; a withdrawn family is blocked",
      "No desk URL contains a 10-digit run; the family card has none of the forbidden fields",
      "The SA creates a desk login from the settings page with no crm_staff row; managers see no login ids",
      "ICS files contain no names; WhatsApp sends are logged only after 'Sent'",
      "All tests in the run command pass; tsc and eslint clean"
    ]
  },
  {
    "key": "P2-PUBLIC",
    "title": "Public scholarship-test registration, admit card and /links bio page",
    "dependsOn": ["P2-CORE", "P2-TEST"],
    "owns": [
      "src/app/[lang]/(site)/scholarship-test/page.tsx",
      "src/app/[lang]/(site)/scholarship-test/admit/page.tsx",
      "src/app/[lang]/(site)/links/page.tsx",
      "src/app/api/scholarship-test/registrations/route.ts",
      "src/app/api/scholarship-test/admit/route.ts",
      "src/lib/crm/admission/public/**",
      "src/components/admission/public/**",
      "src/i18n/messages/en/admission-public.ts",
      "src/i18n/messages/hi/admission-public.ts"
    ],
    "task": "Read docs/admin-phase-2-plan.md B5.2, B7 (public rows), B8, B9, B11 and C6, the CORE and TEST reports, and node_modules/next/dist/docs on pages, metadata, route handlers and Cache Components (connection, Suspense) first. Build /scholarship-test (static prerendered shell with h1 and neutral 3-step how-it-works; under Suspense await connection() then openEventsForPublic; per-event staff-typed fields with per-field English fallback carrying lang='en'; RegistrationForm client component with the 'To be filled in by the student's parent or guardian' line, student name, parent or guardian name, parent or guardian mobile, class limited to the event's classes, slot radios grouped by venue with full slots disabled and labelled Full and no seat counts, the exact forms.shared.consent sentence v2 with its privacy link, honeypot website, NO student/parent selector, context from collectEnquiryContext(locale); states submitting, error summary focused, slot full 409 with refresh, closed 409, 429, registered panel, received panel; not-open state rendering the existing EnquiryForm variant quick without editing it). Build POST /api/scholarship-test/registrations in the exact order origin -> 8 KB -> zod -> honeypot fake success -> limiters (20 per 10 min per IP, 3 per hour per phone) -> one withTransaction: captureLead (source scholarship_test, consent v2 text from CONSENT_TEXTS, context via leadContextFromEnquiry, submittedBy parent, submissionMeta.testEventId) then registerForTest (via public, campaignCode from context utm_campaign) then mintAdmitLink only for a new registration; a duplicate gets status received, rollNo null, admitUrl null, a test activity resend_requested and a 'Resend admit card' task unless one is open; same response keys both ways. Build /scholarship-test/admit as a fully static page whose AdmitCardLoader reads location.hash (#t=) and POSTs /api/scholarship-test/admit {token} (same origin, 2 KB, 30 per 10 min per IP, no-store, noindex, one 404 for invalid/expired/cancelled); metadata robots noindex,nofollow and referrer no-referrer; print CSS one A4 page, chrome hidden; replace the AdmitCard stub (no phone, score, slab or QR). Build /links (Suspense, listBioLinks, buttons to /go/<code>, noindex, empty state). Do not add anything to the sitemap or header. Messages only in admission-public.ts (en + hi). Write and run the tests in C6 'Must test' against the real registerForTest. Run: npx vitest run src/lib/crm/admission/public src/app/api/scholarship-test src/components/admission/public --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. Obey C2.",
    "acceptance": [
      "A public registration creates a scholarship_test lead with consent v2 stored verbatim and submittedBy parent, a roll CODE-0001 and a working admit card through the fragment link",
      "A full slot rolls back the whole submission; closed event 409; class outside the event 422",
      "A repeat registration answers status received with no link, does not invalidate the old token, creates one resend task and no sibling row",
      "The admit token never appears in a request URL or query string; admit metadata is noindex and no-referrer; no phone, score or slab in the markup",
      "The /scholarship-test static shell prerenders; no seat counts; no % unless slabs are set and shown publicly; Hindi fields fall back with lang",
      "/links shows only bio links pointing at /go/ and an empty state",
      "All tests in the run command pass; tsc and eslint clean"
    ]
  },
  {
    "key": "P2-FACTS-PRIVACY",
    "title": "Fact sheet, Roles & permissions page, Data & privacy (requests, retention, exports log)",
    "dependsOn": ["P2-CORE", "P2-VISITS-DESK"],
    "owns": [
      "src/lib/crm/admission/facts/**",
      "src/lib/crm/admission/repo/facts.ts",
      "src/app/api/crm/facts/**",
      "src/app/[lang]/(portal)/crm/facts/page.tsx",
      "src/components/admission/facts/**",
      "src/i18n/messages/en/admission-facts.ts",
      "src/i18n/messages/hi/admission-facts.ts",
      "src/app/[lang]/(portal)/admin/permissions/page.tsx",
      "src/components/admission/permissions/**",
      "src/lib/crm/admission/privacy/**",
      "src/lib/crm/admission/repo/privacy.ts",
      "src/app/api/admin/privacy/**",
      "src/app/[lang]/(portal)/admin/privacy/page.tsx",
      "src/components/admission/privacy/**"
    ],
    "task": "Read docs/admin-phase-2-plan.md B5.5, B5.10, B5.11, B2.2, B3 (fact and privacy tables), B7 (facts and privacy rows), B9, B10, B11 and C7, plus the CORE report; read node_modules/next/dist/docs on pages and route handlers first. Fact sheet: services and repo for batches and entries (zod validation: https URLs only, map hosts maps.app.goo.gl, google.com/maps, g.page, goo.gl/maps, real dates, integer money >= 0, instalments <= 8, open topics/programmes validated against the TS tuples; any save resets status to draft; verify = admin for non-money facts and SA only for batches and entries with topic fees or scholarship; archive by admins and the drafting manager; managers edit own centres; desk reads own centre only; optimistic version), the API routes of B7, /crm/facts with the four sections, verified / not verified (amber, icon + text) / not set badges, copy buttons, print view printing '(not verified)', edit drawer with source_note; replace the factSlotValues stub (verified only, centre before all-centres, Hindi value fallback, bring_list from bring_list_visit, test_date from the next open event slot, batch_start only on a single program match, demo rows never used). /admin/permissions: English-only static table from src/components/admission/permissions/permissions-table.ts (B2.2 + LR section 22), rendered in preview mode, with a test checking every row against admissionCan/crmPermissions for each role fixture. /admin/privacy (English only, admin): requests register (record by full phone or name posted; nothing stored for families not found; close with a note whose 10+ digit runs are stripped; erase closes open erase requests), retention per B5.11 with the last-real-contact rule (activity types submission, created, call, whatsapp, note, stage_change, booking, test, desk, tool_use; only person-created open tasks keep a lead), dry run (admin, counts + 20 samples, crm_retention_runs) and run (SA, dry run within 24 h, typed ERASE <n>, client loop of batches of 200 through eraseLead with reason no_longer_needed), exports and imports log (last 100 audit rows of the listed actions), withdrawals count; preview mode shows 'Preview: no data'. Messages: admission-facts.ts (en + hi); English copy.ts for the admin pages. Write and run the tests in C7 'Must test'. Run: npx vitest run src/lib/crm/admission/facts src/lib/crm/admission/privacy src/app/api/crm/facts src/app/api/admin/privacy src/components/admission/facts src/components/admission/permissions src/components/admission/privacy --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. Obey C2.",
    "acceptance": [
      "A manager drafts a batch and a map link for their centre; an admin verifies the map link; only an SA can verify the batch fees (admin gets 403); any later edit resets to not verified",
      "factSlotValues returns only verified values with the correct precedence and fallbacks",
      "The desk can read only its own centre's fact sheet",
      "/admin/permissions rows match admissionCan/crmPermissions for every role fixture and render in preview mode",
      "Retention dry run selects by last real contact (system tasks never keep a lead); the run requires SA, a recent dry run and the typed count, and erases in resumable batches through eraseLead",
      "Erasing a lead closes its open erase requests; the exports log lists only the specified actions",
      "All tests in the run command pass; tsc and eslint clean"
    ]
  },
  {
    "key": "P2-GROWTH",
    "title": "Campaign links & QR, /go redirects, paper-form import extension, first-call speed by centre",
    "dependsOn": ["P2-CORE", "P2-PUBLIC"],
    "owns": [
      "src/lib/crm/admission/campaigns/**",
      "src/lib/crm/admission/repo/campaigns.ts",
      "src/app/go/[code]/route.ts",
      "src/app/api/crm/campaigns/**",
      "src/app/[lang]/(portal)/crm/campaigns/**",
      "src/components/admission/campaigns/**",
      "src/i18n/messages/en/admission-campaigns.ts",
      "src/i18n/messages/hi/admission-campaigns.ts",
      "src/lib/crm/intake/rows.ts",
      "src/lib/crm/intake/import.ts",
      "src/lib/crm/intake/fields.ts",
      "src/lib/crm/intake/*.test.ts (only for the files above)",
      "src/components/crm/import/**",
      "src/app/api/crm/import/** (only if a schema field is added)",
      "src/i18n/messages/en/crm-import.ts",
      "src/i18n/messages/hi/crm-import.ts",
      "src/lib/crm/admission/reports/first-response.ts",
      "src/lib/crm/admission/repo/first-response.ts",
      "src/components/admission/growth/FirstResponseByCentre.tsx"
    ],
    "task": "Read docs/admin-phase-2-plan.md B5.6, B5.7, B5.9, B6.3, B6.4, B7 (campaign rows), B11 and C8, the CORE report, LR's intake code, and node_modules/next/dist/docs on route handlers first. Campaigns: services and repo (codes unique, [a-z0-9-] campaign codes, 4-12 char link codes without look-alike characters, targets only from LINK_TARGETS, channel utm defaults), API routes of B7, /crm/campaigns list and /crm/campaigns/[campaignId] detail with links table, Copy, QR SVG/PNG, Print, Archive, a 30-day opens chart with a table alternative and the B6.3 numbers (test registrations by registration campaign_code; enquiries labelled new families only; opens labelled not people), and the print view /crm/campaigns/[campaignId]/print/[code] with the 'TEST, do not print' watermark unless getSiteOrigin() host is aspireiit.in or www.aspireiit.in plus the 'scan one printed copy' line; replace the listBioLinks stub. /go/[code] route handler at src/app/go/[code]/route.ts (CORE already added go to NON_LOCALIZED_PREFIX): 60 s cached lookup, unknown/archived -> 302 '/', else relative 302 to localePath(target, locale) with utm_source, utm_medium, utm_campaign=campaign.code, utm_content=code; no-store and noindex; HEAD and prefetch not counted; in-memory counter on globalThis Symbol.for('aspire.campaignClicks') capped at 5000 keys, flushed in one transaction when 60 s have passed and before campaign reads. In-house QR encoder qr/{encode,svg,png}.ts per B5.6 (byte mode, M v1-3 else L v1-5, single block, mask penalties, SVG path with title, PNG grayscale via node:zlib with CRC-32); QR downloads audited leadgen.qr_download. Paper import: extend LR-IMPORT per B5.7 (paper basis -> method written with required PAPER_SOURCES choice and optional campaign; per-row consent_method synonyms; invalid value -> row invalid; source paper_form; utm source=<paperSource>, medium=offline, campaign=<code|null>; submissionMeta; map 1b detail columns only if 1b exposes a setter) without changing idempotency, attach-only, damage blocking, chunks or limits. First response: report + repo per B6.4 using leadScopeSql, replace the FirstResponseByCentre stub. Messages only in admission-campaigns.ts and crm-import.ts (en + hi). Write and run every test in C8 'Must test' (incl. the RS known-answer vector, all 32 format strings, positions v1-v5, padding, a test-only decoder round trip for 200 random URLs, PNG/SVG checks) and keep all existing LR import tests green. Run: npx vitest run src/lib/crm/admission/campaigns src/lib/crm/admission/reports src/app/go src/app/api/crm/campaigns src/components/admission/campaigns src/components/admission/growth src/lib/crm/intake src/components/crm/import src/app/api/crm/import --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. Obey C2 (no QR dependency).",
    "acceptance": [
      "An admin creates a campaign and a link; /go/<code> 302s relatively with the utm tags; unknown or archived codes 302 to /; HEAD and prefetch are not counted; clicks appear after a flush",
      "QR SVG and PNG pass the known-answer, structure and decoder round-trip tests; payloads over capacity give qr_too_long",
      "Print views show the watermark unless the site host is aspireiit.in",
      "A paper-form import requires a paper source, honours per-row consent_method, stores source paper_form with utm medium offline; all existing LR import tests pass",
      "Campaign metrics follow B6.3, counting test registrations of known families by campaign_code",
      "The first-call speed card follows B6.4 with import clocks separate and scope applied",
      "All tests in the run command pass; tsc and eslint clean"
    ]
  },
  {
    "key": "P2-FAMILY",
    "title": "Families: siblings panel, merge of duplicate enquiries, merged banner",
    "dependsOn": ["P2-CORE", "P2-TEST", "P2-FACTS-PRIVACY"],
    "owns": [
      "src/lib/crm/admission/family/**",
      "src/lib/crm/admission/repo/move.ts",
      "src/app/api/crm/leads/[leadId]/students/**",
      "src/app/api/crm/leads/[leadId]/merge/route.ts",
      "src/components/admission/family/**",
      "src/i18n/messages/en/admission-family.ts",
      "src/i18n/messages/hi/admission-family.ts",
      "Phase 1b duplicate-suggestion component (Merge action only)"
    ],
    "task": "Read docs/admin-phase-2-plan.md B5.8, B3 (crm_lead_students, crm_lead_merges), B4.6, B7 (students and merge rows), B10 and C9, plus the CORE report (findLeadByPhone already follows merges; eraseLead already cascades to stubs; LeadDetailView already has admission and admissionBanner slots). Do NOT edit capture.ts, admin.ts or LeadDetailView.tsx. Students: services, repo and API (GET/POST/PATCH; removal = status removed; source staff; admitted sets status_at; scope via students.edit), LeadFamilyPanel replacing the stub (main student read-only from the lead, sibling rows, add/edit/remove, 'Merge another enquiry into this family' with a posted in-scope search). Merge: POST /api/crm/leads/[leadId]/merge {fromLeadId, confirm:true} for admins and managers who can see both leads; refuse same lead, erased, already merged, not visible, counsellor; MergeDialog listing counts and one-way warning; one transaction doing exactly B5.8 steps 1-6 (move activities, tasks, bookings, registrations with duplicate-registration cancellation counted, students, crm_external_refs and gate passes then trimGatePasses(db, A, MAX_GATE_PASSES_PER_LEAD); fill 1b details only where empty and B's phone as A's alternate phone if 1b has it; delete 1b dismissals referencing B; closeSlaClock(B, closed); B lost/duplicate via the system viewer with names, email and message wiped and phone kept; crm_lead_merges row; merge activities on both; recompute next_task_due_at; audit crm.lead_merge with count keys activities, tasks, bookings, registrations, duplicateRegistrations, students, externalRefs, gateBrowsers, toolUses). All SQL in repo/move.ts. LeadMergeBanner replacing the stub ('Merged into {A}' link only if the viewer can see A). Add the Merge action to Phase 1b's duplicate-suggestion card if it exists. Messages only in admission-family.ts (en + hi). Write and run the tests in C9 'Must test'. Run: npx vitest run src/lib/crm src/app/api/crm/leads src/components/admission/family src/components/crm --exclude \"src/lib/crm/intake/**\" --exclude \"src/components/crm/import/**\" --maxWorkers=1; eslint on touched files; one npx tsc --noEmit. Obey C2.",
    "acceptance": [
      "Siblings can be added, edited and removed (status removed) within scope; erase deletes them",
      "A merge moves every listed table with correct counts, trims gate passes to the shared cap, closes B's clock and leaves B lost/duplicate with its phone and no personal fields",
      "Refusals work for same lead, erased, already merged, not visible and counsellor; an injected failure leaves both leads unchanged",
      "After a merge, a capture, a manual walk-in and a gate submission with B's number land on A and B stays lost; erasing A erases B",
      "Audit details of crm.lead_merge keep every count key",
      "The full CRM regression in the run command passes; tsc and eslint clean"
    ]
  }
]
```
