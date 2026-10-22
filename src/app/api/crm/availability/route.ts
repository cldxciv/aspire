import type { NextRequest } from "next/server";

import { crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { setStaffAvailability } from "@/lib/crm/routing/areas-service";
import { availabilitySchema } from "@/lib/crm/routing/schemas";

const ROUTE = "availability";

/**
 * PUT /api/crm/availability — `{ userId, awayUntil: ISO | null, note? }` → `StaffAvailability`.
 * "Away until …" (A5): the person themselves, an area head for members of their areas, or a super
 * admin (403 otherwise); at most 60 days ahead. While away nobody gets new leads. Audited
 * `crm.availability` (never the note).
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, availabilitySchema, ROUTE);
    if (!body.ok) return body.response;
    const result = setStaffAvailability(auth.viewer, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    else crmLog(ROUTE, result.error === "forbidden" ? "forbidden" : "bad_request", result.error);
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
