import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { mathProblemsIn } from "@/lib/qb/math-check";
import { normaliseDollarMath } from "@/lib/qb/rich-text";
import type { QbImportMeta } from "@/lib/qb/types";

import { syntheticDocx, writeZip } from "./__fixtures__/zip-writer";
import { aiAvailability, getImportConfig, IMPORT_MODEL_PRICES } from "./config";
import { csvCell, decodeUtf8, parseCsv, toCsv } from "./csv";
import { chunkText, docxEquationCheck, hasWordEquations, readDocx } from "./docx";
import { estimateImport, istDayStart, pagesPerItem, questionsPerPage, usageUsd } from "./estimate";
import { keyRowsFromTable, matchKeyRows } from "./keys";
import { headerMismatches, isoDateOf, type NormalizeContext, normalizeOutput, sourceKeyOf, thirdPartyMarks } from "./normalize";
import { pairHindi } from "./pairing";
import { examFromLabel, normaliseQno, parseAnswer, sectionSlug, subjectFromLabel } from "./parse";
import { halvePages, inspectPdf, isPdf, PdfSlicer, planPageItems, requestPages } from "./pdf";
import { KEY_OUTPUT_SCHEMA, PAPER_OUTPUT_SCHEMA, parseKeyOutput, parsePaperOutput, STRUCTURED_OUTPUT_UNION_LIMIT } from "./schema";
import { bankRowsToDrafts, bankTemplateCsv, keyTemplateCsv } from "./template";
import type { ExtractedQuestion, ImportQuestionRef, KeyRow } from "./types";
import { readXlsxRows } from "./xlsx";
import { checkZip, readCentralDirectory } from "./zipguard";

// Every question text below is ORIGINAL synthetic content written for these tests.

const mathIssues = (text: string) => mathProblemsIn(text).map((problem) => problem.message);

function question(overrides: Partial<ExtractedQuestion> = {}): ExtractedQuestion {
  return {
    startPage: 1,
    qno: "1",
    questionRef: null,
    optionRefs: [],
    subject: "Physics",
    section: "Section A",
    type: "single",
    format: "standard",
    stem: "A cart covers \\(12\\,\\text{m}\\) in 3 s. What is its speed?",
    options: ["2 m/s", "4 m/s", "6 m/s", "36 m/s"],
    stemHi: null,
    optionsHi: [],
    answer: null,
    solution: null,
    unit: null,
    passageRef: null,
    passage: null,
    figures: [],
    chapterId: "phy-kinematics",
    difficulty: "easy",
    difficultyReason: "one-step",
    confidence: 0.95,
    claimedSource: null,
    issues: [],
    validation: [],
    ...overrides,
  };
}

const OFFICIAL_META: QbImportMeta = { sourceKind: "official", exam: "JEE_MAIN", year: 2025, date: "2025-01-22", session: "January", shift: "Shift 1", language: "en" };

function ctx(overrides: Partial<NormalizeContext> = {}): NormalizeContext {
  return {
    importId: "imp_aaaaaaaaaaaaaaaa",
    kind: "pdf_paper",
    meta: OFFICIAL_META,
    chapters: [
      { id: "phy-kinematics", subject: "physics", label: "Kinematics" },
      { id: "che-mole", subject: "chemistry", label: "Mole concept" },
      { id: "bot-cell", subject: "botany", label: "Cell" },
    ],
    thirdParty: false,
    snapshot: null,
    text: { normaliseDollarMath, mathIssues },
    patterns: { patternTag: (exam, year) => `${exam}-${year}`, originalMarking: () => ({ correct: 4, wrong: -1 }) },
    ...overrides,
  };
}

describe("csv", () => {
  it("parses quotes, doubled quotes, CRLF and a BOM", () => {
    const text = decodeUtf8(Buffer.from('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n'));
    expect(parseCsv(text ?? "", 10)).toEqual({ ok: true, rows: [["a", "b"], ["x, y", 'say "hi"']] });
  });

  it("guards formula cells on export and removes the guard on import", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-3")).toBe("'-3");
    const parsed = parseCsv(toCsv([["=1+1", "@x", "plain"]]), 5);
    expect(parsed).toEqual({ ok: true, rows: [["=1+1", "@x", "plain"]] });
  });

  it("refuses too many rows and invalid UTF-8", () => {
    expect(parseCsv("a\nb\nc\n", 2)).toEqual({ ok: false, reason: "csv_too_many_rows" });
    expect(decodeUtf8(Buffer.from([0xff, 0xfe, 0x00]))).toBeNull();
  });
});

