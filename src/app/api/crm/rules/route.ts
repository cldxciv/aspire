import type { NextRequest } from "next/server";

import { getAssignmentRules, setAssignmentRules } from "@/lib/crm";
import { crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { rulesSchema } from "@/lib/crm/schemas";

const ROUTE = "rules";

/** GET /api/crm/rules — auto-assignment rules in priority order. Admin / manager. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return crmResponse(getAssignmentRules(auth.viewer));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/** PUT /api/crm/rules — `{ rules: AssignmentRuleInput[] }` (≤ 50) replaces every rule. Admin only. Audited. */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, rulesSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = setAssignmentRules(auth.viewer, body.data.rules, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
