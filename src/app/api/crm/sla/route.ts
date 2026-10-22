import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { crmResponse, crmServerError, requireCrm } from "@/lib/crm/http";
import { isSlaView, slaQueue } from "@/lib/crm/sla/views";

const ROUTE = "sla";

/**
 * GET /api/crm/sla?view=mine|area|escalated|unassigned|tool_signups — `SlaQueuePage`: open first
 * calls, earliest due first (masked phones). `mine` for everyone; `area` for area heads and admins;
 * the rest for super admins. A view beyond the viewer's role → 403 (parameters only narrow, M2).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const view = request.nextUrl.searchParams.get("view") ?? "mine";
    if (!isSlaView(view)) return portalApiError("bad_request", "view must be mine, area, escalated, unassigned or tool_signups.");
    return crmResponse(slaQueue(auth.viewer, view, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
