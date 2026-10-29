import type { NextRequest } from "next/server";

import { listTemplates } from "@/lib/crm/console/templates/templates";
import { crmResponse, crmServerError, requireCrm } from "@/lib/crm/http";

const ROUTE = "templates";

/**
 * GET /api/crm/templates?context=general — the APPROVED staff WhatsApp templates of that context
 * (everyone in the CRM; the composer offers only these). `?all=1` — every template of every context
 * and status (area heads, admins and super admins; counsellors 403). Missing seed drafts are added on
 * the first read. (docs/admin-phase-1b-plan.md §5.D, §8.)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const all = params.get("all") === "1";
    return crmResponse(listTemplates(auth.viewer, { context: params.get("context"), all }, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
