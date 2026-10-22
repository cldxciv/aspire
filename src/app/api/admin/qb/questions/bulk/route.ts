import type { NextRequest } from "next/server";

import { auditIdList, parseQbBody, QB_AUDIT, qbAdminLog, qbAudit, qbResponse, qbServerError, requireQbAdmin } from "../../_lib/http";
import { bulkApproveSchema } from "../../_lib/schemas";
import { bulkCancel, bulkCommit, bulkStart } from "../../_lib/services";

const ROUTE = "questions_bulk";

/**
 * POST /api/admin/qb/questions/bulk — bulk approval with a spot check (§B7; `approve`):
 *
 * - `{ action: "start", ids }` (1–200 distinct ids) → `QbBulkStartResult`: the eligible ids (no
 *   `QB_BULK_EXCLUDED_FLAGS`, right status, inside the reviewer's subjects), the skipped ones with
 *   reasons, and a random sample of max(3, ceil(5 %)) ≤ 10 the reviewer must open.
 * - Opening a sampled item: `GET /questions/:id?spotCheck=<batchId>` returns its one-time token.
 * - `{ action: "commit", batchId, checks: [{ id, token, ok }] }` → `QbBulkCommitResult`: every
 *   sampled item needs a valid token (409 `spot_check_incomplete`, expired → 409 `batch_expired`);
 *   one `ok: false` aborts the whole batch. Audited: one entry with the count and the sample ids
 *   (the per-item `bulk_approve` events are the service's).
 * - `{ action: "cancel", batchId }`.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "approve", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, bulkApproveSchema, ROUTE);
    if (!body.ok) return body.response;
    const now = Date.now();
    const input = body.data;
    if (input.action === "start") {
      return qbResponse(await bulkStart(auth.viewer, { op: "approve", ids: input.ids, exam: null }, now));
    }
    if (input.action === "cancel") {
      return qbResponse(await bulkCancel(auth.viewer, { op: "approve", batchId: input.batchId }, now));
    }
    const result = await bulkCommit(auth.viewer, { op: "approve", batchId: input.batchId, checks: input.checks }, now);
    if (result.ok) {
      const outcome = result.data;
      if (outcome.outcome === "done") {
        qbAudit(auth.viewer, {
          action: QB_AUDIT.bulkApprove,
          target: input.batchId,
          details: { count: outcome.count, sampleSize: outcome.sample.length, sample: auditIdList(outcome.sample) },
          now,
        });
      } else {
        qbAudit(auth.viewer, {
          action: QB_AUDIT.bulkAborted,
          target: input.batchId,
          details: { op: "approve", failedId: outcome.failedId, sample: auditIdList(outcome.sample) },
          now,
        });
      }
      qbAdminLog(ROUTE, "success", outcome.outcome);
    }
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
