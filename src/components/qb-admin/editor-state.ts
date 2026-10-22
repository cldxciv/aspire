import type {
  Bilingual,
  QbAnswer,
  QbDifficulty,
  QbExam,
  QbFigureRef,
  QbQuestion,
  QbQuestionContent,
  QbQuestionType,
  QbSource,
  QbSubject,
} from "@/lib/qb/types";
import { QB_ADMIN_EXAMS } from "./constants";
import type { QbQuestionExamInput, QbQuestionInput, QbQuestionPatch } from "./contract";

/**
 * Pure editor state for one question (client-safe, tested): the form, its conversion to the
 * create body / the minimal patch, and option edits that keep the answer consistent.
 */

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

export type ExamRow = QbQuestionExamInput & { aiDifficulty: QbDifficulty | null; aiReason: string | null; existing: boolean };

export interface EditorForm {
  chapterId: string | null;
  /** Only used while there is no chapter (the subject comes from the chapter, §B3). */
  subject: QbSubject | null;
  content: QbQuestionContent;
  source: QbSource;
  /** One row per exam, in `QB_ADMIN_EXAMS` order. */
  exams: ExamRow[];
  adaptedNote: Bilingual | null;
}

const blank = (): Bilingual => ({ en: "", hi: "" });

export function emptyContent(type: QbQuestionType = "single"): QbQuestionContent {
  return {
    type,
    format: "standard",
    passageId: null,
    passageOrder: null,
    stem: blank(),
    options: type === "numerical" ? [] : [blank(), blank(), blank(), blank()],
    answer: null,
    solution: blank(),
    solutionSource: "none",
    hiSource: "none",
    figures: [],
    topics: [],
  };
}

function examRows(rows: readonly Partial<ExamRow & { exam: QbExam }>[]): ExamRow[] {
  return QB_ADMIN_EXAMS.map((exam) => {
    const row = rows.find((candidate) => candidate.exam === exam);
    return {
      exam,
      eligible: row?.eligible ?? false,
      crossExam: row?.crossExam ?? false,
      difficulty: row?.difficulty ?? null,
      syllabus: row?.syllabus ?? "unchecked",
      expectedTimeSec: row?.expectedTimeSec ?? null,
      aiDifficulty: row?.aiDifficulty ?? null,
      aiReason: row?.aiReason ?? null,
      existing: row !== undefined,
    };
  });
}

/** A new hand-made question: Aspire's own source until the author says otherwise. */
export function emptyForm(): EditorForm {
  return { chapterId: null, subject: null, content: emptyContent(), source: { kind: "aspire" }, exams: examRows([]), adaptedNote: null };
}

export function formFromQuestion(question: QbQuestion): EditorForm {
  return {
    chapterId: question.chapterId,
    subject: question.chapterId ? null : question.subject,
    content: structuredClone(question.content),
    source: { ...question.source },
    exams: examRows(question.exams.map((row) => ({ ...row, existing: true }))),
    adaptedNote: question.adaptedNote ? { ...question.adaptedNote } : null,
  };
}

/** Changes the type and keeps what still makes sense (a single answer becomes one of several). */
export function changeType(content: QbQuestionContent, type: QbQuestionType): QbQuestionContent {
  if (content.type === type) return content;
  if (type === "numerical") return { ...content, type, options: [], answer: null };
  const options = content.options.length >= MIN_OPTIONS ? content.options : [blank(), blank(), blank(), blank()];
  let answer: QbAnswer | null = null;
  if (type === "multiple" && content.answer?.kind === "single") answer = { kind: "multiple", indices: [content.answer.index] };
  if (type === "single" && content.answer?.kind === "multiple" && content.answer.indices.length === 1) answer = { kind: "single", index: content.answer.indices[0] };
  return { ...content, type, options, answer };
}

export function addOption(content: QbQuestionContent): QbQuestionContent {
  if (content.type === "numerical" || content.options.length >= MAX_OPTIONS) return content;
  return { ...content, options: [...content.options, blank()] };
}

/** Removes option `index`; answers pointing past it shift down, an answer on it is dropped. */
export function removeOption(content: QbQuestionContent, index: number): QbQuestionContent {
  if (content.options.length <= MIN_OPTIONS || index < 0 || index >= content.options.length) return content;
  const options = content.options.filter((_, i) => i !== index);
  const shift = (value: number) => (value > index ? value - 1 : value);
  let answer = content.answer;
  if (answer?.kind === "single") answer = answer.index === index ? null : { kind: "single", index: shift(answer.index) };
  if (answer?.kind === "multiple") {
    const indices = answer.indices.filter((value) => value !== index).map(shift);
    answer = indices.length > 0 ? { kind: "multiple", indices } : null;
  }
  const figures = content.figures
    .filter((figure) => figure.slot !== `option:${index}`)
    .map((figure) => {
      const match = /^option:(\d+)$/.exec(figure.slot);
      return match ? { ...figure, slot: `option:${shift(Number(match[1]))}` as const } : figure;
    });
  return { ...content, options, answer, figures };
}

