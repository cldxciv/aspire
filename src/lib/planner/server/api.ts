import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { NextResponse } from "next/server";
import { z } from "zod";

import { exceptionCode } from "@/lib/auth/log";
import { REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError } from "@/lib/auth/responses";
import type { ApiError } from "@/lib/contracts/api";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";
import { NICKNAME } from "../nickname";
import { plannerStateSchema, STATE_LIMITS } from "../state";

/**
 * Shared pieces of the planner APIs (/api/planner/state, /api/planner/leaderboard).
 * Auth = `requireRole("student")` (guests 401, other roles 403); writes are same-origin JSON with a
 * size limit (src/lib/auth/request.ts) and a per-student write limit.
 */

export const STATE_PUT_MAX_BYTES = STATE_LIMITS.maxBytes;
export const LEADERBOARD_PUT_MAX_BYTES = 1024;
export const LEADERBOARD_SIZE = 20;

export const putStateBodySchema = z.object({ state: plannerStateSchema });

export const putLeaderboardBodySchema = z.object({
  optIn: z.boolean(),
  nickname: z.string().max(NICKNAME.max * 4).optional(),
});

/** Saves are debounced by the client; 60 writes a minute per student is generous. */
export const plannerWriteLimiter = new SlidingWindowRateLimiter({ limit: 60, windowMs: 60_000, maxKeys: 5_000 });

export const PLANNER_MESSAGES = {
  rateLimited: "Too many saves. Please wait a moment.",
  nickname: {
    length: `Use ${NICKNAME.min}–${NICKNAME.max} characters.`,
    characters: "Use letters, numbers, spaces, dots, dashes or underscores only.",
    contact: "Please do not use a phone number, roll number or login ID.",
    reserved: "Please choose a different nickname.",
    required: "Choose a nickname to join the leaderboard.",
  },
} as const;

type PlannerAction = "state_get" | "state_put" | "leaderboard_get" | "leaderboard_put";

/** Secret-free, PII-free log line (fixed codes only). */
export function plannerLog(action: PlannerAction, outcome: "error" | "rejected", reason?: string): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level: outcome === "error" ? "error" : "warn", event: "planner", action, outcome, ...(reason ? { reason } : {}) });
  if (outcome === "error") console.error(line);
  else console.warn(line);
}

/** For a route handler's `catch`: re-throws Next control flow, logs the class only, returns 500. */
export function plannerServerError(action: PlannerAction, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  plannerLog(action, "error", exceptionCode(error));
  return portalApiError("server_error", REQUEST_MESSAGES.serverError);
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse<ApiError> {
  return portalApiError("rate_limited", PLANNER_MESSAGES.rateLimited, {
    headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
  });
}
