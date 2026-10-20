import type { Marking, MockSubject } from "@/content/mocktest/types";

/**
 * Mock-test scoring (pure, client-safe). The SERVER is authoritative: POST /api/mocktest/score and
 * POST /api/mocktest/attempts re-score every attempt from the answer key with these functions and
 * never trust a score sent by the browser.
 *
 * Answers are stored in test order: an MCQ answer is the 0-based option index, a numerical answer is
 * the text the student typed (normalised), `null` = not answered.
 */

export type Answer = number | string | null;

export interface ScorableQuestion {
  id: string;
  subject: MockSubject;
  topic: string;
  type: "mcq" | "numerical";
  /** MCQ only. */
  optionCount?: number;
  /** MCQ: correct option index. Numerical: correct value. */
  answer: number;
  /** Numerical only: accepted absolute difference (default 0). */
  tolerance?: number;
  marking: Marking;
}

export type Outcome = "correct" | "wrong" | "unattempted";

/** Longest numerical response accepted (characters). */
export const MAX_NUMERIC_LENGTH = 12;
const NUMERIC_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** A typed numerical response as a number, or null when it is not a plain decimal number. */
export function parseNumeric(value: string): number | null {
  const text = value.trim();
  if (text.length === 0 || text.length > MAX_NUMERIC_LENGTH || !NUMERIC_PATTERN.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export type NormalisedAnswer = { ok: true; value: Answer } | { ok: false };

/**
 * Validates one raw response against its question: `null` / `undefined` / blank → not answered;
 * an MCQ needs an integer option index; a numerical answer needs a plain decimal number.
 * Anything else is rejected (the API answers 422).
 */
export function normaliseAnswer(question: Pick<ScorableQuestion, "type" | "optionCount">, raw: unknown): NormalisedAnswer {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (question.type === "mcq") {
    const count = question.optionCount ?? 4;
    return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < count ? { ok: true, value: raw } : { ok: false };
  }
  if (typeof raw === "number") return Number.isFinite(raw) ? { ok: true, value: String(raw) } : { ok: false };
  if (typeof raw !== "string") return { ok: false };
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  return parseNumeric(text) === null ? { ok: false } : { ok: true, value: text };
}

export function isAnswered(answer: Answer | undefined): boolean {
  return answer !== null && answer !== undefined && answer !== "";
}

export function questionOutcome(question: ScorableQuestion, answer: Answer | undefined): Outcome {
  if (!isAnswered(answer)) return "unattempted";
  if (question.type === "mcq") return answer === question.answer ? "correct" : "wrong";
  const value = typeof answer === "number" ? answer : parseNumeric(String(answer));
  if (value === null) return "wrong";
  const tolerance = question.tolerance ?? 0;
  return Math.abs(value - question.answer) <= tolerance + 1e-9 ? "correct" : "wrong";
}

export function marksFor(question: Pick<ScorableQuestion, "marking">, outcome: Outcome): number {
  if (outcome === "correct") return question.marking.correct;
  if (outcome === "wrong") return question.marking.wrong;
  return 0;
}

export interface Tally {
  attempted: number;
  correct: number;
  wrong: number;
  unattempted: number;
  score: number;
  maxScore: number;
  /** Seconds spent on these questions (from the runner's per-question timer). */
  timeSec: number;
}

export interface QuestionResult {
  id: string;
  /** Position in the test (0-based). */
  index: number;
  subject: MockSubject;
  topic: string;
  outcome: Outcome;
  marks: number;
  answer: Answer;
  timeSec: number;
}

export interface SubjectResult extends Tally {
  subject: MockSubject;
}

/** strong ≥ 75 % of the topic's questions correct; developing ≥ 40 %; weak below; skipped = none attempted. */
export type StrengthLevel = "strong" | "developing" | "weak" | "skipped";

export interface TopicResult extends Tally {
  subject: MockSubject;
  topic: string;
  total: number;
  /** correct ÷ total (unattempted counts as not yet secure), 0–1. */
  mastery: number;
  level: StrengthLevel;
}

export interface ScoreResult extends Tally {
  total: number;
  /** correct ÷ attempted, 0–1; null when nothing was attempted. */
  accuracy: number | null;
  subjects: SubjectResult[];
  topics: TopicResult[];
  questions: QuestionResult[];
}

export function strengthLevel(tally: Pick<Tally, "attempted" | "correct">, total: number): StrengthLevel {
  if (tally.attempted === 0) return "skipped";
  const mastery = total > 0 ? tally.correct / total : 0;
  if (mastery >= 0.75) return "strong";
  if (mastery >= 0.4) return "developing";
  return "weak";
}

function emptyTally(): Tally {
  return { attempted: 0, correct: 0, wrong: 0, unattempted: 0, score: 0, maxScore: 0, timeSec: 0 };
}

function add(tally: Tally, question: ScorableQuestion, result: QuestionResult): void {
  tally.maxScore += question.marking.correct;
  tally.score += result.marks;
  tally.timeSec += result.timeSec;
  if (result.outcome === "unattempted") tally.unattempted += 1;
  else {
    tally.attempted += 1;
    if (result.outcome === "correct") tally.correct += 1;
    else tally.wrong += 1;
  }
}

function seconds(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * Scores an attempt: totals with negative marking, per subject (in test order), per topic and per
 * question. `answers[i]` / `timeSpentSec[i]` belong to `questions[i]`; missing entries count as
 * unattempted / 0 s.
 */
export function scoreAttempt(questions: readonly ScorableQuestion[], answers: readonly Answer[], timeSpentSec: readonly number[] = []): ScoreResult {
  const totals = emptyTally();
  const subjects = new Map<MockSubject, SubjectResult>();
  const topics = new Map<string, TopicResult>();
  const results: QuestionResult[] = [];

  questions.forEach((question, index) => {
    const answer = answers[index] ?? null;
    const outcome = questionOutcome(question, answer);
    const result: QuestionResult = {
      id: question.id,
      index,
      subject: question.subject,
      topic: question.topic,
      outcome,
      marks: marksFor(question, outcome),
      answer: isAnswered(answer) ? answer : null,
      timeSec: seconds(timeSpentSec[index]),
    };
    results.push(result);
    add(totals, question, result);

    let subject = subjects.get(question.subject);
    if (!subject) {
      subject = { subject: question.subject, ...emptyTally() };
      subjects.set(question.subject, subject);
    }
    add(subject, question, result);

    let topic = topics.get(question.topic);
    if (!topic) {
      topic = { subject: question.subject, topic: question.topic, total: 0, mastery: 0, level: "skipped", ...emptyTally() };
      topics.set(question.topic, topic);
    }
    topic.total += 1;
    add(topic, question, result);
  });

  for (const topic of topics.values()) {
    topic.mastery = topic.total > 0 ? topic.correct / topic.total : 0;
    topic.level = strengthLevel(topic, topic.total);
  }

  return {
    ...totals,
    total: questions.length,
    accuracy: totals.attempted > 0 ? totals.correct / totals.attempted : null,
    subjects: [...subjects.values()],
    topics: [...topics.values()],
    questions: results,
  };
}
