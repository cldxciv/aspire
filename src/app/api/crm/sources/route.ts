import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_MESSAGES, ok } from "@/lib/crm/access";
import { parseSourcesQuery } from "@/lib/crm/console/sources/range";
import { sourcesPermissions, sourcesReport } from "@/lib/crm/console/sources/sources";
import { crmLog, crmResponse, crmServerError, requireCrm } from "@/lib/crm/http";

const ROUTE = "sources";

const SOURCES_API_MESSAGES = {
  range: "Use range=30d, 90d or session, or from and to dates (YYYY-MM-DD, at most 3 years apart).",
  centre: "Use a centre slug or none.",
} as const;

/**
 * GET /api/crm/sources?range=30d|90d|session (or from=YYYY-MM-DD&to=YYYY-MM-DD)&centre=<slug|none>
 * → `SourcesReport` (docs/admin-phase-1b-plan.md §5.J, §8; owner: 1B-SOURCES). CRM admins (every
 * enquiry) and area heads (their own scope, read-only); counsellors 403. Counts include erased
 * enquiries (their non-personal origin) and leave out test leads. Read only: no transaction.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    if (!sourcesPermissions(auth.viewer).canViewSources) {
      crmLog(ROUTE, "forbidden", "role");
      return portalApiError("forbidden", CRM_MESSAGES.forbidden);
    }
    const now = Date.now();
    const params = request.nextUrl.searchParams;
    const query = parseSourcesQuery((name) => params.get(name), now);
    if (query.invalid.range || query.invalid.centre) {
      crmLog(ROUTE, "bad_request", "query");
      const fieldErrors: Record<string, string[]> = {};
      if (query.invalid.range) fieldErrors.range = [SOURCES_API_MESSAGES.range];
      if (query.invalid.centre) fieldErrors.centre = [SOURCES_API_MESSAGES.centre];
      return portalApiError("validation", CRM_MESSAGES.validation, { fieldErrors });
    }
    return crmResponse(ok(sourcesReport(auth.viewer, query.range, query.centre, now)));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
