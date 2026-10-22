import type { NextRequest } from "next/server";
import { z } from "zod";

import { authLog } from "@/lib/auth/log";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { parseJsonBody, REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { isRecordId } from "@/lib/auth/roles";
import { serverError } from "@/lib/auth/route-helpers";
import { requireSuperAdmin, setSuperAdmin } from "@/lib/auth/super-admin";

type Context = { params: Promise<{ userId: string }> };

const bodySchema = z
  .object({
    superAdmin: z.boolean({ error: "superAdmin must be true or false." }),
    currentPassword: z.string({ error: "Enter your current password." }).min(1, { error: "Enter your current password." }).max(1024),
  })
  .strict();

/**
 * PUT /api/admin/super-admins/:userId — `{ superAdmin: boolean, currentPassword }` → the list
 * (`SuperAdminList`). SUPER ADMIN only (403 otherwise), same-origin, and the actor's CURRENT
 * password is re-checked first (5 tries per 15 minutes; 422 when wrong, 429 when throttled).
 * 422 `not_admin`: only enabled admin accounts can be granted. 409 `last_super_admin`: at least
 * one super admin must remain (the check and the change share one write transaction). A super
 * admin may revoke themselves while another remains. Audited `auth.super_admin_grant` /
 * `auth.super_admin_revoke` with `{ via: "admin" }`.
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireSuperAdmin(request, { write: true });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isRecordId(userId)) return portalApiError("bad_request", AUTH_MESSAGES.invalidUserId);
    const body = await parseJsonBody(request, bodySchema);
    if (!body.ok) {
      authLog({ action: "admin_users", outcome: body.outcome, reason: body.reason });
      return body.response;
    }
    const result = await setSuperAdmin(auth.session, userId, body.data);
    if (!result.ok) {
      authLog({ action: "admin_users", outcome: result.error === "wrong_password" ? "failed" : "forbidden" });
      switch (result.error) {
        case "super_admin_only":
          return portalApiError("forbidden", AUTH_MESSAGES.superAdminOnly);
        case "wrong_password":
          return portalApiError("validation", REQUEST_MESSAGES.validation, {
            fieldErrors: { currentPassword: [AUTH_MESSAGES.wrongCurrentPassword] },
          });
        case "rate_limited":
          return portalApiError("rate_limited", AUTH_MESSAGES.rateLimited(result.retryAfterSeconds), {
            headers: { "Retry-After": String(result.retryAfterSeconds) },
          });
        case "not_found":
          return portalApiError("not_found", AUTH_MESSAGES.userNotFound);
        case "not_admin":
          return portalApiError("validation", AUTH_MESSAGES.notAdmin, { fieldErrors: { superAdmin: [AUTH_MESSAGES.notAdmin] } });
        case "last_super_admin":
          return portalApiError("bad_request", AUTH_MESSAGES.lastSuperAdmin, { status: 409 });
      }
    }
    authLog({ action: "admin_users", outcome: "success" });
    return portalApiItem(result.list);
  } catch (error) {
    return serverError("admin_users", error);
  }
}
