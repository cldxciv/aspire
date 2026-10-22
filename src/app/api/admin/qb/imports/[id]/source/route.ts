import type { NextRequest } from "next/server";

import { importDeps, requireImportApi } from "@/lib/qb/import/core";
import { getImport } from "@/lib/qb/import/repo";
import { readImportFile } from "@/lib/qb/import/storage";

import { checkImportLimit, IMPORT_ID_PATTERN, importFailureResponse, importServerError } from "../../shared";

const ROUTE = "imports.source";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/qb/imports/[id]/source — the uploaded PDF, for reviewers comparing drafts with the
 * source page (`#page=N`). `view`; PDFs only; 404 once the file is deleted (closed or past
 * retention). Headers: `Content-Disposition: inline`, `nosniff`, `private, no-store`, and
 * `Cross-Origin-Resource-Policy: same-origin`. No `CSP: sandbox`: Chrome's PDF viewer refuses
 * sandboxed documents (the owner checks the viewer by hand before deployment).
 */
export async function GET(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireImportApi(request, "view", { write: false });
    if (!auth.ok) return auth.response;
    const limited = checkImportLimit("read", auth.viewer.userId, ROUTE);
    if (limited) return limited;
    const { id } = await ctx.params;
    if (!IMPORT_ID_PATTERN.test(id)) return importFailureResponse({ status: 404, reason: "not_found" });
    const deps = importDeps();
    const job = getImport(deps.db, id);
    if (!job || !job.kind.startsWith("pdf_") || job.fileDeletedAt !== null) return importFailureResponse({ status: 404, reason: "not_found" });
    const bytes = readImportFile(deps.config.dir, job.tempPath);
    if (!bytes) return importFailureResponse({ status: 404, reason: "not_found" });
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${job.id}.pdf"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return importServerError(ROUTE, error);
  }
}
