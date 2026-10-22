import "server-only";

import type {
  QbBlueprintAction,
  QbBlueprintDetail,
  QbBlueprintEditable,
  QbBlueprintPreview,
  QbBlueprintSummary,
  QbBulkCommitResult,
  QbBulkOp,
  QbBulkStartResult,
  QbChapterInput,
  QbChapterView,
  QbCorrectionInput,
  QbCorrectionResult,
  QbCorrectionView,
  QbCoverage,
  QbDuplicateDecision,
  QbDuplicateView,
  QbFigureView,
  QbMemberInput,
  QbMemberView,
  QbPage,
  QbPreviewStats,
  QbQuestionAction,
  QbQuestionDetail,
  QbQuestionInput,
  QbQuestionPage,
  QbQuestionPatch,
  QbReportStatus,
  QbReportView,
  QbSettingsPatch,
  QbSettingsView,
  QbTaxonomyStatus,
  QbTeamView,
  QbUnitInput,
  QbUnitsView,
  QbUnitView,
} from "@/components/qb-admin/contract";
import type { QbQuestionFilters } from "@/components/qb-admin/filters";
import type { QbCapability, QbExam, QbReadiness, QbSlot, QbSubject, QbViewer } from "@/lib/qb/types";
import * as qbAccess from "@/lib/qb/access";
import * as qbBlueprints from "@/lib/qb/blueprints";
import * as qbCorrections from "@/lib/qb/corrections";
import * as qbCoverage from "@/lib/qb/coverage";
import * as qbDedupe from "@/lib/qb/dedupe";
import * as qbFigures from "@/lib/qb/figures";
import { requireQbApi } from "@/lib/qb/http";
import * as qbExams from "@/lib/qb/exams";
import * as qbPreview from "@/lib/qb/preview";
import * as qbQuestions from "@/lib/qb/questions";
import * as qbReports from "@/lib/qb/reports";
import { ensureQbSeeded } from "@/lib/qb/seed";
import * as qbSettings from "@/lib/qb/settings";
import * as qbTaxonomy from "@/lib/qb/taxonomy";

/**
 * The ONE place where the admin question-bank API (`/api/admin/qb/**`, QB-ADMIN-API) calls the
 * QB-CORE-B services and QB-SEED. Routes import only this module (tests replace it with a fake),
 * so if a CORE-B name or signature changes, only this file changes.
 *
 * Contracts (docs/question-bank-plan.md §B14 packages 2–3), checked against the CORE-B files in the
 * working tree on 22 Oct 2026 while both packages were being built:
 * - `requireQbApi(request, capability, subject?)` → `{ ok: true, viewer } | { ok: false, response }`
 *   (401 / 403 / 409 `password_change_required`), `ensureQbSeeded(db?)` from `@/lib/qb/seed`;
 * - every service takes the viewer first, re-checks its capability and subject scope, and returns
 *   `QbResult` (`src/lib/qb/result.ts`, the same shape as `QbServiceResult` below);
 * - the view shapes in `src/lib/qb/views.ts` match `src/components/qb-admin/contract.ts`; the one
 *   adaptation is the duplicate list (CORE-B returns records; the contract shows list rows);
 * - routes write the §B6 core audit rows (`_lib/http.ts` `qbAudit`); services do not (the
 *   convention written in `src/lib/qb/audit.ts`).
 * - NOT YET PRESENT when this was written: `@/lib/qb/blueprints` (`listBlueprints`,
 *   `getBlueprintDetail`, `createDraft`, `saveDraft`, `blueprintAction`), `@/lib/qb/preview`
 *   (`blueprintReadiness`, `blueprintPreview`, `blueprintPreviewStats`) and `@/lib/qb/coverage`
 *   (`coverageReport`). The calls below use these assumed names and the contract.ts result types.
 */

export type QbServiceError = "not_found" | "forbidden" | "validation" | "conflict";

export type QbServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: QbServiceError; message: string; code?: string; fieldErrors?: Record<string, string[]> };

export type QbApiGuard = { ok: true; viewer: QbViewer } | { ok: false; response: Response };

// ---------------------------------------------------------------------------------------------
// Guard and seeding

export async function guardQbApi(request: Request, capability: QbCapability, subject?: QbSubject): Promise<QbApiGuard> {
  return requireQbApi(request, capability, subject);
}

export async function ensureSeeded(): Promise<void> {
  await ensureQbSeeded();
}

// ---------------------------------------------------------------------------------------------
// Questions (questions.ts, exams.ts, search.ts)

export async function listQuestions(viewer: QbViewer, filters: QbQuestionFilters): Promise<QbServiceResult<QbQuestionPage>> {
  return qbQuestions.listQuestions(viewer, filters);
}

