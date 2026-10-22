import type { NextRequest } from "next/server";

import { invalidId, isQbId, qbResponse, qbServerError, requireQbAdmin } from "../../../_lib/http";
import { blueprintReadiness } from "../../../_lib/services";

const ROUTE = "blueprint_readiness";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/qb/blueprints/:id/readiness?language=en|hi — `QbReadiness` (`view`): full, short
 * or thin per language, supply per section and difficulty, `variety` (≈ papers before repeats)
 * and the ranked window status. Same allocation as the generator, without picking.
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const language = request.nextUrl.searchParams.get("language") === "hi" ? "hi" : "en";
    return qbResponse(await blueprintReadiness(auth.viewer, id, { language }));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
