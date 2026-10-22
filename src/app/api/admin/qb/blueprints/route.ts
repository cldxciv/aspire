import type { NextRequest } from "next/server";

import { parseQbBody, qbAdminLog, qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { blueprintCreateSchema } from "../_lib/schemas";
import { createBlueprint, listBlueprints } from "../_lib/services";

const ROUTE = "blueprints";

/** GET /api/admin/qb/blueprints — every blueprint version of every slot (`view`) → `QbBlueprintSummary[]`. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return qbResponse(await listBlueprints(auth.viewer));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * POST /api/admin/qb/blueprints — `{ slot }` → 201 `QbBlueprintDetail`: a draft for a slot that has
 * none, from the §B1.3 default (`defaultBlueprint(slot)`; `edit_blueprint`). A slot that already
 * has a draft answers 409 `duplicate_id`; use the `new_version` action to copy a published one.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "edit_blueprint", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, blueprintCreateSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = await createBlueprint(auth.viewer, body.data, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success");
    return qbResponse(result, { status: 201 });
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
