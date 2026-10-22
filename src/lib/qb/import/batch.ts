import "server-only";

import type { QbImportEstimate } from "@/lib/qb/types";

import type { BatchRequest } from "./client";
import type { ImportDeps } from "./deps";
import { IMPORT_AUDIT } from "./deps";
import { perRequestUpperUsd, usageUsd } from "./estimate";
import { batchParams, buildRequest } from "./extract";
import { ingestItemOutput, recordWastedCall } from "./ingest";
import { getImport, getItem, type ItemRecord, listItems, updateImport, updateItem } from "./repo";
import { spentToday } from "./spend";
import { buildContextFor, customIdOf, type JobSource, parserFor, planForItem, seqFromCustomId } from "./work";

/**
 * Batch mode (docs/question-bank-plan.md §B8.3, §B8.4): every fresh item of a job goes into one
 * Message Batch (half price; usually under an hour, at most 24 h). The job waits in
 * `waiting_batch`, which survives restarts. Polling is lazy: import API calls and the job page's
 * 10-second poll trigger it, under the job's lease. Results are matched by `custom_id`, never by
 * position. Anything that did not finish cleanly (refusal, `max_tokens`, errored, expired) goes back
 * to `pending` and is retried in sync mode, where refusals get the server-side fallback and long
 * outputs are halved; those retries count against the daily cap like any other call.
 *
 * Spend: each submitted request reserves its upper-bound estimate (its `usd`, stamped now) until
 * its result replaces it with the real cost, so two batches cannot together overrun the cap; sync
 * calls in flight count too (spend.ts). A cancelled batch keeps its reservations (jobs.ts).
 */

/** The per-request reservation for `mode`, from the job's estimate (made for its own mode). */
export function reservationPerRequest(job: { estimate: QbImportEstimate | null }, mode: "sync" | "batch"): number {
  const upper = perRequestUpperUsd(job.estimate);
  if (!job.estimate || job.estimate.mode === mode || job.estimate.mode === "none") return upper;
  return mode === "batch" ? upper / 2 : upper * 2;
}

export type SubmitOutcome = "submitted" | "capped" | "nothing";

export async function submitBatch(deps: ImportDeps, jobId: string, items: readonly ItemRecord[], source: JobSource): Promise<SubmitOutcome> {
  const job = getImport(deps.db, jobId);
  if (!job || items.length === 0) return "nothing";
  const client = deps.client();
  if (!client) throw new Error("no_api_key");
  const now = deps.now();
  const reserve = reservationPerRequest(job, "batch");
  const spent = spentToday(deps.db, now);
  if (spent + reserve * items.length > deps.config.dailyUsd) {
    updateImport(deps.db, jobId, { status: "paused", pauseReason: "daily_cap" }, now, ["running"]);
    deps.audit({ actorId: null, action: IMPORT_AUDIT.dailyCap, target: jobId, details: { spentUsd: Math.round(spent * 100) / 100, capUsd: deps.config.dailyUsd } });
    return "capped";
  }
  const ctx = buildContextFor(deps, job, source);
  const requests: BatchRequest[] = [];
  for (const item of items) {
    const built = await buildRequest(ctx, planForItem(job, item, source));
    requests.push({ customId: customIdOf(jobId, item.seq), params: batchParams(built.body) });
  }
  const batch = await client.createBatch(requests);
  const submittedAt = deps.now();
  for (const item of items) {
    updateItem(deps.db, jobId, item.seq, {
      status: "submitted",
      customId: customIdOf(jobId, item.seq),
      attempts: item.attempts + 1,
      usd: reserve,
      finishedAt: submittedAt,
      error: null,
    });
  }
  const fresh = getImport(deps.db, jobId);
  updateImport(
    deps.db,
    jobId,
    { status: "waiting_batch", batchIds: [...(fresh?.batchIds ?? []), { id: batch.id, submittedAt, endedAt: null }] },
    submittedAt,
    ["running"],
  );
  return "submitted";
}

