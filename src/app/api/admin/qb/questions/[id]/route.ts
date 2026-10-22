import type { NextRequest } from "next/server";

import { invalidId, isQbId, parseQbBody, qbAdminLog, qbResponse, qbServerError, qbViewerCan, requireQbAdmin } from "../../_lib/http";
import { questionPatchSchema, withoutReviewerLabels } from "../../_lib/schemas";
import { getQuestion, updateQuestion } from "../../_lib/services";

const ROUTE = "question";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/qb/questions/:id — `QbQuestionDetail` (`view`): working copy, per-exam labels,
 * statistics, source (staff label), the original extraction for the fidelity diff, events,
 * versions, duplicates, key corrections and the server's own approval check.
 * `?spotCheck=<batchId>`: opening an item sampled by a bulk batch records the opening and returns
 * the signed one-time `spotToken` the commit needs (§B7).
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const spot = request.nextUrl.searchParams.get("spotCheck");
    if (spot !== null && !isQbId(spot)) return invalidId();
    return qbResponse(await getQuestion(auth.viewer, id, spot === null ? {} : { spotCheckBatchId: spot }));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * PATCH /api/admin/qb/questions/:id — edit (`edit_draft`; the service also needs `set_labels` for
 * live label changes on approved questions and checks the subject scope). `QbQuestionPatch` with
 * `baseVersion` + `baseUpdatedAt` (409 `stale` when someone saved meanwhile). Content edits after
 * approval create a new working version; papers keep the approved one until it is approved.
 * `source.importId` is dropped (server-owned), and an author's cross-exam / syllabus labels are
 * dropped so the stored values stay (reviewer labels).
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "edit_draft", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const body = await parseQbBody(request, questionPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    const patch =
      body.data.exams === undefined || qbViewerCan(auth.viewer, "set_labels") ? body.data : { ...body.data, exams: withoutReviewerLabels(body.data.exams) };
    const result = await updateQuestion(auth.viewer, id, patch, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success");
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
