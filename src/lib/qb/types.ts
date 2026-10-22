import type { Bilingual } from "@/content/mocktest/types";

/**
 * Question bank: shared contracts (owner: QB-CORE-A; docs/question-bank-plan.md §B5). Client-safe:
 * types and constants only. Every cross-package contract lives here so packages can code against a
 * file that already exists. Additions beyond §B5 are marked "(addition)".
 */

export type { Bilingual };

export const QB_EXAMS = ["JEE_MAIN", "NEET", "JEE_ADV", "BOH"] as const;
export type QbExam = (typeof QB_EXAMS)[number];
export const QB_SUBJECTS = ["physics", "chemistry", "maths", "botany", "zoology", "biology", "mental_ability"] as const;
export type QbSubject = (typeof QB_SUBJECTS)[number];
/** (addition) */
export const QB_LEVELS = ["class_9_10", "class_11", "class_12", "general"] as const;
export type QbLevel = (typeof QB_LEVELS)[number];
/** (addition) */
export const QB_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type QbDifficulty = (typeof QB_DIFFICULTIES)[number];
/** (addition) */
export const QB_STATUSES = ["draft", "in_review", "approved", "rejected", "retired"] as const;
export type QbStatus = (typeof QB_STATUSES)[number];
/** (addition) */
export const QB_QUESTION_TYPES = ["single", "multiple", "numerical"] as const;
export type QbQuestionType = (typeof QB_QUESTION_TYPES)[number];
/** (addition) */
export const QB_FORMATS = ["standard", "assertion_reason", "statements", "match_list", "passage"] as const;
export type QbFormat = (typeof QB_FORMATS)[number];
export type QbAnswer =
  | { kind: "single"; index: number }
  | { kind: "multiple"; indices: number[] } // sorted, distinct
  | { kind: "numerical"; value: number; low?: number; high?: number; integer: boolean; unit?: Bilingual };
