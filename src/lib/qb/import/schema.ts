import { z } from "zod";

import type { ExtractedQuestion, FigureHint, ItemOutput, KeyRow, PageMark, PatternSection, PrintedHeader } from "./types";

/**
 * Output schemas for the model and validation of what comes back (docs/question-bank-plan.md §B8.3).
 *
 * The schema SENT to the API (`output_config.format`) is deliberately loose: types and required
 * keys only, no lengths or counts (structured outputs reject most constraints, and a strict schema
 * would make one odd field fail a whole paid batch). Each question is then validated here with
 * zod: length caps, 2–6 options, the question-number pattern. An invalid question is kept as a
 * low-confidence draft with the reason when its stem and number are usable, otherwise it is
 * skipped and reported on the item. One bad field never discards the batch.
 *
 * The import API bodies (upload metadata, job actions) are QB-CORE-A's `importMetaSchema` /
 * `importActionSchema` in src/lib/qb/schemas.ts.
 */

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const stringArray = { type: "array", items: { type: "string" } } as const;
/**
 * A printed-text field where an empty string means "not printed". Structured outputs allow at most
 * 16 parameters with union types (`anyOf` / type arrays) per request; above that the API answers 400
 * ("Schemas contains too many parameters with union types"). The header and instruction labels use
 * this instead of `nullableString` so the paper schema stays well under the limit (`STRUCTURED_OUTPUT_UNION_LIMIT`).
 */
const printedString = { type: "string" } as const;
/** The API's limit on union-typed parameters in one structured-output schema. */
export const STRUCTURED_OUTPUT_UNION_LIMIT = 16;

function object(properties: Record<string, unknown>) {
  return { type: "object", additionalProperties: false, required: Object.keys(properties), properties };
}

const HEADER_SCHEMA = object({
  exam: printedString,
  year: printedString,
  date: printedString,
  session: printedString,
  shift: printedString,
  paper: printedString,
  booklet: printedString,
});

const PAGE_MARKS_SCHEMA = {
  type: "array",
  items: object({ page: { type: "integer" }, kind: { type: "string", enum: ["watermark", "publisher", "url", "other"] }, text: { type: "string" } }),
} as const;

const INSTRUCTIONS_SCHEMA = {
  type: "array",
  items: object({ page: { type: "integer" }, subject: printedString, section: printedString, text: { type: "string" } }),
} as const;

const FIGURE_SCHEMA = object({
  n: { type: "integer" },
  page: { type: "integer" },
  bbox: { anyOf: [{ type: "array", items: { type: "number" } }, { type: "null" }] },
  description: { type: "string" },
});

const QUESTION_SCHEMA = object({
  startPage: { type: "integer" },
  qno: { type: "string" },
  questionRef: nullableString,
  optionRefs: stringArray,
  subject: nullableString,
  section: nullableString,
  type: { type: "string", enum: ["single", "multiple", "numerical", "unsupported"] },
  format: { type: "string", enum: ["standard", "assertion_reason", "statements", "match_list", "passage"] },
  stem: { type: "string" },
  options: stringArray,
  stemHi: nullableString,
  optionsHi: stringArray,
  answer: nullableString,
  solution: nullableString,
  unit: nullableString,
  passageRef: nullableString,
  passage: nullableString,
  figures: { type: "array", items: FIGURE_SCHEMA },
  chapterId: nullableString,
  difficulty: { anyOf: [{ type: "string", enum: ["easy", "medium", "hard"] }, { type: "null" }] },
  difficultyReason: nullableString,
  confidence: { type: "number" },
  claimedSource: nullableString,
  issues: stringArray,
});

/** Question papers and bank files (PDF pages or DOCX text). */
export const PAPER_OUTPUT_SCHEMA = object({
  header: HEADER_SCHEMA,
  pageMarks: PAGE_MARKS_SCHEMA,
  instructions: INSTRUCTIONS_SCHEMA,
  questions: { type: "array", items: QUESTION_SCHEMA },
});

/** Answer-key tables. */
export const KEY_OUTPUT_SCHEMA = object({
  header: HEADER_SCHEMA,
  pageMarks: PAGE_MARKS_SCHEMA,
  rows: {
    type: "array",
    items: object({
      qno: nullableString,
      questionRef: nullableString,
      subject: nullableString,
      booklet: nullableString,
      answer: { type: "string" },
      status: { type: "string", enum: ["normal", "dropped", "bonus", "multiple"] },
    }),
  },
});

// ---------------------------------------------------------------------------------------------
// Per-question validation (strict, after the loose parse)

