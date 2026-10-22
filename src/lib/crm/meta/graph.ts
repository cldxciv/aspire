import "server-only";

import { createHmac } from "node:crypto";

import { META_GRAPH_VERSION_DEFAULT, META_GRAPH_VERSION_PATTERN } from "../lead-ops-types";
import { classifyFetchFailure, classifyGraphError, type ClassifiedGraphError } from "./errors";

/**
 * Minimal Graph API client (docs/lead-routing-plan.md §18.6). Built on an INJECTED `fetchImpl`
 * (tests pass fixtures; a guard fails any test that reaches the global fetch).
 *
 * - The token travels in `Authorization: Bearer` by default (M11). Graph's acceptance of the header
 *   form is not confirmed in public docs, so on error 2500 / 104 ("access token required") the
 *   client retries ONCE with the query form and reports `onTokenTransport("query")` (stored in
 *   `meta_config.tokenTransport`).
 * - `appsecret_proof = HMAC_SHA256(appSecret, token)` (hex) is always a query parameter.
 * - Every request times out after 10 s (`AbortSignal.timeout`).
 * - Usage headers (`X-App-Usage`, `X-Page-Usage`, `X-Business-Use-Case-Usage`, `X-Ad-Account-Usage`)
 *   give the highest usage % and Meta's `estimated_time_to_regain_access`.
 * - NEVER logs: no tokens, URLs, bodies or Graph text leave this module except as parsed data /
 *   fixed error codes.
 */

export const GRAPH_BASE_URL = "https://graph.facebook.com";
export const GRAPH_TIMEOUT_MS = 10_000;

export type TokenTransport = "header" | "query";

export interface GraphUsage {
  /** Highest usage % across the usage headers (0 when none). */
  maxPercent: number;
  /** Meta's estimated time to regain access, in ms (null when not given). */
  regainAccessMs: number | null;
}

export type GraphResult<T = unknown> =
  | { ok: true; data: T; usage: GraphUsage }
  | { ok: false; error: ClassifiedGraphError; usage: GraphUsage };

export interface GraphClientOptions {
  fetchImpl: typeof fetch;
  /** `vNN.0`; anything else falls back to the pinned default. */
  version?: string | null;
  appSecret: string;
  tokenTransport?: TokenTransport;
  timeoutMs?: number;
  baseUrl?: string;
  /** Called when the header form was refused and the query form worked. */
  onTokenTransport?: (transport: "query") => void;
}

export interface GraphClient {
  readonly transport: TokenTransport;
  readonly version: string;
  request<T = unknown>(method: "GET" | "POST", path: string, params: Readonly<Record<string, string>>, token: string): Promise<GraphResult<T>>;
}

const NO_USAGE: GraphUsage = { maxPercent: 0, regainAccessMs: null };
const PATH = /^[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*$/;

/** HMAC-SHA256(appSecret, token) in hex: Graph's `appsecret_proof`. */
export function appSecretProof(appSecret: string, token: string): string {
  return createHmac("sha256", appSecret).update(token, "utf8").digest("hex");
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseHeaderJson(value: string | null): unknown {
  if (!value || value.length > 20_000) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Reads the usage headers into the highest % and the longest "regain access" wait. */
export function parseUsageHeaders(headers: Headers): GraphUsage {
  let maxPercent = 0;
  let regainMinutes: number | null = null;
  const consider = (record: unknown) => {
    if (typeof record !== "object" || record === null) return;
    const r = record as Record<string, unknown>;
    for (const key of ["call_count", "total_time", "total_cputime", "acc_id_util_pct"]) {
      const value = numberOf(r[key]);
      if (value !== null && value > maxPercent) maxPercent = value;
    }
    const eta = numberOf(r.estimated_time_to_regain_access);
    if (eta !== null && eta > 0 && (regainMinutes === null || eta > regainMinutes)) regainMinutes = eta;
  };
  consider(parseHeaderJson(headers.get("x-app-usage")));
  consider(parseHeaderJson(headers.get("x-page-usage")));
  consider(parseHeaderJson(headers.get("x-ad-account-usage")));
  const buc = parseHeaderJson(headers.get("x-business-use-case-usage"));
  if (typeof buc === "object" && buc !== null) {
    for (const entries of Object.values(buc as Record<string, unknown>)) {
      if (Array.isArray(entries)) entries.forEach(consider);
    }
  }
  return { maxPercent, regainAccessMs: regainMinutes === null ? null : regainMinutes * 60_000 };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length === 0 ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export function createGraphClient(options: GraphClientOptions): GraphClient {
  const version = options.version && META_GRAPH_VERSION_PATTERN.test(options.version) ? options.version : META_GRAPH_VERSION_DEFAULT;
  const base = (options.baseUrl ?? GRAPH_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? GRAPH_TIMEOUT_MS;
  let transport: TokenTransport = options.tokenTransport === "query" ? "query" : "header";

  async function once<T>(method: "GET" | "POST", path: string, params: Readonly<Record<string, string>>, token: string, via: TokenTransport): Promise<GraphResult<T>> {
    const search = new URLSearchParams(params);
    search.set("appsecret_proof", appSecretProof(options.appSecret, token));
    if (via === "query") search.set("access_token", token);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (via === "header") headers.Authorization = `Bearer ${token}`;
    let response: Response;
    try {
      response = await options.fetchImpl(`${base}/${version}/${path}?${search.toString()}`, {
        method,
        headers,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { ok: false, error: classifyFetchFailure(error), usage: NO_USAGE };
    }
    const usage = parseUsageHeaders(response.headers);
    const body = await readJson(response);
    if (response.ok && body !== null && typeof body === "object" && !("error" in (body as object))) return { ok: true, data: body as T, usage };
    return { ok: false, error: classifyGraphError({ status: response.status, body, retryAfterMs: usage.regainAccessMs }), usage };
  }

  return {
    get transport() {
      return transport;
    },
    version,
    async request<T>(method: "GET" | "POST", path: string, params: Readonly<Record<string, string>>, token: string): Promise<GraphResult<T>> {
      if (!PATH.test(path)) return { ok: false, error: { kind: "fatal", code: null, subcode: null, reason: "bad_path" }, usage: NO_USAGE };
      const first = await once<T>(method, path, params, token, transport);
      if (first.ok || first.error.kind !== "token_transport" || transport === "query") return first;
      // Header form refused ("access token required"): try the query form once and keep it if it works.
      const second = await once<T>(method, path, params, token, "query");
      if (second.ok || second.error.kind !== "token_transport") {
        transport = "query";
        options.onTokenTransport?.("query");
      }
      return second;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Typed reads used by the inbox and the actions (shapes as Graph documents them; all optional).

/** `GET /{lead-id}` fields (§18.3): the full set, and the basic set that keeps consent responses (H4). */
export const LEAD_FIELDS_FULL =
  "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data,custom_disclaimer_responses,is_organic,platform";
export const LEAD_FIELDS_BASIC = "id,created_time,ad_id,form_id,field_data,custom_disclaimer_responses";

export interface GraphLead {
  id?: string;
  created_time?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data?: { name?: string; values?: unknown[] }[];
  custom_disclaimer_responses?: { checkbox_key?: string; is_checked?: unknown }[];
  is_organic?: unknown;
  platform?: string;
}

export interface GraphDebugToken {
  data?: { app_id?: string; type?: string; is_valid?: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: unknown[] };
}

export interface GraphForm {
  id?: string;
  name?: string;
  status?: string;
  questions?: { key?: string; label?: string; type?: string }[];
}

export interface GraphPaged<T> {
  data?: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}
