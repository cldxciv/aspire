import type { NextRequest } from "next/server";

import { portalApiItem } from "@/lib/auth/responses";
import { crmLog, crmServerError } from "@/lib/crm/http";
import { importBatchBodySchema, listImportBatches, startImportBatch } from "@/lib/crm/intake/import";
import { importDeps } from "@/lib/crm/intake/import-backend";

import { importResponse, parseImportBody, requireImportHistoryReader, requireImporter } from "../_lib/route-kit";

const ROUTE = "import.batches";

/**
 * GET /api/crm/import/batches — `{ items: ImportBatchSummary[] }`, newest first (50). Admins
 * (incl. super admins) only: counts, file name, consent basis; no family data.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireImportHistoryReader(request, ROUTE);
    if (!auth.ok) return auth.response;
    const items = listImportBatches(importDeps(), auth.viewer.userId);
    crmLog(ROUTE, "success");
    return portalApiItem({ items });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}

/**
 * POST /api/crm/import/batches — `{ consentBasis, startClock, rowsTotal (1–5000), fileName?,
 * fileSha256? }` → 201 `ImportBatchSummary`. Super admin only; 20 batches an hour per user (429).
 * Audited `crm.import_start` (counts only).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireImporter(request, ROUTE, { chunk: false });
    if (!auth.ok) return auth.response;
    const body = await parseImportBody(request, importBatchBodySchema, ROUTE);
    if (!body.ok) return body.response;
    return importResponse(ROUTE, startImportBatch(importDeps(), auth.viewer.userId, body.data, Date.now()), { status: 201 });
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
