import type { NextRequest } from "next/server";

import { lostReview, lostReviewDays } from "@/lib/crm/console/lost/lost";
import { crmResponse, crmServerError, requireCrm } from "@/lib/crm/http";

const ROUTE = "lost_review";

/**
 * GET /api/crm/lost-review?days=7|14|30&assignee=<staff id|unassigned> — the lost enquiries waiting
 * for review (`LostReviewReport`: unreviewed lost events, newest first, and the lost reasons by
 * counsellor). Area heads (their scope) and admins; counsellors 403. Default 14 days.
 * (docs/admin-phase-1b-plan.md §5.H, §6.5, §8.)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    return crmResponse(lostReview(auth.viewer, { days: lostReviewDays(params.get("days")), assignee: params.get("assignee") }, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
