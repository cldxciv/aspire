import "server-only";
import type { NextResponse } from "next/server";
import type { ApiError } from "@/lib/contracts/api";
import { authorizeRole, authorizeStudentRecord, type AuthDecision } from "./policy";
import { portalApiError } from "./responses";
import { isRecordId, type Role, type Session } from "./roles";
import { getSession } from "./session";

export type GuardResult = { ok: true; session: Session } | { ok: false; response: NextResponse<ApiError> };

function toGuardResult(decision: AuthDecision): GuardResult {
  return decision.ok ? decision : { ok: false, response: portalApiError(decision.error) };
}

/**
 * Route-handler guard. Resolves the verified session and allows it only if its
 * role is one of `roles`; otherwise returns a ready-made 401 `unauthenticated`
 * or 403 `forbidden` JSON envelope. Calling it with no roles denies everyone.
 *
 * ```ts
 * const auth = await requireRole("admin");
 * if (!auth.ok) return auth.response;
 * ```
 */
export async function requireRole(...roles: Role[]): Promise<GuardResult> {
  return toGuardResult(authorizeRole(await getSession(), roles));
}

/**
 * `requireRole` plus the record-level check for one learner: students only see
 * themselves, parents only learners in `linkedStudentIds`, everyone else is
 * denied. Authentication is checked before the id is validated so anonymous
 * callers always get 401; a malformed id from a signed-in caller gets 400.
 */
export async function requireStudentRecord(studentId: string, ...roles: Role[]): Promise<GuardResult> {
  const session = await getSession();
  const roleDecision = authorizeRole(session, roles);
  if (!roleDecision.ok) return toGuardResult(roleDecision);
  if (!isRecordId(studentId)) {
    return { ok: false, response: portalApiError("bad_request", "Invalid learner id.") };
  }
  return toGuardResult(authorizeStudentRecord(session, roles, studentId));
}
