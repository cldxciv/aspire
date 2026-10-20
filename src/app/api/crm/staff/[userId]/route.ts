import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { upsertStaff } from "@/lib/crm";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { staffSchema } from "@/lib/crm/schemas";

const ROUTE = "staff_member";

type Context = { params: Promise<{ userId: string }> };

/**
 * PUT /api/crm/staff/:userId — `{ crmRole, centreSlugs?, active? }` → `CrmStaffMember`. Admin only.
 * The account must have the core role `staff` (create it via POST /api/admin/users). Audited.
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isCrmId(userId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, staffSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = upsertStaff(auth.viewer, userId, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
