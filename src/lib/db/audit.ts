import "server-only";

import type { DatabaseSync } from "node:sqlite";

/**
 * `audit_log`: who changed which account, and when. Details are a small flat JSON
 * object of non-secret facts (role, login id, flags, counts). Passwords, hashes,
 * tokens and the like are never written: keys that look like secrets are dropped
 * here as a last line of defence, whatever the caller passes.
 */

export type AuditValue = string | number | boolean | null;
export type AuditDetails = Readonly<Record<string, AuditValue>>;

export interface AuditEntry {
  id: number;
  actorId: string | null;
  action: string;
  target: string | null;
  createdAt: number;
  details: AuditDetails;
}

const SECRET_KEY = /pass|hash|token|secret|salt|cookie|credential/i;
const MAX_KEYS = 20;
const MAX_STRING = 200;

/** Keeps only primitive values under non-secret keys; truncates long strings. */
export function sanitizeAuditDetails(details: Record<string, unknown> | undefined): AuditDetails {
  const clean: Record<string, AuditValue> = {};
  if (!details) return clean;
  for (const [key, value] of Object.entries(details)) {
    if (Object.keys(clean).length >= MAX_KEYS) break;
    if (SECRET_KEY.test(key)) continue;
    if (typeof value === "string") clean[key] = value.slice(0, MAX_STRING);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean" || value === null) clean[key] = value;
  }
  return clean;
}

export function recordAudit(
  db: DatabaseSync,
  input: {
    actorId: string | null;
    action: string;
    target: string | null;
    details?: Record<string, unknown>;
    now: number;
  },
): void {
  db.prepare("INSERT INTO audit_log (actor_id, action, target, created_at, details) VALUES (?, ?, ?, ?, ?)").run(
    input.actorId,
    input.action,
    input.target,
    input.now,
    JSON.stringify(sanitizeAuditDetails(input.details)),
  );
}

function parseDetails(raw: unknown): AuditDetails {
  try {
    const value: unknown = JSON.parse(String(raw));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? sanitizeAuditDetails(value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Most recent entries first. */
export function listAudit(db: DatabaseSync, options: { limit: number; target?: string }): AuditEntry[] {
  const limit = Math.max(1, Math.min(500, Math.trunc(options.limit)));
  const rows = options.target
    ? db
        .prepare(
          "SELECT id, actor_id, action, target, created_at, details FROM audit_log WHERE target = ? ORDER BY id DESC LIMIT ?",
        )
        .all(options.target, limit)
    : db
        .prepare("SELECT id, actor_id, action, target, created_at, details FROM audit_log ORDER BY id DESC LIMIT ?")
        .all(limit);
  return rows.map((row) => ({
    id: Number(row.id),
    actorId: row.actor_id === null ? null : String(row.actor_id),
    action: String(row.action),
    target: row.target === null ? null : String(row.target),
    createdAt: Number(row.created_at),
    details: parseDetails(row.details),
  }));
}
