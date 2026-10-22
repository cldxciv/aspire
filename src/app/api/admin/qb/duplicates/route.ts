import type { NextRequest } from "next/server";

import { isOneOf, QB_ADMIN_SUBJECTS } from "@/components/qb-admin/constants";
import { portalApiError } from "@/lib/auth/responses";

import { pagingFromSearch, QB_ADMIN_MESSAGES, qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { listDuplicates } from "../_lib/services";

const ROUTE = "duplicates";
const STATUSES = ["open", "duplicate", "variant", "distinct"] as const;

/**
 * GET /api/admin/qb/duplicates?status=open&subject=…&page=… — duplicate and near-duplicate pairs
 * (`view`) → `QbPage<QbDuplicateView>`, both questions side by side. Exact fingerprint matches block
 * approval (`exact_duplicate`); near matches (MinHash Jaccard ≥ 0.8) are a non-blocking flag.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const paging = pagingFromSearch(params);
    if (!paging) return portalApiError("bad_request", QB_ADMIN_MESSAGES.badPaging);
    const status = params.get("status");
    const subject = params.get("subject");
    return qbResponse(
      await listDuplicates(auth.viewer, {
        status: isOneOf(STATUSES, status) ? status : "open",
        subject: isOneOf(QB_ADMIN_SUBJECTS, subject) ? subject : undefined,
        ...paging,
      }),
    );
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