/** (addition) */
export const QB_SOURCE_KINDS = ["official", "aspire", "sample"] as const;
export type QbSourceKind = (typeof QB_SOURCE_KINDS)[number];
export type QbKeyStage = "provisional" | "final" | "staff_verified" | "aspire";
export type QbFidelity = "verbatim" | "transcription_fixed" | "adapted";
export interface QbSource {
  kind: QbSourceKind;
  exam?: QbExam;
  year?: number;
  /** YYYY-MM-DD */
  date?: string;
  /** "January" | "April" | "Re-exam" */
  session?: string;
  shift?: string;
  /** "Paper 1" */
  paper?: string;
  /** NEET booklet code */
  booklet?: string;
  qno?: string;
  /** NTA question ID */
  questionRef?: string;
  optionRefs?: string[];
  page?: number;
  importId?: string;
  /** Official questions entered by hand. */
  evidenceUrl?: string;
  evidencePage?: number;
  /** Staff-only. */
  aspireRef?: string;
  /** Staff-only, UNVERIFIED, never public. */
  claimedSource?: string;
}
export interface QbFigureRef {
  id: string;
  slot: "stem" | "solution" | `option:${number}`;
  alt: Bilingual;
  width: number;
  height: number;
}
export type QbSolutionSource = "none" | "official" | "staff" | "ai_draft" | "ai_draft_reviewed";
export type QbHindiSource = "none" | "official" | "staff" | "machine_draft";
/** Versioned content. Subject and chapter are question-level labels, not content. */
export interface QbQuestionContent {
  type: QbQuestionType;
  format: QbFormat;
  passageId: string | null;
  passageOrder: number | null;
  stem: Bilingual;
  options: Bilingual[];
  answer: QbAnswer | null;
  solution: Bilingual;
  solutionSource: QbSolutionSource;
  hiSource: QbHindiSource;
  figures: QbFigureRef[];
  topics: string[];
}
export type QbDifficultySource = "staff" | "ai_accepted" | "sample" | "calibrated";
export interface QbQuestionExam {
  exam: QbExam;
  eligible: boolean;
  crossExam: boolean;
  difficulty: QbDifficulty | null;
  difficultySource: QbDifficultySource | null;
  aiDifficulty: QbDifficulty | null;
  aiReason: string | null;
  syllabus: "current" | "removed" | "unchecked";
  expectedTimeSec: number | null;
}
export const QB_FLAGS = [
  "low_confidence",
  "answer_missing",
  "answer_conflict",
  "key_dropped",
  "multiple_accepted",
  "key_provisional",
  "figure_needed",
  "math_error",
  "hi_missing",
  "hi_machine",
  "source_mismatch",
  "source_incomplete",
  "third_party_source",
  "exact_duplicate",
  "near_duplicate",
  "unsupported_type",
  "chapter_missing",
  "difficulty_missing",
  "solution_unreviewed",
  "options_incomplete",
  "fidelity_unconfirmed",
  "negative_discrimination",
  "student_report",
] as const;
export type QbFlag = (typeof QB_FLAGS)[number];
/** Approval (single or bulk) is refused while any of these is set. */
export const QB_BLOCKING_FLAGS: readonly QbFlag[] = [
  "answer_missing",
  "answer_conflict",
  "key_dropped",
  "multiple_accepted",
  "key_provisional",
  "figure_needed",
  "math_error",
  "source_mismatch",
  "source_incomplete",
  "third_party_source",
  "exact_duplicate",
  "unsupported_type",
  "chapter_missing",
  "difficulty_missing",
  "solution_unreviewed",
  "options_incomplete",
  "fidelity_unconfirmed",
];
/** Bulk approval also skips these (single approval allowed after a look). */
export const QB_BULK_EXCLUDED_FLAGS: readonly QbFlag[] = [
  ...QB_BLOCKING_FLAGS,
  "low_confidence",
  "student_report",
  "negative_discrimination",
];
export interface QbItemStats {
  exam: QbExam;
  exposures: number;
  scored: number;
  attempted: number;
  correct: number;
  wrong: number;
  omitted: number;
  pAttempted: number | null;
  omissionRate: number | null;
  wilson: [number, number] | null;
  discrimination: number | null;
  calibrated: QbDifficulty | null;
  state: "none" | "suggested" | "accepted" | "dismissed";
}
export type QbKeyStatus = "none" | "matched" | "staff_entered" | "missing" | "dropped" | "multiple_accepted" | "conflict";
export interface QbQuestion {
  id: string;
  n: number;
  status: QbStatus;
  suspended: boolean;
  version: number;
  approvedVersion: number | null;
  subject: QbSubject;
  chapterId: string | null;
  content: QbQuestionContent;
  exams: QbQuestionExam[];
  source: QbSource;
  alsoIn: QbSource[];
  fidelity: QbFidelity | null;
  adaptedNote: Bilingual | null;
  patternTag: string | null;
  originalMarking: QbMarking | null;
  keyStatus: QbKeyStatus;
  keyStage: QbKeyStage | null;
  confidence: number | null;
  flags: QbFlag[];
  clusterId: string | null;
  importId: string | null;
  stats: QbItemStats[];
  createdBy: string | null;
  createdAt: number;
  updatedBy: string | null;
  updatedAt: number;
  approvedBy: string | null;
  approvedAt: number | null;
  /** (addition) The AI's chapter suggestion (import), kept apart from the staff chapter. */
  aiChapterId?: string | null;
  /** (addition) The question's import key (NTA question id or `subject:section:qno`). */
  sourceKey?: string | null;
  /** (addition) Retirement facts, when retired. */
  retiredAt?: number | null;
  retireReason?: string | null;
}

// Blueprints
export const QB_SLOTS = ["jee-main", "neet-ug", "jee-adv", "boh-class-10"] as const;
export type QbSlot = (typeof QB_SLOTS)[number];
export interface QbMarking {
  correct: number;
  wrong: number;
  partial?: "per_correct_option";
}
/** Percentages, sum 100. */
export interface QbMix {
  easy: number;
  medium: number;
  hard: number;
}
export interface QbBlueprintSection {
  id: string;
  subject: QbSubject;
  label: Bilingual;
  type: QbQuestionType;
  /** Required format (match_list, passage). */
  format?: QbFormat;
  answerFormat?: "integer" | "decimal2";
  count: number;
  passageGroupSize?: number;
  marking: QbMarking;
  difficultyMix?: QbMix;
  formatMix?: Partial<Record<QbFormat, number>> | "past_papers" | null;
  /** Official wording where available (verbatim, cited); otherwise Aspire's summary (see patterns.ts). */
  instructions: Bilingual;
}
export interface QbBlueprintPart {
  id: string;
  label: Bilingual;
  durationMinutes: number;
  sections: QbBlueprintSection[];
}
export type QbTieBreakStep =
  | { by: "subject_score"; subject: QbSubject | "biology" }
  | { by: "wrong_correct_ratio"; subject: QbSubject | "biology" | "all" };
