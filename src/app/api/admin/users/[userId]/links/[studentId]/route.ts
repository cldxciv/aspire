import type { NextRequest } from "next/server";

import { adminSetParentLink } from "@/lib/auth/accounts";
import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { isRecordId } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";

type Context = { params: Promise<{ userId: string; studentId: string }> };

async function setLink(request: NextRequest, ctx: Context, linked: boolean) {
  const auth = await requireAdmin(request, { write: true });
  if (!auth.ok) return auth.response;
  const { userId, studentId } = await ctx.params;
  if (!isRecordId(userId) || !isRecordId(studentId)) {
    return portalApiError("bad_request", AUTH_MESSAGES.invalidUserId);
  }

  const result = adminSetParentLink(auth.session, userId, studentId, linked);
  if (!result.ok) {
    switch (result.error) {
      case "parent_not_found":
      case "student_not_found":
        return portalApiError("not_found", AUTH_MESSAGES.userNotFound);
      case "not_a_parent":
        return portalApiError("validation", AUTH_MESSAGES.notAParent);
      case "not_a_student":
        return portalApiError("validation", AUTH_MESSAGES.notAStudent);
    }
  }
  authLog({ action: "admin_users", outcome: "success" });
  return portalApiItem({ parentId: userId, studentId, linked, changed: result.changed, parent: result.parent });
}

/**
 * PUT /api/admin/users/:parentId/links/:studentId — link a parent account to a student
 * account (idempotent). Same-origin, admin only. Audited when something changed.
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    return await setLink(request, ctx, true);
  } catch (error) {
    return serverError("admin_users", error);
  }
}

/** DELETE /api/admin/users/:parentId/links/:studentId — remove the link (idempotent). */
export async function DELETE(request: NextRequest, ctx: Context) {
  try {
    return await setLink(request, ctx, false);
  } catch (error) {
    return serverError("admin_users", error);
  }
}
