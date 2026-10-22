import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb } from "@/lib/db/connection";

import { captureLead } from "../capture";
import type { MetaConfig, MetaPauseReason, MetaStatus } from "../lead-ops-types";
import { hasExternalRef } from "../repo/intake";
import { claimInboxRow, finishInboxRow, findInboxRow, listDueInboxIds, releaseInboxRow, rescheduleInboxRow, type InboxRow } from "../repo/meta";
import { getMetaConfig } from "../settings";
import type { CaptureLeadResult } from "../types";
import { patchMetaConfigAsSystem, readMetaSecret } from "./config";
import type { ClassifiedGraphError } from "./errors";
import { createGraphClient, LEAD_FIELDS_BASIC, LEAD_FIELDS_FULL, type GraphClient, type GraphLead, type GraphResult } from "./graph";
import { runMetaHousekeeping } from "./housekeeping";
import { mapMetaLead } from "./mapping";
import { metaLog, metaRuntime, type MetaRuntime } from "./runtime";
import { fieldsModeAt, readMetaStatus, updateMetaStatus } from "./status";
import { decideTestLead } from "./test-mode";

/**
 * `processMetaInbox` (docs/lead-routing-plan.md §18.3–18.4): fetches the answers of waiting Meta
 * lead ids from Graph and captures them through CORE's `captureLead` (origin ref, Meta chronology,
 * erase suppression, `arrivedAt = received_at`).
 *
 * - Claiming: an atomic per-row lease (60 s) plus an in-process mutex; the refs are checked again
 *   right before the Graph call (M9), so an id imported meanwhile is never fetched. A call made
 *   while a run is busy returns `skipped: "busy"` and makes the busy run take another pass (at
 *   most 3 in all, within its budget), so ids queued mid-run are not left waiting.
 * - Errors (M6): retry with backoff `min(2^attempts min, 360 min)` + 0–30 s jitter, honouring
 *   Meta's `estimated_time_to_regain_access`, stopping the run at ≥ 90 % usage, `failed` after 10
 *   attempts; 190 pauses the queue (`auth`; items stay pending); permission errors pause only after
 *   5 consecutive failures on DIFFERENT leads; 100/33 → `unavailable` after 3; "nonexisting field"
 *   → basic fields for 24 h and an immediate retry (the basic set keeps the consent responses, H4).
 * - Outcomes: imported (created / merged / attached), duplicate, test (dummy data, not stored),
 *   ignored (`erased_family`: the fetched answers are dropped at once), failed (`invalid_phone`, …).
 * Every write is a short statement or CORE's own transaction: nothing is held across a network call.
 */

export const LEASE_MS = 60_000;
export const MAX_ATTEMPTS = 10;
export const UNAVAILABLE_AFTER = 3;
export const PERMISSION_PAUSE_AFTER = 5;
export const BASIC_FIELDS_MS = 24 * 60 * 60 * 1000;
export const SLOW_DOWN_PERCENT = 90;

export interface ProcessReport {
  processed: number;
  imported: number;
  duplicates: number;
  tests: number;
  ignored: number;
  failed: number;
  unavailable: number;
  retried: number;
  paused: MetaPauseReason | null;
  throttled: boolean;
  /** Why nothing ran: another run is busy, the integration is off / paused / not configured. */
  skipped: "busy" | "disabled" | "paused" | "not_configured" | null;
}

const emptyReport = (): ProcessReport => ({
  processed: 0,
  imported: 0,
  duplicates: 0,
  tests: 0,
  ignored: 0,
  failed: 0,
  unavailable: 0,
  retried: 0,
  paused: null,
  throttled: false,
  skipped: null,
});

/** Retry delay after the `attempts`-th failure: min(2^attempts, 360) minutes + 0–30 s jitter. */
export function backoffMs(attempts: number, random: () => number): number {
  const minutes = Math.min(2 ** Math.max(0, attempts), 360);
  return minutes * 60_000 + Math.floor(Math.max(0, Math.min(1, random())) * 30_000);
}

