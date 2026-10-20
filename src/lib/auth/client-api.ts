/**
 * Browser-side helpers for the auth, portal and admin JSON APIs (AUTH-2). Client-safe: no
 * server imports, nothing here logs. Passwords only ever travel in a request body; they are
 * never stored, cached or put in a URL.
 *
 * The APIs answer in English (D-007 envelope). The UI shows its own localised copy, chosen by
 * HTTP status / error code and, where one code covers several cases, by recognising the
 * server's fixed message with `identifyApiMessage()`. `client-api.test.ts` keeps the mirrored
 * strings below in sync with their server-side sources.
 */
import type { ApiErrorCode } from "@/lib/contracts/api";
import { AUTH_MESSAGES } from "./messages";

/** Mirrors `PASSWORD_CHANGE_REQUIRED_MESSAGE` in guards.ts (server-only). */
export const PASSWORD_CHANGE_REQUIRED_TEXT = "Please change your temporary password before continuing.";

/** Mirrors `PASSWORD_POLICY_MESSAGES` in password.ts (server-only). */
export const PASSWORD_POLICY_TEXT = {
  too_short: "Use at least 10 characters.",
  too_long: "Use at most 128 characters.",
  same_as_login_id: "Your password must not be the same as your login ID.",
} as const;

/** Mirrors `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH` in password.ts (server-only). */
export const PASSWORD_LENGTH = { min: 10, max: 128 } as const;

export type KnownApiMessage =
  | "passwordChangeRequired"
  | "wrongCurrentPassword"
  | "samePassword"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordSameAsLoginId"
  | "loginIdTaken"
  | "invalidLoginId"
  | "invalidDisplayName"
  | "selfDisable"
  | "lastAdmin"
  | "selfReset"
  | "notAParent"
  | "notAStudent"
  | "userNotFound";

const KNOWN: ReadonlyArray<[string, KnownApiMessage]> = [
  [PASSWORD_CHANGE_REQUIRED_TEXT, "passwordChangeRequired"],
  [AUTH_MESSAGES.wrongCurrentPassword, "wrongCurrentPassword"],
  [AUTH_MESSAGES.samePassword, "samePassword"],
  [PASSWORD_POLICY_TEXT.too_short, "passwordTooShort"],
  [PASSWORD_POLICY_TEXT.too_long, "passwordTooLong"],
  [PASSWORD_POLICY_TEXT.same_as_login_id, "passwordSameAsLoginId"],
  [AUTH_MESSAGES.loginIdTaken, "loginIdTaken"],
  [AUTH_MESSAGES.invalidLoginId, "invalidLoginId"],
  [AUTH_MESSAGES.invalidDisplayName, "invalidDisplayName"],
  [AUTH_MESSAGES.selfDisable, "selfDisable"],
  [AUTH_MESSAGES.lastAdmin, "lastAdmin"],
  [AUTH_MESSAGES.selfReset, "selfReset"],
  [AUTH_MESSAGES.notAParent, "notAParent"],
  [AUTH_MESSAGES.notAStudent, "notAStudent"],
  [AUTH_MESSAGES.userNotFound, "userNotFound"],
];

/** Recognises one of the API's fixed English messages; `null` for anything else. */
export function identifyApiMessage(message: unknown): KnownApiMessage | null {
  if (typeof message !== "string") return null;
  return KNOWN.find(([text]) => text === message)?.[1] ?? null;
}

const ERROR_CODES: readonly ApiErrorCode[] = [
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "validation",
  "rate_limited",
  "not_configured",
  "server_error",
];

function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status === 503) return "not_configured";
  if (status >= 400 && status < 500) return "bad_request";
  return "server_error";
}

export type ApiFailure = {
  ok: false;
  /** HTTP status; 0 when the request never got a response. */
  status: number;
  /** Envelope error code, or "network" when the server could not be reached. */
  error: ApiErrorCode | "network";
  /** The server's message, recognised (never shown as-is: the UI localises by code). */
  known: KnownApiMessage | null;
  /** Field → recognised message for each field error (`null` when not recognised). */
  fieldErrors: Record<string, KnownApiMessage | null>;
  /** Seconds from `Retry-After` on 429 responses. */
  retryAfterSeconds?: number;
};

export type ApiResult<T> = { ok: true; status: number; data: T } | ApiFailure;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Same-origin JSON request to one of the site's own APIs. Never throws: network failures,
 * non-JSON bodies and error envelopes all come back as `{ ok: false, … }`.
 */
export async function callApi<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<ApiResult<T>> {
  if (!path.startsWith("/api/")) throw new Error("callApi only calls this site's /api routes");
  const hasBody = options.body !== undefined;
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (hasBody ? "POST" : "GET"),
      headers: hasBody ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: hasBody ? JSON.stringify(options.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: "network", known: null, fieldErrors: {} };
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (response.ok && isObject(json) && json.ok === true) {
    return { ok: true, status: response.status, data: json.data as T };
  }

  const envelope = isObject(json) ? json : {};
  const error =
    typeof envelope.error === "string" && (ERROR_CODES as readonly string[]).includes(envelope.error)
      ? (envelope.error as ApiErrorCode)
      : codeForStatus(response.ok ? 500 : response.status);
  const fieldErrors: Record<string, KnownApiMessage | null> = {};
  if (isObject(envelope.fieldErrors)) {
    for (const [field, messages] of Object.entries(envelope.fieldErrors)) {
      fieldErrors[field] = identifyApiMessage(Array.isArray(messages) ? messages[0] : undefined);
    }
  }
  const failure: ApiFailure = {
    ok: false,
    status: response.status,
    error,
    known: identifyApiMessage(envelope.message),
    fieldErrors,
  };
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) failure.retryAfterSeconds = Math.ceil(retryAfter);
  return failure;
}

/** Whole minutes to wait for a 429 (at least 1). */
export function retryAfterMinutes(seconds: number | undefined): number {
  return Math.max(1, Math.ceil((seconds ?? 60) / 60));
}

/** Password length the way the server counts it (code points, so Devanagari is not over-counted). */
export function passwordLength(password: string): number {
  return Array.from(password).length;
}

/**
 * Client-side mirror of the server's password policy, for early feedback only (the server
 * always re-checks): 10–128 characters and not the login id.
 */
export function clientPasswordIssue(
  password: string,
  loginId?: string,
): "passwordTooShort" | "passwordTooLong" | "passwordSameAsLoginId" | null {
  const length = passwordLength(password);
  if (length < PASSWORD_LENGTH.min) return "passwordTooShort";
  if (length > PASSWORD_LENGTH.max) return "passwordTooLong";
  if (loginId && password.trim().toLowerCase() === loginId.trim().toLowerCase()) return "passwordSameAsLoginId";
  return null;
}
