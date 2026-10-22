import "server-only";

import { getDb } from "@/lib/db/connection";

import { getMetaConfig } from "../settings";
import { runMetaHousekeeping } from "./housekeeping";
import { processMetaInbox } from "./inbox";
import { metaLog, safely } from "./runtime";
import { readMetaStatus } from "./status";
import { reconcileMetaLeads } from "./sync";

/**
 * SEAM `@/lib/crm/meta` (docs/lead-routing-plan.md §14.3, §18; owner LR-META, replacing LR-CORE's
 * stub). The frozen signature is `kickMetaProcessing`: `/api/crm/sla/summary` (LR-SLA; every open
 * CRM tab polls it every 60 s) and the Integrations GET call it after responding.
 *
 * Also exported for other packages (read-only): `metaHealthSummary` (counts / times for the
 * alert strip and the dashboard) and `processMetaInbox` (the webhook's `after()`).
 */

export { processMetaInbox } from "./inbox";
export { metaHealthSummary } from "./view";

export const KICK_INTERVAL_MS = 60_000;
/** Reconcile when the last bulk read is older than this (§18.5). */
export const SYNC_STALE_MS = 60 * 60 * 1000;

type KickReason = "summary" | "status" | "manual";

/**
 * A throttled, never-throwing trigger: at most one run per `intervalMs` per process (`manual`
 * bypasses the throttle, not the in-process mutex). The run itself is detached.
 */
export function createKicker(run: (reason: KickReason) => Promise<unknown>, options: { intervalMs: number; now: () => number }): (reason: KickReason) => void {
  let last = Number.NEGATIVE_INFINITY;
  return (reason) => {
    try {
      const now = options.now();
      if (reason !== "manual" && now - last < options.intervalMs) return;
      last = now;
      void safely(() => run(reason), "kick");
    } catch {
      // Never throws (frozen contract).
    }
  };
}

/**
 * One opportunistic run: housekeeping (hourly; test leads are erased even while Meta is switched
 * off), then — when enabled — reconcile if stale and process the due ids.
 */
export async function runOpportunistic(reason: KickReason): Promise<void> {
  const db = getDb();
  runMetaHousekeeping(db, Date.now());
  const config = getMetaConfig(db).value;
  if (!config.enabled) return;
  const status = readMetaStatus(db);
  const lastSync = status.lastSyncAt ? Date.parse(status.lastSyncAt) : Number.NaN;
  if (config.forms.length > 0 && !status.paused && (!Number.isFinite(lastSync) || Date.now() - lastSync > SYNC_STALE_MS)) {
    await reconcileMetaLeads();
  }
  const report = await processMetaInbox({ limit: 25, budgetMs: 20_000 });
  if (report.processed > 0) metaLog(`kick.${reason}`, "success");
}

let kicker = createKicker(runOpportunistic, { intervalMs: KICK_INTERVAL_MS, now: () => Date.now() });

/** Opportunistic processing trigger: throttled (once per 60 s per process) and it NEVER throws. */
export function kickMetaProcessing(reason: "summary" | "status" | "manual"): void {
  kicker(reason);
}

/** Test helper: a fresh throttle (optionally around a test runner). */
export function resetMetaKickForTests(run: (reason: KickReason) => Promise<unknown> = runOpportunistic, now: () => number = () => Date.now()): void {
  kicker = createKicker(run, { intervalMs: KICK_INTERVAL_MS, now });
}
