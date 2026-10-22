import type { NextRequest } from "next/server";

import { parseJsonBody } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { importDeps, requireImportApi } from "@/lib/qb/import/core";
import { getJobView, importAction, importSummary, pruneImports, tickImport } from "@/lib/qb/import/jobs";
import { importActionSchema } from "@/lib/qb/schemas";

import {
  actionCapability,
  checkImportLimit,
  IMPORT_ID_PATTERN,
  IMPORT_MAX_JSON_BYTES,
  importFailureResponse,
  importLog,
  importServerError,
  viewerInfo,
} from "../shared";

const ROUTE = "imports.job";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/qb/imports/[id] — one import (`view`): status, progress, estimate and spend, page
 * marks (third-party warning), the pattern snapshot, the dry-run / key / pairing report. The job
 * page polls it every 10 s while a job runs; each call also resumes a waiting batch lazily.
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
    pruneImports(deps);
    void tickImport(deps, id);
    const job = getJobView(deps, id);
    if (!job) return importFailureResponse({ status: 404, reason: "not_found" });
    return portalApiItem({ job, summary: importSummary(deps), viewer: viewerInfo(auth.viewer) });
  } catch (error) {
    return importServerError(ROUTE, error);
  }
}

/**
 * POST /api/admin/qb/imports/[id] — `{ action, options? }`:
 * `run` (AI kinds, `import_ai`; `options.mode` sync | batch), `pause`, `cancel`, `retry_failed`
 * (`import_ai`), `close` (deletes the file, wipes extracted output), `create_drafts` (CSV / XLSX,
 * `import_tabular`; also applies a key CSV), `confirm_snapshot` (`approve`).
 * Refusals: 409 with a `reason` (wrong status, `ai_disabled:<why>`, `daily_cap`,
 * `taxonomy_unconfirmed`, `job_busy`, …); 422 `no_valid_rows` with the dry-run report.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireImportApi(request, "view", { write: true });
    if (!auth.ok) return auth.response;
    const limited = checkImportLimit("action", auth.viewer.userId, ROUTE);
    if (limited) return limited;
    const { id } = await ctx.params;
    if (!IMPORT_ID_PATTERN.test(id)) return importFailureResponse({ status: 404, reason: "not_found" });
    const body = await parseJsonBody(request, importActionSchema, IMPORT_MAX_JSON_BYTES);
    if (!body.ok) return body.response;
    const deps = importDeps();
    const current = getJobView(deps, id);
    if (!current) return importFailureResponse({ status: 404, reason: "not_found" });
    const capability = actionCapability(current.kind, body.data.action, current.meta.sourceKind);
    if (!auth.viewer.can(capability)) {
      importLog(ROUTE, "forbidden", capability);
      return portalApiError("forbidden", "Your question-bank role does not allow this.");
    }
    const result = await importAction(deps, auth.viewer, id, body.data);
    if (!result.ok) {
      importLog(ROUTE, "bad_request", result.reason);
      return importFailureResponse(result);
    }
    importLog(ROUTE, "success", body.data.action);
    return portalApiItem({ job: result.data.job, summary: importSummary(deps), viewer: viewerInfo(auth.viewer) });
  } catch (error) {
    return importServerError(ROUTE, error);
  }
}
