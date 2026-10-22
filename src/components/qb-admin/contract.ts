import type {
  Bilingual,
  QbAnswer,
  QbBlueprint,
  QbDifficulty,
  QbExam,
  QbFidelity,
  QbFigureRef,
  QbFlag,
  QbFormat,
  QbKeyStage,
  QbLevel,
  QbPaperComposition,
  QbQuestion,
  QbQuestionContent,
  QbQuestionType,
  QbReadiness,
  QbRole,
  QbSlot,
  QbSource,
  QbSourceKind,
  QbStatus,
  QbSubject,
} from "@/lib/qb/types";

/**
 * Request and response shapes of the question-bank admin API (`/api/admin/qb/**`, QB-ADMIN-API;
 * docs/question-bank-plan.md §B6–B7, §B9, §B14 package 6). Client-safe, types only, except the
 * small constant lists at the bottom. The admin UI (QB-ADMIN-UI) reads nothing else.
 *
 * Everything below `/api/admin/qb` answers with the D-007 envelope. A 409 also carries `code`
 * (one of `QB_CONFLICT_CODES` or another stable snake_case reason) so the UI can explain it.
 */

// ---------------------------------------------------------------------------------------------
// Questions

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
  /** Staff label (`sourceLabelStaff`): may name an unverified claimed source. Never public. */
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
  /** Which search ran for `q` (§B13): FTS5 trigram, the LIKE fallback, or none. */
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
  /** This version is the one papers use (`approved_version`). */
  approved: boolean;
}

export type QbDuplicateDecision = "duplicate" | "variant" | "distinct";

export interface QbDuplicateView {
  a: string;
  b: string;
  score: number;
  kind: "exact" | "near";
  status: "open" | QbDuplicateDecision;
  /** Both questions, for side-by-side review (null if one was deleted). */
  questions: [QbQuestionListItem | null, QbQuestionListItem | null];
  decidedBy: string | null;
  decidedAt: number | null;
}

