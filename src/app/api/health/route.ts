import { connection } from "next/server";

import { showPlaceholderContent } from "@/lib/content-mode";
import { parseEnquiryDestination } from "@/lib/server/env";
import { apiItem } from "@/lib/server/http";

/**
 * GET /api/health — liveness plus non-secret configuration state.
 * `connection()` opts out of build-time prerendering so the response reflects
 * the running server's environment. Never exposes URLs, secrets or versions.
 */
export async function GET(): Promise<Response> {
  await connection();
  const { config } = parseEnquiryDestination(process.env);
  return apiItem({
    status: "ok" as const,
    time: new Date().toISOString(),
    enquiries: config.kind === "none" ? ("not_configured" as const) : ("connected" as const),
    placeholderContent: showPlaceholderContent(),
  });
}
