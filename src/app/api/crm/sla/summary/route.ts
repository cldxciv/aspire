import { after, type NextRequest } from "next/server";

import { portalApiItem } from "@/lib/auth/responses";
import { crmLog, crmServerError, requireCrm } from "@/lib/crm/http";
import { kickMetaProcessing } from "@/lib/crm/meta";
import { slaSummary } from "@/lib/crm/sla/views";

const ROUTE = "sla.summary";

/**
 * Opportunistic Meta processing (§18.5, A21): after the response, nudge the inbox. Wrapped twice:
 * `after` itself throws outside a request scope, and the kick must never break the strip.
 */
function kickAfterResponse(): void {
  try {
    after(() => {
      try {
        kickMetaProcessing("summary");
      } catch {
        crmLog(ROUTE, "error", "meta_kick_failed");
      }
    });
  } catch {
    // Not inside a request (tests, scripts): nothing to schedule.
  }
}

/**
 * GET /api/crm/sla/summary[?lang=hi] — `SlaSummary` for the alert strip (polled every 60 s). Every
 * CRM viewer gets `mine`; area heads `area`; super admins `sa` (and the tier-1 alerts no head
 * receives). Counts and names only; in-app only (D-041). `lang` picks the area-name language.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireCrm(request, { write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const lang = request.nextUrl.searchParams.get("lang") === "hi" ? "hi" : "en";
    const summary = slaSummary(auth.viewer, Date.now(), { lang });
    kickAfterResponse();
    return portalApiItem(summary);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
