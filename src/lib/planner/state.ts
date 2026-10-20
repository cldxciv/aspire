/**
 * The study planner's saved state (A4-PLANNER): one JSON document per student. Guests keep it in
 * `localStorage`; signed-in students also sync it with `GET/PUT /api/planner/state` (D-034).
 *
 * The plan itself is never stored — it is regenerated from `settings` (src/lib/planner/plan.ts).
 * Everything else is small and bounded (≈ 400 days of history), so a full document stays far below
 * `STATE_LIMITS.maxBytes`. Client-safe (zod only).
 */
import { z } from "zod";
import { addDays, diffDays, isDateKey, type DateKey } from "./dates";
import { PLAN_LIMITS } from "./plan";
import { maxXpFor, type ActivityLog, type DayActivity } from "./progress";
import type { ReviewState } from "./srs";
import { BATCH_IDS, EXAM_IDS, type PlanInput } from "./types";

export const STATE_VERSION = 1;

export const STATE_LIMITS = {
  /** Request body limit for PUT /api/planner/state. */
  maxBytes: 64 * 1024,
  /** Days of history kept (activity and ticked blocks). */
  historyDays: 400,
  maxReviewItems: 400,
  maxWeakTopics: 60,
  /** Highest block index on one day (≤ 9 blocks per day → a 9-bit mask). */
  maxDoneMask: 511,
  maxReviewsPerDay: 2000,
} as const;

/** Default reminder / calendar time: 18:00 IST. */
export const DEFAULT_REMINDER_MINUTES = 18 * 60;

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const dateKey = z.string().refine(isDateKey, "Invalid date");
const itemId = z.string().regex(ID);
const nonNegInt = (max: number) => z.number().int().min(0).max(max);

function boundedRecord<V extends z.ZodType>(key: z.ZodType<string>, value: V, maxEntries: number) {
  return z.record(key, value).refine((obj) => Object.keys(obj).length <= maxEntries, "Too many entries");
}

export const settingsSchema = z.object({
  exam: z.enum(EXAM_IDS),
  batch: z.enum(BATCH_IDS),
  startDate: dateKey,
  examDate: dateKey,
  dailyHours: z
    .number()
    .min(PLAN_LIMITS.minDailyHours)
    .max(PLAN_LIMITS.maxDailyHours)
    .refine((h) => Number.isInteger(h * 2), "Use whole or half hours"),
  weakTopics: z.array(itemId).max(STATE_LIMITS.maxWeakTopics),
  /** Minutes after midnight IST for the reminder and the calendar export. */
  reminderMinutes: nonNegInt(24 * 60 - 1),
  /** In-app notifications while the planner is open (the browser permission is separate). */
  notifications: z.boolean(),
});

export type PlannerSettings = z.infer<typeof settingsSchema>;

/** [ease×100, interval days, reps, lapses, due] — compact form of `ReviewState`. */
const reviewTuple = z.tuple([nonNegInt(1000), nonNegInt(3650), nonNegInt(10_000), nonNegInt(10_000), dateKey]);
export type ReviewTuple = z.infer<typeof reviewTuple>;

const dayActivity = z.tuple([
  nonNegInt(100_000),
  nonNegInt(100),
  nonNegInt(STATE_LIMITS.maxReviewsPerDay),
  z.union([z.literal(0), z.literal(1)]),
]);

export const plannerStateSchema = z.object({
  v: z.literal(STATE_VERSION),
  /** Client clock (epoch ms) of the last change: newest copy wins when devices sync. */
  updatedAt: z.number().int().min(0).max(8.64e15),
  settings: settingsSchema.nullable(),
  /** Ticked blocks per day: bit n = block n of that day's plan. */
  done: boundedRecord(dateKey, nonNegInt(STATE_LIMITS.maxDoneMask), STATE_LIMITS.historyDays + 2),
  cards: boundedRecord(itemId, reviewTuple, STATE_LIMITS.maxReviewItems),
  topics: boundedRecord(itemId, reviewTuple, STATE_LIMITS.maxReviewItems),
  activity: boundedRecord(dateKey, dayActivity, STATE_LIMITS.historyDays + 2),
});

export type PlannerState = Omit<z.infer<typeof plannerStateSchema>, "activity"> & { activity: ActivityLog };

export function emptyState(): PlannerState {
  return { v: STATE_VERSION, updatedAt: 0, settings: null, done: {}, cards: {}, topics: {}, activity: {} };
}

/** Parses untrusted JSON (localStorage or the API); `null` when it is not a valid state. */
export function parseState(value: unknown): PlannerState | null {
  const parsed = plannerStateSchema.safeParse(value);
  return parsed.success ? (parsed.data as PlannerState) : null;
}

export function toReviewState([ease, interval, reps, lapses, due]: ReviewTuple): ReviewState {
  return { ease, interval, reps, lapses, due };
}

export function toReviewTuple(state: ReviewState): ReviewTuple {
  return [state.ease, state.interval, state.reps, state.lapses, state.due];
}

export function reviewStates(map: Readonly<Record<string, ReviewTuple>>): Record<string, ReviewState> {
  return Object.fromEntries(Object.entries(map).map(([id, tuple]) => [id, toReviewState(tuple)]));
}

/** The plan input stored in the settings. */
export function planInputOf(settings: PlannerSettings): PlanInput {
  return {
    exam: settings.exam,
    batch: settings.batch,
    startDate: settings.startDate,
    examDate: settings.examDate,
    dailyHours: settings.dailyHours,
    weakTopics: settings.weakTopics,
  };
}

export function isBitSet(mask: number | undefined, index: number): boolean {
  return ((mask ?? 0) & (1 << index)) !== 0;
}

export function setBit(mask: number | undefined, index: number, on: boolean): number {
  return on ? (mask ?? 0) | (1 << index) : (mask ?? 0) & ~(1 << index);
}

/**
 * Server-side clean-up of a state a browser sent (D-034: the server never trusts client numbers
 * for the leaderboard). Keeps the last `historyDays` days only, drops dates after tomorrow (IST),
 * and clamps each day's XP to what its counts allow (`maxXpFor`).
 */
export function sanitizeState(state: PlannerState, today: DateKey): PlannerState {
  const keep = (date: DateKey, futureDays: number) => {
    const age = diffDays(date, today);
    return age < STATE_LIMITS.historyDays && age >= -futureDays;
  };
  const activity: ActivityLog = {};
  for (const [date, day] of Object.entries(state.activity)) {
    if (!keep(date, 0)) continue;
    const [, blocks, reviews, bonus] = day;
    const counts: DayActivity = [0, Math.min(blocks, 9), reviews, bonus];
    activity[date] = [Math.min(day[0], maxXpFor(counts)), counts[1], reviews, bonus];
  }
  const done: Record<DateKey, number> = {};
  for (const [date, mask] of Object.entries(state.done)) if (keep(date, 1) && mask > 0) done[date] = mask;
  return { ...state, activity, done };
}

/** Removes ticks and activity outside the kept window (client, before saving). */
export function pruneState(state: PlannerState, today: DateKey): PlannerState {
  const oldest = addDays(today, -(STATE_LIMITS.historyDays - 1));
  const within = <T,>(record: Record<DateKey, T>) =>
    Object.fromEntries(Object.entries(record).filter(([date]) => date >= oldest && date <= addDays(today, 1)));
  return { ...state, done: within(state.done), activity: within(state.activity) as ActivityLog };
}
