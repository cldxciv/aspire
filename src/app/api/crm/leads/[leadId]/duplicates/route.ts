import type { NextRequest } from "next/server";
import { z } from "zod";

import { portalApiError } from "@/lib/auth/responses";
import { dismissDuplicate, findDuplicates } from "@/lib/crm/console/duplicates/duplicates";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";

const ROUTE = "lead_duplicates";

type Context = { params: Promise<{ leadId: string }> };

const dismissSchema = z
  .object({
    otherLeadId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { error: "Invalid id." }),
    action: z.literal("dismiss", { error: "Unknown action." }),
  })
  .strict();

/**
 * GET /api/crm/leads/:leadId/duplicates — up to 5 possible duplicates of a lead the viewer can see
 * (`DuplicateMatch[]`), found only among leads the viewer can see: an unseen lead is never
 * mentioned. Nothing merges. 404 unseen. (docs/admin-phase-1b-plan.md §5.F, §8.)
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    return crmResponse(findDuplicates(auth.viewer, leadId));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * POST /api/crm/leads/:leadId/duplicates `{ otherLeadId, action: "dismiss" }` — "Not the same
 * family": the pair is never suggested again. The viewer must see BOTH leads (404 otherwise) and be
 * an admin, a manager or the assignee of either (403). Audited `crm.duplicate_dismiss { otherLeadId }`.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, dismissSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = dismissDuplicate(auth.viewer, leadId, body.data.otherLeadId, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
