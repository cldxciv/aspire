import type { NextRequest } from "next/server";

import { portalApiError, privateApiHeaders } from "@/lib/auth/responses";
import { exportLeadsCsv, leadFilterForbidden } from "@/lib/crm";
import { CRM_MESSAGES } from "@/lib/crm/access";
import { crmLog, crmResponse, crmServerError, leadFiltersFromSearch, requireCrm } from "@/lib/crm/http";

const ROUTE = "export";

/**
 * GET /api/crm/export[?<inbox filters>] — CSV download (max 5000 rows, formula-injection safe).
 * Admin / manager only (403 otherwise), 10 per hour per user. Audited (`crm.export`).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, limit: "export", route: ROUTE });
    if (!auth.ok) return auth.response;
    const filters = leadFiltersFromSearch(request.nextUrl.searchParams);
    // Query parameters only narrow the viewer's scope (lead routing §13.5, M2).
    if (leadFilterForbidden(auth.viewer, filters)) {
      crmLog(ROUTE, "forbidden", "area_outside_scope");
      return portalApiError("forbidden", CRM_MESSAGES.forbidden);
    }
    const result = exportLeadsCsv(auth.viewer, filters, Date.now());
    if (!result.ok) return crmResponse(result);
    crmLog(ROUTE, "success");
    const headers = privateApiHeaders({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
      "X-Content-Type-Options": "nosniff",
    });
    return new Response(result.data.csv, { status: 200, headers });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
