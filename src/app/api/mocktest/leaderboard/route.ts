import { connection } from "next/server";
import { isDistrictId } from "@/content/mocktest/districts";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import { getVisibleMockTest, maxScoreOf } from "@/lib/mocktest/catalog";
import { MOCKTEST_MESSAGES, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { mocktestLimiters } from "@/lib/mocktest/service";
import { getLeaderboard } from "@/lib/mocktest/store";
import { isLeaderboardTest, openWindowAt } from "@/lib/mocktest/timing";
import { getClientIp } from "@/lib/server/request-guards";

const VIEWS = ["students", "districts", "schools"] as const;

/**
 * GET /api/mocktest/leaderboard?test=<id>[&district=<id>][&window=<id>][&view=students|districts|schools]
 *
 * Public, read-only PRACTICE leaderboard of a weekly test's window (QA-SEC-M6). Lists ONLY students
 * who opted in (D-034): nickname, district (if given), score and the SERVER-measured time. Never
 * login ids, names, user ids or schools on a student row; schools appear only in the `schools`
 * table, and only with at least 3 students. A student's entry is their first attempt saved since
 * the window opened, if it was a server-timed leaderboard attempt. `window` defaults to the one
 * open now, else the most recent one that has started. When the caller is a signed-in, opted-in
 * student, `me` is their own position. 404 for unknown / hidden tests and tests without a
 * leaderboard (practice tests), 400 for a bad filter, 120 requests per IP per 10 minutes.
 */
export async function GET(request: Request) {
  try {
    await connection();
    const limit = mocktestLimiters.leaderboard.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);

    const params = new URL(request.url).searchParams;
    const test = getVisibleMockTest(params.get("test") ?? "");
    if (!test) return testNotFound();
    if (!isLeaderboardTest(test) || !test.windows) return portalApiError("not_found", MOCKTEST_MESSAGES.noLeaderboard);

    const district = params.get("district") || null;
    if (district !== null && !isDistrictId(district)) return portalApiError("bad_request", "Unknown district.");
    const viewParam = params.get("view") ?? "students";
    const view = VIEWS.find((v) => v === viewParam);
    if (!view) return portalApiError("bad_request", "Unknown view.");

    const requested = params.get("window");
    const now = Date.now();
    let window = requested ? test.windows.find((w) => w.id === requested) : undefined;
    if (requested && !window) return portalApiError("bad_request", "Unknown window.");
    if (!window) {
      const started = test.windows.filter((w) => Date.parse(w.startsAt) <= now);
      window = openWindowAt(test.windows, now) ?? started[started.length - 1] ?? test.windows[0];
    }

    const session = await getSession();
    const viewerId = session?.role === "student" ? session.userId : null;
    return portalApiItem(getLeaderboard({ testId: test.id, window, district, view, maxScore: maxScoreOf(test), viewerId }));
  } catch (error) {
    return mocktestServerError("leaderboard", error);
  }
}
