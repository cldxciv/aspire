import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbCan } from "./access";
import { createBulkSession, deleteBulkSession, loadBulkSession, verifySpotChecks, type QbBulkOp } from "./bulk";
import { qbDb } from "./db";
import { rewritePoolFor } from "./pool";
import { addEvent, examRowsFor, getQuestionRecords, updateQuestionRow, writeExamRow, type QuestionRecord } from "./repo/questions";
import { conflict, forbidden, invalid, ok, type QbResult } from "./result";
import { refreshQuestionState } from "./questions";
import { bumpBankRevision } from "./settings";
import { getChapter } from "./taxonomy";
import type { QbDifficulty, QbExam, QbViewer } from "./types";
import type { QbBulkCommitResult, QbBulkStartResult } from "./views";

/**
 * Per-exam labels and bulk label actions (owner: QB-CORE-B; §B3, §B7).
 * - "Accept AI chapter and difficulty" (spot-checked): fills a missing chapter from the AI suggestion
 *   (same subject only once approved) and missing per-exam difficulties from the AI suggestion,
 *   recorded as `difficulty_source: "ai_accepted"` with the reviewer's id.
 * - "Confirm syllabus current" (spot-checked) for one exam.
 * - Direct bulk label edits (difficulty, eligibility, cross-exam) for reviewers.
 * Label changes on approved questions apply live: the pool is rewritten and the bank revision bumped.
 */

function labelSkipReason(viewer: QbViewer, record: QuestionRecord | undefined, op: QbBulkOp, exam: QbExam | null, db: DatabaseSync): string | null {
  if (!record) return "not_found";
  if (!qbCan(viewer, "set_labels", record.subject)) return "subject_scope";
  if (record.status === "rejected" || record.status === "retired") return "status";
  const rows = examRowsFor(db, record.id);
  if (op === "confirm_syllabus") {
    const row = rows.find((r) => r.exam === exam);
    if (!row || !row.eligible) return "not_eligible_for_exam";
    if (row.syllabus === "current") return "already_current";
    return null;
  }
  const chapterToAccept = !record.chapterId && record.aiChapterId !== null;
  const difficultyToAccept = rows.some((r) => (exam === null || r.exam === exam) && r.difficulty === null && r.aiDifficulty !== null);
  return chapterToAccept || difficultyToAccept ? null : "nothing_to_accept";
}

export function bulkLabelsStart(
  viewer: QbViewer,
  input: { op: QbBulkOp; ids: string[]; exam: QbExam | null },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbBulkStartResult> {
  if (input.op === "approve") return invalid("Use bulk approval for this operation.");
  if (!qbCan(viewer, "set_labels")) return forbidden();
  if (input.op === "confirm_syllabus" && !input.exam) return invalid("Choose the exam.", { exam: ["required"] });
  const ids = [...new Set(input.ids)].slice(0, 200);
  if (ids.length === 0) return invalid("Choose questions.", { ids: ["required"] });
  const records = getQuestionRecords(db, ids);
  const eligible: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const reason = labelSkipReason(viewer, records.get(id), input.op, input.exam, db);
    if (reason) skipped.push({ id, reason });
    else eligible.push(id);
  }
  if (eligible.length === 0) return invalid("Nothing to change for these questions.", { ids: skipped.map((s) => `${s.id}:${s.reason}`) });
  const session = createBulkSession(db, { op: input.op, exam: input.exam, viewerId: viewer.userId, eligible, now });
  return ok({ batchId: session.id, op: input.op, exam: input.exam, eligible, skipped, sample: session.sample, expiresAt: session.expiresAt });
}

function acceptAi(db: DatabaseSync, viewer: QbViewer, record: QuestionRecord, exam: QbExam | null, now: number): boolean {
  let changed = false;
  if (!record.chapterId && record.aiChapterId) {
    const chapter = getChapter(db, record.aiChapterId);
    if (chapter && (record.status !== "approved" || chapter.subject === record.subject)) {
      updateQuestionRow(db, record.id, { chapter_id: chapter.id, subject: chapter.subject, updated_at: now, updated_by: viewer.userId });
      changed = true;
    }
  }
  for (const row of examRowsFor(db, record.id)) {
    if (exam !== null && row.exam !== exam) continue;
    if (row.difficulty === null && row.aiDifficulty !== null) {
      writeExamRow(db, record.id, row.exam, { difficulty: row.aiDifficulty, difficultySource: "ai_accepted", difficultyBy: viewer.userId }, now);
      changed = true;
    }
  }
  return changed;
}

