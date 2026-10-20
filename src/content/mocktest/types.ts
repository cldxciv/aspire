import type { ContentStatus } from "@/lib/types";

/**
 * Mock-test question bank schema (owner: A2-MOCKTEST, D-032). Client-safe: types and constants only.
 *
 * Every question and test in this folder is an ORIGINAL sample written for the demo
 * (`source: "Aspire sample"`, `status: "placeholder"`). Placeholder content is visible only while
 * showPlaceholderContent() is on (dev / demo deployments) and is always labelled Sample / DEMO.
 * Aspire replaces it with its own approved papers (`status: "published"`).
 *
 * Notation: plain text with Unicode (x², √, π, ×, −, ⁻¹, →, ⇌). No LaTeX. The runner renders text
 * with `white-space: pre-line`, so "\n" starts a new line.
 */

/** JEE_MAIN = JEE Main; NEET = NEET-UG; BOH = Brain of Himachal (Aspire's scholarship test). */
export const MOCK_EXAMS = ["JEE_MAIN", "NEET", "BOH"] as const;
export type MockExam = (typeof MOCK_EXAMS)[number];

export const MOCK_SUBJECTS = ["physics", "chemistry", "maths", "botany", "zoology", "biology"] as const;
export type MockSubject = (typeof MOCK_SUBJECTS)[number];

export type Difficulty = "easy" | "medium" | "hard";

/** Text in English and Hindi. Hindi is a machine-assisted draft pending native review. */
export interface Bilingual {
  en: string;
  hi: string;
}

/** Marks for a correct and a wrong response. Unattempted is always 0. */
export interface Marking {
  correct: number;
  wrong: number;
}

/** JEE Main pattern used by the samples: MCQ +4 / −1, numerical-value +4 / 0 (as briefed). */
export const JEE_MCQ_MARKING: Marking = { correct: 4, wrong: -1 };
export const JEE_NUMERICAL_MARKING: Marking = { correct: 4, wrong: 0 };
/** NEET-UG: +4 / −1. */
export const NEET_MARKING: Marking = { correct: 4, wrong: -1 };

interface QuestionBase {
  /** Stable id, e.g. "jee-p-01". Never reused for a different question. */
  id: string;
  exam: MockExam;
  subject: MockSubject;
  /** Topic id from ./topics.ts (chapter level). */
  topic: string;
  difficulty: Difficulty;
  stem: Bilingual;
  /** Step-by-step worked solution. */
  solution: Bilingual;
  marking: Marking;
  source: "Aspire sample" | "Aspire";
  status: ContentStatus;
}

/** Single-correct multiple choice. `answer` is the index (0-based) of the correct option. */
export interface McqQuestion extends QuestionBase {
  type: "mcq";
  options: Bilingual[];
  answer: number;
}

/** Numerical-value answer (JEE Main section B). Correct when |response − answer| ≤ tolerance. */
export interface NumericalQuestion extends QuestionBase {
  type: "numerical";
  answer: number;
  tolerance: number;
  /** Unit shown next to the input, e.g. "cm". */
  unit?: Bilingual;
}

export type MockQuestion = McqQuestion | NumericalQuestion;

/**
 * A scheduled window of a weekly "All-Himachal Mock" (D-034). Attempts saved while a window is
 * open (server time) are ranked on that window's leaderboard. ISO timestamps with an offset.
 */
export interface TestWindow {
  id: string;
  startsAt: string;
  endsAt: string;
}

export interface MockTestSection {
  subject: MockSubject;
  questionIds: string[];
}

export interface MockTestDefinition {
  /** URL segment, e.g. "jee-main-sample". */
  id: string;
  exam: MockExam;
  /** practice = always open, all-time leaderboard; weekly = leaderboards per scheduled window. */
  kind: "practice" | "weekly";
  title: Bilingual;
  summary: Bilingual;
  durationMinutes: number;
  sections: MockTestSection[];
  /** Weekly tests only. */
  windows?: TestWindow[];
  source: "Aspire sample" | "Aspire";
  status: ContentStatus;
}
