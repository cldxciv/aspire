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
 * rows older than two days are deleted. Raw IP addresses, account ids and lead ids are never stored.
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

/**
 * Whose allowance a request uses: a guest's IP, a signed-in account id, or (as an extra key next
 * to the IP) the family behind a lead-gate pass (`lead`: the CRM lead id), so one pass used from
 * several connections shares one allowance (docs/lead-gate-plan.md §5.6, critique 1.3).
 */
export interface UsageKey {
  scope: "ip" | "user" | "lead";
  id: string;
}

export function usageKeyHash(scope: UsageKey["scope"] | "global", id: string, day: string): string {
  return createHash("sha256").update(`ask-usage:${day}:${scope}:${id}`).digest("hex");
}

/**
 * The keys and limit of one question. `extraKeys` are checked and counted together with `key`,
 * with the same limit: a question is refused when ANY of them is used up (a lead-gate pass
 * holder: the IP and the family). A pass never raises an allowance; the site-wide cap stays the
 * real ceiling.
 */
export interface UsageInput {
  key: UsageKey;
  extraKeys?: readonly UsageKey[];
  limit: number;
  globalLimit: number;
  now: number;
}

/** Every key a request is charged to (`key` first, then `extraKeys`), hashed for `day`, without duplicates. */
function keyHashes(key: UsageKey, extraKeys: readonly UsageKey[] | undefined, day: string): string[] {
  return [...new Set([key, ...(extraKeys ?? [])].map((k) => usageKeyHash(k.scope, k.id, day)))];
}

/** Today's count of the busiest of `hashes` (every key has the same limit, so the busiest one decides). */
function mostUsed(db: DatabaseSync, hashes: readonly string[], day: string): number {
  return Math.max(0, ...hashes.map((hash) => getUsageCount(db, hash, day)));
}

export type Reservation =
  | { allowed: true; used: number; remaining: number; limit: number; release: () => void }
  | { allowed: false; reason: "limit" | "global"; retryAfterSeconds: number; limit: number };

/**
 * Checks the key's (and its extra keys') and the site-wide allowance for today and, if all have
 * room, counts one question on each. `release()` gives it back (call it only when the answer
 * failed before any text).
 */
export function reserveQuestion(db: DatabaseSync, input: UsageInput): Reservation {
  const { limit, globalLimit, now } = input;
  const day = istDay(now);
  const retryAfterSeconds = secondsUntilNextIstDay(now);
  const hashes = keyHashes(input.key, input.extraKeys, day);
  const globalHash = usageKeyHash("global", "all", day);

  return withTransaction(db, (): Reservation => {
    const used = mostUsed(db, hashes, day);
    if (used >= limit) return { allowed: false, reason: "limit", retryAfterSeconds, limit };
    if (getUsageCount(db, globalHash, day) >= globalLimit) {
      return { allowed: false, reason: "global", retryAfterSeconds, limit };
    }
    pruneUsage(db, istDay(now - 2 * DAY_MS));
    for (const hash of hashes) incrementUsage(db, hash, day, now);
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
          for (const hash of hashes) decrementUsage(db, hash, day, Date.now());
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
export function exhaustedAllowance(db: DatabaseSync, input: UsageInput): Extract<Reservation, { allowed: false }> | null {
  const { limit, globalLimit, now } = input;
  const day = istDay(now);
  const retryAfterSeconds = secondsUntilNextIstDay(now);
  if (mostUsed(db, keyHashes(input.key, input.extraKeys, day), day) >= limit) {
    return { allowed: false, reason: "limit", retryAfterSeconds, limit };
  }
  if (getUsageCount(db, usageKeyHash("global", "all", day), day) >= globalLimit) {
    return { allowed: false, reason: "global", retryAfterSeconds, limit };
  }
  return null;
}

/**
 * Today's usage for a key and its extra keys (the busiest one counts), without counting anything.
 * With `globalLimit`, `remaining` is 0 once the site-wide cap is reached (`used` stays the key's own
 * count): a page must not offer the composer, or the lead gate's contact form, for a question
 * that would only be refused.
 */
export function usageStatus(
  db: DatabaseSync,
  input: Pick<UsageInput, "key" | "extraKeys" | "limit" | "now"> & { globalLimit?: number },
): { used: number; remaining: number; resetsInSeconds: number } {
  const day = istDay(input.now);
  const used = mostUsed(db, keyHashes(input.key, input.extraKeys, day), day);
  const siteFull = input.globalLimit !== undefined && getUsageCount(db, usageKeyHash("global", "all", day), day) >= input.globalLimit;
  return {
    used,
    remaining: siteFull ? 0 : Math.max(0, input.limit - used),
    resetsInSeconds: secondsUntilNextIstDay(input.now),
  };
}
