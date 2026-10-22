import "server-only";

import type { NextResponse } from "next/server";
import type { z } from "zod";

import type { ApiError } from "@/lib/contracts/api";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { bodyLimit, crmLog, parseCrmBody, requireCrm, requireCrmSuperAdmin, type CrmGuard } from "@/lib/crm/http";
import { IMPORT_LIMITS, type ImportResult } from "@/lib/crm/intake/import";
import { crmPermissions } from "@/lib/crm/types";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

/**
 * Shared plumbing for /api/crm/import/** (LR-IMPORT, docs/lead-routing-plan.md §17, §21):
 * - writes are SUPER ADMIN only, enforced here on every call (`requireCrmSuperAdmin`: same origin,
 *   a signed-in effective super admin, the CRM write limit), plus the import's own limit of 400
 *   preview / rows requests an hour per user;
 * - the history GET needs `canViewImportHistory` (admins; every super admin is an admin);
 * - bodies are JSON, at most `bodyLimit("import")` (256 KB, one chunk of ≤ 250 rows);
 * - answers use the D-007 envelope with `no-store` + `noindex` (`portalApi*`); logs are fixed codes.
 */

const HOUR = 60 * 60 * 1000;
const chunkLimiter = new SlidingWindowRateLimiter({ limit: IMPORT_LIMITS.chunksPerHour, windowMs: HOUR });

/** Test helper. */
export function resetImportLimitersForTests(): void {
  chunkLimiter.reset();
}

/** Server English for the envelope (the wizard shows its own en / hi text per error code). */
export const IMPORT_MESSAGES = {
  notConfigured: "Server key not set: ask the developer to set INTEGRATIONS_SECRET before importing.",
  forbidden: "Only a super admin can import leads.",
  historyForbidden: "Only administrators can see the import history.",
  notFound: "No such import.",
  conflict: "This import cannot take more rows.",
  rateLimited: "Too many imports. Please wait and try again.",
} as const;

/**
 * Super admin + (for preview / rows) the per-user chunk limit. Every call is a same-origin "write"
 * request; the dry run (`dryRun`, nothing written) counts against the CRM read limit instead of
 * the write limit, so checking a 5,000-row file a few times is never throttled.
 */
export async function requireImporter(request: Request, route: string, options: { chunk: boolean; dryRun?: boolean }): Promise<CrmGuard> {
  const auth = await requireCrmSuperAdmin(request, { write: true, route, limit: options.dryRun ? "read" : "write" });
  if (!auth.ok) return auth;
  if (options.chunk) {
    const limit = chunkLimiter.check(auth.viewer.userId);
    if (!limit.allowed) {
      crmLog(route, "rate_limited", "import_chunks");
      return {
        ok: false,
        response: portalApiError("rate_limited", IMPORT_MESSAGES.rateLimited, { headers: { "Retry-After": String(limit.retryAfterSeconds) } }),
      };
    }
  }
  return auth;
}

/** Import history readers (§22: admins, which includes every super admin); area heads and executives get 403. */
export async function requireImportHistoryReader(request: Request, route: string): Promise<CrmGuard> {
  const auth = await requireCrm(request, { write: false, route });
  if (!auth.ok) return auth;
  if (!crmPermissions(auth.viewer).canViewImportHistory) {
    crmLog(route, "forbidden", "not_admin");
    return { ok: false, response: portalApiError("forbidden", IMPORT_MESSAGES.historyForbidden) };
  }
  return auth;
}

/** JSON body, at most 256 KB (a chunk of ≤ 250 rows). */
export function parseImportBody<T>(request: Request, schema: z.ZodType<T>, route: string) {
  return parseCrmBody(request, schema, route, bodyLimit("import"));
}

/** Service result → envelope. Reasons are fixed codes (logged), never shown as text. */
export function importResponse<T>(route: string, result: ImportResult<T>, init: { status?: number } = {}): NextResponse {
  if (result.ok) {
    crmLog(route, "success");
    return portalApiItem(result.data, init);
  }
  crmLog(route, result.error === "not_configured" ? "error" : "bad_request", result.reason);
  return importError(result.error);
}

function importError(error: Exclude<ImportResult<never>, { ok: true }>["error"]): NextResponse<ApiError> {
  switch (error) {
    case "not_configured":
      return portalApiError("not_configured", IMPORT_MESSAGES.notConfigured);
    case "not_found":
      return portalApiError("not_found", IMPORT_MESSAGES.notFound);
    case "forbidden":
      return portalApiError("forbidden", IMPORT_MESSAGES.forbidden);
    case "rate_limited":
      return portalApiError("rate_limited", IMPORT_MESSAGES.rateLimited, { headers: { "Retry-After": "3600" } });
    case "conflict":
      return portalApiError("bad_request", IMPORT_MESSAGES.conflict, { status: 409 });
  }
}
