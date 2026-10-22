import type { NextRequest } from "next/server";

import { bodyLimit, crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm, requireCrmSuperAdmin } from "@/lib/crm/http";
import { recomputeOpenClocks } from "@/lib/crm/sla";
import { getSpeedSettings, saveSpeedSettings } from "@/lib/crm/sla/policy";
import { speedSettingsSchema } from "@/lib/crm/sla/schemas";

const ROUTE = "settings.speed";

/**
 * GET /api/crm/settings/speed — `{ callingHours, speedRule }` (each a `SettingEnvelope` with its
 * version; defaults when never saved). Area heads and admins (counsellors: 403).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return crmResponse(getSpeedSettings(auth.viewer));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * PUT /api/crm/settings/speed — `{ callingHours?, speedRule?, expectedVersion: { callingHours?,
 * speedRule? } }` → `{ callingHours, speedRule, recomputed }`. SUPER ADMINS ONLY (403 otherwise,
 * enforced here, not by hidden buttons); 422 with field errors; 409 when someone saved meanwhile.
 * Open clocks get new due / alert times in the same transaction. Audited
 * `crm.settings_update { key, version }` (never the values).
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, speedSettingsSchema, ROUTE, bodyLimit("settings"));
    if (!body.ok) return body.response;
    const result = saveSpeedSettings(auth.viewer, body.data, recomputeOpenClocks, Date.now());
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
