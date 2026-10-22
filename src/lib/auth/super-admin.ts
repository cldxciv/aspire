import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { SuperAdminEntry, SuperAdminList } from "@/lib/crm/lead-ops-types";
import { recordAudit } from "@/lib/db/audit";
import { getDb, withTransaction } from "@/lib/db/connection";
import {
  anyGrantRows,
  bootstrapSingleAdmin,
  countEffectiveSuperAdmins,
  findGrant,
  isEffectiveSuperAdminRow,
  listActiveGrants,
  revokeGrant,
  SUPER_ADMIN_AUDIT_ACTIONS,
  upsertGrant,
} from "@/lib/db/super-admins";
import { findUserById } from "@/lib/db/users";

import type { GuardResult } from "./guards";
import { authLog } from "./log";
import { AUTH_MESSAGES } from "./messages";
import { verifyPassword } from "./password";
import { portalApiError } from "./responses";
import type { Session } from "./roles";
import { requireAdmin } from "./route-helpers";
import { checkAndRecordAttempt, forgiveAttempt } from "./throttle";

/**
 * Super admin (D-044; docs/lead-routing-plan.md §11). A super admin (SA) is an ADMIN account with an
 * active `superadmin_grants` row — not a role and not in the session — checked per request with
 * one indexed SELECT ("effective SA" = active grant + `role = 'admin'` + enabled).
 *
 * Bootstrap without a write lock (H5): `ensureSuperAdminBootstrap` returns at once once grants are
 * known for this database; otherwise a lock-free `EXISTS`; only with ZERO grant rows and EXACTLY ONE
 * enabled admin does it open a transaction and grant that admin (`bootstrap`, audited). Otherwise
 * nothing happens and every admin sees "run the server command" (SUPER_ADMIN_CLI).
 *
 * Invariant: at least one effective SA. Revoking the last one → `last_super_admin` (the check and
 * the update share one BEGIN IMMEDIATE, so two SAs revoking each other cannot leave zero). Grant
 * and revoke are SA-only and need the actor's current password (5 tries per 15 minutes).
 */

export const SUPER_ADMIN_AUDIT = SUPER_ADMIN_AUDIT_ACTIONS;

/** Databases on which grants are known to exist (per process; never set while the table is empty). */
const grantsKnown = new WeakSet<DatabaseSync>();

/** The one-time bootstrap rule (see the module comment). Cheap on the read path. */
export function ensureSuperAdminBootstrap(db: DatabaseSync = getDb(), now: number = Date.now()): void {
  if (grantsKnown.has(db)) return;
  if (anyGrantRows(db)) {
    grantsKnown.add(db);
    return;
  }
  if (bootstrapSingleAdmin(db, now)) grantsKnown.add(db);
}

/** Effective super admin (runs the bootstrap rule first). */
export function isSuperAdmin(userId: string, db: DatabaseSync = getDb(), now: number = Date.now()): boolean {
  ensureSuperAdminBootstrap(db, now);
  return isEffectiveSuperAdminRow(db, userId);
}

/** `userId` is an effective SA and no other effective SA exists. */
export function isLastSuperAdmin(db: DatabaseSync, userId: string): boolean {
  return isEffectiveSuperAdminRow(db, userId) && countEffectiveSuperAdmins(db) <= 1;
}

function toEntry(db: DatabaseSync, row: ReturnType<typeof listActiveGrants>[number]): SuperAdminEntry {
  return {
    userId: row.userId,
    displayName: row.displayName,
    loginId: row.loginId,
    via: row.via,
    grantedAt: new Date(row.grantedAt).toISOString(),
    grantedBy: row.grantedBy ? { userId: row.grantedBy, displayName: row.grantedByName ?? "" } : null,
    effective: isEffectiveSuperAdminRow(db, row.userId),
  };
}

/** Every active grant (admins may read it: names only, never a secret) and the viewer's status. */
export function listSuperAdmins(viewerId: string, db: DatabaseSync = getDb(), now: number = Date.now()): SuperAdminList {
  ensureSuperAdminBootstrap(db, now);
  const items = listActiveGrants(db).map((row) => toEntry(db, row));
  return {
    items,
    youAreSuperAdmin: isEffectiveSuperAdminRow(db, viewerId),
    bootstrapPending: !items.some((item) => item.effective),
  };
}

export type SuperAdminChangeError = "super_admin_only" | "wrong_password" | "rate_limited" | "not_found" | "not_admin" | "last_super_admin";
export type SuperAdminChangeResult =
  | { ok: true; changed: boolean; list: SuperAdminList }
  | { ok: false; error: Exclude<SuperAdminChangeError, "rate_limited"> }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/** Re-authentication for grant / revoke (and other SA-only secrets): 5 tries per 15 minutes. */
