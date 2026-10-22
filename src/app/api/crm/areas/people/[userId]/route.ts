import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { setPersonAreas } from "@/lib/crm/routing/areas-service";
import { personAreasSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.person";

type Context = { params: Promise<{ userId: string }> };

/**
 * PUT /api/crm/areas/people/:userId — `{ areaIds }` → `AreaPerson`: one person's areas (the
 * `setUserAreas` seam). For an area head it also switches them to the explicit `areas` scope
 * ("Switch to areas" in the legacy-scope review, §13.5). Super admin only. Audited.
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isCrmId(userId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, personAreasSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = setPersonAreas(auth.viewer, userId, body.data.areaIds, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
