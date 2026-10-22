import type { NextRequest } from "next/server";

import { crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm, requireCrmSuperAdmin } from "@/lib/crm/http";
import { createArea, listAreas } from "@/lib/crm/routing/areas-service";
import { areaCreateSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas";

/**
 * GET /api/crm/areas — every area (`CrmArea[]`: names, serving centre, centres, place names,
 * people, coverage badges). Area heads and admins; counsellors 403. The 12 districts are seeded on
 * the first call (docs/lead-routing-plan.md §13.1).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return crmResponse(listAreas(auth.viewer, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * POST /api/crm/areas — `{ id?, nameEn, nameHi, defaultCentreSlug? }` → 201 `CrmArea` (kind
 * `custom`). Super admin only; 409 when the id is taken. Audited `crm.area_create`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, areaCreateSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = createArea(auth.viewer, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result, { status: result.ok ? 201 : 200 });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