export async function getQuestion(
  viewer: QbViewer,
  id: string,
  options: { spotCheckBatchId?: string },
): Promise<QbServiceResult<QbQuestionDetail>> {
  return qbQuestions.getQuestionDetail(viewer, id, options);
}

export async function createQuestion(viewer: QbViewer, input: QbQuestionInput, now: number): Promise<QbServiceResult<QbQuestionDetail>> {
  return qbQuestions.createDraft(viewer, input, now);
}

export async function updateQuestion(
  viewer: QbViewer,
  id: string,
  patch: QbQuestionPatch,
  now: number,
): Promise<QbServiceResult<QbQuestionDetail>> {
  return qbQuestions.updateQuestion(viewer, id, patch, now);
}

export async function questionAction(
  viewer: QbViewer,
  id: string,
  action: QbQuestionAction,
  now: number,
): Promise<QbServiceResult<QbQuestionDetail>> {
  return qbQuestions.questionAction(viewer, id, action, now);
}

export async function bulkStart(
  viewer: QbViewer,
  input: { op: QbBulkOp; ids: string[]; exam: QbExam | null },
  now: number,
): Promise<QbServiceResult<QbBulkStartResult>> {
  const start = input.op === "approve" ? qbQuestions.bulkApproveStart : qbExams.bulkLabelsStart;
  return start(viewer, input, now);
}

export async function bulkCommit(
  viewer: QbViewer,
  input: { op: QbBulkOp; batchId: string; checks: { id: string; token: string; ok: boolean }[] },
  now: number,
): Promise<QbServiceResult<QbBulkCommitResult>> {
  const commit = input.op === "approve" ? qbQuestions.bulkApproveCommit : qbExams.bulkLabelsCommit;
  return commit(viewer, input, now);
}

export async function bulkCancel(viewer: QbViewer, input: { op: QbBulkOp; batchId: string }, now: number): Promise<QbServiceResult<{ cancelled: true }>> {
  return qbQuestions.bulkCancel(viewer, input, now);
}

// ---------------------------------------------------------------------------------------------
// Figures (figures.ts)

export async function saveFigure(
  viewer: QbViewer,
  file: { bytes: Uint8Array; declaredType: string },
  now: number,
): Promise<QbServiceResult<QbFigureView>> {
  return qbFigures.saveFigure(viewer, file, now);
}

export async function readFigure(viewer: QbViewer, id: string): Promise<QbServiceResult<{ bytes: Uint8Array; mime: QbFigureView["mime"] }>> {
  return qbFigures.readFigureForStaff(viewer, id);
}

// ---------------------------------------------------------------------------------------------
// Taxonomy (taxonomy.ts)

export async function listUnits(viewer: QbViewer, exam: QbExam): Promise<QbServiceResult<QbUnitsView>> {
  return qbTaxonomy.listUnits(viewer, exam);
}

export async function upsertUnit(viewer: QbViewer, input: QbUnitInput, now: number): Promise<QbServiceResult<QbUnitView>> {
  return qbTaxonomy.upsertUnit(viewer, input, now);
}

export async function listChapters(
  viewer: QbViewer,
  filter: { exam?: QbExam; subject?: QbSubject; includeInactive: boolean },
): Promise<QbServiceResult<QbChapterView[]>> {
  return qbTaxonomy.listChapters(viewer, filter);
}

export async function createChapter(viewer: QbViewer, input: QbChapterInput, now: number): Promise<QbServiceResult<QbChapterView>> {
  return qbTaxonomy.createChapter(viewer, input, now);
}

export async function updateChapter(
  viewer: QbViewer,
  id: string,
  patch: Partial<Omit<QbChapterInput, "id">>,
  now: number,
): Promise<QbServiceResult<QbChapterView>> {
  return qbTaxonomy.updateChapter(viewer, id, patch, now);
}

export async function confirmTaxonomy(
  viewer: QbViewer,
  exam: QbExam,
  input: { syllabusRevisionYear: number; note?: string },
  now: number,
): Promise<QbServiceResult<QbTaxonomyStatus>> {
  return qbTaxonomy.confirmTaxonomy(viewer, exam, input, now);
}

// ---------------------------------------------------------------------------------------------
// Blueprints (blueprints.ts, preview.ts)

export async function listBlueprints(viewer: QbViewer): Promise<QbServiceResult<QbBlueprintSummary[]>> {
  return qbBlueprints.listBlueprints(viewer);
}

