import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_API_MESSAGES, crmServerError, isCrmId } from "@/lib/crm/http";
import { importBatchRows, importRowsBodySchema } from "@/lib/crm/intake/import";
import { importDeps } from "@/lib/crm/intake/import-backend";

import { importResponse, parseImportBody, requireImporter } from "../../../_lib/route-kit";

const ROUTE = "import.rows";

type Context = { params: Promise<{ batchId: string }> };

/**
 * POST /api/crm/import/batches/:batchId/rows — `{ rows: ImportRowInput[] (1–250), offset }` →
 * `{ results: ImportRowResult[], batch: ImportBatchSummary }`. One transaction per request;
 * re-sending a chunk (same `offset`) after a dropped connection is safe and is not counted twice
 * (external refs + the batch counters). Super admin only (the
 * one who started the batch); ≤ 256 KB; 409 when the batch is finished, full or the chunk is out of order.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireImporter(request, ROUTE, { chunk: true });
    if (!auth.ok) return auth.response;
    const { batchId } = await ctx.params;
    if (!isCrmId(batchId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseImportBody(request, importRowsBodySchema, ROUTE);
    if (!body.ok) return body.response;
    return importResponse(ROUTE, importBatchRows(importDeps(), auth.viewer.userId, batchId, body.data, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
