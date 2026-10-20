import type { NextRequest } from "next/server";

import { listStaff } from "@/lib/crm";
import { crmResponse, crmServerError, requireCrm } from "@/lib/crm/http";

const ROUTE = "staff";

/** GET /api/crm/staff — CRM members (`CrmStaffMember[]`; login ids for admins only). Admin / manager. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return crmResponse(listStaff(auth.viewer));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
