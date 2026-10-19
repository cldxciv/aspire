import type { NextRequest } from "next/server";

import { getPrograms } from "@/lib/data";
import { apiList } from "@/lib/server/http";
import { parseQuery, programsQuerySchema } from "@/lib/server/public-content";

/**
 * GET /api/programs?exam=JEE|NEET|Foundation|Integrated
 * Reads the query string, so it renders per request (never prerendered).
 * Request data is read first and outside any try/catch so Next.js can bail
 * out of prerendering cleanly.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const query = parseQuery(request.nextUrl.searchParams, programsQuerySchema);
  if (!query.ok) return query.response;
  return apiList(await getPrograms({ exam: query.data.exam }));
}
