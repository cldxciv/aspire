import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { getLeadMoreDetails, updateLeadMoreDetails } from "@/lib/crm/console/details/details";
import { leadDetailsPatchSchema } from "@/lib/crm/console/details/schemas";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";

const ROUTE = "lead_details";

type Context = { params: Promise<{ leadId: string }> };

/**
 * GET /api/crm/leads/:leadId/details — the lead's "More details" (`LeadMoreDetails`, all null until
 * someone records them). Anyone who can see the lead; 404 otherwise (no existence leak). It
 * returns the full second number, so each read is audited `crm.lead_view` like the lead itself
 * (no values). (docs/admin-phase-1b-plan.md §5.E, §8.)
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    return crmResponse(getLeadMoreDetails(auth.viewer, leadId, { now: Date.now() }));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * PUT /api/crm/leads/:leadId/details — a PARTIAL, strict `LeadMoreDetails` (only the fields that
 * change; `null` clears one) → the saved `LeadMoreDetails`. 422 with field errors (a second number
 * that is not an Indian mobile or is the main number, a year or session out of range, an unknown
 * option); 404 unseen; 409 erased. Timeline `field_update { fields: ["details.x", …] }`, audit
 * `crm.lead_details_update { fields }` (names only, never values).
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, leadDetailsPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = updateLeadMoreDetails(auth.viewer, leadId, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
