import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { istDayStart } from "./estimate";
import { spentSince } from "./repo";

/**
 * Today's spend for the daily cap (docs/question-bank-plan.md §B8.5): every recorded item cost
 * since IST midnight (batch reservations included, see batch.ts) PLUS the reservation of every sync
 * call still in flight in this process. Without the in-flight part, two jobs started together would
 * both pass the check and overshoot the cap. A sync item's reservation grows as its `max_tokens`
 * halving makes more calls (jobs.ts `runSyncItem`), and is dropped once the item's real cost is
 * stored on its row.
 */

const inFlight = new Map<string, number>();

export function inFlightKey(importId: string, seq: number): string {
  return `${importId}:${seq}`;
}

export function reserveInFlight(key: string, usd: number): void {
  inFlight.set(key, Math.max(0, usd));
}

export function releaseInFlight(key: string): void {
  inFlight.delete(key);
}

/** Reservations of calls in flight, leaving out `exceptKey` (the caller's own). */
export function inFlightUsd(exceptKey?: string): number {
  let total = 0;
  for (const [key, usd] of inFlight) if (key !== exceptKey) total += usd;
  return total;
}

/** Recorded spend since IST midnight plus the in-flight reservations (all but `exceptKey`). */
export function spentToday(db: DatabaseSync, now: number, exceptKey?: string): number {
  return spentSince(db, istDayStart(now)) + inFlightUsd(exceptKey);
}
