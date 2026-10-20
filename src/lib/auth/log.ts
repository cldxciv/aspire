import "server-only";

/**
 * Structured, secret-free logging for the auth endpoints. Entries carry fixed codes
 * only: never a login id, password, hash, token, cookie, IP address, user agent or
 * request body. Who did what is recorded in the database audit log instead.
 */

export type AuthLogAction = "login" | "logout" | "me" | "change_password" | "session" | "admin_users";

export type AuthLogOutcome =
  | "success"
  | "failed"
  | "forbidden"
  | "rate_limited"
  | "bad_request"
  | "validation_failed"
  | "error";

export type AuthLogReason =
  | "unknown_user"
  | "bad_password"
  | "disabled"
  | "role_mismatch"
  | "too_long"
  | "wrong_current_password"
  | "origin_mismatch"
  | "origin_null"
  | "origin_invalid"
  | "cross_site_fetch"
  | "missing_origin"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_json"
  | "invalid_encoding"
  | "invalid_content_length"
  | `exception_${string}`;

export interface AuthLogEntry {
  action: AuthLogAction;
  outcome: AuthLogOutcome;
  reason?: AuthLogReason;
}

export function authLog(entry: AuthLogEntry): void {
  const { action, outcome, reason } = entry;
  const level = outcome === "error" ? "error" : outcome === "success" ? "info" : "warn";
  // Explicit field picking: extra properties passed at runtime are never written.
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event: "auth",
    action,
    outcome,
    ...(reason ? { reason } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** A thrown value's constructor name only (messages can echo input). */
export function exceptionCode(error: unknown): AuthLogReason {
  const name = error instanceof Error ? error.name : typeof error;
  return `exception_${name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"}`;
}
