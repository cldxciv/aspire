import "server-only";

import type { DatabaseSync } from "node:sqlite";

/**
 * One runner per import, through a compare-and-set lease in `qb_imports` (docs/question-bank-plan.md
 * §B8.4), not a module lock: it survives hot reloads and protects against two server processes.
 *
 *   UPDATE qb_imports SET runner_id = ?, lease_until = ?
 *    WHERE id = ? AND (runner_id IS NULL OR lease_until < ?)
 *
 * Proceed only when exactly one row changed. Every runner invocation has its own id (jobs.ts
 * `startRunner`), and a held lease is never re-taken, not even by the same process: a "resume"
 * while the previous runner's call is still in flight starts nothing, and that runner carries on.
 *
 * While a model call is in flight a timer extends the lease every 30 s; the lease lasts 3 minutes,
 * so a 10-minute call is never taken over, while a runner that died (crash, restart) loses the job
 * 3 minutes later.
 */

export const LEASE_MS = 3 * 60_000;
export const HEARTBEAT_MS = 30_000;

export interface TimerApi {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export const REAL_TIMERS: TimerApi = {
  setInterval: (fn, ms) => {
    const handle = setInterval(fn, ms);
    // Never keep the process alive just for a heartbeat.
    (handle as { unref?: () => void }).unref?.();
    return handle;
  },
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Takes a free or expired lease; true when this runner now holds it. */
export function acquireLease(db: DatabaseSync, importId: string, runnerId: string, now: number, leaseMs: number = LEASE_MS): boolean {
  const result = db
    .prepare(
      `UPDATE qb_imports SET runner_id = ?, lease_until = ?
        WHERE id = ? AND (runner_id IS NULL OR lease_until IS NULL OR lease_until < ?)`,
    )
    .run(runnerId, now + leaseMs, importId, now);
  return Number(result.changes) === 1;
}

/** Extends a lease this runner holds; false when it was lost (taken over after expiry). */
export function extendLease(db: DatabaseSync, importId: string, runnerId: string, now: number, leaseMs: number = LEASE_MS): boolean {
  const result = db
    .prepare("UPDATE qb_imports SET lease_until = ? WHERE id = ? AND runner_id = ?")
    .run(now + leaseMs, importId, runnerId);
  return Number(result.changes) === 1;
}

export function releaseLease(db: DatabaseSync, importId: string, runnerId: string): void {
  db.prepare("UPDATE qb_imports SET runner_id = NULL, lease_until = NULL WHERE id = ? AND runner_id = ?").run(importId, runnerId);
}

export function holdsLease(db: DatabaseSync, importId: string, runnerId: string, now: number): boolean {
  const row = db.prepare("SELECT runner_id, lease_until FROM qb_imports WHERE id = ?").get(importId) as
    | { runner_id: string | null; lease_until: number | null }
    | undefined;
  return !!row && row.runner_id === runnerId && (row.lease_until ?? 0) >= now;
}

/**
 * Keeps the lease alive while `work` runs (one extension every `HEARTBEAT_MS`). `onLost` is called
 * once if an extension fails, so the caller can stop after the current call.
 */
export async function withHeartbeat<T>(
  options: {
    db: DatabaseSync;
    importId: string;
    runnerId: string;
    now: () => number;
    timers?: TimerApi;
    leaseMs?: number;
    heartbeatMs?: number;
    onLost?: () => void;
  },
  work: () => Promise<T>,
): Promise<T> {
  const timers = options.timers ?? REAL_TIMERS;
  let lost = false;
  const handle = timers.setInterval(() => {
    if (lost) return;
    try {
      if (!extendLease(options.db, options.importId, options.runnerId, options.now(), options.leaseMs ?? LEASE_MS)) {
        lost = true;
        options.onLost?.();
      }
    } catch {
      // A failed heartbeat is retried on the next tick.
    }
  }, options.heartbeatMs ?? HEARTBEAT_MS);
  try {
    return await work();
  } finally {
    timers.clearInterval(handle);
  }
}
