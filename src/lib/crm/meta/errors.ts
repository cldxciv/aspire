/**
 * Graph API error classification (docs/lead-routing-plan.md §18.4, M6) — pure. Classified by
 * `code` + `error_subcode` (Meta's message is read only to spot "nonexisting field", and is never
 * stored or logged). Every outcome carries a FIXED `reason` code for `last_error` and the logs.
 *
 * | Error                                                   | Kind               |
 * |---------------------------------------------------------|--------------------|
 * | network, timeout, HTTP 5xx, 1 2 4 17 32 341 613 80001 80005 | retry (backoff)  |
 * | 190 (invalid / expired token)                           | pause_auth         |
 * | 10, 200–299 (permission)                                | permission         |
 * | 100 with subcode 33 (deleted / missing lead)            | unavailable        |
 * | 100 "nonexisting field"                                 | downgrade_fields   |
 * | 2500 / 104 (access token required)                      | token_transport    |
 * | anything else                                           | fatal              |
 */

export type GraphErrorKind = "retry" | "pause_auth" | "permission" | "unavailable" | "downgrade_fields" | "token_transport" | "fatal";

export interface ClassifiedGraphError {
  kind: GraphErrorKind;
  code: number | null;
  subcode: number | null;
  /** Fixed code: `network`, `timeout`, `http_503`, `graph_190`, `graph_100_33`, … */
  reason: string;
  /** Meta's `estimated_time_to_regain_access` (or a usage-based slowdown), in ms. */
  retryAfterMs?: number;
}

/** Transient / throttling codes (§18.4; 80001 = Page, 80005 = LeadGen business use case). */
export const RETRY_CODES: ReadonlySet<number> = new Set([1, 2, 4, 17, 32, 341, 613, 80001, 80005]);

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,9}$/.test(value)) return Number(value);
  return null;
}

/** Meta's `{ error: { code, error_subcode, message } }`, if the body has one. */
export function graphErrorOf(body: unknown): { code: number | null; subcode: number | null; message: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  return {
    code: asInt(record.code),
    subcode: asInt(record.error_subcode),
    message: typeof record.message === "string" ? record.message.slice(0, 500) : "",
  };
}

/**
 * Classifies a failed Graph answer. `status` is the HTTP status (0 = no answer); `retryAfterMs`
 * comes from the usage headers (`estimated_time_to_regain_access`).
 */
export function classifyGraphError(input: { status: number; body: unknown; retryAfterMs?: number | null }): ClassifiedGraphError {
  const error = graphErrorOf(input.body);
  const retryAfter = input.retryAfterMs && input.retryAfterMs > 0 ? { retryAfterMs: input.retryAfterMs } : {};
  if (!error || error.code === null) {
    if (input.status >= 500 || input.status === 429) return { kind: "retry", code: null, subcode: null, reason: `http_${input.status}`, ...retryAfter };
    return { kind: "fatal", code: null, subcode: null, reason: input.status > 0 ? `http_${input.status}` : "no_answer" };
  }
  const { code, subcode } = error;
  if (RETRY_CODES.has(code)) return { kind: "retry", code, subcode, reason: `graph_${code}`, ...retryAfter };
  if (code === 190) return { kind: "pause_auth", code, subcode, reason: "graph_190" };
  if (code === 2500 || code === 104) return { kind: "token_transport", code, subcode, reason: `graph_${code}` };
  if (code === 10 || (code >= 200 && code <= 299)) return { kind: "permission", code, subcode, reason: `graph_${code}` };
  if (code === 100 && subcode === 33) return { kind: "unavailable", code, subcode, reason: "graph_100_33" };
  if (code === 100 && /nonexist(ing|ent) field/i.test(error.message)) return { kind: "downgrade_fields", code, subcode, reason: "graph_100_field" };
  if (input.status >= 500) return { kind: "retry", code, subcode, reason: `graph_${code}`, ...retryAfter };
  return { kind: "fatal", code, subcode, reason: subcode !== null ? `graph_${code}_${subcode}` : `graph_${code}` };
}

/** A fetch that threw: timeout (AbortSignal.timeout) or network. Both are retried. */
export function classifyFetchFailure(error: unknown): ClassifiedGraphError {
  const name = typeof error === "object" && error !== null ? String((error as { name?: unknown }).name ?? "") : "";
  return { kind: "retry", code: null, subcode: null, reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
}
