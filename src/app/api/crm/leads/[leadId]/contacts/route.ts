import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { logContact } from "@/lib/crm";
import { CRM_API_MESSAGES, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrm } from "@/lib/crm/http";
import { contactSchema } from "@/lib/crm/schemas";

const ROUTE = "lead_contacts";

type Context = { params: Promise<{ leadId: string }> };

/**
 * POST /api/crm/leads/:leadId/contacts — `{ channel: "call" | "whatsapp", outcome, body? }` → 201
 * `LeadActivity`. Records what the staff member did via tel: / wa.me (D-041: nothing is sent).
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { leadId } = await ctx.params;
    if (!isCrmId(leadId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, contactSchema, ROUTE);
    if (!body.ok) return body.response;
    return crmResponse(logContact(auth.viewer, leadId, body.data, Date.now()), { status: 201 });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
