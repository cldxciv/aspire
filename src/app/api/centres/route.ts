import type { NextRequest } from "next/server";

import { getCentres } from "@/lib/data";
import { apiList } from "@/lib/server/http";
import { centresQuerySchema, parseQuery } from "@/lib/server/public-content";

/**
 * GET /api/centres?q=<name or district>&exam=JEE|NEET|Foundation|Integrated
 * Renders per request (reads the query string).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const query = parseQuery(request.nextUrl.searchParams, centresQuerySchema);
  if (!query.ok) return query.response;
  return apiList(await getCentres({ query: query.data.q, exam: query.data.exam }));
}
