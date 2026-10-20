import type { NextRequest } from "next/server";

import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { createManualLead, listLeads } from "@/lib/crm";
import {
  crmLog,
  crmResponse,
  crmServerError,
  leadFiltersFromSearch,
  pagingFromSearch,
  parseCrmBody,
  requireCrm,
} from "@/lib/crm/http";
import { manualLeadSchema } from "@/lib/crm/schemas";

const ROUTE = "leads";

/**
 * GET /api/crm/leads — the inbox, scoped to the viewer (D-038). Query: stage (or `open`), centre
 * (slug or `none`), program, source, assignee (id, `me`, `unassigned`), due (`today`/`overdue`), q
 * (name or last 4+ phone digits), createdFrom, createdTo, sort, page, pageSize (≤ 100).
 * → `{ items: LeadSummary[], total, page, pageSize }`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const paging = pagingFromSearch(params);
    if (!paging) return portalApiError("bad_request", "page must be ≥ 1 and pageSize 1–100.");
    return portalApiItem(listLeads(auth.viewer, leadFiltersFromSearch(params), paging, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * POST /api/crm/leads — a lead entered by staff (walk-in, phone call, referral, other): `ManualLeadInput`.
 * 201 `{ leadId, isNew: true }`; 200 `{ leadId, isNew: false }` when the phone already has a lead.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, manualLeadSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = createManualLead(auth.viewer, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result, { status: result.ok && result.data.isNew ? 201 : 200 });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
