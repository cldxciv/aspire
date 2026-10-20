import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { countAttemptsSince, deleteAttemptById, deleteAttempts, insertAttempt, pruneAttempts } from "@/lib/db/attempts";

/**
 * Throttling for sign-in and password changes, stored in SQLite so it survives restarts
 * (single node; see connection.ts). Keys are hashed before storage.
 *
 * Every attempt is recorded BEFORE the (slow, async) password check, synchronously
 * together with the limit check, so parallel requests cannot all slip under the limit.
 * A successful attempt then removes its own rows (and clears the account's failures).
 *
 * Sign-in limits: 5 failed attempts per login id and 20 per client IP within 10 minutes.
 * The IP limit is looser because a classroom or centre often shares one public IP.
 */

export const THROTTLE_WINDOW_MS = 10 * 60 * 1000;

export const SIGN_IN_LIMITS = { perLoginId: 5, perIp: 20 } as const;
export const PASSWORD_CHANGE_LIMIT = 5;

export type ThrottleScope = "ip" | "login" | "pwchange";

interface ThrottleKey {
  scope: ThrottleScope;
  key: string;
  limit: number;
}

function keyHash(scope: ThrottleScope, key: string): string {
  return createHash("sha256").update(`${scope}:${key}`).digest("hex");
}

export type ThrottleCheck = { allowed: true; attemptIds: number[] } | { allowed: false; retryAfterSeconds: number };

/**
 * Checks every key against its limit; if all pass, records one attempt per key and
 * returns the row ids (pass them to `forgiveAttempt` on success). Synchronous on purpose.
 */
export function checkAndRecordAttempt(
  db: DatabaseSync,
  keys: readonly ThrottleKey[],
  now: number,
  windowMs: number = THROTTLE_WINDOW_MS,
): ThrottleCheck {
  const since = now - windowMs;
  let retryAfterMs = 0;
  for (const { scope, key, limit } of keys) {
    const { count, oldest } = countAttemptsSince(db, scope, keyHash(scope, key), since);
    if (count >= limit) retryAfterMs = Math.max(retryAfterMs, (oldest ?? now) + windowMs - now);
  }
  if (retryAfterMs > 0) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };

  pruneAttempts(db, since);
  return { allowed: true, attemptIds: keys.map(({ scope, key }) => insertAttempt(db, scope, keyHash(scope, key), now)) };
}

/** Undoes the attempt rows of a request that turned out to be legitimate. */
export function forgiveAttempt(db: DatabaseSync, attemptIds: readonly number[]): void {
  for (const id of attemptIds) deleteAttemptById(db, id);
}

/** Clears all recorded failures for one key (successful sign-in, admin password reset). */
export function clearAttempts(db: DatabaseSync, scope: ThrottleScope, key: string): void {
  deleteAttempts(db, scope, keyHash(scope, key));
}
