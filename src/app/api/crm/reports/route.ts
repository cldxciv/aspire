import type { NextRequest } from "next/server";

import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { funnelReport, reportRange } from "@/lib/crm";
import { crmServerError, requireCrm } from "@/lib/crm/http";
import { parseTime } from "@/lib/crm/pure";

const ROUTE = "reports";

/** GET /api/crm/reports[?from=ISO&to=ISO] — `FunnelReport` for leads created in [from, to) (default: last 30 days). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const rawFrom = params.get("from");
    const rawTo = params.get("to");
    const from = rawFrom === null ? null : parseTime(rawFrom);
    const to = rawTo === null ? null : parseTime(rawTo);
    const range = (rawFrom !== null && from === null) || (rawTo !== null && to === null) ? null : reportRange(from, to, Date.now());
    if (!range) return portalApiError("bad_request", "from / to must be ISO dates, from before to, at most 3 years apart.");
    return portalApiItem(funnelReport(auth.viewer, range));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
