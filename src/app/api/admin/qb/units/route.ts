import type { NextRequest } from "next/server";

import { isOneOf, QB_ADMIN_EXAMS } from "@/components/qb-admin/constants";
import { portalApiError } from "@/lib/auth/responses";

import { parseQbBody, QB_AUDIT, qbAdminLog, qbAudit, qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { unitInputSchema } from "../_lib/schemas";
import { listUnits, upsertUnit } from "../_lib/services";

const ROUTE = "units";

/**
 * GET /api/admin/qb/units?exam=JEE_MAIN — the exam's official syllabus units (names only, each
 * with its official source and page/section reference), the taxonomy confirmation status and the
 * gaps the seed could not transcribe (`view`) → `QbUnitsView`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const exam = request.nextUrl.searchParams.get("exam");
    if (!isOneOf(QB_ADMIN_EXAMS, exam)) return portalApiError("bad_request", "exam must be JEE_MAIN, NEET, JEE_ADV or BOH.");
    return qbResponse(await listUnits(auth.viewer, exam));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * POST /api/admin/qb/units — add or correct an official unit (`confirm_taxonomy`, admins only:
 * units are transcriptions of official documents). The source must be an official URL
 * (nta.ac.in, *.nta.nic.in, nmc.org.in, jeeadv.ac.in, ncert.nic.in). → `QbUnitView`. Audited.
 * Changing a confirmed exam's units leaves it confirmed; the service records the change.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "confirm_taxonomy", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, unitInputSchema, ROUTE);
    if (!body.ok) return body.response;
    const now = Date.now();
    const result = await upsertUnit(auth.viewer, body.data, now);
    if (result.ok) {
      qbAudit(auth.viewer, {
        action: QB_AUDIT.unitUpsert,
        target: result.data.id,
        details: { exam: result.data.exam, syllabusYear: result.data.syllabusYear, status: result.data.status, created: body.data.id === undefined },
        now,
      });
      qbAdminLog(ROUTE, "success");
    }
    return qbResponse(result, { status: body.data.id === undefined ? 201 : 200 });
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
