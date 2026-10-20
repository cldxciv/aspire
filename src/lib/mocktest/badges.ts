/**
 * Badges (pure, client-safe). Simple and honest: they describe what the student did, never a rank
 * claim beyond a real leaderboard position.
 *
 * - first-test: completed at least one mock test.
 * - streak-3:   completed tests on 3 consecutive calendar days (India Standard Time).
 * - top-10:     placed in the top 10 % of a leaderboard with at least 10 participants
 *               (signed-in students who joined the leaderboard only).
 */

export const BADGE_IDS = ["first-test", "streak-3", "top-10"] as const;
export type BadgeId = (typeof BADGE_IDS)[number];

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day number in India Standard Time (days since 1970-01-01 IST). */
export function istDayNumber(epochMs: number): number {
  return Math.floor((epochMs + IST_OFFSET_MS) / DAY_MS);
}

/** Longest run of consecutive IST calendar days that each have at least one completed test. */
export function longestStreakDays(timestamps: readonly number[]): number {
  const days = [...new Set(timestamps.filter(Number.isFinite).map(istDayNumber))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i += 1) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Minimum leaderboard size for a top-10 % badge to mean anything. */
export const TOP_BADGE_MIN_PARTICIPANTS = 10;

/** True when `rank` (1 = best) is within the top 10 % of `total` participants. */
export function isTopTenPercent(rank: number, total: number): boolean {
  if (total < TOP_BADGE_MIN_PARTICIPANTS || rank < 1) return false;
  return rank <= Math.ceil(total * 0.1);
}

export function computeBadges(input: {
  /** Submission times (epoch ms) of completed attempts. */
  attemptTimes: readonly number[];
  /** Leaderboard positions of the student (signed-in, opted-in only). */
  leaderboardPositions?: readonly { rank: number; total: number }[];
}): BadgeId[] {
  const badges: BadgeId[] = [];
  if (input.attemptTimes.length > 0) badges.push("first-test");
  if (longestStreakDays(input.attemptTimes) >= 3) badges.push("streak-3");
  if ((input.leaderboardPositions ?? []).some((p) => isTopTenPercent(p.rank, p.total))) badges.push("top-10");
  return badges;
}
