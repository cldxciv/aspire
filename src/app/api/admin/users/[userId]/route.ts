import type { NextRequest } from "next/server";

import { adminGetUser, adminUpdateUser } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { parseJsonBody, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { isRecordId } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";
import { updateUserBodySchema } from "@/lib/auth/schemas";

type Context = { params: Promise<{ userId: string }> };

/** GET /api/admin/users/:userId — one account (no password hash). Admin only. */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireAdmin(request, { write: false });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isRecordId(userId)) return portalApiError("bad_request", AUTH_MESSAGES.invalidUserId);
    const user = adminGetUser(userId);
    return user ? portalApiItem(user) : portalApiError("not_found", AUTH_MESSAGES.userNotFound);
  } catch (error) {
    return serverError("admin_users", error);
  }
}

/**
 * PATCH /api/admin/users/:userId — `{ disabled?: boolean, displayName?: string }`.
 * Same-origin, admin only. Disabling signs the user out everywhere. 403 when an admin
 * tries to disable themselves or the last active admin. Audited.
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireAdmin(request, { write: true });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isRecordId(userId)) return portalApiError("bad_request", AUTH_MESSAGES.invalidUserId);

    const body = await parseJsonBody(request, updateUserBodySchema);
    if (!body.ok) {
      authLog({ action: "admin_users", outcome: body.outcome, reason: body.reason });
      return body.response;
    }

    const result = adminUpdateUser(auth.session, userId, body.data);
    if (!result.ok) {
      switch (result.error) {
        case "not_found":
          return portalApiError("not_found", AUTH_MESSAGES.userNotFound);
        case "invalid_display_name":
          return portalApiError("validation", REQUEST_MESSAGES.validation, {
            fieldErrors: { displayName: [AUTH_MESSAGES.invalidDisplayName] },
          });
        case "self_disable":
          return portalApiError("forbidden", AUTH_MESSAGES.selfDisable);
        case "last_admin":
          return portalApiError("forbidden", AUTH_MESSAGES.lastAdmin);
      }
    }
    authLog({ action: "admin_users", outcome: "success" });
    return portalApiItem({ user: result.user, signedOutSessions: result.revokedSessions });
  } catch (error) {
    return serverError("admin_users", error);
  }
}
