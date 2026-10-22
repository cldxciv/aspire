import type { Bilingual, QbDifficulty, QbExam, QbFlag, QbFormat, QbQuestionContent, QbQuestionType, QbSource, QbSubject } from "@/lib/qb/types";

import { toCsv } from "./csv";
import { KEY_CSV_COLUMNS } from "./keys";
import { examFromLabel, parseAnswer, subjectFromLabel } from "./parse";
import type { ImportChapter, ImportDraft, TabularReport } from "./types";

/**
 * Tabular bank files (CSV / XLSX, no AI; docs/question-bank-plan.md §B8.8): the template, a dry run
 * that reports every problem first, then rows → drafts. Pure.
 *
 * Columns: id?, exams, subject, chapter, topics, type, format, stem_en, stem_hi, option_a_en …
 * option_d_hi (e, f optional), answer (A | A;C | 12 | 2.30-2.35), unit, solution_en, solution_hi,
 * difficulty_<exam>, aspire_ref, claimed_source, figure_note.
 *
 * These are Aspire's own questions (`source_kind: "aspire"`). An exam label in the file
 * ("[JEE Main 2023]") goes to `claimed_source`: staff-only, unverified, never public. A difficulty
 * column is the file's SUGGESTION; the per-exam difficulty is still set by a reviewer.
 */

const OPTION_LETTERS = ["a", "b", "c", "d", "e", "f"] as const;
const EXAM_COLUMNS: Record<string, QbExam> = {
  difficulty_jee_main: "JEE_MAIN",
  difficulty_neet: "NEET",
  difficulty_jee_adv: "JEE_ADV",
  difficulty_boh: "BOH",
};

export const BANK_TEMPLATE_COLUMNS: readonly string[] = [
  "id",
  "exams",
  "subject",
  "chapter",
  "topics",
  "type",
  "format",
  "stem_en",
  "stem_hi",
  ...OPTION_LETTERS.slice(0, 4).flatMap((letter) => [`option_${letter}_en`, `option_${letter}_hi`]),
  "answer",
  "unit",
  "solution_en",
  "solution_hi",
  ...Object.keys(EXAM_COLUMNS),
  "aspire_ref",
  "claimed_source",
  "figure_note",
];

const KNOWN_COLUMNS = new Set<string>([
  ...BANK_TEMPLATE_COLUMNS,
  ...OPTION_LETTERS.slice(4).flatMap((letter) => [`option_${letter}_en`, `option_${letter}_hi`]),
]);

/** Ids of the template's example rows: refused on import, so an example never becomes a draft. */
export const TEMPLATE_SAMPLE_PREFIX = "TEMPLATE-EXAMPLE-";

/** The downloadable template: header plus two ORIGINAL example rows written for this template (refused on import). */
export function bankTemplateCsv(): string {
  const sample1: Record<string, string> = {
    id: `${TEMPLATE_SAMPLE_PREFIX}1`,
    exams: "JEE_MAIN;NEET",
    subject: "physics",
    chapter: "",
    topics: "kinematics",
    type: "single",
    format: "standard",
    stem_en: String.raw`A ball is dropped from rest. Taking \(g = 10\,\text{m s}^{-2}\), how far does it fall in the first 2 s?`,
    stem_hi: "",
    option_a_en: "10 m",
    option_b_en: "20 m",
    option_c_en: "30 m",
    option_d_en: "40 m",
    answer: "B",
    difficulty_jee_main: "easy",
    difficulty_neet: "easy",
    aspire_ref: "",
  };
  const sample2: Record<string, string> = {
    id: `${TEMPLATE_SAMPLE_PREFIX}2`,
    exams: "JEE_MAIN",
    subject: "chemistry",
    type: "numerical",
    format: "standard",
    stem_en: String.raw`How many moles of \(\ce{O2}\) are needed to burn 2 mol of \(\ce{CH4}\) completely?`,
    answer: "4",
    unit: "mol",
    difficulty_jee_main: "easy",
    aspire_ref: "",
  };
  return toCsv([BANK_TEMPLATE_COLUMNS, ...[sample1, sample2].map((row) => BANK_TEMPLATE_COLUMNS.map((column) => row[column] ?? ""))]);
}

export function keyTemplateCsv(): string {
  return toCsv([[...KEY_CSV_COLUMNS], ["1", "", "physics", "", "B", "normal"], ["26", "", "chemistry", "", "4", "normal"], ["27", "", "chemistry", "", "", "dropped"]]);
}

export interface BankRowContext {
  importId: string;
  /** Chapters of every exam whose taxonomy is confirmed (the only chapters a row may name). */
  chapters: readonly ImportChapter[];
  /** Exams whose taxonomy an admin has confirmed; rows for other exams are refused. */
  confirmedExams: ReadonlySet<QbExam>;
  aspireRef: string | null;
  normaliseDollarMath: (text: string) => string;
  mathIssues: (text: string) => string[];
}

type RowError = { row: number; column: string | null; code: string };

