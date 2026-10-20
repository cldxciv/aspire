/**
 * State transitions of the study planner (A4-PLANNER). Pure and client-safe: the UI calls these
 * inside `plannerStore.update`, the tests call them directly. Every function returns the same
 * object when nothing changes.
 */
import { type DateKey } from "./dates";
import { planDayFor, planInputChanged } from "./plan";
import { applyBlockToggle, applyDailyGoal, applyReview } from "./progress";
import { dueIds, newReviewState, review, type Grade } from "./srs";
import {
  isBitSet,
  planInputOf,
  reviewStates,
  setBit,
  STATE_LIMITS,
  toReviewState,
  toReviewTuple,
  type PlannerSettings,
  type PlannerState,
} from "./state";
import type { StudyPlan } from "./types";

/**
 * Ticks (`done = true`) or un-ticks block `index` of TODAY's plan day. Moves the block's XP and the
 * daily-goal bonus with it, and puts the topics of a ticked learn/practice block into spaced
 * revision (first review tomorrow). Other days are read-only.
 */
export function toggleBlock(state: PlannerState, plan: StudyPlan, today: DateKey, index: number, done: boolean): PlannerState {
  const day = planDayFor(plan, today);
  const block = day?.blocks[index];
  if (!day || !block) return state;
  if (isBitSet(state.done[today], index) === done) return state;

  const mask = setBit(state.done[today], index, done);
  const allDone = day.blocks.every((b) => isBitSet(mask, b.index));
  const activity = applyDailyGoal(applyBlockToggle(state.activity[today], block.kind, done), allDone);

  let topics = state.topics;
  if (done && (block.kind === "learn" || block.kind === "practice")) {
    for (const id of block.topicIds) {
      if (topics[id] || Object.keys(topics).length >= STATE_LIMITS.maxReviewItems) continue;
      topics = { ...topics, [id]: toReviewTuple(newReviewState(today)) };
    }
  }

  const doneMap = { ...state.done };
  if (mask === 0) delete doneMap[today];
  else doneMap[today] = mask;
  return { ...state, done: doneMap, activity: { ...state.activity, [today]: activity }, topics };
}

export type ReviewKind = "card" | "topic";

/** Records one spaced-repetition answer for a flashcard or a topic, with its review XP. */
export function recordReview(state: PlannerState, kind: ReviewKind, id: string, grade: Grade, today: DateKey): PlannerState {
  const map = kind === "card" ? state.cards : state.topics;
  const previous = map[id];
  if (!previous && Object.keys(map).length >= STATE_LIMITS.maxReviewItems) return state;
  const next = toReviewTuple(review(previous ? toReviewState(previous) : undefined, grade, today));
  const day = state.activity[today];
  // The count is capped so the saved document always stays valid (XP stops much earlier).
  const activity = day && day[2] >= STATE_LIMITS.maxReviewsPerDay ? day : applyReview(day);
  const updated = { ...map, [id]: next };
  return {
    ...state,
    cards: kind === "card" ? updated : state.cards,
    topics: kind === "topic" ? updated : state.topics,
    activity: { ...state.activity, [today]: activity },
  };
}

/**
 * Saves new settings. When a planning field changed, the new plan starts today: ticks from today
 * on belong to the old plan and are cleared; XP, streaks and review progress stay.
 */
export function applySettings(state: PlannerState, next: PlannerSettings, today: DateKey): PlannerState {
  const previous = state.settings;
  const changed = planInputChanged(previous ? planInputOf(previous) : null, planInputOf(next));
  if (!changed) {
    const settings = { ...next, startDate: previous?.startDate ?? next.startDate };
    return JSON.stringify(settings) === JSON.stringify(previous) ? state : { ...state, settings };
  }
  const done = Object.fromEntries(Object.entries(state.done).filter(([date]) => date < today));
  return { ...state, settings: { ...next, startDate: today }, done };
}

export interface DueItems {
  /** Topic ids due today or overdue, most overdue first. */
  topics: string[];
  /** Flashcard ids due today or overdue (only cards in `cardIds`). */
  cards: string[];
}

export function dueItems(state: PlannerState, today: DateKey, cardIds: ReadonlySet<string>, topicIds: ReadonlySet<string>): DueItems {
  return {
    topics: dueIds(reviewStates(state.topics), today).filter((id) => topicIds.has(id)),
    cards: dueIds(reviewStates(state.cards), today).filter((id) => cardIds.has(id)),
  };
}

/** Blocks of today's plan that are not ticked yet. */
export function openBlocksToday(state: PlannerState, plan: StudyPlan | null, today: DateKey): number {
  const day = plan ? planDayFor(plan, today) : undefined;
  return day ? day.blocks.filter((b) => !isBitSet(state.done[today], b.index)).length : 0;
}
