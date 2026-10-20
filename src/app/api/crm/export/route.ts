import type { NextRequest } from "next/server";

import { privateApiHeaders } from "@/lib/auth/responses";
import { exportLeadsCsv } from "@/lib/crm";
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
    const result = exportLeadsCsv(auth.viewer, leadFiltersFromSearch(request.nextUrl.searchParams), Date.now());
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
