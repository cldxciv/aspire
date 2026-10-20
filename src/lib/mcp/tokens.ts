import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { z } from "zod";

import { recordAudit } from "@/lib/db/audit";
import { getDb, withTransaction } from "@/lib/db/connection";
import { isLegacyMcpTokensTable, MCP_TOKENS_INDEX_SQL, mcpTokensTableSql } from "@/lib/db/features/mcp";

import {
  MCP_LEGACY_SCOPES,
  MCP_SERVICES,
  mcpScopesInputSchema,
  normalizeScopes,
  scopeIssues,
  scopesSummary,
  isToolAllowed,
  type McpLegacyScopes,
  type McpScope,
  type McpServiceAccess,
  type McpServiceId,
} from "./scopes";

/**
 * MCP bearer tokens (owner: MCP-CORE; docs/mcp.md). Table: `mcp_tokens`
 * (src/lib/db/features/mcp.ts).
 *
 * Public API for the admin UI / token routes (MCP-ADMIN). Callers must already hold
 * `requireAdmin(...)` (same-origin for writes). Stable:
 * - `createMcpToken({ name, scopes, expiresInDays, createdBy })` → `{ token, record }`. `scopes`
 *   is an array of per-service scopes (`["accounts:read", "content:read"]`, see ./scopes.ts) or a
 *   legacy `"read"` / `"read write"`. `token` is the plaintext `asp_mcp_…` value: show it ONCE,
 *   never store or log it. Throws `McpTokenError` (`code`) for invalid input; validate the request
 *   body with `createMcpTokenInputSchema` (or `mcpScopesInputSchema` for the scopes) first to
 *   answer 422 with field errors.
 * - `listMcpTokens()` → `McpTokenRecord[]`, newest first. Never contains a token or its hash.
 * - `getMcpToken(id)` → `McpTokenRecord | null`.
 * - `revokeMcpToken(id, revokedBy)` → `{ record, changed } | null` (null = unknown id).
 *   Idempotent: revoking a revoked token changes nothing and writes no audit row.
 * Writes are audited: `mcp.token_create`, `mcp.token_revoke` (actor = the admin, target = token id).
 *
 * Only SHA-256(token) is stored. Lookups go by the hash (primary key index) and the stored hash
 * is compared again in constant time. Tokens stop working when revoked, expired, or when their
 * creator is no longer an enabled admin with a changed password.
 */

/** @deprecated Legacy whole-token scopes; use the per-service scopes in ./scopes.ts. */
export const MCP_SCOPES = MCP_LEGACY_SCOPES;
/** @deprecated Legacy whole-token scopes; use `McpScope[]` from ./scopes.ts. */
export type McpScopes = McpLegacyScopes;
export type { McpScope, McpServiceAccess, McpServiceId } from "./scopes";

export const MCP_TOKEN_PREFIX = "asp_mcp_";
/** `asp_mcp_` + 32 random bytes as base64url (43 characters). */
const TOKEN_PATTERN = /^asp_mcp_[A-Za-z0-9_-]{43}$/;

export const MCP_TOKEN_LIMITS = {
  defaultExpiresInDays: 90,
  maxExpiresInDays: 365,
  minExpiresInDays: 1,
  nameMaxLength: 80,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** `last_used_at` is written at most this often per token (keeps reads cheap). */
const TOUCH_INTERVAL_MS = 60 * 1000;

export const AUDIT_MCP_TOKEN = { create: "mcp.token_create", revoke: "mcp.token_revoke" } as const;

export type McpTokenStatus = "active" | "expired" | "revoked" | "creator_inactive";

/** A token as shown to admins. Never contains the token or its hash. Times are ISO strings. */
export interface McpTokenRecord {
  id: string;
  name: string;
  /** Normalised per-service scopes (write ⇒ read; legacy rows mapped). */
  scopes: McpScope[];
  /** Access per service: "none" | "read" | "write" for every service in MCP_SERVICES. */
  scopeSummary: Record<McpServiceId, McpServiceAccess>;
  /** Admin user id that created the token. */
  createdBy: string;
  /** That admin's display name (null if the account no longer exists). */
  createdByName: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  /**
   * `active` = usable now. `creator_inactive` = the creating admin is disabled, no longer an admin
   * or must change a temporary password (the token works again once that is resolved, unless it
   * expired or was revoked meanwhile).
   */
  status: McpTokenStatus;
}

export type McpTokenErrorCode = "invalid_name" | "invalid_scopes" | "invalid_expiry" | "creator_not_admin";

/** Invalid input to `createMcpToken`. `message` is safe to show to an admin. */
export class McpTokenError extends Error {
  readonly code: McpTokenErrorCode;
  constructor(code: McpTokenErrorCode, message: string) {
    super(message);
    this.name = "McpTokenError";
    this.code = code;
  }
}

/** Normalises a token name: NFKC, collapsed whitespace, trimmed. */
export function normalizeMcpTokenName(raw: string): string {
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** C0/C1 controls and line/paragraph separators (code-point check, like src/lib/auth/identifiers.ts). */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029) return true;
  }
  return false;
}

