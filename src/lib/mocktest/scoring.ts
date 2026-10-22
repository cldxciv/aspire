import type { Marking, MockSubject } from "@/content/mocktest/types";

/**
 * Mock-test scoring (pure, client-safe). The SERVER is authoritative: POST /api/mocktest/score and
 * POST /api/mocktest/attempts re-score every attempt from the answer key with these functions and
 * never trust a score sent by the browser.
 *
 * Answers are stored in test order: an MCQ answer is the 0-based option index, a numerical answer is
 * the text the student typed (normalised), `null` = not answered. A one-or-more-correct answer
 * (generated papers only) is the sorted, distinct option indices; an empty list = not answered.
 *
 * The subject type is a parameter so generated papers (src/lib/mocktest/generated.ts) can score
 * question-bank subjects (`QbSubject` adds `mental_ability`) without widening `MockSubject`, which
 * Rancho's tool enum uses (plan §B14). It defaults to `MockSubject`: fixed tests are unchanged.
 */

export type Answer = number | string | number[] | null;

export interface ScorableQuestion<S extends string = MockSubject> {
  id: string;
  subject: S;
  topic: string;
  /** `multiple` = one or more correct options (generated papers only). */
  type: "mcq" | "numerical" | "multiple";
  /** MCQ and multiple only. */
  optionCount?: number;
  /** MCQ: correct option index. Numerical: correct value. Multiple: the first correct option (see `correctOptions`). */
  answer: number;
  /** Numerical only: accepted absolute difference (default 0). Ignored when `low` / `high` are set. */
  tolerance?: number;
  /** Multiple only: every correct option index, sorted and distinct. */
  correctOptions?: readonly number[];
  /** Numerical only: the key is a range, inclusive (e.g. 2.30–2.35). */
  low?: number;
  high?: number;
  /**
   * Numerical only: the response must be a whole number (JEE Main 2026 Section B is entered on the
   * on-screen keypad and rounded off to the nearest integer, bulletin §2.4.2). A decimal response is
   * rejected (422), never rounded silently.
   */
  integer?: boolean;
  /** Answer-key correction "dropped" (both bulletins): full marks to every candidate, attempted or not. */
  dropped?: boolean;
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

/** Most options a question may have (the request schema's array answer allows indices 0–9). */
export const MAX_OPTIONS = 10;

/** A one-or-more-correct response: distinct option indices in range, sorted; empty → not answered. */
function normaliseOptionList(raw: unknown, count: number): NormalisedAnswer {
  if (!Array.isArray(raw) || raw.length > Math.min(count, MAX_OPTIONS)) return { ok: false };
  const seen = new Set<number>();
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= count || seen.has(value)) return { ok: false };
    seen.add(value);
  }
  if (seen.size === 0) return { ok: true, value: null };
  return { ok: true, value: [...seen].sort((a, b) => a - b) };
}

/**
 * Validates one raw response against its question: `null` / `undefined` / blank → not answered;
 * an MCQ needs an integer option index; a one-or-more-correct question a list of distinct option
 * indices (empty = not answered); a numerical answer needs a plain decimal number, and a whole
 * number when the question is `integer`. Anything else is rejected (the API answers 422).
 */
export function normaliseAnswer(question: Pick<ScorableQuestion<string>, "type" | "optionCount" | "integer">, raw: unknown): NormalisedAnswer {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (question.type === "mcq") {
    const count = question.optionCount ?? 4;
    return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < count ? { ok: true, value: raw } : { ok: false };
  }
  if (question.type === "multiple") return normaliseOptionList(raw, question.optionCount ?? 4);
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || (question.integer && !Number.isInteger(raw))) return { ok: false };
    return { ok: true, value: String(raw) };
  }
  if (typeof raw !== "string") return { ok: false };
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  const value = parseNumeric(text);
  if (value === null || (question.integer && !Number.isInteger(value))) return { ok: false };
  return { ok: true, value: text };
}

export function isAnswered(answer: Answer | undefined): boolean {
  return answer !== null && answer !== undefined && answer !== "" && !(Array.isArray(answer) && answer.length === 0);
}

/** One response, marked. */
export interface MarkedResponse {
  outcome: Outcome;
  marks: number;
  /** Some but not all correct options chosen, none wrong (`outcome` "correct", marks below full). */
  partial: boolean;
  /** A dropped question: full marks whatever the response. */
  bonus: boolean;
}

/**
 * Marks one response. One-or-more-correct (JEE Advanced 2026 instructions): exactly the correct
 * options → full marks; with `marking.partial: "per_correct_option"`, a non-empty proper subset of
 * the correct options → +1 per chosen option (+3 / +2 / +1), reported as `correct` with
 * `partial: true` (a positive response, as NTA's tie-break counts it); any wrong option → `wrong`.
 * Numerical: a range key (`low` / `high`, inclusive), else `tolerance`; `integer` questions accept
 * whole numbers only. A dropped question gives full marks to everyone, attempted or not.
 */
