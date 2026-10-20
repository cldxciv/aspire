import { connection } from "next/server";

import { showPlaceholderContent } from "@/lib/content-mode";
import { getEnquiryDeliveryStatus } from "@/lib/server/env";
import { apiItem } from "@/lib/server/http";

/**
 * GET /api/health — liveness plus non-secret configuration state.
 * `connection()` opts out of build-time prerendering so the response reflects
 * the running server's environment. Never exposes URLs, secrets or versions.
 */
export async function GET(): Promise<Response> {
  await connection();
  return apiItem({
    status: "ok" as const,
    time: new Date().toISOString(),
    // "connected" when enquiries are stored as CRM leads (ENQUIRY_STORE, default) or forwarded to a webhook.
    enquiries: getEnquiryDeliveryStatus(process.env),
    placeholderContent: showPlaceholderContent(),
  });
}