function isValidName(name: string): boolean {
  return name.length >= 1 && Array.from(name).length <= MCP_TOKEN_LIMITS.nameMaxLength && !hasControlCharacter(name);
}

/**
 * Request-body schema for "create token" (MCP-ADMIN routes): `{ name, scopes, expiresInDays? }`.
 * `scopes`: an array of per-service scopes (validated and normalised by `mcpScopesInputSchema`) or
 * a legacy `"read"` / `"read write"`. `expiresInDays` defaults to 90 (1–365).
 */
export const createMcpTokenInputSchema = z.strictObject({
  name: z
    .string()
    .max(200)
    .transform(normalizeMcpTokenName)
    .refine(isValidName, `Use 1–${MCP_TOKEN_LIMITS.nameMaxLength} characters.`),
  scopes: z.union([z.enum(MCP_LEGACY_SCOPES), mcpScopesInputSchema]),
  expiresInDays: z
    .number()
    .int()
    .min(MCP_TOKEN_LIMITS.minExpiresInDays)
    .max(MCP_TOKEN_LIMITS.maxExpiresInDays)
    .default(MCP_TOKEN_LIMITS.defaultExpiresInDays),
});
export type CreateMcpTokenInput = z.input<typeof createMcpTokenInputSchema>;

/** SHA-256 hex of a plaintext token. */
export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** True when `value` has the exact shape of an Aspire MCP token (no lookup). */
export function isMcpTokenFormat(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

function generateToken(): string {
  return `${MCP_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type Row = Record<string, SQLOutputValue>;

const SELECT_TOKEN = `
  SELECT t.id, t.token_hash, t.name, t.created_by, t.scopes, t.created_at, t.expires_at, t.last_used_at,
         t.revoked_at, t.revoked_by,
         u.display_name AS creator_name, u.role AS creator_role, u.disabled AS creator_disabled,
         u.must_change_password AS creator_must_change
    FROM mcp_tokens t
    LEFT JOIN users u ON u.id = t.created_by`;

const iso = (ms: number): string => new Date(ms).toISOString();
const nullableNumber = (value: SQLOutputValue | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);

function creatorActive(row: Row): boolean {
  return (
    row.creator_role === "admin" && Number(row.creator_disabled) === 0 && Number(row.creator_must_change) === 0
  );
}

function statusOf(row: Row, now: number): McpTokenStatus {
  if (row.revoked_at !== null && row.revoked_at !== undefined) return "revoked";
  if (Number(row.expires_at) <= now) return "expired";
  if (!creatorActive(row)) return "creator_inactive";
  return "active";
}

function toRecord(row: Row, now: number): McpTokenRecord {
  const scopes = normalizeScopes(String(row.scopes ?? ""));
  const lastUsed = nullableNumber(row.last_used_at);
  const revoked = nullableNumber(row.revoked_at);
  return {
    id: String(row.id),
    name: String(row.name),
    scopes,
    scopeSummary: scopesSummary(scopes),
    createdBy: String(row.created_by),
    createdByName: row.creator_name === null || row.creator_name === undefined ? null : String(row.creator_name),
    createdAt: iso(Number(row.created_at)),
    expiresAt: iso(Number(row.expires_at)),
    lastUsedAt: lastUsed === null ? null : iso(lastUsed),
    revokedAt: revoked === null ? null : iso(revoked),
    revokedBy: row.revoked_by === null || row.revoked_by === undefined ? null : String(row.revoked_by),
    status: statusOf(row, now),
  };
}

function findRow(db: DatabaseSync, id: string): Row | undefined {
  return db.prepare(`${SELECT_TOKEN} WHERE t.id = ?`).get(id);
}

// ---------------------------------------------------------------------------
// Scopes on create + legacy table upgrade
// ---------------------------------------------------------------------------

/** Strict validation of requested scopes (array, space-separated string or legacy string). */
function parseRequestedScopes(requested: readonly string[] | string): McpScope[] {
  if (typeof requested === "string" && (MCP_LEGACY_SCOPES as readonly string[]).includes(requested.trim())) {
    return normalizeScopes(requested);
  }
  const list = typeof requested === "string" ? requested.trim().split(/\s+/).filter(Boolean) : [...requested];
  if (!list.every((entry) => typeof entry === "string")) {
    throw new McpTokenError("invalid_scopes", "Permissions must be a list of <service>:read / <service>:write.");
  }
  const issues = scopeIssues(list);
  if (issues.length > 0) throw new McpTokenError("invalid_scopes", issues[0]);
  return normalizeScopes(list);
}

const upgradedDbs = new WeakSet<DatabaseSync>();

/**
 * Databases created before per-service permissions have `CHECK (scopes IN ('read', 'read write'))`
 * on `mcp_tokens.scopes`, which rejects the new space-separated lists. Rebuild that table once:
 * same columns, rows copied unchanged (legacy values are still mapped when read). Runs before the
 * first new-format write; a no-op on current databases.
 */
function upgradeLegacyTokensTable(db: DatabaseSync): void {
  if (upgradedDbs.has(db)) return;
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mcp_tokens'").get();
  if (isLegacyMcpTokensTable(row?.sql === undefined || row?.sql === null ? null : String(row.sql))) {
    withTransaction(db, () => {
      const current = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mcp_tokens'").get();
      if (!isLegacyMcpTokensTable(current?.sql === undefined || current?.sql === null ? null : String(current.sql))) return;
      const columns = "id, token_hash, name, created_by, scopes, created_at, expires_at, last_used_at, revoked_at, revoked_by";
      db.exec("DROP TABLE IF EXISTS mcp_tokens_rebuild");
      db.exec(mcpTokensTableSql("mcp_tokens_rebuild"));
      db.exec(`INSERT INTO mcp_tokens_rebuild (${columns}) SELECT ${columns} FROM mcp_tokens`);
      db.exec("DROP TABLE mcp_tokens");
      db.exec("ALTER TABLE mcp_tokens_rebuild RENAME TO mcp_tokens");
      db.exec(MCP_TOKENS_INDEX_SQL);
    });
  }
  upgradedDbs.add(db);
}

// ---------------------------------------------------------------------------
// Admin API (MCP-ADMIN)
// ---------------------------------------------------------------------------

/**
 * Creates a token for `createdBy` (must be an enabled admin with a changed password). Returns the
 * plaintext token ONCE together with the stored record; only its SHA-256 is kept. Audited
 * (`mcp.token_create`). Throws `McpTokenError` for invalid input.
 */
export function createMcpToken(
  input: {
    name: string;
    /** Per-service scopes, or a legacy "read" / "read write". Default: "read" (every available service at read). */
    scopes?: readonly string[] | string;
    expiresInDays?: number;
    createdBy: string;
  },
  now: number = Date.now(),
): { token: string; record: McpTokenRecord } {
  const name = normalizeMcpTokenName(String(input.name ?? ""));
  if (!isValidName(name)) {
    throw new McpTokenError("invalid_name", `Use 1–${MCP_TOKEN_LIMITS.nameMaxLength} characters for the name.`);
  }
  const scopes = parseRequestedScopes(input.scopes ?? "read");
  const days = input.expiresInDays ?? MCP_TOKEN_LIMITS.defaultExpiresInDays;
  if (
    !Number.isInteger(days) ||
    days < MCP_TOKEN_LIMITS.minExpiresInDays ||
    days > MCP_TOKEN_LIMITS.maxExpiresInDays
  ) {
    throw new McpTokenError(
      "invalid_expiry",
      `Expiry must be a whole number of days from ${MCP_TOKEN_LIMITS.minExpiresInDays} to ${MCP_TOKEN_LIMITS.maxExpiresInDays}.`,
    );
  }

  const db = getDb();
  upgradeLegacyTokensTable(db);
  const token = generateToken();
  const id = randomUUID();
  const summary = scopesSummary(scopes);
  withTransaction(db, () => {
    const creator = db
      .prepare("SELECT role, disabled, must_change_password FROM users WHERE id = ?")
      .get(input.createdBy);
    if (
      !creator ||
      creator.role !== "admin" ||
      Number(creator.disabled) !== 0 ||
      Number(creator.must_change_password) !== 0
    ) {
      throw new McpTokenError("creator_not_admin", "Only an active admin account can create MCP tokens.");
    }
    db.prepare(
      `INSERT INTO mcp_tokens (id, token_hash, name, created_by, scopes, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, hashMcpToken(token), name, input.createdBy, scopes.join(" "), now, now + days * DAY_MS);
    recordAudit(db, {
      actorId: input.createdBy,
      action: AUDIT_MCP_TOKEN.create,
      target: id,
      details: {
        name,
        expiresInDays: days,
        scopes: scopes.join(" "),
        // Scope summary, e.g. "site=read accounts=write progress=none audit=none content=read crm=none".
        access: MCP_SERVICES.map((service) => `${service.id}=${summary[service.id]}`).join(" "),
      },
      now,
    });
  });
  const row = findRow(db, id);
  if (!row) throw new Error("createMcpToken: row missing after insert");
  return { token, record: toRecord(row, now) };
}

