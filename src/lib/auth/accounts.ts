import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { listAudit, recordAudit, type AuditEntry } from "@/lib/db/audit";
import { getDb, withTransaction } from "@/lib/db/connection";
import {
  deleteParentLink,
  insertParentLink,
  listAllParentLinks,
  listLinkedStudents,
  type LinkedStudent,
} from "@/lib/db/links";
import { deleteUserSessions } from "@/lib/db/sessions";
import { hasActiveGrant } from "@/lib/db/super-admins";
import {
  countActiveAdmins,
  findUserById,
  findUserByLoginId,
  insertUser,
  listUsers,
  replacePasswordHash,
  setUserDisabled,
  setUserDisplayName,
  setUserPassword,
  type UserRecord,
} from "@/lib/db/users";

import { isValidDisplayName, isValidLoginId, normalizeDisplayName, normalizeLoginId } from "./identifiers";
import {
  checkPasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  needsRehash,
  PASSWORD_MAX_LENGTH,
  passwordLength,
  verifyAgainstDummy,
  verifyPassword,
  type PasswordPolicyIssue,
} from "./password";
import { STAFF_SIDE_ROLES, type Role, type Session } from "./roles";
import { createSession, revokeSessionToken, type NewSession } from "./sessions";
import { isLastSuperAdmin, isSuperAdmin } from "./super-admin";
import { checkAndRecordAttempt, clearAttempts, forgiveAttempt, PASSWORD_CHANGE_LIMIT, SIGN_IN_LIMITS } from "./throttle";

/**
 * Account service (D-029): sign-in, password change and admin user management.
 * Route handlers do the HTTP work (origin, body, role guard); everything that touches
 * credentials or writes an audit row lives here. Nothing returned from this module
 * contains a password hash; temporary passwords are returned exactly once, to the
 * admin request that generated them.
 */

export const AUDIT_ACTIONS = {
  login: "auth.login",
  logout: "auth.logout",
  passwordChange: "auth.password_change",
  userCreate: "admin.user_create",
  userDisable: "admin.user_disable",
  userEnable: "admin.user_enable",
  userRename: "admin.user_rename",
  passwordReset: "admin.password_reset",
  linkAdd: "admin.link_add",
  linkRemove: "admin.link_remove",
} as const;

// ---------------------------------------------------------------------------
// Public shapes (never include password hashes)
// ---------------------------------------------------------------------------

export interface PublicUser {
  id: string;
  role: Role;
  displayName: string;
  loginId: string;
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  /** Parents: linked learner ids (including disabled learners, for the admin view). */
  linkedStudentIds?: string[];
  /** Students: linked parent ids. */
  linkedParentIds?: string[];
  /** Staff (M7): CRM membership, added by the admin users API (null = none yet). */
  crm?: { crmRole: "counsellor" | "manager"; centreSlugs: string[]; active: boolean } | null;
}

type LinkMaps = { byParent: Map<string, string[]>; byStudent: Map<string, string[]> };

function loadLinkMaps(): LinkMaps {
  const byParent = new Map<string, string[]>();
  const byStudent = new Map<string, string[]>();
  for (const { parentId, studentId } of listAllParentLinks(getDb())) {
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), studentId]);
    byStudent.set(studentId, [...(byStudent.get(studentId) ?? []), parentId]);
  }
  return { byParent, byStudent };
}

export function toPublicUser(user: UserRecord, links: LinkMaps = loadLinkMaps()): PublicUser {
  const result: PublicUser = {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    loginId: user.loginId,
    disabled: user.disabled,
    mustChangePassword: user.mustChangePassword,
    createdAt: new Date(user.createdAt).toISOString(),
    updatedAt: new Date(user.updatedAt).toISOString(),
  };
  if (user.role === "parent") result.linkedStudentIds = links.byParent.get(user.id) ?? [];
  if (user.role === "student") result.linkedParentIds = links.byStudent.get(user.id) ?? [];
  return result;
}

// ---------------------------------------------------------------------------
// Sign-in / sign-out
// ---------------------------------------------------------------------------

export type SignInFailureReason = "unknown_user" | "bad_password" | "disabled" | "role_mismatch" | "too_long";

