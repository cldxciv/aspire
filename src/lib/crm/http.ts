import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { NextResponse } from "next/server";
import type { z } from "zod";

import type { ApiError } from "@/lib/contracts/api";
import { requireRole } from "@/lib/auth/guards";
import { exceptionCode } from "@/lib/auth/log";
import { parseJsonBody, REQUEST_MESSAGES, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

import { CRM_MESSAGES, resolveCrmViewer } from "./access";
import { SLA_FILTERS, type SlaFilter } from "./lead-ops-types";
import {
  CONTACT_FILTERS,
  CREATED_FILTERS,
  isLeadStage,
  LEAD_SORTS,
  SIGNUPS_FILTERS,
  type ContactFilter,
  type CreatedFilter,
  type CrmResult,
  type CrmViewer,
  type LeadFilters,
  type LeadSort,
  type SignupsFilter,
} from "./types";

/**
 * Route-handler plumbing for /api/crm/** (same rules as the admin APIs): same-origin for writes,
 * JSON only, bounded bodies, per-user rate limits, the temporary-password gate (via requireRole),
 * `Cache-Control: no-store` + `X-Robots-Tag` on every response, `unstable_rethrow` in catch blocks,
 * and secret-free logs with fixed codes only.
 */

export const CRM_MAX_BODY_BYTES = 8 * 1024;

/**
 * Body limits per kind of request (lead routing §21): ordinary CRM writes 8 KB; settings
 * documents (calling hours, speed rule, Meta field maps) 32 KB; import chunks 256 KB (under
 * nginx's 1 MB default). Pass one to `parseCrmBody`.
 */
export const CRM_BODY_LIMITS = {
  default: CRM_MAX_BODY_BYTES,
  settings: 32 * 1024,
  import: 256 * 1024,
} as const;

/** The byte limit for a kind of request (`bodyLimit("settings")`). */
export function bodyLimit(kind: keyof typeof CRM_BODY_LIMITS): number {
  return CRM_BODY_LIMITS[kind];
}

export const CRM_API_MESSAGES = {
  noMembership: "Your account is not set up for the CRM yet. Ask an Aspire administrator.",
  rateLimited: (seconds: number) => {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return `Too many requests. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
  },
  invalidId: "Invalid id.",
} as const;

// Per-user limiters (single node, in memory — like the enquiry limiter).
const FIVE_MINUTES = 5 * 60 * 1000;
const limiters = {
  read: new SlidingWindowRateLimiter({ limit: 600, windowMs: FIVE_MINUTES }),
  write: new SlidingWindowRateLimiter({ limit: 120, windowMs: FIVE_MINUTES }),
  export: new SlidingWindowRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
};

export type CrmLimit = keyof typeof limiters;

/** Test helper. */
export function resetCrmRateLimitersForTests(): void {
  for (const limiter of Object.values(limiters)) limiter.reset();
}

export type CrmGuard = { ok: true; viewer: CrmViewer } | { ok: false; response: NextResponse<ApiError> };

type CrmLogOutcome = "success" | "forbidden" | "rate_limited" | "bad_request" | "error";

/** Fixed-code log line (never ids, names, phones or bodies). */
export function crmLog(route: string, outcome: CrmLogOutcome, reason?: string): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: outcome === "error" ? "error" : outcome === "success" ? "info" : "warn",
    event: "crm",
    route: route.replace(/[^a-z_.]/g, "").slice(0, 40),
    outcome,
    ...(reason ? { reason: reason.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) } : {}),
  });
  if (outcome === "error") console.error(line);
  else if (outcome === "success") console.info(line);
  else console.warn(line);
}

/**
 * Guard for every /api/crm handler: (writes) same-origin → signed-in admin or staff (401 / 403,
 * 403 while a temporary password is pending) → an active CRM membership for staff (403) → the
 * per-user rate limit (429).
 */
export async function requireCrm(
  request: Request,
  options: { write: boolean; limit?: CrmLimit; route: string },
): Promise<CrmGuard> {
  if (options.write) {
    const rejection = rejectCrossOrigin(request);
    if (rejection) {
      crmLog(options.route, "forbidden", rejection.reason);
      return { ok: false, response: rejection.response };
    }
  }
  const auth = await requireRole("staff", "admin");
  if (!auth.ok) return auth;
  const viewer = resolveCrmViewer(auth.session);
  if (!viewer) {
    crmLog(options.route, "forbidden", "no_membership");
    return { ok: false, response: portalApiError("forbidden", CRM_API_MESSAGES.noMembership) };
  }
  const limit = limiters[options.limit ?? (options.write ? "write" : "read")].check(`${viewer.userId}`);
  if (!limit.allowed) {
    crmLog(options.route, "rate_limited");
    return {
      ok: false,
      response: portalApiError("rate_limited", CRM_API_MESSAGES.rateLimited(limit.retryAfterSeconds), {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }),
    };
  }
  return { ok: true, viewer };
}

/**
 * Guard for every SUPER-ADMIN-ONLY CRM write (and the few SA-only reads: secrets state, the Meta
 * inbox): `requireCrm` (same-origin for writes, session, membership, rate limit), then an
 * EFFECTIVE super admin (D-044) — 403 otherwise. Enforced on the server for every call; hidden
 * buttons are never the protection.
 */
export async function requireCrmSuperAdmin(
  request: Request,
  options: { write: boolean; limit?: CrmLimit; route: string },
): Promise<CrmGuard> {
  const auth = await requireCrm(request, options);
  if (!auth.ok) return auth;
  if (auth.viewer.role !== "admin" || auth.viewer.superAdmin !== true) {
    crmLog(options.route, "forbidden", "super_admin_only");
    return { ok: false, response: portalApiError("forbidden", CRM_MESSAGES.superAdminOnly) };
  }
  return auth;
}

/** JSON body with the CRM size limit (`maxBytes`: one of `CRM_BODY_LIMITS`, default 8 KB). */
export async function parseCrmBody<T>(request: Request, schema: z.ZodType<T>, route: string, maxBytes: number = CRM_MAX_BODY_BYTES) {
  const body = await parseJsonBody(request, schema, maxBytes);
  if (!body.ok) crmLog(route, "bad_request", body.reason ?? body.outcome);
  return body;
}

/** Maps a service result onto the API envelope. */
export function crmResponse<T>(result: CrmResult<T>, init: { status?: number } = {}): NextResponse {
  if (result.ok) return portalApiItem(result.data, init);
  switch (result.error) {
    case "not_found":
      return portalApiError("not_found", result.message);
    case "forbidden":
      return portalApiError("forbidden", result.message);
    case "validation":
      return portalApiError("validation", result.message || REQUEST_MESSAGES.validation, {
        fieldErrors: result.fieldErrors ?? {},
      });
    case "conflict":
      return portalApiError("bad_request", result.message, { status: 409 });
  }
}

/** For a route handler's `catch`: re-throws Next control flow, logs the class only, generic 500. */
export function crmServerError(route: string, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  crmLog(route, "error", exceptionCode(error));
  return portalApiError("server_error", REQUEST_MESSAGES.serverError);
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isCrmId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/** Inbox filters from query parameters (unknown / malformed values are ignored by the service). */
export function leadFiltersFromSearch(params: URLSearchParams): LeadFilters {
  const get = (name: string) => {
    const value = params.get(name);
    return value === null || value === "" ? undefined : value.slice(0, 100);
  };
  const filters: LeadFilters = {};
  const stage = get("stage");
  if (stage === "open" || isLeadStage(stage)) filters.stage = stage;
  const due = get("due");
  if (due === "today" || due === "overdue") filters.due = due;
  const sort = get("sort");
  if (sort && (LEAD_SORTS as readonly string[]).includes(sort)) filters.sort = sort as LeadSort;
  for (const key of ["centre", "program", "source", "assignee", "q", "createdFrom", "createdTo"] as const) {
    const value = get(key);
    if (value !== undefined) filters[key] = value;
  }
  if (params.get("includeErased") === "true") filters.includeErased = true;
  // Lead routing (§21): `area` = an area id, `none` or `tool_signups`; `sla` = open / overdue / escalated.
  const area = get("area");
  if (area !== undefined && ID.test(area)) filters.area = area;
  const sla = get("sla");
  if (sla !== undefined && (SLA_FILTERS as readonly string[]).includes(sla)) filters.sla = sla as SlaFilter;
  // Admin console 1b (§4.3): `contact=none`, `signups=hide`, `created=today|week|over24h`.
  const contact = get("contact");
  if (contact !== undefined && (CONTACT_FILTERS as readonly string[]).includes(contact)) filters.contact = contact as ContactFilter;
  const signups = get("signups");
  if (signups !== undefined && (SIGNUPS_FILTERS as readonly string[]).includes(signups)) filters.signups = signups as SignupsFilter;
  const created = get("created");
  if (created !== undefined && (CREATED_FILTERS as readonly string[]).includes(created)) filters.created = created as CreatedFilter;
  return filters;
}

/** `page` (≥ 1) and `pageSize` (1–100) from query parameters; null when malformed. */
export function pagingFromSearch(params: URLSearchParams): { page: number; pageSize: number } | null {
  const page = params.get("page") === null ? 1 : Number(params.get("page"));
  const pageSize = params.get("pageSize") === null ? 25 : Number(params.get("pageSize"));
  if (!Number.isInteger(page) || page < 1 || page > 100000) return null;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  return { page, pageSize };
}
