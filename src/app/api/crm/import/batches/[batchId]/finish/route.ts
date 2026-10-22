import type { NextRequest } from "next/server";

import { portalApiError } from "@/lib/auth/responses";
import { CRM_API_MESSAGES, crmServerError, isCrmId } from "@/lib/crm/http";
import { finishImportBatch, importFinishBodySchema } from "@/lib/crm/intake/import";
import { importDeps } from "@/lib/crm/intake/import-backend";

import { importResponse, parseImportBody, requireImporter } from "../../../_lib/route-kit";

const ROUTE = "import.finish";

type Context = { params: Promise<{ batchId: string }> };

/**
 * POST /api/crm/import/batches/:batchId/finish — `{}` → `ImportBatchSummary` with the totals.
 * Audited `crm.import` (counts only). Finishing twice returns the same totals.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireImporter(request, ROUTE, { chunk: false });
    if (!auth.ok) return auth.response;
    const { batchId } = await ctx.params;
    if (!isCrmId(batchId)) return portalApiError("bad_request", CRM_API_MESSAGES.invalidId);
    const body = await parseImportBody(request, importFinishBodySchema, ROUTE);
    if (!body.ok) return body.response;
    return importResponse(ROUTE, finishImportBatch(importDeps(), auth.viewer.userId, batchId, Date.now()));
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
