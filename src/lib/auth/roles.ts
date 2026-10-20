/**
 * Portal roles and the server-side session shape (docs/auth-and-portals.md).
 *
 * A `Session` only ever comes from `getSession()` (server-only), which looks the
 * session cookie's token up in the server-side session store (D-029). Roles are
 * NEVER read from query strings, request headers, unsigned cookies or client state.
 */

/**
 * `staff` (M7, D-038): Aspire counsellors and centre managers. They can use only the CRM
 * (`/crm/**`, `/api/crm/**`); what they see there depends on their CRM membership
 * (`crm_staff`, src/lib/crm). Every other portal area and API denies them.
 */
export const ROLES = ["student", "parent", "admin", "staff"] as const;

export type Role = (typeof ROLES)[number];

/** Roles whose accounts work for Aspire (admin portal / CRM), as opposed to learners and families. */
export const STAFF_SIDE_ROLES: readonly Role[] = ["admin", "staff"];

export interface Session {
  /** Stable account id (`users.id`). */
  userId: string;
  role: Role;
  /**
   * Parent accounts only: learner ids this parent has been explicitly linked to
   * and authorised for by Aspire. Missing or empty means "no learners".
   */
  linkedStudentIds?: readonly string[];
  /** Name shown in the portal chrome (from the account record). */
  displayName?: string;
  /** The account's (lower-case) login id. Never used for authorisation. */
  loginId?: string;
  /**
   * True while the account still has an admin-issued temporary password. Guards deny
   * portal data until it is changed (policy.ts: `password_change_required`).
   */
  mustChangePassword?: boolean;
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
  if (s.displayName !== undefined && typeof s.displayName !== "string") return false;
  if (s.loginId !== undefined && typeof s.loginId !== "string") return false;
  if (s.mustChangePassword !== undefined && typeof s.mustChangePassword !== "boolean") return false;
  if (s.linkedStudentIds === undefined) return true;
  return Array.isArray(s.linkedStudentIds) && s.linkedStudentIds.every(isRecordId);
}
