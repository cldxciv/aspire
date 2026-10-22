import type { NextRequest } from "next/server";

import { invalidId, isQbId, qbResponse, qbServerError, requireQbAdmin } from "../../../_lib/http";
import { blueprintPreviewStats } from "../../../_lib/services";

const ROUTE = "blueprint_preview_stats";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/qb/blueprints/:id/preview-stats?language=en|hi — the 100-seed preview statistics
 * for faculty review (§B9, R22; `view`): chapter and difficulty min / average / max per paper, the
 * most-used questions and how often a rule had to be relaxed. Cached per `bank.revision` by the
 * service; rate limited as heavy work.
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE, limit: "heavy" });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const language = request.nextUrl.searchParams.get("language") === "hi" ? "hi" : "en";
    return qbResponse(await blueprintPreviewStats(auth.viewer, id, { language }));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
