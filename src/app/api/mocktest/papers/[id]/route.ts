import { connection } from "next/server";
import { authorizeRole } from "@/lib/auth/policy";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import { qbPaperPort } from "@/lib/mocktest/generated";
import { MOCKTEST_MESSAGES, mocktestServerError, rateLimited } from "@/lib/mocktest/http";
import { PAPER_ID, PAPER_TOKEN, PAPER_TOKEN_HEADER } from "@/lib/mocktest/schemas";
import { mocktestLimiters } from "@/lib/mocktest/service";
import type { QbPaperView } from "@/lib/qb/types";
import { getClientIp } from "@/lib/server/request-guards";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/mocktest/papers/:id — resumes a paper (a reload must give the SAME paper,
 * docs/question-bank-plan.md §B10.1): the runner payload `QbPaperView` (stems, options, figures,
 * sections and marking; NO answers, solutions, sources, difficulty or staff fields).
 * Access: the paper's bearer token in the `X-Paper-Token` header, or the signed-in student who
 * owns it (ranked papers open with the owner's session only). 400 malformed id; 404 unknown,
 * expired or not yours (one answer for all three); 300 per IP per 10 minutes.
 */
export async function GET(request: Request, ctx: Context) {
  try {
    await connection();
    const limit = mocktestLimiters.paper.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);
    const { id } = await ctx.params;
    if (!PAPER_ID.test(id ?? "")) return portalApiError("bad_request", "Invalid paper id.");
    const header = request.headers.get(PAPER_TOKEN_HEADER);
    const token = header && PAPER_TOKEN.test(header) ? header : null;
    const auth = authorizeRole(await getSession(), ["student"]);
    const userId = auth.ok ? auth.session.userId : null;
    if (token === null && userId === null) return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);

    const port = await qbPaperPort();
    const record = await port.loadPaper(id, { token, userId }, Date.now());
    if (!record) return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);
    return portalApiItem<QbPaperView>(record.view);
  } catch (error) {
    return mocktestServerError("paper", error);
  }
}
