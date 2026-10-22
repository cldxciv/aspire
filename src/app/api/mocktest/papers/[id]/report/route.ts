import { authorizeRole } from "@/lib/auth/policy";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import { qbPaperPort } from "@/lib/mocktest/generated";
import { MOCKTEST_MESSAGES, mocktestLog, mocktestServerError, rateLimited } from "@/lib/mocktest/http";
import { PAPER_ID, tidyText } from "@/lib/mocktest/schemas";
import { mocktestLimiters } from "@/lib/mocktest/service";
import { paperReportSchema } from "@/lib/qb/schemas";
import { getClientIp } from "@/lib/server/request-guards";

type Context = { params: Promise<{ id: string }> };

const REPORT_MAX_BODY_BYTES = 2 * 1024;

/**
 * POST /api/mocktest/papers/:id/report — "Report a problem" with one question of a paper
 * (docs/question-bank-plan.md §B10.5): `paperReportSchema` (src/lib/qb/schemas.ts)
 * `{ token?, questionId, kind, note? }` → 201 `{ reported: true }`; the note is tidied (spaces).
 * The report goes to the staff review queue and flags the question (`student_report`); nothing
 * changes automatically. It stores the question, its served version, the paper, the kind and the
 * note (≤ 500 characters) — NO account id and NO IP address.
 * Access like the paper itself: its bearer token, or the signed-in student who owns it.
 * Same-origin (403) → 20 per IP per hour (429) → JSON ≤ 2 KB → paper (404) → question in the paper (422).
 */
export async function POST(request: Request, ctx: Context) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "report", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const limit = mocktestLimiters.report.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);

    const body = await parseJsonBody(request, paperReportSchema, REPORT_MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const { id } = await ctx.params;
    if (!PAPER_ID.test(id ?? "")) return portalApiError("bad_request", "Invalid paper id.");
    const auth = authorizeRole(await getSession(), ["student"]);
    const userId = auth.ok ? auth.session.userId : null;

    const now = Date.now();
    const port = await qbPaperPort();
    const record = await port.loadPaper(id, { token: body.data.token ?? null, userId }, now);
    if (!record) return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);
    if (!record.view.questions.some((q) => q.id === body.data.questionId)) {
      return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: { questionId: ["unknown"] } });
    }
    // Deliberately no userId / IP: reports are anonymous (plan §B13 privacy).
    const note = body.data.note === undefined ? null : tidyText(body.data.note) || null;
    const stored = await port.createReport({ paper: record, questionId: body.data.questionId, kind: body.data.kind, note, now });
    if (!stored) return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);
    mocktestLog({ route: "report", outcome: "success", reason: body.data.kind });
    return portalApiItem({ reported: true }, { status: 201 });
  } catch (error) {
    return mocktestServerError("report", error);
  }
}
