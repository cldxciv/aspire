import type { NextRequest } from "next/server";

import { requireImportApi } from "@/lib/qb/import/core";
import { bankTemplateCsv, keyTemplateCsv } from "@/lib/qb/import/template";

import { importFailureResponse, importServerError } from "../shared";

const ROUTE = "imports.template";

/**
 * GET /api/admin/qb/imports/template?kind=csv_bank|csv_key — the CSV template (`import_tabular`):
 * the header plus example rows written for the template (their ids start with `TEMPLATE-EXAMPLE-`
 * and are refused on import). Cells that could run as spreadsheet formulas get a `'` prefix.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireImportApi(request, "import_tabular", { write: false });
    if (!auth.ok) return auth.response;
    const kind = request.nextUrl.searchParams.get("kind") ?? "csv_bank";
    if (kind !== "csv_bank" && kind !== "csv_key") return importFailureResponse({ status: 400, reason: "template_kind" });
    const csv = kind === "csv_key" ? keyTemplateCsv() : bankTemplateCsv();
    return new Response(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="aspire-question-bank-${kind === "csv_key" ? "key" : "bank"}-template.csv"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return importServerError(ROUTE, error);
  }
}