/** Every token (any status), newest first. No secrets. */
export function listMcpTokens(now: number = Date.now()): McpTokenRecord[] {
  return getDb()
    .prepare(`${SELECT_TOKEN} ORDER BY t.created_at DESC, t.id`)
    .all()
    .map((row) => toRecord(row, now));
}

/** One token by id, or null. */
export function getMcpToken(id: string, now: number = Date.now()): McpTokenRecord | null {
  const row = findRow(getDb(), id);
  return row ? toRecord(row, now) : null;
}

/**
 * Revokes a token immediately (the next request with it gets 401). `revokedBy` is the admin's user
 * id. Returns null for an unknown id; `changed: false` when it was already revoked (no audit row).
 */
export function revokeMcpToken(
  id: string,
  revokedBy: string,
  now: number = Date.now(),
): { record: McpTokenRecord; changed: boolean } | null {
  const db = getDb();
  const changed = withTransaction(db, (): boolean | null => {
    const existing = db.prepare("SELECT revoked_at FROM mcp_tokens WHERE id = ?").get(id);
    if (!existing) return null;
    if (existing.revoked_at !== null) return false;
    db.prepare("UPDATE mcp_tokens SET revoked_at = ?, revoked_by = ? WHERE id = ?").run(now, revokedBy, id);
    recordAudit(db, { actorId: revokedBy, action: AUDIT_MCP_TOKEN.revoke, target: id, now });
    return true;
  });
  if (changed === null) return null;
  const row = findRow(db, id);
  return row ? { record: toRecord(row, now), changed } : null;
}

