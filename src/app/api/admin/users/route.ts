import type { NextRequest } from "next/server";

import { adminCreateUser, adminListUsers, type PublicUser } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { parseJsonBody, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem, portalApiList } from "@/lib/auth/responses";
import { isRole } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { createUserBodySchema } from "@/lib/auth/schemas";
import { staffMemberships, validateStaffInput, writeStaffMembership } from "@/lib/crm";
import { findAreasActive } from "@/lib/crm/repo/areas-core";
import { setUserAreas } from "@/lib/crm/routing";
import { staffAccountCrmSchema } from "@/lib/crm/schemas";
import { getDb } from "@/lib/db/connection";

/** POST body: the core fields plus, for `staff` accounts, their CRM membership (M7) and areas (lead routing §21). */
const createBodySchema = createUserBodySchema.extend({ crm: staffAccountCrmSchema.optional() });

/** Adds the CRM membership to staff accounts (null when none yet). */
function withCrm(users: PublicUser[]): PublicUser[] {
  if (!users.some((user) => user.role === "staff")) return users;
  const memberships = staffMemberships();
  return users.map((user) => (user.role === "staff" ? { ...user, crm: memberships.get(user.id) ?? null } : user));
}

const AREA_MESSAGES = {
  unknown_area: "Choose areas from the list.",
  inactive_area: "That area is no longer in use.",
  not_staff: "Areas only apply to staff accounts.",
} as const;

/** `setUserAreas` refused inside the creating transaction: everything is rolled back. */
class AreaAssignmentError extends Error {
  constructor(readonly code: keyof typeof AREA_MESSAGES) {
    super(code);
    this.name = "AreaAssignmentError";
  }
}

/**
 * GET /api/admin/users[?role=student|parent|admin|staff] — every account (no password hashes),
 * with parent↔student link ids and, for staff, `crm: { crmRole, centreSlugs, active } | null`.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, { write: false });
    if (!auth.ok) return auth.response;
    const role = request.nextUrl.searchParams.get("role");
    if (role !== null && !isRole(role)) return portalApiError("bad_request", AUTH_MESSAGES.invalidRoleFilter);
    return portalApiList(withCrm(adminListUsers(role ? { role } : {})));
  } catch (error) {
    return serverError("admin_users", error);
  }
}

/**
 * POST /api/admin/users — `{ role, displayName, loginId, crm? }`. Same-origin, admin only; a
 * `staff` (CRM) account needs a SUPER ADMIN (D-044, Q7: 403 otherwise). `crm`
 * (`{ crmRole: "counsellor" | "manager", centreSlugs?: string[], areaIds?: string[] }`) only for
 * `role: "staff"` (default: counsellor, every centre); the account, its CRM membership and its
 * areas (`setUserAreas` seam; an unknown area → 422) are created in one transaction. 201
 * `{ user, temporaryPassword }`: the temporary password is generated server-side and returned ONCE
 * (it is not stored in clear anywhere); the user must change it at first sign-in. 422 for an
 * invalid or already-used login id. Audited.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, { write: true });
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody(request, createBodySchema);
    if (!body.ok) {
      authLog({ action: "admin_users", outcome: body.outcome, reason: body.reason });
      return body.response;
    }

    const { crm, ...account } = body.data;
    if (crm && account.role !== "staff") {
      return portalApiError("validation", REQUEST_MESSAGES.validation, {
        fieldErrors: { crm: ["CRM settings only apply to staff accounts."] },
      });
    }
    let membership: ReturnType<typeof validateStaffInput> | null = null;
    // `crm.areaIds` present (even empty) = the new flow: the seam always runs, so a manager created
    // with no areas gets an explicit `areas` scope (assigned leads only; §13.5) instead of the legacy
    // see-all. Absent = the legacy form: no area write.
    const areaIds = crm?.areaIds === undefined ? undefined : [...new Set(crm.areaIds)];
    if (account.role === "staff") {
      // Staff (CRM) logins are a super-admin action; checked before anything is validated or written.
      if (!isSuperAdmin(auth.session.userId)) {
        authLog({ action: "admin_users", outcome: "forbidden" });
        return portalApiError("forbidden", AUTH_MESSAGES.staffSuperAdminOnly);
      }
      membership = validateStaffInput({ crmRole: crm?.crmRole ?? "counsellor", centreSlugs: crm?.centreSlugs ?? [], active: true });
      if (!membership.ok) {
        return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: membership.fieldErrors });
      }
      const known = findAreasActive(getDb(), areaIds ?? []);
      const bad = (areaIds ?? []).find((id) => known.get(id) !== true);
      if (bad !== undefined) {
        return portalApiError("validation", REQUEST_MESSAGES.validation, {
          fieldErrors: { "crm.areaIds": [known.has(bad) ? AREA_MESSAGES.inactive_area : AREA_MESSAGES.unknown_area] },
        });
      }
    }

    const now = Date.now();
    let result: Awaited<ReturnType<typeof adminCreateUser>>;
    try {
      result = await adminCreateUser(auth.session, account, now, {
        onCreated:
          membership?.ok === true
            ? (db, user) => {
                writeStaffMembership(db, auth.session.userId, user.id, membership.value, now);
                if (areaIds !== undefined) {
                  const areas = setUserAreas(db, user.id, areaIds, { actorId: auth.session.userId, now });
                  if (!areas.ok) throw new AreaAssignmentError(areas.error);
                }
              }
            : undefined,
      });
    } catch (error) {
      if (error instanceof AreaAssignmentError) {
        return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: { "crm.areaIds": [AREA_MESSAGES[error.code]] } });
      }
      throw error;
    }
    if (!result.ok) {
      if (result.error === "super_admin_only") return portalApiError("forbidden", AUTH_MESSAGES.staffSuperAdminOnly);
      const fieldErrors: Record<string, string[]> =
        result.error === "invalid_display_name"
          ? { displayName: [AUTH_MESSAGES.invalidDisplayName] }
          : { loginId: [result.error === "login_id_taken" ? AUTH_MESSAGES.loginIdTaken : AUTH_MESSAGES.invalidLoginId] };
      return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors });
    }
    authLog({ action: "admin_users", outcome: "success" });
    const [user] = withCrm([result.user]);
    return portalApiItem({ user, temporaryPassword: result.temporaryPassword }, { status: 201 });
  } catch (error) {
    return serverError("admin_users", error);
  }
}
