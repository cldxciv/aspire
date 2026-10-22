import type { NextRequest } from "next/server";

import { crmResponse, crmServerError, requireCrm } from "@/lib/crm/http";
import { resolvePlace } from "@/lib/crm/routing/areas-service";

const ROUTE = "areas.resolve";

/**
 * GET /api/crm/areas/resolve?q=&state= — "Test a place name" → `AreaResolution`. Area heads and
 * admins. Nothing is stored or logged (the typed place never reaches a log line).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const state = params.get("state");
    return crmResponse(resolvePlace(auth.viewer, (params.get("q") ?? "").slice(0, 120), state === null ? null : state.slice(0, 120), Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
