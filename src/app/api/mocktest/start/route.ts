import { authorizeRole } from "@/lib/auth/policy";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiItem } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import { getVisibleMockTest } from "@/lib/mocktest/catalog";
import { mocktestLog, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { startBodySchema } from "@/lib/mocktest/schemas";
import { mocktestLimiters } from "@/lib/mocktest/service";
import { createStart } from "@/lib/mocktest/store";
import { isLeaderboardTest, maxDurationMs, minDurationMs, openWindowAt } from "@/lib/mocktest/timing";
import { getClientIp } from "@/lib/server/request-guards";
import type { AttemptStart } from "@/lib/mocktest/types";

const START_MAX_BODY_BYTES = 1024;

/**
 * POST /api/mocktest/start — `{ testId }` → `AttemptStart` (QA-SEC-M6 M1). Called when a test is
 * started. For a test with a leaderboard (weekly, scheduled windows) it records a server start and
 * returns an opaque one-time `token` (only its SHA-256 is stored) to send back with the save; the
 * server then measures the attempt's duration itself. `leaderboard` is true only for a signed-in
 * student while a window is open; guests and other roles may start too — their attempts are
 * practice. Practice tests have no leaderboard: `token` is null and nothing is stored.
 * Same-origin (403), JSON ≤ 1 KB, 120 per IP per 10 minutes (429), unknown / hidden test (404).
 */
export async function POST(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "start", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const limit = mocktestLimiters.start.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);

    const body = await parseJsonBody(request, startBodySchema, START_MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const test = getVisibleMockTest(body.data.testId);
    if (!test) return testNotFound();

    const now = Date.now();
    const limits = { minSeconds: Math.round(minDurationMs(test.durationMinutes) / 1000), maxSeconds: Math.round(maxDurationMs(test.durationMinutes) / 1000) };
    if (!isLeaderboardTest(test)) {
      return portalApiItem<AttemptStart>({ token: null, leaderboard: false, windowId: null, startedAt: now, ...limits }, { status: 201 });
    }
    const auth = authorizeRole(await getSession(), ["student"]);
    const userId = auth.ok ? auth.session.userId : null;
    const window = openWindowAt(test.windows, now);
    const { token } = createStart({ userId, test, windowId: window?.id ?? null, now });
    return portalApiItem<AttemptStart>(
      { token, leaderboard: userId !== null && window !== null, windowId: window?.id ?? null, startedAt: now, ...limits },
      { status: 201 },
    );
  } catch (error) {
    return mocktestServerError("start", error);
  }
}
