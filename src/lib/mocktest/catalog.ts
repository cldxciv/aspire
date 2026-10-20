import "server-only";

import { MOCK_QUESTIONS, MOCK_TESTS } from "@/content/mocktest";
import { SUBJECT_LABELS } from "@/content/mocktest/topics";
import type { MockQuestion, MockTestDefinition, TestWindow } from "@/content/mocktest/types";
import { showPlaceholderContent } from "@/lib/content-mode";
import type { ScorableQuestion } from "./scoring";
import type { ReviewItem, RunnerQuestion, RunnerTest, TestSummary } from "./types";

/**
 * Server-side access to the mock-test bank (the mock-test counterpart of src/lib/data.ts).
 * Visibility (D-005 / D-032): `published` tests always; `placeholder` (sample) tests only while
 * showPlaceholderContent() is on. In production with sample content only, nothing is visible and
 * every API answers 404 for the sample ids.
 */

const QUESTION_BY_ID = new Map(MOCK_QUESTIONS.map((q) => [q.id, q]));

function isVisible(status: MockTestDefinition["status"]): boolean {
  return status === "published" || (status === "placeholder" && showPlaceholderContent());
}

function questionsOf(test: MockTestDefinition): MockQuestion[] {
  return test.sections.flatMap((section) =>
    section.questionIds.map((id) => {
      const question = QUESTION_BY_ID.get(id);
      if (!question) throw new Error(`Mock test ${test.id}: unknown question ${id}`);
      return question;
    }),
  );
}

/** Every test id (any status), for generateStaticParams. Unpublished ids resolve to notFound(). */
export function getAllMockTestIds(): string[] {
  return MOCK_TESTS.map((t) => t.id);
}

export function getVisibleMockTests(): MockTestDefinition[] {
  return MOCK_TESTS.filter((t) => isVisible(t.status));
}

export function getVisibleMockTest(id: string): MockTestDefinition | null {
  const test = MOCK_TESTS.find((t) => t.id === id);
  return test && isVisible(test.status) ? test : null;
}

export function isSampleTest(test: MockTestDefinition): boolean {
  return test.status === "placeholder" || questionsOf(test).some((q) => q.status === "placeholder");
}

export function maxScoreOf(test: MockTestDefinition): number {
  return questionsOf(test).reduce((sum, q) => sum + q.marking.correct, 0);
}

export function summariseTest(test: MockTestDefinition): TestSummary {
  const questions = questionsOf(test);
  const notes = new Map<string, TestSummary["markingNotes"][number]>();
  for (const q of questions) {
    const key = `${q.type}:${q.marking.correct}:${q.marking.wrong}`;
    if (!notes.has(key)) notes.set(key, { type: q.type, correct: q.marking.correct, wrong: q.marking.wrong });
  }
  return {
    id: test.id,
    exam: test.exam,
    kind: test.kind,
    title: test.title,
    summary: test.summary,
    durationMinutes: test.durationMinutes,
    questionCount: questions.length,
    maxScore: maxScoreOf(test),
    subjects: test.sections.map((s) => ({ subject: s.subject, label: SUBJECT_LABELS[s.subject], count: s.questionIds.length })),
    markingNotes: [...notes.values()],
    ...(test.windows ? { windows: test.windows } : {}),
    sample: isSampleTest(test),
  };
}

/** The runner's payload: stems and options in both languages, NO answers or solutions. */
export function runnerPayload(test: MockTestDefinition): RunnerTest {
  let start = 0;
  const sections = test.sections.map((section) => {
    const entry = { subject: section.subject, label: SUBJECT_LABELS[section.subject], start, count: section.questionIds.length };
    start += section.questionIds.length;
    return entry;
  });
  const questions: RunnerQuestion[] = questionsOf(test).map((q) => ({
    id: q.id,
    subject: q.subject,
    topic: q.topic,
    type: q.type,
    stem: q.stem,
    ...(q.type === "mcq" ? { options: q.options } : {}),
    ...(q.type === "numerical" && q.unit ? { unit: q.unit } : {}),
    marking: q.marking,
  }));
  return {
    id: test.id,
    exam: test.exam,
    kind: test.kind,
    title: test.title,
    durationMinutes: test.durationMinutes,
    maxScore: maxScoreOf(test),
    questions,
    sections,
    ...(test.windows ? { windows: test.windows } : {}),
    sample: isSampleTest(test),
  };
}

/** Answer key for re-scoring (server only). */
export function scorableQuestions(test: MockTestDefinition): ScorableQuestion[] {
  return questionsOf(test).map((q) => ({
    id: q.id,
    subject: q.subject,
    topic: q.topic,
    type: q.type,
    answer: q.answer,
    marking: q.marking,
    ...(q.type === "mcq" ? { optionCount: q.options.length } : { tolerance: q.tolerance }),
  }));
}

/** Answers and worked solutions, released only with a scored attempt. */
export function reviewItems(test: MockTestDefinition): ReviewItem[] {
  return questionsOf(test).map((q) => ({ id: q.id, correct: q.answer, solution: q.solution }));
}

/** The window open at `now` (server time), if the test is a weekly one. */
export function windowAt(test: Pick<MockTestDefinition, "windows">, now: number): TestWindow | null {
  return test.windows?.find((w) => Date.parse(w.startsAt) <= now && now <= Date.parse(w.endsAt)) ?? null;
}
