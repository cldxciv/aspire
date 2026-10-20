/**
 * SQLite schema for the "crm" feature (owner: CRM-CORE; docs/crm.md, D-037 – D-042). Applied on every
 * open after the core migrations, so it MUST be idempotent: only `CREATE TABLE IF NOT EXISTS` /
 * `CREATE INDEX IF NOT EXISTS`. Prefix tables with `crm_`. Core-table changes (e.g. the `staff` role)
 * go through an append-only core migration in src/lib/db/connection.ts instead.
 *
 * NOTE: loaded by plain Node too (scripts/*.mjs via connection.ts), so no runtime imports of project
 * files here. All SQL that reads or writes these tables lives in src/lib/crm/repo/** (D-037).
 *
 * - crm_staff: CRM membership of `staff` accounts: counsellor | manager, centre scope (JSON array of
 *   centre slugs; empty = all centres), active flag. Admins need no row.
 * - crm_leads: one lead per family (unique E.164 phone while not erased). Personal fields are wiped on
 *   erase (D-042) and the row stays as an anonymised stub (`erased_at`). `staff_edited` (JSON array of
 *   field names) protects staff edits from later submissions. Times are epoch ms.
 * - crm_activities: the lead timeline. `body` is staff-written text only; `meta` is a small JSON
 *   object of structured facts.
 * - crm_tasks: follow-ups with due dates.
 * - crm_assignment_rules + crm_rr_cursors: auto-assignment (centre/program → pool, round-robin).
 * - crm_gate_passes: lead gate passes (one per browser that shared details before a tool result);
 *   SQL in src/lib/crm/repo/gate-passes.ts.
 */
export const schema = `
CREATE TABLE IF NOT EXISTS crm_staff (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  crm_role TEXT NOT NULL CHECK (crm_role IN ('counsellor', 'manager')),
  centre_slugs TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN (
    'new', 'contacted', 'counselling_booked', 'visited_or_demo', 'applied', 'test_taken', 'offer', 'enrolled', 'lost'
  )),
  furthest_stage TEXT NOT NULL DEFAULT 'new',
  lost_reason TEXT,
  assigned_to TEXT REFERENCES users (id) ON DELETE SET NULL,
  centre_slug TEXT,
  program_interest TEXT,
  current_class TEXT,
  source TEXT NOT NULL,
  tool TEXT,
  page TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  student_name TEXT,
  guardian_name TEXT,
  contact_name TEXT,
  phone_e164 TEXT,
  email TEXT,
  message TEXT,
  consent_text_version TEXT,
  consent_at INTEGER,
  staff_edited TEXT NOT NULL DEFAULT '[]',
  submission_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at INTEGER NOT NULL,
  next_task_due_at INTEGER,
  erased_at INTEGER,
  erased_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_phone_uq ON crm_leads (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_leads_assignee_idx ON crm_leads (assigned_to, last_activity_at);
CREATE INDEX IF NOT EXISTS crm_leads_centre_idx ON crm_leads (centre_slug, last_activity_at);
CREATE INDEX IF NOT EXISTS crm_leads_stage_idx ON crm_leads (stage, last_activity_at);
CREATE INDEX IF NOT EXISTS crm_leads_due_idx ON crm_leads (next_task_due_at) WHERE next_task_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_leads_created_idx ON crm_leads (created_at);
CREATE INDEX IF NOT EXISTS crm_leads_activity_idx ON crm_leads (last_activity_at);

CREATE TABLE IF NOT EXISTS crm_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  body TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_activities_lead_idx ON crm_activities (lead_id, at);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  done_at INTEGER,
  done_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  assignee_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_tasks_assignee_idx ON crm_tasks (assignee_id, done_at, due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_lead_idx ON crm_tasks (lead_id, done_at, due_at);

CREATE TABLE IF NOT EXISTS crm_assignment_rules (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  centre_slug TEXT,
  program_interest TEXT,
  member_ids TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_rr_cursors (
  scope_key TEXT PRIMARY KEY,
  last_user_id TEXT,
  updated_at INTEGER NOT NULL
);

-- Lead gate (docs/lead-gate-plan.md, added 2026-10-21): one row per browser that shared contact
-- details before a free tool's result. pass_hash = SHA-256 of the random pass id inside the signed
-- aspire_tool_pass cookie (the id itself is never stored). Deleted on "Not you?", sign-out, consent
-- withdrawal and erase; at most 10 per lead; fixed expiry (no sliding).
CREATE TABLE IF NOT EXISTS crm_gate_passes (
  pass_hash TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consent_version TEXT NOT NULL,
  submitted_by TEXT CHECK (submitted_by IS NULL OR submitted_by IN ('student', 'parent')),
  record_use INTEGER NOT NULL DEFAULT 0 CHECK (record_use IN (0, 1))
);
CREATE INDEX IF NOT EXISTS crm_gate_passes_lead_idx ON crm_gate_passes (lead_id, created_at);
CREATE INDEX IF NOT EXISTS crm_gate_passes_expires_idx ON crm_gate_passes (expires_at);
-- tool_use retention sweep (type + age).
CREATE INDEX IF NOT EXISTS crm_activities_type_idx ON crm_activities (type, at);
`;
