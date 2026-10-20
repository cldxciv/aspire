import type { AskStreamEvent } from "@/lib/ask/constants";

/**
 * Browser-side helpers for Ask Aspire (pure functions, unit-tested): reading the NDJSON answer
 * stream and turning API error responses into UI states.
 */

export type AskFailureKind =
  | "not_configured"
  | "limit"
  | "busy"
  | "network"
  | "too_large"
  | "invalid_image"
  | "validation"
  | "blocked"
  | "interrupted"
  | "generic";

export interface AskFailure {
  kind: AskFailureKind;
  /** For `limit`: seconds until the allowance resets. */
  retryAfterSeconds?: number;
  /** For `validation`: the field that failed, when the API says so. */
  field?: "question" | "photoConsent" | "image";
  /** The API's own (English) message, shown only for `limit` when no better copy applies. */
  message?: string;
}

function retryAfter(header: string | null): number | undefined {
  if (!header || !/^\d+$/.test(header.trim())) return undefined;
  return Number(header.trim());
}

/** Maps a non-200 `POST /api/ask` response (JSON envelope) to a UI failure. */
export function failureFromResponse(status: number, body: unknown, retryAfterHeader: string | null): AskFailure {
  const envelope = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const code = typeof envelope.error === "string" ? envelope.error : "";
  const message = typeof envelope.message === "string" ? envelope.message : undefined;
  if (code === "not_configured") return { kind: "not_configured" };
  if (status === 429 || code === "rate_limited") {
    return { kind: "limit", retryAfterSeconds: retryAfter(retryAfterHeader), message };
  }
  if (status === 403) return { kind: "blocked" };
  if (status === 413) return { kind: "too_large" };
  if (status === 422 || code === "validation") {
    const fields = typeof envelope.fieldErrors === "object" && envelope.fieldErrors !== null ? Object.keys(envelope.fieldErrors) : [];
    if (fields.includes("image")) return { kind: "invalid_image", field: "image" };
    if (fields.includes("photoConsent")) return { kind: "validation", field: "photoConsent" };
    return { kind: "validation", field: fields.includes("question") ? "question" : undefined };
  }
  if (status === 503) return { kind: "busy" };
  return { kind: "generic" };
}

function isStreamEvent(value: unknown): value is AskStreamEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  switch (event.t) {
    case "start":
      return typeof event.remaining === "number" && typeof event.limit === "number";
    case "delta":
      return typeof event.text === "string";
    case "done":
      return typeof event.stop === "string";
    case "error":
      return typeof event.code === "string";
    default:
      return false;
  }
}

/** Splits streamed text into complete NDJSON lines; malformed lines are skipped. */
export function createNdjsonDecoder() {
  let buffer = "";
  const parseLines = (lines: string[]): AskStreamEvent[] => {
    const events: AskStreamEvent[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const value: unknown = JSON.parse(line);
        if (isStreamEvent(value)) events.push(value);
      } catch {
        // ignore a corrupt line rather than failing the whole answer
      }
    }
    return events;
  };
  return {
    push(chunk: string): AskStreamEvent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return parseLines(lines);
    },
    end(): AskStreamEvent[] {
      const rest = buffer;
      buffer = "";
      return parseLines([rest]);
    },
  };
}

/** Whole hours (at least 1) for "try again in about N hours". */
export function hoursFromSeconds(seconds: number | undefined): number {
  if (!seconds || seconds <= 0) return 24;
  return Math.max(1, Math.ceil(seconds / 3600));
}
