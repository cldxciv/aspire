/**
 * Client-safe shapes and rules for the admin MCP access-token UI and API (owner: MCP-ADMIN).
 * Pure: no server imports, so the browser form and the route handlers share one set of limits.
 *
 * A token's plaintext is returned exactly once by `POST /api/admin/mcp-tokens` and never
 * appears in any of these view types; hashes never leave the token module.
 */

import { normalizeScopes, scopesSummary } from "@/lib/mcp/scopes";

import type { McpAccess } from "./permissions";

export const MCP_TOKEN_NAME_LENGTH = { min: 3, max: 60 } as const;
export const MCP_EXPIRY_DAYS = { min: 1, max: 365, default: 90 } as const;
/** Choices offered by the form's expiry select (the API accepts any whole number 1–365). */
export const MCP_EXPIRY_OPTIONS = [1, 7, 30, 90, 180, 365] as const;

/**
 * Mirrors `McpTokenStatus` in src/lib/mcp/tokens.ts. `creator_inactive`: the admin who created the
 * token is disabled, no longer an admin or must change a temporary password, so it is paused.
 */
export const MCP_TOKEN_STATUSES = ["active", "expired", "revoked", "creator_inactive"] as const;
export type McpTokenStatus = (typeof MCP_TOKEN_STATUSES)[number];

/** One token as the admin list shows it: never the plaintext and never a hash. */
export type McpTokenView = {
  id: string;
  name: string;
  /** Normalised scope strings, e.g. ["accounts:read", "accounts:write", "content:read"]. */
  scopes: string[];
  /** Access per service id (every catalogue service; "none" when not granted). */
  scopeSummary: Record<string, McpAccess>;
  /** Display name of the admin who created it; null when that account no longer exists. */
  createdByName: string | null;
  /** ISO 8601. */
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: McpTokenStatus;
};

/** `POST /api/admin/mcp-tokens` → 201 data. `token` is the plaintext, shown once. */
export type McpTokenCreated = {
  token: string;
  record: McpTokenView;
  /** Absolute URL of the MCP endpoint, for the ready-to-paste command. */
  mcpUrl: string;
};

/** NFKC, collapsed whitespace, trimmed: the same normalisation as the token module. */
export function normaliseTokenName(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * Control, private-use, surrogate, line/paragraph separator and bidi-override characters
 * (Trojan-source style tricks). ZWJ / ZWNJ stay allowed: Devanagari text uses them.
 */
const FORBIDDEN_NAME_CHARS = /[\p{Cc}\p{Co}\p{Cs}\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff\ufff9-\ufffb]/u;

export type TokenNameIssue = "nameRequired" | "nameLength" | "nameInvalid";

/** Validates an already-normalised name (code points, so Devanagari is not over-counted). */
export function tokenNameIssue(name: string): TokenNameIssue | null {
  if (name.length === 0) return "nameRequired";
  const length = Array.from(name).length;
  if (length < MCP_TOKEN_NAME_LENGTH.min || length > MCP_TOKEN_NAME_LENGTH.max) return "nameLength";
  if (FORBIDDEN_NAME_CHARS.test(name)) return "nameInvalid";
  return null;
}

/**
 * Explicit field picking from the token module's record, so nothing added to it later (or a
 * secret by mistake) can reach the browser. Scopes are normalised here too, so a legacy
 * "read" / "read write" token shows as its per-service equivalent.
 */
export function toMcpTokenView(record: {
  id: string;
  name: string;
  scopes: readonly string[] | string;
  scopeSummary?: Readonly<Record<string, McpAccess>>;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: McpTokenStatus;
}): McpTokenView {
  const scopes: string[] = normalizeScopes(record.scopes);
  return {
    id: record.id,
    name: record.name,
    scopes,
    scopeSummary: { ...(record.scopeSummary ?? scopesSummary(scopes)) },
    createdByName: record.createdByName,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    status: record.status,
  };
}

/** Newest first; ties broken by id so the order is stable. */
export function sortTokens<T extends { createdAt: string; id: string }>(tokens: readonly T[]): T[] {
  return [...tokens].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// MCP endpoint + Claude Code command
// ---------------------------------------------------------------------------

export const MCP_PATH = "/api/mcp";

/** Host (with optional port) that is safe to paste into a shell command: no quotes, spaces or metacharacters. */
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

/** `https://host[:port]` when the value is a plain http(s) origin with a safe host, else null. */
export function safeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return SAFE_HOST.test(url.host) ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The site's public origin: NEXT_PUBLIC_SITE_URL's origin when set (production), else the
 * request's own host and scheme (`X-Forwarded-*` first, as behind a TLS-terminating proxy).
 * Anything that would not be a clean origin is dropped, so a forged Host header can never
 * inject text into the shell command shown to the admin.
 */
export function publicOrigin(
  siteOrigin: string | null | undefined,
  headers: { get(name: string): string | null },
  fallbackUrl?: string,
): string | null {
  const fromEnv = safeOrigin(siteOrigin);
  if (fromEnv) return fromEnv;
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const host = first(headers.get("x-forwarded-host")) ?? first(headers.get("host"));
  const proto = first(headers.get("x-forwarded-proto"))?.toLowerCase();
  if (host) {
    const scheme = proto === "https" || proto === "http" ? proto : fallbackUrl?.startsWith("https:") ? "https" : "http";
    const fromHeaders = safeOrigin(`${scheme}://${host}`);
    if (fromHeaders) return fromHeaders;
  }
  return safeOrigin(fallbackUrl);
}

export function mcpEndpoint(origin: string): string {
  return `${origin}${MCP_PATH}`;
}

/** Tokens are opaque URL-safe strings; anything else is refused rather than put in a shell command. */
const SAFE_TOKEN = /^[A-Za-z0-9._~+/=-]{16,512}$/;

/**
 * `claude mcp add --transport http aspire <url> --header "Authorization: Bearer <token>"`.
 * Returns null when the URL or token contains characters that are unsafe in a shell.
 */
export function claudeCodeCommand(mcpUrl: string, token: string): string | null {
  let url: URL;
  try {
    url = new URL(mcpUrl);
  } catch {
    return null;
  }
  if (!safeOrigin(url.origin) || url.pathname !== MCP_PATH || url.search || url.hash) return null;
  if (!SAFE_TOKEN.test(token)) return null;
  return `claude mcp add --transport http aspire ${url.origin}${MCP_PATH} --header "Authorization: Bearer ${token}"`;
}
