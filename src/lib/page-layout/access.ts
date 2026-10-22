import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { NextResponse } from "next/server";

import type { GuardResult } from "@/lib/auth/guards";
import { exceptionCode } from "@/lib/auth/log";
import { REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError } from "@/lib/auth/responses";
import type { Session } from "@/lib/auth/roles";
import { requireAdmin } from "@/lib/auth/route-helpers";
import { isSuperAdmin, requireSuperAdmin } from "@/lib/auth/super-admin";
import type { ApiError } from "@/lib/contracts/api";
import { readBodyWithLimit } from "@/lib/server/request-guards";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

import { pageLayoutLog } from "./log";

/**
 * Who may change page layouts (docs/page-layout-plan.md §8, D5). Server-only.
 *
 * SUPER-ADMIN SEAM (D-044): this file is the only place that decides who may change page layouts.
 * Effective super admins edit; every other admin sees the editor read-only (live order + history).
 */

/** True when this session may change layouts: an admin who is an effective super admin. */
export function isLayoutEditor(session: Session): boolean {
  return session.role === "admin" && isSuperAdmin(session.userId);
}

/** Writes per user: 60 per 10 minutes (§8). Reads are not limited. */
export const LAYOUT_WRITE_LIMIT = { limit: 60, windowMs: 10 * 60 * 1000 } as const;

const writeLimiter = new SlidingWindowRateLimiter(LAYOUT_WRITE_LIMIT);

/** Test hook: API tests must not share write counts. */
export function resetLayoutRateLimitForTests(): void {
  writeLimiter.reset();
}

export const LAYOUT_API_MESSAGES = {
  rateLimited: "Too many layout changes in a short time. Please wait and try again.",
  unknownPage: "Unknown page.",
  conflict: "This page's layout changed since you opened it.",
  invalid: "The layout breaks a rule.",
} as const;

/**
 * Route guard. `edit` → `requireSuperAdmin` (same-origin for writes, signed-in admin, effective
 * super admin); otherwise `requireAdmin`. Writes are rate-limited per user (429 + Retry-After).
 * Same-origin and role checks are not re-implemented here.
 */
export async function requireLayoutEditor(request: Request, opts: { write: boolean; edit: boolean }): Promise<GuardResult> {
  const auth = opts.edit
    ? await requireSuperAdmin(request, { write: opts.write })
    : await requireAdmin(request, { write: opts.write });
  if (!auth.ok) return auth;
  if (opts.write) {
    const limit = writeLimiter.check(auth.session.userId);
    if (!limit.allowed) {
      return {
        ok: false,
        response: portalApiError("rate_limited", LAYOUT_API_MESSAGES.rateLimited, {
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }),
      };
    }
  }
  return auth;
}

/** One JSON log line, event "page_layout", fixed codes only (never bodies, names or ids). */
export function layoutLog(action: string, outcome: string, reason?: string): void {
  pageLayoutLog(action, outcome, reason);
}

/**
 * For a route handler's `catch`: Next control-flow errors are re-thrown first (`unstable_rethrow`),
 * then the exception class (never its message) is logged and a generic 500 envelope returned.
 */
export function layoutServerError(action: string, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  layoutLog(action, "error", exceptionCode(error));
  return portalApiError("server_error", REQUEST_MESSAGES.serverError);
}

/** The preview and exit routes take a tiny form (`page`, `lang`); anything unreadable is empty. */
export const LAYOUT_FORM_MAX_BYTES = 1024;

export async function readLayoutForm(request: Request): Promise<URLSearchParams> {
  const body = await readBodyWithLimit(request, LAYOUT_FORM_MAX_BYTES);
  return new URLSearchParams(body.ok ? body.text : "");
}

/**
 * 303 See Other to a RELATIVE, locale-aware path built by `localePath()` from the registry (never
 * from the request), so there is no open redirect and it works behind nginx. Next merges the
 * draft-mode cookie of `draftMode().enable()` / `.disable()` into any returned Response.
 */
export function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}