export interface QbBlueprint {
  id: string;
  slot: QbSlot;
  version: number;
  status: "draft" | "published" | "archived";
  exam: QbExam;
  title: Bilingual;
  summary: Bilingual;
  parts: QbBlueprintPart[];
  /** Aspire default, NOT official. */
  difficultyMix: QbMix;
  /** e.g. BOH: ["class_9_10", "general"] */
  chapterLevels: QbLevel[];
  chapterWeights: {
    mode: "past_papers" | "uniform" | "manual";
    fromYear: number | null;
    fallbackYears: number;
    halfLifeYears: number | null;
    overrides: Record<string, number>;
  };
  sourcePolicy: { official: boolean; aspire: boolean; sample: "never" | "placeholder_only"; officialMaxShare: number | null };
  crossExamMaxShare: number;
  minShortRatio: number;
  recentExclusionDays: number;
  ranked: "off" | "monthly";
  languages: ("en" | "hi")[];
  compensatoryMinutes: number | null;
  tieBreak: QbTieBreakStep[] | null;
  pattern: { year: number; sourceUrls: string[]; verifiedAt: string | null; reviewDueAt: string | null; note: Bilingual };
  placeholder: boolean;
  patternConfirmedBy: string | null;
  signoff: { label: Bilingual; at: number } | null;
}
export type QbRelaxation = "recent_seen" | "difficulty_borrowed" | "chapter_quota" | "format_mix" | "source_mix" | "shortened";
export interface QbPaperComposition {
  total: number;
  full: number;
  ratio: number;
  bySource: Record<QbSourceKind, number>;
  officialYears: number[];
  officialShare: number;
  adapted: number;
  crossExam: number;
  byDifficulty: Record<QbDifficulty, number>;
  byFormat: Partial<Record<QbFormat, number>>;
  language: "en" | "hi";
  hindiShortfall: number;
  shortfall: { sectionId: string; needed: number; served: number }[];
  relaxed: QbRelaxation[];
}
export type QbReadinessLevel = "full" | "short" | "thin";
export interface QbReadiness {
  level: QbReadinessLevel;
  servable: number;
  full: number;
  /** ≈ papers before repeats */
  variety: number;
  byLanguage: Record<"en" | "hi", QbReadinessLevel>;
  sections: { sectionId: string; needed: number; available: Record<QbDifficulty, number>; servable: number }[];
  ranked: { available: boolean; windowId: string | null; closesAt: number | null };
}

/** One approved question as the generator sees it (a row of `qb_pool` plus its exposure count). */
export interface QbPoolItem {
  id: string;
  n: number;
  version: number;
  subject: QbSubject;
  chapterId: string;
  level: QbLevel;
  type: QbQuestionType;
  format: QbFormat;
  integer: boolean;
  difficulty: QbDifficulty;
  sourceKind: QbSourceKind;
  sourceYear: number | null;
  crossExam: boolean;
  hiOk: boolean;
  clusterId: string;
  passageId: string | null;
  passageOrder: number | null;
  exposures: number;
  /** (addition) Adapted from an official question (from the approved snapshot). */
  adapted?: boolean;
}

/** (addition) Chapter weights per subject: chapter id → share (each subject sums to 1). */
export type QbChapterWeights = Partial<Record<QbSubject, Record<string, number>>>;
/** (addition) Format targets per blueprint section id: format → share (sums to 1). */
export type QbFormatTargets = Record<string, Partial<Record<QbFormat, number>>>;

