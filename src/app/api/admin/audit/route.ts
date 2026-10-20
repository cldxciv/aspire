import type { NextRequest } from "next/server";

import { adminListAudit } from "@/lib/auth/accounts";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { portalApiError, portalApiList } from "@/lib/auth/responses";
import { isRecordId } from "@/lib/auth/roles";
import { requireAdmin, serverError } from "@/lib/auth/route-helpers";

/**
 * GET /api/admin/audit[?limit=1-200][&target=<userId>] — most recent audit entries first:
 * `{ id, actorId, action, target, createdAt, details }`. Details never hold secrets.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, { write: false });
    if (!auth.ok) return auth.response;

    const params = request.nextUrl.searchParams;
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return portalApiError("bad_request", "limit must be a whole number from 1 to 200.");
    }
    const target = params.get("target") ?? undefined;
    if (target !== undefined && !isRecordId(target)) return portalApiError("bad_request", AUTH_MESSAGES.invalidUserId);

    return portalApiList(
      adminListAudit({ limit, target }).map((entry) => ({ ...entry, createdAt: new Date(entry.createdAt).toISOString() })),
    );
  } catch (error) {
    return serverError("admin_users", error);
  }
}
