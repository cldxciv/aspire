import type { Bilingual, Difficulty, Marking, McqQuestion, MockExam, MockSubject, NumericalQuestion } from "./types";

/**
 * Small helpers that keep the question files readable. Every question built here is an original
 * SAMPLE (`source: "Aspire sample"`, `status: "placeholder"`, D-032).
 */

/** Same text in both languages (numbers, formulas, units). */
export function same(text: string): Bilingual {
  return { en: text, hi: text };
}

export function bi(en: string, hi: string): Bilingual {
  return { en, hi };
}

interface CommonInput {
  id: string;
  subject: MockSubject;
  topic: string;
  difficulty: Difficulty;
  stem: Bilingual;
  solution: Bilingual;
}

export function sampleMcq(
  exam: MockExam,
  marking: Marking,
  input: CommonInput & { options: Bilingual[]; answer: number },
): McqQuestion {
  if (input.options.length !== 4) throw new Error(`${input.id}: an MCQ needs exactly 4 options`);
  if (!Number.isInteger(input.answer) || input.answer < 0 || input.answer > 3) throw new Error(`${input.id}: bad answer index`);
  return { ...input, type: "mcq", exam, marking, source: "Aspire sample", status: "placeholder" };
}

export function sampleNumerical(
  exam: MockExam,
  marking: Marking,
  input: CommonInput & { answer: number; tolerance?: number; unit?: Bilingual },
): NumericalQuestion {
  return {
    ...input,
    type: "numerical",
    tolerance: input.tolerance ?? 0,
    exam,
    marking,
    source: "Aspire sample",
    status: "placeholder",
  };
}
