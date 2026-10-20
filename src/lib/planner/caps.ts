/**
 * Plausibility caps for the planner's SELF-REPORTED practice points (QA-SEC-M6 L8). Pure and
 * client-safe. The browser reports each day's [xp, blocks, reviews, bonus]; the server cannot see
 * the work itself, so it only keeps numbers the student's own plan allows:
 *
 * - blocks ticked on a plan day ≤ that day's block count (the plan is regenerated from the saved
 *   settings — it is deterministic), and a day's block XP ≤ the XP of its most valuable blocks;
 * - days before the current plan started (an older plan) ≤ the busiest day of the current plan;
 *   days on or after the exam date have no blocks; no plan at all → the old generic ceiling;
 * - the daily-goal bonus only when every block of the day is ticked;
 * - reviews ≤ `PLANNER_CAPS.maxReviewsPerDay` a day (review XP already stops at 50 a day);
 * - XP ≤ `XP.maxDailyXp` a day; tick masks only for blocks that exist.
 *
 * This bounds what a hand-edited request can claim; it does not make the points verified — the
 * leaderboard says "self-reported practice points".
 */
import type { DateKey } from "./dates";
import { planDayFor } from "./plan";
import { blockXp, XP, type ActivityLog } from "./progress";
import type { PlannerState } from "./state";
import type { PlanDay, StudyPlan } from "./types";

export const PLANNER_CAPS = {
  /** Flashcard + topic reviews counted on one day. */
  maxReviewsPerDay: 200,
  /** Blocks on one day when there is no plan to compare with (9-bit tick mask). */
  genericMaxBlocks: 9,
} as const;

/** XP of the `count` most valuable blocks of a plan day. */
function topBlocksXp(day: PlanDay, count: number): number {
  return day.blocks
    .map((block) => blockXp(block.kind))
    .sort((a, b) => b - a)
    .slice(0, count)
    .reduce((sum, xp) => sum + xp, 0);
}

interface DayLimit {
  blocks: number;
  /** Highest block XP for `n` ticked blocks. */
  blockXp: (n: number) => number;
  /** Whether the daily-goal bonus is possible with `n` ticked blocks. */
  bonus: (n: number) => boolean;
}

function limitsFor(plan: StudyPlan | null): (date: DateKey) => DayLimit {
  const generic: DayLimit = { blocks: PLANNER_CAPS.genericMaxBlocks, blockXp: (n) => n * XP.maxBlockXp, bonus: () => true };
  if (!plan || plan.days.length === 0) return () => generic;
  const busiest = Math.max(...plan.days.map((day) => day.blocks.length));
  const richest = new Map<number, number>();
  const older: DayLimit = {
    blocks: busiest,
    blockXp: (n) => {
      if (!richest.has(n)) richest.set(n, Math.max(...plan.days.map((day) => topBlocksXp(day, n))));
      return richest.get(n) ?? 0;
    },
    bonus: () => true,
  };
  const none: DayLimit = { blocks: 0, blockXp: () => 0, bonus: () => false };
  return (date) => {
    const day = planDayFor(plan, date);
    if (day) return { blocks: day.blocks.length, blockXp: (n) => topBlocksXp(day, n), bonus: (n) => n > 0 && n === day.blocks.length };
    return date < plan.input.startDate ? older : none;
  };
}

/** Clamps a state's activity and tick masks to what `plan` (the student's current plan) allows. */
export function capActivityToPlan(state: PlannerState, plan: StudyPlan | null): PlannerState {
  const limitOf = limitsFor(plan);
  const activity: ActivityLog = {};
  for (const [date, [xp, blocks, reviews, bonus]] of Object.entries(state.activity)) {
    const limit = limitOf(date);
    const b = Math.min(blocks, limit.blocks);
    const r = Math.min(reviews, PLANNER_CAPS.maxReviewsPerDay);
    const g: 0 | 1 = bonus === 1 && limit.bonus(b) ? 1 : 0;
    const cap = Math.min(XP.maxDailyXp, limit.blockXp(b) + Math.min(r, XP.maxReviewsPerDay) * XP.review + g * XP.dailyGoalBonus);
    activity[date] = [Math.min(xp, cap), b, r, g];
  }
  // Ticks only for blocks that exist on a plan day (other days: an older plan's ticks, kept).
  const done: Record<DateKey, number> = {};
  for (const [date, mask] of Object.entries(state.done)) {
    const day = plan ? planDayFor(plan, date) : undefined;
    const kept = day ? mask & ((1 << day.blocks.length) - 1) : mask;
    if (kept > 0) done[date] = kept;
  }
  return { ...state, activity, done };
}
