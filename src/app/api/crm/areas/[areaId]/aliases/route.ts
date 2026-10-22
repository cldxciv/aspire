import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_API_MESSAGES, crmLog, crmResponse, crmServerError, isCrmId, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { addAreaAlias, removeAreaAlias } from "@/lib/crm/routing/areas-service";
import { aliasAddSchema, aliasRemoveSchema } from "@/lib/crm/routing/schemas";

const ROUTE = "areas.aliases";

type Context = { params: Promise<{ areaId: string }> };

/**
 * POST /api/crm/areas/:areaId/aliases — `{ label, kind, placeKey? }` → 201
 * `{ alias, rerouted, assigned }`. "Map to district" from Unmatched places passes `placeKey`: the
 * open leads stored under it move to this area. 409 when another area uses the name. Super admin.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { areaId } = await ctx.params;
    if (!isCrmId(areaId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, aliasAddSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = addAreaAlias(auth.viewer, areaId, body.data, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result, { status: result.ok ? 201 : 200 });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/** DELETE /api/crm/areas/:areaId/aliases — `{ key }` → `{ removed: true }`. Super admin only. */
export async function DELETE(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { areaId } = await ctx.params;
    if (!isCrmId(areaId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseCrmBody(request, aliasRemoveSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = removeAreaAlias(auth.viewer, areaId, body.data.key, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