/** Puts an item back for a sync retry, keeping (or clearing) the cost of its batch attempt. */
function backToSync(deps: ImportDeps, jobId: string, seq: number, patch: { usd: number; finishedAt: number | null; stopReason: string | null; error: string }): void {
  updateItem(deps.db, jobId, seq, { status: "pending", ...patch });
}

/**
 * Checks the job's open batches and ingests every ended one. Returns "waiting" while any batch is
 * still processing, else "ended" (the job is back to `running` for any sync retries).
 */
export async function pollBatches(deps: ImportDeps, jobId: string): Promise<"waiting" | "ended"> {
  const job = getImport(deps.db, jobId);
  if (!job || job.status !== "waiting_batch") return "ended";
  const client = deps.client();
  if (!client) throw new Error("no_api_key");
  const refs = job.batchIds.map((ref) => ({ ...ref }));
  let waiting = false;
  for (const ref of refs) {
    if (ref.endedAt !== null) continue;
    const status = await client.retrieveBatch(ref.id);
    if (status.processingStatus !== "ended") {
      waiting = true;
      continue;
    }
    for await (const result of client.batchResults(ref.id)) {
      const seq = seqFromCustomId(jobId, result.customId);
      if (seq === null) continue;
      const item = getItem(deps.db, jobId, seq);
      // Idempotent: an item already ingested (or moved on) is skipped.
      if (!item || item.status !== "submitted") continue;
      const now = deps.now();
      if (result.type !== "succeeded") {
        backToSync(deps, jobId, seq, { usd: 0, finishedAt: null, stopReason: null, error: `batch_${result.type}` });
        continue;
      }
      const reply = result.reply;
      const usd = usageUsd(reply.usage, deps.config.price, true);
      if (reply.stopReason === "refusal" || reply.stopReason === "max_tokens") {
        recordWastedCall(deps, jobId, { usage: reply.usage, usd });
        backToSync(deps, jobId, seq, { usd, finishedAt: now, stopReason: reply.stopReason, error: reply.stopReason === "refusal" ? "batch_refused" : "batch_max_tokens" });
        continue;
      }
      const parsed = parserFor(job, planForItem(job, item, null))(reply.text);
      if (!parsed.ok) {
        recordWastedCall(deps, jobId, { usage: reply.usage, usd });
        backToSync(deps, jobId, seq, { usd, finishedAt: now, stopReason: reply.stopReason, error: parsed.reason });
        continue;
      }
      ingestItemOutput(deps, jobId, seq, parsed.output, { usage: reply.usage, usd, itemUsd: usd, model: reply.model, stopReason: reply.stopReason });
    }
    ref.endedAt = deps.now();
    // Requests the results never mentioned go back to sync, reservation released.
    for (const item of listItems(deps.db, jobId)) {
      if (item.status === "submitted" && item.customId === customIdOf(jobId, item.seq)) {
        backToSync(deps, jobId, item.seq, { usd: 0, finishedAt: null, stopReason: null, error: "batch_missing_result" });
      }
    }
  }
  const now = deps.now();
  if (waiting) {
    updateImport(deps.db, jobId, { batchIds: refs }, now);
    return "waiting";
  }
  updateImport(deps.db, jobId, { batchIds: refs, status: "running" }, now, ["waiting_batch"]);
  return "ended";
}

/** Best-effort cancel of a job's open batches (never throws). */
export async function cancelOpenBatches(deps: ImportDeps, jobId: string): Promise<void> {
  const job = getImport(deps.db, jobId);
  const client = deps.client();
  if (!job || !client) return;
  for (const ref of job.batchIds) {
    if (ref.endedAt !== null) continue;
    try {
      await client.cancelBatch(ref.id);
    } catch {
      // The batch may have ended meanwhile; nothing else to do.
    }
  }
}
