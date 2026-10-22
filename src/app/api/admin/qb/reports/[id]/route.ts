import type { NextRequest } from "next/server";

import { invalidId, parseQbBody, qbAdminLog, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { reportPatchSchema } from "../../_lib/schemas";
import { updateReport } from "../../_lib/services";

const ROUTE = "report";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/qb/reports/:id — close a student report (`approve`, i.e. reviewers):
 * `{ status: "resolved" | "dismissed", note? }` → `QbReportView`. Fixing the question itself is a
 * separate edit or key correction; the service clears `student_report` when no open report is left.
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "approve", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!/^[1-9]\d{0,15}$/.test(id)) return invalidId();
    const body = await parseQbBody(request, reportPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = await updateReport(auth.viewer, Number(id), body.data, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success", body.data.status);
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
