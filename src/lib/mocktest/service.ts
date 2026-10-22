import "server-only";

import type { MockSubject, MockTestDefinition } from "@/content/mocktest/types";
import { SlidingWindowRateLimiter } from "@/lib/server/rate-limit";
import { getPredictorData } from "@/lib/predictor/data";
import { reviewItems, scorableQuestions, isSampleTest } from "./catalog";
import { projectRankBand } from "./projection";
import { normaliseAnswer, scoreAttempt, type Answer, type ScorableQuestion, type ScoreResult } from "./scoring";
import { solutionsLockedUntil } from "./timing";
import type { MockProjection, ReviewItem, ScoredAttempt } from "./types";

/**
 * Server-side scoring shared by POST /api/mocktest/score and /api/mocktest/attempts.
 * The answer key never leaves the server before submission; the score is always recomputed here.
 * `release` decides whether the answer key + solutions go out with the result: always for the
 * student's own saved attempt, otherwise only when `solutionsLockedUntil` allows (QA-SEC-M6 M1).
 */

export type ScoreOutcome<S extends string = MockSubject> =
  | { ok: true; scored: ScoredAttempt<S>; answers: Answer[]; timeSpentSec: number[]; timeTakenSec: number }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Anything the server can score: a fixed test (`scoreForTest` builds one from its definition) or
 * a generated paper (src/lib/mocktest/generated.ts builds one from the paper's approved snapshots
 * with key corrections applied).
 */
export interface ScorableTest<S extends string = MockSubject> {
  id: string;
  /** Time limit used to clamp the browser's per-question times (minutes, incl. compensatory time). */
  durationMinutes: number;
  questions: readonly ScorableQuestion<S>[];
  /** Released with the result only when `release` allows. */
  review: readonly ReviewItem[];
  sample: boolean;
  /** Rank projection for this result (null = none, e.g. a shorter or sample paper). */
  project: (result: ScoreResult<S>) => MockProjection | null;
}

export type SolutionRelease = { released: true } | { released: false; releaseAt: number };

/** Anonymous scoring: the key is withheld while a weekly window (plus its last attempts) runs. */
export function publicRelease(test: MockTestDefinition, now: number): SolutionRelease {
  const lockedUntil = solutionsLockedUntil(test, now);
  return lockedUntil === null ? { released: true } : { released: false, releaseAt: lockedUntil };
}

export const OWN_ATTEMPT_RELEASE: SolutionRelease = { released: true };

/**
 * Scores a fixed test. `options.legacyNumericalMarking` re-scores with the samples' old JEE
 * numerical marking (+4 / 0, before the 22 Oct 2026 fix to the bulletin's +4 / −1), so a saved
 * attempt from before the fix keeps its stored score when it is viewed again (see the attempts API).
 */
export function scoreForTest(
  test: MockTestDefinition,
  rawAnswers: readonly unknown[],
  rawTimes: readonly number[] | undefined,
  release: SolutionRelease,
  options: { legacyNumericalMarking?: boolean } = {},
): ScoreOutcome {
  const questions = scorableQuestions(test).map((q) =>
    options.legacyNumericalMarking && q.type === "numerical" && test.exam === "JEE_MAIN" ? { ...q, marking: { ...q.marking, wrong: 0 } } : q,
  );
  return scoreForScorable(
    {
      id: test.id,
      durationMinutes: test.durationMinutes,
      questions,
      review: reviewItems(test),
      sample: isSampleTest(test),
      project: (result) => projectRankBand({ exam: test.exam, score: result.score, maxScore: result.maxScore }, getPredictorData()),
    },
    rawAnswers,
    rawTimes,
    release,
  );
}

/**
 * Scores any `ScorableTest` from its answer key (the browser's score is never used): validates
 * every answer (422 field errors on the wrong count or a malformed answer), clamps the browser's
 * per-question times to the time limit and releases the key + solutions only when `release` says so.
 */
export function scoreForScorable<S extends string = MockSubject>(
  test: ScorableTest<S>,
  rawAnswers: readonly unknown[],
  rawTimes: readonly number[] | undefined,
  release: SolutionRelease,
): ScoreOutcome<S> {
  const questions = test.questions;
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
  return {
    ok: true,
    answers,
    timeSpentSec,
    timeTakenSec,
    scored: {
      testId: test.id,
      result,
      review: release.released ? [...test.review] : [],
      projection: test.project(result),
      sample: test.sample,
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
  // Generated question papers (docs/question-bank-plan.md §B13). A school lab shares one IP.
  /** POST /api/mocktest/papers — per client IP, 150 per 10 minutes … */
  papers: new SlidingWindowRateLimiter({ limit: 150, windowMs: 10 * 60 * 1000 }),
  /** … and 600 per day … */
  papersDaily: new SlidingWindowRateLimiter({ limit: 600, windowMs: 24 * 60 * 60 * 1000 }),
  /** … and 10 per hour per signed-in student. */
  papersStudent: new SlidingWindowRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
  /** GET /api/mocktest/papers/readiness — per client IP. */
  readiness: new SlidingWindowRateLimiter({ limit: 300, windowMs: 10 * 60 * 1000 }),
  /** GET /api/mocktest/papers/:id (resume) — per client IP. */
  paper: new SlidingWindowRateLimiter({ limit: 300, windowMs: 10 * 60 * 1000 }),
  /** POST /api/mocktest/papers/:id/report — per client IP. */
  report: new SlidingWindowRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 }),
  /** GET /api/qb/figures/:id — per client IP (a paper may have dozens of figures; responses are cached for a year). */
  figure: new SlidingWindowRateLimiter({ limit: 1200, windowMs: 10 * 60 * 1000 }),
};

export function resetMocktestLimitersForTests(): void {
  for (const limiter of Object.values(mocktestLimiters)) limiter.reset();
}
