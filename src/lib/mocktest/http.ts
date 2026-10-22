import "server-only";

import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import type { ApiError } from "@/lib/contracts/api";
import { portalApiError, privateApiHeaders } from "@/lib/auth/responses";
import type { RateLimitResult } from "@/lib/server/rate-limit";

/**
 * Response helpers for /api/mocktest/** (D-007 envelope, `no-store`, `noindex` via portalApi*).
 * Log lines carry fixed codes only — never ids, nicknames, IPs or bodies.
 */

export type MocktestRoute =
  | "score"
  | "start"
  | "attempts"
  | "profile"
  | "leaderboard"
  | "verify"
  | "admin_profile"
  // Generated question papers (docs/question-bank-plan.md §B10).
  | "papers"
  | "paper"
  | "readiness"
  | "report"
  | "figure"
  // Re-scoring saved attempts after an answer-key correction (not a route; called by the bank).
  | "rescore";

export function mocktestLog(entry: { route: MocktestRoute; outcome: string; reason?: string }): void {
  const level = entry.outcome === "error" ? "error" : entry.outcome === "success" ? "info" : "warn";
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event: "mocktest",
    route: entry.route,
    outcome: entry.outcome,
    ...(entry.reason ? { reason: entry.reason } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "info") console.info(line);
  else console.warn(line);
}

export const MOCKTEST_MESSAGES = {
  notFound: "This test is not available.",
  rateLimited: "Too many requests. Please wait a little and try again.",
  serverError: "Something went wrong. Please try again.",
  validation: "Please check the highlighted fields.",
  noLeaderboard: "This test has no leaderboard.",
  verifyNotFound: "No saved attempt has this verification ID.",
  invalidVerifyId: "Invalid verification ID.",
  studentNotFound: "Student not found.",
  paperNotFound: "This question paper is not available. It may have expired.",
  bankThin: "The question bank does not have enough approved questions for this exam yet.",
  rankedUnavailable: "This month's ranked paper is not available yet.",
  rankedOff: "This exam has no monthly ranked paper.",
  rankedSignIn: "Sign in with a student account to sit the monthly ranked paper.",
  useAttempts: "Ranked papers are scored when you save them (sign in as the student who sat the paper).",
  alreadyScored: "This paper was already submitted with different answers.",
  alreadySaved: "This paper was already saved.",
  generationOff: "Exam-pattern mocks are switched off right now.",
  figureNotFound: "Figure not found.",
} as const;

/** Machine-readable reasons of the 409 answers (body `reason`; the envelope code stays `bad_request`, D-007 / D-016). */
export type MocktestConflict =
  | "bank_thin"
  | "ranked_unavailable"
  | "ranked_off"
  | "use_attempts"
  | "paper_already_scored"
  | "paper_already_saved";

/**
 * A 409 conflict. The D-007 code list is frozen, so the envelope says `bad_request` (clients branch
 * on the HTTP status, as for 413 / 415) and `reason` names the conflict; `extra` adds data such as
 * the readiness of a thin bank.
 */
export function mocktestConflict(reason: MocktestConflict, message: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json(
    { ok: false, error: "bad_request", message, reason, ...extra },
    { status: 409, headers: privateApiHeaders() },
  );
}

export function rateLimited(result: RateLimitResult): NextResponse<ApiError> {
  return portalApiError("rate_limited", MOCKTEST_MESSAGES.rateLimited, {
    headers: { "Retry-After": String(result.retryAfterSeconds) },
  });
}

export function testNotFound(): NextResponse<ApiError> {
  return portalApiError("not_found", MOCKTEST_MESSAGES.notFound);
}

/**
 * For a route handler's `catch` (call it first): re-throws Next's control-flow errors (prerender
 * bail-outs, redirects), logs the exception class only and returns a generic 500.
 */
export function mocktestServerError(route: MocktestRoute, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  const name = error instanceof Error ? error.name : typeof error;
  mocktestLog({ route, outcome: "error", reason: `exception_${name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"}` });
  return portalApiError("server_error", MOCKTEST_MESSAGES.serverError);
}
