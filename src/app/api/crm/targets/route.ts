import type { NextRequest } from "next/server";

import { currentSession } from "@/lib/crm/console/session";
import { targetsBodySchema } from "@/lib/crm/console/targets/schemas";
import { getTargets, putTargets } from "@/lib/crm/console/targets/targets";
import { bodyLimit, crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm, requireCrmSuperAdmin } from "@/lib/crm/http";

const ROUTE = "targets";

/**
 * GET /api/crm/targets?period=S2026 → `TargetGrid` (docs/admin-phase-1b-plan.md §5.B, §8; owner:
 * 1B-NUMBERS): every target cell of the session (the current session when `period` is left out),
 * its last change and who made it. CRM admins and area heads read (area heads: their centres'
 * rows only); counsellors 403. 422 for anything but a session key (no month periods in 1b).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const period = request.nextUrl.searchParams.get("period") ?? currentSession(Date.now()).key;
    const result = getTargets(auth.viewer, period);
    if (!result.ok) crmLog(ROUTE, result.error === "forbidden" ? "forbidden" : "bad_request", result.error);
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * PUT /api/crm/targets `{ period, metric, cells: [{ centreSlug, program, value }], expectedUpdatedAt }`
 * → the session's `TargetGrid`. SUPER ADMINS ONLY (403 for admins and managers); same-origin;
 * strict shape (422: session periods only, programme and metric lists, whole numbers 0–100000,
 * each centre × programme once); one transaction replaces every cell of that period × metric;
 * 409 when the targets changed since `expectedUpdatedAt`. A settings document, so it takes the
 * 32 KB settings body limit. Audited `settings.targets_update { period, metric, cells }`.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, targetsBodySchema, ROUTE, bodyLimit("settings"));
    if (!body.ok) return body.response;
    const result = putTargets(auth.viewer, body.data, Date.now());
    crmLog(ROUTE, result.ok ? "success" : "bad_request", result.ok ? undefined : result.error);
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