describe("parse", () => {
  it("reads answers in every key form", () => {
    const single = { type: "single" as const, optionCount: 4 };
    expect(parseAnswer("B", single)).toEqual({ ok: true, answer: { kind: "single", index: 1 } });
    expect(parseAnswer("(c)", single)).toEqual({ ok: true, answer: { kind: "single", index: 2 } });
    expect(parseAnswer("3", single)).toEqual({ ok: true, answer: { kind: "single", index: 2 } });
    expect(parseAnswer("E", single)).toEqual({ ok: false, reason: "answer_out_of_range" });
    expect(parseAnswer("4382931002", { ...single, optionRefs: ["4382931001", "4382931002", "4382931003", "4382931004"] })).toEqual({
      ok: true,
      answer: { kind: "single", index: 1 },
    });
    expect(parseAnswer("A;C", { type: "multiple", optionCount: 4 })).toEqual({ ok: true, answer: { kind: "multiple", indices: [0, 2] } });
    expect(parseAnswer("CA", { type: "multiple", optionCount: 4 })).toEqual({ ok: true, answer: { kind: "multiple", indices: [0, 2] } });
    expect(parseAnswer("12", { type: "numerical", optionCount: 0 })).toEqual({ ok: true, answer: { kind: "numerical", value: 12, integer: true } });
    expect(parseAnswer("2.30-2.35", { type: "numerical", optionCount: 0 })).toEqual({
      ok: true,
      answer: { kind: "numerical", value: 2.325, low: 2.3, high: 2.35, integer: false },
    });
    expect(parseAnswer("-1.5", { type: "numerical", optionCount: 0 })).toEqual({ ok: true, answer: { kind: "numerical", value: -1.5, integer: false } });
  });

  it("maps labels, numbers and sections", () => {
    expect(examFromLabel("JEE (Main) 2025")).toBe("JEE_MAIN"); // as printed on a paper header
    expect(examFromLabel("Common Admission Test")).toBeNull();
    expect(examFromLabel("jee-main")).toBe("JEE_MAIN");
    expect(examFromLabel("NEET (UG)")).toBe("NEET");
    expect(examFromLabel("JEE Advanced")).toBe("JEE_ADV");
    expect(subjectFromLabel("Mathematics")).toBe("maths");
    expect(subjectFromLabel("भौतिक विज्ञान")).toBe("physics");
    expect(normaliseQno("Q.012")).toBe("12");
    expect(sectionSlug("SECTION - B")).toBe("b");
    expect(sectionSlug("खंड A")).toBe("a");
  });
});

describe("zip guard (zip bombs)", () => {
  it("accepts a small Word file and finds its main document", () => {
    const zip = checkZip(syntheticDocx(["Q1. A synthetic question."]));
    expect(zip.ok).toBe(true);
  });

  it("refuses more than 2,000 entries before reading any of them", () => {
    const entries = Array.from({ length: 2001 }, (_, index) => ({ name: `f${index}.txt`, data: "" }));
    expect(readCentralDirectory(writeZip(entries))).toEqual({ ok: false, reason: "zip_too_many_entries" });
  });

  it("refuses a directory that declares more than 50 MB uncompressed", () => {
    const bomb = writeZip([{ name: "word/document.xml", data: "x", declaredSize: 60 * 1024 * 1024 }]);
    expect(checkZip(bomb)).toEqual({ ok: false, reason: "zip_too_large" });
  });

  it("refuses an entry that inflates past its declared size (a lying directory)", () => {
    const zeros = Buffer.alloc(2 * 1024 * 1024);
    const liar = writeZip([{ name: "word/document.xml", data: zeros, deflate: true, declaredSize: 100 }]);
    expect(checkZip(liar)).toEqual({ ok: false, reason: "zip_size_mismatch" });
  });
});

