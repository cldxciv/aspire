import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { eraseLead } from "@/lib/crm";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { eraseSchema } from "@/lib/crm/schemas";

const ROUTE = "lead_erase";

type Context = { params: Promise<{ leadId: string }> };

/**
 * POST /api/crm/leads/:leadId/erase — `{ confirm: true, reason? }` (reason: one of ERASE_REASONS,
 * kept on the erase entry and in the audit row). Admin only (D-042): wipes the lead's personal
 * data and keeps an anonymised stub. → `{ leadId, erasedAt }`. Idempotent. Audited.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, eraseSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = eraseLead(auth.viewer, leadId, Date.now(), { reason: body.data.reason ?? null });
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
