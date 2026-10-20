import { parseToolCard } from "@/components/rancho/rancho-cards";
import type { AskCardEvent } from "@/lib/ask/cards";
import type { AskStreamEvent } from "@/lib/ask/constants";

/**
 * Browser-side helpers for Rancho, the AI doubt solver (pure functions, unit-tested): reading the NDJSON answer
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
  /**
   * The lead gate's 401 (`X-Lead-Gate: required`, docs/lead-gate-plan.md §5.6): share contact
   * details once before Rancho answers. Only from `isLeadGateResponse(response)`, never from a
   * status code alone (any other 401 is not the gate). The chat holds the question and shows the form.
   */
  | "gate"
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

/**
 * One event of the `POST /api/ask` stream as the browser reads it: the answer events plus tool cards
 * (`{ t: "card", card }`, src/lib/ask/cards.ts), whose card has been checked by `parseToolCard`.
 */
export type AskClientEvent = AskStreamEvent | AskCardEvent;

/** A known, well-formed event (cards are replaced by their checked copy); null for anything else. */
function toStreamEvent(value: unknown): AskClientEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const event = value as Record<string, unknown>;
  if (event.t === "card") {
    // Unknown card kinds (a newer server) and malformed cards are skipped, not shown.
    const card = parseToolCard(event.card);
    return card ? { t: "card", card } : null;
  }
  return isAnswerEvent(event) ? (event as AskStreamEvent) : null;
}

function isAnswerEvent(event: Record<string, unknown>): boolean {
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

/** Splits streamed text into complete NDJSON lines; malformed lines and unknown events are skipped. */
export function createNdjsonDecoder() {
  let buffer = "";
  const parseLines = (lines: string[]): AskClientEvent[] => {
    const events: AskClientEvent[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = toStreamEvent(JSON.parse(line) as unknown);
        if (event) events.push(event);
      } catch {
        // ignore a corrupt line rather than failing the whole answer
      }
    }
    return events;
  };
  return {
    push(chunk: string): AskClientEvent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return parseLines(lines);
    },
    end(): AskClientEvent[] {
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
