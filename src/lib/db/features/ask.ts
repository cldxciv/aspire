import type { DatabaseSync } from "node:sqlite";

/**
 * SQLite schema and queries for "Ask Aspire" (owner: A3-ASK; docs/ask-aspire.md, D-034/D-035).
 * Applied on every open after the core migrations, so the schema MUST stay idempotent: only
 * `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Never alter core tables.
 *
 * NOTE: loaded by plain Node too (scripts/*.mjs via connection.ts), so no runtime imports of
 * project files here; type-only imports are fine.
 *
 * - `ask_usage`: questions asked per key per day (Asia/Kolkata calendar day). `key_hash` is a
 *   SHA-256 of the scope (guest IP / account id / global) AND the day, so rows of different days
 *   cannot be linked to each other. Rows older than a couple of days are pruned. No question
 *   text, image or answer is ever stored.
 * - `ask_topics`: signed-in STUDENTS only. Subject + short topic label the model tagged each
 *   doubt with, how often and when last seen (weak-topic tracking for the portal / planner).
 *   Deleted with the account (ON DELETE CASCADE). Guests: nothing is stored.
 */
export const schema = `
  CREATE TABLE IF NOT EXISTS ask_usage (
    key_hash TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (key_hash, day)
  );
  CREATE INDEX IF NOT EXISTS ask_usage_day_idx ON ask_usage (day);

  CREATE TABLE IF NOT EXISTS ask_topics (
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    subject TEXT NOT NULL CHECK (subject IN ('physics', 'chemistry', 'maths', 'biology')),
    topic_key TEXT NOT NULL,
    topic TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1 CHECK (count >= 1),
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    PRIMARY KEY (user_id, subject, topic_key)
  );
  CREATE INDEX IF NOT EXISTS ask_topics_user_idx ON ask_topics (user_id, count DESC, last_seen DESC);
`;

// ---------------------------------------------------------------------------
// ask_usage
// ---------------------------------------------------------------------------

/** Questions recorded for `keyHash` on `day` (0 when none). */
export function getUsageCount(db: DatabaseSync, keyHash: string, day: string): number {
  const row = db.prepare("SELECT count FROM ask_usage WHERE key_hash = ? AND day = ?").get(keyHash, day);
  return Number(row?.count ?? 0);
}

/** Adds one question for `keyHash` on `day`. */
export function incrementUsage(db: DatabaseSync, keyHash: string, day: string, now: number): void {
  db.prepare(
    `INSERT INTO ask_usage (key_hash, day, count, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT (key_hash, day) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`,
  ).run(keyHash, day, now);
}

/** Gives one question back (upstream failure before any answer). Never goes below zero. */
export function decrementUsage(db: DatabaseSync, keyHash: string, day: string, now: number): void {
  db.prepare("UPDATE ask_usage SET count = MAX(count - 1, 0), updated_at = ? WHERE key_hash = ? AND day = ?").run(
    now,
    keyHash,
    day,
  );
}

/** Deletes usage rows for days before `oldestDayToKeep` (ISO `YYYY-MM-DD`, compared as text). */
export function pruneUsage(db: DatabaseSync, oldestDayToKeep: string): void {
  db.prepare("DELETE FROM ask_usage WHERE day < ?").run(oldestDayToKeep);
}

// ---------------------------------------------------------------------------
// ask_topics
// ---------------------------------------------------------------------------

export type AskSubject = "physics" | "chemistry" | "maths" | "biology";

export interface AskTopicRow {
  subject: AskSubject;
  topic: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

/** Records one doubt on (subject, topic) for a student. `topicKey` is the normalised label. */
export function upsertTopic(
  db: DatabaseSync,
  input: { userId: string; subject: AskSubject; topicKey: string; topic: string; now: number },
): void {
  db.prepare(
    `INSERT INTO ask_topics (user_id, subject, topic_key, topic, count, first_seen, last_seen)
     VALUES (?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT (user_id, subject, topic_key) DO UPDATE SET
       count = count + 1, topic = excluded.topic, last_seen = excluded.last_seen`,
  ).run(input.userId, input.subject, input.topicKey, input.topic, input.now, input.now);
}

/** A student's topics, most-asked first (ties: most recent first). */
export function listTopics(
  db: DatabaseSync,
  userId: string,
  options: { limit?: number; subject?: AskSubject } = {},
): AskTopicRow[] {
  const limit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 10)));
  const rows = options.subject
    ? db
        .prepare(
          `SELECT subject, topic, count, first_seen, last_seen FROM ask_topics
           WHERE user_id = ? AND subject = ? ORDER BY count DESC, last_seen DESC LIMIT ?`,
        )
        .all(userId, options.subject, limit)
    : db
        .prepare(
          `SELECT subject, topic, count, first_seen, last_seen FROM ask_topics
           WHERE user_id = ? ORDER BY count DESC, last_seen DESC LIMIT ?`,
        )
        .all(userId, limit);
  return rows.map((row) => ({
    subject: String(row.subject) as AskSubject,
    topic: String(row.topic),
    count: Number(row.count),
    firstSeen: Number(row.first_seen),
    lastSeen: Number(row.last_seen),
  }));
}

/** Removes every stored topic of a student (e.g. on request). Returns the number of rows deleted. */
export function deleteTopics(db: DatabaseSync, userId: string): number {
  return Number(db.prepare("DELETE FROM ask_topics WHERE user_id = ?").run(userId).changes);
}
