import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { bodyLimit, CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { setAreaMembers } from "@/lib/crm/routing/areas-service";
import { areaMembersSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.members";

type Context = { params: Promise<{ areaId: string }> };

/**
 * PUT /api/crm/areas/:areaId/members — `{ members: [{ userId, centreSlug?, takesLeads? }] }` (≤ 200)
 * replaces the area's people → `CrmArea`. Area heads added here get the explicit `areas` scope.
 * Super admin only. Audited `crm.area_members` (counts only).
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { areaId } = await ctx.params;
    if (!isCrmId(areaId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, areaMembersSchema, ROUTE, bodyLimit("settings"));
    if (!body.ok) return body.response;
    const result = setAreaMembers(auth.viewer, areaId, body.data.members, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
