import "server-only";

import { isIP } from "node:net";

/**
 * Request guards for state-changing public endpoints (POST /api/enquiries).
 */

// ---------------------------------------------------------------------------
// Origin / CSRF
// ---------------------------------------------------------------------------

export type OriginRejectReason =
  | "origin_mismatch"
  | "origin_null"
  | "origin_invalid"
  | "cross_site_fetch"
  | "missing_origin";

export type OriginCheckResult = { ok: true } | { ok: false; reason: OriginRejectReason };

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

/** Normalises a Host header value using the scheme of the Origin being compared (drops that scheme's default port). */
function normaliseHost(host: string, protocol: string): string | null {
  try {
    return new URL(`${protocol}//${host}`).host;
  } catch {
    return null;
  }
}

/**
 * Same-origin check (deny by default):
 *  1. `Origin` present → must equal the request's own host (`X-Forwarded-Host`
 *     or `Host`, scheme-agnostic so TLS-terminating proxies work) or the
 *     origin of NEXT_PUBLIC_SITE_URL. `Origin: null` is rejected.
 *  2. `Origin` absent → `Sec-Fetch-Site` must be `same-origin` or `none`.
 *  3. Neither header → rejected. Every current browser sends `Origin` on POST.
 *  A `Sec-Fetch-Site: cross-site` header always rejects, even with a matching Origin.
 */
export function checkSameOrigin(
  request: Request,
  options: { siteOrigin?: string | null } = {},
): OriginCheckResult {
  const headers = request.headers;
  const fetchSite = headers.get("sec-fetch-site")?.trim().toLowerCase() ?? null;
  const originHeader = headers.get("origin");

  if (fetchSite === "cross-site") return { ok: false, reason: "cross_site_fetch" };

  if (originHeader === null) {
    if (fetchSite === "same-origin" || fetchSite === "none") return { ok: true };
    return { ok: false, reason: fetchSite ? "cross_site_fetch" : "missing_origin" };
  }

  const trimmed = originHeader.trim();
  if (trimmed === "null") return { ok: false, reason: "origin_null" };

  let origin: URL;
  try {
    origin = new URL(trimmed);
  } catch {
    return { ok: false, reason: "origin_invalid" };
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") return { ok: false, reason: "origin_invalid" };

  if (options.siteOrigin && origin.origin === options.siteOrigin) return { ok: true };

  let requestHost = firstHeaderValue(headers.get("x-forwarded-host")) ?? firstHeaderValue(headers.get("host"));
  if (!requestHost) {
    try {
      requestHost = new URL(request.url).host;
    } catch {
      requestHost = null;
    }
  }
  const expectedHost = requestHost ? normaliseHost(requestHost, origin.protocol) : null;
  if (expectedHost && origin.host === expectedHost) return { ok: true };

  return { ok: false, reason: "origin_mismatch" };
}

// ---------------------------------------------------------------------------
// Content-Type
// ---------------------------------------------------------------------------

/** True for `application/json` with optional parameters (charset must be UTF-8 if given). */
export function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  const [mediaType, ...params] = value.split(";").map((part) => part.trim().toLowerCase());
  if (mediaType !== "application/json") return false;
  for (const param of params) {
    const [name, rawValue = ""] = param.split("=").map((s) => s.trim());
    if (name === "charset" && rawValue.replace(/"/g, "") !== "utf-8") return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Client IP (for rate limiting only — never logged)
// ---------------------------------------------------------------------------

function cleanIp(candidate: string | null): string | null {
  if (!candidate) return null;
  let value = candidate.trim();
  if (value.length === 0 || value.length > 64) return null;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value); // [v6]:port
  if (bracketed) value = bracketed[1];
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (v4WithPort) value = v4WithPort[1];
  return isIP(value) !== 0 ? value.toLowerCase() : null;
}

/**
 * Client IP: first `X-Forwarded-For` hop, then `X-Real-IP`, else "unknown".
 *
 * Trust caveat: the first XFF hop is only reliable when the hosting proxy
 * overwrites X-Forwarded-For (e.g. Vercel) — a proxy that *appends* lets
 * clients choose their own key. All requests without a usable IP share the
 * "unknown" bucket.
 */
export function getClientIp(headers: Headers): string {
  return (
    cleanIp(firstHeaderValue(headers.get("x-forwarded-for"))) ??
    cleanIp(firstHeaderValue(headers.get("x-real-ip"))) ??
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Bounded body reader
// ---------------------------------------------------------------------------

export type BodyReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "invalid_encoding" | "invalid_content_length" };

/**
 * Reads the body as UTF-8 text without buffering more than `maxBytes`.
 * Rejects early on a declared Content-Length above the limit, and also counts
 * streamed bytes (chunked bodies or a lying Content-Length).
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<BodyReadResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared.trim())) return { ok: false, reason: "invalid_content_length" };
    if (Number(declared) > maxBytes) return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "invalid_encoding" };
  }
}