export type SignInResult =
  | { ok: true; user: UserRecord }
  | { ok: false; error: "invalid_credentials"; reason: SignInFailureReason }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/**
 * Whether the login page's tab `tab` accepts an account of `accountRole`. Learner tabs are exact;
 * the Admin and Staff tabs both accept admin and staff accounts (M7: before the Staff tab existed,
 * "staff" links opened the Admin tab). The session role always comes from the account record.
 */
export function signInTabAccepts(tab: Role, accountRole: Role): boolean {
  if (tab === accountRole) return true;
  return STAFF_SIDE_ROLES.includes(tab) && STAFF_SIDE_ROLES.includes(accountRole);
}

/**
 * Verifies credentials. Every failure (unknown id, wrong password, disabled account,
 * role mismatch) costs one scrypt verification and returns the same
 * `invalid_credentials` error, so neither the response nor its timing reveals which
 * accounts exist. `reason` is for server logs only.
 */
export async function signIn(input: {
  loginId: string;
  password: string;
  role?: Role;
  clientIp: string;
  now?: number;
}): Promise<SignInResult> {
  const now = input.now ?? Date.now();
  const loginId = normalizeLoginId(input.loginId);
  const db = getDb();

  const throttle = checkAndRecordAttempt(
    db,
    [
      { scope: "login", key: loginId, limit: SIGN_IN_LIMITS.perLoginId },
      { scope: "ip", key: input.clientIp, limit: SIGN_IN_LIMITS.perIp },
    ],
    now,
  );
  if (!throttle.allowed) return { ok: false, error: "rate_limited", retryAfterSeconds: throttle.retryAfterSeconds };

  const fail = (reason: SignInFailureReason): SignInResult => ({ ok: false, error: "invalid_credentials", reason });

  if (passwordLength(input.password) > PASSWORD_MAX_LENGTH) {
    await verifyAgainstDummy(input.password.slice(0, PASSWORD_MAX_LENGTH));
    return fail("too_long");
  }

  const candidate = findUserByLoginId(db, loginId);
  if (!candidate) {
    await verifyAgainstDummy(input.password);
    return fail("unknown_user");
  }
  if (!(await verifyPassword(input.password, candidate.passwordHash))) return fail("bad_password");

  // Re-read after the async hash: the account may have been disabled meanwhile.
  const user = findUserById(db, candidate.id);
  if (!user || user.disabled) return fail("disabled");
  if (input.role && !signInTabAccepts(input.role, user.role)) return fail("role_mismatch");

  forgiveAttempt(db, throttle.attemptIds);
  clearAttempts(db, "login", loginId);
  if (needsRehash(user.passwordHash)) replacePasswordHash(db, user.id, await hashPassword(input.password));
  return { ok: true, user };
}

/**
 * Opens a session for a signed-in user (rotating any session the browser already had)
 * and writes the audit row.
 */
export function startSession(
  user: UserRecord,
  options: { userAgent?: string | null; previousToken?: string | null; now?: number } = {},
): NewSession {
  const now = options.now ?? Date.now();
  if (options.previousToken) revokeSessionToken(options.previousToken);
  const created = createSession(user.id, { userAgent: options.userAgent, now });
  recordAudit(getDb(), { actorId: user.id, action: AUDIT_ACTIONS.login, target: user.id, now });
  return created;
}

/** Sign-out bookkeeping for a session that has been revoked. */
export function recordSignOut(userId: string, now: number = Date.now()): void {
  recordAudit(getDb(), { actorId: userId, action: AUDIT_ACTIONS.logout, target: userId, now });
}

// ---------------------------------------------------------------------------
// Own account
// ---------------------------------------------------------------------------

export interface AccountSummary {
  id: string;
  role: Role;
  displayName: string;
  loginId: string;
  mustChangePassword: boolean;
  /** Parents only: enabled learners linked to the account (display names only). */
  linkedStudents?: LinkedStudent[];
}

export function getAccountSummary(userId: string): AccountSummary | null {
  const db = getDb();
  const user = findUserById(db, userId);
  if (!user || user.disabled) return null;
  const summary: AccountSummary = {
    id: user.id,
    role: user.role,
    displayName: user.displayName,
    loginId: user.loginId,
    mustChangePassword: user.mustChangePassword,
  };
  if (user.role === "parent") summary.linkedStudents = listLinkedStudents(db, user.id);
  return summary;
}

