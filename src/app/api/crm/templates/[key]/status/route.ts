import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { templateStatusSchema } from "@/lib/crm/console/templates/schemas";
import { setTemplateStatus } from "@/lib/crm/console/templates/templates";
import { TEMPLATE_KEY_PATTERN } from "@/lib/crm/console/types";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";

const ROUTE = "template_status";

type Context = { params: Promise<{ key: string }> };

/**
 * POST /api/crm/templates/:key/status — `{ status: "approved" | "retired" | "draft", expectedVersion }`
 * → `WaTemplate` (Approve / Retire / Back to draft). SUPER ADMINS ONLY (403). 409 on a stale version.
 * Audited `settings.template_status { key, status }`.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { key } = await ctx.params;
    if (!TEMPLATE_KEY_PATTERN.test(key)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, templateStatusSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = setTemplateStatus(auth.viewer, key, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
