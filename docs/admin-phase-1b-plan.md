# Admin console Phase 1b: "Your numbers and faster follow-ups"

**Doc:** `docs/admin-phase-1b-plan.md`
**Status:** build plan, 22 Oct 2026, revised after the critic review (§20). It builds on `docs/admin-console-plan.md`, which the owner approved with all 23 defaults on 21 Oct (backups deferred).
**Release:** R2, after R1 (the current tree with lead routing and the question bank). If the page-layout feature also ships in R2, it runs **after** 1b Integrate, never beside 1B-CORE (§1.3).
**Decision ids:** Phase 1b uses **D-078 to D-083**. D-059 to D-068 are proposed by `docs/admissions-agent-plan.md` (Asha) and D-070 to D-077 by `docs/admin-phase-2-plan.md`. The page-layout feature should take D-084 or later. Grep `docs/` again before recording any id.
**Owner is away:** every open question has a default. The build uses the defaults, and each one can be changed later.

---

## Owner summary (one page)

### What changes for staff

- **Logging a call is one step.** One box asks what happened (spoke to them, no answer, busy, phone off, asked us to call back, wrong number) and when to try next (*Later today*, *Tomorrow*, *In 3 days*, *Pick a time*). It suggests the next time from your calling rules, shows how many calls went unanswered, and after 5 unanswered calls in a row offers "Mark as not reachable". Ticking a follow-up as done opens the same box, so every finished task records what happened.
- **WhatsApp from 8 templates** (welcome, missed call, centre location, prospectus, visit invite, scholarship test date, new batch, thank you after a visit) in English, Hindi or Hinglish, with names and the centre filled in. *Open WhatsApp* opens the counsellor's own WhatsApp with the text ready; they press send themselves. When they come back, the CRM asks **"Did you send it?"** and records the message only if they say yes. Only templates you have approved can be used.
- **More details on each family:** second phone or WhatsApp number, school, board, hostel needed, target exam and year, how they heard of Aspire (newspaper, poster, seminar, Google Maps, an AI assistant such as ChatGPT, old student, …), referred by, joining session, best time to call, who decides.
- **"Possible duplicate" warnings** when another enquiry has the same second number, or the same student name, class and centre. Nothing merges by itself.
- **Enquiries list:** one-tap views (*My new*, *Not called yet*, *Due today*, *Overdue*, *Unassigned*, *This centre*, *Free tool users*) and filter chips you can remove one by one.
- **Area heads (managers):** their Dashboard now opens with **five numbers for each of their centres** (enquiries this week, not yet called, overdue follow-up tasks, admissions this session against target, top 3 sources) and a **Needs attention** list. Every number opens the list it counts, and the list shows the same count. They also get **Admissions done**, **Lost enquiries to review** (keep lost or reopen), **Where enquiries come from** for their centres, and **counsellor activity** in Reports.
- **Counsellors:** home stays *Today's calls*; in Reports they see only their own numbers.
- **You, the CMO and other admins:** Console Home shows the five numbers for every centre plus Needs attention; **Targets**; **WhatsApp templates** (read, edit, approve); **Google Maps links** per centre; **Free tools & Rancho** use; **Search overview**; **People** (every account, with each staff member's role, centres, areas, away status and open enquiries; a new staff login must have its role chosen); **AI assistant access** in plain words ("Ask Aspire" is now "Rancho"); **Site status** (mode, indexing, enquiries saved, release, database size, free disk, "Off-server backups: not set up (deferred)", a short go-live list); an **activity log in plain words** (repeated "viewed an enquiry" lines grouped, never deleted).

### What you need to do after the release (about 30 minutes)

1. **Approve the WhatsApp templates:** *CRM → WhatsApp templates*. Read each draft (English, Hindi, Hinglish), edit if needed, then *Approve*. Counsellors cannot use a template until you do.
2. **Enter targets:** *CRM → Targets*, admissions per centre for 2026–27 (split by programme if you want).
3. **Paste each centre's Google Maps link:** *Where enquiries come from → Google Maps*. Put the tagged website link into each Google Business Profile **only once the domain is final** (decision 17).
4. *(Optional)* Set the prospectus link on the templates page.
5. Send the real centre list when you can (decision 7). Until then the console uses the 4 website centres and says "Demo centre list".

### Decisions taken by default (change any of them later)

| # | Question | Default used |
|---|---|---|
| O1 | Real centre list (decision 7) | The 4 website centres, plus any centre already on an enquiry or set as an area's centre. Labelled "Demo centre list" while the site is in demo mode |
| O2 | Calling window (decision 9 says 8 am–9 pm; lead routing has its own setting) | Lead routing's **calling hours** drive every suggestion. 8:00–21:00 IST is a hard limit: a time outside it is refused; a time outside calling hours only gets a warning |
| O3 | Free tool users queue | Lead routing's **Tool sign-ups** list is the queue; super admins and admins triage it. **This changes your decision 12** ("managers triage") until the tool form asks for the district |
| O4 | Who edits targets, templates and Maps links | **Super admins only** (your rule "settings are super-admin only"). Admins and managers read. Managers editing templates (decision 11) waits for your go-ahead |
| O5 | Template drafts (decision 11) | 8 drafts in English, Hindi and Hinglish, **awaiting your approval**, not usable until approved. Editing an approved template sends it back for approval |
| O6 | Targets (decision 8) | Per session (April–March) for each centre × programme (JEE, NEET, Foundation, Integrated, Any). Enquiry and counselling targets optional. **No monthly targets** (not asked for) |
| O7 | What counts as an enquiry | Every family in the enquiries list, including free-tool sign-ups and imported lists (shown as sub-lines). "Not yet called" leaves out free-tool sign-ups (they have no 1-hour clock). Erased enquiries are not in the lists, so they are not in the linked numbers either; a small note shows how many were erased |
| O8 | Which session an admission counts in | The family's "joining session" if staff set it, otherwise the date they were marked Admitted |
| O9 | Follow-up rhythm (decision 9) | Contacted → days 2, 5, 10; after a visit → days 1 and 3; after the test → within 48 h. "No answer" uses lead routing's retry time (2 working hours), so there is one rule, not two |
| O10 | "Not reachable" | Suggested after 5 unanswered calls in a row; staff confirm, never automatic |
| O11 | Duplicates | Suggested only; "Not the same family" hides the pair for good. No merging (Phase 2) |
| O12 | Lost review | Last 14 days by default; managers and admins review |
| O13 | Google Business Profile link | `…/centres?utm_source=google&utm_medium=gbp&utm_campaign=gbp-<centre>` |
| O14 | Erase requests on Needs attention | Left out until Phase 2's Data & privacy page (there is no erase-request store yet) |
| O15 | Activity log language | New labels English only (decision 5) |
| O16 | WhatsApp logging | Recorded only when the counsellor confirms "I sent it" (opening WhatsApp alone records nothing and does not stop the 1-hour clock) |
| O17 | AI-assistant (MCP) tool for the numbers | **Not built in 1b** (kept small); only the wording changes |

**Where this differs from what you approved:** decision 12 (O3), decision 9's window (O2), decision 11 manager edits (O4) and decision 8's targets kept to sessions (O6). Each is a one-line change later.

---

# Part 1. Technical design

## 1. Preconditions and ground rules

### 1.1 Start conditions (hard)

1. **LR Integrate is done and green** (`tsc`, vitest, eslint). On 22 Oct 04:30 IST LR-CORE had landed (`src/lib/crm/{settings,sla-state,lead-ops-types,arrival}.ts`, `crm_settings`, `crm_areas`, `crmPermissions().isSuperAdmin/canEditSettings`, `SettingsHub.tsx`, `/crm/settings`), but `src/lib/crm/sla/` held only `index.ts` (no `calling-hours.ts`) and `/crm/dashboard` did not exist. 1B-CORE checks that these exist before it starts:
   - `src/lib/crm/sla/calling-hours.ts` (`addWorkingMinutes`, `nextOpening`, `isOpenAt` or their real names);
   - `src/app/[lang]/(portal)/crm/dashboard/page.tsx` and `src/components/crm/dashboard/**`;
   - the `area` / `sla` inbox filters (present: `repo/leads.ts` `areaClause`);
   - `src/components/crm/areas/PeoplePicker.tsx`.
   If any is missing, 1B-CORE stops and reports.
2. **QB Integrate is done** (it edits `PortalShell.tsx`, `areas.ts`, `portal.ts`, `src/i18n/messages/{types,index}.ts`, `paths.ts`).
3. **R1 is committed and deployed.** Branch `feature/admin-console-1b` from R1.
4. **Re-read every shared file immediately before editing it.** LR or QB may have renamed things; adapt this plan's names and report the change.

### 1.2 Rules for every package

1. **Next 16:** read the relevant guide under `node_modules/next/dist/docs/` before writing a page or route handler (AGENTS.md). Pages follow the `CrmGate` / `PortalGate` pattern: anything that reads the session goes under `<Suspense>`, and `requestTime()` gives "now". Route handlers only, never Server Actions.
2. **APIs:** `requireCrm` (or LR's `requireCrmSuperAdmin`); the D-007 envelope; `no-store` and `X-Robots-Tag: noindex`; same-origin writes; strict zod; the 8 KB body limit (`CRM_MAX_BODY_BYTES`); `crmResponse` / `crmServerError`; CRM rate limits.
3. **SQL:** all new SQL lives in `src/lib/crm/repo/console-*.ts` (D-037). Read paths never open a write transaction. Writes go through the existing services (`logContact`, `createTask`, `completeTask`, `changeStage`, `assignLead`) so LR's SLA hooks fire. **Never write raw SQL to `crm_leads`, `crm_tasks` or `crm_activities`.**
4. **Scope:** use only `scopedLeadWhere` (§4.2) or the inbox query builder; never copy the scope logic.
5. **Atomic multi-step writes:** `runAtomic(db, fn)` (§4.2).
6. **Messages:** each package owns one nested pair `src/i18n/messages/{en,hi}/console-<pkg>.ts` (Hindi typed `typeof en`). Pages import both languages and pick by locale with `pick(locale, en, hi)` from `src/components/console/shared/messages.ts`. **Only 1B-CORE edits** `{en,hi}/crm.ts`, `{en,hi}/portal.ts`, `types.ts`, `index.ts`. Owner-only technical pages (`/admin/status`, `/admin/search`, activity-log labels) are English only (decision 5) with strings as constants in the module. Report every Hindi line for `docs/hindi-review-register.md`.
7. **Machine limits:** no new npm dependencies; no `next build`, no dev server, no browser (only Integrate runs one headless Chrome). vitest only on your listed paths with `--maxWorkers=1`; at most **one** `npx tsc --noEmit` per package, at the end; eslint on the files you touched.
8. **Audit:** every write is audited via `consoleAudit` or the existing service audits, with ids, counts and enum values only. No detail key may match `pass|hash|token|secret|salt|cookie|credential`.
9. **Shared test suites** have one editor at a time (listed per package; packages that share a suite run in different waves). If your change breaks an assertion in a suite you don't own, report the test name and the intended new expectation; Integrate applies it.
10. **Never touch:** `src/components/home/**`, `src/components/ui/*carousel*`, `src/app/sitemap.ts`, `next.config.ts`, `src/proxy.ts`, `src/lib/lead-gate/**`, `src/components/lead-gate/**`, `src/lib/ask/**` (import `usageKeyHash` only), `src/lib/mocktest/**`, `src/lib/qb/**`, public `(site)` pages, `deploy/**`, `package.json`, `src/lib/crm/index.ts`, `src/components/crm/api.ts`, LR's `routing/`, `sla/`, `meta/`, `intake/` folders, `src/lib/mcp/tools/crm.ts`.
11. **Privacy in URLs:** no 1b URL may carry a family's name, phone, email or free text. Links carry only filter enums, centre slugs, session keys and staff user ids. 1B-CORE adds a test that every link builder's output contains no run of 10 digits and no `@`.

### 1.3 Other workstreams

- **Page-layout feature (R2, if capacity allows):** it edits `areas.ts`, `portal.ts`, `AuditLog.tsx`, `features/index.ts`, `db.test.ts`, `portal-ui.test.ts`, `messages/{types,index}.ts`, `paths.ts` and `admin-users.test.ts`, which 1B-CORE and 1B-HOUSEKEEPING also edit. It must **not run in parallel with any 1b package**: it starts after 1B-INTEGRATE, appends its feature schema after `crm_console`, adds its audit labels to `src/components/portal/audit-labels.ts`, and takes decision id D-084 or later.
- **Phase 2** uses feature schema `crm_admission` (after `crm_console`) and must reuse 1b's `runAtomic`, `scopedLeadWhere`, `consoleCentres`, `consolePermissions`, the template store and slot registry, and the channel classifier (which already knows `paper_form` and `scholarship_test`, §6.6).
- **Asha** (`docs/admissions-agent-plan.md`) keeps its own Meta-approved template list for system-sent messages. The staff templates here are a separate store, but use **the same slot names** (§4.1), so one fill function serves both later.

## 2. Already built by lead routing (LR), the question bank (QB) or the lead gate

| Plan row | Who delivers it | What 1b does |
|---|---|---|
| Leave cover: Away until, bulk reassign | LR (`crm_staff_availability`, `AwayToggle`, `POST /api/crm/areas/reassign`) | Nothing new; Lost review and Dashboard link to LR's controls |
| Automatic "Call again" retry after no answer | LR-SLA (`onContactLogged` → retry task, skipped if an open task exists) | The one-step dialog creates the staff-chosen follow-up **before** logging the call, so LR's retry is skipped and exactly one task exists (§5.C) |
| First-call speed, 1-hour clock, escalations, speed by executive | LR dashboard | Not duplicated; Phase 2 adds centre and counsellor cuts |
| Manager dashboard page, nav item, today's arrivals, unassigned-in-areas and tool sign-up tiles | LR (`/crm/dashboard`) | 1b inserts "Five numbers by centre" and "Needs attention" at the top, **without** a second "today" column and without the unassigned / tool sign-up rows LR already shows (§5.A) |
| Staff create/edit/disable/reset super-admin only; areas; People picker | LR-CORE / LR-ROUTING | People list shows CRM role, centres, areas, away status, open leads; staff creation must name the CRM role |
| Tool sign-ups queue (`?area=tool_signups`) | LR | Preset view plus a Needs attention line on `/admin` |
| Settings store (`crm_settings`, optimistic version), settings hub | LR-CORE | 2 new keys and 3 hub cards (1B-CORE) |
| Calling hours, speed rule (`getCallingHours`, `getSpeedRule` in `src/lib/crm/settings.ts`) | LR | Read only: presets and rhythm use them |
| District / town (`crm_lead_routing.place_input`, `area_id`) | LR-ROUTING | Not duplicated; the details panel shows LR's area and place read-only |
| CSV import | LR-IMPORT | Untouched (Phase 2 extends it) |
| Call-return prompt after a `tel:` tap (`CallReturnPrompt.tsx` + `call-return.ts`) | Phase 1a / LR | `CallReturnPrompt.tsx` opens the new dialog; the `call-return.ts` helpers are reused unchanged |
| "Rancho" label for tool `ask` | Phase 1a | Reused in the classifier and reports |
| Lead-gate mode, daily gate forms (`getLeadGateConfig`, `gateDailyCounts`) | Lead gate | Shown on the Free tools card |
| Question bank | QB | Only readable labels for its audit codes; QB-only staff get a landing (§5.A) |

## 3. Data model

**No core migration.** `SCHEMA_VERSION` stays 2. One new idempotent feature schema:
- **name** `crm_console`; **file** `src/lib/db/features/crm-console.ts`;
- **position:** appended to `FEATURE_SCHEMAS` right after `crm_intake` (… `crm`, `superadmin`, `crm_intake`, **`crm_console`**, `qb`).

It contains only `CREATE TABLE/INDEX IF NOT EXISTS`, has no runtime imports and alters nothing. Every table uses the `crm_` prefix, so `db.test.ts` needs no change.

**CHECK rule (feature schemas can never ALTER, so a CHECK can never be widened):** SQL CHECKs are used only for closed state machines, 0/1 flags, formats, lengths and ranges. **Open vocabularies** (board, target exam, how they heard, preferred time, who decides, target programme and metric, template context) get only a length CHECK (≤ 40) and are validated in zod against the TypeScript tuples in §4.1, so a new value is a code change, not a table rebuild.

```sql
-- Phase 1b console (docs/admin-phase-1b-plan.md). SQL lives in src/lib/crm/repo/console-*.ts.

-- E. More enquiry details (one row per lead; personal columns wiped on erase).
CREATE TABLE IF NOT EXISTS crm_lead_details (
  lead_id TEXT PRIMARY KEY REFERENCES crm_leads (id) ON DELETE CASCADE,
  alt_phone_e164 TEXT CHECK (alt_phone_e164 IS NULL OR (alt_phone_e164 GLOB '+[1-9]*' AND length(alt_phone_e164) BETWEEN 9 AND 16)),
  school TEXT CHECK (school IS NULL OR length(school) BETWEEN 1 AND 120),
  board TEXT CHECK (board IS NULL OR length(board) BETWEEN 1 AND 40),
  hostel TEXT CHECK (hostel IS NULL OR hostel IN ('yes','no','maybe')),
  target_exam TEXT CHECK (target_exam IS NULL OR length(target_exam) BETWEEN 1 AND 40),
  target_year INTEGER CHECK (target_year IS NULL OR target_year BETWEEN 2024 AND 2040),
  heard_via TEXT CHECK (heard_via IS NULL OR length(heard_via) BETWEEN 1 AND 40),
  referred_by TEXT CHECK (referred_by IS NULL OR length(referred_by) BETWEEN 1 AND 80),
  intake_session TEXT CHECK (intake_session IS NULL OR intake_session GLOB 'S[0-9][0-9][0-9][0-9]'),
  preferred_time TEXT CHECK (preferred_time IS NULL OR length(preferred_time) BETWEEN 1 AND 40),
  decision_maker TEXT CHECK (decision_maker IS NULL OR length(decision_maker) BETWEEN 1 AND 40),
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_lead_details_alt_phone_idx ON crm_lead_details (alt_phone_e164) WHERE alt_phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_lead_details_session_idx ON crm_lead_details (intake_session) WHERE intake_session IS NOT NULL;

-- J. Non-personal origin that survives erase (plan §3.3). Written ONLY by the erase hook (the live
--    value stays in crm_leads.referrer until then). Reports read COALESCE(l.referrer, la.referrer_host).
CREATE TABLE IF NOT EXISTS crm_lead_attribution (
  lead_id TEXT PRIMARY KEY REFERENCES crm_leads (id) ON DELETE CASCADE,
  referrer_host TEXT CHECK (referrer_host IS NULL OR length(referrer_host) <= 100),
  kept_at INTEGER NOT NULL
);

-- B. Targets. 'S2026' = session 1 Apr 2026 – 31 Mar 2027 (IST). 'M2026-11' (a month) is accepted by the
--    CHECK for a later phase; 1b writes and reads session periods only.
CREATE TABLE IF NOT EXISTS crm_targets (
  period TEXT NOT NULL CHECK (period GLOB 'S[0-9][0-9][0-9][0-9]' OR period GLOB 'M[0-9][0-9][0-9][0-9]-[01][0-9]'),
  centre_slug TEXT NOT NULL CHECK (length(centre_slug) BETWEEN 1 AND 60),
  program TEXT NOT NULL CHECK (length(program) BETWEEN 1 AND 40),
  metric TEXT NOT NULL CHECK (length(metric) BETWEEN 1 AND 40),
  value INTEGER NOT NULL CHECK (value BETWEEN 0 AND 100000),
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (period, centre_slug, program, metric)
);

-- D. Staff WhatsApp templates (wa.me prefilled text; the system never sends anything, D-041).
--    context: 'general' = the lead-page composer; Phase 2 adds 'booking' and 'test' keys.
CREATE TABLE IF NOT EXISTS crm_wa_templates (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 40 AND key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z0-9_]*'),
  context TEXT NOT NULL DEFAULT 'general' CHECK (length(context) BETWEEN 1 AND 40),
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  body_en TEXT NOT NULL CHECK (length(body_en) BETWEEN 1 AND 700),
  body_hi TEXT NOT NULL CHECK (length(body_hi) BETWEEN 1 AND 700),
  body_hinglish TEXT NOT NULL CHECK (length(body_hinglish) BETWEEN 1 AND 700),
  version INTEGER NOT NULL DEFAULT 1,
  seeded INTEGER NOT NULL DEFAULT 1 CHECK (seeded IN (0,1)),      -- 1 = untouched seed draft
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  approved_at INTEGER,
  approved_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_wa_templates_ctx_idx ON crm_wa_templates (context, status, position);

-- F. "Not the same family" (ordered pair; ids only).
CREATE TABLE IF NOT EXISTS crm_duplicate_dismissals (
  lead_a TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  lead_b TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  dismissed_at INTEGER NOT NULL,
  dismissed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (lead_a, lead_b),
  CHECK (lead_a < lead_b)
);

-- H. Lost review (one row per lost event = the stage_change activity's `at`).
CREATE TABLE IF NOT EXISTS crm_lost_reviews (
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  lost_at INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('kept','reopened')),
  reviewed_at INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (lead_id, lost_at)
);
CREATE INDEX IF NOT EXISTS crm_lost_reviews_at_idx ON crm_lost_reviews (reviewed_at);
```

**New `crm_settings` keys** (1B-CORE appends them to LR's `CRM_SETTING_KEYS` in `src/lib/crm/lead-ops-types.ts`; additive):

| Key | Written by | Shape |
|---|---|---|
| `centre_links` | Super admin (editor in 1B-SOURCES; reader/writer in core) | `{ centres: Record<centreSlug, { mapsUrl: string \| null }> }`. https only; host one of `maps.app.goo.gl`, `goo.gl`, `g.page`, `maps.google.com`, `www.google.com` / `google.com` (path starting `/maps`); ≤ 300 characters |
| `wa_links` | Super admin (1B-CALLS) | `{ prospectusUrl: string \| null }` (https, ≤ 300 characters) |

There is **no seed marker**: template seeding is per key with `INSERT OR IGNORE` (§5.D), so Phase 2 can add keys without a version trick.

**Erase (D-042) and retention.** 1B-CORE edits `eraseLead` (`src/lib/crm/admin.ts`) to call `eraseConsoleData(db, lead, now)` **before** the referrer is wiped. That function:
1. **Keeps the referrer host:** if `lead.referrer` is set, upserts `crm_lead_attribution(lead_id, referrer_host = lead.referrer, kept_at = now)` (a non-personal host, plan §3.3, E20).
2. **Wipes personal details:** sets `crm_lead_details.alt_phone_e164`, `school`, `referred_by` to NULL; keeps board, hostel, exam, year, `heard_via`, intake session, preferred time, decision maker for counts.
3. **Keeps ids-only tables** (`crm_duplicate_dismissals`, `crm_lost_reviews`).
4. **Keeps two new meta keys:** `KEEP_META_KEYS` gains `template` and `lang` (both non-personal).

Retention note for the future CRM-3 purge: deleting a `crm_leads` row cascades to every 1b table; anonymising instead must call `eraseConsoleData`.

## 4. Shared contracts (1B-CORE writes these; frozen once 1B-CORE finishes)

A package that needs a change reports it and does not make it.

### 4.1 `src/lib/crm/console/types.ts` (client-safe, no I/O)

```ts
// Sessions (IST)
export type SessionKey = `S${number}`;            // "S2026" = 1 Apr 2026 00:00 IST … 1 Apr 2027 00:00 IST
export interface SessionRef { key: SessionKey; label: string /* "2026–27" */; fromMs: number; toMs: number }

// Programmes and metrics for targets / admissions (open vocabularies: zod-validated, length-CHECKed in SQL)
export const CONSOLE_PROGRAMS = ["jee", "neet", "foundation", "integrated", "any"] as const;
export const TARGET_METRICS = ["admissions", "enquiries", "counselling"] as const;
export interface TargetCell { centreSlug: string; program: ConsoleProgram; metric: TargetMetric; value: number }
export interface TargetGrid { period: SessionKey; cells: TargetCell[]; updatedAt: string | null; updatedBy: string | null }

// Channels (how the family reached us) — order = classifier priority = tie-break order (§6.6)
export const CHANNELS = ["meta_ads", "scholarship_test", "imported_list", "paper_forms", "walk_in", "phone_call",
  "referral", "staff_other", "rancho", "free_tools", "google_maps", "ai_assistants", "paid_ads",
  "facebook_instagram", "search_engines", "whatsapp", "social", "campaign", "other_websites", "direct"] as const;
export type Channel = (typeof CHANNELS)[number];

// Details vocabularies (open: zod only)
export const BOARDS = ["hpbose", "cbse", "icse", "other"] as const;
export const HOSTEL_ANSWERS = ["yes", "no", "maybe"] as const;              // closed (SQL CHECK)
export const TARGET_EXAMS = ["jee", "neet", "foundation", "boards", "other"] as const;
export const HEARD_VIA = ["newspaper", "poster", "seminar", "google_maps", "google_search", "ai_assistant",
  "social_media", "old_student", "friend_family", "school_teacher", "other"] as const;
export const PREFERRED_TIMES = ["morning", "afternoon", "evening", "any"] as const;
export const DECISION_MAKERS = ["father", "mother", "both_parents", "guardian", "student", "other"] as const;
export interface LeadMoreDetails { altPhone: string | null; school: string | null; board: Board | null;
  hostel: HostelAnswer | null; targetExam: TargetExam | null; targetYear: number | null; heardVia: HeardVia | null;
  referredBy: string | null; intakeSession: SessionKey | null; preferredTime: PreferredTime | null;
  decisionMaker: DecisionMaker | null; updatedAt: string | null }

// Follow-ups
export const FOLLOW_UP_PRESETS = ["later_today", "tomorrow", "in_3_days"] as const;
export type NextFollowUp =
  | { kind: "preset"; preset: FollowUpPreset }
  | { kind: "at"; at: string /* ISO */ }
  | { kind: "none"; reason: "wrong_number" | "closing" | "has_other_task" };
export const NOT_REACHABLE_AFTER = 5;                                         // decision 9
export const HARD_CALL_WINDOW = { start: "08:00", end: "21:00" } as const;    // decision 9 outer limit (IST)
export interface AttemptSummary { calls: number; unansweredStreak: number; suggestNotReachable: boolean }
export interface FollowUpContext { now: string; presets: Record<FollowUpPreset, string>;
  suggested: { next: NextFollowUp; ruleKey: RhythmRuleKey } | null; attempts: AttemptSummary;
  openTask: { id: string; dueAt: string | null; title: string } | null; openTaskCount: number;
  outsideCallingHoursNow: boolean; callingHoursLabel: string; stage: LeadStage;
  templateSlots: TemplateSlotValues; defaultLang: TemplateLang }
export interface OutcomeInput {
  contact: { channel: "call" | "whatsapp"; outcome: ContactOutcome; note?: string | null;
             template?: { key: string; lang: TemplateLang } | null } | null;
  taskId?: string | null; next: NextFollowUp; nextTitle?: string | null; markNotReachable?: boolean;
  markLostWrongNumber?: boolean }
export interface OutcomeResult { activityId: number | null; task: LeadTask | null; completedTaskId: string | null;
  attempts: AttemptSummary; stage: LeadStage; outsideCallingHours: boolean }

// Templates — ONE slot registry for 1b, Phase 2 and Asha (names follow docs/admissions-agent-voice.md)
export const TEMPLATE_CONTEXTS = ["general", "booking", "test"] as const;   // open vocabulary
export const TEMPLATE_LANGS = ["en", "hi", "hinglish"] as const;
export const TEMPLATE_SLOTS = ["parent_name", "student_first_name", "counsellor_name", "centre", "centre_map_link",
  "prospectus_link", "date", "time", "test_date", "registration_deadline", "batch_start", "days", "test_name",
  "roll_no", "reporting_time", "venue", "admit_link", "bring_list", "meet_person"] as const;
export const AUTO_FILLED_SLOTS = ["parent_name", "student_first_name", "counsellor_name", "centre",
  "centre_map_link", "prospectus_link"] as const;   // 1b fills these; staff type the rest
export type TemplateKey = string;   // ^[a-z][a-z0-9_]{0,39}$, validated against crm_wa_templates
export const SEED_KEYS_1B = ["first_contact", "missed_call", "centre_location", "prospectus",
  "visit_invite", "test_date", "batch_start", "after_visit"] as const;
export type TemplateSlotValues = Partial<Record<TemplateSlot, string>>;
export interface WaTemplate { key: TemplateKey; context: string; position: number;
  status: "draft" | "approved" | "retired"; bodies: Record<TemplateLang, string>; version: number;
  seeded: boolean; approvedAt: string | null; approvedBy: string | null; updatedAt: string }

// Numbers and attention
export interface CentreRef { slug: string | null; label: string; demo: boolean }   // slug null = "No centre yet"
export interface CentreNumberLinks { today: string; week: string; notCalled: string; notCalledOver24h: string;
  overdue: string; admissions: string; sources: string }                          // locale-free hrefs
export interface CentreNumbers { centre: CentreRef; enquiriesToday: number; enquiriesWeek: number;
  toolSignupsWeek: number; importedWeek: number; erasedWeek: number; notCalled: number; notCalledOver24h: number;
  overdue: number; admissionsSession: number; sessionTarget: number | null;
  topSources: { channel: Channel; count: number }[]; enquiries30d: number; links: CentreNumberLinks }
export interface ConsoleNumbers { generatedAt: string; session: SessionRef; rows: CentreNumbers[];
  total: CentreNumbers; centreListIsDemo: boolean }
export const ATTENTION_KINDS = ["unassigned", "tool_signups", "not_called_24h", "overdue_by_counsellor", "lost_to_review"] as const;
export interface AttentionItem { kind: AttentionKind; count: number; href: string; userId?: string | null; name?: string | null }

// Console permissions (derived; never stored)
export interface ConsolePermissions { canViewNumbers: boolean; canEditTargets: boolean; canViewTargets: boolean;
  canViewSources: boolean; canSeeToolUsage: boolean; canEditCentreLinks: boolean; canReviewLost: boolean;
  canManageTemplates: boolean; canViewTemplateAdmin: boolean; canEditDetails: boolean }
export function consolePermissions(viewer: CrmViewer, p: CrmPermissions): ConsolePermissions;
```

`consolePermissions`: numbers, targets (read), sources, lost review, template admin (read) = CRM admin or manager; tool usage rows = CRM admin; targets edit, centre links edit, template manage = `p.isSuperAdmin`; details edit = true (lead visibility checked separately). Duplicate dismissal is decided per pair (§5.F).

### 4.2 Server helpers (1B-CORE)

- `src/lib/crm/console/session.ts` (pure): `sessionOf(ms)`, `sessionRef(key)`, `currentSession(now)`, `istDayStart(now)`, `istWeekStart(now)` (Monday 00:00 IST), `sessionsForPicker(now)` (previous 2, current, next 1).
- `src/lib/crm/console/channels.ts` (pure): `classifyChannel(row)` (§6.6); `AI_ASSISTANT_HOSTS`, `AI_ASSISTANT_UTM_SOURCES`, `isAiAssistantHost`, `isMapsSignal`, `SEARCH_ENGINE_HOSTS`, `hostMatches(host, list)` (equal or subdomain; port stripped); `gbpTaggedPath(centreSlug)`.
- `src/lib/crm/console/centres.ts`: `consoleCentres(db, locale)` → `CentreRef[]`: the union of content centres (`getCentres`), `crm_area_centres.centre_slug`, distinct `crm_areas.default_centre_slug`, and distinct `crm_leads.centre_slug`. Labels from content where available, else the slug in title case. `demo` follows `showPlaceholderContent()`. Also `viewerCentreSlugs(db, viewer)` for managers (LR `centresOfAreas` of responsible areas ∪ legacy `centreSlugs`).
- `src/lib/crm/repo/console-sql.ts` (strings only, **no imports**, so `repo/leads.ts` can import it without a cycle):
  - `EFFECTIVE_CENTRE_SQL` = `COALESCE(l.centre_slug, (SELECT a.default_centre_slug FROM crm_lead_routing r JOIN crm_areas a ON a.id = r.area_id WHERE r.lead_id = l.id))`;
  - `TOOL_SIGNUP_SQL` = `(EXISTS (SELECT 1 FROM crm_lead_routing g WHERE g.lead_id = l.id AND g.gate_only = 1) OR (NOT EXISTS (SELECT 1 FROM crm_lead_routing g2 WHERE g2.lead_id = l.id) AND l.source = 'tool' AND l.consent_text_version LIKE '%.gate.v%'))` — a tool sign-up in any area (sub-lines and `signups=hide`). The **queue** of unrouted tool sign-ups is LR's own `area=tool_signups` filter, used as is;
  - `IMPORTED_SQL` = `(l.source IN ('csv_import','paper_form') OR EXISTS (SELECT 1 FROM crm_external_refs x WHERE x.lead_id = l.id AND x.provider = 'csv' AND x.batch_id IS NOT NULL))`;
  - `TEST_LEAD_SQL` = `EXISTS (SELECT 1 FROM crm_activities e WHERE e.lead_id = l.id AND e.type = 'erase' AND json_extract(e.meta,'$.reason') = 'wrong_or_test')`, plus LR's Meta test-lead marker if LR records one (re-read `src/lib/crm/meta/`);
  - `NEVER_CONTACTED_SQL` = `NOT EXISTS (SELECT 1 FROM crm_activities ca WHERE ca.lead_id = l.id AND ca.type IN ('call','whatsapp'))`;
  - `ENROLLED_AT_SQL` = `(SELECT MAX(s.at) FROM crm_activities s WHERE s.lead_id = l.id AND s.type = 'stage_change' AND json_extract(s.meta,'$.to') = 'enrolled')`.
- `src/lib/crm/repo/console-core.ts`: `upsertAttribution`, `wipeDetailsPersonal`, `centreSlugsInLeads`, `areaDefaultCentres`.
- `src/lib/crm/repo/leads.ts` (edit): export `scopedLeadWhere(scope)` → `{ sql, values }` (wraps the private `scopeClause`; `"1=1"` for `all`); `countLeads(db, query)`; `countLeadsGrouped(db, query, by: "centre" | "assignee")` (groups by `EFFECTIVE_CENTRE_SQL` or `l.assigned_to`); the new `whereFor` clauses of §4.3.
- `src/lib/crm/console/counts.ts`: `countForFilters(viewer, filters: LeadFilters, now, by?)` = `buildLeadQuery(viewer, filters, now)` + `countLeads` / `countLeadsGrouped`; `inboxHref(filters)` = `/crm?` + the inbox query string. **Every dashboard number that links to the enquiries list is computed by `countForFilters` over the exact filters its link carries**, so the list shows the same count by construction.
- `src/lib/crm/console/atomic.ts`: `runAtomic<T>(db, fn: () => CrmResult<T>): CrmResult<T>` runs `fn` in `withTransaction`; `requireOk(result)` throws `ConsoleAbort(result)`, caught and returned after the rollback.
- `src/lib/crm/console/audit.ts`: `CONSOLE_AUDIT` (§9) and `consoleAudit(db, { actorId, action, target, details, now })` → `recordAudit`.
- `src/lib/crm/console/centre-links.ts`: `getCentreLinks(db)` / `putCentreLinks(db, input, { actorId, expectedVersion, now })` via LR `readSetting` / `writeSetting`; `validateMapsUrl`.
- `src/lib/crm/console/erase.ts`: `eraseConsoleData(db, lead, now)` (§3).
- `src/lib/crm/leads.ts` (edit): `logContact(viewer, leadId, input & { extra?: { template?: string; lang?: TemplateLang } }, now)` merges `extra` into the activity meta; the audit details gain `template` when present. `buildLeadQuery` maps the new filters (§4.3).

### 4.3 Inbox query additions (1B-CORE; parsed in `http.ts` `leadFiltersFromSearch` and `format.ts` `parseInboxFilters` / `inboxQuery` / `hasActiveFilters`, with chip labels)

| Param | Values | `LeadQuery` / SQL |
|---|---|---|
| `contact` | `none` | `neverContacted` → `NEVER_CONTACTED_SQL` |
| `signups` | `hide` | `excludeToolSignups` → `NOT TOOL_SIGNUP_SQL` |
| `created` | `today` / `week` / `over24h` | resolved with `now` in `buildLeadQuery`: `createdFrom = istDayStart(now)` / `istWeekStart(now)`; `over24h` → `createdTo = now − 24 h` |
| `centre` (changed) | slug / `none` | compares **`EFFECTIVE_CENTRE_SQL`** instead of `l.centre_slug` (`none` → effective centre IS NULL). An area-routed enquiry without a chosen centre now shows under its area's centre. Scope rules are unchanged |

Relative `created` values (not timestamps) keep links short and bookmarkable and put no dates in URLs.

### 4.4 Template drafts (seeded by 1B-CALLS, status `draft`, context `general`)

Written for staff to send as themselves (no AI disclosure). No fees, claims or dates: only slots. Hindi verbs avoid the counsellor's gender. All Hindi and Hinglish lines are machine drafts for `docs/hindi-review-register.md`.

| Key | English | Hindi | Hinglish |
|---|---|---|---|
| `first_contact` | Namaste {parent_name} ji, I am {counsellor_name} from Aspire IIT & Medical, {centre}. Thank you for your enquiry about coaching for {student_first_name}. When is a good time for a short call? You can also send your questions here. | नमस्ते {parent_name} जी, मैं {counsellor_name}, Aspire IIT & Medical ({centre}) से। {student_first_name} की कोचिंग के बारे में पूछताछ के लिए धन्यवाद। छोटी-सी बातचीत के लिए आपको कौन-सा समय ठीक रहेगा? अपने सवाल आप यहाँ भी भेज सकते हैं। | Namaste {parent_name} ji, main {counsellor_name}, Aspire IIT & Medical ({centre}) se. {student_first_name} ki coaching ke baare mein enquiry ke liye dhanyavaad. Ek chhoti si baat ke liye aapko kaunsa time theek rahega? Apne sawaal aap yahan bhi bhej sakte hain. |
| `missed_call` | Namaste {parent_name} ji, I am {counsellor_name} from Aspire IIT & Medical, {centre}. I called about {student_first_name}'s enquiry but could not reach you. Please tell me a time that suits you and I will call again. | नमस्ते {parent_name} जी, मैं {counsellor_name}, Aspire IIT & Medical ({centre}) से। {student_first_name} की पूछताछ के सिलसिले में फ़ोन किया था, पर बात नहीं हो पाई। अपनी सुविधा का समय बता दीजिए, उसी समय दोबारा फ़ोन करेंगे। | Namaste {parent_name} ji, main {counsellor_name}, Aspire IIT & Medical ({centre}) se. {student_first_name} ki enquiry ke silsile mein call kiya tha, par baat nahi ho paayi. Apni suvidha ka time bata dijiye, usi time dobara call karenge. |
| `centre_location` | Namaste {parent_name} ji, here is our {centre} centre on Google Maps: {centre_map_link}. Please send me a message before you come, so that someone is there to meet you. – {counsellor_name}, Aspire IIT & Medical | नमस्ते {parent_name} जी, Google Maps पर हमारा {centre} सेंटर: {centre_map_link}। आने से पहले एक मैसेज कर दीजिए, ताकि आपसे मिलने के लिए कोई मौजूद रहे। – {counsellor_name}, Aspire IIT & Medical | Namaste {parent_name} ji, Google Maps par hamara {centre} centre: {centre_map_link}. Aane se pehle ek message kar dijiye, taaki aapse milne ke liye koi maujood rahe. – {counsellor_name}, Aspire IIT & Medical |
| `prospectus` | Namaste {parent_name} ji, here is the Aspire IIT & Medical prospectus, as promised: {prospectus_link}. If you have questions after reading it, reply here or tell me a good time to call. – {counsellor_name}, {centre} | नमस्ते {parent_name} जी, जैसा कहा था, Aspire IIT & Medical का प्रॉस्पेक्टस यह रहा: {prospectus_link}। पढ़ने के बाद कोई सवाल हो, तो यहीं जवाब दीजिए या फ़ोन के लिए सुविधा का समय बताइए। – {counsellor_name}, {centre} | Namaste {parent_name} ji, jaisa kaha tha, Aspire IIT & Medical ka prospectus yeh raha: {prospectus_link}. Padhne ke baad koi sawaal ho, to yahin reply kijiye ya call ke liye suvidha ka time bataiye. – {counsellor_name}, {centre} |
| `visit_invite` | Namaste {parent_name} ji, you are welcome to visit our {centre} centre with {student_first_name} on {date} at {time}. You can meet a counsellor, see the centre and ask anything. Location: {centre_map_link}. Please reply to confirm. – {counsellor_name}, Aspire IIT & Medical | नमस्ते {parent_name} जी, {date} को {time} बजे {student_first_name} के साथ हमारे {centre} सेंटर आइए। आप काउंसलर से मिल सकते हैं, सेंटर देख सकते हैं और जो चाहें पूछ सकते हैं। लोकेशन: {centre_map_link}। आने की पुष्टि के लिए जवाब दीजिए। – {counsellor_name}, Aspire IIT & Medical | Namaste {parent_name} ji, {date} ko {time} baje {student_first_name} ke saath hamare {centre} centre aaiye. Aap counsellor se mil sakte hain, centre dekh sakte hain aur jo chahein pooch sakte hain. Location: {centre_map_link}. Aane ki confirmation ke liye reply kijiye. – {counsellor_name}, Aspire IIT & Medical |
| `test_date` | Namaste {parent_name} ji, the next Aspire scholarship test is on {test_date}. If you would like to register {student_first_name} or have any questions, please reply here. – {counsellor_name}, Aspire IIT & Medical, {centre} | नमस्ते {parent_name} जी, Aspire का अगला स्कॉलरशिप टेस्ट {test_date} को है। {student_first_name} का रजिस्ट्रेशन करवाना हो या कोई सवाल हो, तो यहीं जवाब दीजिए। – {counsellor_name}, Aspire IIT & Medical, {centre} | Namaste {parent_name} ji, Aspire ka agla scholarship test {test_date} ko hai. {student_first_name} ka registration karwana ho ya koi sawaal ho, to yahin reply kijiye. – {counsellor_name}, Aspire IIT & Medical, {centre} |
| `batch_start` | Namaste {parent_name} ji, a new batch starts at our {centre} centre on {batch_start}. If {student_first_name} would like to join, or you want more details, reply here and I will call you. – {counsellor_name}, Aspire IIT & Medical | नमस्ते {parent_name} जी, हमारे {centre} सेंटर में नया बैच {batch_start} से शुरू हो रहा है। अगर {student_first_name} जुड़ना चाहें या आपको और जानकारी चाहिए, तो यहीं जवाब दीजिए, हम आपको फ़ोन करेंगे। – {counsellor_name}, Aspire IIT & Medical | Namaste {parent_name} ji, hamare {centre} centre mein naya batch {batch_start} se shuru ho raha hai. Agar {student_first_name} judna chahein ya aapko aur jaankari chahiye, to yahin reply kijiye, hum aapko call karenge. – {counsellor_name}, Aspire IIT & Medical |
| `after_visit` | Namaste {parent_name} ji, thank you for visiting our {centre} centre today with {student_first_name}. If any question comes up at home, just message me here. – {counsellor_name}, Aspire IIT & Medical | नमस्ते {parent_name} जी, आज {student_first_name} के साथ हमारे {centre} सेंटर आने के लिए धन्यवाद। घर पर कोई भी सवाल आए, तो यहीं मैसेज कर दीजिए। – {counsellor_name}, Aspire IIT & Medical | Namaste {parent_name} ji, aaj {student_first_name} ke saath hamare {centre} centre aane ke liye dhanyavaad. Ghar par koi bhi sawaal aaye, to yahin message kar dijiye. – {counsellor_name}, Aspire IIT & Medical |

## 5. Feature specs

**Common UI rules for every new screen:**
- **Layout:** 16 px gutter on phones, no horizontal page scroll; tables become one card per row below `md`; on tablets (768–1023 px) tables sit in a focusable scroll region (`tabIndex=0`, `role="region"`, `aria-label`) with a sticky first column.
- **Tables and numbers:** every table has a `<caption>` and header `scope`; numbers right-aligned with `tabular-nums`; rates always "x of y (z %)", never a bare percentage.
- **Status:** never colour alone (icon plus text); saved/error messages use `role="status"` / `role="alert"`.
- **Controls and dialogs:** targets ≥ 44 px (`min-h-11`); dialogs use the existing `CrmDialog` (focus trap, Esc, focus return) and are full-height sheets on phones; every field has a visible label; errors linked with `aria-describedby`. A control that is not ready is a `<button aria-disabled="true">` with the reason in text, never a disabled-looking link.
- **Content states:** an empty state says what to do; preview mode shows "—"; loading uses `GateFallback`.
- **Language:** English and Hindi for staff pages; English only for owner-only technical pages (decision 5).

### A. Dashboard: five numbers by centre, Needs attention, role homes (1B-NUMBERS; role-home route is 1B-CORE)

**`CentreNumbers`** (server component, prop `variant: "admin" | "crm"`):
- `/admin` (CRM admins and super admins: every centre), `variant="admin"`;
- top of LR's `/crm/dashboard` (managers: their centres; admins: every centre), `variant="crm"`.

Layout (desktop and tablet: a table with one row per centre plus **Total**; phones: one card per centre):
1. *Enquiries* — `admin`: today / this week; `crm`: this week only (LR's dashboard already shows today's arrivals). Small line: "incl. 12 free-tool sign-ups · 40 imported", and "3 more since erased" (not linked) when > 0.
2. *Not yet called* — small linked line "9 waiting over 24 h".
3. *Overdue follow-up tasks* (this exact label; LR's tile is "Overdue first calls" — 1B-CORE renames LR's label in `crm.ts` if it is not already distinct).
4. *Admissions this session* — "23 of 60 (38 %)", or "23 · No target set" plus a "Set targets" link for super admins.
5. *Top sources (30 days)* — up to 3 chips with counts; "Too few enquiries to rank" under 5.

Each number links to its list (§6.1). Header line: "Session 2026–27 · as of 10:42 IST"; in demo mode "Demo centre list: the real list is pending (decision 7)".

**`NeedsAttention`** (server component, same `variant`): rows with count > 0 only; each row a link with its count; "Nothing needs attention right now." when all are 0.
- `variant="admin"`: unassigned · free tool users waiting · not called within 24 h · overdue follow-up tasks per counsellor (top 8, then "Everyone") · lost enquiries to review.
- `variant="crm"`: not called within 24 h · overdue per counsellor · lost to review. Unassigned and tool sign-ups are **not repeated** there (LR's "Unassigned in areas" and "Tool sign-ups" tiles show them).

Preview mode on `/admin`: both sections render "—" with "Preview · no live data" and never touch the database.

**Role homes (1B-CORE):** `src/app/[lang]/(portal)/crm/home/route.ts` answers GET with a 307:
- CRM admin → `/admin`; manager → `/crm/dashboard`; counsellor → `/crm/today`;
- staff with an active `qb_members` row and no CRM membership → `/admin/questions` (closes QB's known limitation);
- other signed-in staff without membership → `/crm` (shows "ask an admin");
- signed out → login with `next=/crm/home`.
- `PORTAL_HOME.staff` becomes `/crm/home` (LR set `/crm/today`). Phase 2 adds front desk → `/crm/desk` in this file.

**Server (1B-NUMBERS):** `src/lib/crm/console/dashboard/numbers.ts` `consoleNumbers(viewer, now) → ConsoleNumbers`; `attention.ts` `needsAttention(viewer, now, variant) → AttentionItem[]`; extra SQL (sub-lines, admissions, targets, top sources) in `src/lib/crm/repo/console-numbers.ts`. Linked numbers use `countForFilters` only.

**Tests:** every formula of §6.1–6.2 on a fixture database (erased stub, test-erased lead, tool sign-up in an area and unrouted, import, area-routed lead with no centre, "No centre yet" row, Monday 00:00 IST week boundary, 1 April IST session boundary, intake session overriding enrolment date, "No target set" vs "n of T"); **link round-trip:** for every linked number and attention row, `leadFiltersFromSearch(new URL(href).searchParams)` deep-equals the filters used to count, and the inbox list total for that href equals the number; manager scope (own centres only); `variant="crm"` hides today and the LR-covered rows; counsellors cannot open `/admin`; preview render; `/crm/home` redirects per role (CORE).

### B. Targets and Admissions done (1B-NUMBERS)

**Targets** (`/crm/targets`; nav "Targets" in the Manage group, managers and admins):
- **Who:** super admins edit; admins and managers read (managers: own centres' rows); counsellors get `NotAllowed`.
- **Session picker:** previous 2, current, next.
- **Grid:** one row per centre; columns JEE · NEET · Foundation · Integrated · Any programme · **Total** (computed); integer inputs (`inputMode="numeric"`, 0–100000), empty = not set. "Show optional targets" reveals the same grid for *enquiries* and *counselling*.
- **Saving:** `PUT /api/crm/targets` `{ period, metric, cells[], expectedUpdatedAt }`; one transaction replaces every cell of that period and metric; stale `expectedUpdatedAt` → 409 `version_conflict` "Someone else changed these targets. Reload."
- **Read-only view:** plain numbers with LR's `ReadOnlyNotice`. **Empty:** "No targets for 2026–27 yet" (super admin: "Enter them below").

**Admissions done** (`/crm/admissions`; nav "Admissions done", every CRM role):
- **Scope:** counsellors own, managers their scope, admins all. **Filters:** session picker, centre (effective centre).
- **Summary:** centre × programme counts with totals and the session target beside each total when set.
- **List:** name (or "Erased lead"), centre, programme, class, counsellor, admitted on, channel; names link with `?back=/crm/admissions?session=S2026` (back kind `admissions`, 1B-CORE); 50 per page.
- **Empty:** "No one has been marked Admitted for 2026–27 yet. Admissions are counted when an enquiry is moved to Admitted."

**Server/API:** `targets.ts` `getTargets`, `putTargets` (super admin), `sessionTargetFor(db, centre, session)`; `admissions.ts` `admissionsDone(viewer, session, centre, page)` — the dashboard's number 4 calls the same query, so the page matches by construction. `GET|PUT /api/crm/targets?period=S2026`.

**Tests:** PUT super-admin only (admin 403, manager 403); zod (unknown centre slug allowed; programme and metric enums; negatives; month periods refused in 1b); version conflict; audit `settings.targets_update {period, metric, cells}`; admissions scope, session attribution, erased stubs counted but nameless; back link.

### C. One-step call outcome, task done asks the outcome, rhythm, attempt counter (1B-CALLS)

**`CallOutcomeDialog`** (client) opens from:
- **Log a call** in `ContactActions`;
- **`CallReturnPrompt.tsx`** after a `tel:` call (the `tel:` tap itself only marks the call, as today; the dialog never opens on the tap);
- every task's **Done** button, on the lead page and on Today's calls (with `taskId`).

It fetches `GET /api/crm/leads/[leadId]/outcome` (`FollowUpContext`) on open.

1. **Header:** family name, then "Attempt 4 · 3 unanswered in a row" (text, not a coloured badge).
2. **What happened** (radio group, large tiles): Spoke to them · No answer · Busy · Phone switched off · Asked us to call back · Wrong number. From a task, a seventh tile: **"No call needed (task done)"**.
3. **Note** (optional, ≤ 2000 characters).
4. **Next follow-up** (required radio group): *Later today* (resolved time shown, e.g. "Today 4:10 pm"), *Tomorrow* ("Thu 10:00 am"), *In 3 days*, *Pick a time* (date + time in IST). The suggested option is pre-selected with its hint ("Suggested: day 5 after first contact"). When the lead has another open task, "Keep the existing follow-up (due Fri 11 am)" is offered (→ `none / has_other_task`). **Wrong number** hides the picker and shows "Mark lost: wrong number" (ticked). Outside LR's calling hours → warning "Outside calling hours (9 am–7 pm). Save anyway?"; outside 08:00–21:00 IST → refused "No calls before 8 am or after 9 pm."
5. **Not reachable hint** when `unansweredStreak + (this outcome unanswered ? 1 : 0) ≥ 5`: "5 calls in a row without an answer. Mark as not reachable?" (checkbox → `markNotReachable`; counsellors may use it, decision 10).
6. **Save:** result announced via `role="status"`, dialog closes, `router.refresh()`, focus returns to the opener.

**Server** (`src/lib/crm/console/followup/outcome.ts`): `recordOutcome(viewer, leadId, input, now)` in `runAtomic`, **in this order**:
1. `taskId` given → `completeTask(viewer, taskId)`; the task must belong to `leadId` (else 422).
2. Unless `next.kind === "none"` or a lost mark is set: resolve the time (`resolvePreset` or `at`), check the hard window, `createTask(viewer, leadId, { title: nextTitle ?? defaultTitle(outcome, locale), dueAt })`.
3. `contact` given → `logContact(viewer, leadId, { channel, outcome, body: note, extra: { template, lang } })`. LR's SLA hook runs; its automatic retry is skipped because step 2 already created an open task.
4. `markNotReachable` / `markLostWrongNumber` → `changeStage(viewer, leadId, "lost", "not_reachable" | "wrong_number")` (re-read LR's lost-reason list; report if a value is missing).
5. Return `OutcomeResult`.

Validation: `next.kind === "none"` only when the outcome is wrong_number, a lost mark is set, the lead is enrolled or lost, or the lead has another open task; else 422 `{ next: ["Choose when to follow up."] }`. `contact: null` requires `taskId`.

**Presets** (`presets.ts`, pure; LR's calling-hours helpers with `getCallingHours(db)` and `getSpeedRule(db)` from `src/lib/crm/settings.ts`; re-read exact names):
- `later_today` = `addWorkingMinutes(now, speedRule.retry.firstAfterMinutes)` (default 120; re-read the field name).
- `tomorrow` = first open calling day after today's IST date, at the family's preferred window (morning = opening; afternoon = max(opening, 13:00); evening = max(opening, 16:30); none = opening + 60 min), clamped to ≥ 30 min before closing.
- `in_3_days` = same rule for the first open day on or after today + 3.

**Rhythm** (`rhythm.ts`, pure, decision 9):

| After this contact | Suggestion | Rule key |
|---|---|---|
| no_answer / busy | `later_today` | `retry` |
| switched_off | `tomorrow` | `switched_off` |
| call_back_requested | Pick a time (picker focused) | `call_back` |
| wrong_number | none + mark lost | `wrong_number` |
| connected, stage `contacted` (or new → contacted) | day 2, then 5, then 10 after the first connected call, at the preferred window; past day 10 → `in_3_days` | `contacted_d2` / `_d5` / `_d10` |
| connected, `counselling_booked` | `tomorrow` | `booked` |
| connected, `visited_or_demo` | `tomorrow` if no follow-up since the visit, else `in_3_days` | `after_visit_d1` / `_d3` |
| connected, `applied` / `test_taken` / `offer` | `tomorrow` (offer call within 48 h) | `after_test` |
| enrolled / lost | none | `closed` |

**Attempts** (`attempts.ts`, pure, over the lead's `call` activities, newest first): `calls` = count; `unansweredStreak` = consecutive calls with no_answer, busy or switched_off back to the latest call or WhatsApp with connected, call_back_requested or message_sent; `suggestNotReachable` = streak ≥ 5.

**API:** `GET /api/crm/leads/[leadId]/outcome` → `FollowUpContext` (a read; no transaction; slot values only for viewers who see the lead). `POST` same path, `OutcomeInput` → `OutcomeResult`.

**Tests:** ordering and atomicity (our task created before `logContact`, so exactly one open task after a no-answer call, **with the real LR-SLA module**; a failure in step 3 rolls back 1–2); task completion; "no call needed" with `contact: null`; 422 without a next follow-up; hard window refuses 21:30; outside calling hours accepted with `outsideCallingHours: true`; not reachable → lost (not_reachable) and LR's clock closed; presets (18:30 → next morning; Sunday short hours; closed dates; preferred window); every rhythm row; streak reset after connected; a counsellor cannot complete another person's task on a lead they cannot see; MCP-logged contacts unchanged; UI: dialog markup, radio labels in both languages, focus return; `CallReturnPrompt` and both Done buttons open the dialog; one dialog per tel: tap.

### D. WhatsApp templates (1B-CALLS)

**`WhatsAppComposer`** (client, a `CrmDialog`) opens from the WhatsApp button in `ContactActions` (replacing the bare wa.me link and the old WhatsApp path into `LogContactDialog`).

*Step 1 — compose:*
1. **Template list:** approved templates with `context = 'general'` only, as radio cards with purpose labels, plus **"Write my own message"**. With none approved: "No approved templates yet. The owner is reviewing 8 drafts." (own message still works).
2. **Language:** English / हिंदी / Hinglish; default Hindi if the family's latest submission had `locale: "hi"`, else English.
3. **Text:** editable textarea pre-filled with auto-filled slots; unfilled slots stay as `{test_date}` and are listed under the box ("Fill in: test date, batch start").
4. **Open WhatsApp:** while any `{slot}` remains or the text exceeds 1000 characters, a `<button aria-disabled="true">` explains what is missing. When ready, an `<a href="https://wa.me/<digits>?text=<encoded>" target="_blank" rel="noopener noreferrer">`. Clicking it **logs nothing**: it stores `{ leadId, templateKey | null, lang, openedAt }` in sessionStorage (`wa-return.ts`, reusing `sessionStore` from `src/components/crm/call-return.ts` and its expiry) and moves the dialog to step 2.

*Step 2 — "Did you send it?"* (shown in the open dialog and, if the page was reloaded or the tab was discarded, by `WaReturnPrompt` from the stored mark when the lead page regains focus):
- **"Yes, I sent it"** reveals the next follow-up picker (§5.C; default "Keep the existing follow-up" when the lead has an open task, else *Tomorrow*) and **Save** → `POST …/outcome` `{ contact: { channel: "whatsapp", outcome: "message_sent", template: { key, lang } | null }, next }`. Status: "Logged: you sent 'Missed call' on WhatsApp."
- **"No, I didn't send it"** clears the mark and logs nothing ("Nothing was logged.").

Opening WhatsApp without confirming therefore leaves LR's 1-hour clock running, creates no task and adds nothing to counsellor activity.

**Slot filling** (`fill.ts`, pure): `parent_name` = guardian name, else contact name; `student_first_name` = first word of the student name; `counsellor_name` = viewer display name; `centre` = centre label in the chosen language; `centre_map_link` = `centre_links`; `prospectus_link` = `wa_links`; every other slot is typed by staff (Phase 2's fact sheet fills more). Values have control characters stripped and are ≤ 120 characters.

**`/crm/templates`** (nav "WhatsApp templates" in the Manage group, managers and admins):
- **Who:** super admins edit, approve, retire, set the prospectus link; admins and managers read with status; counsellors don't get the page.
- **Card per template:** status chip ("Awaiting approval" / "Approved on 23 Oct by …" / "Retired"), the three bodies each with a sample-slot preview.
- **Edit:** one language at a time, `PUT /api/crm/templates/[key]` `{ lang, body, expectedVersion }`; body ≤ 700 characters, only known `TEMPLATE_SLOTS` names, must not start or end with a slot; editing an approved template returns it to `draft`.
- **Approve / Retire / Back to draft:** `POST /api/crm/templates/[key]/status` `{ status, expectedVersion }`.
- **Prospectus link:** `PUT /api/crm/templates/links` `{ prospectusUrl, expectedVersion }`.

**Seeding:** `ensureTemplatesSeeded(db, now)` on the first templates read: a lock-free `SELECT key FROM crm_wa_templates`; only if a seed key is missing, one `withTransaction` runs `INSERT OR IGNORE` for each missing key. No marker, no audit, no activity rows. Phase 2 adds its keys the same way.

**API:** `GET /api/crm/templates?context=general` → approved templates of that context for everyone; `?all=1` → every template for admins, managers and super admins. Plus the three write routes (super admin).

**Tests:** seeds once (two concurrent first reads → 8 rows, no error); per-key seeding adds a new key to an existing table; no audit on seed; drafts and non-general contexts not offered to counsellors; approval and edits super-admin only; editing approved → draft; unknown slots rejected; filling uses the right language for the centre label; leftover slots keep the button `aria-disabled`; wa.me text encoded (Hindi round-trip); **opening without confirming leaves the SLA clock open and creates no task or activity**; "Yes, I sent it" logs `message_sent` with meta `{ template, lang }`; erase keeps `template`; no UI string says the system sent or delivered anything.

### E. More enquiry details (1B-FAMILY)

**`LeadMoreDetails`** (server component in a 1B-CORE slot under "Details"):
- **Read view:** definition list; the second number has `tel:` and wa.me links like the main phone; missing values "Not recorded". LR's area and place shown read-only ("District (from routing): … · typed: …", values from LR data at run time); changed only via LR's "Change area".
- **Edit details** (`DetailsForm` dialog): second phone / WhatsApp (same Indian-mobile normaliser as Add enquiry; may not equal the main number); school (≤ 120); board (select); hostel (radio Yes / No / Maybe); target exam (select) and year (current to +4); how they heard (select); referred by (≤ 80); joining session (current, next, "Not decided"); preferred call time (radio); who decides (select).
- **Save:** `PUT /api/crm/leads/[leadId]/details`, partial strict body; timeline entry `field_update { fields: ["details.school", …] }` (1B-CORE adds the `details.*` labels); audit `crm.lead_details_update { fields }`.
- **Who:** anyone who can see the lead; erased leads → 409.

**Tests:** phone normalising and equal-number refusal; zod enums; partial update; scope (404 for an unseen lead); erase wipes second phone, school, referred-by and keeps `heard_via` and the intake session; timeline labels in both languages; audit has no values.

### F. Duplicate suggestions (1B-FAMILY)

**`DuplicateSuggestions`** (server component in a 1B-CORE slot at the top of the lead page; renders only when matches exist):
- **Header:** "Possible duplicates (2)". **Each match:** name, stage, centre, assignee, created date and reason ("Same second number" / "Their main number is this family's second number" / "Same name, class and centre").
- **Actions:** **Open** (link with back to this lead); **Not the same family** → `POST /api/crm/leads/[leadId]/duplicates {otherLeadId, action:"dismiss"}`, allowed only when the viewer **can see both leads** (`canSeeLead` on each) and is the assignee of either, a manager or an admin; **Mark this one lost as duplicate** (existing stage change, reason `duplicate`).
- **Matching** (`duplicates.ts`): other non-erased leads the viewer can see, minus dismissed pairs, where (a) `cand.phone = this.alt` or `cand.alt = this.phone` or `cand.alt = this.alt` (non-null); or (b) `normName(cand.student_name) = normName(this.student_name)` and same `current_class` and equal non-null effective centre (`normName` = NFKC, lower case, collapsed and trimmed whitespace). At most 5. Unseen leads are never mentioned.

**Tests:** each rule; dismissal symmetric and permanent; scope (unseen candidate never returned; dismissing with an unseen `otherLeadId` → 404); erased excluded; audit `crm.duplicate_dismiss`.

### G. Counsellor activity (1B-NUMBERS; a section in Reports)

Reports gets "Counsellor activity" for the page's date range: Calls · Connected (x of y) · WhatsApps sent (confirmed) · Follow-ups done · Active days · Calls per active day · Open enquiries now · Admissions (in range). Managers and admins see one row per staff member in scope; counsellors see only their own row, headed "Your numbers". "First-call speed" links to LR's dashboard. Footnote when relevant: "Includes contacts logged through AI assistant access."

**Server:** `activity.ts` `counsellorActivity(viewer, range)` (§6.4). **Tests:** formulas; scope (activity on out-of-scope leads not counted for managers); counsellor sees own row only; MCP-logged calls counted with the footnote.

### H. Lost review (1B-FAMILY)

**`/crm/lost`** (nav "Lost enquiries to review" in the Manage group; admins everything, managers their scope):
- **Filters:** last 7 / 14 / 30 days (default 14); counsellor.
- **Table:** family (link with `back=/crm/lost`), lost on, reason, marked by, calls made, last call outcome, days since the enquiry.
- **Keep lost** → `POST /api/crm/lost-review/[leadId] {lostAt, decision:"kept"}`.
- **Reopen…** → dialog: "Move back to" (default the `from` stage of the lost change; never `enrolled`), "Assign to" (current assignee or another eligible person via LR's `assignableMember`), "Follow up" (default tomorrow). Server: `runAtomic` → `changeStage(from)` → optional `assignLead` → `createTask` → insert `crm_lost_reviews (decision 'reopened')`.
- **Below:** "Lost reasons by counsellor" (reason × person for the range).
- **Empty:** "No lost enquiries to review in the last 14 days."

**Tests:** only unreviewed lost events in the window (a lead lost twice → two events); keep and reopen; reopen atomic; counsellor 403; manager scope; audit `crm.lost_review {decision}`.

### I. Preset views and tidy filters (1B-FAMILY; `InboxView.tsx`)

| Preset | Query | Who sees it |
|---|---|---|
| My new | `assignee=me&stage=new` | everyone |
| Not called yet | `stage=new&contact=none&signups=hide` | everyone |
| Due today | `due=today` | everyone |
| Overdue | `due=overdue&stage=open` | everyone |
| Unassigned | `assignee=unassigned&stage=open&signups=hide` | managers and admins |
| This centre | `centre=<slug>` (effective centre) | one chip per centre in scope, when 4 or fewer |
| Free tool users | `area=tool_signups&stage=open` (LR filter) | super admins and admins |

The active preset has `aria-current="page"`. The filter form folds into a disclosure "Filters (2 on)", closed below `lg`, open at `lg`+. Each active filter is a chip link "Stage: New ×" to the same query without that parameter (`aria-label` "Remove filter Stage: New"); "Clear all" resets.

**Tests:** every preset round-trips through `parseInboxFilters` and `leadFiltersFromSearch`; chip remove links; role gating; markup in both languages.

### J. Where enquiries come from, AI assistants, Google Maps, Free tools & Rancho, Search overview (1B-SOURCES)

**`/crm/sources`** (nav "Where enquiries come from", sidebar group **Lead generation**; admins everything, managers own scope read-only, counsellors not allowed):
- **Controls:** range (last 30 days / 90 days (default) / this session / custom; `range=30d|90d|session` or `from`/`to` dates) and centre (effective centre).
- **Counting note at the top:** "Counts include enquiries that were later erased (only their non-personal origin is kept), so they can be higher than the Enquiries list."
- **Sections** (heading each; in-page link list; tables with "x of y"):
  1. **Channels:** enquiries · reached counselling · admitted; an "AI assistants" row with "Counted when the AI app passes on its address (ChatGPT, Perplexity, Gemini, Copilot, Claude …). Many visits from AI apps arrive without it and appear as Direct."; a "Google Maps" row.
  2. **Google Maps, all signals:** tagged GBP visits plus families who said they heard via Google Maps, de-duplicated per lead; the **Centre links** card (per centre: Maps link, super admins edit via `PUT /api/crm/settings/centre-links`; tagged website link with a copy button); warning "Add this link to the centre's Google Business Profile only after the website's final domain is live (decision 17)."
  3. **AI assistants, all signals:** referrer and UTM plus staff-recorded "heard via an AI assistant".
  4. **Campaign tags:** `utm_campaign` with its most common source/medium, top 20 plus "Other".
  5. **Referring websites:** host (kept after erase), top 20; AI hosts flagged.
  6. **Landing pages:** `page`, top 20.
  7. **How they heard (recorded by staff):** `heard_via`, including "Not recorded".
  8. **Free tools & Rancho** (§6.7): contact-form status ("Required before results" / "Optional" / "Off: <reason>"); enquiries per tool (Rancho by name); tool use per day for 14 days as a table plus a small inline-SVG bar chart (dataviz skill rules, project tokens, both themes, visually hidden data table); footnotes; link to "Free tool users". Usage rows admins only; managers see enquiries per tool in scope.
  9. **Weekly trend:** IST weeks (Monday start), last 12 weeks or the range: top 5 channels plus "Others", as a table plus small-multiples bars.
- **Empty:** "No enquiries in this range."

**`/admin/search`** (admins; English only; sidebar group **Google & AI search** › "Search overview"): indexing state ("Hidden from Google (demo mode)" / "Open to search engines", the same `showPlaceholderContent()` check `robots.ts` uses); enquiries from search engines, Google Maps (all signals) and AI assistants (all signals) for 30 and 90 days, each with reached counselling and admitted; the note "AI answers (ChatGPT, Gemini, Google AI Overviews) cannot be measured directly; this counts only families who arrived from them. Full search tools come at go-live (Phase 4)."; a link to `/crm/sources`.

**Server:** `sources.ts`, `tools.ts`, `search.ts`; read-only SQL in `repo/console-sources.ts` (also SELECTs `mocktest_attempt_meta`, `planner_daily`, `ask_usage`; imports `usageKeyHash` from `@/lib/ask/usage`). **API:** `GET /api/crm/sources?range|from&to&centre`; `GET|PUT /api/crm/settings/centre-links` (PUT super admin, `expectedVersion`).

**Tests:** every classifier rule (§6.6) incl. `chat.openai.com`, `utm_source=chatgpt.com`, `maps.app.goo.gl`, `utm_medium=gbp`, `lead_ad`, `ask` → Rancho, `www.google.co.in`, `wa.me`, host with port, `paper_form`, `scholarship_test`; referrer host survives erase and is counted; rates when y = 0; manager scope; counsellor 403; Rancho counts read only the global key for today and yesterday; planner distinct users; mock tests saved attempts; centre-links validation and super-admin-only PUT; weekly buckets at the Monday IST boundary; chart has an accessible table.

### L. People list and AI assistant wording (1B-HOUSEKEEPING)

**`/admin/users`** (`UserManager.tsx`; LR has added the super-admin badge and Grant/Revoke):
- **Filter chips:** All / Staff / Admins / Students / Parents with counts.
- **Staff rows:** CRM role ("Counsellor (executive)" / "Area head (manager)"), CRM access active/inactive, areas (LR names), legacy centre scope, "Away until 25 Oct" (LR), open enquiries; links "Areas & people" → `/crm/settings/areas`, "Rules" → `/crm/staff`.
- **Create account, role Staff** (super admin, per LR): **CRM role required, no preselection**; areas multi-select (from `GET /api/crm/areas`; optional, with "No areas: this person will get no enquiries and, as area head, will see only enquiries assigned to them").
- **API** (`POST /api/admin/users`): staff without `crm.crmRole` → 422 `{ crm: ["Choose the CRM role."] }`; the silent "counsellor, every centre" default is removed. `GET` enriches `crm` with `{ areaIds, areaNames, awayUntil, openLeads }`. Grep every caller of `/api/admin/users`; fix LR's `PeoplePicker.tsx` request body if it lacks the role.

**AI assistant access wording:** `portal.nav.mcp` = "AI assistant access" (1B-CORE). `{en,hi}/mcp.ts` titles "AI assistant access"; intro "Let an AI assistant such as Claude look things up or add notes for you. You choose what it may see or change, service by service."; plain service names (Site status · Accounts · Student progress · Activity log · Website content · Enquiries (admissions)). MCP descriptions in `tools/status.ts` and `tools/progress.ts` say "Rancho (the AI doubt solver)" instead of "Ask Aspire"; data keys unchanged.

**Tests:** 422 without a role; GET enrichment; people-ui markup (role, areas, away); no "Ask Aspire" in MCP descriptions; mcp messages en/hi same shape.

### M. Site status and go-live summary (1B-HOUSEKEEPING; `/admin/status`, admins, English only)

`src/lib/console/status.ts`; every value in try/catch → "Unknown"; nothing secret or path-like shown.

| Row | Value |
|---|---|
| Content mode | Demo / Production (`showPlaceholderContent()`) |
| Google indexing | "Blocked (demo)" / "Allowed" |
| Enquiries | "Saved as CRM leads" plus webhook connected or not (`parseEnquiryStore`, `parseEnquiryDestination`, `getEnquiryDeliveryStatus`) |
| Contact form before tools | `getLeadGateConfig().mode` plus off reason |
| Rancho | configured or not |
| Meta lead ads | LR status line, linking to `/crm/settings/integrations` (if LR built it) |
| Super admins | count (LR) |
| Release | `process.env.RELEASE` (first 7 characters) or "Unknown" |
| Database size | `statSync(db) + statSync(db-wal)` in MB |
| Free disk | `fs.statfsSync(dirname(dbPath))`; **warns under 3 GB**: "Under 3 GB free: do not start a release build (a build needs about 2.6 GB)". "Last disk check: …" from `/data/ops/disk-status.json` if present |
| Pre-release database snapshots | "Taken on the server before each release, on the same disk. Not an off-server backup." |
| Off-server backups | **"Not set up (deferred by owner, 21 Oct 2026)."** |

**Go-live summary** (`src/lib/console/go-live.ts`, static, dated 22 Oct 2026; `docs/` is not in the image):

| Item | Refs | Status |
|---|---|---|
| Named results and photos: consent recorded | RC-1, RE-2–RE-4 | Open |
| Consent wording and privacy notice reviewed by legal | FP-3, FP-6, FP-11, CRM-2 | Open |
| Centre facts verified | CE-1–CE-7, decision 7 | Open |
| Programmes and figures verified | PR-2–PR-4, ST-1–ST-5 | Open |
| Production domain final | HE-9, decision 17 | Open |
| WhatsApp templates approved | WA-1–WA-8 | Open |
| Off-server backups | — | Deferred |
| Leave demo mode | — | From the live mode |
| Search indexing on the real domain | — | Phase 4 |

Note: "This list is a summary from the approval checklist (22 Oct 2026). It does not update itself until Phase 3a." Preview mode renders "—". No "webhook test" button.

**Tests:** each row with mocked env and fs; failure → "Unknown"; no absolute path or secret in output; the 3 GB threshold; go-live statuses.

### N. Readable activity log (1B-HOUSEKEEPING)

- **Label registry** `src/components/portal/audit-labels.ts`: English-only map code → `{ label, detail?(details) }` for every code in use: `auth.*` (incl. LR `super_admin_*`), `admin.*`, `seed.*`, `bootstrap.*`; every `CRM_AUDIT` value (incl. LR's area_*, lead_reroute, bulk_reassign, availability, settings_update, import_start, import, meta_*); `mcp.token_create` / `token_revoke` / `call`; every `QB_AUDIT_ACTIONS` value plus `src/app/api/admin/qb/_lib/http.ts` codes; `admin.mocktest_profile_remove`, `seed.report`; every `CONSOLE_AUDIT` value.
- **Lookup order:** existing translated `ACTION_KEYS`, then the registry, then the raw code.
- **Grouping** `src/components/portal/audit-group.ts` `groupAuditRows(rows, { windowMs: 30*60_000, actions: ["crm.lead_view", "mcp.call"] })` merges consecutive rows with the same actor and action into "Viewed 7 enquiries · 10:02–10:31" with a `<details>` listing each entry (time, target id). **Nothing is deleted.**
- **Tests:** registry completeness (imports `CRM_AUDIT`, `QB_AUDIT_ACTIONS`, `CONSOLE_AUDIT`, LR's super-admin audit constants and the MCP codes; asserts every value has a label); grouping (window edge, actor change, other actions breaking a group, counts preserved); markup.

## 6. Metric definitions (exact)

All times IST (UTC+05:30). `todayStart` = `istDayStart(now)`; `weekStart` = `istWeekStart(now)` (Monday); session `S(y)` = `[y-04-01T00:00+05:30, (y+1)-04-01T00:00+05:30)`.

**Two populations:**
- **Inbox-linked numbers** = `countForFilters(viewer, F, now)` for the exact filters `F` in the link: the viewer's scope, **live leads only** (the inbox hides erased leads; test leads are erased, so they are out too).
- **`P_all(viewer)`** (admissions, top sources, sources page, erased note) = `crm_leads l` with `scopedLeadWhere(leadScopeFor(viewer))` and `NOT TEST_LEAD_SQL`, **erased stubs included**.

`centreOf(l)` = `EFFECTIVE_CENTRE_SQL` (null → "No centre yet"). Per-centre row filters add `centre=<slug>` (or `centre=none`); the Total row omits it.

### 6.1 Five numbers (per centre row and Total)

| # | Number | Definition | Link |
|---|---|---|---|
| 1a | Enquiries today (`/admin` only) | inbox count, `F = {created: today}` | `/crm?created=today[&centre=]` |
| 1b | Enquiries this week | inbox count, `F = {created: week}`. Unlinked sub-lines: same set ∧ `TOOL_SIGNUP_SQL`; same set ∧ `IMPORTED_SQL`; "N more since erased" = `P_all` erased stubs with `created_at ≥ weekStart` | `/crm?created=week[&centre=]` |
| 2 | Not yet called | inbox count, `F = {stage: new, contact: none, signups: hide}`. Linked sub-line "waiting over 24 h": `F + {created: over24h}` | `/crm?stage=new&contact=none&signups=hide[&centre=]` |
| 3 | Overdue follow-up tasks | inbox count, `F = {due: overdue, stage: open}` (the inbox clause: `next_task_due_at < now`; counts leads, not tasks) | `/crm?due=overdue&stage=open[&centre=]` |
| 4 | Admissions this session | `P_all` with `stage='enrolled'` and `admissionSession(l) = currentSession`, where `admissionSession(l)` = `crm_lead_details.intake_session` if set, else `sessionOf(ENROLLED_AT_SQL ?? l.updated_at)` | `/crm/admissions?session=S2026[&centre=]` |
| 4t | Session target | Σ `crm_targets.value` over (`S{y}`, centre, every programme, `admissions`); **null** when no cell exists ("No target set"). Total row = Σ over the centres shown, null if all null. % = `round(100·n/T)` only when T > 0 | `/crm/targets` |
| 5 | Top sources | 3 most frequent `classifyChannel(l)` over `P_all` with `created_at ∈ [now − 30 d, now)`; ties in `CHANNELS` order; "Too few enquiries to rank" under 5 | `/crm/sources?range=30d[&centre=]` |

**Rows:** admins → `consoleCentres()` plus "No centre yet" if any lead has none; managers → `viewerCentreSlugs` ∪ any `centreOf(l)` found in scope. The Total row is computed over the whole scope (not a sum of rows).

### 6.2 Needs attention

| Kind | Variant | Count | href |
|---|---|---|---|
| `unassigned` | admin | inbox count `{assignee: unassigned, stage: open, signups: hide}` | `/crm?assignee=unassigned&stage=open&signups=hide` |
| `tool_signups` | admin (super admins and admins) | inbox count `{area: tool_signups, stage: open}` (LR's clause, unchanged) | `/crm?area=tool_signups&stage=open` |
| `not_called_24h` | both | number 2's "waiting over 24 h" | `/crm?stage=new&contact=none&signups=hide&created=over24h` |
| `overdue_by_counsellor` | both | `countLeadsGrouped` of number 3 by `assigned_to`, descending, top 8 (unassigned as its own row) | `/crm?due=overdue&stage=open&assignee=<userId\|unassigned>` |
| `lost_to_review` | both | §6.5 unreviewed events in the last 14 days | `/crm/lost` |

Tool sign-ups already routed into an area are counted in LR's "Unassigned in areas" tile, not here.

### 6.3 Admissions done

Rows = the number-4 population for the chosen session (and centre). Columns from the lead row and `ENROLLED_AT_SQL`. Programme buckets: `program_interest ∈ {jee, neet, foundation, integrated}`, otherwise `any`.

### 6.4 Counsellor activity (range `[from, to)`)

From `crm_activities a` joined to `crm_leads l` in the viewer's scope, grouped by `a.actor_id`:
- **Calls** = `a.type='call'`; **Connected** = calls with `meta.outcome='connected'` (rate = connected of calls);
- **WhatsApps sent** = `a.type='whatsapp'` (since 1b, logged only on staff confirmation);
- **Follow-ups done** = `a.type='task_done'`;
- **Active days** = distinct IST days over calls and WhatsApps; **Calls per active day** = calls / active days (blank at 0);
- **Open enquiries now** = `openLeadCounts` for the person;
- **Admissions** = enrolled leads with `assigned_to = person` and `ENROLLED_AT_SQL ∈ range`.

### 6.5 Lost review

**Events:** `stage_change` activities with `meta.to='lost'` and `at ≥ now − days`, on leads live, in scope and **currently** `lost`, with no `crm_lost_reviews (lead_id, lost_at = a.at)` row. **Columns:** reason = `meta.lostReason` (re-read the key); marked by = `a.actor_id`; calls made = `call` activities with `at ≤ a.at`; last outcome = latest `call`/`whatsapp` `meta.outcome` before the lost change. **Matrix:** reason × actor over every lost event in the range, reviewed or not.

### 6.6 Channel classifier (`classifyChannel`; first matching rule wins)

`ref` = lower-case `COALESCE(l.referrer, attribution.referrer_host)`. "host ∈ X" = equal to X or a subdomain of X, port stripped.

| # | Rule | Channel |
|---|---|---|
| 1 | `source='meta_lead_ad'`, or `utm_medium='lead_ad'` | `meta_ads` |
| 2 | `source='scholarship_test'` (Phase 2; no rows before) | `scholarship_test` |
| 3 | `source='csv_import'` | `imported_list` |
| 4 | `source='paper_form'` (Phase 2; no rows before) | `paper_forms` |
| 5 | `source='walk_in'` / `'phone_call'` / `'referral'` / `'other'` | `walk_in` / `phone_call` / `referral` / `staff_other` |
| 6 | `canonicalTool(tool)='ask'` | `rancho` |
| 7 | `source='tool'`, or `tool` set | `free_tools` |
| 8 | `utm_medium ∈ {gbp, maps}`, or `utm_source ∈ {gbp, gmb, google_business_profile}`, or `utm_campaign` starts with `gbp`, or `ref ∈ {maps.google.com, maps.app.goo.gl, g.page}` | `google_maps` |
| 9 | `ref ∈ AI_ASSISTANT_HOSTS`, or `lower(utm_source) ∈ AI_ASSISTANT_UTM_SOURCES` | `ai_assistants` |
| 10 | `utm_medium ∈ {cpc, ppc, paid, paid_social, display}` | `paid_ads` |
| 11 | `utm_source ∈ {facebook, fb, instagram, ig}`, or `ref ∈ {facebook.com, m.facebook.com, l.facebook.com, instagram.com, l.instagram.com}` | `facebook_instagram` |
| 12 | `ref` is a Google search host (`google.<tld>`, `www.google.<tld>`), or `bing.com`, `duckduckgo.com`, `search.yahoo.com`, `yandex.*`, `ecosia.org` | `search_engines` |
| 13 | `ref ∈ {wa.me, web.whatsapp.com, api.whatsapp.com}`, or `utm_source='whatsapp'` | `whatsapp` |
| 14 | `ref ∈ {youtube.com, t.co, x.com, twitter.com, linkedin.com, reddit.com, quora.com}` | `social` |
| 15 | `utm_campaign` set | `campaign` |
| 16 | `ref` set | `other_websites` |
| 17 | otherwise | `direct` |

- `AI_ASSISTANT_HOSTS` = chatgpt.com, chat.openai.com, openai.com, perplexity.ai, gemini.google.com, bard.google.com, copilot.microsoft.com, copilot.cloud.microsoft, claude.ai, chat.deepseek.com, meta.ai, grok.com, you.com, poe.com, chat.mistral.ai.
- `AI_ASSISTANT_UTM_SOURCES` = chatgpt.com, chatgpt, openai, perplexity, perplexity.ai, gemini, copilot, claude, claude.ai.
- **All-signals views:** Google Maps = channel `google_maps` ∪ `heard_via='google_maps'`; AI = channel `ai_assistants` ∪ `heard_via='ai_assistant'`; each lead once.
- **Per group:** enquiries = count; reached counselling = `stageOrdinal(furthest_stage) ≥ stageOrdinal('counselling_booked')`; admitted = `stage='enrolled'`; under 10 enquiries → "small sample".

### 6.7 Free tools & Rancho card (last 14 IST days unless noted; read-only, no new counters)

| Row | Source | Footnote |
|---|---|---|
| Enquiries per tool (range) | `P_all` grouped by `canonicalTool(l.tool)` | — |
| Contact forms per day | existing `gateDailyCounts(viewer, range)` | new families / families already on file |
| Mock tests submitted per day | `mocktest_attempt_meta.server_submitted_at` per IST day | "Saved attempts only" |
| Planner: students active per day | `COUNT(DISTINCT user_id)` from `planner_daily` per `day` | "Signed-in students only" |
| Rancho questions | today and yesterday: `ask_usage.count` for `usageKeyHash("global", <the id the ask module uses>, day)` | "The site keeps these counts for 2 days only" |
| Tool uses by families who shared details | `crm_activities type='tool_use'` per IST day by `meta.tool` | "Kept 90 days" |
| Predictor | — | "Predictor use is not counted; only its enquiries" |

## 7. Permissions

| | Counsellor | Manager (area head) | Admin | Super admin |
|---|---|---|---|---|
| Five numbers, Needs attention | — (home is Today's calls) | own scope (`/crm/dashboard`) | all (`/admin`, `/crm/dashboard`) | all |
| Targets | — | read own centres | read | **edit** |
| Admissions done | own | own scope | all | all |
| One-step outcome, task done | leads they see | leads they see | all | all |
| WhatsApp composer | approved general templates | same | same | same |
| Templates page | — | read | read | **edit, approve, prospectus link** |
| More details | edit leads they see | edit | edit | edit |
| Duplicates: see / dismiss | leads they see / if assignee and sees both | scope / if sees both | all / yes | all / yes |
| Lost review | — | own scope | all | all |
| Counsellor activity | own row | scope | all | all |
| Sources | — | own scope, read | all | all |
| Tool usage rows | — | — (enquiries per tool only) | yes | yes |
| Centre Maps links | — | read | read | **edit** |
| Search overview, Site status, People, activity log | — | — | yes | yes (People: creating staff is super admin, per LR) |

Every page **and** API checks these again on the server.

## 8. API summary

All routes: `src/app/api/**/route.ts`, `runtime = "nodejs"`, `requireCrm` (or `requireAdmin` for `/api/admin`), D-007 envelope, `no-store`, `noindex`, same-origin + strict zod + 8 KB on writes, CRM rate limits.

| Method and path | Who | Body / query → data | Pkg |
|---|---|---|---|
| GET `/[lang]/crm/home` (route handler) | signed-in staff/admin | → 307 to the role's home | CORE |
| Existing GET `/api/crm/leads` (changed) | — | new `contact=none`, `signups=hide`, `created=today\|week\|over24h`; `centre` = effective centre | CORE |
| GET / PUT `/api/crm/targets?period=` | read: admin, manager. Write: SA | `{ period, metric, cells[], expectedUpdatedAt }` → `TargetGrid` | NUMBERS |
| GET / POST `/api/crm/leads/[leadId]/outcome` | viewer who sees the lead | GET → `FollowUpContext`; POST `OutcomeInput` → `OutcomeResult` | CALLS |
| GET `/api/crm/templates?context=[&all=1]` | all (approved); `all`: admin, manager, SA | → `WaTemplate[]` | CALLS |
| PUT `/api/crm/templates/[key]` | SA | `{ lang, body, expectedVersion }` → `WaTemplate` | CALLS |
| POST `/api/crm/templates/[key]/status` | SA | `{ status, expectedVersion }` → `WaTemplate` | CALLS |
| PUT `/api/crm/templates/links` | SA | `{ prospectusUrl, expectedVersion }` | CALLS |
| GET / PUT `/api/crm/leads/[leadId]/details` | viewer who sees the lead | partial `LeadMoreDetails` → `LeadMoreDetails` | FAMILY |
| GET / POST `/api/crm/leads/[leadId]/duplicates` | viewer who sees the lead (POST: sees both) | POST `{ otherLeadId, action: "dismiss" }` | FAMILY |
| GET `/api/crm/lost-review?days=&assignee=` | admin, manager | → `LostReviewItem[]` | FAMILY |
| POST `/api/crm/lost-review/[leadId]` | admin, manager | `{ lostAt, decision, reopenTo?, assigneeId?, followUp? }` | FAMILY |
| GET `/api/crm/sources?range\|from&to&centre` | admin, manager | → `SourcesReport` | SOURCES |
| GET / PUT `/api/crm/settings/centre-links` | read: admin, manager. Write: SA | `{ centres, expectedVersion }` | SOURCES |
| POST `/api/admin/users` (changed) | SA (staff) | staff needs `crm.crmRole`, else 422 | HOUSEKEEPING |
| GET `/api/admin/users` (changed) | admin | `crm` gains `areaIds, areaNames, awayUntil, openLeads` | HOUSEKEEPING |

## 9. Audit codes and activity-log labels

`CONSOLE_AUDIT` in `src/lib/crm/console/audit.ts`; details hold ids, counts and enums only.

| Code | Written by | Details | Label (English registry) |
|---|---|---|---|
| `crm.lead_details_update` | FAMILY | `{ fields }` | Updated enquiry details ({fields}) |
| `crm.duplicate_dismiss` | FAMILY | `{ otherLeadId }` | Marked two enquiries as different families |
| `crm.lost_review` | FAMILY | `{ decision }` | Reviewed a lost enquiry ({decision}) |
| `settings.targets_update` | NUMBERS | `{ period, metric, cells }` | Changed targets for {period} ({cells} cells) |
| `settings.template_update` | CALLS | `{ key, lang, version }` | Edited WhatsApp template "{key}" ({lang}) |
| `settings.template_status` | CALLS | `{ key, status }` | WhatsApp template "{key}" set to {status} |
| `settings.wa_links_update` | CALLS | `{ version }` | Changed the prospectus link |
| `settings.centre_links_update` | SOURCES | `{ centres }` | Changed Google Maps links ({centres} centres) |
| `crm.contact_log` (existing, extended) | CORE | `{ channel, outcome, template? }` | Logged a {channel} ({outcome}){, template "…"} |

`crm.lead_view` = "Viewed an enquiry", `mcp.call` = "AI assistant used {tool}"; both grouped on screen.

## 10. Honesty and privacy rules

1. **Every number is a database count.** Only the 8 template drafts are seeded (no facts, "Awaiting approval"). No targets, Maps links, prospectus link, fees, dates or slabs are invented: "Not set" / "No target set" / "Fill in".
2. **Numbers match their lists.** Every linked number is counted by the inbox's own query for that link; anything the list cannot show (erased, sub-lines) is an unlinked note that says what it is.
3. **Rates are "x of y".** Groups under 10 enquiries are "small sample".
4. **Centres:** demo mode says "Demo centre list (decision 7)".
5. **WhatsApp:** the console says "WhatsApp opened" and "you sent it", never "sent by the system" or "delivered" (D-041). Logged only after the counsellor confirms.
6. **Free tools card** says what is and isn't counted (Predictor not counted; Rancho's 2-day window).
7. **AI and search:** AI-assistant counts are a lower bound; the search overview promises no rankings.
8. **Site status:** "Off-server backups: not set up (deferred)"; never a fake "last backup". GBP links carry the domain warning.
9. **Preview mode** shows "—" and "Preview · no live data" and never queries the database.
10. **Real families' (minors') data:** dashboards and sources show counts only; names only on list pages for viewers who may see those leads; nothing personal in audit details, logs or URLs (§1.2 rule 11).

## 11. MCP

- **Wording only (1B-HOUSEKEEPING):** "Ask Aspire" → "Rancho (the AI doubt solver)" in `tools/status.ts` and `tools/progress.ts`; data keys unchanged.
- **No new tools, no scope changes** in 1b (the `console_numbers` read tool was dropped; it can come later under `crm:read`). LR-CORE owns `tools/crm.ts`.

## 12. Copy (key terms, so the screens agree)

| Key (file) | English | Hindi |
|---|---|---|
| `common.notSet` (console-common) | Not set | तय नहीं |
| `common.noTarget` | No target set | लक्ष्य तय नहीं |
| `common.xOfY` | {x} of {y} | {y} में से {x} |
| `common.demoCentres` | Demo centre list: the real list is pending | डेमो सेंटर सूची: असली सूची अभी आनी है |
| `common.smallSample` | Small sample | संख्या कम है |
| `numbers.enquiries` | Enquiries | पूछताछ |
| `numbers.today` / `week` | Today / This week | आज / इस हफ़्ते |
| `numbers.notCalled` | Not yet called | अभी तक कॉल नहीं हुई |
| `numbers.waiting24` | {n} waiting over 24 h | {n} को 24 घंटे से ज़्यादा हो गए |
| `numbers.erasedSince` | {n} more since erased | {n} और, जो बाद में मिटा दी गईं |
| `numbers.overdue` | Overdue follow-up tasks | समय निकल चुके फ़ॉलो-अप |
| `numbers.admissions` | Admissions this session | इस सत्र के एडमिशन |
| `numbers.topSources` | Top sources (30 days) | मुख्य स्रोत (30 दिन) |
| `numbers.attention` | Needs attention | इन पर ध्यान दें |
| `numbers.nothing` | Nothing needs attention right now. | अभी किसी चीज़ पर ध्यान देने की ज़रूरत नहीं है। |
| `calls.whatHappened` | What happened? | क्या हुआ? |
| `calls.next` | Next follow-up | अगला फ़ॉलो-अप |
| `calls.laterToday` / `tomorrow` / `in3Days` / `pick` | Later today / Tomorrow / In 3 days / Pick a time | आज बाद में / कल / 3 दिन बाद / समय चुनें |
| `calls.noCallNeeded` | No call needed (task done) | कॉल की ज़रूरत नहीं थी (काम हो गया) |
| `calls.attempt` | Attempt {n} · {m} unanswered in a row | कोशिश {n} · लगातार {m} बार जवाब नहीं |
| `calls.notReachable` | {n} calls in a row without an answer. Mark as not reachable? | लगातार {n} कॉल पर जवाब नहीं मिला। क्या इसे "संपर्क नहीं हो पा रहा" मानकर बंद करें? |
| `calls.outsideHours` | Outside calling hours ({hours}). Save anyway? | कॉल के तय समय ({hours}) से बाहर है। फिर भी सेव करें? |
| `calls.hardWindow` | No calls before 8 am or after 9 pm. | सुबह 8 बजे से पहले या रात 9 बजे के बाद कॉल नहीं। |
| `calls.openWhatsApp` | Open WhatsApp | WhatsApp खोलें |
| `calls.didYouSend` | Did you send it? | क्या आपने मैसेज भेज दिया? |
| `calls.yesSent` / `notSent` | Yes, I sent it / No, I didn't send it | हाँ, भेज दिया / नहीं भेजा |
| `calls.loggedWa` | Logged: you sent "{template}" on WhatsApp. | दर्ज हुआ: आपने WhatsApp पर "{template}" भेजा। |
| `calls.nothingLogged` | Nothing was logged. | कुछ भी दर्ज नहीं हुआ। |
| `calls.awaitingApproval` | Awaiting approval | मंज़ूरी बाकी |
| `calls.fillIn` | Fill in: {slots} | भरें: {slots} |
| `family.moreDetails` | More details | और जानकारी |
| `family.altPhone` | Second phone / WhatsApp | दूसरा फ़ोन / WhatsApp नंबर |
| `family.heardVia` | How they heard about us | हमारे बारे में कैसे पता चला |
| `family.intakeSession` | Joining in session | किस सत्र में दाख़िला |
| `family.decisionMaker` | Who decides | फ़ैसला कौन करेगा |
| `family.duplicates` | Possible duplicates ({n}) | शायद यही परिवार ({n}) |
| `family.notSame` | Not the same family | यह अलग परिवार है |
| `family.lostReview` | Lost enquiries to review | बंद पूछताछ की समीक्षा |
| `family.keepLost` / `reopen` | Keep lost / Reopen… | बंद ही रखें / फिर से खोलें… |
| `sources.title` | Where enquiries come from | पूछताछ कहाँ से आती है |
| `sources.reached` / `admitted` | Reached counselling / Admitted | काउंसलिंग तक पहुँचे / एडमिशन हुआ |
| `sources.ai` | AI assistants (ChatGPT and others) | AI असिस्टेंट (ChatGPT आदि) |

All Hindi lines are machine drafts, listed in each package report; Integrate adds them to `docs/hindi-review-register.md`. `mockup-strings.test.ts` bans "Solan", "Palampur" and sample numbers in `src/components`, `src/app` and `src/i18n`: take district and town names only from LR's data at run time.

---

# Part 2. Build packages

## 13. Packages and waves

- **1B-CORE** runs alone first.
- Then, at most two at once on the owner's PC: **wave 1** 1B-CALLS + 1B-SOURCES → **wave 2** 1B-NUMBERS + 1B-FAMILY → **wave 3** 1B-HOUSEKEEPING → **1B-INTEGRATE**. The `dependsOn` lists in §21 encode these waves.
- After CORE every path has exactly one owner. Parallel packages share only CORE files, read-only. A CORE stub becomes the receiving package's file when it starts.
- **Shared suites, one editor at a time:** `crm-ui.test.ts` — CORE (filters, nav), then CALLS (contact/task assertions, wave 1), then FAMILY (inbox assertions, wave 2). `crm-console-ui.test.ts` — CORE, then CALLS. `portal-ui.test.ts` — CORE (nav), then NUMBERS (admin views, wave 2), then HOUSEKEEPING (user manager / audit blocks, wave 3). `crm-services.test.ts`, `crm-api.test.ts`, `paths.test.ts` — CORE only. `admin-users.test.ts` — HOUSEKEEPING.
- CALLS and FAMILY both add tests under `src/app/api/crm/leads/**`; they run in different waves and use distinct file names (`calls-api.test.ts`, `family-api.test.ts`).

**1B-CORE** — console foundations. **New:** `src/lib/db/features/crm-console.ts`, `src/lib/db/console-schema.test.ts`; `src/lib/crm/console/{types,session,channels,centres,centre-links,erase,atomic,audit,counts}.ts`, `src/lib/crm/console/console-core.test.ts`; `src/lib/crm/repo/{console-sql,console-core}.ts`; `src/components/console/shared/{ConsoleTable.tsx,XofY.tsx,NotSet.tsx,DemoNote.tsx,CentreLabel.tsx,messages.ts}`; stubs `src/components/console/details/LeadMoreDetails.tsx`, `src/components/console/duplicates/DuplicateSuggestions.tsx` (render `null`; props `{ lead: LeadDetail; viewer: CrmViewer; permissions: CrmPermissions; locale: Locale; pagePath: string; now: number }`); `src/i18n/messages/{en,hi}/console-common.ts` (incl. `details.*` field labels for the timeline); `src/app/[lang]/(portal)/crm/home/route.ts`. **Edit:** `src/lib/db/features/index.ts`; `src/lib/crm/lead-ops-types.ts` (`CRM_SETTING_KEYS` + `centre_links`, `wa_links`); `src/lib/crm/types.ts` (`LeadFilters.contact/signups/created`); `src/lib/crm/repo/leads.ts` (`scopedLeadWhere`, `countLeads`, `countLeadsGrouped`, new `whereFor` clauses, effective-centre filter); `src/lib/crm/leads.ts` (`logContact` extra; `buildLeadQuery` mapping); `src/lib/crm/http.ts` (parse); `src/lib/crm/admin.ts` (erase hook, `KEEP_META_KEYS`); `src/components/crm/format.ts` (filters, chips, back kinds `admissions`, `lost`, and `dashboard` if missing); `src/components/crm/LeadDetailView.tsx` (two slots + `details.*` labels only); `src/components/crm/settings/SettingsHub.tsx` (cards: Targets, WhatsApp templates, Google Maps links); `src/components/portal/areas.ts`; `src/components/portal/PortalShell.tsx` (breadcrumb pages only); `src/lib/auth/paths.ts`; `src/i18n/messages/{en,hi}/{crm,portal}.ts`; the CORE test suites.

**Navigation (CORE, `areas.ts`):** `crmNavItems` gains `admissions` (`/crm/admissions`, all roles). New `crmManageItems` (managersOnly): `targets` (`/crm/targets`), `templates` (`/crm/templates`), `lostReview` (`/crm/lost`), rendered as a **"Manage"** sub-group (if the staff sidebar has no groups, append after a divider with a visible "Manage" label). New `crmLeadGenItems = [{ key: "sources", href: "/crm/sources", icon: Compass, managersOnly: true }]`. Staff nav = `[...crmNavItems, ...crmManageItems, ...crmLeadGenItems]`. `adminGroups` gains `leadGeneration: crmLeadGenItems`, `search: [{ key: "searchOverview", href: "/admin/search" }]` and under `settings` `{ key: "status", href: "/admin/status" }` before audit.

The other packages' files are listed in §21.

## 14. Integrate, verify, deploy (1B-INTEGRATE, one agent)

1. **Type check, test, lint:** `npx tsc --noEmit` once; vitest in two halves, `--maxWorkers=1` (`src/lib src/app`, then `src/components src/test src/i18n`); eslint on every changed file.
2. **Apply the shared-suite changes** packages reported (§1.2 rule 9).
3. **Roadmap:** remove every shipped 1b item from `src/components/portal/console-roadmap.ts` with its `portal.admin.coming.items.*` keys (en, hi); p1b status "Released"; keep anything cut.
4. **Sidebar check:** at 768 px the staff sidebar for a manager must not need scrolling to reach Reports; if it does, collapse the Manage group by default.
5. **Docs:** `docs/agent-decisions.md` D-078 to D-083 (§17; re-grep first); `docs/crm.md` (console section, tables, APIs, role home, new inbox params, effective-centre filter); `docs/api.md`; `docs/hindi-review-register.md` (every package's Hindi lines + the 16 template bodies); `docs/aspire-approval-checklist.md` new items **WA-1–WA-8** (approve each template), **TG-1** (2026–27 targets), **MAP-1** (Maps link per centre), **MAP-2** (tagged GBP links after the domain is final), **AI-1** (AI-assistant host list), **DQ-12** ("Changed from decision 12: free tool users triaged by super admins/admins until the tool form asks the district").
6. **Smoke integration test** over route handlers on a temporary `AUTH_DB_PATH`: (1) a super admin, a manager (one area) and a counsellor; 30 fixture leads across sources, centres, tool sign-ups (routed and unrouted), imports, one area-routed lead without a centre, one erased lead, one test-erased lead; (2) every linked number equals the `GET /api/crm/leads` total for its href, for the super admin and the manager; (3) the counsellor logs a no-answer via `/outcome` with `later_today` → exactly one open task, LR's clock records an attempt; (4) 5 no-answers then `markNotReachable` → lost (not_reachable), listed in `/api/crm/lost-review`, the manager reopens it → a task; (5) the super admin approves `missed_call`; the counsellor's `GET /api/crm/templates?context=general` lists it; the confirmed POST logs `message_sent` with the template; (6) details PUT with an alternate phone equal to another lead's phone → duplicate suggested; dismissed → gone; (7) a lead with referrer `chatgpt.com` is erased → sources still counts 1 AI-assistant enquiry; (8) `POST /api/admin/users` staff without a role → 422.
7. **One headless Chrome pass** (one browser at a time) at 375, 768 and 1280 px, en and hi: `/admin`, `/crm/dashboard`, `/crm/targets`, `/crm/admissions`, a lead page with the call dialog and the WhatsApp composer (both steps) open, `/crm/templates`, `/crm/lost`, `/crm` (presets and chips), `/crm/sources`, `/admin/search`, `/admin/status`, `/admin/users`, `/admin/audit`. Check: no horizontal scroll, focus order, no console errors, `/admin` preview mode. Delete scratch screenshots afterwards.
8. **Commit** on `feature/admin-console-1b` (message ends with the attribution line the session requires).
9. **Deploy R2** (owner's AFK authorisation covers this; there are **no new dependencies and no new environment variables**; the feature schema applies itself on the first database open; nothing is backfilled):
   1. Gate: steps 1–7 green. CI cannot run without a push, so the local gate plus the server build stand in for it. Try `git push`; if it is blocked, continue with the archive upload.
   2. Upload: `git -c core.autocrlf=false archive --format=tar.gz -o <scratch>/release-<sha>.tar.gz <sha>`, `ssh -i ~/.ssh/aspire_deploy root@69.62.76.109 'cat > /opt/aspire-web/release-<sha>.tar.gz && sha256sum …' < file`, compare checksums, untar into `release/`. **If the ssh upload is blocked, stop**: write the exact commands into the owner walkthrough and leave the release unapplied.
   3. Snapshot: `VACUUM INTO /opt/aspire-web/backups/pre-<sha>.sqlite` via node:sqlite inside the running container (live data includes minors).
   4. Disk: `df -h /`; `docker builder prune -f`; if still under 3 GB free, delete the oldest rollback image (keep current + newest rollback) and report it.
   5. Build in the background with the low-disk watchdog (kill if `df --output=avail` < 300 MB; revert `RELEASE` on failure); set `RELEASE=<sha>`; `docker compose up -d`; hit `GET /api/ask` to open the database; check read-only that the `crm_*` 1b tables exist.
   6. Verify: public pages 200; the other sites on the VPS (thechunkmedia.com, aspire2.thechunkmedia.com) still 200; as super admin open `/admin` and `/admin/status` and confirm the release, free disk and "Off-server backups: not set up (deferred)". Keep 2 release images; `docker builder prune -f`.
   7. Rollback: previous image tag + `RELEASE` revert. The new tables are unused by old code, so no database restore is needed unless data is damaged (then the step-3 snapshot).
10. **Owner walkthrough note:** "click here, then here" for the owner summary's five steps, plus anything cut (§15) and any blocked deploy commands.

## 15. If time runs short (cut in this order; each cut item stays on "What's coming")

1. The `/admin/search` overview (1B-SOURCES); the same numbers stay on `/crm/sources`.
2. Optional enquiry and counselling targets (1B-NUMBERS); session admissions targets stay.
3. The weekly-trend chart, keeping its table (1B-SOURCES).
4. The lost-reasons-by-counsellor matrix (1B-FAMILY); the review list stays.
5. Hinglish template bodies (kept as drafts, hidden in the composer).

Never cut: the one-step outcome; the WhatsApp confirm-on-return; the five numbers and their link match; the People role fix; the erase hooks; the honesty labels.

## 16. Risks

| Risk | Mitigation |
|---|---|
| LR names or signatures differ from its plan (calling-hours helpers, retry field, lost reasons, dashboard strings) | Hard start condition; CORE re-reads and adapts §4; packages use only CORE re-exports |
| Two tasks per call (LR retry plus ours) | Ordering in §5.C plus a test with the real LR-SLA module |
| WhatsApp opens counted as contacts | Logged only on "Yes, I sent it" (§5.D), tested against the SLA clock |
| Numbers that don't match their lists | Linked numbers counted by the inbox's own query; round-trip and smoke tests |
| Manager scope leaks | Only `scopedLeadWhere` / the inbox builder; scope tests per package; duplicates never mention unseen leads |
| CHECKs that can't grow | Open vocabularies validated in zod with length CHECKs only (§3) |
| Unapproved wording reaches families | Drafts unusable until approved; edits return a template to draft |
| Shared-file collisions | CORE alone first; one owner per file; sequential suite editors; page layout after 1b Integrate |
| PC memory | One tsc per agent, `--maxWorkers=1`, at most 2 agents at once, one Chrome only at Integrate |
| Server disk | No new dependencies; status page warns under 3 GB; deploy prunes and keeps 2 images |
| Deploy access blocked | Stop and stage exact commands for the owner (§14.9) |
| Hindi quality | Machine drafts registered; gender-neutral counsellor verbs; native review pending |
| Calling-hours confusion (decision 9 vs LR) | One source (LR) with a hard outer limit and clear warnings (O2) |

## 17. Decisions to record (1B-INTEGRATE; re-grep the ids first)

- **D-078 Console numbers and targets.** Five numbers per effective centre (`centre_slug`, else the routing area's default centre); numbers that link to the enquiries list are counted by the list's own query (live leads), with tool sign-ups, imports and erased enquiries as unlinked sub-lines; "not yet called" excludes tool sign-ups. Session April–March; an admission counts in the intake session, else the session of its enrolment date. Session targets in `crm_targets` (centre × programme; enquiry and counselling optional), super-admin edit, nothing shown until set. `/crm/home` sends each role to its home (manager → `/crm/dashboard`, QB-only staff → `/admin/questions`). New inbox params `contact`, `signups`, `created`; the inbox centre filter uses the effective centre.
- **D-079 One-step follow-up.** One atomic call: complete task → create the chosen follow-up → `logContact` → optional lost. The chosen follow-up replaces LR's automatic retry (one task per call). Presets use LR's calling hours; `later_today` uses LR's retry minutes; 08:00–21:00 IST is the hard limit. The rhythm is a suggestion; "not reachable" suggested after 5 unanswered calls in a row.
- **D-080 Staff WhatsApp templates.** `crm_wa_templates` (en, hi, Hinglish; `context`), usable only once approved, super admins edit and approve; per-key `INSERT OR IGNORE` seeding. One slot registry shared with Phase 2 and Asha. wa.me with prefilled text; a contact is logged (`message_sent`, meta `{template, lang}`) only after the counsellor confirms they sent it.
- **D-081 Family record.** `crm_lead_details` (erase wipes second phone, school, referred-by; keeps the rest); duplicates suggested within the viewer's scope only and dismissed per pair (viewer must see both); no auto-merge; lost review per lost event (`crm_lost_reviews`) by managers and admins. Open vocabularies are validated in code, not SQL CHECKs.
- **D-082 Attribution.** The channel classifier of §6.6 (incl. AI-assistant hosts and UTM, Google Maps signals, and the Phase 2 sources `paper_form` and `scholarship_test`); referrer host kept after erase in `crm_lead_attribution`; GBP tagged link `utm_source=google&utm_medium=gbp&utm_campaign=gbp-<centre>`, used only after the domain is final; the tool card reads existing tables only.
- **D-083 Housekeeping.** Staff creation requires an explicit CRM role; "AI assistant access" wording and "Rancho" in MCP descriptions; admin-only `/admin/status` with "backups: not set up (deferred)", a 3 GB disk warning and a static go-live summary; English-only audit label registry with `crm.lead_view` and `mcp.call` grouped on screen, never deleted.

## 18. Owner decision changes to show in the walkthrough

- **Decision 12:** free tool users are triaged by super admins and admins (lead routing's Tool sign-ups list) until the tool form asks for the district.
- **Decision 9:** lead routing's calling hours drive suggestions; 8 am–9 pm is the hard limit.
- **Decision 11:** only super admins edit templates for now.
- **Decision 8:** session targets only; no monthly targets.

## 19. What 1b leaves for Phase 2 (so Phase 2 does not re-open 1b files unnecessarily)

- Reuse: `runAtomic`, `scopedLeadWhere`, `countForFilters`, `consoleCentres` / `viewerCentreSlugs`, `consolePermissions`, `EFFECTIVE_CENTRE_SQL`, the template store (add keys with `context` 'booking' / 'test' via per-key seeding) and `TEMPLATE_SLOTS`, `classifyChannel` (already knows `paper_form` and `scholarship_test`).
- Phase 2 edits `crm/home/route.ts` (front desk → `/crm/desk`) through its CORE package.
- Phase 2's feature schema `crm_admission` goes after `crm_console`.

## 20. Critic review log (findings that concern Phase 1b)

| # | Finding | Verdict | Reason / change made |
|---|---|---|---|
| 1 | D-059–D-064 already proposed by Asha | **Accepted** | Verified: `admissions-agent-plan.md` claims D-059–D-068. 1b now uses D-078–D-083; page layout told to take D-084+ |
| 4 | Template slots and keys don't match across 1b, Phase 2 and Asha | **Accepted** | One slot registry aligned to the voice doc (`student_first_name`, `date`, `time`, …); `context` column; per-key `INSERT OR IGNORE` seeding with no marker; `TemplateKey` is a validated string; drafts renamed |
| 5 | Dashboard numbers won't match the lists they open | **Accepted** | Linked numbers now counted by the inbox's own query (`countForFilters`); new params `signups=hide`, `created=…`; inbox centre filter uses the effective centre; tool-sign-up queue uses LR's clause verbatim; erased shown as an unlinked note; round-trip + smoke tests |
| 7 | Personal data in URLs (Phase 2) | Not 1b; rule adopted | 1b links carry no family data; CORE adds a test (no 10-digit run, no `@`) |
| 8 | CHECK enums on growable lists | **Accepted** | Open vocabularies use length CHECKs + zod; closed CHECKs kept for status, hostel, decision, flags, formats |
| 9 | `message_sent` logged when WhatsApp merely opens | **Accepted** | Confirm-on-return ("Did you send it?") with sessionStorage mark; only "Yes" logs and sets a follow-up; tested against the SLA clock |
| 10 | Phase 2 sources invisible to the classifier | **Accepted (in 1b)** | `scholarship_test` and `paper_forms` channels and `IMPORTED_SQL` `paper_form` added now (zero rows until Phase 2) |
| 12 | Deploy references an uninstalled backup script and a wrong disk threshold | **Accepted** | Explicit deploy block (§14.9): VACUUM INTO snapshot, prune, 3 GB rule, oldest-rollback deletion, blocked-access stop; status page warns under 3 GB and shows the snapshot line |
| 13 | Old dialog opened by `CallReturnPrompt.tsx`, not `call-return.ts` | **Accepted** | Verified (`CallReturnPrompt.tsx:7,64`, `LeadDetailView.tsx:177`); CALLS owns `CallReturnPrompt.tsx`; tel: tap only marks |
| 14 | Five numbers conflict with LR tiles on `/crm/dashboard` | **Accepted** | "Overdue follow-up tasks" vs "Overdue first calls"; `variant="crm"` drops the today column and the unassigned / tool sign-up rows LR shows |
| 15 | Phase 2 re-implements 1b helpers | Phase 2 | 1b exports the helpers and lists them in §19 |
| 16 | Home route / QB-only staff landing | **Accepted (1b part)** | `/crm/home` sends QB-only staff to `/admin/questions`; Phase 2 adds the desk line |
| 21 | Page layout must not run beside 1B-CORE | **Accepted (1b part)** | §1.3: page layout runs after 1b Integrate and owns its own later edits; 1b Integrate already splits vitest |
| 23 | Scope creep (monthly targets, MCP tool) | **Accepted** | Monthly targets dropped (the CHECK still allows month periods for later); `console_numbers` dropped |
| 24 | Decision 12 change must be shown to the owner | **Accepted (1b part)** | Owner summary, §18, checklist item DQ-12 |
| 25 | Dismissal rights, Hindi nit, disabled link, sidebar length | **Accepted** | Dismiss needs `canSeeLead` on both; Hindi "{n} को 24 घंटे से ज़्यादा हो गए"; `aria-disabled` button until ready; Manage sub-group + 768 px check |
| 2, 3, 6, 11, 17, 18, 19, 20, 22 | Phase 2 only | Not applicable | No 1b change needed (1b creates only staff-chosen tasks, so finding 22's retention point does not touch 1b) |

## 21. Build packages (machine-readable)

PACKAGES:

```json
[
  {
    "key": "1B-CORE",
    "title": "Console foundations: schema, shared contracts, inbox query additions, erase hook, nav, role home",
    "dependsOn": [],
    "owns": [
      "src/lib/db/features/crm-console.ts",
      "src/lib/db/console-schema.test.ts",
      "src/lib/db/features/index.ts",
      "src/lib/crm/console/types.ts",
      "src/lib/crm/console/session.ts",
      "src/lib/crm/console/channels.ts",
      "src/lib/crm/console/centres.ts",
      "src/lib/crm/console/centre-links.ts",
      "src/lib/crm/console/erase.ts",
      "src/lib/crm/console/atomic.ts",
      "src/lib/crm/console/audit.ts",
      "src/lib/crm/console/counts.ts",
      "src/lib/crm/console/console-core.test.ts",
      "src/lib/crm/repo/console-sql.ts",
      "src/lib/crm/repo/console-core.ts",
      "src/lib/crm/repo/leads.ts",
      "src/lib/crm/lead-ops-types.ts",
      "src/lib/crm/types.ts",
      "src/lib/crm/leads.ts",
      "src/lib/crm/http.ts",
      "src/lib/crm/admin.ts",
      "src/components/console/shared/**",
      "src/components/console/details/LeadMoreDetails.tsx (stub, handed to 1B-FAMILY)",
      "src/components/console/duplicates/DuplicateSuggestions.tsx (stub, handed to 1B-FAMILY)",
      "src/i18n/messages/en/console-common.ts",
      "src/i18n/messages/hi/console-common.ts",
      "src/i18n/messages/en/crm.ts",
      "src/i18n/messages/hi/crm.ts",
      "src/i18n/messages/en/portal.ts",
      "src/i18n/messages/hi/portal.ts",
      "src/app/[lang]/(portal)/crm/home/route.ts",
      "src/components/crm/format.ts",
      "src/components/crm/LeadDetailView.tsx (slots and details.* labels only)",
      "src/components/crm/settings/SettingsHub.tsx",
      "src/components/portal/areas.ts",
      "src/components/portal/PortalShell.tsx (breadcrumb pages only)",
      "src/lib/auth/paths.ts",
      "src/lib/auth/paths.test.ts",
      "src/lib/crm/crm-services.test.ts",
      "src/app/api/crm/crm-api.test.ts",
      "src/components/crm/crm-ui.test.ts (filters and nav, wave 0)",
      "src/components/crm/crm-console-ui.test.ts (back kinds, wave 0)",
      "src/components/portal/portal-ui.test.ts (nav blocks, wave 0)"
    ],
    "task": "Read docs/admin-phase-1b-plan.md fully (sections 1-4, 5.A role homes, 6, 13) and AGENTS.md; read node_modules/next/dist/docs on route handlers. PRECONDITION: confirm LR integrate and QB integrate have landed: src/lib/crm/sla/calling-hours.ts (or LR's real calling-hours module), src/app/[lang]/(portal)/crm/dashboard/page.tsx, src/components/crm/areas/PeoplePicker.tsx, crm_settings in src/lib/db/features/crm-intake.ts. If any is missing, STOP and report; do not build. Re-read every file you edit immediately before editing; adapt plan names to the real LR/QB names and report every difference. BUILD: (1) feature schema crm_console exactly as section 3 (open vocabularies length-CHECK only), appended after crm_intake in FEATURE_SCHEMAS. (2) src/lib/crm/console/types.ts exactly as section 4.1 (client-safe, no I/O). (3) Helpers of section 4.2: session.ts, channels.ts (classifier of section 6.6 incl. scholarship_test and paper_forms), centres.ts (consoleCentres, viewerCentreSlugs), centre-links.ts (via LR readSetting/writeSetting), erase.ts (eraseConsoleData), atomic.ts (runAtomic, requireOk, ConsoleAbort), audit.ts (CONSOLE_AUDIT of section 9, consoleAudit), counts.ts (countForFilters, inboxHref). repo/console-sql.ts holds only SQL string constants with no imports; repo/console-core.ts the small writes/reads. (4) repo/leads.ts: export scopedLeadWhere, countLeads, countLeadsGrouped(by centre|assignee); whereFor gains neverContacted, excludeToolSignups, and the centre filter compares EFFECTIVE_CENTRE_SQL (none = IS NULL). (5) Inbox params of section 4.3 (contact=none, signups=hide, created=today|week|over24h resolved with now in IST inside buildLeadQuery) in types.ts LeadFilters, leads.ts buildLeadQuery, http.ts leadFiltersFromSearch, format.ts parseInboxFilters/inboxQuery/hasActiveFilters plus chip labels. (6) leads.ts logContact gains extra {template, lang} merged into activity meta and audit details gain template. (7) admin.ts eraseLead calls eraseConsoleData before the referrer is wiped; KEEP_META_KEYS gains template and lang. (8) lead-ops-types.ts CRM_SETTING_KEYS gains centre_links and wa_links. (9) format.ts back kinds admissions (keeps session) and lost (keeps days), and dashboard if LR did not add it. (10) LeadDetailView.tsx: render DuplicateSuggestions above the manage section and LeadMoreDetails below Details with the stub props of section 13; activitySummary labels for details.* fields. (11) SettingsHub.tsx: cards Targets (/crm/targets), WhatsApp templates (/crm/templates), Google Maps links (/crm/sources#maps). (12) areas.ts navigation exactly as section 13 (admissions; Manage group targets/templates/lostReview managersOnly; crmLeadGenItems sources; adminGroups leadGeneration, search, settings status before audit); PortalShell breadcrumb pages include the new lists (minimal edit). (13) crm/home/route.ts redirects per section 5.A (admin, manager, counsellor, active qb_members without CRM membership -> /admin/questions, no membership -> /crm, signed out -> login with next=/crm/home); paths.ts PORTAL_HOME.staff = /crm/home. (14) Messages: crm.ts nav keys (admissions, targets, templates, lostReview, sources, manage group label), lead.backTo.{admissions,lost}, inbox filter labels and chips for contact/signups/created, the 3 hub card strings, and rename LR's dashboard overdue label to 'Overdue first calls' if it is not already distinct; portal.ts nav.status, nav.searchOverview, nav.mcp = 'AI assistant access'; console-common.ts per section 12 common keys plus details.* labels. (15) Shared UI in src/components/console/shared (ConsoleTable with caption/scope/tablet scroll region and sticky first column, XofY, NotSet, DemoNote, CentreLabel, messages.ts with pick(locale,en,hi) and the ConsoleCommon type). TESTS to write: console-schema.test.ts (open twice idempotent; every CHECK rejects a bad value; open vocab columns accept a new 40-char value; ON DELETE CASCADE from crm_leads; db.test.ts stays green); console-core.test.ts (IST session boundary 31 Mar 23:59 vs 1 Apr 00:00; week boundary Sunday vs Monday; every classifier row of 6.6 incl. port-stripped host and subdomain; scopedLeadWhere returns the same ids as the inbox for scopes all/centres/areas/assigned; countForFilters equals the inbox list total for contact=none, signups=hide, created=today/week/over24h, centre=<slug> with an area-routed lead lacking centre_slug, centre=none; runAtomic rolls back on an inner failure; erase writes the attribution host, wipes alt phone/school/referred_by, keeps heard_via and template meta; link builders produce no 10-digit run and no @); crm-services/crm-api additions for the new params; crm-ui nav (counsellor sees no managersOnly items; admins see Lead generation and Google & AI search groups); paths.test.ts PORTAL_HOME.staff; a route test for /crm/home per role. Do not assert stub output. RUN: npx vitest run src/lib/db src/lib/crm/console src/lib/crm/crm-services.test.ts src/lib/crm/crm-pure.test.ts src/app/api/crm/crm-api.test.ts src/components/crm src/components/portal/portal-ui.test.ts src/lib/auth/paths.test.ts --maxWorkers=1, then exactly one npx tsc --noEmit, then eslint on touched files. No new dependencies, no dev server, no browser. REPORT: files changed, LR/QB name differences found, every Hindi line added, any shared-suite expectation you changed.",
    "acceptance": [
      "Every type in plan section 4.1 is importable from @/lib/crm/console/types and compiles",
      "crm_console schema is idempotent, appended after crm_intake, and db.test.ts stays green",
      "Open-vocabulary columns use length CHECKs only; closed CHECKs reject bad values",
      "countForFilters equals the inbox total for every new filter, including effective centre and over24h",
      "Inbox accepts contact=none, signups=hide, created=today|week|over24h and shows removable chip labels for them",
      "eraseLead keeps the referrer host in crm_lead_attribution, wipes personal detail columns and keeps template/lang meta",
      "logContact stores extra.template and extra.lang in meta and the audit gains template",
      "/crm/home redirects admin, manager, counsellor, QB-only staff and no-membership staff correctly; PORTAL_HOME.staff is /crm/home",
      "Nav renders the Manage group, Lead generation and Google & AI search groups with role gating; links point at the pages packages will create",
      "No behaviour change for existing screens except the new filters, the effective-centre filter, back kinds and the staff landing",
      "vitest (listed paths, --maxWorkers=1), one tsc and eslint are green"
    ]
  },
  {
    "key": "1B-CALLS",
    "title": "One-step call outcome, task done asks the outcome, rhythm, attempts, not reachable, WhatsApp templates with confirm-on-return",
    "dependsOn": ["1B-CORE"],
    "owns": [
      "src/lib/crm/console/followup/**",
      "src/lib/crm/console/templates/**",
      "src/lib/crm/repo/console-followup.ts",
      "src/lib/crm/repo/console-templates.ts",
      "src/app/api/crm/leads/[leadId]/outcome/**",
      "src/app/api/crm/templates/**",
      "src/app/api/crm/calls-api.test.ts",
      "src/app/[lang]/(portal)/crm/templates/page.tsx",
      "src/components/console/calls/**",
      "src/components/console/templates/**",
      "src/i18n/messages/en/console-calls.ts",
      "src/i18n/messages/hi/console-calls.ts",
      "src/components/crm/LeadActions.tsx",
      "src/components/crm/LeadDetailView.tsx (contact and task sections only, after 1B-CORE)",
      "src/components/crm/TodayView.tsx",
      "src/components/crm/CallReturnPrompt.tsx",
      "src/components/crm/crm-ui.test.ts (contact/task assertions, wave 1)",
      "src/components/crm/crm-console-ui.test.ts (affected assertions, wave 1)"
    ],
    "task": "Read docs/admin-phase-1b-plan.md sections 1, 4, 5.C, 5.D, 6.4, 7-10, 12 and AGENTS.md; read the Next 16 route-handler guide. Re-read LR's calling-hours module (src/lib/crm/sla/), src/lib/crm/settings.ts (getCallingHours, getSpeedRule and the retry field name), src/lib/crm/tasks.ts, leads.ts logContact/changeStage, LR's lost reasons, src/components/crm/call-return.ts and CallReturnPrompt.tsx before writing. BUILD: (1) followup/presets.ts, rhythm.ts, attempts.ts (pure) exactly per 5.C; outcome.ts recordOutcome in runAtomic in the order completeTask -> createTask (unless next none or lost mark) -> logContact with extra {template, lang} -> changeStage lost (not_reachable or wrong_number) with the validation rules of 5.C; a followUpContext builder (no transaction). (2) GET/POST /api/crm/leads/[leadId]/outcome with requireCrm, strict zod, 8 KB limit, same-origin, D-007 envelope. (3) CallOutcomeDialog, NextFollowUpPicker, AttemptLine, NotReachableHint and a feature api.ts under src/components/console/calls; LeadActions ContactActions 'Log a call' and every CompleteTaskButton (lead page) and TodayView Done open the dialog (with taskId); CallReturnPrompt.tsx opens CallOutcomeDialog instead of LogContactDialog; a tel: tap only marks the call (no dialog on tap); keep LogContactDialog as a thin compatibility wrapper. (4) Templates: seed.ts (8 drafts of section 4.4, context general, per-key INSERT OR IGNORE inside withTransaction only when a key is missing; no marker, no audit), templates.ts (list by context/status, edit one language with expectedVersion; only TEMPLATE_SLOTS names, not starting/ending with a slot, <= 700 chars; editing approved -> draft; status changes; wa_links prospectus via LR settings), fill.ts (auto-filled slots of 5.D, control chars stripped, <= 120 chars). Routes GET /api/crm/templates?context=&all=1, PUT /api/crm/templates/[key], POST /api/crm/templates/[key]/status, PUT /api/crm/templates/links (writes super admin only). (5) WhatsAppComposer: step 1 compose (approved general templates + own message; language default from latest submission locale; leftover {slot} or >1000 chars keeps an aria-disabled button with the reason; when ready an <a> to wa.me with encoded text, target _blank, rel noopener noreferrer); clicking logs NOTHING and stores {leadId, templateKey, lang, openedAt} via wa-return.ts reusing sessionStore and the expiry from call-return.ts; step 2 'Did you send it?' (also WaReturnPrompt on focus/reload, mounted from the LeadDetailView contact section): Yes reveals the follow-up picker (default keep existing open task, else tomorrow) and POSTs /outcome {contact:{channel:'whatsapp', outcome:'message_sent', template}, next}; No clears the mark and logs nothing. (6) /crm/templates page (managers/admins read, super admins edit/approve/retire, prospectus link) with TemplatesManager. All strings en+hi in console-calls.ts; no string may say the system sent or delivered anything. TESTS: followup.test.ts (every rhythm row; presets 18:30 carry-over, Sunday short hours, closed dates, preferred window; hard window refuses 21:30; outside calling hours accepted with outsideCallingHours true; streak reset after connected); calls-api.test.ts (no-answer via /outcome leaves EXACTLY ONE open task with the real LR-SLA module; failure in logContact rolls back task completion and creation; 422 without next; contact null requires taskId; not reachable -> lost not_reachable and LR clock closed; counsellor cannot complete another person's task on an unseen lead; template writes super-admin only; drafts and non-general contexts not offered to counsellors); templates.test.ts (seed once under two concurrent first reads; per-key seeding adds a missing key; editing approved -> draft; unknown slot rejected; fill language for centre label; Hindi wa.me encode round-trip; erase keeps template meta); calls-ui.test.ts and templates-ui.test.ts (dialog markup, radio labels en/hi, focus return, Done buttons and CallReturnPrompt open the dialog, aria-disabled until ready, opening WhatsApp without confirming makes no POST, Yes posts message_sent with template). RUN: npx vitest run src/lib/crm/console/followup src/lib/crm/console/templates src/app/api/crm/calls-api.test.ts src/components/console/calls src/components/console/templates src/components/crm --maxWorkers=1, then one npx tsc --noEmit, then eslint on touched files. REPORT Hindi lines and any shared-suite expectation changes.",
    "acceptance": [
      "One no-answer call through the dialog leaves exactly one open follow-up, tested with the real LR-SLA module",
      "Ticking any task (lead page or Today's calls) asks what happened",
      "A tel: tap opens no dialog; the call-return prompt opens CallOutcomeDialog",
      "The suggested next time follows the rhythm table and LR calling hours; 08:00-21:00 IST is enforced",
      "5 unanswered calls in a row offer 'not reachable'",
      "The composer offers approved general templates only, fills auto slots, blocks leftover {slots}, opens wa.me with encoded text",
      "Opening WhatsApp logs nothing and leaves the SLA clock open; only 'Yes, I sent it' logs message_sent with {template, lang} and a follow-up",
      "Drafts are seeded once per key and approvable by a super admin only; editing an approved template returns it to draft",
      "No UI string claims the system sent or delivered a message"
    ]
  },
  {
    "key": "1B-SOURCES",
    "title": "Where enquiries come from: channels, AI assistants, Google Maps, Free tools & Rancho, Search overview",
    "dependsOn": ["1B-CORE"],
    "owns": [
      "src/lib/crm/console/sources/**",
      "src/lib/crm/repo/console-sources.ts",
      "src/app/api/crm/sources/**",
      "src/app/api/crm/settings/centre-links/**",
      "src/app/[lang]/(portal)/crm/sources/page.tsx",
      "src/app/[lang]/(portal)/admin/search/page.tsx",
      "src/components/console/sources/**",
      "src/i18n/messages/en/console-sources.ts",
      "src/i18n/messages/hi/console-sources.ts"
    ],
    "task": "Read docs/admin-phase-1b-plan.md sections 1, 4, 5.J, 6 (esp. 6.6, 6.7), 7-10, 12, AGENTS.md and the Next 16 page/route-handler guides; load the dataviz skill before writing any chart. BUILD: (1) sources.ts sourcesReport(viewer, range, centre?) over P_all (scopedLeadWhere AND NOT TEST_LEAD_SQL, erased stubs included) using classifyChannel from CORE, ref = COALESCE(l.referrer, crm_lead_attribution.referrer_host): channels table, Google Maps all signals and AI all signals (each lead once), campaign tags top 20 + Other with most common source/medium, referring hosts top 20 with AI flag, landing pages top 20, heard_via incl. Not recorded, weekly IST trend (Monday start) top 5 + Others; reached counselling = furthest_stage ordinal >= counselling_booked, admitted = enrolled; small sample under 10. (2) tools.ts toolsCard(viewer, range, now) per 6.7 (read-only SELECTs on mocktest_attempt_meta, planner_daily, ask_usage via usageKeyHash imported from @/lib/ask/usage, gateDailyCounts, tool_use activities; usage rows admins only). (3) search.ts searchOverview(viewer, now). All SQL in repo/console-sources.ts; read paths open no transaction. (4) GET /api/crm/sources?range=30d|90d|session or from&to, &centre (admin, manager; counsellor 403); GET|PUT /api/crm/settings/centre-links (read admin/manager, PUT super admin with expectedVersion; https only, allowed Maps hosts, <= 300 chars) using CORE centre-links.ts. (5) /crm/sources page (sections of 5.J with in-page links, counting note, AI info line, Centre links card with copy button and the decision-17 domain warning, Free tools card with footnotes and an inline-SVG bar chart with a visually hidden data table, weekly trend table plus small-multiples bars following the dataviz rules, project tokens and both themes). (6) /admin/search page, admin only, English constants in the module, indexing state from showPlaceholderContent(), counts for 30 and 90 days, the honest note and a link to /crm/sources. Strings en+hi in console-sources.ts (search overview English only). TESTS: sources.test.ts (every classifier-dependent count; referrer host survives erase and is counted; all-signals de-duplication; rates when y=0; manager scope; weekly bucket at Monday IST; Rancho reads only the global key for today and yesterday; planner distinct users; mock tests saved attempts); sources-api.test.ts (counsellor 403; manager scope; centre-links validation and super-admin-only PUT with version conflict; audit settings.centre_links_update with counts only); sources-ui.test.ts (sections render, chart has an accessible table, empty state, /admin/search admin-only). RUN: npx vitest run src/lib/crm/console/sources src/app/api/crm/sources src/app/api/crm/settings/centre-links src/components/console/sources --maxWorkers=1, then one npx tsc --noEmit, then eslint on touched files. REPORT Hindi lines.",
    "acceptance": [
      "Every section of plan 5.J renders with real counts, scope and footnotes; managers read-only in their scope; counsellors refused",
      "AI and Google Maps all-signals totals count each lead once",
      "An erased lead's referrer host is still counted",
      "Centre links are editable by super admins only, with URL validation, version conflict and the domain warning",
      "Charts follow the dataviz rules with an accessible data table in both themes",
      "/admin/search is admin-only, English, and promises no rankings"
    ]
  },
  {
    "key": "1B-NUMBERS",
    "title": "Dashboard five numbers and Needs attention, Targets, Admissions done, Counsellor activity",
    "dependsOn": ["1B-CORE", "1B-SOURCES"],
    "owns": [
      "src/lib/crm/console/dashboard/**",
      "src/lib/crm/console/targets/**",
      "src/lib/crm/console/admissions/**",
      "src/lib/crm/console/activity/**",
      "src/lib/crm/repo/console-numbers.ts",
      "src/app/api/crm/targets/**",
      "src/app/[lang]/(portal)/crm/targets/page.tsx",
      "src/app/[lang]/(portal)/crm/admissions/page.tsx",
      "src/components/console/dashboard/**",
      "src/components/console/targets/**",
      "src/components/console/admissions/**",
      "src/components/console/activity/**",
      "src/i18n/messages/en/console-numbers.ts",
      "src/i18n/messages/hi/console-numbers.ts",
      "src/app/[lang]/(portal)/admin/page.tsx",
      "src/components/portal/AdminViews.tsx",
      "src/app/[lang]/(portal)/crm/dashboard/page.tsx",
      "src/app/[lang]/(portal)/crm/reports/page.tsx",
      "src/components/crm/ReportsView.tsx",
      "src/components/portal/portal-ui.test.ts (admin views block, wave 2)"
    ],
    "task": "Read docs/admin-phase-1b-plan.md sections 1, 4, 5.A, 5.B, 5.G, 6.1-6.4, 7-10, 12, AGENTS.md and the Next 16 guides. dependsOn 1B-SOURCES only to keep two agents at a time; do not edit SOURCES files. BUILD: (1) dashboard/numbers.ts consoleNumbers(viewer, now): every inbox-linked number via CORE countForFilters / countLeadsGrouped with the exact filters its link carries (section 6.1 table), per effective-centre rows (admins: consoleCentres + No centre yet; managers: viewerCentreSlugs plus any found) and a Total over the whole scope; unlinked sub-lines (tool sign-ups, imported, N more since erased) and admissions/targets/top sources in repo/console-numbers.ts over P_all. (2) dashboard/attention.ts needsAttention(viewer, now, variant) per 6.2 (admin variant all five kinds; crm variant without unassigned and tool_signups); overdue_by_counsellor top 8 plus unassigned row with names. (3) CentreNumbers and NeedsAttention server components with variant admin|crm: admin shows today and week, crm shows week only; column label 'Overdue follow-up tasks'; 'n of T (z %)' or 'No target set' with a Set targets link for super admins; top sources chips or 'Too few enquiries to rank'; header 'Session 2026-27 · as of HH:MM IST' and the demo centre note; phones one card per centre; preview mode renders '—' and 'Preview · no live data' without touching the DB. Insert them at the top of /admin (AdminViews, keep the existing account tiles) and at the top of LR's /crm/dashboard page (do not edit LR's components). (4) targets/targets.ts getTargets, putTargets (super admin, zod: session periods only in 1b, CONSOLE_PROGRAMS, TARGET_METRICS, 0-100000, unknown centre slugs allowed; one transaction replaces every cell of period+metric; expectedUpdatedAt conflict -> 409 version_conflict; audit settings.targets_update {period, metric, cells}), sessionTargetFor. GET|PUT /api/crm/targets?period=. /crm/targets page: session picker, grid (JEE, NEET, Foundation, Integrated, Any, Total), 'Show optional targets' for enquiries/counselling, read-only view with LR ReadOnlyNotice for admins/managers (managers own centres), NotAllowed for counsellors. (5) admissions/admissions.ts admissionsDone(viewer, session, centre, page) per 6.3 (also used by number 4); /crm/admissions page with session picker, centre filter, summary table with targets, list of 50 per page with back links (back kind admissions), erased rows nameless. (6) activity/activity.ts counsellorActivity(viewer, range) per 6.4 and a Counsellor activity section in ReportsView (managers/admins one row per staff in scope; counsellors only 'Your numbers'; MCP footnote; link to LR dashboard for first-call speed). Strings en+hi in console-numbers.ts. TESTS: dashboard.test.ts (every formula of 6.1-6.2 on a fixture with an erased stub, a test-erased lead, tool sign-ups routed and unrouted, an import, an area-routed lead with no centre, a No centre yet lead, Monday 00:00 IST week boundary, 1 April IST session boundary, intake session override, No target set vs n of T; LINK ROUND-TRIP: for every linked number and attention row leadFiltersFromSearch(new URL(href, base).searchParams) deep-equals the counted filters and the inbox total equals the number; manager scope and own centres; crm variant hides today and LR-covered rows); targets.test.ts and targets-api.test.ts (admin 403 and manager 403 on PUT; zod; version conflict; audit); admissions.test.ts (scope, session attribution, erased counted nameless, back link); activity.test.ts (formulas; manager scope excludes out-of-scope activity; counsellor own row; MCP-logged counted); dashboard-ui.test.ts (markup, preview render, phone cards, counsellor cannot open /admin). RUN: npx vitest run src/lib/crm/console/dashboard src/lib/crm/console/targets src/lib/crm/console/admissions src/lib/crm/console/activity src/app/api/crm/targets src/components/console/dashboard src/components/console/targets src/components/console/admissions src/components/console/activity src/components/portal/portal-ui.test.ts --maxWorkers=1, then one npx tsc --noEmit, then eslint on touched files. REPORT Hindi lines and any shared-suite changes.",
    "acceptance": [
      "/admin shows the five numbers for every centre plus Needs attention plus the existing account tiles; preview mode renders '—'",
      "A manager on /crm/dashboard sees only their centres, a week-only enquiries column and no duplicate of LR's unassigned/tool sign-up tiles",
      "Every linked number and attention row opens a list whose total equals the number (round-trip test)",
      "Targets save for super admins only, with a version conflict; 'No target set' until set; no monthly targets in 1b",
      "Admissions done is scoped, paged and matches dashboard number 4",
      "The counsellor activity section is scoped; counsellors see only their row",
      "Every formula of plan 6.1-6.4 is tested"
    ]
  },
  {
    "key": "1B-FAMILY",
    "title": "Family record: more details, duplicate suggestions, lost review, inbox presets and filter chips",
    "dependsOn": ["1B-CORE", "1B-CALLS"],
    "owns": [
      "src/lib/crm/console/details/**",
      "src/lib/crm/console/duplicates/**",
      "src/lib/crm/console/lost/**",
      "src/lib/crm/repo/console-family.ts",
      "src/app/api/crm/leads/[leadId]/details/**",
      "src/app/api/crm/leads/[leadId]/duplicates/**",
      "src/app/api/crm/lost-review/**",
      "src/app/api/crm/family-api.test.ts",
      "src/app/[lang]/(portal)/crm/lost/page.tsx",
      "src/components/console/details/**",
      "src/components/console/duplicates/**",
      "src/components/console/lost/**",
      "src/components/console/inbox/**",
      "src/i18n/messages/en/console-family.ts",
      "src/i18n/messages/hi/console-family.ts",
      "src/components/crm/InboxView.tsx",
      "src/app/[lang]/(portal)/crm/page.tsx (only to pass viewer centres/permissions to presets)",
      "src/components/crm/crm-ui.test.ts (inbox assertions, wave 2)"
    ],
    "task": "Read docs/admin-phase-1b-plan.md sections 1, 3, 4, 5.E, 5.F, 5.H, 5.I, 6.5, 7-10, 12, AGENTS.md and the Next 16 guides. dependsOn 1B-CALLS only to keep two agents at a time and to edit crm-ui.test.ts after CALLS; do not edit CALLS files or LeadDetailView.tsx (CORE gave you two slot stubs). BUILD: (1) details: zod partial strict schema against CORE tuples (open vocabularies), alt phone via the same Indian-mobile normaliser as Add enquiry and not equal to the main phone, intake session current/next only; repo upsert in console-family.ts; PUT/GET /api/crm/leads/[leadId]/details (anyone who can see the lead; erased -> 409; unseen -> 404); timeline field_update {fields:['details.x',...]} written through the existing activity service path used for field updates (re-read leads.ts; never raw SQL to crm_activities); audit crm.lead_details_update {fields}. Replace the LeadMoreDetails stub (read view with tel:/wa.me for the second number, 'Not recorded', LR area and place read-only from LR data) and add DetailsForm dialog. (2) duplicates: matching rules (a) and (b) of 5.F within the viewer's visible leads only, minus dismissed pairs, non-erased, max 5, normName = NFKC lower collapsed trimmed; POST /api/crm/leads/[leadId]/duplicates {otherLeadId, action:'dismiss'} requires canSeeLead on BOTH leads and (assignee of either, manager or admin); ordered-pair insert; audit crm.duplicate_dismiss; replace the DuplicateSuggestions stub (Open link with back, Not the same family, Mark lost as duplicate via the existing stage change). (3) lost: events per 6.5 (unreviewed, live, in scope, currently lost; a lead lost twice gives two events), reasons-by-counsellor matrix; GET /api/crm/lost-review?days=&assignee=, POST /api/crm/lost-review/[leadId] keep or reopen; reopen in runAtomic: changeStage(from, never enrolled) -> optional assignLead (LR eligibility via assignableMember) -> createTask -> insert crm_lost_reviews reopened; audit crm.lost_review {decision}; counsellor 403; /crm/lost page with filters 7/14/30 days and counsellor, table, actions, matrix, empty state. (4) inbox: presets.ts (table of 5.I incl. signups=hide on Not called yet and Unassigned, This centre chips when <= 4 centres, Free tool users for super admins/admins), InboxPresets (aria-current), FilterChips (one link per active filter without that param, aria-label 'Remove filter X', Clear all), and fold the existing filter form into a disclosure 'Filters (n on)' closed below lg; wire them in InboxView.tsx; crm/page.tsx passes viewer centres/permissions only. Strings en+hi in console-family.ts. TESTS: details tests (normaliser and equal-number refusal; enums; partial update; 404 unseen; erase wipes alt phone/school/referred_by and keeps heard_via/intake session; timeline labels en/hi; audit has no values); duplicates tests (each rule; symmetric permanent dismissal; unseen candidate never returned; dismiss with unseen otherLeadId -> 404; erased excluded; audit); lost tests (window and double-lost; keep; atomic reopen; counsellor 403; manager scope; audit); inbox-ui.test.ts (every preset round-trips through parseInboxFilters and leadFiltersFromSearch; chip remove links; role gating; markup en/hi). Put API tests in src/app/api/crm/family-api.test.ts. RUN: npx vitest run src/lib/crm/console/details src/lib/crm/console/duplicates src/lib/crm/console/lost src/app/api/crm/family-api.test.ts src/components/console/details src/components/console/duplicates src/components/console/lost src/components/console/inbox src/components/crm/crm-ui.test.ts --maxWorkers=1, then one npx tsc --noEmit, then eslint on touched files. REPORT Hindi lines and shared-suite changes.",
    "acceptance": [
      "The details panel reads and edits all 10 fields; erase wipes the personal ones and keeps the rest",
      "Duplicates are suggested by both rules within the viewer's scope only; dismissal needs sight of both leads and is permanent; nothing merges",
      "Lost review lists unreviewed events; Keep and Reopen are atomic and audited; the reasons-by-counsellor matrix shows",
      "Inbox presets match plan 5.I, filters fold, chips remove a single filter, and every preset round-trips"
    ]
  },
  {
    "key": "1B-HOUSEKEEPING",
    "title": "People list and role fix, AI assistant wording, Site status and go-live summary, readable activity log",
    "dependsOn": ["1B-NUMBERS", "1B-FAMILY"],
    "owns": [
      "src/lib/console/**",
      "src/components/portal/audit-labels.ts",
      "src/components/portal/audit-group.ts",
      "src/components/portal/audit-log.test.ts",
      "src/components/portal/people-ui.test.ts",
      "src/app/[lang]/(portal)/admin/status/page.tsx",
      "src/components/console/status/**",
      "src/i18n/messages/en/console-people.ts",
      "src/i18n/messages/hi/console-people.ts",
      "src/components/portal/UserManager.tsx",
      "src/app/[lang]/(portal)/admin/users/page.tsx",
      "src/app/api/admin/users/route.ts",
      "src/app/api/admin/users/admin-users.test.ts",
      "src/components/crm/areas/PeoplePicker.tsx (request body only, if it lacks the CRM role)",
      "src/components/portal/AuditLog.tsx",
      "src/app/[lang]/(portal)/admin/audit/page.tsx (only if needed)",
      "src/i18n/messages/en/mcp.ts",
      "src/i18n/messages/hi/mcp.ts",
      "src/components/mcp-admin/McpExplainer.tsx (wording only)",
      "src/lib/mcp/tools/status.ts (descriptions only)",
      "src/lib/mcp/tools/progress.ts (descriptions only)",
      "MCP tests that assert those descriptions",
      "src/components/portal/portal-ui.test.ts (user manager and audit blocks, wave 3)"
    ],
    "task": "Read docs/admin-phase-1b-plan.md sections 1, 5.L, 5.M, 5.N, 7-12, AGENTS.md and the Next 16 guides. BUILD: (1) People: UserManager filter chips with counts; staff rows show CRM role, CRM access, LR area names, legacy centre scope, LR away-until, open enquiries, links to /crm/settings/areas and /crm/staff; Create account for role staff (super admin per LR) requires a CRM role with no preselection and offers an optional areas multi-select from GET /api/crm/areas with the no-areas warning. POST /api/admin/users: staff without crm.crmRole -> 422 {crm:['Choose the CRM role.']}; remove the silent counsellor-every-centre default; GET enriches crm with {areaIds, areaNames, awayUntil, openLeads}. Grep every caller of /api/admin/users and fix PeoplePicker.tsx's request body if it lacks the role. (2) AI assistant wording: mcp.ts en/hi titles 'AI assistant access', the intro of 5.L, plain service names; McpExplainer wording; MCP tool descriptions in tools/status.ts and tools/progress.ts say 'Rancho (the AI doubt solver)' instead of 'Ask Aspire' with data keys unchanged. Add no MCP tools or scopes. (3) Site status: src/lib/console/status.ts building every row of the 5.M table, each in try/catch -> 'Unknown', no absolute paths or secrets; free-disk warning under 3 GB with the build note; 'Pre-release database snapshots' and 'Off-server backups: Not set up (deferred by owner, 21 Oct 2026).' rows; src/lib/console/go-live.ts static list of 5.M dated 22 Oct 2026 with its note; /admin/status page (admin only, English constants, preview renders '—', no webhook test button). (4) Activity log: audit-labels.ts English registry covering every code listed in 5.N (grep the codebase for recordAudit/crmAudit/consoleAudit actions, CRM_AUDIT, QB_AUDIT_ACTIONS, src/app/api/admin/qb/_lib/http.ts codes, LR super-admin audit codes, MCP codes, CONSOLE_AUDIT, admin.mocktest_profile_remove, seed.report, and page-layout codes if they already exist); lookup order translated ACTION_KEYS -> registry -> raw code; audit-group.ts groupAuditRows (30-minute window, crm.lead_view and mcp.call, same actor and action, consecutive) rendered as a summary with <details> listing every entry; nothing deleted; wire into AuditLog.tsx. Strings for People in console-people.ts en+hi; status and audit labels English only. TESTS: admin-users.test.ts (422 without role; GET enrichment; super-admin rule unchanged); people-ui.test.ts (staff row markup with role, areas, away); status.test.ts (each row with mocked env and fs; failure -> Unknown; no absolute path or secret; 3 GB threshold; go-live statuses); audit-log.test.ts (registry completeness importing every audit constant; grouping window edge, actor change, other action breaking a group, counts preserved; markup); MCP description test (no 'Ask Aspire'); mcp messages en/hi same shape. RUN: npx vitest run src/lib/console src/components/portal/audit-log.test.ts src/components/portal/people-ui.test.ts src/components/portal/portal-ui.test.ts src/app/api/admin/users src/lib/mcp src/app/api/mcp --maxWorkers=1, then one npx tsc --noEmit, then eslint on touched files. REPORT Hindi lines and shared-suite changes.",
    "acceptance": [
      "The People list shows staff CRM role, areas, away status and open leads; staff creation without a role is refused with a clear message",
      "'Ask Aspire' no longer appears in MCP descriptions; 'AI assistant access' wording in English and Hindi; no MCP tools or scopes added",
      "/admin/status shows every row of plan 5.M, warns under 3 GB, shows backups 'Not set up (deferred)' and the go-live summary",
      "The activity log labels every known code (completeness test) and groups views without dropping rows"
    ]
  },
  {
    "key": "1B-INTEGRATE",
    "title": "Integrate, verify, document and deploy R2 (Phase 1b)",
    "dependsOn": ["1B-CORE", "1B-CALLS", "1B-SOURCES", "1B-NUMBERS", "1B-FAMILY", "1B-HOUSEKEEPING"],
    "owns": [
      "any file needed to apply package-reported shared-suite fixes",
      "src/components/portal/console-roadmap.ts",
      "src/i18n/messages/en/portal.ts (roadmap keys)",
      "src/i18n/messages/hi/portal.ts (roadmap keys)",
      "src/components/portal/areas.ts (only if the 768 px sidebar check fails)",
      "src/app/api/crm/console-smoke.test.ts",
      "docs/agent-decisions.md",
      "docs/crm.md",
      "docs/api.md",
      "docs/hindi-review-register.md",
      "docs/aspire-approval-checklist.md"
    ],
    "task": "Follow docs/admin-phase-1b-plan.md section 14 exactly. (1) npx tsc --noEmit once; vitest in two halves with --maxWorkers=1 (src/lib src/app, then src/components src/test src/i18n); eslint on every changed file; apply every shared-suite change the packages reported. (2) Roadmap: remove shipped 1b items from console-roadmap.ts and their portal.admin.coming.items.* keys (en, hi); p1b status 'Released'; keep anything cut. (3) Sidebar: at 768 px a manager's sidebar reaches Reports without scrolling; else collapse the Manage group by default. (4) Docs: re-grep docs/ for D-0xx and record D-078..D-083 (section 17) in agent-decisions.md, or the next free ids if taken (never D-059..D-077); crm.md console section (tables, APIs, role home, new inbox params, effective-centre filter); api.md new routes; hindi-review-register.md every package's Hindi lines plus the 16 template bodies; aspire-approval-checklist.md WA-1..WA-8, TG-1, MAP-1, MAP-2, AI-1, DQ-12. (5) Write src/app/api/crm/console-smoke.test.ts covering the 8 smoke steps of section 14.6 on a temporary AUTH_DB_PATH and run it. (6) One headless Chrome pass (one browser only) at 375/768/1280 px, en and hi, over the pages in 14.7 (start the dev server with NODE_OPTIONS=--max-old-space-size=3072; stop it and delete scratch screenshots afterwards); check no horizontal scroll, focus order, no console errors, /admin preview mode. (7) Commit on feature/admin-console-1b (branched from the R1 commit) with the session's attribution line. (8) Deploy R2 per 14.9: try git push; upload by git archive + ssh with checksum compare; VACUUM INTO snapshot /opt/aspire-web/backups/pre-<sha>.sqlite inside the container; df -h /; docker builder prune -f; if under 3 GB free delete the oldest rollback image (keep current + newest rollback) and report it; build in background with the 300 MB watchdog; set RELEASE; docker compose up -d; GET /api/ask; read-only check that crm_lead_details, crm_lead_attribution, crm_targets, crm_wa_templates, crm_duplicate_dismissals, crm_lost_reviews exist; public pages and the other VPS sites return 200; open /admin and /admin/status as super admin; keep 2 images; prune. If push or ssh is blocked: STOP, write the exact commands into the owner walkthrough and leave the release unapplied. Rollback = previous image + RELEASE revert. (9) Write the owner walkthrough note (the five owner steps, decision changes of section 18, anything cut, any blocked commands). Never touch src/components/home/**, carousels, sitemap, next.config.ts, src/proxy.ts, lead-gate, ask, mocktest, qb, deploy/**, package.json.",
    "acceptance": [
      "tsc, both vitest halves and eslint are green; all reported shared-suite fixes applied",
      "The smoke test passes all 8 steps, including numbers equal to their list totals for super admin and manager",
      "The Chrome pass finds no horizontal scroll, focus problems or console errors at 375/768/1280 px in en and hi",
      "Decisions recorded with free ids; crm.md, api.md, hindi register and approval checklist updated",
      "R2 is live with a pre-release snapshot, at most 2 release images, other VPS sites still 200, and /admin/status showing the release and 'Off-server backups: not set up (deferred)'; or, if access was blocked, exact commands staged for the owner"
    ]
  }
]
```
