import type { NextRequest } from "next/server";

import { invalidId, isQbId, parseQbBody, QB_AUDIT, qbAdminLog, qbAudit, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { memberInputSchema } from "../../_lib/schemas";
import { upsertMember } from "../../_lib/services";

const ROUTE = "member";

type Context = { params: Promise<{ userId: string }> };

/**
 * PUT /api/admin/qb/members/:userId — add or change a membership (`manage_team`, admins):
 * `{ qbRole: "author" | "reviewer", subjects (empty = all), active }` → `QbMemberView`. The account
 * must have the core role `staff` (422 otherwise); admins need no membership. Audited (no names).
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "manage_team", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { userId } = await ctx.params;
    if (!isQbId(userId)) return invalidId();
    const body = await parseQbBody(request, memberInputSchema, ROUTE);
    if (!body.ok) return body.response;
    const now = Date.now();
    const result = await upsertMember(auth.viewer, userId, body.data, now);
    if (result.ok) {
      qbAudit(auth.viewer, {
        action: QB_AUDIT.memberUpsert,
        target: userId,
        details: { qbRole: body.data.qbRole, subjects: body.data.subjects.join(",") || "all", active: body.data.active },
        now,
      });
      qbAdminLog(ROUTE, "success");
    }
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
