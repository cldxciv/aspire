import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { changeLeadArea } from "@/lib/crm/routing/areas-service";
import { leadAreaSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "lead_area";

type Context = { params: Promise<{ leadId: string }> };

/**
 * PATCH /api/crm/leads/:leadId/area — `{ areaId: string | null }` → `{ leadId, areaId, assigneeId }`.
 * A super admin, or a manager who can see the lead (404 when they cannot). An open lead whose
 * executive does not serve the new area is handed to someone there. Audited `crm.lead_reroute`.
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, leadAreaSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = changeLeadArea(auth.viewer, leadId, body.data.areaId, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    else crmLog(ROUTE, result.error === "forbidden" ? "forbidden" : "bad_request", result.error);
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
