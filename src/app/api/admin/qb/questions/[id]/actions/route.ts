import type { NextRequest } from "next/server";

import type { QbQuestionActionName } from "@/components/qb-admin/contract";
import { portalApiError } from "@/lib/auth/responses";
import type { QbCapability } from "@/lib/qb/types";

import {
  invalidId,
  isQbId,
  parseQbBody,
  QB_ADMIN_MESSAGES,
  QB_AUDIT,
  qbAdminLog,
  qbAudit,
  qbResponse,
  qbServerError,
  requireCapability,
  requireQbAdmin,
} from "../../../_lib/http";
import { questionActionSchema } from "../../../_lib/schemas";
import { questionAction } from "../../../_lib/services";

const ROUTE = "question_action";

type Context = { params: Promise<{ id: string }> };

/**
 * The §B6 capability each action needs (the service re-checks it and the subject scope).
 * `clear_flag` is a reviewer's decision (`approve`), as in QB-CORE-B's service; clearing
 * `third_party_source` is further limited to admins below.
 */
const QUESTION_ACTION_CAPABILITY: Readonly<Record<QbQuestionActionName, QbCapability>> = {
  submit: "edit_draft",
  return_to_draft: "edit_draft",
  clear_flag: "approve",
  approve: "approve",
  reject: "approve",
  set_fidelity: "approve",
  set_key_stage: "approve",
  suspend: "retire",
  unsuspend: "retire",
  retire: "retire",
  restore: "retire",
  accept_calibration: "set_labels",
  dismiss_calibration: "set_labels",
};

/**
 * POST /api/admin/qb/questions/:id/actions — one workflow step (§B7) → `QbQuestionDetail`:
 * `submit`, `approve` (with the checklist; refused with 409 `blocking_flags` / `self_approval`),
 * `reject`, `return_to_draft`, `suspend` / `unsuspend` (kept out of new papers), `retire`
 * (permanent, with a reason) / `restore`, `set_fidelity` (transcription fix or adapted with a
 * note), `set_key_stage` (`staff_verified` with a note), `clear_flag` (clearing
 * `third_party_source` is admin-only, needs the official URL and is audited) and
 * `accept_calibration` / `dismiss_calibration` (never automatic, §B11).
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { id } = await ctx.params;
    if (!isQbId(id)) return invalidId();
    const body = await parseQbBody(request, questionActionSchema, ROUTE);
    if (!body.ok) return body.response;
    const action = body.data;
    const denied = requireCapability(auth.viewer, QUESTION_ACTION_CAPABILITY[action.action], ROUTE);
    if (denied) return denied;
    const thirdParty = action.action === "clear_flag" && action.flag === "third_party_source";
    const officialUrl = action.action === "clear_flag" ? (action.officialUrl ?? null) : null;
    if (thirdParty && auth.viewer.role !== "admin") {
      qbAdminLog(ROUTE, "forbidden", "third_party_admin_only");
      return portalApiError("forbidden", QB_ADMIN_MESSAGES.forbidden);
    }
    const now = Date.now();
    const result = await questionAction(auth.viewer, id, action, now);
    if (result.ok) {
      if (thirdParty) {
        qbAudit(auth.viewer, {
          action: QB_AUDIT.thirdPartyCleared,
          target: id,
          details: { flag: "third_party_source", officialUrl },
          now,
        });
      }
      qbAdminLog(ROUTE, "success", action.action);
    }
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