export function bulkLabelsCommit(
  viewer: QbViewer,
  input: { op: QbBulkOp; batchId: string; checks: { id: string; token: string; ok: boolean }[] },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbBulkCommitResult> {
  if (!qbCan(viewer, "set_labels")) return forbidden();
  const session = loadBulkSession(db, input.batchId, viewer.userId, now);
  if (!session || session.op === "approve" || session.op !== input.op) return conflict("batch_expired", "This bulk action expired or does not exist. Start again.");
  const verdict = verifySpotChecks(session, input.checks);
  if (!verdict.ok && verdict.reason === "failed") {
    deleteBulkSession(db, session.id);
    addEvent(db, verdict.failedId, viewer.userId, "spot_check_failed", { batch: session.id, op: session.op }, now);
    return ok({ outcome: "aborted", op: session.op, failedId: verdict.failedId, sample: session.sample });
  }
  if (!verdict.ok) return conflict("spot_check_incomplete", `Open and check every sampled question first (${verdict.missing.length} left).`);
  const changedIds: string[] = [];
  db.exec("BEGIN IMMEDIATE");
  try {
    const records = getQuestionRecords(db, session.eligible);
    for (const id of session.eligible) {
      const record = records.get(id);
      if (!record || labelSkipReason(viewer, record, session.op, session.exam, db) !== null) continue;
      let changed = false;
      if (session.op === "accept_ai_labels") changed = acceptAi(db, viewer, record, session.exam, now);
      else if (session.exam) {
        writeExamRow(db, id, session.exam, { syllabus: "current", syllabusBy: viewer.userId }, now);
        changed = true;
      }
      if (!changed) continue;
      addEvent(db, id, viewer.userId, session.op === "accept_ai_labels" ? "ai_labels_accepted" : "syllabus_confirmed", { batch: session.id, exam: session.exam }, now);
      refreshQuestionState(db, id, { skipDuplicates: true });
      if (record.status === "approved") rewritePoolFor(db, id);
      changedIds.push(id);
    }
    if (changedIds.length > 0) bumpBankRevision(db, now);
    deleteBulkSession(db, session.id);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return ok({ outcome: "done", op: session.op, count: changedIds.length, ids: changedIds, sample: session.sample });
}

/** Direct bulk label edits (reviewer): difficulty, eligibility or cross-exam for one exam. */
export function applyBulkLabels(
  viewer: QbViewer,
  input: { ids: string[]; exam: QbExam; difficulty?: QbDifficulty; eligible?: boolean; crossExam?: boolean },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<{ count: number; skipped: { id: string; reason: string }[] }> {
  if (!qbCan(viewer, "set_labels")) return forbidden();
  const ids = [...new Set(input.ids)].slice(0, 200);
  const records = getQuestionRecords(db, ids);
  const skipped: { id: string; reason: string }[] = [];
  let count = 0;
  for (const id of ids) {
    const record = records.get(id);
    if (!record) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }
    if (!qbCan(viewer, "set_labels", record.subject)) {
      skipped.push({ id, reason: "subject_scope" });
      continue;
    }
    writeExamRow(
      db,
      id,
      input.exam,
      {
        ...(input.difficulty ? { difficulty: input.difficulty, difficultySource: "staff" as const, difficultyBy: viewer.userId } : {}),
        ...(input.eligible !== undefined ? { eligible: input.eligible } : {}),
        ...(input.crossExam !== undefined ? { crossExam: input.crossExam } : {}),
      },
      now,
    );
    addEvent(db, id, viewer.userId, "labels_bulk", { exam: input.exam, difficulty: input.difficulty ?? null, eligible: input.eligible ?? null, crossExam: input.crossExam ?? null }, now);
    refreshQuestionState(db, id, { skipDuplicates: true });
    if (record.status === "approved") rewritePoolFor(db, id);
    count += 1;
  }
  if (count > 0) bumpBankRevision(db, now);
  return ok({ count, skipped });
}
