import type { NextRequest } from "next/server";

import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { importDeps, requireImportApi } from "@/lib/qb/import/core";
import { createImport, importSummary, listJobViews, pruneImports, tickImport } from "@/lib/qb/import/jobs";
import { importKindSchema, importMetaSchema } from "@/lib/qb/schemas";

import {
  checkImportLimit,
  importCapability,
  importFailureResponse,
  importLog,
  importServerError,
  MULTIPART_OVERHEAD_BYTES,
  readUploadBody,
  viewerInfo,
} from "./shared";

const ROUTE = "imports";

/**
 * GET /api/admin/qb/imports — the import overview for QB staff (`view`): whether AI import is on
 * (env kill switch, admin setting, API key), today's spend against the daily cap, the confirmed
 * exams, and the 50 most recent imports. Also runs retention pruning and the lazy batch poll.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireImportApi(request, "view", { write: false });
    if (!auth.ok) return auth.response;
    const limited = checkImportLimit("read", auth.viewer.userId, ROUTE);
    if (limited) return limited;
    const deps = importDeps();
    pruneImports(deps);
    const imports = listJobViews(deps);
    for (const job of imports) if (job.status === "waiting_batch" || job.status === "running") void tickImport(deps, job.id);
    return portalApiItem({ summary: importSummary(deps), viewer: viewerInfo(auth.viewer), imports });
  } catch (error) {
    return importServerError(ROUTE, error);
  }
}

/**
 * POST /api/admin/qb/imports — upload a file (`multipart/form-data`): `file`, `kind`, `meta` (JSON,
 * `QbImportMeta`), `licenceAck=true`, optional `licenceNote` and `mode` (`sync` | `batch`).
 * CSV / XLSX need `import_tabular`; PDF and Word files (read by AI) and official key CSVs (they set
 * official answers) need `import_ai`.
 * → 201 with the job (status `ready`, the estimate, and for tabular files the dry-run report).
 *
 * Refusals: 415 not multipart / wrong file type; 413 over `QB_IMPORT_MAX_FILE_MB` (≤ 9 MB) or a zip
 * bomb; 400 `Content-Length` missing or not equal to the bytes received (a truncated upload);
 * 409 `taxonomy_unconfirmed`, `duplicate_file`, `paper_duplicate`, `booklet_duplicate`,
 * `storage_quota`; 422 metadata problems or a missing licence acknowledgement.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireImportApi(request, "import_tabular", { write: true });
    if (!auth.ok) return auth.response;
    const limited = checkImportLimit("upload", auth.viewer.userId, ROUTE);
    if (limited) return limited;
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
      return importFailureResponse({ status: 415, reason: "multipart_required" });
    }
    const deps = importDeps();
    const raw = await readUploadBody(request, deps.config.maxFileBytes + MULTIPART_OVERHEAD_BYTES);
    if (!raw.ok) {
      importLog(ROUTE, "bad_request", raw.reason);
      if (raw.reason === "too_large") return importFailureResponse({ status: 413, reason: "file_too_large" });
      return importFailureResponse({ status: 400, reason: `upload_${raw.reason}` });
    }
    let form: FormData;
    try {
      form = await new Response(raw.bytes, { headers: { "content-type": contentType } }).formData();
    } catch {
      return importFailureResponse({ status: 400, reason: "multipart_invalid" });
    }
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) return importFailureResponse({ status: 422, reason: "file_missing" });
    if (file.size > deps.config.maxFileBytes) return importFailureResponse({ status: 413, reason: "file_too_large" });

    const kind = importKindSchema.safeParse(form.get("kind"));
    if (!kind.success) return portalApiError("validation", "Choose what kind of file this is.", { fieldErrors: { kind: ["invalid"] } });
    let metaJson: unknown;
    try {
      metaJson = JSON.parse(String(form.get("meta") ?? ""));
    } catch {
      return portalApiError("validation", "The file details are missing.", { fieldErrors: { meta: ["invalid"] } });
    }
    const meta = importMetaSchema.safeParse(metaJson);
    if (!meta.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of meta.error.issues) {
        const key = `meta.${issue.path.join(".") || "_form"}`;
        (fieldErrors[key] ??= []).push(issue.message);
      }
      return portalApiError("validation", "Please check the file details.", { fieldErrors });
    }
    if (importCapability(kind.data, meta.data.sourceKind) === "import_ai" && !auth.viewer.can("import_ai")) {
      importLog(ROUTE, "forbidden", "import_ai");
      return portalApiError("forbidden", "Only reviewers and administrators can import files that are read by AI, or official answer keys.");
    }
    const mode = form.get("mode");
    const licenceNote = String(form.get("licenceNote") ?? "").trim().slice(0, 500);
    const result = await createImport(deps, auth.viewer, {
      kind: kind.data,
      meta: meta.data,
      fileName: file instanceof File ? file.name : "upload",
      bytes: new Uint8Array(await file.arrayBuffer()),
      licenceAck: form.get("licenceAck") === "true",
      licenceNote: licenceNote || null,
      options: mode === "sync" || mode === "batch" ? { mode } : undefined,
    });
    if (!result.ok) {
      importLog(ROUTE, "bad_request", result.reason);
      return importFailureResponse(result);
    }
    importLog(ROUTE, "success");
    return portalApiItem(result.data, { status: 201 });
  } catch (error) {
    return importServerError(ROUTE, error);
  }
}