// Access
export type QbRole = "admin" | "reviewer" | "author";
export interface QbViewer {
  userId: string;
  displayName: string;
  role: QbRole;
  subjects: QbSubject[];
}
export type QbCapability =
  | "view"
  | "edit_draft"
  | "import_tabular"
  | "import_ai"
  | "approve"
  | "retire"
  | "set_labels"
  | "merge_duplicates"
  | "manage_chapters"
  | "key_corrections"
  | "edit_blueprint"
  | "publish_blueprint"
  | "confirm_taxonomy"
  | "manage_team"
  | "manage_settings";

// Imports (implemented by QB-IMPORT; contracts used by QB-CORE-B hooks)
export type QbImportKind = "pdf_paper" | "pdf_key" | "pdf_bank" | "docx_bank" | "xlsx_bank" | "csv_bank" | "csv_key";
export type QbImportStatus = "uploaded" | "ready" | "running" | "waiting_batch" | "paused" | "done" | "failed" | "cancelled" | "closed";
/** (addition) */
export const QB_IMPORT_KINDS = ["pdf_paper", "pdf_key", "pdf_bank", "docx_bank", "xlsx_bank", "csv_bank", "csv_key"] as const satisfies readonly QbImportKind[];
export interface QbImportMeta {
  sourceKind: "official" | "aspire";
  exam?: QbExam;
  year?: number;
  date?: string;
  session?: string;
  shift?: string;
  paper?: string;
  booklet?: string;
  language: "en" | "hi" | "bilingual";
  pairsWith?: string;
  keyFor?: string[];
  keyStage?: "provisional" | "final";
  aspireRef?: string;
}
export interface QbImportEstimate {
  aiRequired: boolean;
  model: string | null;
  mode: "sync" | "batch" | "none";
  pages: number | null;
  rows: number | null;
  batches: number;
  inputTokens: [number, number];
  outputTokens: [number, number];
  usd: [number, number];
  dailyCapUsd: number;
  spentTodayUsd: number;
}
/** What QB-IMPORT hands to upsertImportDrafts. `chapterId` is the AI's suggestion (stored apart). */
export interface QbDraftInput {
  sourceKey: string;
  content: QbQuestionContent;
  subject: QbSubject | null;
  chapterId: string | null;
  source: QbSource;
  aiDifficulty: QbDifficulty | null;
  aiReason: string | null;
  confidence: number;
  flags: QbFlag[];
  patternTag: string | null;
  originalMarking: QbMarking | null;
}

// ---------------------------------------------------------------------------------------------
// Taxonomy records (addition)

export interface QbUnit {
  id: string;
  exam: QbExam;
  syllabusYear: number;
  subject: QbSubject;
  code: string | null;
  label: Bilingual;
  sourceUrl: string;
  sourceRef: string;
  status: "current" | "removed";
  sort: number;
}
export type QbChapterExamStatus = "current" | "removed";
export interface QbChapter {
  id: string;
  subject: QbSubject;
  level: QbLevel;
  label: Bilingual;
  /** exam → official unit ids */
  units: Partial<Record<QbExam, string[]>>;
  /** exam → current | removed (derived; staff-editable) */
  examStatus: Partial<Record<QbExam, QbChapterExamStatus>>;
  origin: "seed" | "staff";
  sort: number;
  active: boolean;
}

// ---------------------------------------------------------------------------------------------
// Served papers (addition). The runner payload whitelist: no answers, solutions, sources, difficulty,
// staff fields or import ids. Built only from approved snapshots (src/lib/qb/papers.ts).

