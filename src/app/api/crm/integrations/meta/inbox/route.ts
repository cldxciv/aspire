import type { NextRequest } from "next/server";

import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { crmLog, crmServerError, requireCrmSuperAdmin } from "@/lib/crm/http";
import { META_INBOX_STATUSES, type MetaInboxStatus } from "@/lib/crm/lead-ops-types";
import { metaInboxPage } from "@/lib/crm/meta/view";
import { getDb } from "@/lib/db/connection";

const ROUTE = "meta.inbox";

/**
 * GET /api/crm/integrations/meta/inbox?status= — `MetaInboxPage`: Meta lead ids with their state,
 * attempts and a fixed error code (never answers), newest first, 100 at most; without `status`,
 * the ones that need attention (failed, unavailable, held, pending, processing). SUPER ADMIN only
 * (the inbox is statewide; M2).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrmSuperAdmin(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const raw = request.nextUrl.searchParams.get("status");
    if (raw !== null && raw !== "" && !(META_INBOX_STATUSES as readonly string[]).includes(raw)) {
      crmLog(ROUTE, "bad_request", "status");
      return portalApiError("bad_request", "Unknown status.");
    }
    crmLog(ROUTE, "success");
    return portalApiItem(metaInboxPage(getDb(), raw ? (raw as MetaInboxStatus) : null));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
