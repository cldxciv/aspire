import type {
  Bilingual,
  QbAnswer,
  QbDifficulty,
  QbExam,
  QbFigureRef,
  QbFlag,
  QbFormat,
  QbKeyCorrection,
  QbQuestion,
  QbQuestionContent,
  QbQuestionType,
  QbSourceKind,
  QbStatus,
  QbSubject,
} from "./types";

/**
 * Staff view shapes returned by the QB-CORE-B services (owner: QB-CORE-B). They are structurally
 * the same as the admin API contract (src/components/qb-admin/contract.ts), so the admin API can
 * pass them through unchanged. Client-safe, types only.
 */

export type QbSyllabusStatus = "current" | "removed" | "unchecked";

export interface QbQuestionListItem {
  id: string;
  n: number;
  status: QbStatus;
  suspended: boolean;
  version: number;
  approvedVersion: number | null;
  subject: QbSubject;
  chapterId: string | null;
  type: QbQuestionType;
  format: QbFormat;
  /** English stem as written (LaTeX not rendered), cut to about 160 characters. */
  stemPreview: string;
  sourceKind: QbSourceKind;
  /** Staff label: may name an unverified claimed source. Never public. */
  sourceLabel: string;
  exams: { exam: QbExam; eligible: boolean; difficulty: QbDifficulty | null; syllabus: QbSyllabusStatus }[];
  flags: QbFlag[];
  hasFigures: boolean;
  importId: string | null;
  updatedAt: number;
}

export interface QbQuestionPage {
  items: QbQuestionListItem[];
  total: number;
  page: number;
  pageSize: number;
  search: "fts" | "like" | null;
}

export interface QbEventView {
  id: number;
  at: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  details: Record<string, string | number | boolean | null>;
}

export interface QbVersionView {
  version: number;
  createdAt: number;
  createdBy: string | null;
  approved: boolean;
}

export interface QbDuplicateView {
  a: string;
  b: string;
  score: number;
  kind: "exact" | "near";
  status: "open" | "duplicate" | "variant" | "distinct";
  questions: [QbQuestionListItem | null, QbQuestionListItem | null];
  decidedBy: string | null;
  decidedAt: number | null;
}

export type QbCorrectionView = QbKeyCorrection;

export interface QbQuestionDetail {
  question: QbQuestion;
  sourceLabel: string;
  publicSourceLabel: string;
  passage: { id: string; stem: Bilingual; figures: QbFigureRef[] } | null;
  imported: Pick<QbQuestionContent, "stem" | "options" | "answer"> | null;
  events: QbEventView[];
  versions: QbVersionView[];
  duplicates: QbDuplicateView[];
  corrections: QbCorrectionView[];
  openReports: number;
  spotToken: string | null;
  approval: { allowed: boolean; blockers: string[] };
}

export interface QbQuestionExamInput {
  exam: QbExam;
  eligible: boolean;
  crossExam?: boolean;
  difficulty: QbDifficulty | null;
  syllabus?: QbSyllabusStatus;
  expectedTimeSec?: number | null;
}

export interface QbQuestionInput {
  chapterId: string | null;
  subject?: QbSubject;
  content: QbQuestionContent;
  source: QbQuestion["source"];
  exams: QbQuestionExamInput[];
  adaptedNote?: Bilingual | null;
}

export interface QbQuestionPatch {
  /** Lost-update guard: the `updatedAt` the editor loaded (409 `stale` when it moved). */
  baseUpdatedAt?: number;
  baseVersion?: number;
  expectedUpdatedAt?: number;
  chapterId?: string | null;
  content?: QbQuestionContent;
  source?: QbQuestion["source"];
  exams?: QbQuestionExamInput[];
  adaptedNote?: Bilingual | null;
}

export const QB_CHECKLIST_KEYS = ["answer", "transcription", "math", "figures", "hindi", "syllabus", "licence"] as const;
export type QbChecklistKey = (typeof QB_CHECKLIST_KEYS)[number];

export type QbQuestionAction =
  | { action: "submit" }
  | { action: "approve"; checklist: Partial<Record<QbChecklistKey, boolean>>; note?: string }
  | { action: "reject"; reason: string }
  | { action: "return_to_draft"; note?: string }
  | { action: "suspend"; reason: string }
  | { action: "unsuspend" }
  | { action: "retire"; reason: string }
  | { action: "restore" }
  | { action: "set_fidelity"; fidelity: "transcription_fixed" | "adapted"; note?: Bilingual; adaptedNote?: Bilingual }
  | { action: "set_key_stage"; keyStage: "staff_verified"; note: string }
  | { action: "verify_key"; note: string }
  | { action: "clear_flag"; flag: QbFlag; note?: string; officialUrl?: string }
  | { action: "accept_calibration"; exam: QbExam }
  | { action: "dismiss_calibration"; exam: QbExam };

export interface QbPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QbBulkStartResult {
  batchId: string;
  op: "approve" | "accept_ai_labels" | "confirm_syllabus";
  exam: QbExam | null;
  eligible: string[];
  skipped: { id: string; reason: string }[];
  sample: string[];
  expiresAt: number;
}

export type QbBulkCommitResult =
  | { outcome: "done"; op: QbBulkStartResult["op"]; count: number; ids: string[]; sample: string[] }
  | { outcome: "aborted"; op: QbBulkStartResult["op"]; failedId: string; sample: string[] };

/** A whole answer for display (staff). */
export type QbAnswerView = QbAnswer | null;
