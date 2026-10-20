import { isAnswered, type Answer } from "./scoring";

/**
 * CBT runner state machine (pure, client-safe). The question palette follows the NTA convention:
 *
 * | Status           | Meaning                                              |
 * |------------------|------------------------------------------------------|
 * | notVisited       | never opened                                         |
 * | notAnswered      | opened, no response                                  |
 * | answered         | response saved                                       |
 * | marked           | marked for review, no response (NOT evaluated)       |
 * | answeredMarked   | response saved and marked for review (IS evaluated)  |
 *
 * A response is saved as soon as it is chosen (and autosaved on the device). "Save & Next" clears
 * the review mark and moves on; "Mark for Review & Next" sets it and moves on; "Clear Response"
 * removes the response. Time is accrued to the question on screen.
 */

export const RUNNER_STATE_VERSION = 1;

export type PaletteStatus = "notVisited" | "notAnswered" | "answered" | "marked" | "answeredMarked";
export const PALETTE_STATUSES: readonly PaletteStatus[] = ["notVisited", "notAnswered", "answered", "marked", "answeredMarked"];

export interface RunnerState {
  version: typeof RUNNER_STATE_VERSION;
  testId: string;
  /** Client-generated id; the server de-duplicates saved attempts with it. */
  attemptId: string;
  /** One-time token from POST /api/mocktest/start (server-timed attempts); absent when none. */
  startToken?: string | null;
  startedAt: number;
  /** startedAt + duration. The test auto-submits at this moment (device clock). */
  deadline: number;
  current: number;
  answers: Answer[];
  marked: boolean[];
  visited: boolean[];
  timeSpentMs: number[];
  lastTickAt: number;
  submittedAt: number | null;
  submitReason: "manual" | "timeout" | null;
}

export type RunnerAction =
  | { type: "answer"; value: Answer; now: number }
  | { type: "clear"; now: number }
  | { type: "goto"; index: number; now: number }
  | { type: "saveNext"; now: number }
  | { type: "markNext"; now: number }
  | { type: "previous"; now: number }
  | { type: "tick"; now: number }
  | { type: "resume"; now: number }
  | { type: "submit"; now: number; reason: "manual" | "timeout" };

/** Largest gap credited to one question in a single step (sleeping tabs, clock jumps). */
export const MAX_TICK_GAP_MS = 10 * 60 * 1000;

export function createRunnerState(input: {
  testId: string;
  attemptId: string;
  questionCount: number;
  durationMinutes: number;
  now: number;
  startToken?: string | null;
}): RunnerState {
  const { questionCount: n, now } = input;
  return {
    version: RUNNER_STATE_VERSION,
    testId: input.testId,
    attemptId: input.attemptId,
    startToken: input.startToken ?? null,
    startedAt: now,
    deadline: now + input.durationMinutes * 60 * 1000,
    current: 0,
    answers: Array.from({ length: n }, () => null),
    marked: Array.from({ length: n }, () => false),
    visited: Array.from({ length: n }, (_, i) => i === 0),
    timeSpentMs: Array.from({ length: n }, () => 0),
    lastTickAt: now,
    submittedAt: null,
    submitReason: null,
  };
}

/** Credits the time since the last step to the current question (never past the deadline). */
function accrue(state: RunnerState, now: number): RunnerState {
  const until = Math.min(now, state.deadline);
  const gap = Math.max(0, Math.min(MAX_TICK_GAP_MS, until - state.lastTickAt));
  if (gap === 0 && now === state.lastTickAt) return state;
  const timeSpentMs = state.timeSpentMs.slice();
  timeSpentMs[state.current] = (timeSpentMs[state.current] ?? 0) + gap;
  return { ...state, timeSpentMs, lastTickAt: Math.max(state.lastTickAt, now) };
}

function moveTo(state: RunnerState, index: number): RunnerState {
  const target = Math.max(0, Math.min(state.answers.length - 1, index));
  if (target === state.current && state.visited[target]) return state;
  const visited = state.visited.slice();
  visited[target] = true;
  return { ...state, current: target, visited };
}

function setAt<T>(list: readonly T[], index: number, value: T): T[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}

export function runnerReducer(state: RunnerState, action: RunnerAction): RunnerState {
  if (state.submittedAt !== null) return state;
  switch (action.type) {
    case "tick":
      return accrue(state, action.now);
    case "resume":
      return { ...state, lastTickAt: action.now };
    case "answer": {
      const next = accrue(state, action.now);
      return { ...next, answers: setAt(next.answers, next.current, isAnswered(action.value) ? action.value : null) };
    }
    case "clear": {
      const next = accrue(state, action.now);
      return { ...next, answers: setAt(next.answers, next.current, null) };
    }
    case "goto":
      return moveTo(accrue(state, action.now), action.index);
    case "previous": {
      const next = accrue(state, action.now);
      return moveTo(next, next.current - 1);
    }
    case "saveNext": {
      const next = accrue(state, action.now);
      return moveTo({ ...next, marked: setAt(next.marked, next.current, false) }, next.current + 1);
    }
    case "markNext": {
      const next = accrue(state, action.now);
      return moveTo({ ...next, marked: setAt(next.marked, next.current, true) }, next.current + 1);
    }
    case "submit": {
      const next = accrue(state, action.now);
      return { ...next, submittedAt: Math.min(action.now, Math.max(next.deadline, next.startedAt)), submitReason: action.reason };
    }
  }
}

export function paletteStatus(state: Pick<RunnerState, "answers" | "marked" | "visited">, index: number): PaletteStatus {
  const answered = isAnswered(state.answers[index]);
  if (state.marked[index]) return answered ? "answeredMarked" : "marked";
  if (answered) return "answered";
  return state.visited[index] ? "notAnswered" : "notVisited";
}

export function paletteCounts(state: Pick<RunnerState, "answers" | "marked" | "visited">): Record<PaletteStatus, number> {
  const counts: Record<PaletteStatus, number> = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 };
  for (let i = 0; i < state.answers.length; i += 1) counts[paletteStatus(state, i)] += 1;
  return counts;
}

/** Seconds per question (rounded) for scoring and storage. */
export function timeSpentSeconds(state: Pick<RunnerState, "timeSpentMs">): number[] {
  return state.timeSpentMs.map((ms) => Math.max(0, Math.round(ms / 1000)));
}

/** Validates a state read back from localStorage (shape, lengths and version). */
export function isRunnerState(value: unknown, testId: string, questionCount: number): value is RunnerState {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<RunnerState>;
  const isList = (list: unknown) => Array.isArray(list) && list.length === questionCount;
  return (
    s.version === RUNNER_STATE_VERSION &&
    s.testId === testId &&
    typeof s.attemptId === "string" &&
    (s.startToken === undefined || s.startToken === null || typeof s.startToken === "string") &&
    typeof s.startedAt === "number" &&
    typeof s.deadline === "number" &&
    typeof s.lastTickAt === "number" &&
    typeof s.current === "number" &&
    Number.isInteger(s.current) &&
    s.current >= 0 &&
    s.current < questionCount &&
    isList(s.answers) &&
    isList(s.marked) &&
    isList(s.visited) &&
    isList(s.timeSpentMs) &&
    (s.submittedAt === null || typeof s.submittedAt === "number")
  );
}
