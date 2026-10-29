import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { followUpContext } from "@/lib/crm/console/followup/context";
import { recordOutcome } from "@/lib/crm/console/followup/outcome";
import { outcomeInputSchema } from "@/lib/crm/console/followup/schemas";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";

const ROUTE = "lead_outcome";

type Context = { params: Promise<{ leadId: string }> };

/**
 * GET /api/crm/leads/:leadId/outcome[?taskId=] — `FollowUpContextView` for the call dialog and the
 * WhatsApp composer (presets, the suggestion's inputs, attempts, other open task, calling hours,
 * template slot values). A read: no transaction, no audit. 404 when the viewer may not see the lead;
 * 409 once it is erased. (docs/admin-phase-1b-plan.md §5.C, §8.)
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const taskId = request.nextUrl.searchParams.get("taskId");
    if (taskId !== null && !isCrmId(taskId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    return crmResponse(await followUpContext(auth.viewer, leadId, Date.now(), { taskId }));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * POST /api/crm/leads/:leadId/outcome — `OutcomeInput` → `OutcomeResult`. One atomic write: tick the
 * task off → create the chosen follow-up → log the call / WhatsApp the staff member made themselves
 * (nothing is sent, D-041) → optional "lost" mark. 422 with field errors (no follow-up chosen, a time
 * outside 08:00–21:00 IST, a task of another lead, a template that is not approved); 404 unseen lead.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, outcomeInputSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = recordOutcome(auth.viewer, leadId, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result, { status: 201 });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
