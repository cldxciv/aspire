import type { NextRequest } from "next/server";

import { isOneOf, QB_ADMIN_EXAMS, QB_ADMIN_SUBJECTS } from "@/components/qb-admin/constants";
import { portalApiError } from "@/lib/auth/responses";

import { qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { coverage } from "../_lib/services";

const ROUTE = "coverage";

/**
 * GET /api/admin/qb/coverage?exam=JEE_MAIN[&subject=physics] — the bank for one exam (`view`) →
 * `QbCoverage`: approved questions per chapter and difficulty, drafts and in-review counts, the
 * figure backlog with per-chapter alerts, and the answer-position distribution per source kind
 * (option shuffling is phase 2; this shows whether any skew exists, R24).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const exam = params.get("exam");
    if (!isOneOf(QB_ADMIN_EXAMS, exam)) return portalApiError("bad_request", "exam must be JEE_MAIN, NEET, JEE_ADV or BOH.");
    const subject = params.get("subject");
    return qbResponse(await coverage(auth.viewer, { exam, subject: isOneOf(QB_ADMIN_SUBJECTS, subject) ? subject : undefined }));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
