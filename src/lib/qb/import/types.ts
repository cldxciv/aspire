/**
 * QB-IMPORT internal types (client-safe: types and constants only, no I/O).
 *
 * Shared QB contracts (exam, subject, flags, drafts, import meta / estimate) live in
 * `@/lib/qb/types` (QB-CORE-A) and are imported type-only here, so this package loads even before
 * that file exists at runtime. The few runtime lists this package needs are repeated below with a
 * `satisfies` check against the shared types, so `tsc` catches any drift.
 */
import type {
  Bilingual,
  QbAnswer,
  QbCapability,
  QbDifficulty,
  QbDraftInput,
  QbExam,
  QbImportEstimate,
  QbImportKind,
  QbImportMeta,
  QbImportStatus,
  QbRole,
  QbSubject,
} from "@/lib/qb/types";

export type { QbImportEstimate, QbImportKind, QbImportMeta, QbImportStatus };

export const IMPORT_EXAMS = ["JEE_MAIN", "NEET", "JEE_ADV", "BOH"] as const satisfies readonly QbExam[];
export const IMPORT_SUBJECTS = [
  "physics",
  "chemistry",
  "maths",
  "botany",
  "zoology",
  "biology",
  "mental_ability",
] as const satisfies readonly QbSubject[];
export const IMPORT_KINDS = [
  "pdf_paper",
  "pdf_key",
  "pdf_bank",
  "docx_bank",
  "xlsx_bank",
  "csv_bank",
  "csv_key",
] as const satisfies readonly QbImportKind[];
export const IMPORT_STATUSES = [
  "uploaded",
  "ready",
  "running",
  "waiting_batch",
  "paused",
  "done",
  "failed",
  "cancelled",
  "closed",
] as const satisfies readonly QbImportStatus[];

/** Kinds read by Claude (cost money, need `import_ai` to run). */
export const AI_KINDS: readonly QbImportKind[] = ["pdf_paper", "pdf_key", "pdf_bank", "docx_bank"];
/** Kinds parsed without AI (`import_tabular`). */
export const TABULAR_KINDS: readonly QbImportKind[] = ["xlsx_bank", "csv_bank", "csv_key"];
/** Kinds whose result is an answer key, not drafts. */
export const KEY_KINDS: readonly QbImportKind[] = ["pdf_key", "csv_key"];

export function isAiKind(kind: QbImportKind): boolean {
  return AI_KINDS.includes(kind);
}

export function isTabularKind(kind: QbImportKind): boolean {
  return TABULAR_KINDS.includes(kind);
}

export function isKeyKind(kind: QbImportKind): boolean {
  return KEY_KINDS.includes(kind);
}

export type ImportMode = "sync" | "batch" | "none";
export type ImportItemStatus = "pending" | "submitted" | "running" | "done" | "failed" | "refused";
export type ImportAction =
  | "run"
  | "pause"
  | "cancel"
  | "retry_failed"
  | "close"
  | "create_drafts"
  | "confirm_snapshot";

/** Token usage summed over model calls (also stored per item and per job). */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
  calls: number;
}

export const EMPTY_USAGE: UsageTotals = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  usd: 0,
  calls: 0,
});

/** A watermark, publisher name, URL or similar mark the model saw on a page. */
export interface PageMark {
  page: number;
  kind: "watermark" | "publisher" | "url" | "other";
  text: string;
}

/** Section instruction text printed in the paper (the pattern snapshot staff confirm). */
export interface PatternSection {
  page: number;
  subject: string | null;
  section: string | null;
  text: string;
}

export interface PatternSnapshot {
  sections: PatternSection[];
  confirmedBy: string | null;
  confirmedAt: number | null;
  note: string | null;
}

/** Header fields printed on the paper, as the model read them (compared with the job metadata). */
export interface PrintedHeader {
  exam: string | null;
  year: string | null;
  date: string | null;
  session: string | null;
  shift: string | null;
  paper: string | null;
  booklet: string | null;
}

/** A figure the model saw: where it is, so a reviewer can crop it from the source page. */
export interface FigureHint {
  n: number;
  page: number;
  bbox: [number, number, number, number] | null;
  description: string;
}

/** One question as extracted by the model, after per-question validation (schema.ts). */
export interface ExtractedQuestion {
  /** Page in the ORIGINAL document where the question starts (1-based). */
  startPage: number;
  qno: string;
  questionRef: string | null;
  optionRefs: string[];
  subject: string | null;
  section: string | null;
  type: string;
  format: string;
  stem: string;
  options: string[];
  stemHi: string | null;
  optionsHi: string[];
  /** Answer printed by the document's own key (bank files only); never candidate marks. */
  answer: string | null;
  solution: string | null;
  unit: string | null;
  passageRef: string | null;
  passage: string | null;
  figures: FigureHint[];
  chapterId: string | null;
  difficulty: string | null;
  difficultyReason: string | null;
  confidence: number;
  claimedSource: string | null;
  issues: string[];
  /** Problems found by the per-question validation (the question is kept as a low-confidence draft). */
  validation: string[];
}

/** A key-table row as extracted from a key PDF or read from a key CSV. */
export interface KeyRow {
  qno: string | null;
  questionRef: string | null;
  subject: string | null;
  booklet: string | null;
  answer: string;
  status: "normal" | "dropped" | "bonus" | "multiple";
  /** 1-based source row or position, for the report. */
  line: number;
}