// Permission failures on DIFFERENT leads since the last successful read (in-process; a restart
// only delays a pause, never causes one).
const permissionFailures = new Set<string>();
let running = false;
// A run asked for while another was busy (e.g. a webhook arriving mid-run): the busy run lists its
// ids once, so it takes another pass for them (bounded by MAX_PASSES and the caller's budget).
let rerunRequested = false;
const MAX_PASSES = 3;
const DEFAULT_BUDGET_MS = 20_000;

/** Test helper. */
export function resetMetaInboxStateForTests(): void {
  permissionFailures.clear();
  running = false;
  rerunRequested = false;
}

/** The token used to read leads: the derived Page token when there is one, else the stored token. */
export function leadReadToken(db: DatabaseSync): string | null {
  const page = readMetaSecret(db, "page_token");
  if (page.ok) return page.value;
  const access = readMetaSecret(db, "access_token");
  return access.ok ? access.value : null;
}

/** A Graph client on the stored app secret and config; the header→query fallback is remembered. */
export function graphClientFor(db: DatabaseSync, config: MetaConfig, runtime: MetaRuntime): GraphClient | null {
  const appSecret = readMetaSecret(db, "app_secret");
  if (!appSecret.ok) return null;
  return createGraphClient({
    fetchImpl: runtime.fetchImpl,
    version: config.graphVersion,
    appSecret: appSecret.value,
    tokenTransport: config.tokenTransport,
    onTokenTransport: (transport) => {
      patchMetaConfigAsSystem(db, () => ({ tokenTransport: transport }), { actorId: null, now: runtime.now() });
      metaLog("graph", "warn", "token_transport_query");
    },
  });
}

export async function processMetaInbox(
  options: { limit?: number; budgetMs?: number; runtime?: Partial<MetaRuntime>; force?: boolean } = {},
): Promise<ProcessReport> {
  if (running) {
    rerunRequested = true;
    return { ...emptyReport(), skipped: "busy" };
  }
  running = true;
  rerunRequested = false;
  try {
    const clock = metaRuntime(options.runtime).now;
    const deadline = clock() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
    let report = await processInner(options);
    for (let pass = 1; pass < MAX_PASSES && rerunRequested && canContinue(report); pass += 1) {
      const left = deadline - clock();
      if (left <= 0) break;
      rerunRequested = false;
      report = mergeReports(report, await processInner({ ...options, budgetMs: left }));
    }
    return report;
  } finally {
    running = false;
    rerunRequested = false;
  }
}

const canContinue = (report: ProcessReport) => report.skipped === null && report.paused === null && !report.throttled;

function mergeReports(first: ProcessReport, next: ProcessReport): ProcessReport {
  return {
    processed: first.processed + next.processed,
    imported: first.imported + next.imported,
    duplicates: first.duplicates + next.duplicates,
    tests: first.tests + next.tests,
    ignored: first.ignored + next.ignored,
    failed: first.failed + next.failed,
    unavailable: first.unavailable + next.unavailable,
    retried: first.retried + next.retried,
    paused: next.paused ?? first.paused,
    throttled: first.throttled || next.throttled,
    skipped: first.skipped,
  };
}

