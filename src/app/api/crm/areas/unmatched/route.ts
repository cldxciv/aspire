import type { NextRequest } from "next/server";

import { crmResponse, crmServerError, requireCrmSuperAdmin } from "@/lib/crm/http";
import { listUnmatchedPlaces } from "@/lib/crm/routing/unmatched";

const ROUTE = "areas.unmatched";

/**
 * GET /api/crm/areas/unmatched — `UnmatchedPlace[]`: the top 50 place names (last 90 days) that
 * routed nowhere, with one example each. SUPER ADMINS only: the examples are families' own words.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return crmResponse(listUnmatchedPlaces(auth.viewer, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
