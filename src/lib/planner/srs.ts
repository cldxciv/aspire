/**
 * Spaced repetition for topics and formula flashcards (A4-PLANNER). Pure and client-safe.
 *
 * A simplified SM-2 (the SuperMemo-2 family used by Anki) with four answers:
 * - again: forgotten → back to the start, seen again today; ease −0.20.
 * - hard:  remembered with effort → interval × 1.2 (at least 1 day); ease −0.15.
 * - good:  1 day, then 3 days, then interval × ease.
 * - easy:  4 days for a new item, else interval × ease × 1.3; ease +0.15.
 * Ease starts at 2.5 and stays within 1.3–3.0; intervals are capped at 180 days.
 */
import { addDays, diffDays, type DateKey } from "./dates";

export const GRADES = ["again", "hard", "good", "easy"] as const;
export type Grade = (typeof GRADES)[number];

export interface ReviewState {
  /** Ease factor × 100, an integer (250 = 2.5). */
  ease: number;
  /** Current interval in days (0 = due again today). */
  interval: number;
  /** Successful reviews in a row. */
  reps: number;
  lapses: number;
  due: DateKey;
}

export const SRS = {
  startEase: 250,
  minEase: 130,
  maxEase: 300,
  maxInterval: 180,
} as const;

const clampEase = (ease: number) => Math.min(SRS.maxEase, Math.max(SRS.minEase, Math.round(ease)));
const clampInterval = (days: number) => Math.min(SRS.maxInterval, Math.max(0, Math.round(days)));

/** A topic or card that was just learnt: first review tomorrow. */
export function newReviewState(today: DateKey): ReviewState {
  return { ease: SRS.startEase, interval: 0, reps: 0, lapses: 0, due: addDays(today, 1) };
}

/** Applies one answer given on `today` (a missing state counts as a brand-new item). */
export function review(state: ReviewState | undefined, grade: Grade, today: DateKey): ReviewState {
  const prev: ReviewState = state ?? { ease: SRS.startEase, interval: 0, reps: 0, lapses: 0, due: today };
  const ease = prev.ease / 100;
  let interval: number;
  let reps = prev.reps;
  let lapses = prev.lapses;
  let nextEase = prev.ease;

  switch (grade) {
    case "again":
      interval = 0;
      reps = 0;
      lapses += prev.reps > 0 ? 1 : 0;
      nextEase = prev.ease - 20;
      break;
    case "hard":
      interval = Math.max(1, prev.interval * 1.2);
      reps += 1;
      nextEase = prev.ease - 15;
      break;
    case "good":
      interval = prev.reps === 0 ? 1 : prev.reps === 1 ? 3 : Math.max(prev.interval + 1, prev.interval * ease);
      reps += 1;
      break;
    case "easy":
      interval = prev.reps === 0 ? 4 : Math.max(prev.interval + 2, prev.interval * ease * 1.3);
      reps += 1;
      nextEase = prev.ease + 15;
      break;
  }
  const days = clampInterval(interval);
  return { ease: clampEase(nextEase), interval: days, reps, lapses, due: addDays(today, days) };
}

/** True when the item should be reviewed on `today` (due today or overdue). */
export function isDue(state: ReviewState, today: DateKey): boolean {
  return diffDays(state.due, today) >= 0;
}

/** Ids whose state is due on `today`, most overdue first (stable by id). */
export function dueIds(states: Readonly<Record<string, ReviewState>>, today: DateKey): string[] {
  return Object.entries(states)
    .filter(([, s]) => isDue(s, today))
    .sort(([idA, a], [idB, b]) => (a.due < b.due ? -1 : a.due > b.due ? 1 : idA < idB ? -1 : 1))
    .map(([id]) => id);
}

/** The interval the next answer would give, for button hints ("good · 3 d"). */
export function previewIntervals(state: ReviewState | undefined, today: DateKey): Record<Grade, number> {
  return {
    again: review(state, "again", today).interval,
    hard: review(state, "hard", today).interval,
    good: review(state, "good", today).interval,
    easy: review(state, "easy", today).interval,
  };
}
