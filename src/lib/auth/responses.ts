import { NextResponse } from "next/server";
import type { ApiError, ApiErrorCode, ApiItem, ApiList } from "@/lib/contracts/api";
import { ROBOTS_NOINDEX } from "./config";

/** HTTP status for each envelope error code (src/lib/contracts/api.ts, D-007). */
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  rate_limited: 429,
  not_configured: 503,
  server_error: 500,
};

/** Headers for every portal / session / auth API response: never cached, never indexed. */
export function privateApiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", ROBOTS_NOINDEX);
  return headers;
}

const DEFAULT_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  unauthenticated: "Please sign in to continue.",
  forbidden: "You do not have access to this resource.",
};

export interface PortalErrorOptions {
  /** Overrides the code's default status (e.g. 413 / 415 for `bad_request`). */
  status?: number;
  headers?: HeadersInit;
  fieldErrors?: Record<string, string[]>;
}

/** JSON error envelope with the matching status and private headers. */
export function portalApiError(
  code: ApiErrorCode,
  message?: string,
  options: PortalErrorOptions = {},
): NextResponse<ApiError> {
  const body: ApiError = { ok: false, error: code, message: message ?? DEFAULT_MESSAGES[code] ?? "Request failed." };
  if (options.fieldErrors) body.fieldErrors = options.fieldErrors;
  return NextResponse.json<ApiError>(body, {
    status: options.status ?? API_ERROR_STATUS[code],
    headers: privateApiHeaders(options.headers),
  });
}

/** JSON success envelope with private headers. */
export function portalApiItem<T>(data: T, init: { status?: number } = {}): NextResponse<ApiItem<T>> {
  return NextResponse.json<ApiItem<T>>({ ok: true, data }, { status: init.status ?? 200, headers: privateApiHeaders() });
}

/** JSON list envelope with private headers. */
export function portalApiList<T>(data: T[]): NextResponse<ApiList<T>> {
  return NextResponse.json<ApiList<T>>({ ok: true, data }, { status: 200, headers: privateApiHeaders() });
}