export const MAX_FIELD_CHARS = 8000;
const QNO = /^[0-9A-Za-z .()\-#:]{1,16}$/;

const strictQuestion = z.object({
  startPage: z.number().int().min(1).max(5000),
  qno: z.string().trim().regex(QNO),
  stem: z.string().trim().min(1).max(MAX_FIELD_CHARS),
  type: z.enum(["single", "multiple", "numerical", "unsupported"]),
  format: z.enum(["standard", "assertion_reason", "statements", "match_list", "passage"]),
  options: z.array(z.string().max(MAX_FIELD_CHARS)).max(6),
  optionsHi: z.array(z.string().max(MAX_FIELD_CHARS)).max(6),
  stemHi: z.string().max(MAX_FIELD_CHARS).nullable(),
  solution: z.string().max(MAX_FIELD_CHARS).nullable(),
  passage: z.string().max(MAX_FIELD_CHARS).nullable(),
  confidence: z.number().min(0).max(1),
});

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function strArray(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => (typeof item === "string" ? item.slice(0, maxChars) : ""));
}

function intOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function figureOf(value: unknown): FigureHint | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const page = intOf(record.page);
  if (page === null || page < 1) return null;
  const bbox = Array.isArray(record.bbox) && record.bbox.length === 4 && record.bbox.every((n) => typeof n === "number" && Number.isFinite(n))
    ? (record.bbox.map((n) => Math.min(1, Math.max(0, n as number))) as [number, number, number, number])
    : null;
  return { n: intOf(record.n) ?? 0, page, bbox, description: str(record.description, 300) ?? "" };
}

/**
 * Validates one loosely-parsed question. Returns the cleaned question (with any problems in
 * `validation`), or null with a reason when it cannot become a draft at all.
 */
export function validateQuestion(raw: unknown, pageOffset: number): { question: ExtractedQuestion } | { reason: string } {
  if (typeof raw !== "object" || raw === null) return { reason: "not_an_object" };
  const record = raw as Record<string, unknown>;
  const stem = str(record.stem, MAX_FIELD_CHARS + 1);
  const qno = str(record.qno, 40);
  const startRaw = intOf(record.startPage);
  if (!stem) return { reason: "stem_missing" };
  if (!qno) return { reason: "qno_missing" };
  if (startRaw === null || startRaw < 1) return { reason: "start_page_missing" };

  const candidate = {
    startPage: startRaw + pageOffset,
    qno,
    stem,
    type: typeof record.type === "string" ? record.type : "unsupported",
    format: typeof record.format === "string" ? record.format : "standard",
    options: Array.isArray(record.options) ? record.options : [],
    optionsHi: Array.isArray(record.optionsHi) ? record.optionsHi : [],
    stemHi: typeof record.stemHi === "string" && record.stemHi.trim() ? record.stemHi : null,
    solution: typeof record.solution === "string" && record.solution.trim() ? record.solution : null,
    passage: typeof record.passage === "string" && record.passage.trim() ? record.passage : null,
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
  };
  const checked = strictQuestion.safeParse(candidate);
  const validation: string[] = [];
  if (!checked.success) {
    for (const issue of checked.error.issues) validation.push(`${issue.path.join(".") || "question"}:${issue.code}`);
    if (validation.some((entry) => entry.startsWith("qno:"))) return { reason: "qno_invalid" };
    if (validation.some((entry) => entry.startsWith("startPage:"))) return { reason: "start_page_invalid" };
  }
  const type = ["single", "multiple", "numerical", "unsupported"].includes(candidate.type) ? candidate.type : "unsupported";
  const format = ["standard", "assertion_reason", "statements", "match_list", "passage"].includes(candidate.format) ? candidate.format : "standard";
  const options = strArray(candidate.options, 6, MAX_FIELD_CHARS).map((option) => option.trim());
  if ((type === "single" || type === "multiple") && (options.length < 2 || options.some((option) => !option))) {
    validation.push("options:incomplete");
  }
  const confidence = Math.min(1, Math.max(0, candidate.confidence));
  return {
    question: {
      startPage: candidate.startPage,
      qno: qno.slice(0, 16),
      questionRef: str(record.questionRef, 40),
      optionRefs: strArray(record.optionRefs, 6, 40).map((ref) => ref.trim()),
      subject: str(record.subject, 60),
      section: str(record.section, 60),
      type,
      format,
      stem: stem.slice(0, MAX_FIELD_CHARS),
      options,
      stemHi: candidate.stemHi ? candidate.stemHi.trim().slice(0, MAX_FIELD_CHARS) : null,
      optionsHi: strArray(candidate.optionsHi, 6, MAX_FIELD_CHARS).map((option) => option.trim()),
      answer: str(record.answer, 80),
      solution: candidate.solution ? candidate.solution.trim().slice(0, MAX_FIELD_CHARS) : null,
      unit: str(record.unit, 40),
      passageRef: str(record.passageRef, 40),
      passage: candidate.passage ? candidate.passage.trim().slice(0, MAX_FIELD_CHARS) : null,
      figures: (Array.isArray(record.figures) ? record.figures : [])
        .slice(0, 12)
        .map(figureOf)
        .filter((figure): figure is FigureHint => figure !== null)
        .map((figure) => ({ ...figure, page: figure.page + pageOffset })),
      chapterId: str(record.chapterId, 64),
      difficulty: ["easy", "medium", "hard"].includes(String(record.difficulty)) ? String(record.difficulty) : null,
      difficultyReason: str(record.difficultyReason, 300),
      confidence,
      claimedSource: str(record.claimedSource, 120),
      issues: strArray(record.issues, 10, 200).filter(Boolean),
      validation,
    },
  };
}

