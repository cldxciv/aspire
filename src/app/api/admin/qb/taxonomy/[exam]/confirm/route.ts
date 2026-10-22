import type { NextRequest } from "next/server";

import { isOneOf, QB_ADMIN_EXAMS } from "@/components/qb-admin/constants";

import { invalidId, parseQbBody, QB_AUDIT, qbAdminLog, qbAudit, qbResponse, qbServerError, requireQbAdmin } from "../../../_lib/http";
import { taxonomyConfirmSchema } from "../../../_lib/schemas";
import { confirmTaxonomy } from "../../../_lib/services";

const ROUTE = "taxonomy_confirm";

type Context = { params: Promise<{ exam: string }> };

/**
 * POST /api/admin/qb/taxonomy/:exam/confirm — an admin confirms the exam's syllabus units and
 * chapters and its syllabus revision year (`confirm_taxonomy`): `{ confirm: true,
 * syllabusRevisionYear, note? }` → `QbTaxonomyStatus`. Until then, imports for the exam are refused
 * (409 `taxonomy_unconfirmed`) and its blueprint cannot be published (§B3). Audited.
 */
export async function POST(request: NextRequest, ctx: Context) {
  try {
    const auth = await requireQbAdmin(request, { capability: "confirm_taxonomy", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const { exam } = await ctx.params;
    if (!isOneOf(QB_ADMIN_EXAMS, exam)) return invalidId();
    const body = await parseQbBody(request, taxonomyConfirmSchema, ROUTE);
    if (!body.ok) return body.response;
    const now = Date.now();
    const result = await confirmTaxonomy(auth.viewer, exam, { syllabusRevisionYear: body.data.syllabusRevisionYear, note: body.data.note }, now);
    if (result.ok) {
      qbAudit(auth.viewer, {
        action: QB_AUDIT.taxonomyConfirm,
        target: exam,
        details: { exam, syllabusRevisionYear: body.data.syllabusRevisionYear },
        now,
      });
      qbAdminLog(ROUTE, "success");
    }
    return qbResponse(result);
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
