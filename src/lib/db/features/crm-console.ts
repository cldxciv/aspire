/**
 * Feature schema "crm_console" (admin console Phase 1b; docs/admin-phase-1b-plan.md §3, owner:
 * 1B-CORE). Applied after the core migrations and right after "crm_intake", so it MUST stay
 * idempotent: only `CREATE TABLE/INDEX IF NOT EXISTS`, no ALTER, no data, no runtime imports.
 *
 * CHECK rule (feature schemas can never ALTER, so a CHECK can never be widened): CHECKs are used
 * only for closed state machines, 0/1 flags, formats, lengths and ranges. Open vocabularies (board,
 * target exam, how they heard, preferred time, who decides, target programme and metric, template
 * context) get a length CHECK only and are validated in zod against the tuples in
 * src/lib/crm/console/types.ts, so a new value is a code change, not a table rebuild.
 *
 * - crm_lead_details: more enquiry details, one row per lead (personal columns wiped on erase).
 * - crm_lead_attribution: the non-personal referrer host kept after erase (written only by erase).
 * - crm_targets: session targets per centre × programme × metric ('S2026' = 1 Apr 2026 – 31 Mar 2027 IST).
 * - crm_wa_templates: staff WhatsApp templates (wa.me prefilled text; the system never sends, D-041).
 * - crm_duplicate_dismissals: "Not the same family" (ordered pair, ids only).
 * - crm_lost_reviews: one row per reviewed lost event (the stage_change activity's `at`).
 *
 * SQL that reads or writes these tables lives in src/lib/crm/repo/console-*.ts (D-037).
 */
export const schema = `
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

CREATE TABLE IF NOT EXISTS crm_lead_attribution (
  lead_id TEXT PRIMARY KEY REFERENCES crm_leads (id) ON DELETE CASCADE,
  referrer_host TEXT CHECK (referrer_host IS NULL OR length(referrer_host) <= 100),
  kept_at INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS crm_wa_templates (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 40 AND key GLOB '[a-z]*' AND key NOT GLOB '*[^a-z0-9_]*'),
  context TEXT NOT NULL DEFAULT 'general' CHECK (length(context) BETWEEN 1 AND 40),
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  body_en TEXT NOT NULL CHECK (length(body_en) BETWEEN 1 AND 700),
  body_hi TEXT NOT NULL CHECK (length(body_hi) BETWEEN 1 AND 700),
  body_hinglish TEXT NOT NULL CHECK (length(body_hinglish) BETWEEN 1 AND 700),
  version INTEGER NOT NULL DEFAULT 1,
  seeded INTEGER NOT NULL DEFAULT 1 CHECK (seeded IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  approved_at INTEGER,
  approved_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_wa_templates_ctx_idx ON crm_wa_templates (context, status, position);

CREATE TABLE IF NOT EXISTS crm_duplicate_dismissals (
  lead_a TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  lead_b TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  dismissed_at INTEGER NOT NULL,
  dismissed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (lead_a, lead_b),
  CHECK (lead_a < lead_b)
);

CREATE TABLE IF NOT EXISTS crm_lost_reviews (
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  lost_at INTEGER NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('kept','reopened')),
  reviewed_at INTEGER NOT NULL,
  reviewed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (lead_id, lost_at)
);
CREATE INDEX IF NOT EXISTS crm_lost_reviews_at_idx ON crm_lost_reviews (reviewed_at);
`;