/** A `printedString` field: empty (or a literal "null") means not printed. */
function printed(value: unknown, max: number): string | null {
  const text = str(value, max);
  return text === null || /^null$/i.test(text) ? null : text;
}

function headerOf(value: unknown): PrintedHeader | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    exam: printed(record.exam, 60),
    year: printed(record.year, 20),
    date: printed(record.date, 40),
    session: printed(record.session, 40),
    shift: printed(record.shift, 40),
    paper: printed(record.paper, 40),
    booklet: printed(record.booklet, 20),
  };
}

function marksOf(value: unknown, pageOffset: number): PageMark[] {
  if (!Array.isArray(value)) return [];
  const marks: PageMark[] = [];
  for (const entry of value.slice(0, 50)) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const text = str(record.text, 200);
    if (!text) continue;
    const kind = ["watermark", "publisher", "url", "other"].includes(String(record.kind)) ? (String(record.kind) as PageMark["kind"]) : "other";
    marks.push({ page: Math.max(1, (intOf(record.page) ?? 1) + pageOffset), kind, text });
  }
  return marks;
}

function instructionsOf(value: unknown, pageOffset: number): PatternSection[] {
  if (!Array.isArray(value)) return [];
  const sections: PatternSection[] = [];
  for (const entry of value.slice(0, 40)) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const text = str(record.text, 4000);
    if (!text) continue;
    sections.push({ page: Math.max(1, (intOf(record.page) ?? 1) + pageOffset), subject: printed(record.subject, 60), section: printed(record.section, 60), text });
  }
  return sections;
}

export type ParsedOutput = { ok: true; output: ItemOutput } | { ok: false; reason: "output_empty" | "output_not_json" | "output_not_object" };

function parseJsonText(text: string | null): { ok: true; value: Record<string, unknown> } | { ok: false; reason: "output_empty" | "output_not_json" | "output_not_object" } {
  if (!text || !text.trim()) return { ok: false, reason: "output_empty" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "output_not_json" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, reason: "output_not_object" };
  return { ok: true, value: value as Record<string, unknown> };
}

/**
 * Loose parse of a paper / bank response. `pageOffset` maps the attachment's page positions back
 * to the original document (sliced PDF: `pageFrom - 1`; whole document: 0). `ownPages` keeps only
 * questions that start on this item's own pages (the lookahead page and anything outside are
 * dropped and counted).
 */
export function parsePaperOutput(text: string | null, pageOffset: number, ownPages: { from: number; to: number } | null): ParsedOutput {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const questions: ExtractedQuestion[] = [];
  const invalid: { index: number; reason: string }[] = [];
  let skippedOutside = 0;
  const rawQuestions = Array.isArray(value.questions) ? value.questions : [];
  rawQuestions.slice(0, 400).forEach((raw, index) => {
    const result = validateQuestion(raw, pageOffset);
    if ("reason" in result) {
      invalid.push({ index, reason: result.reason });
      return;
    }
    if (ownPages && (result.question.startPage < ownPages.from || result.question.startPage > ownPages.to)) {
      skippedOutside += 1;
      return;
    }
    questions.push(result.question);
  });
  return {
    ok: true,
    output: {
      header: headerOf(value.header),
      questions,
      keyRows: [],
      pageMarks: marksOf(value.pageMarks, pageOffset),
      instructions: instructionsOf(value.instructions, pageOffset),
      skippedOutside,
      invalid,
    },
  };
}

/** Loose parse of a key-table response. */
export function parseKeyOutput(text: string | null, pageOffset: number): ParsedOutput {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  const keyRows: KeyRow[] = [];
  const invalid: { index: number; reason: string }[] = [];
  const rawRows = Array.isArray(value.rows) ? value.rows : [];
  rawRows.slice(0, 2000).forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      invalid.push({ index, reason: "not_an_object" });
      return;
    }
    const record = raw as Record<string, unknown>;
    const answer = str(record.answer, 80) ?? "";
    const status = ["normal", "dropped", "bonus", "multiple"].includes(String(record.status)) ? (String(record.status) as KeyRow["status"]) : "normal";
    const qno = str(record.qno, 16);
    const questionRef = str(record.questionRef, 40);
    if (!qno && !questionRef) {
      invalid.push({ index, reason: "qno_missing" });
      return;
    }
    if (!answer && status === "normal") {
      invalid.push({ index, reason: "answer_missing" });
      return;
    }
    keyRows.push({ qno, questionRef, subject: str(record.subject, 60), booklet: str(record.booklet, 20), answer, status, line: index + 1 });
  });
  return {
    ok: true,
    output: {
      header: headerOf(value.header),
      questions: [],
      keyRows,
      pageMarks: marksOf(value.pageMarks, pageOffset),
      instructions: [],
      skippedOutside: 0,
      invalid,
    },
  };
}
