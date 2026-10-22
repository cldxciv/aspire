import type { NextRequest } from "next/server";
import { z } from "zod";

import { REQUEST_MESSAGES } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { bodyLimit, crmLog, crmServerError, parseCrmBody, requireCrmSuperAdmin } from "@/lib/crm/http";
import { kickMetaProcessing } from "@/lib/crm/meta";
import { saveMetaConfig } from "@/lib/crm/meta/config";
import { metaIntegrationView, siteOriginFor } from "@/lib/crm/meta/view";
import { getDb } from "@/lib/db/connection";

import { afterResponse, META_API_MESSAGES, requestOrigin, requireMetaStatusReader } from "./_lib/route-kit";

const ROUTE = "meta.config";

/**
 * GET /api/crm/integrations/meta — `MetaIntegrationView`. Admins and area heads: the connection
 * status only. Super admins also get the settings, the secret STATES (never a value) and the
 * verify token they paste into Meta. Executives: 403. After answering, it nudges the queue
 * (`kickMetaProcessing("status")`, throttled).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireMetaStatusReader(request, ROUTE);
    if (!auth.ok) return auth.response;
    const view = metaIntegrationView(getDb(), auth.viewer, { now: Date.now(), siteOrigin: siteOriginFor(requestOrigin(request)) });
    afterResponse(() => kickMetaProcessing("status"));
    crmLog(ROUTE, "success");
    return portalApiItem(view);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

const putSchema = z
  .object({
    config: z.record(z.string(), z.unknown()),
    expectedVersion: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();

/**
 * PUT /api/crm/integrations/meta — `{ config: Partial<MetaConfig>, expectedVersion }` → the new
 * view. SUPER ADMIN only. Strict keys (test mode has its own action); 422 with field errors; 409
 * when someone saved meanwhile. Audited `crm.meta_config { version, enabled }`. Held ids become
 * pending once the integration is enabled and a token exists.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseCrmBody(request, putSchema, ROUTE, bodyLimit("settings"));
    if (!body.ok) return body.response;
    const now = Date.now();
    const db = getDb();
    const saved = saveMetaConfig(db, { patch: body.data.config, expectedVersion: body.data.expectedVersion, actorId: auth.viewer.userId, now });
    if (!saved.ok) {
      crmLog(ROUTE, "bad_request", saved.error);
      return saved.error === "version_conflict"
        ? portalApiError("bad_request", META_API_MESSAGES.versionConflict, { status: 409 })
        : portalApiError("validation", REQUEST_MESSAGES.validation, { fieldErrors: saved.fieldErrors });
    }
    crmLog(ROUTE, "success");
    return portalApiItem(metaIntegrationView(db, auth.viewer, { now, siteOrigin: siteOriginFor(requestOrigin(request)) }));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
