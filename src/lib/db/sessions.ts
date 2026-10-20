import "server-only";

import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

/**
 * `sessions` table access. Only the SHA-256 of a session token is ever stored: the
 * token itself lives in the user's cookie and nowhere else (src/lib/auth/sessions.ts).
 */

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  userAgent: string | null;
}

function mapSession(row: Record<string, SQLOutputValue>): SessionRecord {
  return {
    tokenHash: String(row.token_hash),
    userId: String(row.user_id),
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    lastSeenAt: Number(row.last_seen_at),
    userAgent: row.user_agent === null || row.user_agent === undefined ? null : String(row.user_agent),
  };
}

export function insertSession(
  db: DatabaseSync,
  input: { tokenHash: string; userId: string; now: number; expiresAt: number; userAgent: string | null },
): void {
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(input.tokenHash, input.userId, input.now, input.expiresAt, input.now, input.userAgent);
}

export function findSessionByTokenHash(db: DatabaseSync, tokenHash: string): SessionRecord | null {
  const row = db
    .prepare(
      "SELECT token_hash, user_id, created_at, expires_at, last_seen_at, user_agent FROM sessions WHERE token_hash = ?",
    )
    .get(tokenHash);
  return row ? mapSession(row) : null;
}

export function touchSession(db: DatabaseSync, tokenHash: string, lastSeenAt: number, expiresAt: number): void {
  db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?").run(
    lastSeenAt,
    expiresAt,
    tokenHash,
  );
}

export function deleteSession(db: DatabaseSync, tokenHash: string): boolean {
  return Number(db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash).changes) > 0;
}

/** Deletes every session of a user, optionally keeping one. Returns how many were deleted. */
export function deleteUserSessions(db: DatabaseSync, userId: string, options: { exceptTokenHash?: string } = {}): number {
  const result = options.exceptTokenHash
    ? db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(userId, options.exceptTokenHash)
    : db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return Number(result.changes);
}

export function deleteExpiredSessions(db: DatabaseSync, now: number): number {
  return Number(db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes);
}

/** Keeps only the `keep` most recently created sessions of a user. */
export function trimUserSessions(db: DatabaseSync, userId: string, keep: number): number {
  const result = db
    .prepare(
      `DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (
         SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at DESC, token_hash LIMIT ?
       )`,
    )
    .run(userId, userId, keep);
  return Number(result.changes);
}

export function countUserSessions(db: DatabaseSync, userId: string): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(userId);
  return Number(row?.n ?? 0);
}