/** What one model call (or one batch result) produced, validated. Stored in `qb_import_items.output`. */
export interface ItemOutput {
  header: PrintedHeader | null;
  questions: ExtractedQuestion[];
  keyRows: KeyRow[];
  pageMarks: PageMark[];
  instructions: PatternSection[];
  /** Questions dropped because they start on the lookahead page or outside this item's pages. */
  skippedOutside: number;
  /** Questions the per-question validation could not use at all. */
  invalid: { index: number; reason: string }[];
}

/** A chapter the model may suggest (from the exam's confirmed chapter list). */
export interface ImportChapter {
  id: string;
  subject: QbSubject;
  label: string;
}

/** A question already in the bank that belongs to an import (read-only view for keys and pairing). */
export interface ImportQuestionRef {
  id: string;
  importId: string | null;
  sourceKey: string | null;
  subject: QbSubject;
  type: "single" | "multiple" | "numerical";
  qno: string | null;
  questionRef: string | null;
  optionRefs: string[];
  booklet: string | null;
  optionCount: number;
  answer: QbAnswer | null;
  keyStage: "provisional" | "final" | "staff_verified" | "aspire" | null;
  status: string;
}

/**
 * The draft QB-IMPORT hands to `upsertImportDrafts`. `QbDraftInput` plus optional, additive
 * fields QB-CORE-B may store (see the package notes): per-row exam eligibility and the file's
 * difficulty suggestion (tabular files), figure crop hints, and passage text.
 */
export interface ImportDraft extends QbDraftInput {
  exams?: { exam: QbExam; suggestedDifficulty: QbDifficulty | null }[];
  figureHints?: FigureHint[];
  passage?: { ref: string; text: Bilingual } | null;
  /** Reviewer notes from the import (validation problems, reader issues, header disagreements). */
  notes?: string[];
}

/**
 * One answer-key decision for a bank question (input of `applyAnswerKey`). `keyStage` is the NTA /
 * IIT stage for an official key, and `aspire` for a key from Aspire's own files (stored as
 * `key_stage: aspire`, never as an official key).
 */
export interface KeyMatch {
  questionId: string;
  keyImportId: string;
  keyStage: "provisional" | "final" | "aspire";
  keyStatus: "matched" | "dropped" | "multiple_accepted" | "conflict";
  answer: QbAnswer | null;
  /** multiple_accepted: every accepted option (0-based). */
  accepted: number[] | null;
  note: string | null;
}

/** Official Hindi text for an English question (input of `applyHindiPairing`). */
export interface HindiPair {
  questionId: string;
  hindiImportId: string;
  stemHi: string;
  optionsHi: string[];
  solutionHi: string | null;
  hiSource: "official";
}

/** The signed-in staff member as the import routes see them (QB-CORE-B's `QbViewer`). */
export interface ImportViewer {
  userId: string;
  displayName: string;
  role: QbRole;
  can: (capability: QbCapability) => boolean;
}

/** Validation report for a tabular file (dry run before "Create N drafts"). */
export interface TabularReport {
  kind: "bank" | "key";
  rows: number;
  valid: number;
  errors: { row: number; column: string | null; code: string }[];
  warnings: { row: number; column: string | null; code: string }[];
  bySubject: Record<string, number>;
  byExam: Record<string, number>;
  flags: Record<string, number>;
  /** Number of errors not listed (the list is capped). */
  moreErrors: number;
}

/** Outcome summary of applying a key or a Hindi pairing. */
export interface ApplySummary {
  rows: number;
  matched: number;
  unmatched: { line: number; qno: string | null; reason: string }[];
  dropped: number;
  multiple: number;
  conflicts: number;
}

/** Per-job options and computed reports (`qb_imports.options`). */
export interface ImportOptions {
  /** Staff choice: batch (half price, slower) or sync ("fast", 2× batch cost). */
  mode?: "sync" | "batch";
  /** Tabular dry-run report (recomputed before drafts are created). */
  report?: TabularReport | null;
  /** Warnings shown on the job page (e.g. `docx_equations`). */
  warnings?: string[];
  /** Key / pairing outcome. */
  apply?: ApplySummary | null;
  /** Hand-confirmed: the third-party marks were cleared by an admin elsewhere (never set here). */
  thirdParty?: boolean;
}

/** The import job as the API returns it (no file path, no secrets). */
export interface ImportJobView {
  id: string;
  kind: QbImportKind;
  status: QbImportStatus;
  mode: ImportMode;
  fileName: string;
  fileSize: number;
  fileAvailable: boolean;
  pages: number | null;
  rows: number | null;
  encrypted: boolean;
  meta: QbImportMeta;
  model: string | null;
  effort: string | null;
  estimate: QbImportEstimate | null;
  usage: UsageTotals;
  progress: { done: number; total: number };
  items: Record<ImportItemStatus, number>;
  draftsCreated: number;
  pageMarks: PageMark[];
  thirdParty: boolean;
  patternSnapshot: PatternSnapshot | null;
  warnings: string[];
  report: TabularReport | null;
  apply: ApplySummary | null;
  error: string | null;
  pauseReason: string | null;
  licence: { by: string; at: number; note: string | null };
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
