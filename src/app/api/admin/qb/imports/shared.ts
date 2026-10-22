import "server-only";

import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import type { ApiError, ApiErrorCode } from "@/lib/contracts/api";
import { exceptionCode } from "@/lib/auth/log";
import { portalApiError, privateApiHeaders } from "@/lib/auth/responses";
import type { ImportFailure } from "@/lib/qb/import/jobs";
import type { ImportViewer, TabularReport } from "@/lib/qb/import/types";
import { isAiKind } from "@/lib/qb/import/types";
import type { QbCapability, QbImportKind } from "@/lib/qb/types";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";

/**
 * Plumbing shared by /api/admin/qb/imports/** (QB-IMPORT): fixed-code logs, the error envelope
 * with a machine-readable `reason` (the UI localises it), per-user rate limits, the bounded
 * multipart body reader, and which capability each action needs.
 */

/** JSON bodies (actions) are capped at 64 KB like every QB API. */
export const IMPORT_MAX_JSON_BYTES = 64 * 1024;
/** Multipart overhead allowed on top of the file itself (fields, boundaries). */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const HOUR = 60 * 60_000;
const FIVE_MINUTES = 5 * 60_000;
const limiters = {
  upload: new SlidingWindowRateLimiter({ limit: 30, windowMs: HOUR }),
  action: new SlidingWindowRateLimiter({ limit: 300, windowMs: FIVE_MINUTES }),
  read: new SlidingWindowRateLimiter({ limit: 1200, windowMs: FIVE_MINUTES }),
};

export type ImportLimit = keyof typeof limiters;

export function resetImportRateLimitersForTests(): void {
  for (const limiter of Object.values(limiters)) limiter.reset();
}

export function importLog(route: string, outcome: "success" | "forbidden" | "rate_limited" | "bad_request" | "error", reason?: string): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: outcome === "error" ? "error" : outcome === "success" ? "info" : "warn",
    event: "qb_import_api",
    route: route.replace(/[^a-z_.]/g, "").slice(0, 40),
    outcome,
    ...(reason ? { reason: reason.replace(/[^A-Za-z0-9_:]/g, "").slice(0, 60) } : {}),
  });
  if (outcome === "error") console.error(line);
  else if (outcome === "success") console.info(line);
  else console.warn(line);
}

/** Per-user limit; a ready-made 429 when exceeded. */
export function checkImportLimit(limit: ImportLimit, userId: string, route: string): NextResponse<ApiError> | null {
  const result = limiters[limit].check(userId);
  if (result.allowed) return null;
  importLog(route, "rate_limited");
  return portalApiError("rate_limited", "Too many requests. Please wait a moment and try again.", {
    headers: { "Retry-After": String(result.retryAfterSeconds) },
  });
}

/** English messages per failure reason (the job page shows its own localised text by `reason`). */
const MESSAGES: Record<string, string> = {
  not_found: "No such import.",
  taxonomy_unconfirmed: "An administrator must confirm this exam's syllabus list before anything can be imported for it.",
  booklet_duplicate: "Another booklet of this NEET paper is already imported. Import only its answer key for this booklet.",
  paper_duplicate: "This paper is already imported.",
  duplicate_file: "This file is already being imported.",
  file_too_large: "The file is too large.",
  file_type_mismatch: "The file does not match the chosen type.",
  storage_quota: "The import folder is full. Close finished imports to free space.",
  daily_cap: "Today's AI import budget is used up. Imports continue tomorrow.",
  licence_required: "Confirm that Aspire has the right to use this file.",
  job_busy: "Pause or cancel the import first.",
  no_valid_rows: "No row of the file can become a draft. See the report.",
  extras_not_available: "AI-drafted solutions and machine Hindi are not available yet.",
};

function codeFor(status: number): ApiErrorCode {
  switch (status) {
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 422:
      return "validation";
    case 429:
      return "rate_limited";
    case 503:
      return "not_configured";
    case 500:
      return "server_error";
    default:
      return "bad_request";
  }
}

export type ImportErrorBody = ApiError & { reason: string; report?: TabularReport };

/** The D-007 envelope plus `reason` (and the dry-run `report` for tabular refusals). */
export function importFailureResponse(failure: ImportFailure | { status: number; reason: string; report?: TabularReport }): NextResponse<ImportErrorBody> {
  const base = failure.reason.split(":")[0];
  const body: ImportErrorBody = {
    ok: false,
    error: codeFor(failure.status),
    message: MESSAGES[base] ?? "The import request could not be completed.",
    reason: failure.reason,
    ...(failure.report ? { report: failure.report } : {}),
  };
  return NextResponse.json(body, { status: failure.status, headers: privateApiHeaders() });
}

export function importServerError(route: string, error: unknown): NextResponse<ApiError> {
  unstable_rethrow(error);
  importLog(route, "error", exceptionCode(error));
  return portalApiError("server_error", "Something went wrong. Please try again.");
}

export type RawBody = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; reason: "too_large" | "length_required" | "truncated" | "invalid_content_length" };

/**
 * Reads the raw body without buffering more than `maxBytes`. `Content-Length` is required and must
 * equal the bytes received: the Next proxy buffers only 10 MB of a body, so a larger upload would
 * otherwise arrive silently truncated.
 */
export async function readUploadBody(request: Request, maxBytes: number): Promise<RawBody> {
  const declared = request.headers.get("content-length");
  if (declared === null) return { ok: false, reason: "length_required" };
  if (!/^\d+$/.test(declared.trim())) return { ok: false, reason: "invalid_content_length" };
  const expected = Number(declared);
  if (expected > maxBytes) return { ok: false, reason: "too_large" };
  if (!request.body) return expected === 0 ? { ok: true, bytes: new Uint8Array() } : { ok: false, reason: "truncated" };
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
  if (total !== expected) return { ok: false, reason: "truncated" };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

/**
 * The capability needed to upload (and manage) an import: `import_ai` for files read by AI and for
 * an OFFICIAL key CSV (it sets official answers, like a key PDF); `import_tabular` otherwise.
 */
export function importCapability(kind: QbImportKind, sourceKind: "official" | "aspire" | undefined): QbCapability {
  return isAiKind(kind) || (kind === "csv_key" && sourceKind === "official") ? "import_ai" : "import_tabular";
}

/** The capability an action needs on an import of `kind` (from `sourceKind`). */
export function actionCapability(kind: QbImportKind, action: string, sourceKind?: "official" | "aspire"): QbCapability {
  switch (action) {
    case "run":
    case "retry_failed":
      return "import_ai";
    case "confirm_snapshot":
      return "approve";
    default:
      // create_drafts / pause / cancel / close follow who may upload that kind of import.
      return importCapability(kind, sourceKind);
  }
}

/** What the import pages need to know about the viewer (capability hints; the API re-checks). */
export function viewerInfo(viewer: ImportViewer) {
  return {
    role: viewer.role,
    can: {
      importTabular: viewer.can("import_tabular"),
      importAi: viewer.can("import_ai"),
      approve: viewer.can("approve"),
    },
  };
}

export const IMPORT_ID_PATTERN = /^imp_[a-z0-9]{16}$/;
