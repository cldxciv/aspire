import type { NextRequest } from "next/server";

import { crmLog, crmResponse, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { rerouteOpenLeads } from "@/lib/crm/routing/areas-service";
import { emptyBodySchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.reroute";

/**
 * POST /api/crm/areas/reroute — `{}` → `{ checked, routed, assigned }`: open leads with no area are
 * resolved again from their stored place; open leads with nobody are assigned when someone is
 * free. Super admin only. Audited `crm.area_reroute` (counts).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, emptyBodySchema, ROUTE);
    if (!body.ok) return body.response;
    const result = rerouteOpenLeads(auth.viewer, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
