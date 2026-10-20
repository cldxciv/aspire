/**
 * SQLite schema for the "crm" feature (owner: CRM-CORE). Applied on every open after the core
 * migrations, so it MUST be idempotent: only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF
 * NOT EXISTS`. Prefix tables with `crm_`. Core-table changes (e.g. a new role) go through an
 * append-only core migration in src/lib/db/connection.ts instead.
 */
export const schema = "";
