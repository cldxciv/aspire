import type {
  Bilingual,
  QbExam,
  QbFlag,
  QbFormat,
  QbImportKind,
  QbImportMeta,
  QbMarking,
  QbQuestionContent,
  QbQuestionType,
  QbSource,
  QbSubject,
} from "@/lib/qb/types";

import { examFromLabel, normaliseQno, parseAnswer, sectionSlug, subjectFromLabel } from "./parse";
import type { ExtractedQuestion, ImportChapter, ImportDraft, ItemOutput, PageMark, PatternSnapshot, PrintedHeader } from "./types";

/**
 * Extracted questions → drafts (docs/question-bank-plan.md §B2, §B8.6). Pure: every external
 * helper (math check, `$` normalisation, pattern history) comes in through the context.
 *
 * Honesty rules applied here:
 * - Source fields come ONLY from the job metadata (staff-entered) plus the printed question number,
 *   page and IDs. The model's reading of the paper header is compared with the metadata; any
 *   disagreement sets the blocking flag `source_mismatch`. Nothing is ever attributed from the
 *   model's guess.
 * - Official papers never take an answer from the extraction (keys come from the key import), so
 *   every official draft starts with `answer_missing`.
 * - A label such as "[JEE Main 2023]" in an Aspire file is kept only as `claimedSource` (staff-only,
 *   unverified, never public).
 * - Watermarks / publisher names / URLs that are not an official issuer set `third_party_source`.
 * - Official NTA / IIT papers print no solutions and only official papers carry official Hindi: a
 *   solution the reader returned for an official paper is dropped (with a reviewer note), and Hindi
 *   from Aspire's own files is labelled staff Hindi, never official.
 */

export interface TextTools {
  /** Paired `$…$` / `$$…$$` → `\(…\)` / `\[…\]`, keeping `\$` (QB-CORE-A rich-text). */
  normaliseDollarMath: (text: string) => string;
  /** KaTeX (with mhchem, strict "ignore") problems in a text; empty when it renders (QB-CORE-A math-check). */
  mathIssues: (text: string) => string[];
}

export interface PatternTools {
  /** e.g. "JEE_MAIN:2024" from PATTERN_HISTORY (QB-CORE-A patterns.ts); null when unknown. */
  patternTag: (exam: QbExam, year: number) => string | null;
  /** The marking printed for that year's section type, when PATTERN_HISTORY knows it. */
  originalMarking: (exam: QbExam, year: number, type: QbQuestionType) => QbMarking | null;
}

export interface NormalizeContext {
  importId: string;
  kind: QbImportKind;
  meta: QbImportMeta;
  /** The exam's confirmed chapter list (the only chapters the model may suggest). */
  chapters: readonly ImportChapter[];
  /** Job-level: a non-official mark was seen on the file. */
  thirdParty: boolean;
  snapshot: PatternSnapshot | null;
  text: TextTools;
  patterns: PatternTools;
}

export const LOW_CONFIDENCE = 0.7;

// ---------------------------------------------------------------------------------------------
// Page marks

/** IIT domains, listed one by one: a pattern such as `iit*.ac.in` also accepts `iitjeeacademy.ac.in`. */
const IIT_DOMAINS = [
  "iitb", "iitd", "iitk", "iitm", "iitkgp", "iitr", "iitg", "iith", "iitbhu", "iitism", "iiti", "iitp",
  "iitj", "iitrpr", "iitbbs", "iitgn", "iitmandi", "iittp", "iitpkd", "iitdh", "iitjammu", "iitbhilai", "iitgoa",
];
const OFFICIAL_HOSTS = [
  /(^|\.)nta\.ac\.in$/,
  /(^|\.)nic\.in$/,
  /(^|\.)jeeadv\.ac\.in$/,
  new RegExp(`(^|\\.)(${IIT_DOMAINS.join("|")})\\.ac\\.in$`),
  /(^|\.)nmc\.org\.in$/,
  /(^|\.)gov\.in$/,
];
const COMMERCIAL_TEXT = /coaching|classes|academy|tutorial|publication|publisher|institute(?!\s+of\s+technology)|\bpvt\b|\bltd\b|private limited|telegram|youtube|whatsapp|instagram|\bapp\b|download|memory[\s-]*based/i;

/**
 * Every word an official mark may contain: the issuers' names (NTA, IITs, NMC, the ministry), the
 * exams' names, and printed page furniture (shift, booklet, page, subjects, months, roll-number
 * boxes). A mark is official only when NOTHING else is left: "Vedantu JEE Main 2024" or
 * "Career Point Kota - JEE Main" keep a brand word and are third-party.
 */
