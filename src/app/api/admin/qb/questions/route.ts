import type { NextRequest } from "next/server";

import { parseQuestionFilters } from "@/components/qb-admin/filters";

import { parseQbBody, qbAdminLog, qbResponse, qbServerError, qbViewerCan, requireQbAdmin } from "../_lib/http";
import { questionInputSchema, withoutReviewerLabels } from "../_lib/schemas";
import { createQuestion, listQuestions } from "../_lib/services";

const ROUTE = "questions";

/**
 * GET /api/admin/qb/questions — the question list for any QB member (`view`). Query (all optional,
 * unknown values ignored): status (a status or `open`), subject, chapter, exam, difficulty (per
 * exam), source (official / aspire / sample), year, paper (`source_paper_key`), import, flag,
 * flagged (`with` / `blocking`), queue (to_review / flagged / calibration / wrong_key / hindi),
 * suspended, q (FTS5 trigram or LIKE), sort, page, pageSize (25 / 50 / 100).
 * → `QbQuestionPage`. Authors and reviewers see every subject; their subject scope limits edits.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return qbResponse(await listQuestions(auth.viewer, parseQuestionFilters(request.nextUrl.searchParams)));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * POST /api/admin/qb/questions — a hand-made draft (`edit_draft`): `QbQuestionInput` → 201
 * `QbQuestionDetail`. The service derives the subject from the chapter, runs the math check,
 * fingerprints it and sets flags (e.g. `source_incomplete` for an official source without an
 * import or evidence URL). Sample sources cannot be created here. `source.importId` is dropped
 * (server-owned), and an author's cross-exam / syllabus labels are dropped (reviewer labels).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "edit_draft", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, questionInputSchema, ROUTE);
    if (!body.ok) return body.response;
    const input = qbViewerCan(auth.viewer, "set_labels") ? body.data : { ...body.data, exams: withoutReviewerLabels(body.data.exams) };
    const result = await createQuestion(auth.viewer, input, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success");
    return qbResponse(result, { status: 201 });
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
