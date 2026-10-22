import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbCan } from "./access";
import { qbDb } from "./db";
import { contentMathProblems } from "./math-check";
import { answersEqual, derivedFlags, mergeFlags } from "./question-rules";
import { addEvent, examRowsFor, getQuestionRecord, loadSnapshot, updateQuestionRow, type QuestionRecord } from "./repo/questions";
import { parseJson, placeholders } from "./repo/json";
import { forbidden, invalid, notFound, ok, type QbResult } from "./result";
import type { QbAnswer, QbKeyCorrection, QbViewer } from "./types";

/**
 * Answer-key corrections (owner: QB-CORE-B; §B10.4). A reviewer records an answer change or a drop
 * for "this version and older", with a reason and evidence. Corrections apply whenever a paper is
 * loaded or scored (the newest correction covering the served version wins). A dropped question
 * gives full marks to every paper that contains it (both bulletins). Saved attempts are re-scored by
 * the mock-test side (`rescoreAttemptsAfterCorrection`, src/lib/mocktest/generated.ts), which the
 * caller passes as `rescore` (the default looks it up lazily, so this module has no static import of
 * the mock-test code).
 *
 * An answer correction is also carried into the WORKING COPY when that copy still holds the corrected
 * (wrong) key, so the next approved version cannot silently bring the old key back. When the working
 * copy already holds a third answer (a pending edit), the question gets `key_status: conflict`
 * (blocking `answer_conflict`) until a reviewer reconciles the two.
 *
 * Limitation (documented for the approval checklist): a correction is ONE answer or a drop. When an
 * official final key accepts several options of a single-correct question ("any of the correct
 * options"), the bank cannot score that rule: record a drop only when the issuer dropped the question;
 * otherwise retire the question (or approve an adapted version with one correct option).
 */

function mapCorrection(row: Record<string, unknown>): QbKeyCorrection {
  return {
    id: Number(row.id),
    questionId: String(row.question_id),
    appliesToVersion: Number(row.applies_to_version),
    kind: row.kind === "dropped" ? "dropped" : "answer",
    answer: parseJson<QbAnswer | null>(row.answer, null),
    reason: String(row.reason),
    evidenceUrl: row.evidence_url === null ? null : String(row.evidence_url),
    createdBy: String(row.created_by),
    createdAt: Number(row.created_at),
    rescoredAt: row.rescored_at === null ? null : Number(row.rescored_at),
  };
}

/** Corrections per question, newest first. */
export function correctionsFor(db: DatabaseSync, questionIds: readonly string[]): Map<string, QbKeyCorrection[]> {
  const out = new Map<string, QbKeyCorrection[]>();
  const unique = [...new Set(questionIds)];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    if (chunk.length === 0) continue;
    for (const row of db
      .prepare(`SELECT * FROM qb_key_corrections WHERE question_id IN (${placeholders(chunk.length)}) ORDER BY created_at DESC, id DESC`)
      .all(...chunk)) {
      const c = mapCorrection(row);
      const list = out.get(c.questionId) ?? [];
      list.push(c);
      out.set(c.questionId, list);
    }
  }
  return out;
}

export interface EffectiveKey {
  answer: QbAnswer | null;
  dropped: boolean;
  correctedAt: number | null;
}

/** The key a served version is scored with: the newest correction covering `version`, else the snapshot's. */
export function effectiveKey(answer: QbAnswer | null, corrections: readonly QbKeyCorrection[] | undefined, version: number): EffectiveKey {
  const applicable = (corrections ?? []).filter((c) => version <= c.appliesToVersion);
  if (applicable.length === 0) return { answer, dropped: false, correctedAt: null };
  const newest = applicable.reduce((a, b) => (b.createdAt > a.createdAt || (b.createdAt === a.createdAt && b.id > a.id) ? b : a));
  if (newest.kind === "dropped") return { answer, dropped: true, correctedAt: newest.createdAt };
  return { answer: newest.answer ?? answer, dropped: false, correctedAt: newest.createdAt };
}

export type QbRescorer = (questionId: string, now: number) => Promise<{ attempts: number }>;

const defaultRescorer: QbRescorer = async (questionId, now) => {
  try {
    const mod = (await import("@/lib/mocktest/generated")) as { rescoreAttemptsAfterCorrection?: QbRescorer };
    return mod.rescoreAttemptsAfterCorrection ? await mod.rescoreAttemptsAfterCorrection(questionId, now) : { attempts: 0 };
  } catch {
    return { attempts: 0 };
  }
};

export interface QbCorrectionInput {
  questionId: string;
  appliesToVersion?: number;
  kind: "answer" | "dropped";
  answer?: QbAnswer;
  reason: string;
  evidenceUrl?: string;
}

