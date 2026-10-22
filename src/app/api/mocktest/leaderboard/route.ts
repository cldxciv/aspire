import { connection } from "next/server";
import { isDistrictId } from "@/content/mocktest/districts";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import { getVisibleMockTest, maxScoreOf } from "@/lib/mocktest/catalog";
import { MOCKTEST_MESSAGES, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { qbPaperPort } from "@/lib/mocktest/generated";
import { parseBlueprintTest, type BlueprintTestRef } from "@/lib/mocktest/resolve";
import { mocktestLimiters } from "@/lib/mocktest/service";
import { getLeaderboard, getRankedLeaderboard } from "@/lib/mocktest/store";
import { isLeaderboardTest, monthWindowAt, openWindowAt } from "@/lib/mocktest/timing";
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
 * Generated mocks: `test=bp-<slot>-ranked` is the monthly ranked paper's board (`rankedBoard` below).
 */
export async function GET(request: Request) {
  try {
    await connection();
    const limit = mocktestLimiters.leaderboard.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);

    const params = new URL(request.url).searchParams;
    const blueprint = parseBlueprintTest(params.get("test") ?? "");
    if (blueprint) return await rankedBoard(params, blueprint);
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

/**
 * `test=bp-<slot>-ranked`: the monthly ranked paper's board of a generated mock
 * (docs/question-bank-plan.md §B10.3). Same paper for everyone in the month, ranked by score and
 * the official tie-break (no time criterion; equal entries share a rank), `ranked: true` in the
 * answer. `window` ("month-YYYY-MM") defaults to the current month if it has a paper, else the most
 * recent month that had one. Practice ids ("bp-<slot>") and slots without monthly ranked papers → 404.
 */
async function rankedBoard(params: URLSearchParams, blueprint: BlueprintTestRef): Promise<Response> {
  if (blueprint.mode !== "ranked" || blueprint.part !== null) return portalApiError("not_found", MOCKTEST_MESSAGES.noLeaderboard);
  const now = Date.now();
  const port = await qbPaperPort();
  const board = await port.rankedBoard(blueprint.slot, now);
  if (!board || board.windows.length === 0) return portalApiError("not_found", MOCKTEST_MESSAGES.noLeaderboard);

  const district = params.get("district") || null;
  if (district !== null && !isDistrictId(district)) return portalApiError("bad_request", "Unknown district.");
  const viewParam = params.get("view") ?? "students";
  const view = VIEWS.find((v) => v === viewParam);
  if (!view) return portalApiError("bad_request", "Unknown view.");

  const requested = params.get("window");
  const sorted = board.windows.slice().sort((a, b) => Date.parse(a.window.startsAt) - Date.parse(b.window.startsAt));
  let entry = requested ? sorted.find((w) => w.window.id === requested) : undefined;
  if (requested && !entry) return portalApiError("bad_request", "Unknown window.");
  if (!entry) {
    const started = sorted.filter((w) => Date.parse(w.window.startsAt) <= now);
    entry = sorted.find((w) => w.window.id === monthWindowAt(now).id) ?? started[started.length - 1] ?? sorted[0];
  }

  const session = await getSession();
  const viewerId = session?.role === "student" ? session.userId : null;
  return portalApiItem(
    getRankedLeaderboard({ testId: blueprint.testId, window: entry.window, district, view, maxScore: entry.maxScore, viewerId }),
  );
}