async function processInner(options: { limit?: number; budgetMs?: number; runtime?: Partial<MetaRuntime>; force?: boolean }): Promise<ProcessReport> {
  const runtime = metaRuntime(options.runtime);
  // CORE's captureLead writes through getDb() too: one connection for the whole run.
  const db = getDb();
  const limit = Math.max(1, Math.min(options.limit ?? 25, 200));
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const started = runtime.now();
  const report = emptyReport();

  try {
    runMetaHousekeeping(db, started);
  } catch {
    metaLog("housekeeping", "error", "failed");
  }

  const config = getMetaConfig(db).value;
  let status = readMetaStatus(db);
  if (!config.enabled) return { ...report, skipped: "disabled" };
  if (status.paused && !options.force) return { ...report, skipped: "paused", paused: status.paused };
  const token = leadReadToken(db);
  const client = graphClientFor(db, config, runtime);
  if (!token || !client) return { ...report, skipped: "not_configured" };
  if (status.paused) status = updateMetaStatus(db, { paused: null, pausedAt: null }, started);
  const centres = await runtime.centres();

  for (const id of listDueInboxIds(db, runtime.now(), limit)) {
    if (runtime.now() - started > budgetMs) break;
    const now = runtime.now();
    if (!claimInboxRow(db, id, now, LEASE_MS)) continue;
    const row = findInboxRow(db, id);
    if (!row) continue;
    report.processed += 1;
    if (hasExternalRef(db, "meta", id)) {
      finishInboxRow(db, id, { status: "duplicate", now });
      report.duplicates += 1;
      continue;
    }

    const fetched = await fetchLead(db, client, id, token, status, runtime);
    status = fetched.status;
    if (!fetched.result.ok) {
      const stop = handleFailure(db, row, fetched.result.error, report, runtime);
      if (fetched.result.usage.maxPercent >= SLOW_DOWN_PERCENT) report.throttled = true;
      if (stop || report.throttled) break;
      continue;
    }

    if (permissionFailures.size > 0 || status.consecutivePermissionFailures > 0) {
      permissionFailures.clear();
      status = updateMetaStatus(db, { consecutivePermissionFailures: 0 }, now);
    }
    status = captureFetched(db, row, fetched.result.data, config, centres, report, runtime.now(), status);
    if (fetched.result.usage.maxPercent >= SLOW_DOWN_PERCENT) {
      report.throttled = true;
      break;
    }
  }
  if (report.processed > 0) metaLog("process", report.failed > 0 || report.paused ? "warn" : "success", report.paused ? `paused_${report.paused}` : undefined);
  return report;
}

/** GET the lead (full fields, or basic while `fieldsMode` says so; "nonexisting field" downgrades and retries once). */
async function fetchLead(
  db: DatabaseSync,
  client: GraphClient,
  id: string,
  token: string,
  status: MetaStatus,
  runtime: MetaRuntime,
): Promise<{ result: GraphResult<GraphLead>; status: MetaStatus }> {
  const now = runtime.now();
  const basic = fieldsModeAt(status, now) === "basic";
  const first = await client.request<GraphLead>("GET", id, { fields: basic ? LEAD_FIELDS_BASIC : LEAD_FIELDS_FULL }, token);
  if (first.ok || first.error.kind !== "downgrade_fields" || basic) return { result: first, status };
  const next = updateMetaStatus(db, { fieldsMode: { mode: "basic", until: new Date(now + BASIC_FIELDS_MS).toISOString() } }, now);
  metaLog("graph", "warn", "fields_basic");
  return { result: await client.request<GraphLead>("GET", id, { fields: LEAD_FIELDS_BASIC }, token), status: next };
}

