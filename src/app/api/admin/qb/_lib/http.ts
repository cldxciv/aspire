import "server-only";

import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import type { z } from "zod";

import type { ApiError } from "@/lib/contracts/api";
import { exceptionCode } from "@/lib/auth/log";
import { parseJsonBody, REQUEST_MESSAGES, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem, privateApiHeaders } from "@/lib/auth/responses";
import { recordAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/connection";
import { roleCan } from "@/lib/qb/access";
import type { QbCapability, QbViewer } from "@/lib/qb/types";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

import { ensureSeeded, guardQbApi, type QbServiceResult } from "./services";

/**
 * Route-handler plumbing for `/api/admin/qb/**` (QB-ADMIN-API, docs/question-bank-plan.md §B6,
 * §B14 package 6), on the same rules as the CRM and admin APIs: same-origin for writes, JSON
 * bodies of at most 64 KB, per-user rate limits, the capability check of QB-CORE-B's
 * `requireQbApi` (401 / 403 / 409 while a temporary password is pending), `ensureQbSeeded()`
 * before any service runs, `no-store` + `noindex` on every response, `unstable_rethrow` in catch
 * blocks, and secret-free log lines with fixed codes only.
 */

export const QB_ADMIN_MAX_BODY_BYTES = 64 * 1024;

export const QB_ADMIN_MESSAGES = {
  invalidId: "Invalid id.",
  forbidden: "Your question-bank role does not allow this.",
  rateLimited: (seconds: number) => {
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    return `Too many requests. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
  },
  badPaging: "page must be ≥ 1 and pageSize 1–100.",
  conflict: "This changed meanwhile or is not allowed in its current state.",
} as const;

const FIVE_MINUTES = 5 * 60 * 1000;
const limiters = {
  read: new SlidingWindowRateLimiter({ limit: 600, windowMs: FIVE_MINUTES }),
  write: new SlidingWindowRateLimiter({ limit: 180, windowMs: FIVE_MINUTES }),
  /** 100-seed preview statistics and sample papers: CPU-heavy. */
  heavy: new SlidingWindowRateLimiter({ limit: 30, windowMs: 10 * 60 * 1000 }),
  upload: new SlidingWindowRateLimiter({ limit: 120, windowMs: 60 * 60 * 1000 }),
};

export type QbAdminLimit = keyof typeof limiters;

/** Test helper. */
export function resetQbAdminRateLimitersForTests(): void {
  for (const limiter of Object.values(limiters)) limiter.reset();
}

type Outcome = "success" | "forbidden" | "rate_limited" | "bad_request" | "conflict" | "error";

/** Fixed-code log line (never ids, names, question text or bodies). */
export function qbAdminLog(route: string, outcome: Outcome, reason?: string): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: outcome === "error" ? "error" : outcome === "success" ? "info" : "warn",
    event: "qb_admin",
    route: route.replace(/[^a-z_.]/g, "").slice(0, 40),
    outcome,
    ...(reason ? { reason: reason.replace(/[^A-Za-z0-9_]/g, "").slice(0, 60) } : {}),
  });
  if (outcome === "error") console.error(line);
  else if (outcome === "success") console.info(line);
  else console.warn(line);
}

export type QbAdminGuard = { ok: true; viewer: QbViewer } | { ok: false; response: Response };

/**
 * Guard for every handler: (writes) same-origin 403 → `requireQbApi(capability)` → the per-user
 * rate limit (429) → the idempotent seed. Multi-action routes pass `view` here and then call
 * `requireCapability` for the action they parsed.
 */
export async function requireQbAdmin(
  request: Request,
  options: { capability: QbCapability; write: boolean; route: string; limit?: QbAdminLimit },
): Promise<QbAdminGuard> {
  if (options.write) {
    const rejection = rejectCrossOrigin(request);
    if (rejection) {
      qbAdminLog(options.route, "forbidden", rejection.reason);
      return { ok: false, response: rejection.response };
    }
  }
  const auth = await guardQbApi(request, options.capability);
  if (!auth.ok) return auth;
  const limit = limiters[options.limit ?? (options.write ? "write" : "read")].check(auth.viewer.userId);
  if (!limit.allowed) {
    qbAdminLog(options.route, "rate_limited");
    return {
      ok: false,
      response: portalApiError("rate_limited", QB_ADMIN_MESSAGES.rateLimited(limit.retryAfterSeconds), {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }),
    };
  }
  await ensureSeeded();
  return { ok: true, viewer: auth.viewer };
}

/**
 * Whether the viewer's QB role has `capability`, from QB-CORE-B's own matrix (`@/lib/qb/access`),
 * so the routes and the services can never disagree about a role. The copy in
 * `@/components/qb-admin/constants` only drives what the UI shows.
 */
export function qbViewerCan(viewer: Pick<QbViewer, "role">, capability: QbCapability): boolean {
  return roleCan(viewer.role, capability);
}

/** 403 unless the viewer's QB role has `capability` (§B6 matrix); null when allowed. */
export function requireCapability(viewer: QbViewer, capability: QbCapability, route: string): NextResponse<ApiError> | null {
  if (qbViewerCan(viewer, capability)) return null;
  qbAdminLog(route, "forbidden", `missing_${capability}`);
  return portalApiError("forbidden", QB_ADMIN_MESSAGES.forbidden);
}

/** JSON body of at most 64 KB, validated with `schema` (415 / 413 / 400 / 422). */
export async function parseQbBody<T>(request: Request, schema: z.ZodType<T>, route: string) {
  const body = await parseJsonBody(request, schema, QB_ADMIN_MAX_BODY_BYTES);
  if (!body.ok) qbAdminLog(route, "bad_request", body.reason ?? body.outcome);
  return body;
}

/** A 409 with a stable machine-readable `code` (the D-007 envelope plus `code`). */
export function qbConflict(code: string, message: string = QB_ADMIN_MESSAGES.conflict): NextResponse {
  return NextResponse.json(
    { ok: false, error: "bad_request", message, code: code.replace(/[^a-z0-9_]/g, "").slice(0, 60) || "conflict" },
    { status: 409, headers: privateApiHeaders() },
  );
}

/** Maps a service result onto the API envelope. */
export function qbResponse<T>(result: QbServiceResult<T>, init: { status?: number } = {}): NextResponse {
  if (result.ok) return portalApiItem(result.data, init);
  switch (result.error) {
    case "not_found":
      return portalApiError("not_found", result.message);
    case "forbidden":
      return portalApiError("forbidden", result.message);
    case "validation":
      return portalApiError("validation", result.message || REQUEST_MESSAGES.validation, { fieldErrors: result.fieldErrors ?? {} });
    case "conflict":
      return qbConflict(result.code ?? "conflict", result.message);
  }
}

/** For a route handler's `catch`: re-throws Next control flow, logs the class only, generic 500. */
export function qbServerError(route: string, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  qbAdminLog(route, "error", exceptionCode(error));
  return portalApiError("server_error", REQUEST_MESSAGES.serverError);
}

/** Figures: PNG, JPEG or WebP of at most 200 KB (§B12); the multipart envelope may add a little. */
export const QB_FIGURE_MAX_BYTES = 200 * 1024;
export const QB_FIGURE_MAX_REQUEST_BYTES = QB_FIGURE_MAX_BYTES + 16 * 1024;

/**
 * Reads a binary body without buffering more than `maxBytes` (a declared Content-Length above the
 * limit is refused unread; chunked or lying bodies are counted as they stream).
 */
export async function readBytesWithLimit(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; reason: "too_large" | "invalid_content_length" }> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared.trim())) return { ok: false, reason: "invalid_content_length" };
    if (Number(declared) > maxBytes) return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }
  if (declared !== null && Number(declared) !== total) return { ok: false, reason: "invalid_content_length" };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Question, chapter, blueprint, batch and user ids: 1–64 of `A–Z a–z 0–9 _ -`. */
export function isQbId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export function invalidId(): NextResponse<ApiError> {
  return portalApiError("bad_request", QB_ADMIN_MESSAGES.invalidId);
}

/** `page` (≥ 1) and `pageSize` (1–100, default 25) from the query; null when malformed. */
export function pagingFromSearch(params: URLSearchParams): { page: number; pageSize: number } | null {
  const page = params.get("page") === null ? 1 : Number(params.get("page"));
  const pageSize = params.get("pageSize") === null ? 25 : Number(params.get("pageSize"));
  if (!Number.isInteger(page) || page < 1 || page > 100_000) return null;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  return { page, pageSize };
}

// ---------------------------------------------------------------------------------------------
// Audit (§B6): the core `audit_log`, written by these routes for the actions they serve (the
// convention agreed with QB-CORE-B's `src/lib/qb/audit.ts`: routes audit, services do not). The
// action names match `QB_AUDIT_ACTIONS` there; `bulk_aborted`, `blueprint_new_version` and
// `unit_upsert` are additions of this package.

export const QB_AUDIT = {
  bulkApprove: "qb.bulk_approve",
  bulkLabels: "qb.bulk_labels",
  bulkAborted: "qb.bulk_aborted",
  blueprintPublish: "qb.blueprint_publish",
  blueprintArchive: "qb.blueprint_archive",
  blueprintNewVersion: "qb.blueprint_new_version",
  patternConfirm: "qb.pattern_confirm",
  blueprintSignoff: "qb.blueprint_signoff",
  taxonomyConfirm: "qb.taxonomy_confirm",
  unitUpsert: "qb.unit_upsert",
  keyCorrection: "qb.key_correction",
  memberUpsert: "qb.member_upsert",
  settingsUpdate: "qb.settings_change",
  thirdPartyCleared: "qb.third_party_override",
} as const;

export type QbAuditAction = (typeof QB_AUDIT)[keyof typeof QB_AUDIT];

/** Audit details are flat, secret-free facts (ids, counts, flags) — never question text or names. */
export function qbAudit(
  viewer: QbViewer,
  input: { action: QbAuditAction; target: string | null; details?: Record<string, string | number | boolean | null>; now: number },
): void {
  recordAudit(getDb(), { actorId: viewer.userId, action: input.action, target: input.target, details: input.details, now: input.now });
}

/** Up to `max` ids as one comma-separated audit value (the audit log keeps 200 characters). */
export function auditIdList(ids: readonly string[], max = 10): string {
  return ids.slice(0, max).join(",");
}
