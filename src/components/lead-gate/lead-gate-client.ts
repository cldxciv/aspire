import { z } from "zod";

import {
  LEAD_GATE_ENDPOINT,
  LEAD_GATE_HEADER,
  LEAD_GATE_HEADER_REQUIRED,
  LEAD_GATE_LIMIT_HEADER,
  LEAD_GATE_MODES,
  LEAD_GATE_USAGE_ENDPOINT,
  type LeadGateForgetData,
  type LeadGateStatusData,
  type LeadGateUnlockData,
  type LeadGateUsageData,
  type LeadGateUsageInput,
} from "@/lib/lead-gate/contract";

/**
 * Client transport for /api/lead-gate (docs/lead-gate-plan.md §5). Responses are parsed
 * defensively: anything that is not the expected envelope counts as a failure, and only a 2xx
 * `{ ok: true }` is ever treated as success. Never throws.
 */

const STATUS_TIMEOUT_MS = 5_000;
const SUBMIT_TIMEOUT_MS = 20_000;

const via = z.enum(["off", "session", "pass"]);

const statusBody = z.object({
  ok: z.literal(true),
  data: z.object({
    mode: z.enum(LEAD_GATE_MODES),
    unlocked: z.boolean(),
    via: via.nullable(),
    recordsUse: z.boolean(),
    expiresAt: z.string().nullable(),
    /** Absent from a server older than this page (deploy overlap) → false: never claim sample data unasked. */
    sample: z.boolean().optional(),
  }),
});

const unlockBody = z.object({
  ok: z.literal(true),
  data: z.object({ unlocked: z.literal(true), via, recordsUse: z.boolean(), expiresAt: z.string().nullable() }),
});

const errorBody = z.object({
  ok: z.literal(false),
  error: z.string(),
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
});

const forgetBody = z.object({ ok: z.literal(true), data: z.object({ forgotten: z.literal(true), withdrawn: z.boolean() }) });

const usageBody = z.object({
  ok: z.literal(true),
  data: z.object({ recorded: z.boolean(), reason: z.enum(["off", "session", "no_pass", "not_recorded"]).optional() }),
});

type FetchLike = typeof fetch;

async function request(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; body: unknown } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { response, body };
  } catch {
    return null; // offline, DNS, reset, timeout
  } finally {
    clearTimeout(timer);
  }
}

export type LeadGateStatusOutcome = { kind: "ok"; data: LeadGateStatusData } | { kind: "failed" };

/** GET /api/lead-gate with a 5 s timeout. Any failure (network, 429, 5xx, odd body) → `failed`. */
export async function fetchLeadGateStatus(fetchImpl: FetchLike = fetch): Promise<LeadGateStatusOutcome> {
  const result = await request(fetchImpl, LEAD_GATE_ENDPOINT, { method: "GET" }, STATUS_TIMEOUT_MS);
  if (!result || !result.response.ok) return { kind: "failed" };
  const parsed = statusBody.safeParse(result.body);
  return parsed.success ? { kind: "ok", data: { ...parsed.data.data, sample: parsed.data.data.sample ?? false } } : { kind: "failed" };
}

export type LeadGateSubmitOutcome =
  /** 201 pass / 200 session or off. The only success. */
  | { kind: "unlocked"; data: LeadGateUnlockData }
  /** 422: field errors (English contract messages; the form localises them by field). */
  | { kind: "validation"; fieldErrors: Record<string, string[]> }
  /** 429: `phone` when the per-number daily cap was hit (X-Lead-Gate-Limit: phone). */
  | { kind: "rate_limited"; phone: boolean }
  /** 503: new captures paused (flood breaker) or the gate is not set up. Nothing was saved. */
  | { kind: "paused" }
  /** 400 / 403 / 415 / 413: refused (stale page, failed origin check). */
  | { kind: "rejected" }
  /** 5xx / unexpected body: nothing was saved. */
  | { kind: "server_error" }
  /** No answer (offline, timeout). Unknown whether anything was saved; the form says "try again". */
  | { kind: "network" };

/** POST /api/lead-gate. */
export async function submitLeadGate(payload: Record<string, unknown>, fetchImpl: FetchLike = fetch): Promise<LeadGateSubmitOutcome> {
  const result = await request(
    fetchImpl,
    LEAD_GATE_ENDPOINT,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    SUBMIT_TIMEOUT_MS,
  );
  if (!result) return { kind: "network" };
  const { response, body } = result;
  if (response.ok) {
    const parsed = unlockBody.safeParse(body);
    return parsed.success ? { kind: "unlocked", data: parsed.data.data } : { kind: "server_error" };
  }
  const error = errorBody.safeParse(body);
  if (response.status === 429) return { kind: "rate_limited", phone: response.headers.get(LEAD_GATE_LIMIT_HEADER) === "phone" };
  if (response.status === 503) return { kind: "paused" };
  if (response.status === 422 && error.success) return { kind: "validation", fieldErrors: error.data.fieldErrors ?? {} };
  if (response.status === 400 || response.status === 403 || response.status === 413 || response.status === 415) return { kind: "rejected" };
  return { kind: "server_error" };
}

/** DELETE /api/lead-gate (`withdraw` → `?withdraw=1`). Null on any failure. */
export async function forgetLeadGate(withdraw: boolean, fetchImpl: FetchLike = fetch): Promise<LeadGateForgetData | null> {
  const url = withdraw ? `${LEAD_GATE_ENDPOINT}?withdraw=1` : LEAD_GATE_ENDPOINT;
  const result = await request(fetchImpl, url, { method: "DELETE" }, SUBMIT_TIMEOUT_MS);
  if (!result || !result.response.ok) return null;
  const parsed = forgetBody.safeParse(result.body);
  return parsed.success ? parsed.data.data : null;
}

/** POST /api/lead-gate/usage, fire-and-forget (`keepalive`, so it survives a navigation). Null on any failure. */
export async function sendLeadGateUsage(input: LeadGateUsageInput, fetchImpl: FetchLike = fetch): Promise<LeadGateUsageData | null> {
  const result = await request(
    fetchImpl,
    LEAD_GATE_USAGE_ENDPOINT,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), keepalive: true },
    SUBMIT_TIMEOUT_MS,
  );
  if (!result || !result.response.ok) return null;
  const parsed = usageBody.safeParse(result.body);
  return parsed.success ? parsed.data.data : null;
}

/**
 * For tool owners mapping a server-enforced tool's response (/api/ask, /api/mocktest/score): true
 * only for the gate's 401 (header `X-Lead-Gate: required`). Any other 401 still means "session gone".
 */
export function isLeadGateResponse(response: Pick<Response, "status" | "headers">): boolean {
  return response.status === 401 && response.headers.get(LEAD_GATE_HEADER) === LEAD_GATE_HEADER_REQUIRED;
}