const OFFICIAL_WORDS = new Set(
  [
    // Issuers and exams
    "national", "testing", "agency", "nta", "joint", "entrance", "examination", "examinations", "exam", "exams", "jee", "main",
    "mains", "advanced", "neet", "eligibility", "cum", "test", "tests", "indian", "institute", "institutes", "technology", "iit",
    "iits", "bombay", "delhi", "madras", "kanpur", "kharagpur", "roorkee", "guwahati", "hyderabad", "bhu", "varanasi", "dhanbad",
    "medical", "commission", "nmc", "ministry", "education", "government", "india", "department", "higher", "undergraduate",
    "admission", "admissions", "organising", "organizing", "conducted", "official", "computer", "based", "cbt", "tech", "arch",
    "planning", "copyright", "all", "rights", "reserved",
    // Page furniture
    "session", "shift", "paper", "papers", "page", "pages", "date", "year", "booklet", "code", "set", "question", "questions",
    "series", "version", "part", "section", "physics", "chemistry", "mathematics", "maths", "biology", "botany", "zoology",
    "english", "hindi", "medium", "morning", "forenoon", "afternoon", "evening", "first", "second", "third", "one", "two", "three",
    "day", "slot", "time", "hours", "hrs", "minutes", "mins", "marks", "maximum", "max", "total", "roll", "number", "candidate",
    "candidates", "participant", "application", "subject", "name", "signature", "centre", "center", "invigilator", "answer",
    "answers", "key", "keys", "provisional", "final", "response", "sheet", "space", "rough", "work", "the", "and", "for", "with",
    "not", "this", "here", "use", "only", "instructions", "read", "carefully", "important",
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
    // Hindi forms of the same
    "राष्ट्रीय", "परीक्षा", "एजेंसी", "संयुक्त", "प्रवेश", "पात्रता", "भारतीय", "प्रौद्योगिकी", "संस्थान", "मुख्य", "उन्नत", "पाली",
    "सत्र", "प्रश्न", "पुस्तिका", "पृष्ठ", "भौतिकी", "रसायन", "विज्ञान", "गणित", "जीव", "वनस्पति", "प्राणी", "शिक्षा", "मंत्रालय",
    "भारत", "सरकार", "हिंदी", "हिन्दी", "अंग्रेज़ी", "अंग्रेजी", "समय", "घंटे", "अंक", "अधिकतम", "कुल", "नाम", "अनुक्रमांक",
    "हस्ताक्षर", "उत्तर", "कुंजी", "अनंतिम", "अंतिम", "खंड", "भाग", "कोड", "पेपर", "आयोग", "चिकित्सा", "आयुर्विज्ञान",
  ].map((word) => word.normalize("NFC")),
);

/** True when every word of 3 or more letters in `text` is an official name or page furniture. */
function onlyOfficialWords(text: string): boolean {
  const words = text.normalize("NFC").toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
  return words.every((word) => (word.match(/\p{L}/gu) ?? []).length < 3 || OFFICIAL_WORDS.has(word));
}

const URL_LIKE = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#][^\s]*)?/gi;
const COMMON_TLD = /\.(com|in|org|net|edu|gov|co|io|info|app|xyz|me|online|live|site|tech|academy|education|biz|ai|us|uk|tv|ly|courses|study|school|guru)$/i;

/**
 * A web address, not text that merely has dots ("B.Tech", "B.E./B.Arch" are degree names printed on
 * official papers): a scheme, a `www.` start, or a common top-level domain after a label of 2+ characters.
 */
