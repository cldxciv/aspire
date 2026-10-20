import type { Bilingual, Marking, MockExam, MockSubject, TestWindow } from "@/content/mocktest/types";
import type { BadgeId } from "./badges";
import type { Answer, ScoreResult } from "./scoring";
import type { PracticeReason, ScoreBand } from "./timing";

/**
 * Client-safe shapes shared by the mock-test pages, components and APIs (type-only).
 * The runner payload deliberately has NO answers or solutions: those come back from the server
 * after submission (POST /api/mocktest/score).
 */

export type { Answer, ScoreResult } from "./scoring";
export type { PracticeReason, ScoreBand } from "./timing";
export type { Bilingual, MockExam, MockSubject, TestWindow } from "@/content/mocktest/types";

export interface RunnerQuestion {
  id: string;
  subject: MockSubject;
  topic: string;
  type: "mcq" | "numerical";
  stem: Bilingual;
  options?: Bilingual[];
  unit?: Bilingual;
  marking: Marking;
}

export interface RunnerSection {
  subject: MockSubject;
  label: Bilingual;
  /** Index of the section's first question in `questions`. */
  start: number;
  count: number;
}

export interface RunnerTest {
  id: string;
  exam: MockExam;
  kind: "practice" | "weekly";
  title: Bilingual;
  durationMinutes: number;
  maxScore: number;
  questions: RunnerQuestion[];
  sections: RunnerSection[];
  windows?: TestWindow[];
  /** Placeholder (sample) content: always labelled. */
  sample: boolean;
}

/** List-card summary of a test. */
export interface TestSummary {
  id: string;
  exam: MockExam;
  kind: "practice" | "weekly";
  title: Bilingual;
  summary: Bilingual;
  durationMinutes: number;
  questionCount: number;
  maxScore: number;
  subjects: { subject: MockSubject; label: Bilingual; count: number }[];
  markingNotes: { type: "mcq" | "numerical"; correct: number; wrong: number }[];
  windows?: TestWindow[];
  sample: boolean;
}

/** Answer key + worked solution for one question (released after submission). */
export interface ReviewItem {
  id: string;
  /** MCQ: correct option index. Numerical: correct value. */
  correct: number;
  solution: Bilingual;
}

export interface Range {
  low: number;
  high: number;
}

/** Projected rank band from the rank predictor (A1), scaled to the full paper. */
export interface MockProjection {
  exam: MockExam;
  /** The mock score scaled to the full exam's maximum (rounded). */
  scaledScore: number;
  fullMaxScore: number;
  percentile: Range;
  rank: Range;
  year: number;
  /** True while the predictor's tables are placeholders: show "Sample data". */
  sample: boolean;
}

/** POST /api/mocktest/score (and the scored part of POST /api/mocktest/attempts). */
export interface ScoredAttempt {
  testId: string;
  result: ScoreResult;
  /** Answer key + solutions; EMPTY while they are withheld (see `solutionsReleased`). */
  review: ReviewItem[];
  projection: MockProjection | null;
  sample: boolean;
  /**
   * False while a weekly test's window is open and this is not the student's own saved attempt
   * (QA-SEC-M6 M1): the result has per-question correct / wrong / not attempted, but no key.
   */
  solutionsReleased: boolean;
  /** When the key unlocks for everyone (epoch ms), while it is withheld; otherwise null. */
  solutionsReleaseAt: number | null;
}

export interface SavedAttemptSummary {
  id: string;
  testId: string;
  windowId: string | null;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
  timeTakenSec: number;
  /** Browser times (the student's own record; never used for ranking). */
  startedAt: number;
  submittedAt: number;
  // Server facts (QA-SEC-M6 M1), always filled by the store; optional for hand-built summaries.
  /** True when this attempt can count on its weekly window's leaderboard (server-timed). */
  leaderboard?: boolean;
  /** Why it is practice only, when `leaderboard` is false. */
  practiceReason?: PracticeReason | null;
  /** Duration measured by the server (start → save), seconds; null without a valid start. */
  serverDurationSec?: number | null;
  /** Public certificate verification id (L7), 16 hex characters. */
  verifyId?: string | null;
}

export interface SavedAttempt extends SavedAttemptSummary {
  attemptId: string;
  answers: Answer[];
  timeSpentSec: number[];
}

/** GET /api/mocktest/attempts?id= — the student's own attempt with its full scored result. */
export interface SavedAttemptDetail extends SavedAttempt {
  scored: ScoredAttempt;
}

/** POST /api/mocktest/start (QA-SEC-M6 M1). */
export interface AttemptStart {
  /** Opaque start token to send back with the save; null for tests without a leaderboard. */
  token: string | null;
  /** True when an attempt saved with this token can count on the leaderboard (student, window open). */
  leaderboard: boolean;
  windowId: string | null;
  /** Server start time (epoch ms). */
  startedAt: number;
  /** Leaderboard limits: minimum and maximum server-measured duration (seconds). */
  minSeconds: number;
  maxSeconds: number;
}

/** GET /api/mocktest/verify/:id (L7): what a certificate's verification id confirms. */
export interface CertificateVerification {
  testId: string;
  testTitle: Bilingual;
  /** Server time the attempt was saved (epoch ms). */
  savedAt: number;
  scoreBand: ScoreBand;
  sample: boolean;
  /** The student's leaderboard nickname, only when they opted into leaderboards (D-034). */
  nickname: string | null;
}

export interface AttemptsSummary {
  totalAttempts: number;
  testsTaken: number;
  lastAttemptAt: number | null;
  /** correct ÷ attempted over all saved attempts, 0–1; null when nothing was attempted. */
  averageAccuracy: number | null;
  bestByTest: { testId: string; bestScore: number; maxScore: number; attempts: number }[];
  longestStreakDays: number;
  badges: BadgeId[];
}

export interface MocktestProfile {
  nickname: string;
  district: string | null;
  school: string | null;
  showSchool: boolean;
  leaderboardOptIn: boolean;
}

/** One student row. Schools are never shown next to a nickname (QA-SEC-M6 L6). */
export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  district: string | null;
  score: number;
  /** Duration measured by the server (start → save), seconds. */
  timeTakenSec: number;
}

export interface LeaderboardGroup {
  rank: number;
  /** District id, or the school's display name. */
  name: string;
  participants: number;
  bestScore: number;
  averageScore: number;
}

export interface LeaderboardData {
  testId: string;
  view: "students" | "districts" | "schools";
  windowId: string | null;
  district: string | null;
  maxScore: number;
  total: number;
  entries: LeaderboardEntry[];
  groups: LeaderboardGroup[];
  /** The signed-in, opted-in student's own position on this board. */
  me: { rank: number; total: number } | null;
}
