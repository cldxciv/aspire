import { connection } from "next/server";
import { requireRole } from "@/lib/auth/guards";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getVisibleMockTest } from "@/lib/mocktest/catalog";
import { MOCKTEST_MESSAGES, mocktestLog, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { attemptBodySchema, MOCKTEST_MAX_BODY_BYTES } from "@/lib/mocktest/schemas";
import { mocktestLimiters, OWN_ATTEMPT_RELEASE, scoreForTest } from "@/lib/mocktest/service";
import { getAttemptForStudent, listAttemptsForStudent, saveTimedAttempt, summariseAttempts, summaryOf } from "@/lib/mocktest/store";
import type { SavedAttemptDetail } from "@/lib/mocktest/types";

const ID_PATTERN = /^[0-9a-f-]{36}$/;

/**
 * GET /api/mocktest/attempts — the signed-in student's OWN saved attempts (D-034):
 * `{ attempts: SavedAttemptSummary[], summary: AttemptsSummary }`, or with `?id=<attempt id>` one
 * attempt with its answers and full scored result, solutions included (`SavedAttemptDetail`; 404
 * when it is not theirs). 401 signed out, 403 other roles.
 */
export async function GET(request: Request) {
  try {
    await connection();
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId;
    const id = new URL(request.url).searchParams.get("id");
    if (id !== null) {
      if (!ID_PATTERN.test(id)) return portalApiError("bad_request", "Invalid attempt id.");
      const attempt = getAttemptForStudent(userId, id);
      if (!attempt) return portalApiError("not_found", "Attempt not found.");
      const test = getVisibleMockTest(attempt.testId);
      if (!test) return testNotFound();
      const outcome = scoreForTest(test, attempt.answers, attempt.timeSpentSec, OWN_ATTEMPT_RELEASE);
      if (!outcome.ok) return portalApiError("not_found", "Attempt not found.");
      return portalApiItem<SavedAttemptDetail>({ ...attempt, scored: outcome.scored });
    }
    return portalApiItem({ attempts: listAttemptsForStudent(userId), summary: summariseAttempts(userId) });
  } catch (error) {
    return mocktestServerError("attempts", error);
  }
}

/**
 * POST /api/mocktest/attempts — saves a finished attempt for the signed-in student.
 * `{ testId, attemptId, answers, timeSpentSec, startedAt, submittedAt, startToken? }`. The server
 * re-scores from the answer key (a client score is ignored), stores the attempt and returns
 * `{ attempt, scored }` — the student's own saved attempt, so with solutions — 201 when new, 200
 * when this attempt id was already saved.
 *
 * Timing (QA-SEC-M6 M1): the browser's `startedAt` / `submittedAt` / `timeSpentSec` are kept for
 * the student's own analysis only. The attempt can count on a weekly leaderboard only with a
 * valid, unused `startToken` from POST /api/mocktest/start issued to this student for this test
 * while a window was open, and a SERVER-measured duration between the minimum and the time limit
 * + grace (src/lib/mocktest/timing.ts). Otherwise it is saved as practice (`attempt.leaderboard`
 * false, `attempt.practiceReason`) — a result is never rejected for its timing.
 *
 * Same-origin (403) → student only (401 / 403) → 30 per student per hour (429) → JSON ≤ 16 KB →
 * visible test (404) → answers valid (422).
 */
export async function POST(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "attempts", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId;

    const limit = mocktestLimiters.attempts.check(userId);
    if (!limit.allowed) return rateLimited(limit);

    const body = await parseJsonBody(request, attemptBodySchema, MOCKTEST_MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const data = body.data;

    const test = getVisibleMockTest(data.testId);
    if (!test) return testNotFound();

    const outcome = scoreForTest(test, data.answers, data.timeSpentSec, OWN_ATTEMPT_RELEASE);
    if (!outcome.ok) return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: outcome.fieldErrors });

    // Browser times: the student's own record only, made consistent (never in the future).
    const now = Date.now();
    const submittedAt = Math.min(data.submittedAt, now);
    const startedAt = Math.min(data.startedAt, submittedAt);

    const { attempt, created } = saveTimedAttempt({
      userId,
      test,
      startToken: data.startToken,
      attemptId: data.attemptId,
      answers: outcome.answers,
      timeSpentSec: outcome.timeSpentSec,
      result: outcome.scored.result,
      timeTakenSec: outcome.timeTakenSec,
      startedAt,
      submittedAt,
      now,
    });
    return portalApiItem({ attempt: summaryOf(attempt), scored: outcome.scored }, { status: created ? 201 : 200 });
  } catch (error) {
    return mocktestServerError("attempts", error);
  }
}
