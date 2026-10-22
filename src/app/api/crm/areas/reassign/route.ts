import type { NextRequest } from "next/server";

import { crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { reassignLeads } from "@/lib/crm/routing/areas-service";
import { reassignSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.reassign";

/**
 * POST /api/crm/areas/reassign — `{ fromUserId, scope: "uncalled" | "open", toUserId? }` →
 * `{ moved, unassigned }`. A super admin for anyone; an area head only for members of their areas
 * and only leads they can see (the service decides; 403 otherwise). Audited `crm.bulk_reassign`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, reassignSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = reassignLeads(auth.viewer, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    else crmLog(ROUTE, result.error === "forbidden" ? "forbidden" : "bad_request", result.error);
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