/** Enabled learners linked to a parent: `{ id, displayName }` only. */
export function getLinkedStudents(parentId: string): LinkedStudent[] {
  return listLinkedStudents(getDb(), parentId);
}

/**
 * How many ENABLED parent accounts are linked to a student (shown on the student's own
 * dashboard). A count only: never the parents' names, ids or login ids.
 */
export function getLinkedParentCount(studentId: string): number {
  const db = getDb();
  let count = 0;
  for (const link of listAllParentLinks(db)) {
    if (link.studentId !== studentId) continue;
    const parent = findUserById(db, link.parentId);
    if (parent && !parent.disabled && parent.role === "parent") count += 1;
  }
  return count;
}

export type ChangePasswordResult =
  | { ok: true; revokedSessions: number }
  | { ok: false; error: "not_found" }
  | { ok: false; error: "policy"; issue: PasswordPolicyIssue }
  | { ok: false; error: "same_as_current" }
  | { ok: false; error: "wrong_current_password" }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number };

/**
 * Changes the signed-in user's password after re-checking the current one (throttled:
 * 5 wrong attempts per 10 minutes). On success the temporary-password flag is cleared
 * and every OTHER session of the user is revoked; the current one stays signed in.
 */
export async function changeOwnPassword(input: {
  userId: string;
  keepTokenHash: string;
  currentPassword: string;
  newPassword: string;
  now?: number;
}): Promise<ChangePasswordResult> {
  const now = input.now ?? Date.now();
  const db = getDb();
  const user = findUserById(db, input.userId);
  if (!user || user.disabled) return { ok: false, error: "not_found" };

  const issue = checkPasswordPolicy(input.newPassword, user.loginId);
  if (issue) return { ok: false, error: "policy", issue };
  if (input.newPassword.normalize("NFKC") === input.currentPassword.normalize("NFKC")) {
    return { ok: false, error: "same_as_current" };
  }

  const throttle = checkAndRecordAttempt(
    db,
    [{ scope: "pwchange", key: user.id, limit: PASSWORD_CHANGE_LIMIT }],
    now,
  );
  if (!throttle.allowed) return { ok: false, error: "rate_limited", retryAfterSeconds: throttle.retryAfterSeconds };
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return { ok: false, error: "wrong_current_password" };
  }
  forgiveAttempt(db, throttle.attemptIds);

  const passwordHash = await hashPassword(input.newPassword);
  const revokedSessions = withTransaction(db, () => {
    setUserPassword(db, user.id, passwordHash, false, now);
    const revoked = deleteUserSessions(db, user.id, { exceptTokenHash: input.keepTokenHash });
    recordAudit(db, {
      actorId: user.id,
      action: AUDIT_ACTIONS.passwordChange,
      target: user.id,
      details: { revokedSessions: revoked },
      now,
    });
    return revoked;
  });
  clearAttempts(db, "pwchange", user.id);
  return { ok: true, revokedSessions };
}

// ---------------------------------------------------------------------------
// Admin user management (callers must already hold requireRole("admin"))
// ---------------------------------------------------------------------------

export function adminListUsers(filter: { role?: Role } = {}): PublicUser[] {
  const links = loadLinkMaps();
  return listUsers(getDb(), filter).map((user) => toPublicUser(user, links));
}

export function adminGetUser(userId: string): PublicUser | null {
  const user = findUserById(getDb(), userId);
  return user ? toPublicUser(user) : null;
}

export function adminListAudit(options: { limit?: number; target?: string } = {}): AuditEntry[] {
  return listAudit(getDb(), { limit: options.limit ?? 50, target: options.target });
}

export type CreateUserResult =
  | { ok: true; user: PublicUser; temporaryPassword: string }
  | { ok: false; error: "invalid_login_id" | "invalid_display_name" | "login_id_taken" | "super_admin_only" };

class LoginIdTakenError extends Error {}

/**
 * Creates an account with a server-generated temporary password (returned once). `onCreated`
 * runs inside the same transaction (e.g. the CRM membership of a new `staff` account), so the
 * account and its extras are created together or not at all.
 */
