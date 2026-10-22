import type { NextRequest } from "next/server";

import { isOneOf } from "@/components/qb-admin/constants";
import { QB_REPORT_STATUSES } from "@/components/qb-admin/contract";
import { portalApiError } from "@/lib/auth/responses";

import { pagingFromSearch, QB_ADMIN_MESSAGES, qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { listReports } from "../_lib/services";

const ROUTE = "reports";

/**
 * GET /api/admin/qb/reports?status=open&page=… — students' "Report a problem" notes (`view`) →
 * `QbPage<QbReportView>`. Reports hold no account or IP (§B10.5); nothing changes automatically.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const paging = pagingFromSearch(params);
    if (!paging) return portalApiError("bad_request", QB_ADMIN_MESSAGES.badPaging);
    const status = params.get("status");
    return qbResponse(await listReports(auth.viewer, { status: isOneOf(QB_REPORT_STATUSES, status) ? status : "open", ...paging }));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