describe("docx", () => {
  it("warns about Word equations and OLE objects", async () => {
    expect(hasWordEquations("<w:p><m:oMath><m:r/></m:oMath></w:p>")).toBe(true);
    expect(hasWordEquations('<o:OLEObject ProgID="Equation.DSMT4"/>')).toBe(true);
    expect(docxEquationCheck(syntheticDocx(["Plain text."]))).toEqual({ ok: true, equationWarning: false });
    expect(docxEquationCheck(syntheticDocx(["With maths."], { equation: true }))).toEqual({ ok: true, equationWarning: true });
    const read = await readDocx(syntheticDocx(["Q1. Which gas is used in photosynthesis?", "(a) Oxygen (b) Carbon dioxide"], { equation: true }));
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.equationWarning).toBe(true);
      expect(read.text).toContain("Which gas is used in photosynthesis?");
      expect(read.chunks).toHaveLength(1);
    }
  });

  it("chunks at paragraph breaks", () => {
    const text = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} ${"x".repeat(40)}`).join("\n\n");
    const chunks = chunkText(text, 120);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((chunk) => chunk.length <= 120)).toBe(true);
    expect(chunks.join("\n\n")).toBe(text);
  });
});

describe("xlsx and the bank template (dry run)", () => {
  const fixture = readFileSync(join(__dirname, "__fixtures__", "bank-sample.xlsx"));
  const rowCtx = (confirmed: string[]) => ({
    importId: "imp_bbbbbbbbbbbbbbbb",
    chapters: [{ id: "phy-kinematics", subject: "physics" as const, label: "Kinematics" }],
    confirmedExams: new Set(confirmed as ("JEE_MAIN" | "NEET" | "JEE_ADV" | "BOH")[]),
    aspireRef: null,
    normaliseDollarMath,
    mathIssues,
  });

  it("reads the synthetic workbook as text cells", async () => {
    const read = await readXlsxRows(fixture);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.rows[0].slice(0, 3)).toEqual(["id", "exams", "subject"]);
    expect(read.rows).toHaveLength(5);
    expect(read.rows[2][17]).toBe("4");
  });

  it("validates every row, reports problems, and builds Aspire drafts for the valid ones", async () => {
    const read = await readXlsxRows(fixture);
    if (!read.ok) throw new Error("fixture unreadable");
    const { drafts, report } = bankRowsToDrafts(read.rows, rowCtx(["JEE_MAIN", "NEET", "JEE_ADV"]));
    expect(report).toMatchObject({ kind: "bank", rows: 4, valid: 3 });
    expect(report.errors).toEqual([{ row: 5, column: "exams", code: "unknown_exam" }]);
    expect(drafts.map((draft) => draft.sourceKey)).toEqual(["id:SYN-1", "id:SYN-2", "id:SYN-3"]);
    const [first, second, third] = drafts;
    expect(first.source).toMatchObject({ kind: "aspire", aspireRef: "Synthetic fixture" });
    expect(first.content.answer).toEqual({ kind: "single", index: 1 });
    expect(first.exams).toEqual([{ exam: "JEE_MAIN", suggestedDifficulty: "easy" }]);
    expect(second.content.answer).toEqual({ kind: "numerical", value: 4, integer: true, unit: { en: "atoms", hi: "" } });
    expect(third.content.answer).toEqual({ kind: "multiple", indices: [0, 2] });
    // A label in the file is only an unverified, staff-only claim.
    expect(third.source.claimedSource).toBe("[Practice set 1]");
    expect(third.flags).toEqual(expect.arrayContaining(["difficulty_missing", "chapter_missing", "hi_missing"]));
  });

  it("refuses rows for an exam whose taxonomy is not confirmed", async () => {
    const read = await readXlsxRows(fixture);
    if (!read.ok) throw new Error("fixture unreadable");
    const { report } = bankRowsToDrafts(read.rows, rowCtx(["JEE_MAIN"]));
    expect(report.errors).toEqual(
      expect.arrayContaining([
        { row: 3, column: "exams", code: "taxonomy_unconfirmed" },
        { row: 4, column: "exams", code: "taxonomy_unconfirmed" },
      ]),
    );
    expect(report.valid).toBe(1);
  });

  it("checks the header and never imports the template's own example rows", () => {
    const template = parseCsv(bankTemplateCsv(), 10);
    if (!template.ok) throw new Error("template unparsable");
    const { report } = bankRowsToDrafts(template.rows, rowCtx(["JEE_MAIN", "NEET"]));
    expect(report.valid).toBe(0);
    expect(report.errors.filter((error) => error.code === "template_example_row")).toHaveLength(2);
    const bad = bankRowsToDrafts([["exams", "type", "stem_en", "colour"]], rowCtx(["JEE_MAIN"]));
    expect(bad.report.errors).toEqual([{ row: 1, column: "colour", code: "unknown_column" }]);
    const keyTemplate = parseCsv(keyTemplateCsv(), 10);
    expect(keyTemplate.ok && keyRowsFromTable(keyTemplate.rows).errors).toEqual([]);
  });
});

describe("answer keys", () => {
  const questions: ImportQuestionRef[] = [
    { id: "q1", importId: "p", sourceKey: "8401", subject: "physics", type: "single", qno: "1", questionRef: "8401", optionRefs: ["84011", "84012", "84013", "84014"], booklet: null, optionCount: 4, answer: null, keyStage: null, status: "draft" },
    { id: "q2", importId: "p", sourceKey: "physics:b:21", subject: "physics", type: "numerical", qno: "21", questionRef: null, optionRefs: [], booklet: null, optionCount: 0, answer: null, keyStage: null, status: "draft" },
    { id: "q3", importId: "p", sourceKey: "chemistry:a:1", subject: "chemistry", type: "single", qno: "1", questionRef: null, optionRefs: [], booklet: null, optionCount: 4, answer: null, keyStage: null, status: "draft" },
    { id: "q4", importId: "p", sourceKey: "chemistry:a:2", subject: "chemistry", type: "single", qno: "2", questionRef: null, optionRefs: [], booklet: null, optionCount: 4, answer: { kind: "single", index: 0 }, keyStage: "final", status: "draft" },
    { id: "q5", importId: "n", sourceKey: "botany:x:5", subject: "botany", type: "single", qno: "5", questionRef: null, optionRefs: [], booklet: "Q2", optionCount: 4, answer: null, keyStage: null, status: "draft" },
  ];
  const row = (overrides: Partial<KeyRow>): KeyRow => ({ qno: null, questionRef: null, subject: null, booklet: null, answer: "A", status: "normal", line: 1, ...overrides });

  it("matches by question ID, by subject + number (+ booklet), with ranges, drops, multiples and conflicts", () => {
    const { matches, summary } = matchKeyRows({
      keyImportId: "k",
      keyStage: "final",
      booklet: null,
      questions,
      rows: [
        row({ questionRef: "8401", answer: "84013", line: 1 }),
        row({ qno: "21", subject: "Physics", answer: "2.30-2.35", line: 2 }),
        row({ qno: "1", subject: "Chemistry", answer: "B", status: "multiple", line: 3 }),
        row({ qno: "1", subject: "Chemistry", answer: "D", status: "multiple", line: 4 }),
        row({ qno: "2", subject: "Chemistry", answer: "C", line: 5 }),
        row({ qno: "5", booklet: "Q2", answer: "", status: "dropped", line: 6 }),
        row({ qno: "5", booklet: "Q4", answer: "B", line: 7 }),
        row({ qno: "1", answer: "A", line: 8 }),
      ],
    });
    const byId = Object.fromEntries(matches.map((match) => [match.questionId, match]));
    expect(byId.q1).toMatchObject({ keyStatus: "matched", keyStage: "final", answer: { kind: "single", index: 2 } });
    expect(byId.q2).toMatchObject({ keyStatus: "matched", answer: { kind: "numerical", low: 2.3, high: 2.35, integer: false } });
    expect(byId.q3).toMatchObject({ keyStatus: "multiple_accepted", accepted: [1, 3] });
    expect(byId.q4).toMatchObject({ keyStatus: "conflict" });
    expect(byId.q5).toMatchObject({ keyStatus: "dropped", answer: null });
    expect(summary.unmatched).toEqual([
      { line: 7, qno: "5", reason: "qno_not_found" },
      { line: 8, qno: "1", reason: "qno_ambiguous" },
    ]);
  });

  it("keeps provisional and final apart: a provisional key never overrides a final one", () => {
    const provisional = matchKeyRows({ keyImportId: "k1", keyStage: "provisional", booklet: null, questions, rows: [row({ qno: "2", subject: "chemistry", answer: "B" })] });
    expect(provisional.matches).toEqual([]);
    const fresh = matchKeyRows({ keyImportId: "k2", keyStage: "provisional", booklet: null, questions, rows: [row({ questionRef: "8401", answer: "84011" })] });
    expect(fresh.matches[0]).toMatchObject({ keyStage: "provisional", keyStatus: "matched" });
  });

  it("flags two different answers for one question inside the same key", () => {
    const { matches } = matchKeyRows({
      keyImportId: "k",
      keyStage: "final",
      booklet: null,
      questions,
      rows: [row({ questionRef: "8401", answer: "84011", line: 1 }), row({ questionRef: "8401", answer: "84012", line: 2 })],
    });
    expect(matches).toEqual([expect.objectContaining({ questionId: "q1", keyStatus: "conflict" })]);
  });

  it("never falls back to the question number when a row's question ID is not in a paper that has IDs", () => {
    // A key for another JEE Main shift: same numbers 1–90, different NTA question IDs.
    const { matches, summary } = matchKeyRows({
      keyImportId: "k",
      keyStage: "final",
      booklet: null,
      questions,
      rows: [row({ questionRef: "9999", qno: "1", subject: "Physics", answer: "C", line: 1 })],
    });
    expect(matches).toEqual([]);
    expect(summary.unmatched).toEqual([{ line: 1, qno: "1", reason: "question_id_not_found" }]);
    // Without IDs on the paper, the number is still used.
    const noIds = questions.filter((question) => question.questionRef === null);
    expect(matchKeyRows({ keyImportId: "k", keyStage: "final", booklet: null, questions: noIds, rows: [row({ questionRef: "9999", qno: "21", answer: "2.3" })] }).matches).toHaveLength(1);
    // A known ID in another booklet is not matched by number either.
    const booklets: ImportQuestionRef[] = [{ ...questions[0], booklet: "Q1" }];
    expect(matchKeyRows({ keyImportId: "k", keyStage: "final", booklet: "Q2", questions: booklets, rows: [row({ questionRef: "8401", qno: "1", answer: "84011" })] }).summary.unmatched).toEqual([
      { line: 1, qno: "1", reason: "booklet_mismatch" },
    ]);
  });

  it("passes an Aspire key's own stage through, never an official one", () => {
    const { matches } = matchKeyRows({ keyImportId: "k", keyStage: "aspire", booklet: null, questions, rows: [row({ qno: "21", subject: "Physics", answer: "5" })] });
    expect(matches).toEqual([expect.objectContaining({ questionId: "q2", keyStage: "aspire", keyStatus: "matched" })]);
  });
});

describe("normalisation (honesty rules)", () => {
  it("takes source fields only from the job metadata and flags a disagreeing header", () => {
    const output = {
      header: { exam: "JEE (Main)", year: "2024", date: "22/01/2025", session: null, shift: "Shift 2", paper: null, booklet: null },
      questions: [question({ questionRef: "9001" })],
      keyRows: [],
      pageMarks: [],
      instructions: [],
      skippedOutside: 0,
      invalid: [],
    };
    const [draft] = normalizeOutput(output, ctx()).drafts;
    expect(draft.source).toMatchObject({ kind: "official", exam: "JEE_MAIN", year: 2025, date: "2025-01-22", shift: "Shift 1", qno: "1", questionRef: "9001", importId: "imp_aaaaaaaaaaaaaaaa" });
    expect(draft.flags).toContain("source_mismatch");
    expect(draft.notes?.join(" ")).toContain("year, shift");
    expect(headerMismatches({ exam: "JEE Main", year: "2025", date: "22 Jan 2025", session: null, shift: "1st shift", paper: null, booklet: null }, OFFICIAL_META)).toEqual([]);
    expect(isoDateOf("January 22, 2025")).toBe("2025-01-22");
  });

  it("never takes an answer from an official paper's extraction and never keeps a claimed source there", () => {
    const [draft] = normalizeOutput(
      { header: null, questions: [question({ answer: "B", claimedSource: "[JEE Main 2019]" })], keyRows: [], pageMarks: [], instructions: [], skippedOutside: 0, invalid: [] },
      ctx(),
    ).drafts;
    expect(draft.content.answer).toBeNull();
    expect(draft.flags).toEqual(expect.arrayContaining(["answer_missing", "difficulty_missing", "hi_missing"]));
    expect(draft.source.claimedSource).toBeUndefined();
    expect(draft.chapterId).toBe("phy-kinematics");
    expect(draft.patternTag).toBe("JEE_MAIN-2025");
    expect(draft.originalMarking).toEqual({ correct: 4, wrong: -1 });
  });

  it("keeps a bank file's printed answer and label as unverified staff data", () => {
    const [draft] = normalizeOutput(
      { header: null, questions: [question({ answer: "B", claimedSource: "[JEE Main 2019]" })], keyRows: [], pageMarks: [], instructions: [], skippedOutside: 0, invalid: [] },
      ctx({ kind: "pdf_bank", meta: { sourceKind: "aspire", exam: "JEE_MAIN", language: "en" } }),
    ).drafts;
    expect(draft.content.answer).toEqual({ kind: "single", index: 1 });
    expect(draft.source).toMatchObject({ kind: "aspire", claimedSource: "[JEE Main 2019]" });
    expect(draft.source.year).toBeUndefined();
    expect(draft.sourceKey).toBe("physics:a:1:p1");
  });

  it("drops a suggested chapter that is not in the confirmed list or belongs to another subject", () => {
    const drafts = normalizeOutput(
      {
        header: null,
        questions: [question({ chapterId: "made-up" }), question({ qno: "2", chapterId: "che-mole" }), question({ qno: "3", subject: "Biology", chapterId: "bot-cell" })],
        keyRows: [],
        pageMarks: [],
        instructions: [],
        skippedOutside: 0,
        invalid: [],
      },
      ctx(),
    ).drafts;
    expect(drafts.map((draft) => draft.chapterId)).toEqual([null, null, "bot-cell"]);
    expect(drafts[0].flags).toContain("chapter_missing");
    expect(drafts[2].subject).toBe("botany");
  });

  it("flags figures, math errors, unsupported types and incomplete options", () => {
    const [figure, math, unsupported, short] = normalizeOutput(
      {
        header: null,
        questions: [
          question({ stem: "Look at [[figure:1]].", figures: [{ n: 1, page: 1, bbox: [0.1, 0.2, 0.5, 0.6], description: "a graph" }] }),
          question({ qno: "2", stem: "Evaluate \\(\\frac{1}{2\\)." }),
          question({ qno: "3", type: "unsupported" }),
          question({ qno: "4", options: ["only one"] }),
        ],
        keyRows: [],
        pageMarks: [],
        instructions: [],
        skippedOutside: 0,
        invalid: [],
      },
      ctx(),
    ).drafts;
    expect(figure.flags).toContain("figure_needed");
    expect(figure.figureHints?.[0]).toMatchObject({ page: 1, description: "a graph" });
    expect(math.flags).toContain("math_error");
    expect(unsupported.flags).toContain("unsupported_type");
    expect(short.flags).toContain("options_incomplete");
  });

  it("converts $…$ math and keeps official Hindi from a bilingual paper", () => {
    const [draft] = normalizeOutput(
      {
        header: null,
        questions: [question({ stem: "Speed is $v = d/t$.", stemHi: "चाल $v = d/t$ है।", optionsHi: ["२", "४", "६", "३६"] })],
        keyRows: [],
        pageMarks: [],
        instructions: [],
        skippedOutside: 0,
        invalid: [],
      },
      ctx({ meta: { ...OFFICIAL_META, language: "bilingual" } }),
    ).drafts;
    expect(draft.content.stem.en).toBe("Speed is \\(v = d/t\\).");
    expect(draft.content.stem.hi).toBe("चाल \\(v = d/t\\) है।");
    expect(draft.content.hiSource).toBe("official");
    expect(draft.flags).not.toContain("hi_missing");

    // Hindi in Aspire's own bilingual file is staff Hindi, never official.
    const [bank] = normalizeOutput(
      { header: null, questions: [question({ stemHi: "चाल क्या है?", optionsHi: ["२", "४", "६", "३६"] })], keyRows: [], pageMarks: [], instructions: [], skippedOutside: 0, invalid: [] },
      ctx({ kind: "pdf_bank", meta: { sourceKind: "aspire", exam: "JEE_MAIN", language: "bilingual" } }),
    ).drafts;
    expect(bank.content.hiSource).toBe("staff");
  });

  it("drops a solution read from an official paper (they print none) and keeps one printed in Aspire's file", () => {
    const output = { header: null, questions: [question({ solution: "Speed is distance over time: 4 m/s." })], keyRows: [], pageMarks: [], instructions: [], skippedOutside: 0, invalid: [] };
    const [official] = normalizeOutput(output, ctx()).drafts;
    expect(official.content).toMatchObject({ solution: { en: "", hi: "" }, solutionSource: "none" });
    expect(official.notes?.join(" ")).toContain("solution");
    const [aspire] = normalizeOutput(output, ctx({ kind: "pdf_bank", meta: { sourceKind: "aspire", exam: "JEE_MAIN", language: "en" } })).drafts;
    expect(aspire.content).toMatchObject({ solution: { en: "Speed is distance over time: 4 m/s." }, solutionSource: "staff" });
  });

  it("marks coaching watermarks and URLs as third-party, but not official issuers", () => {
    expect(thirdPartyMarks([{ page: 1, kind: "url", text: "https://jeemain.nta.nic.in" }, { page: 1, kind: "watermark", text: "National Testing Agency" }], "official")).toEqual([]);
    expect(thirdPartyMarks([{ page: 2, kind: "watermark", text: "Brilliant Coaching Classes" }], "official")).toHaveLength(1);
    expect(thirdPartyMarks([{ page: 3, kind: "url", text: "www.some-coaching-site.example.com" }], "official")).toHaveLength(1);
    expect(thirdPartyMarks([{ page: 1, kind: "watermark", text: "Aspire IIT & Medical Academy" }], "aspire")).toEqual([]);
    // Coaching re-uploads usually name the exam next to the brand; an IIT-looking domain is not an IIT.
    for (const text of ["Vedantu JEE Main 2024", "MathonGo NEET (UG) 2023 Paper", "Career Point Kota - JEE Main Memory Based", "www.iitjeeacademy.ac.in"]) {
      expect(thirdPartyMarks([{ page: 1, kind: text.startsWith("www") ? "url" : "watermark", text }], "official"), text).toHaveLength(1);
    }
    expect(thirdPartyMarks([{ page: 1, kind: "watermark", text: "Physics Wallah" }], "aspire")).toHaveLength(1);
    // Official issuers and printed page furniture stay clean, including degree names with dots.
    const clean = ["JEE (Main) 2024 Session 1, Shift 2", "B.E./B.Tech Paper 1", "jeeadv.ac.in", "https://www.iitb.ac.in/", "राष्ट्रीय परीक्षा एजेंसी", "Page 3 of 24"];
    expect(thirdPartyMarks(clean.map((text) => ({ page: 1, kind: "other" as const, text })), "official")).toEqual([]);
    const [draft] = normalizeOutput(
      { header: null, questions: [question()], keyRows: [], pageMarks: [], instructions: [], skippedOutside: 0, invalid: [] },
      ctx({ thirdParty: true }),
    ).drafts;
    expect(draft.flags).toContain("third_party_source");
  });

  it("builds stable source keys: the question ID, else subject:section:qno (safe for per-subject restarts)", () => {
    expect(sourceKeyOf(question({ questionRef: "640653901" }), "pdf_paper")).toBe("640653901");
    const physics = sourceKeyOf(question({ subject: "Physics", qno: "Q.1" }), "pdf_paper");
    const chemistry = sourceKeyOf(question({ subject: "Chemistry", qno: "1" }), "pdf_paper");
    expect(physics).toBe("physics:a:1");
    expect(chemistry).toBe("chemistry:a:1");
    expect(sourceKeyOf(question({ subject: "Physics", qno: "1", startPage: 7 }), "pdf_paper")).toBe(physics);
  });
});

describe("loose parse of model output", () => {
  const raw = (page: number, qno: string, extra: Record<string, unknown> = {}) => ({
    startPage: page,
    qno,
    questionRef: null,
    optionRefs: [],
    subject: "Physics",
    section: "Section A",
    type: "single",
    format: "standard",
    stem: `Synthetic question ${qno}`,
    options: ["a", "b", "c", "d"],
    stemHi: null,
    optionsHi: [],
    answer: null,
    solution: null,
    unit: null,
    passageRef: null,
    passage: null,
    figures: [],
    chapterId: null,
    difficulty: null,
    difficultyReason: null,
    confidence: 0.9,
    claimedSource: null,
    issues: [],
    ...extra,
  });

  it("keeps the valid questions when one is broken, maps pages, and drops questions starting on the lookahead page", () => {
    const text = JSON.stringify({
      header: { exam: null, year: null, date: null, session: null, shift: null, paper: null, booklet: null },
      pageMarks: [{ page: 2, kind: "watermark", text: "Sample mark" }],
      instructions: [],
      questions: [raw(1, "7"), { qno: "8" }, raw(2, "9", { options: ["only"] }), raw(3, "10")],
    });
    // Attachment pages 1–2 are original pages 5–6; attachment page 3 is the lookahead page 7.
    const parsed = parsePaperOutput(text, 4, { from: 5, to: 6 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.output.questions.map((q) => [q.qno, q.startPage])).toEqual([
      ["7", 5],
      ["9", 6],
    ]);
    expect(parsed.output.questions[1].validation).toContain("options:incomplete");
    expect(parsed.output.invalid).toEqual([{ index: 1, reason: "stem_missing" }]);
    expect(parsed.output.skippedOutside).toBe(1);
    expect(parsed.output.pageMarks).toEqual([{ page: 6, kind: "watermark", text: "Sample mark" }]);
  });

  it("keeps both output schemas within the API's limit on union-typed parameters", () => {
    // Integration finding: the first real call was refused with 400 "too many parameters with union types (23 …)".
    const unions = (schema: unknown) => JSON.stringify(schema).match(/"anyOf"/g)?.length ?? 0;
    expect(unions(PAPER_OUTPUT_SCHEMA)).toBeLessThanOrEqual(STRUCTURED_OUTPUT_UNION_LIMIT - 2);
    expect(unions(KEY_OUTPUT_SCHEMA)).toBeLessThanOrEqual(STRUCTURED_OUTPUT_UNION_LIMIT - 2);
    expect(JSON.stringify(PAPER_OUTPUT_SCHEMA)).not.toMatch(/"type":\s*\[/);
  });

  it("reads an empty or literal-null printed header field as not printed", () => {
    const text = JSON.stringify({
      header: { exam: "JEE (Main) 2026", year: "", date: "null", session: "", shift: "", paper: "", booklet: "" },
      pageMarks: [],
      instructions: [{ page: 1, subject: "", section: "Section A", text: "Each question carries 4 marks." }],
      questions: [raw(1, "1")],
    });
    const parsed = parsePaperOutput(text, 0, null);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.output.header).toEqual({ exam: "JEE (Main) 2026", year: null, date: null, session: null, shift: null, paper: null, booklet: null });
    expect(parsed.output.instructions).toEqual([{ page: 1, subject: null, section: "Section A", text: "Each question carries 4 marks." }]);
  });

  it("reports text that is not JSON", () => {
    expect(parsePaperOutput("not json", 0, null)).toEqual({ ok: false, reason: "output_not_json" });
    expect(parseKeyOutput(JSON.stringify({ header: null, pageMarks: [], rows: [{ qno: "1", answer: "B", status: "normal" }, { answer: "C" }] }), 0)).toMatchObject({
      ok: true,
      output: { keyRows: [{ qno: "1", answer: "B" }], invalid: [{ index: 1, reason: "qno_missing" }] },
    });
  });
});

describe("Hindi pairing", () => {
  const targets: ImportQuestionRef[] = [
    { id: "e1", importId: "en", sourceKey: "8801", subject: "physics", type: "single", qno: "1", questionRef: "8801", optionRefs: [], booklet: null, optionCount: 4, answer: null, keyStage: null, status: "draft" },
    { id: "e2", importId: "en", sourceKey: "chemistry:a:2", subject: "chemistry", type: "single", qno: "2", questionRef: null, optionRefs: [], booklet: null, optionCount: 4, answer: null, keyStage: null, status: "draft" },
    { id: "e3", importId: "en", sourceKey: "chemistry:b:3", subject: "chemistry", type: "numerical", qno: "3", questionRef: null, optionRefs: [], booklet: null, optionCount: 0, answer: null, keyStage: null, status: "draft" },
  ];

  it("pairs by question ID, then source key, and refuses a different option count", () => {
    const { pairs, summary } = pairHindi({
      hindiImportId: "hi",
      targets,
      normaliseDollarMath,
      questions: [
        question({ questionRef: "8801", stem: "एक गाड़ी 3 s में 12 m चलती है।", options: ["२", "४", "६", "३६"] }),
        question({ qno: "2", subject: "Chemistry", stem: "रसायन प्रश्न $x$", options: ["क", "ख", "ग", "घ"] }),
        question({ qno: "3", subject: "Chemistry", section: "Section B", type: "numerical", stem: "संख्यात्मक प्रश्न", options: [] }),
        question({ qno: "9", subject: "Chemistry", options: ["क", "ख"] }),
      ],
    });
    expect(pairs.map((pair) => pair.questionId)).toEqual(["e1", "e2", "e3"]);
    expect(pairs[1]).toMatchObject({ stemHi: "रसायन प्रश्न \\(x\\)", optionsHi: ["क", "ख", "ग", "घ"], hiSource: "official" });
    // Official papers print no solutions: nothing the reader wrote becomes an official Hindi solution.
    expect(pairs.every((pair) => pair.solutionHi === null)).toBe(true);
    expect(summary.unmatched).toEqual([{ line: 4, qno: "9", reason: "no_english_question" }]);
  });
});

describe("pdf", () => {
  async function syntheticPdf(pages: number): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let page = 1; page <= pages; page += 1) {
      doc.addPage([300, 400]).drawText(`Synthetic page ${page}: Q${page * 2 - 1} and Q${page * 2}`, { x: 20, y: 360, size: 10, font });
    }
    return doc.save({ useObjectStreams: false });
  }

  it("plans own pages plus one lookahead page and slices them with copyPages", async () => {
    const bytes = await syntheticPdf(13);
    expect(isPdf(bytes)).toBe(true);
    expect(await inspectPdf(bytes)).toEqual({ ok: true, pages: 13, encrypted: false });
    const plans = planPageItems(13, 6);
    expect(plans).toEqual([
      { pageFrom: 1, pageTo: 6, lookahead: 7 },
      { pageFrom: 7, pageTo: 12, lookahead: 13 },
      { pageFrom: 13, pageTo: 13, lookahead: null },
    ]);
    const slicer = await PdfSlicer.open(bytes);
    const slice = await slicer.slice(requestPages(plans[1]));
    expect((await PDFDocument.load(slice)).getPageCount()).toBe(7);
    expect(halvePages(7, 12, 13)).toEqual([
      { pageFrom: 7, pageTo: 9, lookahead: 10 },
      { pageFrom: 10, pageTo: 12, lookahead: 13 },
    ]);
  });

  it("detects an encrypted PDF without failing to count its pages", async () => {
    const plain = Buffer.from(await syntheticPdf(2)).toString("latin1");
    const encrypted = Buffer.from(plain.replace(/trailer\s*<</, "trailer\n<<\n/Encrypt << /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>"), "latin1");
    expect(await inspectPdf(encrypted)).toEqual({ ok: true, pages: 2, encrypted: true });
    expect(isPdf(Buffer.from("PK\u0003\u0004"))).toBe(false);
  });
});

describe("estimate and configuration", () => {
  it("sizes requests from the output budget and halves the price in batch mode", () => {
    expect(pagesPerItem(64_000, questionsPerPage("JEE_MAIN"))).toBe(6);
    const base = {
      kind: "pdf_paper" as const,
      exam: "JEE_MAIN" as const,
      pages: 30,
      rows: null,
      model: "claude-opus-5-5",
      price: IMPORT_MODEL_PRICES["claude-opus-5-5"],
      maxTokens: 64_000,
      dailyCapUsd: 10,
      spentTodayUsd: 0,
    };
    const sync = estimateImport({ ...base, mode: "sync" });
    const batch = estimateImport({ ...base, mode: "batch" });
    expect(sync.batches).toBe(5);
    expect(sync.usd[0]).toBeGreaterThan(0.8);
    expect(sync.usd[1]).toBeLessThan(2.6);
    expect(batch.usd[0]).toBeCloseTo(sync.usd[0] / 2, 1);
    expect(estimateImport({ ...base, kind: "csv_bank", pages: null, rows: 40, mode: "sync" })).toMatchObject({ aiRequired: false, mode: "none", usd: [0, 0] });
    expect(usageUsd({ inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, IMPORT_MODEL_PRICES["claude-opus-5-5"], true)).toBe(2);
    expect(istDayStart(Date.UTC(2026, 9, 21, 19, 0))).toBe(Date.UTC(2026, 9, 21, 18, 30));

    // An encrypted PDF goes whole with every request: the upper bound prices every copy as input.
    const encrypted = estimateImport({ ...base, mode: "sync", encrypted: true });
    expect(encrypted.batches).toBe(5);
    // Per request: the whole file, the instructions (500) and the output schema (2,300).
    expect(encrypted.inputTokens[1]).toBe(5 * (30 * 3000 + 500 + 2300));
    expect(encrypted.usd[1]).toBeGreaterThan(sync.usd[1] + 1);
    expect(encrypted.usd[0]).toBeLessThan(encrypted.usd[1]);
  });

  it("lets the env kill switch override the admin setting, and caps uploads at 9 MB", () => {
    expect(aiAvailability({ envEnabled: false, apiKey: "k" }, true)).toEqual({ enabled: false, reason: "env_off" });
    expect(aiAvailability({ envEnabled: true, apiKey: "k" }, false)).toEqual({ enabled: false, reason: "setting_off" });
    expect(aiAvailability({ envEnabled: true, apiKey: null }, true)).toEqual({ enabled: false, reason: "no_api_key" });
    expect(aiAvailability({ envEnabled: true, apiKey: "k" }, true)).toEqual({ enabled: true, reason: null });
    const config = getImportConfig({ QB_IMPORT_ENABLED: "0", QB_IMPORT_MAX_FILE_MB: "50", QB_IMPORT_EFFORT: "low", NODE_ENV: "test" }, "C:/tmp");
    expect(config.envEnabled).toBe(false);
    expect(config.maxFileBytes).toBe(9 * 1024 * 1024);
    expect(config.effort).toBe("low");
    expect(getImportConfig({ NODE_ENV: "test" }, "C:/tmp").envEnabled).toBe(true);
  });
});
