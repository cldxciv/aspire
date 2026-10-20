import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { z } from "zod";

import { recordAudit } from "@/lib/db/audit";
import { getDb, withTransaction } from "@/lib/db/connection";

/**
 * MCP bearer tokens (owner: MCP-CORE; docs/mcp.md). Table: `mcp_tokens`
 * (src/lib/db/features/mcp.ts).
 *
 * Public API for the admin UI / token routes (MCP-ADMIN). Callers must already hold
 * `requireAdmin(...)` (same-origin for writes). Stable:
 * - `createMcpToken({ name, scopes, expiresInDays, createdBy })` → `{ token, record }`. `token`
 *   is the plaintext `asp_mcp_…` value: show it ONCE, never store or log it. Throws
 *   `McpTokenError` (`code`) for invalid input; validate the request body with
 *   `createMcpTokenInputSchema` first to answer 422 with field errors.
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

export const MCP_SCOPES = ["read", "read write"] as const;
export type McpScopes = (typeof MCP_SCOPES)[number];

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
  scopes: McpScopes;
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
 * Request-body schema for "create token" (MCP-ADMIN routes): `{ name, scopes?, expiresInDays? }`.
 * `scopes` defaults to "read", `expiresInDays` to 90 (1–365).
 */
export const createMcpTokenInputSchema = z.strictObject({
  name: z
    .string()
    .max(200)
    .transform(normalizeMcpTokenName)
    .refine(isValidName, `Use 1–${MCP_TOKEN_LIMITS.nameMaxLength} characters.`),
  scopes: z.enum(MCP_SCOPES).default("read"),
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

function isScopes(value: string): value is McpScopes {
  return (MCP_SCOPES as readonly string[]).includes(value);
}

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
  const scopes = String(row.scopes);
  const lastUsed = nullableNumber(row.last_used_at);
  const revoked = nullableNumber(row.revoked_at);
  return {
    id: String(row.id),
    name: String(row.name),
    scopes: isScopes(scopes) ? scopes : "read",
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
// Admin API (MCP-ADMIN)
// ---------------------------------------------------------------------------

/**
 * Creates a token for `createdBy` (must be an enabled admin with a changed password). Returns the
 * plaintext token ONCE together with the stored record; only its SHA-256 is kept. Audited
 * (`mcp.token_create`). Throws `McpTokenError` for invalid input.
 */
export function createMcpToken(
  input: { name: string; scopes?: McpScopes; expiresInDays?: number; createdBy: string },
  now: number = Date.now(),
): { token: string; record: McpTokenRecord } {
  const name = normalizeMcpTokenName(String(input.name ?? ""));
  if (!isValidName(name)) {
    throw new McpTokenError("invalid_name", `Use 1–${MCP_TOKEN_LIMITS.nameMaxLength} characters for the name.`);
  }
  const scopes = input.scopes ?? "read";
  if (!isScopes(scopes)) throw new McpTokenError("invalid_scopes", 'Scopes must be "read" or "read write".');
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
  const token = generateToken();
  const id = randomUUID();
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
    ).run(id, hashMcpToken(token), name, input.createdBy, scopes, now, now + days * DAY_MS);
    recordAudit(db, {
      actorId: input.createdBy,
      action: AUDIT_MCP_TOKEN.create,
      target: id,
      details: { name, scopes, expiresInDays: days },
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
  scopes: McpScopes;
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
  const scopes = String(row.scopes);
  return {
    ok: true,
    caller: {
      tokenId: String(row.id),
      tokenName: String(row.name),
      scopes: isScopes(scopes) ? scopes : "read",
      createdBy: String(row.created_by),
      expiresAt: Number(row.expires_at),
    },
  };
}

/** True when the caller may use write tools. */
export function canWrite(caller: Pick<McpCaller, "scopes">): boolean {
  return caller.scopes === "read write";
}