export async function getBlueprint(viewer: QbViewer, id: string): Promise<QbServiceResult<QbBlueprintDetail>> {
  return qbBlueprints.getBlueprintDetail(viewer, id);
}

export async function createBlueprint(viewer: QbViewer, input: { slot: QbSlot }, now: number): Promise<QbServiceResult<QbBlueprintDetail>> {
  return qbBlueprints.createDraft(viewer, input, now);
}

export async function saveBlueprint(
  viewer: QbViewer,
  id: string,
  input: { definition: QbBlueprintEditable; baseUpdatedAt: number },
  now: number,
): Promise<QbServiceResult<QbBlueprintDetail>> {
  return qbBlueprints.saveDraft(viewer, id, input, now);
}

export async function blueprintAction(
  viewer: QbViewer,
  id: string,
  action: QbBlueprintAction,
  now: number,
): Promise<QbServiceResult<QbBlueprintDetail>> {
  return qbBlueprints.blueprintAction(viewer, id, action, now);
}

export async function blueprintReadiness(viewer: QbViewer, id: string, input: { language: "en" | "hi" }): Promise<QbServiceResult<QbReadiness>> {
  return qbPreview.blueprintReadiness(viewer, id, input);
}

export async function blueprintPreview(
  viewer: QbViewer,
  id: string,
  input: { seed: string; language: "en" | "hi" },
): Promise<QbServiceResult<QbBlueprintPreview>> {
  return qbPreview.blueprintPreview(viewer, id, input);
}

export async function blueprintPreviewStats(
  viewer: QbViewer,
  id: string,
  input: { language: "en" | "hi" },
): Promise<QbServiceResult<QbPreviewStats>> {
  return qbPreview.blueprintPreviewStats(viewer, id, input);
}

// ---------------------------------------------------------------------------------------------
// Coverage, duplicates, reports, corrections

export async function coverage(viewer: QbViewer, input: { exam: QbExam; subject?: QbSubject }): Promise<QbServiceResult<QbCoverage>> {
  return qbCoverage.coverageReport(viewer, input);
}

export async function listDuplicates(
  viewer: QbViewer,
  input: { status: "open" | QbDuplicateDecision; subject?: QbSubject; page: number; pageSize: number },
): Promise<QbServiceResult<QbPage<QbDuplicateView>>> {
  // CORE-B already returns each pair with both questions as list rows (dedupe.duplicateViews).
  return qbDedupe.listDuplicatePairs(viewer, input);
}

export async function decideDuplicate(
  viewer: QbViewer,
  input: { a: string; b: string; decision: QbDuplicateDecision; keep?: string },
  now: number,
): Promise<QbServiceResult<QbDuplicateView>> {
  const result = qbDedupe.decideDuplicate(viewer, input, now);
  // The decided pair alone; the review screen reloads the list (with both questions) afterwards.
  return result.ok ? { ok: true, data: { ...result.data, questions: [null, null] } } : result;
}

export async function listReports(
  viewer: QbViewer,
  input: { status: QbReportStatus; page: number; pageSize: number },
): Promise<QbServiceResult<QbPage<QbReportView>>> {
  return qbReports.listReports(viewer, input);
}

export async function updateReport(
  viewer: QbViewer,
  id: number,
  input: { status: Exclude<QbReportStatus, "open">; note?: string },
  now: number,
): Promise<QbServiceResult<QbReportView>> {
  return qbReports.resolveReport(viewer, id, input, now);
}

export async function listCorrections(viewer: QbViewer, input: { questionId?: string }): Promise<QbServiceResult<QbCorrectionView[]>> {
  return qbCorrections.listCorrections(viewer, input);
}

export async function createCorrection(viewer: QbViewer, input: QbCorrectionInput, now: number): Promise<QbServiceResult<QbCorrectionResult>> {
  return qbCorrections.createCorrection(viewer, input, now);
}

// ---------------------------------------------------------------------------------------------
// Team and settings (access.ts, settings.ts)

export async function listMembers(viewer: QbViewer): Promise<QbServiceResult<QbTeamView>> {
  return qbAccess.listMembers(viewer);
}

export async function upsertMember(viewer: QbViewer, userId: string, input: QbMemberInput, now: number): Promise<QbServiceResult<QbMemberView>> {
  return qbAccess.upsertMember(viewer, userId, input, now);
}

export async function getSettings(viewer: QbViewer): Promise<QbServiceResult<QbSettingsView>> {
  return qbSettings.getSettingsView(viewer);
}

export async function updateSettings(viewer: QbViewer, patch: QbSettingsPatch, now: number): Promise<QbServiceResult<QbSettingsView>> {
  return qbSettings.updateSettings(viewer, patch, now);
}
