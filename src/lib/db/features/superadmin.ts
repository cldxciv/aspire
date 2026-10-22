/**
 * SQLite schema for the "superadmin" feature (owner: LR-CORE; docs/lead-routing-plan.md §11, §12,
 * D-044). Applied on every open after the core migrations, so it MUST be idempotent: only
 * `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Never alters core tables.
 *
 * NOTE: loaded by plain Node too (scripts/*.mjs via connection.ts), so no runtime imports of
 * project files here. SQL that reads or writes this table lives in src/lib/db/super-admins.ts.
 *
 * - superadmin_grants: one row per admin account that is (or was) a super admin. A super admin is
 *   an ADMIN account with an active row here (`revoked_at IS NULL`); it is not a new role and is
 *   not stored in the session. A revoked grant keeps its row (so the one-time bootstrap never fires
 *   again); granting again re-activates the same row. `granted_by` NULL = bootstrap / CLI.
 */
export const schema = `
CREATE TABLE IF NOT EXISTS superadmin_grants (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  granted_at INTEGER NOT NULL,
  granted_by TEXT,
  granted_via TEXT NOT NULL CHECK (granted_via IN ('bootstrap','cli','admin')),
  revoked_at INTEGER,
  revoked_by TEXT
);
`;