export async function adminCreateUser(
  actor: Session,
  input: { role: Role; displayName: string; loginId: string },
  now: number = Date.now(),
  options: { onCreated?: (db: DatabaseSync, user: UserRecord) => void } = {},
): Promise<CreateUserResult> {
  const loginId = normalizeLoginId(input.loginId);
  if (!isValidLoginId(loginId)) return { ok: false, error: "invalid_login_id" };
  const displayName = normalizeDisplayName(input.displayName);
  if (!isValidDisplayName(displayName)) return { ok: false, error: "invalid_display_name" };

  const db = getDb();
  // D-044 / Q7: staff (CRM) logins are created by a super admin only.
  if (input.role === "staff" && !isSuperAdmin(actor.userId, db, now)) return { ok: false, error: "super_admin_only" };
  if (findUserByLoginId(db, loginId)) return { ok: false, error: "login_id_taken" };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const user = withTransaction(db, () => {
      if (findUserByLoginId(db, loginId)) throw new LoginIdTakenError();
      const created = insertUser(db, {
        role: input.role,
        displayName,
        loginId,
        passwordHash,
        mustChangePassword: true,
        now,
      });
      recordAudit(db, {
        actorId: actor.userId,
        action: AUDIT_ACTIONS.userCreate,
        target: created.id,
        details: { role: created.role, loginId: created.loginId },
        now,
      });
      options.onCreated?.(db, created);
      return created;
    });
    return { ok: true, user: toPublicUser(user), temporaryPassword };
  } catch (error) {
    if (error instanceof LoginIdTakenError) return { ok: false, error: "login_id_taken" };
    throw error;
  }
}

export type UpdateUserResult =
  | { ok: true; user: PublicUser; revokedSessions: number }
  | {
      ok: false;
      error: "not_found" | "invalid_display_name" | "self_disable" | "last_admin" | "super_admin_only" | "super_admin_target" | "last_super_admin";
    };

/**
 * Enables/disables an account and/or renames it. Disabling revokes all of the user's
 * sessions. An admin cannot disable themselves, and the last active admin can never be
 * disabled. All checks run before any write; the writes share one transaction.
 *
 * Super admin (D-044): staff (CRM) targets need a super-admin actor (`super_admin_only`, Q7); a
 * non-SA actor cannot rename, disable or ENABLE an account holding an active SA grant
 * (`super_admin_target`, H1) — a disabled SA with a live grant is an SA again once re-enabled; the
 * last effective SA can never be disabled (`last_super_admin`, checked before self_disable / last_admin).
 */
export function adminUpdateUser(
  actor: Session,
  targetId: string,
  changes: { disabled?: boolean; displayName?: string },
  now: number = Date.now(),
): UpdateUserResult {
  const db = getDb();
  return withTransaction(db, (): UpdateUserResult => {
    const target = findUserById(db, targetId);
    if (!target) return { ok: false, error: "not_found" };
    const actorIsSuperAdmin = isSuperAdmin(actor.userId, db, now);
    if (target.role === "staff" && !actorIsSuperAdmin) return { ok: false, error: "super_admin_only" };
    if (target.id !== actor.userId && !actorIsSuperAdmin && hasActiveGrant(db, target.id)) {
      return { ok: false, error: "super_admin_target" };
    }

    let displayName: string | undefined;
    if (changes.displayName !== undefined) {
      displayName = normalizeDisplayName(changes.displayName);
      if (!isValidDisplayName(displayName)) return { ok: false, error: "invalid_display_name" };
    }
    const disabling = changes.disabled === true && !target.disabled;
    const enabling = changes.disabled === false && target.disabled;
    if (disabling) {
      if (isLastSuperAdmin(db, target.id)) return { ok: false, error: "last_super_admin" };
      if (target.role === "admin" && countActiveAdmins(db) <= 1) return { ok: false, error: "last_admin" };
      if (target.id === actor.userId) return { ok: false, error: "self_disable" };
    }

    let revokedSessions = 0;
    if (displayName !== undefined && displayName !== target.displayName) {
      setUserDisplayName(db, target.id, displayName, now);
      recordAudit(db, {
        actorId: actor.userId,
        action: AUDIT_ACTIONS.userRename,
        target: target.id,
        details: { field: "displayName" },
        now,
      });
    }
    if (disabling) {
      setUserDisabled(db, target.id, true, now);
      revokedSessions = deleteUserSessions(db, target.id);
      recordAudit(db, {
        actorId: actor.userId,
        action: AUDIT_ACTIONS.userDisable,
        target: target.id,
        details: { role: target.role, revokedSessions },
        now,
      });
    } else if (enabling) {
      setUserDisabled(db, target.id, false, now);
      recordAudit(db, { actorId: actor.userId, action: AUDIT_ACTIONS.userEnable, target: target.id, now });
    }

    const updated = findUserById(db, target.id);
    if (!updated) return { ok: false, error: "not_found" };
    return { ok: true, user: toPublicUser(updated), revokedSessions };
  });
}