export type QbPaperKind = "practice" | "ranked";
export interface QbServedPassage {
  id: string;
  stem: Bilingual;
  figures: QbFigureRef[];
}
export interface QbServedQuestion {
  /** Question id (stable; progress and reports are keyed by it). */
  id: string;
  /** 0-based position in the whole paper. */
  index: number;
  sectionId: string;
  subject: QbSubject;
  chapterId: string;
  type: QbQuestionType;
  format: QbFormat;
  answerFormat: "integer" | "decimal2" | null;
  stem: Bilingual;
  options: Bilingual[];
  unit?: Bilingual;
  figures: QbFigureRef[];
  passage: QbServedPassage | null;
  marking: QbMarking;
  /** Hindi from an official paper or checked by staff. */
  hiAvailable: boolean;
  /** Machine-drafted Hindi (labelled; secondary toggle in English mode only). */
  hiMachine: boolean;
}
export interface QbServedSection {
  id: string;
  subject: QbSubject;
  label: Bilingual;
  type: QbQuestionType;
  answerFormat: "integer" | "decimal2" | null;
  format: QbFormat | null;
  marking: QbMarking;
  instructions: Bilingual;
  /** Index of the section's first question in the part's question list. */
  start: number;
  count: number;
  /** Full-length count (the blueprint's), for the "shorter than the real exam" banner. */
  fullCount: number;
}
export interface QbPaperView {
  id: string;
  kind: QbPaperKind;
  slot: QbSlot;
  testId: string;
  exam: QbExam;
  setId: string | null;
  setPart: number | null;
  title: Bilingual;
  partLabel: Bilingual | null;
  language: "en" | "hi";
  durationMinutes: number;
  compensatoryMinutes: number;
  maxScore: number;
  questionCount: number;
  short: boolean;
  sample: boolean;
  windowId: string | null;
  createdAt: number;
  expiresAt: number;
  /** Already scored once (the answers are locked). */
  scored: boolean;
  composition: QbPaperComposition;
  sections: QbServedSection[];
  questions: QbServedQuestion[];
  /** Pattern note shown on the start page ("pattern as per the 2026 bulletin"). */
  patternNote: Bilingual;
}
/** Released after scoring (and after the release time): key, solution, public source label, difficulty. */
export interface QbReviewItem {
  id: string;
  index: number;
  answer: QbAnswer | null;
  /** True when a key correction dropped the question (full marks to everyone). */
  dropped: boolean;
  /** Set when an answer-key correction changed this question's key after the paper was made. */
  correctedAt: number | null;
  solution: Bilingual;
  solutionSource: QbSolutionSource;
  sourceLabel: Bilingual;
  sourceKind: QbSourceKind;
  adapted: boolean;
  difficulty: QbDifficulty | null;
}
/** A paper reference kept by a guest browser for "recently seen" exclusion. */
export interface QbPaperRef {
  id: string;
  token: string;
}

// ---------------------------------------------------------------------------------------------
// Reports and corrections (addition)

export const QB_REPORT_KINDS = ["wrong_answer", "question_error", "figure", "hindi", "out_of_syllabus", "other"] as const;
export type QbReportKind = (typeof QB_REPORT_KINDS)[number];
export interface QbReport {
  id: number;
  questionId: string;
  version: number;
  paperId: string | null;
  kind: QbReportKind;
  note: string | null;
  status: "open" | "resolved" | "dismissed";
  createdAt: number;
  resolvedBy: string | null;
  resolvedAt: number | null;
}
export interface QbKeyCorrection {
  id: number;
  questionId: string;
  appliesToVersion: number;
  kind: "answer" | "dropped";
  answer: QbAnswer | null;
  reason: string;
  evidenceUrl: string | null;
  createdBy: string;
  createdAt: number;
  rescoredAt: number | null;
}

/** (addition) QB membership of a staff account. */
export interface QbMember {
  userId: string;
  displayName: string;
  loginId: string;
  role: "author" | "reviewer";
  subjects: QbSubject[];
  active: boolean;
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/** (addition) Which exam a blueprint slot belongs to. */
export const QB_SLOT_EXAM: Readonly<Record<QbSlot, QbExam>> = {
  "jee-main": "JEE_MAIN",
  "neet-ug": "NEET",
  "jee-adv": "JEE_ADV",
  "boh-class-10": "BOH",
};

export function isQbSlot(value: unknown): value is QbSlot {
  return typeof value === "string" && (QB_SLOTS as readonly string[]).includes(value);
}
export function isQbExam(value: unknown): value is QbExam {
  return typeof value === "string" && (QB_EXAMS as readonly string[]).includes(value);
}
export function isQbSubject(value: unknown): value is QbSubject {
  return typeof value === "string" && (QB_SUBJECTS as readonly string[]).includes(value);
}
