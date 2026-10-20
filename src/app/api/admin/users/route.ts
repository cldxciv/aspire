import type { NextRequest } from "next/server";

import { adminCreateUser, adminListUsers } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { parseJsonBody, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem, portalApiList } from "@/lib/auth/responses";
import { isRole } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";
import { createUserBodySchema } from "@/lib/auth/schemas";

/**
 * GET /api/admin/users[?role=student|parent|admin] — every account (no password hashes),
 * with parent↔student link ids. Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, { write: false });
    if (!auth.ok) return auth.response;
    const role = request.nextUrl.searchParams.get("role");
    if (role !== null && !isRole(role)) return portalApiError("bad_request", AUTH_MESSAGES.invalidRoleFilter);
    return portalApiList(adminListUsers(role ? { role } : {}));
  } catch (error) {
    return serverError("admin_users", error);
  }
}

/**
 * POST /api/admin/users — `{ role, displayName, loginId }`. Same-origin, admin only.
 * 201 `{ user, temporaryPassword }`: the temporary password is generated server-side and
 * returned ONCE (it is not stored in clear anywhere); the user must change it at first
 * sign-in. 422 for an invalid or already-used login id. Audited.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, { write: true });
    if (!auth.ok) return auth.response;

    const body = await parseJsonBody(request, createUserBodySchema);
    if (!body.ok) {
      authLog({ action: "admin_users", outcome: body.outcome, reason: body.reason });
      return body.response;
    }

    const result = await adminCreateUser(auth.session, body.data);
    if (!result.ok) {
      const fieldErrors: Record<string, string[]> =
        result.error === "invalid_display_name"
          ? { displayName: [AUTH_MESSAGES.invalidDisplayName] }
          : { loginId: [result.error === "login_id_taken" ? AUTH_MESSAGES.loginIdTaken : AUTH_MESSAGES.invalidLoginId] };
      return portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors });
    }
    authLog({ action: "admin_users", outcome: "success" });
    return portalApiItem({ user: result.user, temporaryPassword: result.temporaryPassword }, { status: 201 });
  } catch (error) {
    return serverError("admin_users", error);
  }
}