export type ResetPasswordResult =
  | { ok: true; user: PublicUser; temporaryPassword: string; revokedSessions: number }
  | { ok: false; error: "not_found" | "self_reset" | "super_admin_only" | "super_admin_target" };

/**
 * Issues a new temporary password (returned once), sets the must-change flag, revokes
 * all of the user's sessions and lifts any sign-in lockout on the account. Admins use
 * the normal password change for their own account.
 */
export async function adminResetPassword(
  actor: Session,
  targetId: string,
  now: number = Date.now(),
): Promise<ResetPasswordResult> {
  if (targetId === actor.userId) return { ok: false, error: "self_reset" };
  const db = getDb();
  const existing = findUserById(db, targetId);
  if (!existing) return { ok: false, error: "not_found" };
  // D-044: staff (CRM) logins are reset by a super admin only (Q7); a non-SA can never reset an
  // account holding an active SA grant, enabled or not (H1: that would hand over the account once it
  // is re-enabled). Recovery: the server command.
  const actorIsSuperAdmin = isSuperAdmin(actor.userId, db, now);
  if (existing.role === "staff" && !actorIsSuperAdmin) return { ok: false, error: "super_admin_only" };
  if (!actorIsSuperAdmin && hasActiveGrant(db, existing.id)) return { ok: false, error: "super_admin_target" };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const result = withTransaction(db, () => {
    const target = findUserById(db, targetId);
    if (!target) return null;
    setUserPassword(db, target.id, passwordHash, true, now);
    const revokedSessions = deleteUserSessions(db, target.id);
    clearAttempts(db, "login", target.loginId);
    recordAudit(db, {
      actorId: actor.userId,
      action: AUDIT_ACTIONS.passwordReset,
      target: target.id,
      details: { revokedSessions },
      now,
    });
    return { target, revokedSessions };
  });
  if (!result) return { ok: false, error: "not_found" };
  const updated = findUserById(db, targetId);
  if (!updated) return { ok: false, error: "not_found" };
  return { ok: true, user: toPublicUser(updated), temporaryPassword, revokedSessions: result.revokedSessions };
}

export type LinkResult =
  | { ok: true; changed: boolean; parent: PublicUser }
  | { ok: false; error: "parent_not_found" | "student_not_found" | "not_a_parent" | "not_a_student" };

/** Links (`linked: true`) or unlinks a parent account and a student account. */
export function adminSetParentLink(
  actor: Session,
  parentId: string,
  studentId: string,
  linked: boolean,
  now: number = Date.now(),
): LinkResult {
  const db = getDb();
  return withTransaction(db, (): LinkResult => {
    const parent = findUserById(db, parentId);
    if (!parent) return { ok: false, error: "parent_not_found" };
    if (parent.role !== "parent") return { ok: false, error: "not_a_parent" };
    const student = findUserById(db, studentId);
    if (!student) return { ok: false, error: "student_not_found" };
    if (student.role !== "student") return { ok: false, error: "not_a_student" };

    const changed = linked
      ? insertParentLink(db, { parentId, studentId, createdBy: actor.userId, now })
      : deleteParentLink(db, parentId, studentId);
    if (changed) {
      recordAudit(db, {
        actorId: actor.userId,
        action: linked ? AUDIT_ACTIONS.linkAdd : AUDIT_ACTIONS.linkRemove,
        target: parentId,
        details: { studentId },
        now,
      });
    }
    return { ok: true, changed, parent: toPublicUser(parent) };
  });
}
