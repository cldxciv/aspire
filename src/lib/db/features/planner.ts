/**
 * SQLite schema for the "planner" feature (owner: A4-PLANNER). Applied on every open after the core
 * migrations, so it MUST be idempotent: only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF
 * NOT EXISTS`. Prefix tables with `planner_`. Never alter core tables (users, sessions, …).
 *
 * - planner_state: one validated JSON document per signed-in student (≤ 64 KB, see
 *   src/lib/planner/state.ts). Guests never reach the server (D-034).
 * - planner_daily: per-day XP / blocks / reviews derived from that document on every save
 *   (server-clamped), for the weekly leaderboard and the parent summary.
 * - planner_leaderboard: opt-in rows only. A student appears on the leaderboard only while a row
 *   exists; the nickname is the only thing shown (never login ids or real names unless typed).
 *
 * Data access lives in src/lib/planner/server/store.ts (this file must stay import-free, see
 * src/lib/db/connection.ts).
 */
export const schema = `
CREATE TABLE IF NOT EXISTS planner_state (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  client_updated_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS planner_daily (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  xp INTEGER NOT NULL,
  blocks INTEGER NOT NULL,
  reviews INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS planner_daily_day_idx ON planner_daily (day);

CREATE TABLE IF NOT EXISTS planner_leaderboard (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  opted_in_at INTEGER NOT NULL
);
`;
