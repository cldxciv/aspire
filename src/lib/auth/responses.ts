import { NextResponse } from "next/server";
import type { ApiError, ApiErrorCode, ApiItem } from "@/lib/contracts/api";
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

/** Headers for every portal / session API response: never cached, never indexed. */
export function privateApiHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "X-Robots-Tag": ROBOTS_NOINDEX,
  });
}

const DEFAULT_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  unauthenticated: "Sign-in required. Portal sign-in is not available yet.",
  forbidden: "You do not have access to this resource.",
};

/** JSON error envelope with the matching status and private headers. */
export function portalApiError(code: ApiErrorCode, message?: string): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { ok: false, error: code, message: message ?? DEFAULT_MESSAGES[code] ?? "Request failed." },
    { status: API_ERROR_STATUS[code], headers: privateApiHeaders() },
  );
}

/** JSON success envelope with private headers. */
export function portalApiItem<T>(data: T): NextResponse<ApiItem<T>> {
  return NextResponse.json<ApiItem<T>>({ ok: true, data }, { status: 200, headers: privateApiHeaders() });
}
