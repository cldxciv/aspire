import "server-only";

import type { MockTestDefinition } from "@/content/mocktest/types";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";
import { getPredictorData } from "@/lib/predictor/data";
import { reviewItems, scorableQuestions, isSampleTest } from "./catalog";
import { projectRankBand } from "./projection";
import { normaliseAnswer, scoreAttempt, type Answer } from "./scoring";
import { solutionsLockedUntil } from "./timing";
import type { ScoredAttempt } from "./types";

/**
 * Server-side scoring shared by POST /api/mocktest/score and /api/mocktest/attempts.
 * The answer key never leaves the server before submission; the score is always recomputed here.
 * `release` decides whether the answer key + solutions go out with the result: always for the
 * student's own saved attempt, otherwise only when `solutionsLockedUntil` allows (QA-SEC-M6 M1).
 */

export type ScoreOutcome =
  | { ok: true; scored: ScoredAttempt; answers: Answer[]; timeSpentSec: number[]; timeTakenSec: number }
  | { ok: false; fieldErrors: Record<string, string[]> };

export type SolutionRelease = { released: true } | { released: false; releaseAt: number };

/** Anonymous scoring: the key is withheld while a weekly window (plus its last attempts) runs. */
export function publicRelease(test: MockTestDefinition, now: number): SolutionRelease {
  const lockedUntil = solutionsLockedUntil(test, now);
  return lockedUntil === null ? { released: true } : { released: false, releaseAt: lockedUntil };
}

export const OWN_ATTEMPT_RELEASE: SolutionRelease = { released: true };

export function scoreForTest(
  test: MockTestDefinition,
  rawAnswers: readonly unknown[],
  rawTimes: readonly number[] | undefined,
  release: SolutionRelease,
): ScoreOutcome {
  const questions = scorableQuestions(test);
  if (rawAnswers.length !== questions.length) return { ok: false, fieldErrors: { answers: ["length"] } };
  if (rawTimes && rawTimes.length !== questions.length) return { ok: false, fieldErrors: { timeSpentSec: ["length"] } };

  const answers: Answer[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const normalised = normaliseAnswer(questions[i], rawAnswers[i]);
    if (!normalised.ok) return { ok: false, fieldErrors: { answers: ["invalid"] } };
    answers.push(normalised.value);
  }
  const limit = test.durationMinutes * 60;
  const timeSpentSec = questions.map((_, i) => Math.max(0, Math.min(limit, Math.round(rawTimes?.[i] ?? 0))));
  const timeTakenSec = Math.min(limit, timeSpentSec.reduce((sum, t) => sum + t, 0));

  const result = scoreAttempt(questions, answers, timeSpentSec);
  const projection = projectRankBand({ exam: test.exam, score: result.score, maxScore: result.maxScore }, getPredictorData());
  return {
    ok: true,
    answers,
    timeSpentSec,
    timeTakenSec,
    scored: {
      testId: test.id,
      result,
      review: release.released ? reviewItems(test) : [],
      projection,
      sample: isSampleTest(test),
      solutionsReleased: release.released,
      solutionsReleaseAt: release.released ? null : release.releaseAt,
    },
  };
}

/** In-memory limiters (single instance; see src/lib/server/rate-limit.ts). */
export const mocktestLimiters = {
  /** POST /api/mocktest/score — per client IP (loose: a classroom often shares one IP, and every result view re-scores). */
  score: new SlidingWindowRateLimiter({ limit: 300, windowMs: 10 * 60 * 1000 }),
  /** POST /api/mocktest/start — per client IP (a classroom shares one IP). */
  start: new SlidingWindowRateLimiter({ limit: 120, windowMs: 10 * 60 * 1000 }),
  /** GET /api/mocktest/verify/:id — per client IP. */
  verify: new SlidingWindowRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 }),
  /** POST /api/mocktest/attempts — per student. */
  attempts: new SlidingWindowRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 }),
  /** PUT /api/mocktest/profile — per student. */
  profile: new SlidingWindowRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 }),
  /** GET /api/mocktest/leaderboard — per client IP. */
  leaderboard: new SlidingWindowRateLimiter({ limit: 120, windowMs: 10 * 60 * 1000 }),
};

export function resetMocktestLimitersForTests(): void {
  for (const limiter of Object.values(mocktestLimiters)) limiter.reset();
}
