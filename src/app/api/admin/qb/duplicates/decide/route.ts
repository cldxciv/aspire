import type { NextRequest } from "next/server";

import { parseQbBody, qbAdminLog, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { duplicateDecisionSchema } from "../../_lib/schemas";
import { decideDuplicate } from "../../_lib/services";

const ROUTE = "duplicates_decide";

/**
 * POST /api/admin/qb/duplicates/decide — a reviewer's decision on a pair (`merge_duplicates`):
 * `{ a, b, decision, keep? }` → `QbDuplicateView`.
 *
 * - `duplicate`: merge — the other (by default the newer) row is rejected and its source is added
 *   to the kept question's `also_in` (exact matches only show publicly as "also asked in");
 * - `variant`: same cluster forever (never both in one paper), both kept;
 * - `distinct`: not related; the near-duplicate flag is cleared.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "merge_duplicates", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, duplicateDecisionSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = await decideDuplicate(auth.viewer, body.data, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success", body.data.decision);
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
