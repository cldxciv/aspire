import { connection } from "next/server";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getVisibleMockTest, isSampleTest } from "@/lib/mocktest/catalog";
import { MOCKTEST_MESSAGES, mocktestServerError, rateLimited } from "@/lib/mocktest/http";
import { mocktestLimiters } from "@/lib/mocktest/service";
import { findVerification } from "@/lib/mocktest/store";
import { normaliseVerifyId, scoreBand } from "@/lib/mocktest/timing";
import type { CertificateVerification } from "@/lib/mocktest/types";
import { getClientIp } from "@/lib/server/request-guards";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/mocktest/verify/:id — public check of a certificate's verification id (QA-SEC-M6 L7).
 * Only attempts SAVED to a student account have one (a hash of the attempt id). Confirms the test,
 * the day it was saved and the score as a 10-point percentage band — never the exact score, the
 * account or a name; the leaderboard nickname only when the student opted into leaderboards
 * (D-034). 400 malformed id, 404 unknown id or a test that is not visible, 60 per IP per 10 minutes.
 */
export async function GET(request: Request, ctx: Context) {
  try {
    await connection();
    const limit = mocktestLimiters.verify.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);
    const id = normaliseVerifyId((await ctx.params).id ?? "");
    if (!id) return portalApiError("bad_request", MOCKTEST_MESSAGES.invalidVerifyId);
    const record = findVerification(id);
    const test = record ? getVisibleMockTest(record.testId) : null;
    if (!record || !test) return portalApiError("not_found", MOCKTEST_MESSAGES.verifyNotFound);
    return portalApiItem<CertificateVerification>({
      testId: test.id,
      testTitle: test.title,
      savedAt: record.savedAt,
      scoreBand: scoreBand(record.score, record.maxScore),
      sample: isSampleTest(test),
      nickname: record.nickname,
    });
  } catch (error) {
    return mocktestServerError("verify", error);
  }
}
