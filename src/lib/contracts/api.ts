/**
 * Shared API response envelope (docs/agent-decisions.md D-007).
 * Every /api route returns one of these shapes with a matching HTTP status.
 */

export type ApiErrorCode =
  | "bad_request" // 400 — malformed body / params
  | "unauthenticated" // 401 — no valid session
  | "forbidden" // 403 — wrong role/record, or failed origin check
  | "not_found" // 404
  | "validation" // 422 — field errors in `fieldErrors`
  | "rate_limited" // 429
  | "not_configured" // 503 — integration not set up (e.g. auth provider)
  | "server_error"; // 500 — never include internals in `message`

export interface ApiError {
  ok: false;
  error: ApiErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
}

export interface ApiList<T> {
  ok: true;
  data: T[];
}

export interface ApiItem<T> {
  ok: true;
  data: T;
}
