/**
 * Pure authorisation decisions. No I/O, no framework imports: everything here
 * is deny-by-default and unit-tested (policy.test.ts). Guards and the portal
 * page gate call these with the session from `getSession()`.
 */
import { isRecordId, isValidSession, type Role, type Session } from "./roles";

/**
 * `password_change_required`: signed in with the right role, but the account still
 * uses an admin-issued temporary password. Route guards answer 403; the account
 * endpoints under /api/auth (me, change-password, logout) do not use these checks.
 */
export type AuthFailure = "unauthenticated" | "forbidden" | "password_change_required";

export type AuthDecision = { ok: true; session: Session } | { ok: false; error: AuthFailure };

/**
 * Allows only a well-formed session whose role is in `allowed`.
 * No session (or a malformed one) → `unauthenticated`. Wrong role, or an empty
 * `allowed` list → `forbidden`. Right role but a pending temporary password →
 * `password_change_required`.
 */
export function authorizeRole(session: Session | null | undefined, allowed: readonly Role[]): AuthDecision {
  if (!isValidSession(session)) return { ok: false, error: "unauthenticated" };
  if (!allowed.includes(session.role)) return { ok: false, error: "forbidden" };
  if (session.mustChangePassword === true) return { ok: false, error: "password_change_required" };
  return { ok: true, session };
}

/**
 * Record-level check for a single learner's data.
 * - student: only their own record.
 * - parent: only learners explicitly linked to the account (`linkedStudentIds`).
 * - admin: denied until a staff permission model (e.g. centre-scoped access and
 *   audit logging) is agreed — see docs/auth-and-portals.md.
 */
export function canAccessStudentRecord(session: Session, studentId: string): boolean {
  if (!isValidSession(session) || !isRecordId(studentId)) return false;
  switch (session.role) {
    case "student":
      return session.userId === studentId;
    case "parent":
      return session.linkedStudentIds?.includes(studentId) ?? false;
    default:
      return false;
  }
}

/** `authorizeRole` followed by `canAccessStudentRecord`. */
export function authorizeStudentRecord(
  session: Session | null | undefined,
  allowed: readonly Role[],
  studentId: string,
): AuthDecision {
  const decision = authorizeRole(session, allowed);
  if (!decision.ok) return decision;
  if (!canAccessStudentRecord(decision.session, studentId)) return { ok: false, error: "forbidden" };
  return decision;
}

export type PortalPageDecision =
  | { kind: "session"; session: Session }
  | { kind: "preview" }
  | { kind: "deny"; error: AuthFailure };

/**
 * What a portal page may render:
 * 1. a verified session with the area's role → the real page (`session`);
 * 2. otherwise, if previews are enabled → the data-free preview shell;
 * 3. otherwise → deny (the caller redirects to /login).
 */
export function decidePortalPage(
  session: Session | null | undefined,
  role: Role,
  previewEnabled: boolean,
): PortalPageDecision {
  const decision = authorizeRole(session, [role]);
  if (decision.ok) return { kind: "session", session: decision.session };
  if (previewEnabled) return { kind: "preview" };
  return { kind: "deny", error: decision.error };
}
