import type { NextRequest } from "next/server";

import { crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm, requireCrmSuperAdmin } from "@/lib/crm/http";
import { getRoutingMode, setRoutingMode } from "@/lib/crm/routing/areas-service";
import { routingModeSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "settings.routing";

/** GET /api/crm/settings/routing — `SettingEnvelope<RoutingSettings>` (areas | legacy). Area heads and admins. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return crmResponse(getRoutingMode(auth.viewer));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * PUT /api/crm/settings/routing — `{ mode, expectedVersion }` → the new envelope; 409 when someone
 * saved meanwhile. Super admin only. Audited `crm.settings_update { key, version }`.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, routingModeSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = setRoutingMode(auth.viewer, body.data.mode, body.data.expectedVersion, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
