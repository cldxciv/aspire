/**
 * SQLite schema for the "crm_intake" feature: lead routing, the 1-hour call rule and Meta Lead Ads
 * (owner: LR-CORE; docs/lead-routing-plan.md §12, D-044 – D-048). Applied on every open after the
 * core migrations and after the "crm" feature, so it MUST be idempotent: only `CREATE TABLE IF NOT
 * EXISTS` / `CREATE INDEX IF NOT EXISTS`. `crm_leads` is never altered: per-lead additions live in
 * side tables (`crm_lead_routing`, `crm_sla_clocks`, `crm_external_refs`).
 *
 * NOTE: loaded by plain Node too (scripts/*.mjs via connection.ts), so no runtime imports of
 * project files here. Seed data (the 12 HP districts) is written by code (src/lib/crm/routing),
 * never by this SQL. All SQL that reads or writes these tables lives in src/lib/crm/repo/**,
 * src/lib/crm/intake/** and src/lib/crm/meta/**.
 *
 * - crm_settings: one JSON document per key (`calling_hours`, `speed_rule`, `routing`,
 *   `areas_seed`, `meta_config`, `meta_status`); `version` is the optimistic lock.
 * - crm_areas / crm_area_centres / crm_area_aliases / crm_area_members: areas (HP districts), the
 *   centres in them, the place names that resolve to them, and the area heads / executives.
 * - crm_staff_scope: an explicit area scope for a manager (no row = legacy centre scope).
 * - crm_staff_availability: "Away until …".
 * - crm_lead_routing: the area a lead was routed to, how, and the family's words (wiped on erase).
 * - crm_sla_clocks: first-call clocks (one open clock per lead at most).
 * - crm_external_refs: idempotency for Meta lead ids and keyed CSV refs (kept after erase).
 * - crm_erase_suppressions: keyed HMAC of an erased family's phone (old lists cannot bring it back).
 * - crm_import_batches: CSV imports (counts only).
 * - crm_meta_inbox: Meta lead ids waiting to be fetched (ids only, never answers).
 * - crm_integration_secrets: sealed Meta credentials (secret-box v1 envelopes).
 */
export const schema = `
CREATE TABLE IF NOT EXISTS crm_settings (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 64),
  value TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS crm_areas (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  name_en TEXT NOT NULL, name_hi TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'district' CHECK (kind IN ('district','custom')),
  default_centre_slug TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  merged_into TEXT REFERENCES crm_areas (id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_area_centres (
  centre_slug TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES crm_areas (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_area_centres_area_idx ON crm_area_centres (area_id);
CREATE TABLE IF NOT EXISTS crm_area_aliases (
  alias_key TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES crm_areas (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('district','town','spelling','hindi','border')),
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_area_aliases_area_idx ON crm_area_aliases (area_id);
CREATE TABLE IF NOT EXISTS crm_area_members (
  area_id TEXT NOT NULL REFERENCES crm_areas (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  centre_slug TEXT,
  takes_leads INTEGER NOT NULL DEFAULT 0 CHECK (takes_leads IN (0,1)),
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (area_id, user_id)
);
CREATE INDEX IF NOT EXISTS crm_area_members_user_idx ON crm_area_members (user_id);
CREATE TABLE IF NOT EXISTS crm_staff_scope (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('areas')),
  set_at INTEGER NOT NULL,
  set_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_staff_availability (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  away_until INTEGER NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 80),
  set_at INTEGER NOT NULL,
  set_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS crm_lead_routing (
  lead_id TEXT PRIMARY KEY REFERENCES crm_leads (id) ON DELETE CASCADE,
  area_id TEXT REFERENCES crm_areas (id) ON DELETE SET NULL,
  match TEXT CHECK (match IS NULL OR match IN ('centre','district','town','spelling','hindi','border','fuzzy','manual')),
  outcome TEXT NOT NULL CHECK (outcome IN ('area','unknown','ambiguous','outside_hp','empty')),
  place_input TEXT,
  place_key TEXT,
  gate_only INTEGER NOT NULL DEFAULT 0 CHECK (gate_only IN (0,1)),
  routed_at INTEGER NOT NULL,
  routed_by TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS crm_lead_routing_area_idx ON crm_lead_routing (area_id);
CREATE INDEX IF NOT EXISTS crm_lead_routing_unmatched_idx ON crm_lead_routing (outcome, place_key);
CREATE TABLE IF NOT EXISTS crm_sla_clocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id TEXT NOT NULL REFERENCES crm_leads (id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('new','reopened','import')),
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
  tier1_at INTEGER, tier2_at INTEGER,
  policy_version INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT CHECK (resolution IS NULL OR resolution IN ('attempt','closed','erased')),
  first_attempt_at INTEGER,
  first_attempt_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  first_attempt_channel TEXT CHECK (first_attempt_channel IS NULL OR first_attempt_channel IN ('call','whatsapp','stage')),
  assignee_at_due TEXT REFERENCES users (id) ON DELETE SET NULL,
  work_ms INTEGER,
  met INTEGER CHECK (met IS NULL OR met IN (0,1)),
  attempts INTEGER NOT NULL DEFAULT 0,
  retries_created INTEGER NOT NULL DEFAULT 0,
  reached_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_sla_open_uq ON crm_sla_clocks (lead_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS crm_sla_started_idx ON crm_sla_clocks (started_at);
CREATE INDEX IF NOT EXISTS crm_sla_open_idx ON crm_sla_clocks (resolved_at, due_at);
CREATE INDEX IF NOT EXISTS crm_sla_lead_idx ON crm_sla_clocks (lead_id);
CREATE TABLE IF NOT EXISTS crm_external_refs (
  provider TEXT NOT NULL CHECK (provider IN ('meta','csv')),
  external_id TEXT NOT NULL,
  lead_id TEXT REFERENCES crm_leads (id) ON DELETE SET NULL,
  batch_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, external_id)
);
CREATE INDEX IF NOT EXISTS crm_external_refs_lead_idx ON crm_external_refs (lead_id);
CREATE TABLE IF NOT EXISTS crm_erase_suppressions (
  phone_hash TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  erased_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS crm_import_batches (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('meta_csv','csv')),
  file_name TEXT,
  file_sha256 TEXT,
  consent_basis TEXT NOT NULL,
  start_clock INTEGER NOT NULL CHECK (start_clock IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','finished')),
  rows_total INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL DEFAULT 0, attached INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0, invalid INTEGER NOT NULL DEFAULT 0,
  actor_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS crm_meta_inbox (
  leadgen_id TEXT PRIMARY KEY CHECK (length(leadgen_id) BETWEEN 5 AND 30),
  page_id TEXT, form_id TEXT, ad_id TEXT, adgroup_id TEXT,
  meta_created_at INTEGER,
  via TEXT NOT NULL CHECK (via IN ('webhook','sync','manual')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','held','processing','imported','duplicate','test','failed','unavailable','ignored')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  last_error TEXT,
  lead_id TEXT REFERENCES crm_leads (id) ON DELETE SET NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS crm_meta_inbox_due_idx ON crm_meta_inbox (status, next_attempt_at);
CREATE TABLE IF NOT EXISTS crm_integration_secrets (
  provider TEXT NOT NULL CHECK (provider IN ('meta')),
  name TEXT NOT NULL CHECK (name IN ('app_secret','access_token','page_token','verify_token')),
  sealed TEXT NOT NULL,
  key_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  PRIMARY KEY (provider, name)
);
`;