const MAX_TEXT = 8000;
const TYPE_ALIASES: Record<string, QbQuestionType> = {
  single: "single",
  mcq: "single",
  scq: "single",
  multiple: "multiple",
  msq: "multiple",
  mcq_multiple: "multiple",
  numerical: "numerical",
  numeric: "numerical",
  integer: "numerical",
  nvq: "numerical",
};
const TABULAR_FORMATS: readonly QbFormat[] = ["standard", "assertion_reason", "statements", "match_list"];

function bi(en: string, hi: string): Bilingual {
  return { en, hi };
}

/**
 * Validates every row and builds the drafts of the valid ones. Errors stop a row; warnings do not.
 * The report is what the dry run shows before "Create N drafts".
 */
export function bankRowsToDrafts(table: readonly (readonly string[])[], ctx: BankRowContext, maxListed = 200): { drafts: ImportDraft[]; report: TabularReport } {
  const report: TabularReport = { kind: "bank", rows: Math.max(0, table.length - 1), valid: 0, errors: [], warnings: [], bySubject: {}, byExam: {}, flags: {}, moreErrors: 0 };
  const drafts: ImportDraft[] = [];
  const error = (row: number, column: string | null, code: string) => {
    if (report.errors.length < maxListed) report.errors.push({ row, column, code });
    else report.moreErrors += 1;
  };
  const warning = (row: number, column: string | null, code: string) => {
    if (report.warnings.length < maxListed) report.warnings.push({ row, column, code });
  };
  if (table.length === 0) {
    error(1, null, "header_missing");
    return { drafts, report };
  }
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const headerErrors: RowError[] = [];
  for (const name of header) if (name && !KNOWN_COLUMNS.has(name)) headerErrors.push({ row: 1, column: name, code: "unknown_column" });
  for (const required of ["exams", "type", "stem_en"]) if (!header.includes(required)) headerErrors.push({ row: 1, column: required, code: "column_missing" });
  if (new Set(header.filter(Boolean)).size !== header.filter(Boolean).length) headerErrors.push({ row: 1, column: null, code: "duplicate_column" });
  if (headerErrors.length > 0) {
    for (const entry of headerErrors) error(entry.row, entry.column, entry.code);
    return { drafts, report };
  }
  const chapters = new Map<string, ImportChapter>(ctx.chapters.map((chapter): [string, ImportChapter] => [chapter.id, chapter]));
  const seenKeys = new Set<string>();

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const get = (name: string): string => {
      const at = header.indexOf(name);
      return at >= 0 ? (cells[at] ?? "").trim() : "";
    };
    const errorsBefore = report.errors.length + report.moreErrors;
    const fail = (column: string | null, code: string) => error(line, column, code);

    // Exams (taxonomy gate per exam).
    const examLabels = get("exams").split(/[;,|]/).map((label) => label.trim()).filter(Boolean);
    const exams: QbExam[] = [];
    for (const label of examLabels) {
      const exam = examFromLabel(label);
      if (!exam) fail("exams", "unknown_exam");
      else if (!ctx.confirmedExams.has(exam)) fail("exams", "taxonomy_unconfirmed");
      else if (!exams.includes(exam)) exams.push(exam);
    }
    if (examLabels.length === 0) fail("exams", "required");

    // Subject and chapter (the chapter decides the subject).
    const chapterId = get("chapter");
    const chapter = chapterId ? chapters.get(chapterId) ?? null : null;
    if (chapterId && !chapter) fail("chapter", "unknown_chapter");
    const typedSubject = get("subject") ? subjectFromLabel(get("subject")) : null;
    if (get("subject") && !typedSubject) fail("subject", "unknown_subject");
    if (chapter && typedSubject && chapter.subject !== typedSubject && !(typedSubject === "biology" && (chapter.subject === "botany" || chapter.subject === "zoology"))) {
      fail("chapter", "chapter_subject_mismatch");
    }
    const subject: QbSubject | null = chapter?.subject ?? typedSubject;
    if (!subject) fail("subject", "required");

    // Type, format, text.
    const type = TYPE_ALIASES[get("type").toLowerCase()];
    if (!type) fail("type", get("type") ? "invalid_type" : "required");
    const formatRaw = get("format").toLowerCase() || "standard";
    const format = (TABULAR_FORMATS as readonly string[]).includes(formatRaw) ? (formatRaw as QbFormat) : null;
    if (!format) fail("format", formatRaw === "passage" ? "passage_not_supported" : "invalid_format");
    const stemEn = ctx.normaliseDollarMath(get("stem_en"));
    const stemHi = ctx.normaliseDollarMath(get("stem_hi"));
    if (!stemEn) fail("stem_en", "required");
    if (stemEn.length > MAX_TEXT || stemHi.length > MAX_TEXT) fail("stem_en", "too_long");

    // Options: contiguous from A; numerical questions have none.
    const options: Bilingual[] = [];
    let gap = false;
    for (const letter of OPTION_LETTERS) {
      const en = ctx.normaliseDollarMath(get(`option_${letter}_en`));
      const hi = ctx.normaliseDollarMath(get(`option_${letter}_hi`));
      if (!en && !hi) {
        gap = true;
        continue;
      }
      if (gap || !en) fail(`option_${letter}_en`, "option_gap");
      if (en.length > MAX_TEXT || hi.length > MAX_TEXT) fail(`option_${letter}_en`, "too_long");
      options.push(bi(en, hi));
    }
    if (type === "numerical" && options.length > 0) fail("option_a_en", "numerical_has_options");
    if ((type === "single" || type === "multiple") && options.length < 2) fail("option_a_en", "options_missing");

    // Answer (optional: a missing answer is a warning and the draft gets `answer_missing`).
    const answerRaw = get("answer");
    let answer: QbQuestionContent["answer"] = null;
    if (answerRaw && type) {
      const parsed = parseAnswer(answerRaw, { type, optionCount: options.length });
      if (parsed.ok) answer = parsed.answer;
      else fail("answer", parsed.reason === "answer_out_of_range" ? "answer_out_of_range" : "invalid_answer");
    }
    const unit = get("unit");
    if (answer?.kind === "numerical" && unit) answer = { ...answer, unit: bi(unit.slice(0, 40), "") };
    if (!answerRaw) warning(line, "answer", "answer_missing");

    // Difficulty suggestions per exam.
    const suggested = new Map<QbExam, QbDifficulty>();
    for (const [column, exam] of Object.entries(EXAM_COLUMNS)) {
      const value = get(column).toLowerCase();
      if (!value) continue;
      if (value !== "easy" && value !== "medium" && value !== "hard") fail(column, "invalid_difficulty");
      else if (!exams.includes(exam)) warning(line, column, "difficulty_for_other_exam");
      else suggested.set(exam, value);
    }

    const topics = get("topics").split(/[;,]/).map((topic) => topic.trim()).filter(Boolean);
    if (topics.length > 10 || topics.some((topic) => topic.length > 60)) fail("topics", "too_long");

    // Idempotency: the row id, else the row number.
    const id = get("id");
    if (id && !/^[A-Za-z0-9._-]{1,60}$/.test(id)) fail("id", "invalid_id");
    if (id.toUpperCase().startsWith(TEMPLATE_SAMPLE_PREFIX)) fail("id", "template_example_row");
    const sourceKey = id ? `id:${id}` : `row:${line}`;
    if (seenKeys.has(sourceKey)) fail("id", "duplicate_id");

    if (report.errors.length + report.moreErrors > errorsBefore || !type || !format || !subject) return;
    seenKeys.add(sourceKey);

    const solutionEn = ctx.normaliseDollarMath(get("solution_en"));
    const solutionHi = ctx.normaliseDollarMath(get("solution_hi"));
    const hiComplete = !!stemHi && options.every((option) => !!option.hi);
    const flags = new Set<QbFlag>(["difficulty_missing"]);
    if (!answer) flags.add("answer_missing");
    if (!chapter) {
      flags.add("chapter_missing");
      warning(line, "chapter", "chapter_missing");
    }
    if (!hiComplete) flags.add("hi_missing");
    const figureNote = get("figure_note");
    if (figureNote || /\[\[figure:\d+\]\]/.test(stemEn)) flags.add("figure_needed");
    const texts = [stemEn, stemHi, solutionEn, solutionHi, ...options.flatMap((option) => [option.en, option.hi])];
    if (texts.some((text) => text && ctx.mathIssues(text).length > 0)) {
      flags.add("math_error");
      warning(line, "stem_en", "math_error");
    }

    const source: QbSource = { kind: "aspire", importId: ctx.importId };
    const aspireRef = get("aspire_ref") || ctx.aspireRef;
    if (aspireRef) source.aspireRef = aspireRef.slice(0, 120);
    const claimed = get("claimed_source");
    if (claimed) source.claimedSource = claimed.slice(0, 120);

    const draft: ImportDraft = {
      sourceKey,
      content: {
        type,
        format,
        passageId: null,
        passageOrder: null,
        stem: bi(stemEn, stemHi),
        options,
        answer,
        solution: bi(solutionEn, solutionHi),
        solutionSource: solutionEn || solutionHi ? "staff" : "none",
        hiSource: hiComplete ? "staff" : "none",
        figures: [],
        topics,
      },
      subject,
      chapterId: chapter?.id ?? null,
      source,
      aiDifficulty: null,
      aiReason: null,
      confidence: 1,
      flags: [...flags],
      patternTag: null,
      originalMarking: null,
      exams: exams.map((exam) => ({ exam, suggestedDifficulty: suggested.get(exam) ?? null })),
    };
    if (figureNote) draft.notes = [`figure: ${figureNote.slice(0, 300)}`];
    drafts.push(draft);
    report.valid += 1;
    report.bySubject[subject] = (report.bySubject[subject] ?? 0) + 1;
    for (const exam of exams) report.byExam[exam] = (report.byExam[exam] ?? 0) + 1;
    for (const flag of flags) report.flags[flag] = (report.flags[flag] ?? 0) + 1;
  });
  return { drafts, report };
}
