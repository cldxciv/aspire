import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { getLead, updateLead } from "@/lib/crm";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { leadPatchSchema } from "@/lib/crm/schemas";

const ROUTE = "lead";

type Context = { params: Promise<{ leadId: string }> };

/** GET /api/crm/leads/:leadId — `LeadDetail` (timeline + tasks). 404 when the viewer may not see it. Audited. */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    return crmResponse(getLead(auth.viewer, leadId, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * PATCH /api/crm/leads/:leadId — `{ stage?, lostReason?, assigneeId?, fields? }` → `LeadDetail`.
 * `lost` needs `lostReason` (422); `assigneeId` is admin / manager only (403); erased leads → 409.
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, leadPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = updateLead(auth.viewer, leadId, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
