import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { createTask } from "@/lib/crm";
import { CRM_API_MESSAGES, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { taskSchema } from "@/lib/crm/schemas";

const ROUTE = "lead_tasks";

type Context = { params: Promise<{ leadId: string }> };

/** POST /api/crm/leads/:leadId/tasks — `{ title, dueAt (ISO), assigneeId? }` → 201 `LeadTask`. */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, taskSchema, ROUTE);
    if (!body.ok) return body.response;
    return crmResponse(createTask(auth.viewer, leadId, body.data, Date.now()), { status: 201 });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
