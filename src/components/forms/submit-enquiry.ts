import { z } from "zod";

/**
 * Client transport for POST /api/enquiries (contract: src/lib/contracts/enquiry.ts, D-008).
 *
 * The response body is parsed defensively: anything that is not a well-formed
 * EnquiryResponse (404 HTML page, proxy error, unexpected JSON) is treated as a
 * failure. Only a 2xx response with `status: "received"` and a reference is ever
 * reported as received.
 */

export const ENQUIRY_ENDPOINT = "/api/enquiries";

/** Give up waiting after this long; the server's own destination timeout is shorter. */
const CLIENT_TIMEOUT_MS = 20_000;

const responseSchema = z.union([
  z.object({
    ok: z.literal(true),
    status: z.literal("received"),
    reference: z.string().trim().min(1),
    message: z.string(),
  }),
  z.object({ ok: z.literal(true), status: z.literal("not_configured"), message: z.string() }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
]);

export type SubmitOutcome =
  /** A configured destination accepted the enquiry. The only success state. */
  | { kind: "received"; reference: string }
  /** Input was valid but no destination is configured: nothing was sent or stored. */
  | { kind: "not_configured" }
  /** 422 — server-side field errors. */
  | { kind: "validation"; fieldErrors: Record<string, string[]> }
  /** 429 — too many attempts. */
  | { kind: "rate_limited"; retryAfterSeconds?: number }
  /** 400 / 403 / 415 — request refused (malformed, failed origin check). */
  | { kind: "rejected" }
  /** 404 / 503 / non-JSON / unexpected shape — the endpoint is not available. */
  | { kind: "unavailable" }
  /** 5xx `server_error` — destination failed or unexpected server problem. */
  | { kind: "server_error" }
  /** No response within CLIENT_TIMEOUT_MS. Outcome unknown. */
  | { kind: "timeout" }
  /** fetch() rejected (offline, DNS, connection reset). */
  | { kind: "network" };

function parseRetryAfter(res: Response): number | undefined {
  const raw = res.headers.get("Retry-After");
  if (!raw) return undefined;
  const seconds = Number.parseInt(raw, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export async function submitEnquiry(payload: Record<string, unknown>): Promise<SubmitOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENQUIRY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    return controller.signal.aborted ? { kind: "timeout" } : { kind: "network" };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  } finally {
    clearTimeout(timer);
  }

  if (controller.signal.aborted && body === null) return { kind: "timeout" };

  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) {
    if (res.status === 429) return { kind: "rate_limited", retryAfterSeconds: parseRetryAfter(res) };
    if (res.status >= 500 && res.status !== 503) return { kind: "server_error" };
    return { kind: "unavailable" };
  }

  const data = parsed.data;
  if (data.ok) {
    // An "ok" body on a non-2xx status is inconsistent — never claim success on it.
    if (!res.ok) return { kind: "unavailable" };
    return data.status === "received" ? { kind: "received", reference: data.reference } : { kind: "not_configured" };
  }

  switch (data.error) {
    case "validation":
      return { kind: "validation", fieldErrors: data.fieldErrors ?? {} };
    case "rate_limited":
      return { kind: "rate_limited", retryAfterSeconds: parseRetryAfter(res) };
    case "bad_request":
    case "forbidden":
      return { kind: "rejected" };
    case "not_found":
    case "not_configured":
      return { kind: "unavailable" };
    default:
      if (res.status === 415) return { kind: "rejected" };
      return { kind: "server_error" };
  }
}
