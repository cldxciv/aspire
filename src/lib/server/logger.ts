import "server-only";

import type { EnquirySource } from "@/lib/contracts/enquiry";

/**
 * Structured, PII-free logging for the enquiry pipeline.
 *
 * Privacy rule (BE brief §7, specs/acceptance_checklist.md): never log a
 * name, phone, email, message, IP address, request body, webhook URL or
 * secret. The entry types below only admit the allowed fields, and nothing
 * here ever logs `Error.message` — JSON.parse and fetch errors can echo
 * request/response content or URLs.
 */

export type EnquiryLogOutcome =
  | "received" // destination accepted (201)
  | "not_configured" // valid, nothing sent (200)
  | "honeypot" // bot trap tripped; nothing sent
  | "delivery_failed" // destination rejected / timed out (500)
  | "forbidden" // origin / CSRF check failed (403)
  | "unsupported_media_type" // 415
  | "payload_too_large" // 413
  | "bad_request" // malformed body (400)
  | "validation_failed" // 422
  | "rate_limited" // 429
  | "error"; // unexpected exception (500)

/** Short machine codes only — never free text derived from user input or upstream responses. */
export type EnquiryLogReason =
  | "origin_mismatch"
  | "origin_null"
  | "origin_invalid"
  | "cross_site_fetch"
  | "missing_origin"
  | "invalid_json"
  | "not_an_object"
  | "invalid_encoding"
  | "invalid_content_length"
  | "timeout"
  | "network"
  | `http_${number}`
  | `exception_${string}`;

export interface EnquiryLogEntry {
  outcome: EnquiryLogOutcome;
  durationMs: number;
  reference?: string;
  source?: EnquirySource;
  reason?: EnquiryLogReason;
}

export type ConfigWarningCode =
  | "enquiry_destination_unknown"
  | "enquiry_webhook_url_missing"
  | "enquiry_webhook_url_invalid"
  | "enquiry_webhook_url_insecure"
  | "enquiry_webhook_secret_missing"
  | "enquiry_webhook_secret_too_short";

export interface Logger {
  enquiry(entry: EnquiryLogEntry): void;
  configWarning(code: ConfigWarningCode): void;
}

function write(level: "info" | "warn" | "error", record: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...record });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

const warnedCodes = new Set<ConfigWarningCode>();

export const logger: Logger = {
  enquiry(entry) {
    const { outcome, durationMs, reference, source, reason } = entry;
    const level =
      outcome === "error" || outcome === "delivery_failed"
        ? "error"
        : outcome === "received" || outcome === "not_configured"
          ? "info"
          : "warn";
    // Explicit field picking: even if a caller passes extra properties at runtime, only these are written.
    write(level, {
      event: "enquiry",
      outcome,
      durationMs: Math.round(durationMs),
      ...(reference ? { reference } : {}),
      ...(source ? { source } : {}),
      ...(reason ? { reason } : {}),
    });
  },
  configWarning(code) {
    // Once per process per code: misconfiguration is persistent, no need to log it on every request.
    if (warnedCodes.has(code)) return;
    warnedCodes.add(code);
    write("warn", { event: "config", code });
  },
};

/** Test helper: forget which config warnings were already emitted. */
export function resetLoggerStateForTests(): void {
  warnedCodes.clear();
}

/** Maps an unknown thrown value to a safe reason code (its constructor name, never its message). */
export function exceptionReason(error: unknown): EnquiryLogReason {
  const name = error instanceof Error ? error.name : typeof error;
  return `exception_${name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"}`;
}
