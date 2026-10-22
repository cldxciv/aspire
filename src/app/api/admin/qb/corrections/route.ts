import type { NextRequest } from "next/server";

import { invalidId, isQbId, parseQbBody, QB_AUDIT, qbAdminLog, qbAudit, qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { correctionInputSchema } from "../_lib/schemas";
import { createCorrection, listCorrections } from "../_lib/services";

const ROUTE = "corrections";

/** GET /api/admin/qb/corrections[?questionId=…] — answer-key corrections, newest first (`view`) → `QbCorrectionView[]`. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const questionId = request.nextUrl.searchParams.get("questionId");
    if (questionId !== null && !isQbId(questionId)) return invalidId();
    return qbResponse(await listCorrections(auth.viewer, questionId === null ? {} : { questionId }));
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * POST /api/admin/qb/corrections — an answer-key correction (§B10.4; `key_corrections`):
 * `{ questionId, appliesToVersion, kind: "answer" | "dropped", answer?, reason, evidenceUrl? }` →
 * 201 `QbCorrectionResult`. Applies to that version and older; saved attempts are re-scored (boards
 * and verify pages update); a dropped question gives full marks to every paper that contains it.
 * Audited.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "key_corrections", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, correctionInputSchema, ROUTE);
    if (!body.ok) return body.response;
    const now = Date.now();
    const result = await createCorrection(auth.viewer, body.data, now);
    if (result.ok) {
      qbAudit(auth.viewer, {
        action: QB_AUDIT.keyCorrection,
        target: body.data.questionId,
        details: {
          kind: body.data.kind,
          appliesToVersion: body.data.appliesToVersion,
          correctionId: result.data.correction.id,
          rescoredAttempts: result.data.rescoredAttempts,
        },
        now,
      });
      qbAdminLog(ROUTE, "success", body.data.kind);
    }
    return qbResponse(result, { status: 201 });
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
