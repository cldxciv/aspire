import type { NextRequest } from "next/server";
import { z } from "zod";

import { adminCreateUser, adminListUsers } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { parseJsonBody, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem, portalApiList } from "@/lib/auth/responses";
import { isRole } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { createUserBodySchema } from "@/lib/auth/schemas";
import { validateStaffInput, writeStaffMembership } from "@/lib/crm";
import { findAreasActive } from "@/lib/crm/repo/areas-core";
import { setUserAreas } from "@/lib/crm/routing";
import { staffAccountCrmSchema } from "@/lib/crm/schemas";
import { CRM_ROLES } from "@/lib/crm/types";
import { withPeopleCrm } from "@/lib/console/people";
import { CRM_ROLE_REQUIRED_MESSAGE } from "@/lib/console/people-types";
import { getDb } from "@/lib/db/connection";

/**
 * POST body: the core fields plus, for `staff` accounts, their CRM membership (M7) and areas (lead
 * routing §21). Admin console 1b (§5.L): the CRM role has NO default here; a staff login without
 * one is refused (422) instead of silently becoming "counsellor, every centre".
 */
const createBodySchema = createUserBodySchema.extend({
  crm: staffAccountCrmSchema.extend({ crmRole: z.enum(CRM_ROLES, { error: CRM_ROLE_REQUIRED_MESSAGE }).optional() }).optional(),
});

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
 * with parent↔student link ids and, for staff, `crm: { crmRole, centreSlugs, active, areaIds,
 * areaNames, awayUntil, openLeads } | null` (admin console 1b §5.L: lead routing's areas, "Away
 * until" while it lasts, open enquiries assigned to the person). Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, { write: false });
    if (!auth.ok) return auth.response;
    const role = request.nextUrl.searchParams.get("role");
    if (role !== null && !isRole(role)) return portalApiError("bad_request", AUTH_MESSAGES.invalidRoleFilter);
    return portalApiList(withPeopleCrm(adminListUsers(role ? { role } : {})));
  } catch (error) {
    return serverError("admin_users", error);
  }
}

/**
 * POST /api/admin/users — `{ role, displayName, loginId, crm? }`. Same-origin, admin only; a
 * `staff` (CRM) account needs a SUPER ADMIN (D-044, Q7: 403 otherwise). `crm`
 * (`{ crmRole: "counsellor" | "manager", centreSlugs?: string[], areaIds?: string[] }`) only for
 * `role: "staff"`, where `crm.crmRole` is REQUIRED (422 `{ crm: ["Choose the CRM role."] }`, checked
 * after the super-admin rule; admin console 1b §5.L); the account, its CRM membership and its
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
      // The CRM role is chosen on purpose, never defaulted (admin console 1b §5.L).
      if (!crm?.crmRole) {
        return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: { crm: [CRM_ROLE_REQUIRED_MESSAGE] } });
      }
      membership = validateStaffInput({ crmRole: crm.crmRole, centreSlugs: crm.centreSlugs ?? [], active: true });
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
    const [user] = withPeopleCrm([result.user]);
    return portalApiItem({ user, temporaryPassword: result.temporaryPassword }, { status: 201 });
  } catch (error) {
    return serverError("admin_users", error);
  }
}
