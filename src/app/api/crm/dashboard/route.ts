import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { dashboardData, dashboardRange } from "@/lib/crm/dashboard";
import { crmResponse, crmServerError, isCrmId, requireCrm } from "@/lib/crm/http";
import { parseTime } from "@/lib/crm/pure";

const ROUTE = "dashboard";

/**
 * GET /api/crm/dashboard[?from=ISO&to=ISO&area=<id>&lang=hi] — `DashboardData`: first calls now,
 * first-call speed of clocks started in [from, to) (default: the last 30 days, at most 366), by
 * area, executive, source and campaign. Area heads see their areas (`area` outside them → 403);
 * admins and super admins see everything; counsellors get 403.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const rawFrom = params.get("from");
    const rawTo = params.get("to");
    const from = rawFrom === null ? null : parseTime(rawFrom);
    const to = rawTo === null ? null : parseTime(rawTo);
    const range = (rawFrom !== null && from === null) || (rawTo !== null && to === null) ? null : dashboardRange(from, to, Date.now());
    if (!range) return portalApiError("bad_request", "from / to must be ISO dates, from before to, at most 366 days apart.");
    const area = params.get("area");
    if (area !== null && area !== "" && !isCrmId(area)) return portalApiError("bad_request", "Invalid area.");
    const lang = params.get("lang") === "hi" ? "hi" : "en";
    return crmResponse(dashboardData(auth.viewer, { ...range, area: area || null }, Date.now(), { lang }));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
