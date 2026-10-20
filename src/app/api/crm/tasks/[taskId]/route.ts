import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { completeTask } from "@/lib/crm";
import { CRM_API_MESSAGES, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { taskPatchSchema } from "@/lib/crm/schemas";

const ROUTE = "task";

type Context = { params: Promise<{ taskId: string }> };

/** PATCH /api/crm/tasks/:taskId — `{ done: true }` → `LeadTask` (idempotent). */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { taskId } = await ctx.params;
    if (!isCrmId(taskId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, taskPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    return crmResponse(completeTask(auth.viewer, taskId, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
