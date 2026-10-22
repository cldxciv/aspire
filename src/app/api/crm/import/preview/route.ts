import type { NextRequest } from "next/server";

import { crmServerError } from "@/lib/crm/http";
import { importPreviewBodySchema, previewImportRows } from "@/lib/crm/intake/import";
import { importDeps } from "@/lib/crm/intake/import-backend";

import { importResponse, parseImportBody, requireImporter } from "../_lib/route-kit";

const ROUTE = "import.preview";

/**
 * POST /api/crm/import/preview — `{ rows: ImportRowInput[] (1–250), consentBasis? }` →
 * `{ rows: ImportPreviewRow[] }`. A dry run: nothing is written. Super admin only; ≤ 256 KB;
 * 503 `not_configured` without INTEGRATIONS_SECRET. Phones come back masked (`+91 98•••••210`).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireImporter(request, ROUTE, { chunk: true, dryRun: true });
    if (!auth.ok) return auth.response;
    const body = await parseImportBody(request, importPreviewBodySchema, ROUTE);
    if (!body.ok) return body.response;
    const result = previewImportRows(importDeps(), body.data.rows, body.data.consentBasis ?? null, Date.now());
    return importResponse(ROUTE, result.ok ? { ok: true, data: { rows: result.data } } : result);
  } catch (error) {
    return crmServerError(ROUTE, error);
  }
}
