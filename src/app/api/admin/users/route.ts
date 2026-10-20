import type { NextRequest } from "next/server";

import { adminCreateUser, adminListUsers, type PublicUser } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { parseJsonBody, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem, portalApiList } from "@/lib/auth/responses";
import { isRole } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";
import { createUserBodySchema } from "@/lib/auth/schemas";
import { staffMemberships, validateStaffInput, writeStaffMembership } from "@/lib/crm";
import { staffAccountCrmSchema } from "@/lib/crm/schemas";

/** POST body: the core fields plus, for `staff` accounts, their CRM membership (M7). */
const createBodySchema = createUserBodySchema.extend({ crm: staffAccountCrmSchema.optional() });

/** Adds the CRM membership to staff accounts (null when none yet). */
function withCrm(users: PublicUser[]): PublicUser[] {
  if (!users.some((user) => user.role === "staff")) return users;
  const memberships = staffMemberships();
  return users.map((user) => (user.role === "staff" ? { ...user, crm: memberships.get(user.id) ?? null } : user));
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
 * POST /api/admin/users — `{ role, displayName, loginId, crm? }`. Same-origin, admin only.
 * `crm` (`{ crmRole: "counsellor" | "manager", centreSlugs?: string[] }`) only for `role: "staff"`
 * (default: counsellor, every centre); the account and its CRM membership are created in one
 * transaction. 201 `{ user, temporaryPassword }`: the temporary password is generated server-side
 * and returned ONCE (it is not stored in clear anywhere); the user must change it at first sign-in.
 * 422 for an invalid or already-used login id. Audited.
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
    if (account.role === "staff") {
      membership = validateStaffInput({ crmRole: crm?.crmRole ?? "counsellor", centreSlugs: crm?.centreSlugs ?? [], active: true });
      if (!membership.ok) {
        return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: membership.fieldErrors });
      }
    }

    const now = Date.now();
    const result = await adminCreateUser(auth.session, account, now, {
      onCreated:
        membership?.ok === true
          ? (db, user) => writeStaffMembership(db, auth.session.userId, user.id, membership.value, now)
          : undefined,
    });
    if (!result.ok) {
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
