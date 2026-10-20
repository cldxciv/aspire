import type { NextRequest } from "next/server";

import { portalApiItem } from "@/lib/auth/responses";
import { crmPermissions } from "@/lib/crm";
import { crmServerError, requireCrm } from "@/lib/crm/http";

const ROUTE = "me";

/** GET /api/crm/me — `{ viewer, permissions }` for the signed-in CRM user (staff member or admin). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return portalApiItem({ viewer: auth.viewer, permissions: crmPermissions(auth.viewer) });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
