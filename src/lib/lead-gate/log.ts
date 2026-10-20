import "server-only";

import type { LeadGateConfigWarning } from "./config";
import type { LeadGateTool } from "./contract";

/**
 * Structured, PII-free logging for the lead gate (same rule as src/lib/server/logger.ts): never a
 * name, phone, IP, token, pass id/hash, lead id, context value or request body. Only the fixed
 * codes below are written, picked field by field.
 */

export type LeadGateLogAction = "status" | "unlock" | "forget" | "usage" | "record" | "sign_out";

export type LeadGateLogOutcome =
  | "ok" // status answered / usage recorded / forgotten
  | "unlocked" // 201: details stored (or appended) and a pass issued
  | "unlocked_capped" // 201: per-phone cap reached, pass bound to the existing lead, nothing appended
  | "session" // signed in: nothing stored
  | "off" // gate off: nothing stored
  | "honeypot" // bot trap: looks unlocked, nothing stored, dead cookie
  | "withdrawn" // consent withdrawn on the lead
  | "skipped" // usage not recorded (reason says why)
  | "forbidden"
  | "bad_request"
  | "validation_failed"
  | "rate_limited"
  | "phone_rate_limited"
  | "paused" // flood breaker: new captures paused
  | "store_failed"
  | "error";

export type LeadGateLogReason =
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
  | "no_pass"
  | "not_recorded"
  | "stale_cookie"
  | "no_lead"
  | "invalid_phone"
  | "consent_missing"
  | "invalid_input"
  | `exception_${string}`;

export interface LeadGateLogEntry {
  action: LeadGateLogAction;
  outcome: LeadGateLogOutcome;
  reason?: LeadGateLogReason;
  tool?: LeadGateTool;
  /** The capture created a new lead (vs. appended to an existing one). Not personal. */
  isNew?: boolean;
  durationMs?: number;
}

function write(level: "info" | "warn" | "error", record: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...record });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function leadGateLog(entry: LeadGateLogEntry): void {
  const { action, outcome, reason, tool, isNew, durationMs } = entry;
  const level =
    outcome === "error" || outcome === "store_failed"
      ? "error"
      : outcome === "ok" || outcome === "unlocked" || outcome === "unlocked_capped" || outcome === "session" || outcome === "off" || outcome === "skipped"
        ? "info"
        : "warn";
  write(level, {
    event: "lead_gate",
    action,
    outcome,
    ...(reason ? { reason } : {}),
    ...(tool ? { tool } : {}),
    ...(isNew !== undefined ? { isNew } : {}),
    ...(durationMs !== undefined ? { durationMs: Math.round(durationMs) } : {}),
  });
}

const warned = new Set<LeadGateConfigWarning>();

/** Once per process per code. */
export function leadGateConfigWarning(code: LeadGateConfigWarning): void {
  if (warned.has(code)) return;
  warned.add(code);
  write("warn", { event: "config", code });
}

/** A thrown value as a safe reason code (constructor name only, never the message). */
export function leadGateExceptionReason(error: unknown): LeadGateLogReason {
  const name = error instanceof Error ? error.name : typeof error;
  return `exception_${name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"}`;
}
