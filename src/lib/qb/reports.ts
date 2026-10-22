import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { qbCan } from "./access";
import { qbDb } from "./db";
import { addEvent, examRowsForMany, getQuestionRecords, setFlag } from "./repo/questions";
import { forbidden, notFound, ok, type QbResult } from "./result";
import { listItemOf } from "./list-item";
import type { QbReport, QbReportKind, QbViewer } from "./types";
import { QB_REPORT_KINDS } from "./types";
import type { QbPage, QbQuestionListItem } from "./views";

/**
 * Student "Report a problem" (owner: QB-CORE-B; §B10.5). A report stores the question, the version
 * that was served, the paper, the kind and an optional note: NO account id and NO IP address. While a
 * report is open its paper id links it to the paper (and so, for a signed-in student, to the account
 * that paper belongs to): privacy copy must say "linked to the paper, not stored with your account",
 * never "anonymous". The paper id is removed when the report is resolved or dismissed. It sets the
 * sticky flag `student_report`, cleared when the question's last open report is resolved.
 * (The per-IP rate limit lives in the route.)
 */

function mapReport(row: Record<string, unknown>): QbReport {
  return {
    id: Number(row.id),
    questionId: String(row.question_id),
    version: Number(row.version),
    paperId: row.paper_id === null ? null : String(row.paper_id),
    kind: row.kind as QbReportKind,
    note: row.note === null ? null : String(row.note),
    status: row.status as QbReport["status"],
    createdAt: Number(row.created_at),
    resolvedBy: row.resolved_by === null ? null : String(row.resolved_by),
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
  };
}

/** Stores a report for a question served at `version` in `paperId`. */
export function recordStudentReport(
  db: DatabaseSync,
  input: { questionId: string; version: number; paperId: string | null; kind: QbReportKind; note: string | null; now: number },
): QbReport {
  const kind = (QB_REPORT_KINDS as readonly string[]).includes(input.kind) ? input.kind : "other";
  const note = input.note ? input.note.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, 500) || null : null;
  const result = db
    .prepare("INSERT INTO qb_reports (question_id, version, paper_id, kind, note, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)")
    .run(input.questionId, input.version, input.paperId, kind, note, input.now);
  setFlag(db, input.questionId, "student_report", true);
  addEvent(db, input.questionId, null, "student_report", { kind, version: input.version }, input.now);
  return mapReport(db.prepare("SELECT * FROM qb_reports WHERE id = ?").get(Number(result.lastInsertRowid))!);
}

export interface QbReportView extends QbReport {
  question: QbQuestionListItem | null;
}

export function listReports(
  viewer: QbViewer,
  input: { status: QbReport["status"]; page: number; pageSize: number },
  db: DatabaseSync = qbDb(),
): QbResult<QbPage<QbReportView>> {
  if (!qbCan(viewer, "view")) return forbidden();
  const pageSize = Math.max(1, Math.min(100, input.pageSize));
  const page = Math.max(1, input.page);
  const total = Number(db.prepare("SELECT COUNT(*) AS n FROM qb_reports WHERE status = ?").get(input.status)?.n ?? 0);
  const rows = db
    .prepare("SELECT * FROM qb_reports WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
    .all(input.status, pageSize, (page - 1) * pageSize)
    .map(mapReport);
  const ids = [...new Set(rows.map((r) => r.questionId))];
  const records = getQuestionRecords(db, ids);
  const exams = examRowsForMany(db, ids);
  const items = rows
    .map((r) => {
      const record = records.get(r.questionId);
      return { ...r, question: record ? listItemOf(record, exams.get(record.id) ?? []) : null };
    })
    .filter((r) => r.question === null || viewer.role === "admin" || viewer.subjects.length === 0 || viewer.subjects.includes(r.question.subject));
  return ok({ items, total, page, pageSize });
}

export function resolveReport(
  viewer: QbViewer,
  id: number,
  input: { status: "resolved" | "dismissed"; note?: string },
  now: number,
  db: DatabaseSync = qbDb(),
): QbResult<QbReportView> {
  const row = db.prepare("SELECT * FROM qb_reports WHERE id = ?").get(id);
  if (!row) return notFound("No such report.");
  const report = mapReport(row);
  const record = getQuestionRecords(db, [report.questionId]).get(report.questionId);
  if (!qbCan(viewer, "approve", record?.subject)) return forbidden();
  // A decided report no longer needs its paper: dropping the id ends the link to a student's paper.
  db.prepare("UPDATE qb_reports SET status = ?, resolved_by = ?, resolved_at = ?, paper_id = NULL WHERE id = ?").run(input.status, viewer.userId, now, id);
  addEvent(db, report.questionId, viewer.userId, "report_" + input.status, { report: id, note: input.note?.slice(0, 200) ?? null }, now);
  const open = Number(db.prepare("SELECT COUNT(*) AS n FROM qb_reports WHERE question_id = ? AND status = 'open'").get(report.questionId)?.n ?? 0);
  if (open === 0) setFlag(db, report.questionId, "student_report", false);
  const fresh = mapReport(db.prepare("SELECT * FROM qb_reports WHERE id = ?").get(id)!);
  const exams = examRowsForMany(db, [report.questionId]);
  const latest = getQuestionRecords(db, [report.questionId]).get(report.questionId);
  return ok({ ...fresh, question: latest ? listItemOf(latest, exams.get(latest.id) ?? []) : null });
}
