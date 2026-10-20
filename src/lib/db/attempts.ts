import "server-only";

import type { DatabaseSync } from "node:sqlite";

/**
 * `login_attempts`: sign-in / password-change attempts used for throttling
 * (src/lib/auth/throttle.ts). Keys (client IP, login id, user id) are stored only as
 * SHA-256 hashes; rows older than the throttle window are pruned.
 */

export function countAttemptsSince(
  db: DatabaseSync,
  scope: string,
  keyHash: string,
  since: number,
): { count: number; oldest: number | null } {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM login_attempts WHERE scope = ? AND key_hash = ? AND created_at > ?",
    )
    .get(scope, keyHash, since);
  const count = Number(row?.n ?? 0);
  const oldest = row?.oldest;
  return { count, oldest: count > 0 && oldest !== null && oldest !== undefined ? Number(oldest) : null };
}

/** Records one attempt and returns its row id. */
export function insertAttempt(db: DatabaseSync, scope: string, keyHash: string, now: number): number {
  const result = db
    .prepare("INSERT INTO login_attempts (scope, key_hash, created_at) VALUES (?, ?, ?)")
    .run(scope, keyHash, now);
  return Number(result.lastInsertRowid);
}

export function deleteAttemptById(db: DatabaseSync, id: number): void {
  db.prepare("DELETE FROM login_attempts WHERE id = ?").run(id);
}

export function deleteAttempts(db: DatabaseSync, scope: string, keyHash: string): void {
  db.prepare("DELETE FROM login_attempts WHERE scope = ? AND key_hash = ?").run(scope, keyHash);
}

export function pruneAttempts(db: DatabaseSync, before: number): void {
  db.prepare("DELETE FROM login_attempts WHERE created_at <= ?").run(before);
}
