import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";
import { decrementUsage, getUsageCount, incrementUsage, pruneUsage } from "@/lib/db/features/ask";

/**
 * Daily question allowances (D-035), stored in SQLite (`ask_usage`) so they survive restarts.
 * The "day" is the calendar day in India (Asia/Kolkata, UTC+5:30, no daylight saving), so the
 * allowance resets at midnight for students.
 *
 * Keys are hashed together with the day, so stored rows cannot be linked across days, and
 * rows older than two days are deleted. Raw IP addresses and account ids are never stored.
 *
 * The check and the increment happen synchronously in one write transaction, so parallel
 * requests cannot all slip under the limit (same pattern as src/lib/auth/throttle.ts).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** `YYYY-MM-DD` of `now` in India. */
export function istDay(now: number): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Seconds until the next midnight in India (at least 1). */
export function secondsUntilNextIstDay(now: number): number {
  const shifted = now + IST_OFFSET_MS;
  const next = (Math.floor(shifted / DAY_MS) + 1) * DAY_MS;
  return Math.max(1, Math.ceil((next - shifted) / 1000));
}

/** Whose allowance a request uses: a guest's IP, or a signed-in account id. */
export interface UsageKey {
  scope: "ip" | "user";
  id: string;
}

export function usageKeyHash(scope: UsageKey["scope"] | "global", id: string, day: string): string {
  return createHash("sha256").update(`ask-usage:${day}:${scope}:${id}`).digest("hex");
}

export type Reservation =
  | { allowed: true; used: number; remaining: number; limit: number; release: () => void }
  | { allowed: false; reason: "limit" | "global"; retryAfterSeconds: number; limit: number };

/**
 * Checks the key's and the site-wide allowance for today and, if both have room, counts one
 * question. `release()` gives it back (call it only when the answer failed before any text).
 */
export function reserveQuestion(
  db: DatabaseSync,
  input: { key: UsageKey; limit: number; globalLimit: number; now: number },
): Reservation {
  const { key, limit, globalLimit, now } = input;
  const day = istDay(now);
  const retryAfterSeconds = secondsUntilNextIstDay(now);
  const keyHash = usageKeyHash(key.scope, key.id, day);
  const globalHash = usageKeyHash("global", "all", day);

  return withTransaction(db, (): Reservation => {
    const used = getUsageCount(db, keyHash, day);
    if (used >= limit) return { allowed: false, reason: "limit", retryAfterSeconds, limit };
    if (getUsageCount(db, globalHash, day) >= globalLimit) {
      return { allowed: false, reason: "global", retryAfterSeconds, limit };
    }
    pruneUsage(db, istDay(now - 2 * DAY_MS));
    incrementUsage(db, keyHash, day, now);
    incrementUsage(db, globalHash, day, now);
    let released = false;
    return {
      allowed: true,
      used: used + 1,
      remaining: Math.max(0, limit - used - 1),
      limit,
      release: () => {
        if (released) return;
        released = true;
        withTransaction(db, () => {
          decrementUsage(db, keyHash, day, Date.now());
          decrementUsage(db, globalHash, day, Date.now());
        });
      },
    };
  });
}

/**
 * Read-only check run BEFORE the request body (up to ~5.6 MB with a photo) is read: a key, or the
 * whole site, with nothing left today is refused cheaply, so it cannot keep the server buffering
 * and decoding large bodies (QA-SEC-M6). `null` means "may continue"; `reserveQuestion` still
 * makes the atomic decision afterwards.
 */
export function exhaustedAllowance(
  db: DatabaseSync,
  input: { key: UsageKey; limit: number; globalLimit: number; now: number },
): Extract<Reservation, { allowed: false }> | null {
  const { key, limit, globalLimit, now } = input;
  const day = istDay(now);
  const retryAfterSeconds = secondsUntilNextIstDay(now);
  if (getUsageCount(db, usageKeyHash(key.scope, key.id, day), day) >= limit) {
    return { allowed: false, reason: "limit", retryAfterSeconds, limit };
  }
  if (getUsageCount(db, usageKeyHash("global", "all", day), day) >= globalLimit) {
    return { allowed: false, reason: "global", retryAfterSeconds, limit };
  }
  return null;
}

/** Today's usage for a key, without counting anything. */
export function usageStatus(
  db: DatabaseSync,
  input: { key: UsageKey; limit: number; now: number },
): { used: number; remaining: number; resetsInSeconds: number } {
  const day = istDay(input.now);
  const used = getUsageCount(db, usageKeyHash(input.key.scope, input.key.id, day), day);
  return {
    used,
    remaining: Math.max(0, input.limit - used),
    resetsInSeconds: secondsUntilNextIstDay(input.now),
  };
}
