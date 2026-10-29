import type { NextRequest } from "next/server";

import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { createManualLead, leadFilterForbidden, listLeads } from "@/lib/crm";
import { CRM_MESSAGES } from "@/lib/crm/access";
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
 * (name or last 4+ phone digits), createdFrom, createdTo, sort, page, pageSize (≤ 100); lead routing
 * (§21): area (an area id, `none`, `tool_signups`; 403 outside an area head's areas) and sla
 * (`open` / `overdue` / `escalated`); admin console 1b (docs/admin-phase-1b-plan.md §4.3): contact
 * (`none` = no call or WhatsApp logged yet), signups (`hide` = leave out free-tool sign-ups) and
 * created (`today` / `week` / `over24h`, IST; replaces createdFrom/createdTo). `centre` matches the
 * EFFECTIVE centre (the lead's own, else its routing area's default centre; `none` = neither).
 * → `{ items: LeadSummary[], total, page, pageSize }`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const paging = pagingFromSearch(params);
    if (!paging) return portalApiError("bad_request", "page must be ≥ 1 and pageSize 1–100.");
    const filters = leadFiltersFromSearch(params);
    // Query parameters only narrow the viewer's scope (lead routing §13.5, M2).
    if (leadFilterForbidden(auth.viewer, filters)) {
      crmLog(ROUTE, "forbidden", "area_outside_scope");
      return portalApiError("forbidden", CRM_MESSAGES.forbidden);
    }
    return portalApiItem(listLeads(auth.viewer, filters, paging, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * POST /api/crm/leads — a lead entered by staff (walk-in, phone call, referral, other): `ManualLeadInput`.
 * 201 `{ leadId, isNew: true, canOpen }`; 200 `{ leadId, isNew: false, canOpen }` when the phone already
 * has a lead (this contact is added to it), or with `onDuplicate: "report"` 200
 * `{ leadId, isNew: false, duplicate: true, canOpen }` and nothing written.
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
