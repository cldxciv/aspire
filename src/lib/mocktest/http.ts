import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { NextResponse } from "next/server";
import type { ApiError } from "@/lib/contracts/api";
import { portalApiError } from "@/lib/auth/responses";
import type { RateLimitResult } from "@/lib/server/rate-limit";

/**
 * Response helpers for /api/mocktest/** (D-007 envelope, `no-store`, `noindex` via portalApi*).
 * Log lines carry fixed codes only — never ids, nicknames, IPs or bodies.
 */

export type MocktestRoute = "score" | "start" | "attempts" | "profile" | "leaderboard" | "verify" | "admin_profile";

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
} as const;

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
