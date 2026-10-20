import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { NextResponse } from "next/server";
import type { ApiError } from "@/lib/contracts/api";
import { requireRole, type GuardResult } from "./guards";
import { authLog, exceptionCode, type AuthLogAction } from "./log";
import { rejectCrossOrigin, REQUEST_MESSAGES } from "./request";
import { portalApiError } from "./responses";

/**
 * Admin route guard: same-origin first for state-changing methods (CSRF), then
 * `requireRole("admin")` (401 / 403, or 403 while the admin's temporary password is
 * unchanged).
 */
export async function requireAdmin(request: Request, options: { write: boolean }): Promise<GuardResult> {
  if (options.write) {
    const rejection = rejectCrossOrigin(request);
    if (rejection) {
      authLog({ action: "admin_users", outcome: rejection.outcome, reason: rejection.reason });
      return { ok: false, response: rejection.response };
    }
  }
  return requireRole("admin");
}

/**
 * For a route handler's `catch`: logs the exception class (never its message) and
 * returns a generic 500. Call it FIRST in the catch block.
 *
 * Next.js control-flow errors are re-thrown untouched (`unstable_rethrow`): during the
 * Cache Components prerender at build time `connection()` / `cookies()` reject with an
 * internal "hanging promise" error, and redirect()/notFound() throw too. Swallowing
 * those would log a bogus auth error and could bake a 500 into a prerendered response.
 */
export function serverError(action: AuthLogAction, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  authLog({ action, outcome: "error", reason: exceptionCode(error) });
  return portalApiError("server_error", REQUEST_MESSAGES.serverError);
}
