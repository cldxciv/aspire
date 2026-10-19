import "server-only";

import type { ApiError, ApiErrorCode, ApiItem, ApiList } from "@/lib/contracts/api";

/**
 * JSON response helpers for every /api route owned by BE.
 * All responses use the shared envelope (src/lib/contracts/api.ts, D-007) and
 * `Cache-Control: no-store` so enquiry results and filtered content are never
 * cached by browsers or intermediaries.
 */

export const NO_STORE = "no-store";

export function jsonResponse(body: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", NO_STORE);
  return Response.json(body, { status: init.status ?? 200, headers });
}

export function apiError(
  status: number,
  error: ApiErrorCode,
  message: string,
  extra: { fieldErrors?: Record<string, string[]>; headers?: HeadersInit } = {},
): Response {
  const body: ApiError = { ok: false, error, message };
  if (extra.fieldErrors) body.fieldErrors = extra.fieldErrors;
  return jsonResponse(body, { status, headers: extra.headers });
}

export function apiList<T>(data: T[]): Response {
  const body: ApiList<T> = { ok: true, data };
  return jsonResponse(body);
}

export function apiItem<T>(data: T): Response {
  const body: ApiItem<T> = { ok: true, data };
  return jsonResponse(body);
}

/** Generic 404 in the envelope (used by the [slug] content routes). */
export function notFoundResponse(message: string): Response {
  return apiError(404, "not_found", message);
}
