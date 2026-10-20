import "server-only";

import { randomBytes } from "node:crypto";

import { showPlaceholderContent } from "@/lib/content-mode";
import { parseEnquiryStore, type Env } from "@/lib/server/env";

import type { LeadGateMode } from "./contract";

/**
 * Lead gate configuration (docs/lead-gate-plan.md §4). Read on EVERY request by the API routes;
 * never read in a Server Component or at build time (the Docker build does not see runtime env,
 * critiques 0.5 / 1.4), so pages stay static and the up-front note is rendered from the live
 * GET /api/lead-gate answer.
 *
 *   LEAD_GATE                    off (default) | optional | required
 *   LEAD_GATE_SECRET             ≥ 32 characters; signs the aspire_tool_pass cookie (required in production)
 *   LEAD_GATE_RECORD_USE         all (default) | parent | off: which passes note tool use
 *   LEAD_GATE_ASSIGN             auto (default) | none: auto-assign NEW gate leads, or leave them Unassigned
 *   LEAD_GATE_ALLOW_SAMPLE_DATA  true to allow the gate while placeholder/sample data is shown (staging QA only)
 *   LEAD_GATE_MAX_NEW_LEADS_PER_HOUR  circuit breaker (default 300): above it, new captures pause and the gate degrades to optional
 *   LEAD_GATE_SINCE              ISO date-time the gate was switched on (work started earlier is never gated)
 */

export const MIN_LEAD_GATE_SECRET_LENGTH = 32;
export const DEFAULT_MAX_NEW_LEADS_PER_HOUR = 300;

export type LeadGateRecordUse = "all" | "parent" | "off";

/** Why the effective mode is `off` although something else may have been asked for. Fixed codes, safe to log. */
export type LeadGateOffReason = "unset" | "store_off" | "sample_data" | "no_secret";

export interface LeadGateConfig {
  /** Effective mode. */
  mode: LeadGateMode;
  /** What LEAD_GATE asked for. */
  requested: LeadGateMode;
  offReason: LeadGateOffReason | null;
  recordUse: LeadGateRecordUse;
  assignNew: boolean;
  /**
   * LEAD_GATE_SINCE (ISO date-time, epoch ms here): when the gate was switched on. Work the family
   * started before it (a mock-test attempt whose server-recorded start is earlier) is never gated
   * (critique 0.9). Null when unset or invalid.
   */
  since: number | null;
  /**
   * HMAC key for the pass cookie (also kept when the gate is off, so existing passes can still be
   * forgotten / withdrawn). Null → no gate (`no_secret`). Never log or return it.
   */
  secret: string | null;
  maxNewLeadsPerHour: number;
  /** Config problems to log once (fixed codes). */
  warnings: LeadGateConfigWarning[];
}

export type LeadGateConfigWarning =
  | "lead_gate_mode_unknown"
  | "lead_gate_secret_missing"
  | "lead_gate_secret_too_short"
  | "lead_gate_secret_dev_fallback"
  | "lead_gate_record_use_unknown"
  | "lead_gate_assign_unknown";

function parseMode(raw: string | undefined, warnings: LeadGateConfigWarning[]): LeadGateMode | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "") return null;
  if (value === "off" || value === "optional" || value === "required") return value;
  warnings.push("lead_gate_mode_unknown");
  return null;
}

const DEV_SECRET_KEY = Symbol.for("aspire.leadGate.devSecret");
const globalStore = globalThis as typeof globalThis & { [DEV_SECRET_KEY]?: string };

/** Outside production only: a per-process random key, so local QA works without configuration (passes die on restart). */
function devFallbackSecret(): string {
  globalStore[DEV_SECRET_KEY] ??= randomBytes(32).toString("hex");
  return globalStore[DEV_SECRET_KEY];
}

function parseSecret(env: Env, warnings: LeadGateConfigWarning[]): string | null {
  const raw = env.LEAD_GATE_SECRET ?? "";
  if (raw.trim().length >= MIN_LEAD_GATE_SECRET_LENGTH) return raw;
  if (raw.trim() !== "") warnings.push("lead_gate_secret_too_short");
  if (env.NODE_ENV === "production") {
    if (raw.trim() === "") warnings.push("lead_gate_secret_missing");
    return null;
  }
  warnings.push("lead_gate_secret_dev_fallback");
  return devFallbackSecret();
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? "").trim());
  return Number.isInteger(value) && value >= 1 && value <= 100_000 ? value : fallback;
}

/**
 * The effective configuration. Off unless LEAD_GATE says otherwise, and forced off when:
 * ENQUIRY_STORE=off (nothing honest to unlock with), placeholder/sample data is shown (real
 * families must never trade contact details for a made-up result: critique 0.0, D-032) unless
 * LEAD_GATE_ALLOW_SAMPLE_DATA=true, or there is no usable secret in production.
 */
export function parseLeadGateConfig(env: Env, options: { sampleData: boolean }): LeadGateConfig {
  const warnings: LeadGateConfigWarning[] = [];
  const requested = parseMode(env.LEAD_GATE, warnings) ?? "off";

  const recordRaw = (env.LEAD_GATE_RECORD_USE ?? "").trim().toLowerCase();
  let recordUse: LeadGateRecordUse = "all";
  if (recordRaw === "parent" || recordRaw === "off") recordUse = recordRaw;
  else if (recordRaw !== "" && recordRaw !== "all") {
    warnings.push("lead_gate_record_use_unknown");
    recordUse = "off"; // never record more than asked by a typo
  }

  const assignRaw = (env.LEAD_GATE_ASSIGN ?? "").trim().toLowerCase();
  if (assignRaw !== "" && assignRaw !== "auto" && assignRaw !== "none") warnings.push("lead_gate_assign_unknown");
  const assignNew = assignRaw !== "none";

  // Parsed in every mode so "Not you?", sign-out and withdrawal still recognise passes issued before
  // the gate was switched off; only warn about it when the gate is wanted.
  const secret = parseSecret(env, requested === "off" ? [] : warnings);
  const maxNewLeadsPerHour = parsePositiveInt(env.LEAD_GATE_MAX_NEW_LEADS_PER_HOUR, DEFAULT_MAX_NEW_LEADS_PER_HOUR);

  let offReason: LeadGateOffReason | null = null;
  if (requested === "off") offReason = "unset";
  else if (parseEnquiryStore(env).mode === "off") offReason = "store_off";
  else if (options.sampleData && (env.LEAD_GATE_ALLOW_SAMPLE_DATA ?? "").trim().toLowerCase() !== "true") offReason = "sample_data";
  else if (!secret) offReason = "no_secret";

  const sinceRaw = (env.LEAD_GATE_SINCE ?? "").trim();
  const sinceMs = sinceRaw.length >= 10 && sinceRaw.length <= 40 ? Date.parse(sinceRaw) : Number.NaN;

  return {
    mode: offReason ? "off" : requested,
    requested,
    offReason,
    recordUse,
    assignNew,
    since: Number.isFinite(sinceMs) ? sinceMs : null,
    secret,
    maxNewLeadsPerHour,
    warnings,
  };
}

/** The live configuration for this request. */
export function getLeadGateConfig(env: Env = process.env): LeadGateConfig {
  return parseLeadGateConfig(env, { sampleData: showPlaceholderContent() });
}
