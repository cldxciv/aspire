import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getVisibleMockTest } from "@/lib/mocktest/catalog";
import { MOCKTEST_MESSAGES, mocktestLog, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { MOCKTEST_MAX_BODY_BYTES, scoreBodySchema } from "@/lib/mocktest/schemas";
import { mocktestLimiters, publicRelease, scoreForTest } from "@/lib/mocktest/service";
import { getClientIp } from "@/lib/server/request-guards";

/**
 * POST /api/mocktest/score — scores a finished attempt for anyone (guests included). Nothing is
 * stored. `{ testId, answers, timeSpentSec? }` → `ScoredAttempt` (`{ testId, result, review,
 * projection, sample, solutionsReleased, solutionsReleaseAt }`). A score sent by the client is ignored.
 *
 * Answer key (QA-SEC-M6 M1): for a test with a leaderboard, while a weekly window is open (until
 * its last attempts must have finished) the result keeps per-question correct / wrong / not
 * attempted but `review` is EMPTY and `solutionsReleased` false, with `solutionsReleaseAt`. A
 * student's own saved attempt gets its solutions from /api/mocktest/attempts instead. Practice
 * tests (no leaderboard) always release the key and solutions.
 *
 * Same-origin (403), JSON ≤ 16 KB (415 / 413), 300 per IP per 10 minutes (429), unknown or hidden
 * test (404), malformed answers (422).
 */
export async function POST(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "score", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const limit = mocktestLimiters.score.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);

    const body = await parseJsonBody(request, scoreBodySchema, MOCKTEST_MAX_BODY_BYTES);
    if (!body.ok) return body.response;

    const test = getVisibleMockTest(body.data.testId);
    if (!test) return testNotFound();

    const outcome = scoreForTest(test, body.data.answers, body.data.timeSpentSec, publicRelease(test, Date.now()));
    if (!outcome.ok) return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: outcome.fieldErrors });
    return portalApiItem(outcome.scored);
  } catch (error) {
    return mocktestServerError("score", error);
  }
}