export function markResponse(question: ScorableQuestion<string>, answer: Answer | undefined): MarkedResponse {
  const answered = isAnswered(answer);
  if (question.dropped) return { outcome: answered ? "correct" : "unattempted", marks: question.marking.correct, partial: false, bonus: true };
  if (!answered) return { outcome: "unattempted", marks: 0, partial: false, bonus: false };
  const full: MarkedResponse = { outcome: "correct", marks: question.marking.correct, partial: false, bonus: false };
  const wrong: MarkedResponse = { outcome: "wrong", marks: question.marking.wrong, partial: false, bonus: false };
  if (question.type === "mcq") return answer === question.answer ? full : wrong;
  if (question.type === "multiple") {
    const chosen = Array.isArray(answer) ? answer : typeof answer === "number" ? [answer] : null;
    const correct = new Set(question.correctOptions ?? [question.answer]);
    if (!chosen || chosen.length === 0 || chosen.some((option) => !correct.has(option))) return wrong;
    if (new Set(chosen).size === correct.size) return full;
    if (question.marking.partial !== "per_correct_option") return wrong;
    return { outcome: "correct", marks: Math.min(new Set(chosen).size, question.marking.correct - 1), partial: true, bonus: false };
  }
  if (Array.isArray(answer)) return wrong;
  const value = typeof answer === "number" ? answer : parseNumeric(String(answer));
  if (value === null || (question.integer && !Number.isInteger(value))) return wrong;
  if (question.low !== undefined || question.high !== undefined) {
    const low = question.low ?? question.answer;
    const high = question.high ?? question.answer;
    return value >= low - 1e-9 && value <= high + 1e-9 ? full : wrong;
  }
  const tolerance = question.tolerance ?? 0;
  return Math.abs(value - question.answer) <= tolerance + 1e-9 ? full : wrong;
}

export function questionOutcome(question: ScorableQuestion<string>, answer: Answer | undefined): Outcome {
  return markResponse(question, answer).outcome;
}

export function marksFor(question: Pick<ScorableQuestion<string>, "marking">, outcome: Outcome): number {
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

export interface QuestionResult<S extends string = MockSubject> {
  id: string;
  /** Position in the test (0-based). */
  index: number;
  subject: S;
  topic: string;
  outcome: Outcome;
  marks: number;
  answer: Answer;
  timeSec: number;
  /** Only present (true) for a partially correct one-or-more-correct response; `outcome` is then "correct". */
  partial?: true;
  /** Only present (true) for a dropped question: full marks whatever the response. */
  bonus?: true;
}

export interface SubjectResult<S extends string = MockSubject> extends Tally {
  subject: S;
}

/** strong ≥ 75 % of the topic's questions correct; developing ≥ 40 %; weak below; skipped = none attempted. */
export type StrengthLevel = "strong" | "developing" | "weak" | "skipped";

export interface TopicResult<S extends string = MockSubject> extends Tally {
  subject: S;
  topic: string;
  total: number;
  /** correct ÷ total (unattempted counts as not yet secure), 0–1. */
  mastery: number;
  level: StrengthLevel;
}

export interface ScoreResult<S extends string = MockSubject> extends Tally {
  total: number;
  /** correct ÷ attempted, 0–1; null when nothing was attempted. */
  accuracy: number | null;
  subjects: SubjectResult<S>[];
  topics: TopicResult<S>[];
  questions: QuestionResult<S>[];
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

function add(tally: Tally, question: ScorableQuestion<string>, result: QuestionResult<string>): void {
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
export function scoreAttempt<S extends string = MockSubject>(
  questions: readonly ScorableQuestion<S>[],
  answers: readonly Answer[],
  timeSpentSec: readonly number[] = [],
): ScoreResult<S> {
  const totals = emptyTally();
  const subjects = new Map<S, SubjectResult<S>>();
  const topics = new Map<string, TopicResult<S>>();
  const results: QuestionResult<S>[] = [];

  questions.forEach((question, index) => {
    const answer = answers[index] ?? null;
    const marked = markResponse(question, answer);
    const result: QuestionResult<S> = {
      id: question.id,
      index,
      subject: question.subject,
      topic: question.topic,
      outcome: marked.outcome,
      marks: marked.marks,
      answer: isAnswered(answer) ? answer : null,
      timeSec: seconds(timeSpentSec[index]),
      ...(marked.partial ? { partial: true as const } : {}),
      ...(marked.bonus ? { bonus: true as const } : {}),
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