// ---------------------------------------------------------------------------
// Request authentication (used by src/lib/mcp/auth.ts)
// ---------------------------------------------------------------------------

/** The authenticated caller of one MCP request. */
export interface McpCaller {
  tokenId: string;
  tokenName: string;
  /** Normalised per-service scopes (write ⇒ read). */
  scopes: McpScope[];
  /** The admin who created the token: the actor recorded in audit rows. */
  createdBy: string;
  expiresAt: number;
}

export type ResolveMcpTokenResult =
  | { ok: true; caller: McpCaller }
  | { ok: false; reason: "malformed" | "unknown" | "revoked" | "expired" | "creator_inactive" };

/**
 * Resolves a presented plaintext token. Constant-time comparison of the stored hash; the
 * creator's state is re-read on every request. Updates `last_used_at` (at most once a minute).
 */
export function resolveMcpToken(token: string, now: number = Date.now()): ResolveMcpTokenResult {
  if (!isMcpTokenFormat(token)) return { ok: false, reason: "malformed" };
  const hash = hashMcpToken(token);
  const db = getDb();
  const row = db.prepare(`${SELECT_TOKEN} WHERE t.token_hash = ?`).get(hash);
  if (!row) return { ok: false, reason: "unknown" };
  const stored = Buffer.from(String(row.token_hash), "hex");
  const presented = Buffer.from(hash, "hex");
  if (stored.length !== presented.length || !timingSafeEqual(stored, presented)) return { ok: false, reason: "unknown" };

  const status = statusOf(row, now);
  if (status !== "active") return { ok: false, reason: status };

  const lastUsed = nullableNumber(row.last_used_at);
  if (lastUsed === null || now - lastUsed >= TOUCH_INTERVAL_MS) {
    db.prepare("UPDATE mcp_tokens SET last_used_at = ? WHERE id = ?").run(now, String(row.id));
  }
  return {
    ok: true,
    caller: {
      tokenId: String(row.id),
      tokenName: String(row.name),
      scopes: normalizeScopes(String(row.scopes ?? "")),
      createdBy: String(row.created_by),
      expiresAt: Number(row.expires_at),
    },
  };
}

/** True when the caller's scopes allow `toolName` (see `isToolAllowed` in ./scopes.ts). */
export function callerMayUse(caller: Pick<McpCaller, "scopes">, toolName: string): boolean {
  return isToolAllowed(caller.scopes, toolName);
}
