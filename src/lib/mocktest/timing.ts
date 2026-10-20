import type { TestWindow } from "@/content/mocktest/types";

/**
 * Server-timed attempts, leaderboard eligibility and answer-key release (QA-SEC-M6 M1). Pure and
 * client-safe: the API applies these rules, the UI uses the same numbers in its copy.
 *
 * - Only WEEKLY tests with scheduled windows have a leaderboard. Practice tests are pure practice:
 *   their answer key and solutions are released straight after scoring, as before.
 * - A leaderboard attempt needs a server-issued start (POST /api/mocktest/start) made by the
 *   signed-in student while a window was open. The server measures the duration from that start
 *   to the save; the browser's clock is never used for ranking.
 * - An attempt that is too quick (< `minDurationMs`) or too slow (> the time limit + grace), or
 *   that has no valid start, is still saved and scored — as practice, never rejected.
 * - While a weekly window is open (and until every attempt started in it must have finished),
 *   anonymous scoring withholds the correct options and solutions.
 */

export const ATTEMPT_TIMING = {
  /** A leaderboard attempt must last at least this share of the test's time … */
  minFraction: 0.25,
  /** … and at least this long (never more than the test's own time). */
  minFloorMs: 5 * 60 * 1000,
  /** Allowance after the time limit for the save request (slow networks, auto-submit). */
  graceMs: 2 * 60 * 1000,
} as const;

/** Why a saved attempt is practice only (not on a leaderboard). */
export const PRACTICE_REASONS = [
  "practice_test",
  "no_start",
  "signed_out_start",
  "start_invalid",
  "outside_window",
  "too_fast",
  "too_slow",
] as const;
export type PracticeReason = (typeof PRACTICE_REASONS)[number];

export function isPracticeReason(value: unknown): value is PracticeReason {
  return typeof value === "string" && (PRACTICE_REASONS as readonly string[]).includes(value);
}

interface TimedTest {
  kind: "practice" | "weekly";
  durationMinutes: number;
  windows?: readonly TestWindow[];
}

/** True for tests that have leaderboards: weekly tests with at least one scheduled window. */
export function isLeaderboardTest(test: Pick<TimedTest, "kind" | "windows">): boolean {
  return test.kind === "weekly" && (test.windows?.length ?? 0) > 0;
}

export function minDurationMs(durationMinutes: number): number {
  const limit = durationMinutes * 60 * 1000;
  return Math.min(limit, Math.max(ATTEMPT_TIMING.minFloorMs, Math.round(limit * ATTEMPT_TIMING.minFraction)));
}

export function maxDurationMs(durationMinutes: number): number {
  return durationMinutes * 60 * 1000 + ATTEMPT_TIMING.graceMs;
}

/** The window open at `now`, if any. */
export function openWindowAt(windows: readonly TestWindow[] | undefined, now: number): TestWindow | null {
  return windows?.find((w) => Date.parse(w.startsAt) <= now && now <= Date.parse(w.endsAt)) ?? null;
}

/**
 * When the answer key of a leaderboard test may be shown to anyone: `null` = now; otherwise the
 * time (epoch ms) it unlocks. Attempts may start until a window's end and run for the time limit
 * plus grace, so a window keeps the key locked until then — and a window that opens before that
 * (back-to-back weeks of the same test) extends the lock to its own end.
 */
export function solutionsLockedUntil(test: TimedTest, now: number): number | null {
  if (!isLeaderboardTest(test)) return null;
  const tail = maxDurationMs(test.durationMinutes);
  const spans = (test.windows ?? [])
    .map((w) => ({ start: Date.parse(w.startsAt), release: Date.parse(w.endsAt) + tail }))
    .sort((a, b) => a.start - b.start);
  let lockedUntil: number | null = null;
  for (const span of spans) {
    if (lockedUntil !== null && span.start <= lockedUntil) lockedUntil = Math.max(lockedUntil, span.release);
    else if (span.start <= now && now < span.release) lockedUntil = span.release;
    else if (lockedUntil !== null) break;
  }
  return lockedUntil;
}

/** The server's record of a start, as found when an attempt is saved. */
export type StartCheck =
  | { status: "missing" }
  | { status: "unknown" | "used" | "other_user" | "other_test" | "guest" }
  | { status: "ok"; startedAt: number; windowId: string | null };

export interface AttemptTiming {
  leaderboard: boolean;
  practiceReason: PracticeReason | null;
  /** Server start time (epoch ms) when a valid start was used. */
  serverStartedAt: number | null;
  /** Server time of the save (epoch ms). */
  serverSubmittedAt: number;
  /** Server-measured duration in whole seconds (start → save), when a valid start was used. */
  durationSec: number | null;
  /** The window a leaderboard attempt counts for (the one open at its server start). */
  windowId: string | null;
}

/** Decides whether a saved attempt is leaderboard-eligible, from server facts only. */
export function evaluateAttempt(input: { test: TimedTest; start: StartCheck; now: number }): AttemptTiming {
  const { test, start, now } = input;
  const practice = (reason: PracticeReason, extra: Partial<AttemptTiming> = {}): AttemptTiming => ({
    leaderboard: false,
    practiceReason: reason,
    serverStartedAt: null,
    serverSubmittedAt: now,
    durationSec: null,
    windowId: null,
    ...extra,
  });
  if (start.status !== "ok") {
    if (!isLeaderboardTest(test)) return practice("practice_test");
    if (start.status === "missing") return practice("no_start");
    if (start.status === "guest") return practice("signed_out_start");
    return practice("start_invalid");
  }
  const elapsed = Math.max(0, now - start.startedAt);
  const timed = { serverStartedAt: start.startedAt, durationSec: Math.round(elapsed / 1000) };
  if (!isLeaderboardTest(test)) return practice("practice_test", timed);
  if (start.windowId === null) return practice("outside_window", timed);
  if (elapsed < minDurationMs(test.durationMinutes)) return practice("too_fast", timed);
  if (elapsed > maxDurationMs(test.durationMinutes)) return practice("too_slow", timed);
  return { leaderboard: true, practiceReason: null, serverSubmittedAt: now, windowId: start.windowId, ...timed };
}

// ---------------------------------------------------------------------------------------------
// Certificate verification (L7)

export const SCORE_BANDS = ["below-0", "0-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70-79", "80-89", "90-100"] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number];

/** Score as a 10-point percentage band of the maximum (the verify page never shows the exact score). */
export function scoreBand(score: number, maxScore: number): ScoreBand {
  if (maxScore <= 0) return "0-9";
  const pct = (score / maxScore) * 100;
  if (pct < 0) return "below-0";
  const low = Math.min(90, Math.floor(pct / 10) * 10);
  return SCORE_BANDS[low / 10 + 1];
}

/** Verification ids: 16 hex characters, shown as XXXX-XXXX-XXXX-XXXX. */
const VERIFY_ID = /^[0-9a-f]{16}$/;

/** Normalises a typed verification id (case, spaces, dashes); `null` when it cannot be one. */
export function normaliseVerifyId(raw: string): string | null {
  const id = raw.toLowerCase().replace(/[\s-]/g, "");
  return VERIFY_ID.test(id) ? id : null;
}

export function formatVerifyId(id: string): string {
  return (id.toUpperCase().match(/.{1,4}/g) ?? [id]).join("-");
}
