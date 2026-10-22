import type { NextRequest } from "next/server";

import { invalidId, isQbId, parseQbBody, qbAdminLog, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { blueprintSaveSchema } from "../../_lib/schemas";
import { getBlueprint, saveBlueprint } from "../../_lib/services";

const ROUTE = "blueprint";

type Context = { params: Promise<{ id: string }> };

/** GET /api/admin/qb/blueprints/:id — `QbBlueprintDetail` (`view`): the definition, validation issues and publish blockers. */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    return qbResponse(await getBlueprint(auth.viewer, id));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * PATCH /api/admin/qb/blueprints/:id — save a DRAFT (`edit_blueprint`): `{ definition,
 * baseUpdatedAt }` → `QbBlueprintDetail`. Identity, status, the placeholder flag, the pattern
 * confirmation and the sign-off are not accepted here (actions only); a published or archived
 * blueprint answers 409 `not_allowed_in_status`, a concurrent save 409 `stale`.
 */
export async function PATCH(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "edit_blueprint", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const body = await parseQbBody(request, blueprintSaveSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = await saveBlueprint(auth.viewer, id, body.data, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success");
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
