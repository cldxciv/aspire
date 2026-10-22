import { isLeadGateResponse } from "@/components/lead-gate/lead-gate-client";
import { PAPER_TOKEN_HEADER } from "@/lib/mocktest/schemas";
import type { QbReportKind, QbSlot } from "@/lib/qb/types";
import type { PaperLocalAttempt } from "./paper-store";

/**
 * Requests of the exam-pattern mock pages (QB-MOCKTEST-UI) against /api/mocktest/papers/**, /score
 * and /attempts. Like `apiJson` (./hooks.ts), plus what these routes add: the 409 `reason`
 * ("bank_thin", "use_attempts", "paper_already_scored" …), a thin bank's `readiness`, and the
 * server's `Date` header so the runner can trust the server's clock over a wrong device clock.
 */

export interface PaperApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** The 409 conflict's machine-readable reason, else null. */
  reason: string | null;
  fieldErrors?: Record<string, string[]>;
  /** The lead gate's 401 (`X-Lead-Gate: required`). */
  leadGate: boolean;
  /** The server's `Date` header and the device times around the request (clock offset). */
  serverDate: string | null;
  sentAt: number;
  receivedAt: number;
}

export async function paperApi<T>(
  url: string,
  init: { method?: string; body?: unknown; token?: string | null; signal?: AbortSignal } = {},
): Promise<PaperApiResult<T>> {
  const sentAt = Date.now();
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    // The bearer token travels in a header, never in the URL (logs, history).
    if (init.token) headers[PAPER_TOKEN_HEADER] = init.token;
    const response = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      credentials: "same-origin",
      signal: init.signal,
    });
    const receivedAt = Date.now();
    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      data?: T;
      reason?: string;
      fieldErrors?: Record<string, string[]>;
    } | null;
    return {
      ok: response.ok && body?.ok === true,
      status: response.status,
      data: body?.data ?? null,
      reason: typeof body?.reason === "string" ? body.reason : null,
      fieldErrors: body?.fieldErrors,
      leadGate: isLeadGateResponse(response),
      serverDate: response.headers.get("date"),
      sentAt,
      receivedAt,
    };
  } catch {
    return { ok: false, status: 0, data: null, reason: null, leadGate: false, serverDate: null, sentAt, receivedAt: Date.now() };
  }
}

export function readinessUrl(slot: QbSlot, language: "en" | "hi"): string {
  return `/api/mocktest/papers/readiness?${new URLSearchParams({ slot, language })}`;
}

export function paperUrl(paperId: string): string {
  return `/api/mocktest/papers/${encodeURIComponent(paperId)}`;
}

/**
 * POST /api/mocktest/score for a practice paper on this device (pure). Like the fixed tests'
 * `scoreRequestBody`: `seen` once this browser has a score for it (never gated again), `record` only
 * on the first scoring — from the result page, or (`fromResult` true as well) the background scoring
 * of Paper 1 of a pair when it is submitted. The server takes the paper's own creation time for the
 * gate, never `startedAt`.
 */
export function paperScoreBody(attempt: PaperLocalAttempt, fromResult: boolean) {
  const seen = attempt.score !== undefined;
  return {
    testId: attempt.testId,
    paperId: attempt.paperId,
    ...(attempt.token ? { paperToken: attempt.token } : {}),
    answers: attempt.answers,
    timeSpentSec: attempt.timeSpentSec,
    startedAt: attempt.startedAt,
    ...(seen ? { seen: true as const } : {}),
    ...(fromResult && !seen ? { record: true as const } : {}),
  };
}

/** POST /api/mocktest/attempts: saves the paper to the signed-in student's account (ranked papers count on the board). */
export function paperSaveBody(attempt: PaperLocalAttempt) {
  return {
    testId: attempt.testId,
    paperId: attempt.paperId,
    ...(attempt.token ? { paperToken: attempt.token } : {}),
    attemptId: attempt.id,
    answers: attempt.answers,
    timeSpentSec: attempt.timeSpentSec,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
  };
}

/** POST /api/mocktest/papers/:id/report (no account or IP is stored by the server). */
export function paperReportBody(input: { token: string | null; questionId: string; kind: QbReportKind; note: string }) {
  const note = input.note.trim().slice(0, 500);
  return {
    ...(input.token ? { token: input.token } : {}),
    questionId: input.questionId,
    kind: input.kind,
    ...(note ? { note } : {}),
  };
}
