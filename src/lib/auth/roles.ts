/**
 * Portal roles and the server-side session shape (docs/auth-and-portals.md).
 *
 * A `Session` only ever comes from `getSession()` (server-only), which in turn
 * only ever trusts a verified identity-provider session. Roles are NEVER read
 * from query strings, request headers, unsigned cookies or client state.
 */

export const ROLES = ["student", "parent", "admin"] as const;

export type Role = (typeof ROLES)[number];

export interface Session {
  /** Stable user id issued by the identity provider. */
  userId: string;
  role: Role;
  /**
   * Parent accounts only: learner ids this parent has been explicitly linked to
   * and authorised for by Aspire. Missing or empty means "no learners".
   */
  linkedStudentIds?: readonly string[];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Opaque record ids (user / learner): 1–64 chars of letters, digits, `_` or `-`. */
const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isRecordId(value: unknown): value is string {
  return typeof value === "string" && RECORD_ID.test(value);
}

/**
 * Structural check on a session object. Defence in depth: even a session from
 * the provider adapter is rejected (treated as signed out) if it is malformed.
 */
export function isValidSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (!isRecordId(s.userId) || !isRole(s.role)) return false;
  if (s.linkedStudentIds === undefined) return true;
  return Array.isArray(s.linkedStudentIds) && s.linkedStudentIds.every(isRecordId);
}
