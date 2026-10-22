import type { NextRequest } from "next/server";

import { invalidId, isQbId, parseQbBody, qbAdminLog, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { chapterPatchSchema } from "../../_lib/schemas";
import { updateChapter } from "../../_lib/services";

const ROUTE = "chapter";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/qb/chapters/:id — edit a chapter (`manage_chapters`): labels, level, sort,
 * active, its unit mapping and per-exam status, and the subject (the biology block of a chapter
 * is staff-editable; the questions of that chapter follow, §B3). → `QbChapterView`; the service
 * events the change and rewrites the pool when eligibility changes.
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "manage_chapters", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const body = await parseQbBody(request, chapterPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = await updateChapter(auth.viewer, id, body.data, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success");
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
