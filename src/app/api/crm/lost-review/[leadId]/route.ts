import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { reviewLost } from "@/lib/crm/console/lost/lost";
import { lostReviewInputSchema } from "@/lib/crm/console/lost/schemas";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";

const ROUTE = "lost_review_decide";

type Context = { params: Promise<{ leadId: string }> };

/**
 * POST /api/crm/lost-review/:leadId `{ lostAt, decision: "kept" | "reopened", reopenTo?, assigneeId?,
 * followUp? }` — keep one lost event lost, or reopen the enquiry (one atomic write: stage back →
 * optional new assignee → a follow-up task → the review). Area heads and admins; counsellors 403;
 * 404 unseen lead or unknown event; 409 erased, no longer lost or already reviewed; 422 a follow-up
 * outside 08:00–21:00 IST or a person who cannot take the enquiry. Audited `crm.lost_review { decision }`.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, lostReviewInputSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = reviewLost(auth.viewer, leadId, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
