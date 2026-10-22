import type { NextRequest } from "next/server";

import { isOneOf, QB_ADMIN_EXAMS, QB_ADMIN_SUBJECTS } from "@/components/qb-admin/constants";

import { parseQbBody, qbAdminLog, qbResponse, qbServerError, requireQbAdmin } from "../_lib/http";
import { chapterInputSchema } from "../_lib/schemas";
import { createChapter, listChapters } from "../_lib/services";

const ROUTE = "chapters";

/**
 * GET /api/admin/qb/chapters — Aspire's teaching chapters (`view`) → `QbChapterView[]`. Query:
 * `exam` (only chapters mapped to / current for that exam), `subject`, `all=true` (include
 * inactive). The editor's chapter picker and the AI-import chapter list use the confirmed set.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "view", write: false, route: ROUTE });
    if (!auth.ok) return auth.response;
    const params = request.nextUrl.searchParams;
    const exam = params.get("exam");
    const subject = params.get("subject");
    return qbResponse(
      await listChapters(auth.viewer, {
        exam: isOneOf(QB_ADMIN_EXAMS, exam) ? exam : undefined,
        subject: isOneOf(QB_ADMIN_SUBJECTS, subject) ? subject : undefined,
        includeInactive: params.get("all") === "true",
      }),
    );
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}

/**
 * POST /api/admin/qb/chapters — a new staff chapter (`manage_chapters`): `QbChapterInput` with a
 * new slug → 201 `QbChapterView` (409 `duplicate_id` for a slug in use). BOH chapters use the
 * `class_9_10` / `general` levels.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireQbAdmin(request, { capability: "manage_chapters", write: true, route: ROUTE });
    if (!auth.ok) return auth.response;
    const body = await parseQbBody(request, chapterInputSchema, ROUTE);
    if (!body.ok) return body.response;
    const result = await createChapter(auth.viewer, body.data, Date.now());
    if (result.ok) qbAdminLog(ROUTE, "success");
    return qbResponse(result, { status: 201 });
  } catch (error) {
    return qbServerError(ROUTE, error);
  }
}
