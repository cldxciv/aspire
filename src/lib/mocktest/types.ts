import type { Bilingual, Marking, MockExam, MockSubject, TestWindow } from "@/content/mocktest/types";
import type {
  QbAnswer,
  QbDifficulty,
  QbExam,
  QbMarking,
  QbPaperComposition,
  QbPaperKind,
  QbPaperView,
  QbQuestionType,
  QbReadiness,
  QbSlot,
  QbSolutionSource,
  QbSourceKind,
  QbSubject,
} from "@/lib/qb/types";
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
  // Generated papers only (all optional; fixed tests never set them):
  /**
   * The full key: one-or-more-correct option indices, a numerical range or unit. `correct` is then
   * the single option, the first correct option, or the numerical value. Null for a dropped question.
   */
  answer?: QbAnswer | null;
  /** The question was dropped after the paper was made: full marks to everyone. */
  dropped?: boolean;
  /** Who wrote the solution ("official", "staff", "ai_draft_reviewed"); unreviewed AI drafts are never served. */
  solutionSource?: QbSolutionSource;
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
  /**
   * Generated papers only: share of official past-year questions in the paper (0–1). Above 0.5 the
   * result notes that students who saw those papers may score higher (plan A7-12).
   */
  officialShare?: number;
}

/** POST /api/mocktest/score (and the scored part of POST /api/mocktest/attempts). */
export interface ScoredAttempt<S extends string = MockSubject> {
  testId: string;
  result: ScoreResult<S>;
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
  /** Generated papers only: what the paper was and where each question came from (shown after submission). */
  paper?: PaperResultMeta;
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
  /** Generated papers only: the paper this attempt answered. */
  paperId?: string | null;
  /** Generated papers only: when an answer-key correction last changed this attempt's score (epoch ms). */
  rescoredAt?: number | null;
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

/**
 * GET /api/mocktest/attempts?id= for an attempt at a generated paper (`testId` "bp-…"): the result
 * carries question-bank subjects and `scored.paper`. Solutions follow the paper's release rule
 * (practice: a quarter of the paper time after it was made; ranked: when the month closes).
 */
export interface SavedPaperAttemptDetail extends SavedAttempt {
  paperId: string;
  scored: ScoredAttempt<QbSubject>;
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
  /** Generated papers: "score updated after an answer-key correction on <date>" (epoch ms), else null / absent. */
  rescoredAt?: number | null;
  /**
   * Generated papers only: a SHORTER practice set than the real exam (the bank was thin), so the
   * page can say "shorter practice set — 38 of 75 questions" instead of verifying it like a full mock.
   */
  short?: boolean;
  /** Generated papers only: questions in this paper (part). */
  questionCount?: number;
  /** Generated papers only: the real exam's question count for this paper's part. */
  fullQuestionCount?: number;
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
  /**
   * Monthly ranked board of a generated mock (`testId` "bp-<slot>-ranked"): everyone sat the same
   * paper; ties are broken by the official rules (no time criterion), so equal entries share a rank.
   * The page says "same paper for everyone this month; ranks are indicative".
   */
  ranked?: boolean;
}


// ---------------------------------------------------------------------------------------------
// Generated question papers (docs/question-bank-plan.md §B9–B12). Client-safe shapes of
// /api/mocktest/papers/** and the paper parts of /score, /attempts and /verify. The runner payload
// itself is the question bank's `QbPaperView` (src/lib/qb/types.ts, built by src/lib/qb/papers.ts
// from the approved snapshots): no answers, solutions, sources, difficulty or staff fields.

/** POST /api/mocktest/papers → 201. */
export interface PaperStart {
  /** Practice: the bearer token for these papers, handed out ONCE (keep it in local storage). Ranked: null (the owner's session). */
  token: string | null;
  /** True when this is the student's existing ranked paper of the month (no new paper was made). */
  resumed: boolean;
  setId: string | null;
  /** One paper, or the JEE Advanced pair (Paper 1, Paper 2) in order. */
  papers: QbPaperView[];
}

/** GET /api/mocktest/papers/readiness?slot=&language= — asked BEFORE the contact form (plan §B10.6). */
export interface PaperReadinessView {
  slot: QbSlot;
  exam: QbExam;
  /** A published blueprint exists and generation is switched on. */
  available: boolean;
  /** Why not, when `available` is false. */
  reason: "disabled" | "no_blueprint" | null;
  readiness: QbReadiness | null;
  /** The real exam (all parts): questions, marks, minutes. */
  full: { questionCount: number; maxScore: number; durationMinutes: number } | null;
  languages: ("en" | "hi")[];
  compensatoryMinutes: number | null;
  /** Honest composition of a paper made now (sources, years, difficulty mix), when one can be previewed. */
  composition: QbPaperComposition | null;
  /** True when this exam's pool has only sample (demo) questions right now. */
  sample: boolean;
  pattern: { year: number; note: Bilingual; sourceUrls: string[]; verifiedAt: string | null; reviewDueAt: string | null } | null;
  ranked: {
    mode: "off" | "monthly";
    available: boolean;
    windowId: string | null;
    closesAt: number | null;
    /** The caller is a signed-in student (only they can sit the ranked paper). */
    signedIn: boolean;
  };
}

/** Per question of a scored generated paper (shown after submission only, never during the test). */
export interface PaperQuestionMeta {
  id: string;
  index: number;
  sectionId: string;
  /**
   * "JEE Main 2024 · 27 Jan · Shift 1 · Q 12 (NTA)", "Adapted by Aspire from …", "Aspire question bank", "Sample question (written for this demo)".
   * Empty while `sourceWithheld` (a ranked paper before its month closes).
   */
  sourceLabel: Bilingual;
  sourceKind: QbSourceKind;
  /** Ranked papers before the month closes: the label is held back until `PaperResultMeta.sourcesWithheldUntil`. */
  sourceWithheld?: true;
  adapted: boolean;
  difficulty: QbDifficulty | null;
  chapterId: string;
  type: QbQuestionType;
  marking: QbMarking;
  /** An answer-key correction changed this question after the paper was made (epoch ms). */
  correctedAt: number | null;
  /** The correction dropped the question: full marks to everyone. */
  dropped: boolean;
}

/** `ScoredAttempt.paper` for generated papers. */
export interface PaperResultMeta {
  paperId: string;
  slot: QbSlot;
  exam: QbExam;
  kind: QbPaperKind;
  setId: string | null;
  setPart: number | null;
  short: boolean;
  sample: boolean;
  language: "en" | "hi";
  durationMinutes: number;
  /** The real exam's question count for "38 of 75 questions" (this paper's part). */
  fullQuestionCount: number;
  composition: QbPaperComposition;
  questions: PaperQuestionMeta[];
  /** Latest answer-key correction applied to this paper (epoch ms), else null. */
  correctedAt: number | null;
  expiresAt: number;
  /** Ranked papers before the month closes: per-question source labels are shown from this time (epoch ms). */
  sourcesWithheldUntil?: number;
}

/** `getPublicBlueprintMocks()`: exam-pattern mocks for lists (dynamic callers only, after `connection()`). */
export interface BlueprintMockSummary {
  slot: QbSlot;
  /** "bp-<slot>". */
  testId: string;
  exam: QbExam;
  title: Bilingual;
  summary: Bilingual;
  /** The real exam (all parts). */
  durationMinutes: number;
  questionCount: number;
  maxScore: number;
  level: "full" | "short" | "thin";
  sample: boolean;
  ranked: "off" | "monthly";
}
