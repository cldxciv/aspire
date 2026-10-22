import type { NextRequest } from "next/server";

import { bodyLimit, crmLog, crmResponse, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { mergeAreas } from "@/lib/crm/routing/areas-service";
import { areaMergeSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.merge";

/**
 * POST /api/crm/areas/merge — `{ from, into, people: [{ userId, action: "move" | "remove" }] }` →
 * the merged-into `CrmArea`. Every person in `from` needs a choice (422 otherwise, L5). Super admin
 * only. Audited `crm.area_merge` (counts only).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, areaMergeSchema, ROUTE, bodyLimit("settings"));
    if (!body.ok) return body.response;
    const result = mergeAreas(auth.viewer, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