/** Ticks / unticks option `index` of a multiple-correct answer (kept sorted, distinct). */
export function toggleMultiple(answer: QbAnswer | null, index: number, on: boolean): QbAnswer | null {
  const current = answer?.kind === "multiple" ? answer.indices : [];
  const indices = [...new Set(on ? [...current, index] : current.filter((value) => value !== index))].sort((a, b) => a - b);
  return indices.length > 0 ? { kind: "multiple", indices } : null;
}

/** Numerical answer from the form's text fields; null while the value is not a number. */
export function numericalAnswer(input: { value: string; integer: boolean; range: boolean; low: string; high: string; unitEn: string; unitHi: string }): QbAnswer | null {
  const value = Number(input.value.trim());
  if (input.value.trim() === "" || !Number.isFinite(value)) return null;
  const answer: QbAnswer = { kind: "numerical", value, integer: input.integer };
  if (input.range && !input.integer) {
    const low = Number(input.low.trim());
    const high = Number(input.high.trim());
    if (input.low.trim() !== "" && Number.isFinite(low)) answer.low = low;
    if (input.high.trim() !== "" && Number.isFinite(high)) answer.high = high;
  }
  if (input.unitEn.trim() || input.unitHi.trim()) answer.unit = { en: input.unitEn.trim(), hi: input.unitHi.trim() };
  return answer;
}

function examInput(row: ExamRow): QbQuestionExamInput {
  return {
    exam: row.exam,
    eligible: row.eligible,
    crossExam: row.crossExam ?? false,
    difficulty: row.difficulty,
    syllabus: row.syllabus ?? "unchecked",
    expectedTimeSec: row.expectedTimeSec ?? null,
  };
}

/** Optional source fields left empty are dropped (the API rejects empty strings for some). */
export function cleanSource(source: QbSource): QbSource {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    clean[key] = typeof value === "string" ? value.trim() : value;
  }
  return clean as unknown as QbSource;
}

/** POST body for a new question: only the exams it is used for. */
export function toCreateInput(form: EditorForm): QbQuestionInput {
  return {
    chapterId: form.chapterId,
    ...(form.chapterId === null && form.subject ? { subject: form.subject } : {}),
    content: form.content,
    source: cleanSource(form.source),
    exams: form.exams.filter((row) => row.eligible).map(examInput),
    adaptedNote: form.adaptedNote,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * PATCH body with only what changed against `original`; null when nothing did. Exam rows that
 * exist or are now ticked are sent, so unticking an exam reaches the server.
 */
export function toPatch(form: EditorForm, original: EditorForm, base: { version: number; updatedAt: number }): QbQuestionPatch | null {
  const patch: QbQuestionPatch = { baseVersion: base.version, baseUpdatedAt: base.updatedAt };
  let changed = false;
  if (form.chapterId !== original.chapterId) {
    patch.chapterId = form.chapterId;
    changed = true;
  }
  if (!same(form.content, original.content)) {
    patch.content = form.content;
    changed = true;
  }
  if (!same(cleanSource(form.source), cleanSource(original.source))) {
    patch.source = cleanSource(form.source);
    changed = true;
  }
  const exams = form.exams.filter((row) => row.existing || row.eligible).map(examInput);
  const originalExams = original.exams.filter((row) => row.existing || row.eligible).map(examInput);
  if (!same(exams, originalExams)) {
    patch.exams = exams;
    changed = true;
  }
  if (!same(form.adaptedNote, original.adaptedNote)) {
    patch.adaptedNote = form.adaptedNote;
    changed = true;
  }
  return changed ? patch : null;
}

export function isDirty(form: EditorForm, original: EditorForm): boolean {
  return toPatch(form, original, { version: 0, updatedAt: 0 }) !== null;
}

/**
 * The `[[figure:N]]` marker for figure `index` of a question: N is 1-based WITHIN the figure's slot
 * (the stem's figures, the solution's, each option's), as `parseRichText` / `<RichText>` read it.
 */
export function figureMarker(figures: readonly QbFigureRef[], index: number): string {
  const position = figurePosition(figures, index);
  return position === 0 ? "" : `[[figure:${position}]]`;
}

/** 1-based position of figure `index` among the figures of its own slot (0 if there is none). */
export function figurePosition(figures: readonly QbFigureRef[], index: number): number {
  const figure = figures[index];
  if (!figure) return 0;
  return figures.slice(0, index + 1).filter((entry) => entry.slot === figure.slot).length;
}
