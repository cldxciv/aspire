import "server-only";

import { getDb } from "@/lib/db/connection";
import { addDays, diffDays, istDateKey, weekStart, type DateKey } from "../dates";
import { computeStreak, consistency, type ActivityLog } from "../progress";
import type { PlannerState } from "../state";
import type { ExamId } from "../types";
import { getDailyRows, getStoredState, type DailyRow } from "./store";

/**
 * Parent / portal summary of one student's planner (A4-PLANNER → Phase 2 PORTAL-INTEGRATION).
 *
 * Only counts and booleans: no plan contents, no flashcards, no nickname. The caller MUST have
 * authorised access to `userId` first (student = self; parent = linked learner, via
 * `requireStudentRecord` / `canAccessStudentRecord`). Request-time only: call it after the
 * session has been read (it reads the clock), never while prerendering.
 */
export interface PlannerSummary {
  /** False when the student has never saved a plan from a signed-in device. */
  hasPlan: boolean;
  exam: ExamId | null;
  examDate: DateKey | null;
  /** Whole days from today (IST) to the exam; null without a plan or after the exam. */
  daysToExam: number | null;
  streak: { current: number; best: number; todayDone: boolean };
  xp: { total: number; thisWeek: number };
  /** The last 30 IST days, oldest first. */
  last30Days: { date: DateKey; active: boolean; xp: number }[];
  activeDaysLast30: number;
  blocksDoneLast30: number;
  reviewsLast30: number;
  lastActiveDate: DateKey | null;
  /** Server time of the last sync (epoch ms), or null. */
  lastSyncedAt: number | null;
}

/** Pure part of `getPlannerSummary`, for tests and other callers that already hold the rows. */
export function summarisePlanner(
  stored: { state: PlannerState; updatedAt: number } | null,
  rows: readonly DailyRow[],
  today: DateKey,
): PlannerSummary {
  const log: ActivityLog = {};
  for (const row of rows) log[row.day] = [row.xp, row.blocks, row.reviews, 0];
  const streak = computeStreak(log, today);
  const last30 = consistency(log, today, 30);
  const since = addDays(today, -29);
  const recent = rows.filter((row) => row.day >= since && row.day <= today);
  const from = weekStart(today);
  const settings = stored?.state.settings ?? null;
  const daysToExam = settings ? diffDays(today, settings.examDate) : null;
  const activeDays = rows.filter((row) => row.xp > 0 && row.day <= today).map((row) => row.day).sort();
  return {
    hasPlan: settings !== null,
    exam: settings?.exam ?? null,
    examDate: settings?.examDate ?? null,
    daysToExam: daysToExam !== null && daysToExam >= 0 ? daysToExam : null,
    streak: { current: streak.current, best: streak.best, todayDone: streak.todayDone },
    xp: {
      total: rows.reduce((sum, row) => sum + row.xp, 0),
      thisWeek: rows.filter((row) => row.day >= from && row.day <= today).reduce((sum, row) => sum + row.xp, 0),
    },
    last30Days: last30,
    activeDaysLast30: last30.filter((day) => day.active).length,
    blocksDoneLast30: recent.reduce((sum, row) => sum + row.blocks, 0),
    reviewsLast30: recent.reduce((sum, row) => sum + row.reviews, 0),
    lastActiveDate: activeDays.length > 0 ? activeDays[activeDays.length - 1] : null,
    lastSyncedAt: stored?.updatedAt ?? null,
  };
}

/**
 * Streak, XP and 30-day consistency for one student, from the server copy (signed-in devices only;
 * guest progress never leaves the browser). See the authorisation note above.
 */
export function getPlannerSummary(userId: string, now: number = Date.now()): PlannerSummary {
  const db = getDb();
  const today = istDateKey(now);
  const stored = getStoredState(db, userId);
  const rows = getDailyRows(db, userId, addDays(today, -400), today);
  return summarisePlanner(stored, rows, today);
}
