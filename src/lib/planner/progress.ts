/**
 * XP, daily activity and streaks for the study planner (A4-PLANNER). Pure and client-safe; the
 * server reuses the same rules to clamp what a browser reports (src/lib/planner/state.ts).
 *
 * XP is credited to the IST day on which the work is ticked off. Only today's plan blocks can be
 * ticked (and un-ticked, which takes the XP back), so a day's XP always matches that day's work.
 */
import { addDays, dateRange, diffDays, weekStart, type DateKey } from "./dates";
import type { BlockKind } from "./types";

export const XP = {
  block: { learn: 10, practice: 10, revise: 8, spaced: 5, mock: 30, analysis: 10, buffer: 5 } satisfies Record<BlockKind, number>,
  /** Per flashcard or topic review. */
  review: 2,
  /** Review XP stops counting after this many reviews in a day (no grinding). */
  maxReviewsPerDay: 50,
  /** Once a day, when every block of today's plan is ticked. */
  dailyGoalBonus: 20,
  /** Hard ceiling the server enforces per day. */
  maxDailyXp: 400,
  /** Highest XP a single block can give (mock). */
  maxBlockXp: 30,
} as const;

export const STREAK = {
  /** One freeze is earned for every 7 streak days … */
  freezeEvery: 7,
  /** … up to this many in reserve. A missed day uses one automatically. */
  maxFreezes: 2,
} as const;

/** One day of activity: [xp, blocks ticked, reviews done, daily-goal bonus given (0/1)]. */
export type DayActivity = [xp: number, blocks: number, reviews: number, bonus: 0 | 1];
export type ActivityLog = Record<DateKey, DayActivity>;

export const EMPTY_DAY: DayActivity = [0, 0, 0, 0];

export function blockXp(kind: BlockKind): number {
  return XP.block[kind];
}

/** XP a day can legitimately hold given its counts (server-side clamp). */
export function maxXpFor([, blocks, reviews, bonus]: DayActivity): number {
  const raw = blocks * XP.maxBlockXp + Math.min(reviews, XP.maxReviewsPerDay) * XP.review + bonus * XP.dailyGoalBonus;
  return Math.min(XP.maxDailyXp, raw);
}

/** Ticking (`done = true`) or un-ticking a block of kind `kind` today. */
export function applyBlockToggle(day: DayActivity | undefined, kind: BlockKind, done: boolean): DayActivity {
  const [xp, blocks, reviews, bonus] = day ?? EMPTY_DAY;
  const delta = blockXp(kind);
  return done
    ? [xp + delta, blocks + 1, reviews, bonus]
    : [Math.max(0, xp - delta), Math.max(0, blocks - 1), reviews, bonus];
}

/** Adds or removes the daily-goal bonus so it matches "all of today's blocks are ticked". */
export function applyDailyGoal(day: DayActivity | undefined, allDone: boolean): DayActivity {
  const [xp, blocks, reviews, bonus] = day ?? EMPTY_DAY;
  if (allDone && bonus === 0) return [xp + XP.dailyGoalBonus, blocks, reviews, 1];
  if (!allDone && bonus === 1) return [Math.max(0, xp - XP.dailyGoalBonus), blocks, reviews, 0];
  return [xp, blocks, reviews, bonus];
}

/** One review (flashcard or topic). XP stops after `maxReviewsPerDay`, the count does not. */
export function applyReview(day: DayActivity | undefined): DayActivity {
  const [xp, blocks, reviews, bonus] = day ?? EMPTY_DAY;
  const gain = reviews < XP.maxReviewsPerDay ? XP.review : 0;
  return [xp + gain, blocks, reviews + 1, bonus];
}

/** A day counts towards the streak when it earned any XP. */
export function isActiveDay(day: DayActivity | undefined): boolean {
  return !!day && day[0] > 0;
}

export function totalXp(log: ActivityLog): number {
  return Object.values(log).reduce((sum, [xp]) => sum + xp, 0);
}

/** XP from Monday of `today`'s IST week up to `today`. */
export function weeklyXp(log: ActivityLog, today: DateKey): number {
  const from = weekStart(today);
  return Object.entries(log).reduce((sum, [date, [xp]]) => (date >= from && date <= today ? sum + xp : sum), 0);
}

export interface StreakInfo {
  /** Consecutive active days ending today (or yesterday, while today is still open). */
  current: number;
  best: number;
  /** Freezes in reserve. */
  freezes: number;
  /** Missed days that a freeze covered (within the current streak). */
  frozenDates: DateKey[];
  todayDone: boolean;
}

/**
 * Streak with a freeze rule:
 * - every active day adds 1; every 7th streak day earns a freeze (max 2 in reserve);
 * - a missed day uses a freeze if one is left (the streak survives but does not grow), otherwise
 *   the streak resets to 0;
 * - today never breaks the streak: it is still open until midnight IST.
 */
export function computeStreak(log: ActivityLog, today: DateKey): StreakInfo {
  const active = Object.keys(log).filter((date) => isActiveDay(log[date]) && date <= today).sort();
  const todayDone = isActiveDay(log[today]);
  if (active.length === 0) return { current: 0, best: 0, freezes: 0, frozenDates: [], todayDone };

  let current = 0;
  let best = 0;
  let freezes = 0;
  let frozenDates: DateKey[] = [];
  const activeSet = new Set(active);
  for (const date of dateRange(active[0], today)) {
    if (activeSet.has(date)) {
      current += 1;
      if (current % STREAK.freezeEvery === 0 && freezes < STREAK.maxFreezes) freezes += 1;
      best = Math.max(best, current);
    } else if (date === today) {
      // Still open.
    } else if (current > 0 && freezes > 0) {
      freezes -= 1;
      frozenDates.push(date);
    } else {
      current = 0;
      freezes = 0;
      frozenDates = [];
    }
  }
  return { current, best, freezes, frozenDates, todayDone };
}

export interface ConsistencyDay {
  date: DateKey;
  active: boolean;
  xp: number;
}

/** The last `days` days ending today, oldest first (for the parent view and the heat strip). */
export function consistency(log: ActivityLog, today: DateKey, days = 30): ConsistencyDay[] {
  return dateRange(addDays(today, -(days - 1)), today).map((date) => ({
    date,
    active: isActiveDay(log[date]),
    xp: log[date]?.[0] ?? 0,
  }));
}

/** Drops activity older than `keepDays` before `today` and anything dated after `today`. */
export function pruneActivity(log: ActivityLog, today: DateKey, keepDays = 400): ActivityLog {
  const out: ActivityLog = {};
  for (const [date, day] of Object.entries(log)) {
    const age = diffDays(date, today);
    if (age >= 0 && age < keepDays) out[date] = day;
  }
  return out;
}