export interface QbCorrectionView {
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

export interface QbQuestionDetail {
  question: QbQuestion;
  /** Staff label: verified fields plus `aspireRef`, the claimed source marked unverified, fidelity. */
  sourceLabel: string;
  /** What students see after submission (`sourceLabel(q, locale)`, English). */
  publicSourceLabel: string;
  passage: { id: string; stem: Bilingual; figures: QbFigureRef[] } | null;
  /** The original extraction of an imported question (for the fidelity diff); null otherwise. */
  imported: Pick<QbQuestionContent, "stem" | "options" | "answer"> | null;
  events: QbEventView[];
  versions: QbVersionView[];
  duplicates: QbDuplicateView[];
  corrections: QbCorrectionView[];
  openReports: number;
  /** Signed one-time view token: only when the request named a bulk batch that sampled this item. */
  spotToken: string | null;
  /** The server's own approval check (blocking flags, missing labels, licence on the import…). */
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

/** POST /api/admin/qb/questions: a hand-made draft (official sources need evidence, §B2). */
export interface QbQuestionInput {
  chapterId: string | null;
  /** Only when there is no chapter yet; otherwise the subject comes from the chapter (§B3). */
  subject?: QbSubject;
  content: QbQuestionContent;
  source: QbSource;
  exams: QbQuestionExamInput[];
  adaptedNote?: Bilingual | null;
}

/** PATCH /api/admin/qb/questions/:id. `baseVersion` + `baseUpdatedAt` guard against lost updates (409 `stale`). */
export interface QbQuestionPatch {
  baseVersion: number;
  baseUpdatedAt: number;
  chapterId?: string | null;
  content?: QbQuestionContent;
  source?: QbSource;
  exams?: QbQuestionExamInput[];
  adaptedNote?: Bilingual | null;
}

/** POST /api/admin/qb/questions/:id/actions. */
export type QbQuestionAction =
  | { action: "submit" }
  | { action: "approve"; checklist: Record<QbChecklistKey, boolean>; note?: string }
  | { action: "reject"; reason: string }
  | { action: "return_to_draft"; note?: string }
  | { action: "suspend"; reason: string }
  | { action: "unsuspend" }
  | { action: "retire"; reason: string }
  | { action: "restore" }
  | { action: "set_fidelity"; fidelity: Exclude<QbFidelity, "verbatim">; note?: Bilingual }
  | { action: "set_key_stage"; keyStage: Extract<QbKeyStage, "staff_verified">; note: string }
  | { action: "clear_flag"; flag: QbFlag; note?: string; officialUrl?: string }
  | { action: "accept_calibration"; exam: QbExam }
  | { action: "dismiss_calibration"; exam: QbExam };

export type QbQuestionActionName = QbQuestionAction["action"];

// ---------------------------------------------------------------------------------------------
// Bulk actions with spot checks (§B7)

export type QbBulkOp = "approve" | "accept_ai_labels" | "confirm_syllabus";

export interface QbBulkStartResult {
  batchId: string;
  op: QbBulkOp;
  exam: QbExam | null;
  /** Ids the batch will change once the spot check passes. */
  eligible: string[];
  /** Ids left out, with the reason (an excluded flag, wrong status, outside the reviewer's subjects…). */
  skipped: { id: string; reason: string }[];
  /** The ids the reviewer must open and mark OK: max(3, ceil(5 %)), at most 10. */
  sample: string[];
  expiresAt: number;
}

export type QbBulkCommitResult =
  | { outcome: "done"; op: QbBulkOp; count: number; ids: string[]; sample: string[] }
  | { outcome: "aborted"; op: QbBulkOp; failedId: string; sample: string[] };

// ---------------------------------------------------------------------------------------------
// Figures

export interface QbFigureView {
  id: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  size: number;
  /** Staff URL (drafts included): `/api/admin/qb/figures/<id>`. */
  url: string;
}

// ---------------------------------------------------------------------------------------------
// Taxonomy (§B3)

export interface QbUnitView {
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

export interface QbUnitInput {
  id?: string;
  exam: QbExam;
  syllabusYear: number;
  subject: QbSubject;
  code?: string | null;
  label: Bilingual;
  sourceUrl: string;
  sourceRef: string;
  status: "current" | "removed";
  sort: number;
}

export interface QbTaxonomyStatus {
  exam: QbExam;
  confirmed: boolean;
  confirmedAt: number | null;
  confirmedBy: string | null;
  syllabusRevisionYear: number | null;
}

export interface QbUnitsView {
  exam: QbExam;
  status: QbTaxonomyStatus;
  units: QbUnitView[];
  /** Gaps the seed could not fill from an official source (shown as "not transcribed yet"). */
  gaps: string[];
}

export interface QbChapterView {
  id: string;
  subject: QbSubject;
  level: QbLevel;
  label: Bilingual;
  units: Partial<Record<QbExam, string[]>>;
  examStatus: Partial<Record<QbExam, "current" | "removed">>;
  origin: "seed" | "staff";
  sort: number;
  active: boolean;
  /** e.g. "verify against a booklet" for seeded biology blocks. */
  verifyNote: string | null;
  questionCount: number;
}

export interface QbChapterInput {
  /** Create only: a new slug. */
  id?: string;
  subject: QbSubject;
  level: QbLevel;
  label: Bilingual;
  units: Partial<Record<QbExam, string[]>>;
  examStatus: Partial<Record<QbExam, "current" | "removed">>;
  sort: number;
  active: boolean;
}

// ---------------------------------------------------------------------------------------------
// Blueprints (§B1.3, §B9)

export interface QbBlueprintSummary {
  id: string;
  slot: QbSlot;
  version: number;
  status: QbBlueprint["status"];
  exam: QbExam;
  title: Bilingual;
  placeholder: boolean;
  patternConfirmed: boolean;
  signedOff: boolean;
  reviewDueAt: string | null;
  updatedAt: number;
  publishedAt: number | null;
  totals: { questions: number; marks: number; minutes: number };
}

export interface QbBlueprintDetail {
  blueprint: QbBlueprint;
  updatedAt: number;
  /** Validation issues of the definition (path → message); a draft with issues cannot be published. */
  issues: { path: string; message: string }[];
  taxonomyConfirmed: boolean;
  /** Why publishing is refused right now (placeholder BOH, unconfirmed taxonomy or pattern, issues…). */
  publishBlockers: string[];
}

/**
 * What the blueprint editor may change (`PATCH /api/admin/qb/blueprints/:id`). Identity, status,
 * the placeholder flag, the pattern confirmation and the sign-off change only through actions.
 */
export type QbBlueprintEditable = Omit<QbBlueprint, "id" | "slot" | "version" | "status" | "exam" | "placeholder" | "patternConfirmedBy" | "signoff">;

export type QbBlueprintActionName = "publish" | "archive" | "new_version" | "confirm_pattern" | "signoff";

export interface QbBlueprintAction {
  action: QbBlueprintActionName;
  note?: string;
  /** `signoff` only: public wording, e.g. "Pattern reviewed by Aspire faculty" (no names by default). */
  label?: Bilingual;
}

export interface QbPreviewItem {
  id: string;
  n: number;
  version: number;
  chapterId: string;
  difficulty: QbDifficulty;
  sourceKind: QbSourceKind;
  sourceYear: number | null;
  type: QbQuestionType;
  format: QbFormat;
  stemPreview: string;
}

export interface QbBlueprintPreview {
  seed: string;
  language: "en" | "hi";
  ok: boolean;
  short: boolean;
  composition: QbPaperComposition | null;
  /** Set when `ok` is false (the bank is thin for this blueprint). */
  readiness: QbReadiness | null;
  parts: {
    partId: string;
    durationMinutes: number;
    maxScore: number;
    sections: { sectionId: string; items: QbPreviewItem[] }[];
  }[];
}

export interface QbRange {
  min: number;
  avg: number;
  max: number;
}

export interface QbPreviewStats {
  seeds: number;
  chapters: Record<string, QbRange>;
  difficulty: Record<QbDifficulty, QbRange>;
  mostUsed: { id: string; share: number }[];
  relaxedRate: number;
}

// ---------------------------------------------------------------------------------------------
// Coverage, duplicates, reports, corrections

export interface QbCoverage {
  exam: QbExam;
  subjects: {
    subject: QbSubject;
    chapters: {
      chapterId: string;
      label: Bilingual;
      level: QbLevel;
      /** Approved, in the pool for this exam, by difficulty. */
      approved: Record<QbDifficulty, number>;
      inReview: number;
      drafts: number;
      figureBacklog: number;
    }[];
  }[];
  /** Answer-position distribution per source kind (single-correct items; index 0 = option A). */
  answerPositions: { sourceKind: QbSourceKind; counts: number[]; total: number }[];
  /** Chapters with questions waiting for a figure. */
  figureAlerts: { chapterId: string; label: Bilingual; waiting: number }[];
  totals: { approved: number; inReview: number; drafts: number; flagged: number };
}

export interface QbPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type QbReportKind = "wrong_answer" | "question_error" | "figure" | "hindi" | "out_of_syllabus" | "other";
export type QbReportStatus = "open" | "resolved" | "dismissed";

export interface QbReportView {
  id: number;
  questionId: string;
  version: number;
  kind: QbReportKind;
  note: string | null;
  status: QbReportStatus;
  createdAt: number;
  resolvedBy: string | null;
  resolvedAt: number | null;
  question: QbQuestionListItem | null;
}

export interface QbCorrectionInput {
  questionId: string;
  appliesToVersion: number;
  kind: "answer" | "dropped";
  answer?: QbAnswer;
  reason: string;
  evidenceUrl?: string;
}

export interface QbCorrectionResult {
  correction: QbCorrectionView;
  /** Saved attempts re-scored (boards and verify pages update, §B10.4). */
  rescoredAttempts: number;
}

// ---------------------------------------------------------------------------------------------
// Team and settings

export interface QbMemberView {
  userId: string;
  displayName: string;
  loginId: string;
  qbRole: Exclude<QbRole, "admin">;
  subjects: QbSubject[];
  active: boolean;
  /** The account is disabled (no access whatever the membership says). */
  disabled: boolean;
  updatedAt: number;
}

export interface QbTeamView {
  members: QbMemberView[];
  /** Staff accounts without a membership yet (create accounts on /admin/users). */
  candidates: { userId: string; displayName: string; loginId: string }[];
}

export interface QbMemberInput {
  qbRole: Exclude<QbRole, "admin">;
  subjects: QbSubject[];
  active: boolean;
}

export type QbApprovalSelf = "allowed_recorded" | "second_reviewer";

export interface QbSettingsView {
  /** The admin setting `import.enabled` (default off). */
  importEnabled: boolean;
  /** `QB_IMPORT_ENABLED=0`: the hard kill switch wins over the setting. */
  importEnvOff: boolean;
  apiKeyConfigured: boolean;
  approvalSelf: QbApprovalSelf;
  bankRevision: number;
  searchMode: "fts" | "like";
  figures: { usedMb: number; quotaMb: number };
}

export interface QbSettingsPatch {
  importEnabled?: boolean;
  approvalSelf?: QbApprovalSelf;
}

// ---------------------------------------------------------------------------------------------
// Constants shared by the API and the UI

/** Approval checklist (§B7); the server re-checks every item. */
export const QB_CHECKLIST_KEYS = ["answer", "transcription", "math", "figures", "hindi", "syllabus", "licence"] as const;
export type QbChecklistKey = (typeof QB_CHECKLIST_KEYS)[number];

/** Stable 409 reasons the admin UI explains in words (others get a generic "changed meanwhile"). */
export const QB_CONFLICT_CODES = [
  "stale",
  "taxonomy_unconfirmed",
  "placeholder_blueprint",
  "pattern_unconfirmed",
  "blueprint_invalid",
  "blocking_flags",
  "self_approval",
  "spot_check_incomplete",
  "spot_check_failed",
  "batch_expired",
  "not_allowed_in_status",
  "subject_scope",
  "duplicate_id",
  "figure_quota",
  "fidelity_answer_differs",
  "chapter_in_use",
  "subject_mismatch",
] as const;
export type QbConflictCode = (typeof QB_CONFLICT_CODES)[number];

export const QB_REPORT_KINDS: readonly QbReportKind[] = ["wrong_answer", "question_error", "figure", "hindi", "out_of_syllabus", "other"];
export const QB_REPORT_STATUSES: readonly QbReportStatus[] = ["open", "resolved", "dismissed"];
export const QB_BLUEPRINT_ACTIONS: readonly QbBlueprintActionName[] = ["publish", "archive", "new_version", "confirm_pattern", "signoff"];
export const QB_DUPLICATE_DECISIONS: readonly QbDuplicateDecision[] = ["duplicate", "variant", "distinct"];

/** Staff figure URL (drafts included). */
export function qbFigureAdminUrl(id: string): string {
  return `/api/admin/qb/figures/${encodeURIComponent(id)}`;
}
