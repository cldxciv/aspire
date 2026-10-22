import type { QbBulkCommitResult, QbBulkOp, QbBulkStartResult } from "./contract";

/**
 * The bulk-action spot check (§B7) as a pure state machine, driven by the review screen:
 *
 * 1. `start` → `POST …/bulk { action: "start" }` → `started` with the server's random sample.
 * 2. The reviewer opens every sampled question (`GET /questions/:id?spotCheck=<batchId>`); the
 *    response carries a signed one-time view token → `opened`.
 * 3. They mark each one OK (`verdict` true). One "not OK" ends the check: the client commits it
 *    at once and the server aborts the whole batch.
 * 4. `commitBody` is the `POST …/bulk { action: "commit" }` body; `committed` / `failed` close it.
 *
 * The server enforces every rule again (a token per sampled id, expiry, flags); this only keeps
 * the screen honest about what is still missing. Client-safe.
 */

export type SpotVerdict = "pending" | "ok" | "fail";

export interface SpotSample {
  id: string;
  /** View token from opening the item; null until opened. */
  token: string | null;
  verdict: SpotVerdict;
}

export type SpotCheckState =
  | { phase: "idle" }
  | { phase: "starting"; op: QbBulkOp; ids: string[] }
  | {
      phase: "checking" | "committing";
      op: QbBulkOp;
      batchId: string;
      eligible: string[];
      skipped: QbBulkStartResult["skipped"];
      sample: SpotSample[];
      expiresAt: number;
    }
  | { phase: "done"; op: QbBulkOp; count: number }
  | { phase: "aborted"; op: QbBulkOp; failedId: string }
  | { phase: "error"; op: QbBulkOp | null; message: string };

export type SpotCheckEvent =
  | { type: "start"; op: QbBulkOp; ids: readonly string[] }
  | { type: "started"; result: QbBulkStartResult }
  | { type: "opened"; id: string; token: string }
  | { type: "verdict"; id: string; ok: boolean }
  | { type: "commit" }
  | { type: "committed"; result: QbBulkCommitResult }
  | { type: "failed"; message: string }
  | { type: "reset" };

export const SPOT_CHECK_IDLE: SpotCheckState = { phase: "idle" };

export function spotCheckReducer(state: SpotCheckState, event: SpotCheckEvent): SpotCheckState {
  switch (event.type) {
    case "reset":
      return SPOT_CHECK_IDLE;
    case "start": {
      const ids = [...new Set(event.ids)];
      if (ids.length === 0) return state;
      return { phase: "starting", op: event.op, ids };
    }
    case "started": {
      if (state.phase !== "starting") return state;
      const { result } = event;
      if (result.eligible.length === 0) return { phase: "error", op: state.op, message: "nothing_eligible" };
      return {
        phase: "checking",
        op: result.op,
        batchId: result.batchId,
        eligible: [...result.eligible],
        skipped: [...result.skipped],
        sample: result.sample.map((id) => ({ id, token: null, verdict: "pending" })),
        expiresAt: result.expiresAt,
      };
    }
    case "opened": {
      if (state.phase !== "checking") return state;
      return {
        ...state,
        sample: state.sample.map((item) => (item.id === event.id && item.token === null ? { ...item, token: event.token } : item)),
      };
    }
    case "verdict": {
      if (state.phase !== "checking") return state;
      const item = state.sample.find((entry) => entry.id === event.id);
      // A verdict needs the item opened first (the server needs its token).
      if (!item || item.token === null) return state;
      const sample = state.sample.map((entry) => (entry.id === event.id ? { ...entry, verdict: event.ok ? "ok" : "fail" } : entry)) as SpotSample[];
      // "Not OK" aborts the batch: commit straight away so the server records it.
      return event.ok ? { ...state, sample } : { ...state, sample, phase: "committing" };
    }
    case "commit":
      return state.phase === "checking" && canCommit(state) ? { ...state, phase: "committing" } : state;
    case "committed": {
      if (state.phase !== "committing") return state;
      const { result } = event;
      return result.outcome === "done"
        ? { phase: "done", op: result.op, count: result.count }
        : { phase: "aborted", op: result.op, failedId: result.failedId };
    }
    case "failed":
      return { phase: "error", op: "op" in state ? state.op : null, message: event.message };
  }
}

type Checking = Extract<SpotCheckState, { phase: "checking" | "committing" }>;

/** Every sampled item opened and marked OK. */
export function canCommit(state: SpotCheckState): boolean {
  if (state.phase !== "checking") return false;
  return state.sample.length > 0 && state.sample.every((item) => item.token !== null && item.verdict === "ok");
}

/** Opened / total and OK / total, for "2 of 4 opened · 1 of 4 checked". */
export function spotProgress(state: SpotCheckState): { opened: number; ok: number; total: number } {
  if (state.phase !== "checking" && state.phase !== "committing") return { opened: 0, ok: 0, total: 0 };
  return {
    opened: state.sample.filter((item) => item.token !== null).length,
    ok: state.sample.filter((item) => item.verdict === "ok").length,
    total: state.sample.length,
  };
}

/**
 * The commit body: every opened item with its verdict. While committing after a "not OK", it
 * carries that failure (the server aborts the batch); otherwise all sampled items, all OK.
 */
export function commitBody(state: Checking): { action: "commit"; batchId: string; checks: { id: string; token: string; ok: boolean }[] } {
  const checks = state.sample
    .filter((item): item is SpotSample & { token: string } => item.token !== null && item.verdict !== "pending")
    .map((item) => ({ id: item.id, token: item.token, ok: item.verdict === "ok" }));
  return { action: "commit", batchId: state.batchId, checks };
}

/** Whether the batch's spot check has expired (the server would answer 409 `batch_expired`). */
export function isExpired(state: SpotCheckState, now: number): boolean {
  return (state.phase === "checking" || state.phase === "committing") && now >= state.expiresAt;
}