/** Records a correction (reviewer; audited by the route), then re-scores saved attempts. */
export async function createCorrection(
  viewer: QbViewer,
  input: QbCorrectionInput,
  now: number,
  db: DatabaseSync = qbDb(),
  options: { rescore?: QbRescorer } = {},
): Promise<QbResult<{ correction: QbKeyCorrection; rescoredAttempts: number }>> {
  const record = getQuestionRecord(db, input.questionId);
  if (!record) return notFound("No such question.");
  if (!qbCan(viewer, "key_corrections", record.subject)) return forbidden();
  if (record.approvedVersion === null) return invalid("Only approved questions can have answer-key corrections. Edit the draft instead.");
  const appliesTo = input.appliesToVersion ?? record.approvedVersion;
  if (appliesTo < 1 || appliesTo > record.version) return invalid("Choose an existing version.", { appliesToVersion: ["range"] });
  if (input.kind === "answer") {
    if (!input.answer) return invalid("Give the corrected answer.", { answer: ["required"] });
    if (input.answer.kind !== record.content.type) return invalid("The answer does not match the question type.", { answer: ["type"] });
    const optionCount = (loadSnapshot(db, record.id, Math.min(appliesTo, record.approvedVersion))?.content.options ?? record.content.options).length;
    const outOfRange =
      (input.answer.kind === "single" && (input.answer.index < 0 || input.answer.index >= optionCount)) ||
      (input.answer.kind === "multiple" && (input.answer.indices.length === 0 || input.answer.indices.some((i) => i < 0 || i >= optionCount)));
    if (outOfRange) return invalid("The answer points at a missing option.", { answer: ["range"] });
  }
  if (input.reason.trim().length < 3) return invalid("Say why the key changes.", { reason: ["required"] });
  const result = db
    .prepare(
      `INSERT INTO qb_key_corrections (question_id, applies_to_version, kind, answer, reason, evidence_url, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      record.id,
      appliesTo,
      input.kind,
      input.kind === "answer" ? JSON.stringify(input.answer) : null,
      input.reason.trim(),
      input.evidenceUrl ?? null,
      viewer.userId,
      now,
    );
  const id = Number(result.lastInsertRowid);
  const carried = input.kind === "answer" && input.answer ? carryIntoWorkingCopy(db, record, appliesTo, input.answer, viewer, now) : "unchanged";
  addEvent(
    db,
    record.id,
    viewer.userId,
    "key_correction",
    { kind: input.kind, appliesToVersion: appliesTo, correctionId: id, workingCopy: carried },
    now,
  );
  const rescore = options.rescore ?? defaultRescorer;
  const { attempts } = await rescore(record.id, now);
  db.prepare("UPDATE qb_key_corrections SET rescored_at = ? WHERE id = ?").run(now, id);
  const row = db.prepare("SELECT * FROM qb_key_corrections WHERE id = ?").get(id)!;
  return ok({ correction: mapCorrection(row), rescoredAttempts: attempts });
}

/**
 * Keeps the working copy in line with an answer correction: "carried" when the working copy still had
 * the corrected version's (wrong) key, "conflict" when a pending edit holds yet another answer,
 * "unchanged" when it already has the corrected answer or is newer than the correction's coverage
 * with its own deliberate key.
 */
function carryIntoWorkingCopy(
  db: DatabaseSync,
  record: QuestionRecord,
  appliesTo: number,
  answer: QbAnswer,
  viewer: QbViewer,
  now: number,
): "carried" | "conflict" | "unchanged" {
  // A correction limited to versions older than the approved one is the reviewer's explicit choice.
  const approvedVersion = record.approvedVersion;
  if (approvedVersion === null || appliesTo < approvedVersion) return "unchanged";
  const working = record.content.answer;
  if (answersEqual(working, answer)) return "unchanged";
  const servedKey = loadSnapshot(db, record.id, approvedVersion)?.content.answer ?? null;
  const stale = record.version <= appliesTo || answersEqual(working, servedKey);
  if (stale) {
    const content = { ...record.content, answer };
    updateQuestionRow(db, record.id, { content: JSON.stringify(content), updated_at: now, updated_by: viewer.userId });
  } else {
    updateQuestionRow(db, record.id, { key_status: "conflict", updated_at: now, updated_by: viewer.userId });
  }
  const fresh = getQuestionRecord(db, record.id)!;
  const derived = derivedFlags({
    content: fresh.content,
    sourceKind: fresh.sourceKind,
    source: fresh.source,
    importId: fresh.importId,
    chapterId: fresh.chapterId,
    exams: examRowsFor(db, fresh.id),
    keyStatus: fresh.keyStatus,
    keyStage: fresh.keyStage,
    fidelity: fresh.fidelity,
    imported: fresh.imported,
    mathError: contentMathProblems(fresh.content).length > 0,
  });
  updateQuestionRow(db, fresh.id, { flags: JSON.stringify(mergeFlags(fresh.flags, derived)) });
  return stale ? "carried" : "conflict";
}

export function listCorrections(viewer: QbViewer, input: { questionId?: string }, db: DatabaseSync = qbDb()): QbResult<QbKeyCorrection[]> {
  if (!qbCan(viewer, "view")) return forbidden();
  const rows = input.questionId
    ? db.prepare("SELECT * FROM qb_key_corrections WHERE question_id = ? ORDER BY created_at DESC, id DESC").all(input.questionId)
    : db.prepare("SELECT * FROM qb_key_corrections ORDER BY created_at DESC, id DESC LIMIT 200").all();
  return ok(rows.map(mapCorrection));
}
