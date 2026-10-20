import "server-only";

import type { RanchoTool } from "./cards";

/**
 * Structured logging for Rancho, the AI doubt solver, with fixed codes only (D-035). Never logged: the question,
 * the photo, the answer, the topic, an IP address, an account id or login, the API key, or an
 * upstream error message (those can echo request content). Token counts are logged so the
 * owner can watch costs (summed over every model turn when Rancho uses tools; for a question that
 * failed or was cancelled part-way, over the turns that finished, so `modelTurns` can be one more
 * than the turns the tokens cover).
 */

export type AskLogOutcome =
  | "answered" // stream completed
  | "refused" // model (and fallback) declined: stop_reason "refusal"
  | "truncated" // hit ASK_ASPIRE_MAX_TOKENS
  | "client_aborted" // the browser went away mid-answer
  | "not_configured" // no ANTHROPIC_API_KEY (503)
  | "rate_limited" // daily allowance used up (429)
  | "forbidden" // same-origin check failed (403)
  | "bad_request" // 400 / 413 / 415
  | "validation_failed" // 422
  | "upstream_error" // Claude API failed
  | "error"; // unexpected exception

export type AskLogReason =
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
  | "image_encoding"
  | "image_too_large"
  | "image_type"
  | "image_empty"
  | "consent_missing"
  | "empty_question"
  | "limit"
  | "global"
  | "disabled"
  | "upstream_auth"
  | "upstream_rate_limit"
  | "upstream_overloaded"
  | "upstream_bad_request"
  | "upstream_connection"
  | "upstream_other"
  | "mid_stream"
  | `exception_${string}`;

export interface AskLogEntry {
  outcome: AskLogOutcome;
  reason?: AskLogReason;
  account?: "guest" | "student" | "member";
  /** Whether a photo was attached (never the photo). */
  image?: boolean;
  language?: "en" | "hi";
  promptVersion?: string;
  model?: string;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  /** Tool calls Rancho ran for this question (counts only, never the inputs or results). */
  toolCalls?: number;
  /** Model requests for this question (1 without tools). */
  modelTurns?: number;
  /** The tool an "Ask Rancho about this" handoff came from (never its summary). */
  fromTool?: RanchoTool;
}

export function askLog(entry: AskLogEntry): void {
  const level =
    entry.outcome === "error" || entry.outcome === "upstream_error"
      ? "error"
      : entry.outcome === "answered"
        ? "info"
        : "warn";
  // Explicit field picking: nothing else passed at runtime is ever written.
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event: "ask",
    outcome: entry.outcome,
    ...(entry.reason ? { reason: entry.reason } : {}),
    ...(entry.account ? { account: entry.account } : {}),
    ...(entry.image !== undefined ? { image: entry.image } : {}),
    ...(entry.language ? { language: entry.language } : {}),
    ...(entry.promptVersion ? { promptVersion: entry.promptVersion } : {}),
    ...(entry.model ? { model: entry.model } : {}),
    ...(typeof entry.durationMs === "number" ? { durationMs: Math.round(entry.durationMs) } : {}),
    ...(typeof entry.inputTokens === "number" ? { inputTokens: entry.inputTokens } : {}),
    ...(typeof entry.outputTokens === "number" ? { outputTokens: entry.outputTokens } : {}),
    ...(typeof entry.cacheReadTokens === "number" ? { cacheReadTokens: entry.cacheReadTokens } : {}),
    ...(typeof entry.toolCalls === "number" ? { toolCalls: entry.toolCalls } : {}),
    ...(typeof entry.modelTurns === "number" ? { modelTurns: entry.modelTurns } : {}),
    ...(entry.fromTool ? { fromTool: entry.fromTool } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** A thrown value's constructor name only (messages can echo input). */
export function askExceptionCode(error: unknown): AskLogReason {
  const name = error instanceof Error ? error.name : typeof error;
  return `exception_${name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "unknown"}`;
}
