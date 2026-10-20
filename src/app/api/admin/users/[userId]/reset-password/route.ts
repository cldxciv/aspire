import type { NextRequest } from "next/server";

import { adminResetPassword } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { isRecordId } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";

type Context = { params: Promise<{ userId: string }> };

/**
 * POST /api/admin/users/:userId/reset-password — no body. Same-origin, admin only.
 * 200 `{ user, temporaryPassword }`: a new server-generated temporary password, returned
 * ONCE. The user's sessions are all revoked, any sign-in lockout is lifted and they must
 * choose a new password at next sign-in. Admins cannot reset their own password here
 * (403; use /api/auth/change-password). Audited.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireAdmin(request, { write: true });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isRecordId(userId)) return portalApiError("bad_request", AUTH_MESSAGES.invalidUserId);

    const result = await adminResetPassword(auth.session, userId);
    if (!result.ok) {
      return result.error === "self_reset"
        ? portalApiError("forbidden", AUTH_MESSAGES.selfReset)
        : portalApiError("not_found", AUTH_MESSAGES.userNotFound);
    }
    authLog({ action: "admin_users", outcome: "success" });
    return portalApiItem({
      user: result.user,
      temporaryPassword: result.temporaryPassword,
      signedOutSessions: result.revokedSessions,
    });
  } catch (error) {
    return serverError("admin_users", error);
  }
}
