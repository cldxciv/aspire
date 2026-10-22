import "server-only";

import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

// Explicit .ts paths and no `@/` imports: scripts/super-admin.mjs runs this file directly in Node.
import { recordAudit } from "./audit.ts";
import { withTransaction } from "./connection.ts";

/**
 * `superadmin_grants` access (D-044; docs/lead-routing-plan.md §11). SQL only, safe for the CLI.
 * A super admin (SA) is an ADMIN account with an active grant row; it is never stored in the
 * session. "Effective" = active grant AND `users.role = 'admin'` AND the account is enabled.
 * Policy (who may grant, passwords, the last-SA rule) lives in src/lib/auth/super-admin.ts.
 */

export const SUPER_ADMIN_AUDIT_ACTIONS = {
  grant: "auth.super_admin_grant",
  revoke: "auth.super_admin_revoke",
  bootstrap: "auth.super_admin_bootstrap",
  /** Password reset from the server command (`reset-password`), `{ via: "cli" }`. */
  cliPasswordReset: "auth.password_reset",
} as const;

export type GrantVia = "bootstrap" | "cli" | "admin";

export interface GrantRow {
  userId: string;
  displayName: string;
  loginId: string;
  role: string;
  disabled: boolean;
  grantedAt: number;
  grantedBy: string | null;
  grantedByName: string | null;
  via: GrantVia;
  revokedAt: number | null;
}

type Row = Record<string, SQLOutputValue>;

function mapGrant(row: Row): GrantRow {
  const via = String(row.granted_via);
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name ?? ""),
    loginId: String(row.login_id ?? ""),
    role: String(row.role ?? ""),
    disabled: Number(row.disabled) === 1,
    grantedAt: Number(row.granted_at),
    grantedBy: row.granted_by === null || row.granted_by === undefined ? null : String(row.granted_by),
    grantedByName: row.granted_by_name === null || row.granted_by_name === undefined ? null : String(row.granted_by_name),
    via: via === "bootstrap" || via === "cli" ? via : "admin",
    revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : Number(row.revoked_at),
  };
}

const SELECT = `
  SELECT g.user_id, g.granted_at, g.granted_by, g.granted_via, g.revoked_at,
         u.display_name, u.login_id, u.role, u.disabled, b.display_name AS granted_by_name
    FROM superadmin_grants g
    JOIN users u ON u.id = g.user_id
    LEFT JOIN users b ON b.id = g.granted_by`;

/** Lock-free: any grant row at all (active or revoked). */
export function anyGrantRows(db: DatabaseSync): boolean {
  return Number(db.prepare("SELECT EXISTS (SELECT 1 FROM superadmin_grants) AS e").get()?.e ?? 0) === 1;
}

/** One indexed SELECT: active grant + enabled admin account. */
export function isEffectiveSuperAdminRow(db: DatabaseSync, userId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM superadmin_grants g JOIN users u ON u.id = g.user_id
        WHERE g.user_id = ? AND g.revoked_at IS NULL AND u.role = 'admin' AND u.disabled = 0`,
    )
    .get(userId);
  return row !== undefined;
}

/**
 * An active (unrevoked) grant row, whatever the account's state. Protection checks use this, not the
 * "effective" test: a disabled SA with a live grant becomes an SA again the moment it is re-enabled,
 * so a non-SA must not be able to reset, rename or re-enable it (H1).
 */
export function hasActiveGrant(db: DatabaseSync, userId: string): boolean {
  return db.prepare("SELECT 1 AS ok FROM superadmin_grants WHERE user_id = ? AND revoked_at IS NULL").get(userId) !== undefined;
}

export function countEffectiveSuperAdmins(db: DatabaseSync): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM superadmin_grants g JOIN users u ON u.id = g.user_id
        WHERE g.revoked_at IS NULL AND u.role = 'admin' AND u.disabled = 0`,
    )
    .get();
  return Number(row?.n ?? 0);
}

/** Active grants (oldest first), with the account and who granted it. */
export function listActiveGrants(db: DatabaseSync): GrantRow[] {
  return db.prepare(`${SELECT} WHERE g.revoked_at IS NULL ORDER BY g.granted_at, g.user_id`).all().map(mapGrant);
}

export function findGrant(db: DatabaseSync, userId: string): GrantRow | null {
  const row = db.prepare(`${SELECT} WHERE g.user_id = ?`).get(userId);
  return row ? mapGrant(row) : null;
}

/** Grants (or re-activates a revoked grant). Returns false when it was already active. */
export function upsertGrant(db: DatabaseSync, input: { userId: string; via: GrantVia; by: string | null; now: number }): boolean {
  const existing = findGrant(db, input.userId);
  if (existing && existing.revokedAt === null) return false;
  db.prepare(
    `INSERT INTO superadmin_grants (user_id, granted_at, granted_by, granted_via, revoked_at, revoked_by)
     VALUES (?, ?, ?, ?, NULL, NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       granted_at = excluded.granted_at, granted_by = excluded.granted_by, granted_via = excluded.granted_via,
       revoked_at = NULL, revoked_by = NULL`,
  ).run(input.userId, input.now, input.by, input.via);
  return true;
}

/** Revokes an active grant (the row is kept). Returns false when there was none. */
export function revokeGrant(db: DatabaseSync, userId: string, by: string | null, now: number): boolean {
  const result = db
    .prepare("UPDATE superadmin_grants SET revoked_at = ?, revoked_by = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(now, by, userId);
  return Number(result.changes) > 0;
}

function enabledAdminIds(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND disabled = 0 ORDER BY created_at, id LIMIT 2")
    .all()
    .map((row) => String(row.id));
}

/**
 * The one-time bootstrap rule (H5): only when there is NO grant row at all and EXACTLY ONE enabled
 * admin, that admin becomes super admin (`granted_via = 'bootstrap'`, audited, actor null). Runs
 * its write in a BEGIN IMMEDIATE transaction and re-checks inside it. Returns the user id granted,
 * or null when nothing happened. Callers check `anyGrantRows` first (lock-free).
 */
export function bootstrapSingleAdmin(db: DatabaseSync, now: number): string | null {
  if (anyGrantRows(db)) return null;
  if (enabledAdminIds(db).length !== 1) return null;
  return withTransaction(db, () => {
    if (anyGrantRows(db)) return null;
    const admins = enabledAdminIds(db);
    if (admins.length !== 1) return null;
    const [userId] = admins;
    upsertGrant(db, { userId, via: "bootstrap", by: null, now });
    recordAudit(db, { actorId: null, action: SUPER_ADMIN_AUDIT_ACTIONS.bootstrap, target: userId, details: { via: "bootstrap" }, now });
    return userId;
  });
}
