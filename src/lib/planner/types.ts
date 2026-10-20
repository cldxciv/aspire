/**
 * Study planner (A4-PLANNER) shared types. Type-only and client-safe.
 */
import type { DateKey } from "./dates";

export const EXAM_IDS = ["jee-main", "jee-advanced", "neet", "boh", "foundation"] as const;
export type ExamId = (typeof EXAM_IDS)[number];

export const BATCH_IDS = ["9", "10", "11", "12", "dropper"] as const;
export type BatchId = (typeof BATCH_IDS)[number];

export const SUBJECT_IDS = ["physics", "chemistry", "maths", "biology", "mat"] as const;
/** `mat` = Mental Ability (a section of the BOH paper). */
export type SubjectId = (typeof SUBJECT_IDS)[number];

/** Class level a topic is usually taught in: senior (11/12) or foundation (9/10); "both" spans two. */
export type TopicLevel = "9" | "10" | "11" | "12" | "both";

export interface LocalizedText {
  en: string;
  hi: string;
}

export interface SyllabusTopic {
  /** Stable id, e.g. `phy-kinematics`. Used in saved progress, so never rename a released id. */
  id: string;
  subject: SubjectId;
  level: TopicLevel;
  name: LocalizedText;
}

/** Topic as sent to the browser: the name in the page's language only. */
export interface ClientTopic {
  id: string;
  subject: SubjectId;
  level: TopicLevel;
  name: string;
}

export interface PlanInput {
  exam: ExamId;
  batch: BatchId;
  /** First day of the plan (IST), normally the day it was generated. */
  startDate: DateKey;
  /** Exam day (IST). The plan ends the day before; nothing is scheduled on or after it. */
  examDate: DateKey;
  /** Study hours per day, 1–14. */
  dailyHours: number;
  /** Optional topic ids to give extra time (from the student, mock tests or Ask Aspire). */
  weakTopics?: readonly string[];
}

export type DayKind = "study" | "revision" | "mock" | "buffer" | "light";
export type BlockKind = "learn" | "practice" | "revise" | "spaced" | "mock" | "analysis" | "buffer";

export interface PlanBlock {
  /** `YYYY-MM-DD#n`: stable for a given input, used to tick blocks off. */
  id: string;
  index: number;
  kind: BlockKind;
  /** Missing for mixed blocks (spaced revision, buffer, full mocks). */
  subject?: SubjectId;
  /** Topics covered by the block (one for learn/practice, several for revise). */
  topicIds: string[];
  minutes: number;
}

export interface PlanDay {
  date: DateKey;
  kind: DayKind;
  /** True inside the final revision phase before the exam. */
  finalPhase: boolean;
  blocks: PlanBlock[];
}

export interface PlanSummary {
  totalDays: number;
  studyDays: number;
  revisionDays: number;
  mockDays: number;
  bufferDays: number;
  /** First day of the final revision phase. */
  finalPhaseStart: DateKey | null;
  /** Learning sessions given to a normal topic / a weak topic (main phase). */
  sessionsPerTopic: number;
  sessionsPerWeakTopic: number;
  /** Topics that did not fit into the main phase and are only revised in the final phase. */
  unscheduledTopicIds: string[];
}

export interface StudyPlan {
  input: PlanInput;
  days: PlanDay[];
  summary: PlanSummary;
}