/** Applies a classified Graph failure to the row. True = stop this run (the queue paused). */
function handleFailure(db: DatabaseSync, row: InboxRow, error: ClassifiedGraphError, report: ProcessReport, runtime: MetaRuntime): boolean {
  const now = runtime.now();
  const attempts = row.attempts + 1;
  const retryLater = (reason: string) => {
    if (attempts >= MAX_ATTEMPTS) {
      finishInboxRow(db, row.leadgenId, { status: "failed", lastError: reason, attempts, now });
      report.failed += 1;
      return;
    }
    const wait = Math.max(backoffMs(attempts, runtime.random), error.retryAfterMs ?? 0);
    rescheduleInboxRow(db, row.leadgenId, { attempts, nextAttemptAt: now + wait, lastError: reason });
    report.retried += 1;
  };
  switch (error.kind) {
    case "retry":
      retryLater(error.reason);
      updateMetaStatus(db, { lastErrorCode: error.reason }, now);
      return false;
    case "pause_auth":
    case "token_transport":
      // The token is invalid or expired: nothing is the item's fault. Pause; items stay pending.
      releaseInboxRow(db, row.leadgenId, { nextAttemptAt: now, lastError: error.reason });
      updateMetaStatus(db, { paused: "auth", pausedAt: new Date(now).toISOString(), lastErrorCode: error.reason }, now);
      report.paused = "auth";
      metaLog("process", "warn", "paused_auth");
      return true;
    case "permission": {
      permissionFailures.add(row.leadgenId);
      const failures = permissionFailures.size;
      if (failures >= PERMISSION_PAUSE_AFTER) {
        releaseInboxRow(db, row.leadgenId, { nextAttemptAt: now, lastError: error.reason });
        updateMetaStatus(db, { paused: "permission", pausedAt: new Date(now).toISOString(), lastErrorCode: error.reason, consecutivePermissionFailures: failures }, now);
        report.paused = "permission";
        metaLog("process", "warn", "paused_permission");
        return true;
      }
      retryLater(error.reason);
      updateMetaStatus(db, { lastErrorCode: error.reason, consecutivePermissionFailures: failures }, now);
      return false;
    }
    case "unavailable":
      if (attempts >= UNAVAILABLE_AFTER) {
        finishInboxRow(db, row.leadgenId, { status: "unavailable", lastError: error.reason, attempts, now });
        report.unavailable += 1;
      } else {
        retryLater(error.reason);
      }
      return false;
    case "downgrade_fields":
    case "fatal":
      finishInboxRow(db, row.leadgenId, { status: "failed", lastError: error.reason, attempts, now });
      updateMetaStatus(db, { lastErrorCode: error.reason }, now);
      report.failed += 1;
      return false;
  }
}

/** Maps, applies test mode and captures one fetched lead; records the outcome. Returns the status. */
function captureFetched(
  db: DatabaseSync,
  row: InboxRow,
  lead: GraphLead,
  config: MetaConfig,
  centres: Parameters<typeof mapMetaLead>[1]["centres"],
  report: ProcessReport,
  now: number,
  status: MetaStatus,
): MetaStatus {
  const mapped = mapMetaLead(lead, { config, centres });
  const decision = decideTestLead(mapped, config, now);
  const at = new Date(now).toISOString();
  if (decision.kind === "drop") {
    finishInboxRow(db, row.leadgenId, { status: "test", now });
    report.tests += 1;
    return updateMetaStatus(db, { lastTestAt: at }, now);
  }
  const chosen = decision.kind === "capture" ? decision.lead : mapped;
  let result: CaptureLeadResult;
  try {
    result = captureLead(chosen.input, now, {
      origin: { provider: "meta", externalId: row.leadgenId },
      attachIfOlderThanHistory: { createdAt: chosen.createdAt },
      suppression: { createdAt: chosen.createdAt },
      submissionMeta: chosen.submissionMeta,
      answers: chosen.answers,
      arrivedAt: row.receivedAt,
    });
  } catch {
    // A locked database or similar: try the item again later (the answers are not kept).
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      finishInboxRow(db, row.leadgenId, { status: "failed", lastError: "capture_error", attempts, now });
      report.failed += 1;
    } else {
      rescheduleInboxRow(db, row.leadgenId, { attempts, nextAttemptAt: now + 60_000, lastError: "capture_error" });
      report.retried += 1;
    }
    return status;
  }
  if (result.ok && result.alreadyImported) {
    finishInboxRow(db, row.leadgenId, { status: "duplicate", leadId: result.leadId || null, now });
    report.duplicates += 1;
    return status;
  }
  if (result.ok) {
    finishInboxRow(db, row.leadgenId, { status: "imported", leadId: result.leadId, now });
    report.imported += 1;
    return updateMetaStatus(db, decision.kind === "capture" ? { lastImportAt: at, lastTestAt: at } : { lastImportAt: at }, now);
  }
  if (result.error === "erased_family") {
    // The family was erased: the fetched answers are discarded here and never stored (M5, M9).
    finishInboxRow(db, row.leadgenId, { status: "ignored", lastError: "erased_family", now });
    report.ignored += 1;
    return status;
  }
  finishInboxRow(db, row.leadgenId, { status: "failed", lastError: result.error, attempts: row.attempts + 1, now });
  report.failed += 1;
  return status;
}
