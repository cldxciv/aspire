/**
 * SQLite schema for the "predictor" feature (owner: A1-PREDICTOR). Applied on every open after the core
 * migrations, so it MUST be idempotent: only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF
 * NOT EXISTS`. Prefix tables with `predictor_`. Never alter core tables (users, sessions, …).
 */
export const schema = "";
