import type { NextRequest } from "next/server";

import { bodyLimit, crmLog, crmResponse, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { setupFromCentre } from "@/lib/crm/routing/areas-service";
import { setupFromCentreSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.setup";

/**
 * POST /api/crm/areas/setup-from-centre — `{ centreSlug, headIds, executiveIds, headsTakeCalls }` →
 * `{ areaIds, heads, executives }`: the people join the centre's area and every area it serves (A1).
 * Super admin only. Audited `crm.area_setup_from_centre` (counts only).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, setupFromCentreSchema, ROUTE, bodyLimit("settings"));
    if (!body.ok) return body.response;
    const result = setupFromCentre(auth.viewer, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
