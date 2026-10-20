import "server-only";
import type { NextResponse } from "next/server";
import { z } from "zod";
import type { ApiError } from "@/lib/contracts/api";
import { getSiteOrigin } from "@/lib/server/env";
import { checkSameOrigin, isJsonContentType, readBodyWithLimit } from "@/lib/server/request-guards";
import type { AuthLogOutcome, AuthLogReason } from "./log";
import { portalApiError } from "./responses";

/**
 * Request checks shared by the state-changing auth and admin endpoints:
 * same-origin (CSRF), JSON content type, bounded body size and zod validation.
 */

/** Auth and admin request bodies are tiny; anything bigger is rejected unread. */
export const AUTH_MAX_BODY_BYTES = 4 * 1024;

export const REQUEST_MESSAGES = {
  crossOrigin: "This request was blocked because it did not come from this website.",
  unsupportedMediaType: "Content-Type must be application/json.",
  tooLarge: "The request is too large.",
  badRequest: "The request body must be a valid JSON object.",
  validation: "Please check the highlighted fields.",
  serverError: "Something went wrong. Please try again.",
} as const;

export type RequestRejection = {
  response: NextResponse<ApiError>;
  outcome: AuthLogOutcome;
  reason?: AuthLogReason;
};

/** Same-origin check (reuses the enquiry endpoint's rules). `null` when allowed. */
export function rejectCrossOrigin(request: Request): RequestRejection | null {
  const result = checkSameOrigin(request, { siteOrigin: getSiteOrigin(process.env) });
  if (result.ok) return null;
  return { response: portalApiError("forbidden", REQUEST_MESSAGES.crossOrigin), outcome: "forbidden", reason: result.reason };
}

export type ParsedBody<T> = { ok: true; data: T } | ({ ok: false } & RequestRejection);

/**
 * JSON-only, size-limited body parsing with zod validation (422 with `fieldErrors`).
 * Call `rejectCrossOrigin` first.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes: number = AUTH_MAX_BODY_BYTES,
): Promise<ParsedBody<T>> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return {
      ok: false,
      response: portalApiError("bad_request", REQUEST_MESSAGES.unsupportedMediaType, { status: 415 }),
      outcome: "bad_request",
      reason: "unsupported_media_type",
    };
  }
  const body = await readBodyWithLimit(request, maxBytes);
  if (!body.ok) {
    if (body.reason === "too_large") {
      return {
        ok: false,
        response: portalApiError("bad_request", REQUEST_MESSAGES.tooLarge, { status: 413 }),
        outcome: "bad_request",
        reason: "payload_too_large",
      };
    }
    return {
      ok: false,
      response: portalApiError("bad_request", REQUEST_MESSAGES.badRequest),
      outcome: "bad_request",
      reason: body.reason,
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    return {
      ok: false,
      response: portalApiError("bad_request", REQUEST_MESSAGES.badRequest),
      outcome: "bad_request",
      reason: "invalid_json",
    };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return {
      ok: false,
      response: portalApiError("bad_request", REQUEST_MESSAGES.badRequest),
      outcome: "bad_request",
      reason: "invalid_json",
    };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const { fieldErrors, formErrors } = z.flattenError(parsed.error);
    const errors: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries(fieldErrors as Record<string, string[] | undefined>)) {
      if (messages && messages.length > 0) errors[key] = messages;
    }
    if (formErrors.length > 0) errors._form = formErrors;
    return {
      ok: false,
      response: portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: errors }),
      outcome: "validation_failed",
    };
  }
  return { ok: true, data: parsed.data };
}
