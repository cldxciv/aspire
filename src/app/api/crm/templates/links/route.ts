import type { NextRequest } from "next/server";

import { waLinksSchema } from "@/lib/crm/console/templates/schemas";
import { putWaLinks } from "@/lib/crm/console/templates/templates";
import { crmLog, crmResponse, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";

const ROUTE = "template_links";

/**
 * PUT /api/crm/templates/links — `{ prospectusUrl: string | null, expectedVersion }` → the
 * `wa_links` settings envelope. SUPER ADMINS ONLY (403). https only, ≤ 300 characters (422);
 * null / "" removes the link; 409 on a stale version. Audited `settings.wa_links_update { version }`
 * (never the URL). This static segment wins over `[key]`, so "links" is never a template key.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, waLinksSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = putWaLinks(auth.viewer, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
