import type { NextRequest } from "next/server";

import { parseQbBody, QB_AUDIT, qbAdminLog, qbAudit, qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { settingsPatchSchema } from "../_lib/schemas";
import { getSettings, updateSettings } from "../_lib/services";

const ROUTE = "settings";

/**
 * GET /api/admin/qb/settings — `QbSettingsView` (`manage_settings`, admins): the AI-import setting,
 * the `QB_IMPORT_ENABLED=0` kill switch, whether an API key is configured (never the key), the
 * self-approval policy, bank revision, search mode and figure storage use.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "manage_settings", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    return qbResponse(await getSettings(auth.viewer));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * PUT /api/admin/qb/settings — `{ importEnabled?, approvalSelf? }` (`manage_settings`, admins only)
 * → `QbSettingsView`. Turning AI import on does nothing while the env kill switch is set. Audited.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "manage_settings", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, settingsPatchSchema, ROUTE);
    if (!body.ok) return body.response;
    const now = Date.now();
    const result = await updateSettings(auth.viewer, body.data, now);
    if (result.ok) {
      qbAudit(auth.viewer, {
        action: QB_AUDIT.settingsUpdate,
        target: null,
        details: {
          ...(body.data.importEnabled !== undefined ? { importEnabled: body.data.importEnabled } : {}),
          ...(body.data.approvalSelf !== undefined ? { approvalSelf: body.data.approvalSelf } : {}),
        },
        now,
      });
      qbAdminLog(ROUTE, "success");
    }
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