export const SUPER_ADMIN_REAUTH = { limit: 5, windowMs: 15 * 60 * 1000 } as const;

/**
 * Verifies the actor's CURRENT password before an SA-only change (L4). Throttled per account
 * (scope `pwchange`, key `sa:<userId>`); a correct password forgives its own attempt.
 */
export async function verifySuperAdminPassword(
  actorId: string,
  currentPassword: string,
  now: number = Date.now(),
): Promise<{ ok: true } | { ok: false; error: "wrong_password" | "not_found" } | { ok: false; error: "rate_limited"; retryAfterSeconds: number }> {
  const db = getDb();
  const actor = findUserById(db, actorId);
  if (!actor || actor.disabled) return { ok: false, error: "not_found" };
  const throttle = checkAndRecordAttempt(db, [{ scope: "pwchange", key: `sa:${actorId}`, limit: SUPER_ADMIN_REAUTH.limit }], now, SUPER_ADMIN_REAUTH.windowMs);
  if (!throttle.allowed) return { ok: false, error: "rate_limited", retryAfterSeconds: throttle.retryAfterSeconds };
  if (typeof currentPassword !== "string" || currentPassword.length === 0 || currentPassword.length > 1024) return { ok: false, error: "wrong_password" };
  if (!(await verifyPassword(currentPassword, actor.passwordHash))) return { ok: false, error: "wrong_password" };
  forgiveAttempt(db, throttle.attemptIds);
  return { ok: true };
}

/**
 * Grants (`superAdmin: true`) or revokes super admin on `targetId`. SA only; the actor's current
 * password is verified BEFORE the transaction. Grants go only to enabled admin accounts
 * (`not_admin`); revoking the last effective SA is refused (`last_super_admin`). An SA may revoke
 * themselves while another SA remains. Audited `{ via: "admin" }`.
 */
export async function setSuperAdmin(
  actor: Session,
  targetId: string,
  input: { superAdmin: boolean; currentPassword: string },
  now: number = Date.now(),
): Promise<SuperAdminChangeResult> {
  const db = getDb();
  if (!isSuperAdmin(actor.userId, db, now)) return { ok: false, error: "super_admin_only" };
  const password = await verifySuperAdminPassword(actor.userId, input.currentPassword, now);
  if (!password.ok) return password;
  const result = withTransaction(db, (): SuperAdminChangeResult | { ok: true; changed: boolean } => {
    // Re-check inside the write lock: the actor may have been revoked meanwhile.
    if (!isEffectiveSuperAdminRow(db, actor.userId)) return { ok: false, error: "super_admin_only" };
    const target = findUserById(db, targetId);
    if (!target) return { ok: false, error: "not_found" };
    if (input.superAdmin) {
      if (target.role !== "admin" || target.disabled) return { ok: false, error: "not_admin" };
      const changed = upsertGrant(db, { userId: target.id, via: "admin", by: actor.userId, now });
      if (changed) recordAudit(db, { actorId: actor.userId, action: SUPER_ADMIN_AUDIT.grant, target: target.id, details: { via: "admin" }, now });
      return { ok: true, changed };
    }
    const grant = findGrant(db, target.id);
    if (!grant || grant.revokedAt !== null) return { ok: true, changed: false };
    if (isLastSuperAdmin(db, target.id)) return { ok: false, error: "last_super_admin" };
    revokeGrant(db, target.id, actor.userId, now);
    recordAudit(db, { actorId: actor.userId, action: SUPER_ADMIN_AUDIT.revoke, target: target.id, details: { via: "admin" }, now });
    return { ok: true, changed: true };
  });
  if (!result.ok) return result;
  return { ok: true, changed: result.changed, list: listSuperAdmins(actor.userId, db, now) };
}

/** Convenience wrappers named as in the plan. */
export function grantSuperAdmin(actor: Session, targetId: string, currentPassword: string, now?: number) {
  return setSuperAdmin(actor, targetId, { superAdmin: true, currentPassword }, now);
}
export function revokeSuperAdmin(actor: Session, targetId: string, currentPassword: string, now?: number) {
  return setSuperAdmin(actor, targetId, { superAdmin: false, currentPassword }, now);
}

/**
 * Route guard for SA-only admin APIs: same-origin for writes, a signed-in admin (401 / 403), then an
 * EFFECTIVE super admin (403 "Only a super admin can do this."). The check is server-side on every
 * call; hiding a button is never the protection.
 */
export async function requireSuperAdmin(request: Request, options: { write: boolean }): Promise<GuardResult> {
  const auth = await requireAdmin(request, options);
  if (!auth.ok) return auth;
  if (!isSuperAdmin(auth.session.userId)) {
    authLog({ action: "admin_users", outcome: "forbidden" });
    return { ok: false, response: portalApiError("forbidden", AUTH_MESSAGES.superAdminOnly) };
  }
  return auth;
}
