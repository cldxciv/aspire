import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { updateArea } from "@/lib/crm/routing/areas-service";
import { areaPatchSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.item";

type Context = { params: Promise<{ areaId: string }> };

/**
 * PATCH /api/crm/areas/:areaId — `{ nameEn?, nameHi?, defaultCentreSlug?, centres?, active?,
 * position? }` → `CrmArea`. Centres listed here move from any other area. Super admin only.
 * Audited `crm.area_update` (no names).
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { areaId } = await ctx.params;
    if (!isCrmId(areaId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, areaPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = updateArea(auth.viewer, areaId, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
