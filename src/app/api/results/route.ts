import type { NextRequest } from "next/server";

import { getResults } from "@/lib/data";
import { apiList } from "@/lib/server/http";
import { parseQuery, resultsQuerySchema, toPublicResult } from "@/lib/server/public-content";

/**
 * GET /api/results?year=YYYY&exam=JEE|NEET|Foundation|Integrated
 * Only records getResults() publishes (published, consent not pending);
 * names, schools and quotes only with `granted` consent (toPublicResult). Placeholder
 * records appear only in development / preview builds (D-020).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const query = parseQuery(request.nextUrl.searchParams, resultsQuerySchema);
  if (!query.ok) return query.response;
  const results = await getResults({ year: query.data.year, exam: query.data.exam });
  return apiList(results.map(toPublicResult));
}
