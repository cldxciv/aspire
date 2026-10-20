import "server-only";

import { ROBOTS_NOINDEX } from "@/lib/auth/config";
import { getSiteOrigin } from "@/lib/server/env";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";
import { checkSameOrigin, getClientIp } from "@/lib/server/request-guards";

import { mcpLog } from "./log";
import { resolveMcpToken, type McpCaller } from "./tokens";

/**
 * HTTP-level checks for `/api/mcp` (docs/mcp.md): browser-origin rejection, bearer-token
 * authentication and rate limits. Everything returns ready-made responses with private headers.
 *
 * Rate limits (in memory, single node like the rest of the app; rolling 10 minutes):
 * - per token: 120 requests;
 * - all tokens together: 600 requests;
 * - failed authentications per client IP: 20, after which that IP gets 429 before any lookup.
 */

export const MCP_RATE_LIMITS = {
  perToken: { limit: 120, windowMs: 10 * 60 * 1000 },
  global: { limit: 600, windowMs: 10 * 60 * 1000 },
  authFailuresPerIp: { limit: 20, windowMs: 10 * 60 * 1000 },
} as const;

const REALM = "aspire-mcp";
const MAX_TRACKED_IPS = 10_000;

/** Failed authentications per IP (timestamps). Unlike the request limiters it can be read without counting. */
class FailureTracker {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
  }

  /** Seconds until `key` may try again, or 0 when it is not blocked. */
  blockedFor(key: string, now: number): number {
    const recent = this.recent(key, now);
    if (recent.length < this.limit) return 0;
    return Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
  }

  record(key: string, now: number): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    while (this.hits.size > MAX_TRACKED_IPS) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}

type Limiters = { perToken: SlidingWindowRateLimiter; global: SlidingWindowRateLimiter; failures: FailureTracker };
const GLOBAL_KEY = Symbol.for("aspire.mcpRateLimits");
const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Limiters };

function limiters(): Limiters {
  store[GLOBAL_KEY] ??= {
    perToken: new SlidingWindowRateLimiter({ ...MCP_RATE_LIMITS.perToken, maxKeys: 1_000 }),
    global: new SlidingWindowRateLimiter({ ...MCP_RATE_LIMITS.global, maxKeys: 10 }),
    failures: new FailureTracker(MCP_RATE_LIMITS.authFailuresPerIp.limit, MCP_RATE_LIMITS.authFailuresPerIp.windowMs),
  };
  return store[GLOBAL_KEY];
}

/** Test helper: forgets every rate-limit counter. */
export function resetMcpRateLimitsForTests(): void {
  delete store[GLOBAL_KEY];
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** `no-store` + `noindex` on every MCP response. */
export function withPrivateHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  result.set("Cache-Control", "no-store");
  result.set("X-Robots-Tag", ROBOTS_NOINDEX);
  return result;
}

/** A JSON-RPC error body (id null) with an HTTP status, like the MCP SDK's own transport errors. */
export function mcpHttpError(status: number, message: string, extraHeaders?: Record<string, string>): Response {
  const headers = withPrivateHeaders(extraHeaders);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers,
  });
}

function unauthorized(description: string, error: "invalid_request" | "invalid_token"): Response {
  return mcpHttpError(401, `Unauthorized: ${description}`, {
    "WWW-Authenticate": `Bearer realm="${REALM}", error="${error}", error_description="${description}"`,
  });
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return mcpHttpError(429, "Too many requests. Try again later.", { "Retry-After": String(retryAfterSeconds) });
}

// ---------------------------------------------------------------------------
// Browser origin
// ---------------------------------------------------------------------------

/**
 * MCP clients (Claude Code, the Agent SDK, the Messages API connector) are not browsers and send
 * no `Origin`. A request that carries browser provenance (`Origin` or `Sec-Fetch-Site`) must come
 * from this site itself; anything else (another website's script, `Origin: null`) gets 403.
 * Returns null when allowed. Defence in depth: browsers also need a CORS preflight for the
 * `Authorization` header, which this endpoint never grants.
 */
export function rejectForeignBrowserOrigin(request: Request): Response | null {
  const hasBrowserProvenance = request.headers.has("origin") || request.headers.has("sec-fetch-site");
  if (!hasBrowserProvenance) return null;
  const check = checkSameOrigin(request, { siteOrigin: getSiteOrigin(process.env) });
  if (check.ok) return null;
  mcpLog({ action: "request", outcome: "forbidden", reason: check.reason });
  return mcpHttpError(403, "Forbidden: browser requests from other sites are not allowed.");
}

// ---------------------------------------------------------------------------
// Bearer authentication + rate limits
// ---------------------------------------------------------------------------

export type McpAuthResult = { ok: true; caller: McpCaller } | { ok: false; response: Response };

/** Extracts the bearer credential. Null when the header is missing or not a single Bearer value. */
export function readBearer(headers: Headers): string | null {
  const raw = headers.get("authorization");
  if (!raw) return null;
  const match = /^Bearer[ \t]+([^\s,]+)[ \t]*$/i.exec(raw);
  return match ? match[1] : null;
}

const FAILURE_DESCRIPTIONS: Record<string, string> = {
  expired: "The token has expired.",
  revoked: "The token has been revoked.",
  creator_inactive: "The token's admin account is not active.",
};

/**
 * Authenticates an MCP request: `Authorization: Bearer asp_mcp_…` → an active token of an enabled
 * admin. 401 (`WWW-Authenticate: Bearer`) for a missing, malformed, unknown, expired or revoked
 * token or an inactive creator; unknown and malformed tokens share one message. 429 past the
 * per-IP failure, per-token or global limits. Never logs the token or the IP.
 */
export function authenticateMcpRequest(request: Request, now: number = Date.now()): McpAuthResult {
  const { perToken, global, failures } = limiters();
  const ip = getClientIp(request.headers);

  const blockedFor = failures.blockedFor(ip, now);
  if (blockedFor > 0) {
    mcpLog({ action: "auth", outcome: "rate_limited", reason: "auth_failures" });
    return { ok: false, response: tooManyRequests(blockedFor) };
  }

  const fail = (reason: string, description: string, error: "invalid_request" | "invalid_token"): McpAuthResult => {
    failures.record(ip, now);
    mcpLog({ action: "auth", outcome: "unauthenticated", reason });
    return { ok: false, response: unauthorized(description, error) };
  };

  const presented = readBearer(request.headers);
  if (presented === null) return fail("missing_token", "Bearer token required.", "invalid_request");

  const resolved = resolveMcpToken(presented, now);
  if (!resolved.ok) {
    return fail(resolved.reason, FAILURE_DESCRIPTIONS[resolved.reason] ?? "Invalid token.", "invalid_token");
  }

  const tokenLimit = perToken.check(resolved.caller.tokenId);
  if (!tokenLimit.allowed) {
    mcpLog({ action: "auth", outcome: "rate_limited", reason: "per_token" });
    return { ok: false, response: tooManyRequests(tokenLimit.retryAfterSeconds) };
  }
  const globalLimit = global.check("all");
  if (!globalLimit.allowed) {
    mcpLog({ action: "auth", outcome: "rate_limited", reason: "global" });
    return { ok: false, response: tooManyRequests(globalLimit.retryAfterSeconds) };
  }
  return { ok: true, caller: resolved.caller };
}
