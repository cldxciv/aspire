import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_MESSAGES, ok } from "@/lib/crm/access";
import { getCentreLinks, putCentreLinks } from "@/lib/crm/console/centre-links";
import { centreLinksBodySchema } from "@/lib/crm/console/sources/schemas";
import { sourcesPermissions } from "@/lib/crm/console/sources/sources";
import { bodyLimit, crmLog, crmResponse, crmServerError, parseCrmBody, requireCrm, requireCrmSuperAdmin } from "@/lib/crm/http";
import { getDb } from "@/lib/db/connection";

const ROUTE = "settings.centre_links";

/**
 * GET /api/crm/settings/centre-links → the `centre_links` setting (`SettingEnvelope`: each centre's
 * Google Maps link, the version; version 0 and no links until a super admin saves them).
 * CRM admins and area heads read; counsellors 403 (docs/admin-phase-1b-plan.md §5.J, §7, §8).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    if (!sourcesPermissions(auth.viewer).canViewSources) {
      crmLog(ROUTE, "forbidden", "role");
      return portalApiError("forbidden", CRM_MESSAGES.forbidden);
    }
    return crmResponse(ok(getCentreLinks(getDb())));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * PUT /api/crm/settings/centre-links `{ centres: { <slug>: { mapsUrl: string | null } }, expectedVersion }`
 * → the saved envelope. SUPER ADMINS ONLY (403 otherwise, enforced here); same-origin; strict
 * shape (422); every link https and a Google Maps host, at most 300 characters (422 with
 * `centres.<slug>.mapsUrl`); 409 when someone saved meanwhile. A settings document, so it takes
 * the 32 KB settings body limit. Audited `settings.centre_links_update { centres, version }`
 * (how many centres changed; never a URL).
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, centreLinksBodySchema, ROUTE, bodyLimit("settings"));
    if (!body.ok) return body.response;
    const result = putCentreLinks(getDb(), { centres: body.data.centres }, { actorId: auth.viewer.userId, expectedVersion: body.data.expectedVersion, now: Date.now() });
    if (result.ok) crmLog(ROUTE, "success");
    return crmResponse(result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