function looksLikeUrl(raw: string): boolean {
  if (/^https?:\/\//i.test(raw) || /^www\./i.test(raw)) return true;
  const labels = raw.split(/[/:?#]/)[0].split(".");
  return COMMON_TLD.test(labels.join(".")) && (labels.at(-2)?.length ?? 0) >= 2;
}

function hostOf(raw: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Page marks that are not from an official issuer (nta.ac.in, *.nic.in, jeeadv.ac.in, a listed
 * IIT domain; text made only of NTA / IIT / exam names and page furniture). For Aspire's own files
 * the Aspire name is allowed too. Any other watermark, publisher, institute, brand or URL makes the
 * file third-party, even when it also names the exam.
 */
export function thirdPartyMarks(marks: readonly PageMark[], sourceKind: "official" | "aspire"): PageMark[] {
  return marks.filter((mark) => {
    const text = mark.text.trim();
    if (!text) return false;
    const urls = (text.match(URL_LIKE) ?? []).filter(looksLikeUrl);
    // Aspire's own name (and only Aspire URLs) on Aspire's own files.
    if (sourceKind === "aspire" && /aspire/i.test(text) && urls.every((url) => /aspire/i.test(url))) return false;
    if (urls.length > 0) {
      const thirdPartyUrl = urls.some((url) => {
        const host = hostOf(url);
        if (!host) return true;
        if (sourceKind === "aspire" && /aspire/.test(host)) return false;
        return !OFFICIAL_HOSTS.some((pattern) => pattern.test(host));
      });
      if (thirdPartyUrl) return true;
    }
    const words = urls.reduce((rest, url) => rest.replace(url, " "), text);
    if (mark.kind === "other" && words.trim().length < 3) return false;
    // Page numbers, roll-number boxes and similar printed furniture are not marks of a publisher.
    if (/^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(words.trim())) return false;
    // A coaching or publisher name is third-party even when it also mentions JEE / IIT.
    if (COMMERCIAL_TEXT.test(words)) return true;
    return !onlyOfficialWords(words);
  });
}

// ---------------------------------------------------------------------------------------------
// Header vs metadata

function yearIn(text: string | null): number | null {
  const match = text ? /\b(20\d{2})\b/.exec(text) : null;
  return match ? Number(match[1]) : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** `27/01/2024`, `27-01-2024`, `2024-01-27`, `27 Jan 2024`, `January 27, 2024` → `2024-01-27`. */
export function isoDateOf(text: string | null): string | null {
  if (!text) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
  let match = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (match) return valid(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/.exec(text);
  if (match) return valid(Number(match[3]), Number(match[2]), Number(match[1]));
  match = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(20\d{2})\b/i.exec(text);
  if (match && MONTHS.includes(match[2].slice(0, 3).toLowerCase())) {
    return valid(Number(match[3]), MONTHS.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, Number(match[1]));
  }
  match = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i.exec(text);
  if (match && MONTHS.includes(match[1].slice(0, 3).toLowerCase())) {
    return valid(Number(match[3]), MONTHS.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]));
  }
  return null;
}

function digitsOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const words: Record<string, string> = { first: "1", second: "2", third: "3", one: "1", two: "2", three: "3", i: "1", ii: "2", iii: "3" };
  const match = /\d+/.exec(text);
  if (match) return String(Number(match[0]));
  const word = text.toLowerCase().match(/\b(first|second|third|one|two|three|iii|ii|i)\b/);
  return word ? words[word[1]] : null;
}

/** The metadata fields the printed header contradicts (empty when it agrees or says nothing). */
export function headerMismatches(header: PrintedHeader | null, meta: QbImportMeta): string[] {
  if (!header) return [];
  const mismatches: string[] = [];
  const exam = examFromLabel(header.exam);
  if (exam && meta.exam && exam !== meta.exam) mismatches.push("exam");
  const year = yearIn(header.year) ?? yearIn(header.date) ?? yearIn(header.exam);
  if (year !== null && meta.year !== undefined && year !== meta.year) mismatches.push("year");
  const date = isoDateOf(header.date);
  if (date && meta.date && date !== meta.date) mismatches.push("date");
  const shift = digitsOf(header.shift);
  const metaShift = digitsOf(meta.shift);
  if (shift && metaShift && shift !== metaShift) mismatches.push("shift");
  const paper = digitsOf(header.paper);
  const metaPaper = digitsOf(meta.paper);
  if (paper && metaPaper && paper !== metaPaper) mismatches.push("paper");
  const booklet = header.booklet?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const metaBooklet = meta.booklet?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (booklet && metaBooklet && booklet !== metaBooklet) mismatches.push("booklet");
  return mismatches;
}

// ---------------------------------------------------------------------------------------------
// Source key

function safeRef(ref: string): string | null {
  const cleaned = ref.replace(/[^A-Za-z0-9_-]/g, "");
  return cleaned ? cleaned.slice(0, 40) : null;
}

/**
 * `UNIQUE(import_id, source_key)`: the printed question ID when there is one, else
 * `subject:section:qno` (safe where numbering restarts per subject). Bank files add the start page,
 * because their numbering often restarts per chapter. Stable across re-runs, so upserts are idempotent.
 */
export function sourceKeyOf(question: Pick<ExtractedQuestion, "questionRef" | "subject" | "section" | "qno" | "startPage">, kind: QbImportKind): string {
  const ref = question.questionRef ? safeRef(question.questionRef) : null;
  if (ref) return ref;
  const subject = subjectFromLabel(question.subject) ?? "x";
  const section = sectionSlug(question.section) ?? "x";
  const qno = normaliseQno(question.qno) ?? "x";
  const base = `${subject}:${section}:${qno}`;
  return kind === "pdf_bank" || kind === "docx_bank" ? `${base}:p${question.startPage}` : base;
}

// ---------------------------------------------------------------------------------------------
// Question → draft

const TYPES: readonly string[] = ["single", "multiple", "numerical"];
const FORMATS: readonly string[] = ["standard", "assertion_reason", "statements", "match_list", "passage"];
const FIGURE_MARKER = /\[\[figure:\d+\]\]/;

function bilingual(en: string | null, hi: string | null): Bilingual {
  return { en: en ?? "", hi: hi ?? "" };
}

function chapterFor(question: ExtractedQuestion, subject: QbSubject | null, chapters: readonly ImportChapter[]): ImportChapter | null {
  if (!question.chapterId) return null;
  const chapter = chapters.find((candidate) => candidate.id === question.chapterId);
  if (!chapter) return null;
  if (subject === null || subject === chapter.subject) return chapter;
  // A NEET "Biology" heading holds botany and zoology chapters.
  if (subject === "biology" && (chapter.subject === "botany" || chapter.subject === "zoology")) return chapter;
  return null;
}

export function normalizeQuestion(question: ExtractedQuestion, ctx: NormalizeContext, mismatches: readonly string[]): ImportDraft {
  const { meta } = ctx;
  const flags = new Set<QbFlag>();
  const notes: string[] = [];
  const norm = (text: string | null) => (text === null ? null : ctx.text.normaliseDollarMath(text));

  const printedSubject = subjectFromLabel(question.subject);
  const chapter = chapterFor(question, printedSubject, ctx.chapters);
  const subject: QbSubject | null = chapter?.subject ?? printedSubject;

  const supported = TYPES.includes(question.type);
  const type: QbQuestionType = supported ? (question.type as QbQuestionType) : "single";
  if (!supported) flags.add("unsupported_type");
  const format: QbFormat = FORMATS.includes(question.format) ? (question.format as QbFormat) : "standard";

  const bilingualPaper = meta.language === "bilingual";
  const official = meta.sourceKind === "official";
  const stem = bilingual(norm(question.stem), bilingualPaper ? norm(question.stemHi) : null);
  const options: Bilingual[] =
    type === "numerical" ? [] : question.options.map((option, index) => bilingual(norm(option), bilingualPaper ? norm(question.optionsHi[index] ?? null) : null));
  const hiComplete = bilingualPaper && stem.hi.trim() !== "" && options.every((option) => option.hi.trim() !== "");
  // Hindi printed in an official bilingual booklet is official; Hindi in Aspire's files is staff Hindi.
  const hiSource: QbQuestionContent["hiSource"] = hiComplete ? (official ? "official" : "staff") : "none";
  if (!hiComplete) flags.add("hi_missing");

  // Answers: official papers never take one from the extraction; bank files may print their own key.
  let answer: QbQuestionContent["answer"] = null;
  if (meta.sourceKind === "aspire" && question.answer && supported) {
    const parsed = parseAnswer(question.answer, { type, optionCount: options.length, optionRefs: question.optionRefs });
    if (parsed.ok) {
      answer = parsed.answer;
      if (answer.kind === "numerical" && question.unit) answer = { ...answer, unit: { en: question.unit, hi: "" } };
    } else {
      notes.push(`printed answer not understood (${parsed.reason})`);
      flags.add("low_confidence");
    }
  }
  if (answer === null) flags.add("answer_missing");

  // NTA / IIT question papers print no solutions, so "solution" text on an official paper can only be
  // the reader's own writing: it is dropped, never stored as an official solution.
  const readSolution = norm(question.solution);
  const solutionText = official ? null : readSolution;
  if (official && readSolution) notes.push("the reader returned a solution for an official paper; it was dropped (official papers print none)");
  const solution = bilingual(solutionText, null);
  const solutionSource: QbQuestionContent["solutionSource"] = solutionText ? "staff" : "none";

  if (type !== "numerical" && (options.length < 2 || options.some((option) => !option.en.trim()))) flags.add("options_incomplete");
  if (meta.sourceKind === "official" && type !== "numerical" && supported && options.length !== 4) flags.add("options_incomplete");
  if (question.validation.includes("options:incomplete")) flags.add("options_incomplete");

  const texts = [stem.en, stem.hi, solution.en, ...options.flatMap((option) => [option.en, option.hi])];
  if (question.figures.length > 0 || texts.some((text) => FIGURE_MARKER.test(text))) flags.add("figure_needed");
  const passageText = norm(question.passage);
  if (passageText) texts.push(passageText);
  if (texts.some((text) => text && ctx.text.mathIssues(text).length > 0)) flags.add("math_error");

  if (!chapter) flags.add("chapter_missing");
  if (question.chapterId && !chapter) notes.push("suggested chapter not in the confirmed list");
  // Per-exam difficulty is always set by staff (or accepted from the AI suggestion) later.
  flags.add("difficulty_missing");

  if (question.confidence < LOW_CONFIDENCE || question.validation.length > 0 || question.issues.length > 0) flags.add("low_confidence");
  for (const issue of question.validation) notes.push(`validation: ${issue}`);
  for (const issue of question.issues) notes.push(`reader: ${issue}`);
  if (mismatches.length > 0) {
    flags.add("source_mismatch");
    notes.push(`printed header disagrees with the job details: ${mismatches.join(", ")}`);
  }
  if (ctx.thirdParty) flags.add("third_party_source");

  const source: QbSource = { kind: meta.sourceKind, importId: ctx.importId, page: question.startPage, qno: question.qno.trim() };
  if (meta.exam) source.exam = meta.exam;
  if (meta.year !== undefined) source.year = meta.year;
  if (meta.date) source.date = meta.date;
  if (meta.session) source.session = meta.session;
  if (meta.shift) source.shift = meta.shift;
  if (meta.paper) source.paper = meta.paper;
  if (meta.booklet) source.booklet = meta.booklet;
  if (question.questionRef) source.questionRef = question.questionRef;
  if (question.optionRefs.length > 0) source.optionRefs = [...question.optionRefs];
  if (meta.aspireRef) source.aspireRef = meta.aspireRef;
  if (meta.sourceKind === "aspire" && question.claimedSource) source.claimedSource = question.claimedSource;

  const exam = meta.exam;
  const year = meta.year;
  const patternTag = exam && year !== undefined ? ctx.patterns.patternTag(exam, year) ?? `${exam}:${year}` : null;
  // The marking printed for that year where PATTERN_HISTORY knows it (staff check the job's
  // pattern snapshot against it; mocks always use the current marking).
  const originalMarking = exam && year !== undefined && meta.sourceKind === "official" ? ctx.patterns.originalMarking(exam, year, type) : null;

  const content: QbQuestionContent = {
    type,
    format: passageText ? "passage" : format,
    passageId: null,
    passageOrder: null,
    stem,
    options,
    answer,
    solution,
    solutionSource,
    hiSource,
    figures: [],
    topics: [],
  };

  const draft: ImportDraft = {
    sourceKey: sourceKeyOf(question, ctx.kind),
    content,
    subject,
    chapterId: chapter?.id ?? null,
    source,
    aiDifficulty: question.difficulty === "easy" || question.difficulty === "medium" || question.difficulty === "hard" ? question.difficulty : null,
    aiReason: question.difficultyReason,
    confidence: question.confidence,
    flags: [...flags],
    patternTag,
    originalMarking,
    figureHints: question.figures,
    passage: passageText ? { ref: question.passageRef ?? `p${question.startPage}`, text: bilingual(passageText, null) } : null,
  };
  if (exam) draft.exams = [{ exam, suggestedDifficulty: null }];
  if (notes.length > 0) draft.notes = notes.slice(0, 20);
  return draft;
}

/**
 * All drafts of one item output. Duplicate source keys inside one output (the model repeated a
 * question) keep the first and report the rest.
 */
export function normalizeOutput(output: ItemOutput, ctx: NormalizeContext): { drafts: ImportDraft[]; duplicates: string[] } {
  const mismatches = headerMismatches(output.header, ctx.meta);
  const seen = new Set<string>();
  const drafts: ImportDraft[] = [];
  const duplicates: string[] = [];
  for (const question of output.questions) {
    const draft = normalizeQuestion(question, ctx, mismatches);
    if (seen.has(draft.sourceKey)) {
      duplicates.push(draft.sourceKey);
      continue;
    }
    seen.add(draft.sourceKey);
    drafts.push(draft);
  }
  return { drafts, duplicates };
}
