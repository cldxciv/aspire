import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { templateEditSchema } from "@/lib/crm/console/templates/schemas";
import { editTemplate } from "@/lib/crm/console/templates/templates";
import { TEMPLATE_KEY_PATTERN } from "@/lib/crm/console/types";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";

const ROUTE = "template_edit";

type Context = { params: Promise<{ key: string }> };

/**
 * PUT /api/crm/templates/:key — `{ lang, body, expectedVersion }` → `WaTemplate`. SUPER ADMINS ONLY
 * (403 otherwise, enforced here). One language at a time; only known slots, not at the start or the
 * end, ≤ 700 characters (422); an approved template goes back to "Awaiting approval"; 409 when
 * someone saved meanwhile. Audited `settings.template_update { key, lang, version }`.
 */
export async function PUT(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { key } = await ctx.params;
    if (!TEMPLATE_KEY_PATTERN.test(key)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, templateEditSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = editTemplate(auth.viewer, key, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
