import type { NextRequest } from "next/server";

import { auditIdList, parseQbBody, QB_AUDIT, qbAdminLog, qbAudit, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { bulkLabelsSchema } from "../../_lib/schemas";
import { bulkCancel, bulkCommit, bulkStart } from "../../_lib/services";

const ROUTE = "questions_bulk_labels";

/**
 * POST /api/admin/qb/questions/bulk-labels — bulk label actions for one exam (§B7; `set_labels`),
 * with the same start → spot check → commit flow as bulk approval:
 *
 * - `accept_ai_labels`: accept the AI-suggested chapter and difficulty, recorded as
 *   `difficulty_source: "ai_accepted"` with the reviewer's id (never shown publicly);
 * - `confirm_syllabus`: mark the questions "in the current syllabus" for that exam.
 *
 * `{ action: "start", op, exam, ids }` → `QbBulkStartResult`; `{ action: "commit", op, batchId,
 * checks }` → `QbBulkCommitResult` (audited with the count and sample); `{ action: "cancel", op, batchId }`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "set_labels", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, bulkLabelsSchema, ROUTE);
    if (!body.ok) return body.response;
    const now = Date.now();
    const input = body.data;
    if (input.action === "start") {
      return qbResponse(await bulkStart(auth.viewer, { op: input.op, ids: input.ids, exam: input.exam }, now));
    }
    if (input.action === "cancel") {
      return qbResponse(await bulkCancel(auth.viewer, { op: input.op, batchId: input.batchId }, now));
    }
    const result = await bulkCommit(auth.viewer, { op: input.op, batchId: input.batchId, checks: input.checks }, now);
    if (result.ok) {
      const outcome = result.data;
      qbAudit(auth.viewer, {
        action: outcome.outcome === "done" ? QB_AUDIT.bulkLabels : QB_AUDIT.bulkAborted,
        target: input.batchId,
        details:
          outcome.outcome === "done"
            ? { op: input.op, count: outcome.count, sampleSize: outcome.sample.length, sample: auditIdList(outcome.sample) }
            : { op: input.op, failedId: outcome.failedId, sample: auditIdList(outcome.sample) },
        now,
      });
      qbAdminLog(ROUTE, "success", outcome.outcome);
    }
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
