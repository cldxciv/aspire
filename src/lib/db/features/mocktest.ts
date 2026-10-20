/**
 * SQLite schema for the "mocktest" feature (owner: A2-MOCKTEST). Applied on every open after the core
 * migrations, so it MUST be idempotent: only `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF
 * NOT EXISTS`. Prefix tables with `mocktest_`. Never alter core tables (users, sessions, …).
 *
 * - mocktest_attempts: saved attempts of signed-in students (D-034). Scores are computed by the
 *   server from the answer key. One row per (user, client attempt id) so a retried save is a no-op.
 *   `window_id`: the weekly window the attempt belongs to (server time; see mocktest_attempt_meta).
 *   `started_at` / `submitted_at` / `time_spent` are the BROWSER's figures, kept for the student's
 *   own analysis only — never used for ranking (QA-SEC-M6 M1).
 * - mocktest_profiles: opt-in leaderboard profile — pseudonymous nickname, optional district (fixed
 *   list) and optional school, used only in the aggregate schools table when `show_school` = 1.
 *   Never login ids.
 * - mocktest_starts (QA-SEC-M6 M1): server-issued attempt starts. Only the SHA-256 of the opaque
 *   start token is stored, with the student (NULL for guests and other roles), test, the weekly
 *   window open at the start (server time) and the server start time. A start can be used for one
 *   saved attempt (`used_at`). Rows are pruned a day after they expire.
 * - mocktest_attempt_meta (QA-SEC-M6 M1 / L7): the server's own facts about a saved attempt —
 *   server start / save times and duration, whether it is leaderboard-eligible (else why it is
 *   practice), and the public certificate verification id (a hash of the attempt id).
 *   A separate table because the feature schema may not ALTER existing tables.
 * Rows are deleted with the user (ON DELETE CASCADE).
 */
export const schema = `
CREATE TABLE IF NOT EXISTS mocktest_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  window_id TEXT,
  client_attempt_id TEXT NOT NULL,
  answers TEXT NOT NULL,
  time_spent TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  wrong INTEGER NOT NULL,
  unattempted INTEGER NOT NULL,
  time_taken_sec INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, client_attempt_id)
);
CREATE INDEX IF NOT EXISTS mocktest_attempts_user_idx ON mocktest_attempts (user_id, created_at);
CREATE INDEX IF NOT EXISTS mocktest_attempts_board_idx ON mocktest_attempts (test_id, window_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS mocktest_attempts_test_time_idx ON mocktest_attempts (test_id, created_at);

CREATE TABLE IF NOT EXISTS mocktest_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  district TEXT,
  school TEXT,
  show_school INTEGER NOT NULL DEFAULT 0 CHECK (show_school IN (0, 1)),
  leaderboard_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (leaderboard_opt_in IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mocktest_starts (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  window_id TEXT,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX IF NOT EXISTS mocktest_starts_expiry_idx ON mocktest_starts (expires_at);

CREATE TABLE IF NOT EXISTS mocktest_attempt_meta (
  attempt_id TEXT PRIMARY KEY REFERENCES mocktest_attempts (id) ON DELETE CASCADE,
  verify_id TEXT NOT NULL UNIQUE,
  leaderboard INTEGER NOT NULL DEFAULT 0 CHECK (leaderboard IN (0, 1)),
  practice_reason TEXT,
  server_started_at INTEGER,
  server_submitted_at INTEGER NOT NULL,
  duration_sec INTEGER
);
`;
