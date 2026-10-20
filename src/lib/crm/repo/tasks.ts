import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { LeadStage } from "../types";
import { int, text, type Row } from "./rows";

/** `crm_tasks`: follow-ups with due dates. */

export interface TaskRow {
  id: string;
  leadId: string;
  title: string;
  dueAt: number;
  doneAt: number | null;
  doneBy: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string | null;
  createdAt: number;
}

export interface TaskWithLeadRow extends TaskRow {
  leadStage: LeadStage;
  leadStudentName: string | null;
  leadContactName: string | null;
  leadGuardianName: string | null;
  leadPhone: string | null;
}

const SELECT = `
  SELECT t.*, u.display_name AS assignee_name
    FROM crm_tasks t LEFT JOIN users u ON u.id = t.assignee_id`;

function mapTask(row: Row): TaskRow {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    title: String(row.title),
    dueAt: Number(row.due_at),
    doneAt: int(row.done_at),
    doneBy: text(row.done_by),
    assigneeId: text(row.assignee_id),
    assigneeName: text(row.assignee_name),
    createdBy: text(row.created_by),
    createdAt: Number(row.created_at),
  };
}

export function insertTask(
  db: DatabaseSync,
  input: { id: string; leadId: string; title: string; dueAt: number; assigneeId: string | null; createdBy: string | null; now: number },
): TaskRow {
  db.prepare(
    "INSERT INTO crm_tasks (id, lead_id, title, due_at, assignee_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(input.id, input.leadId, input.title, input.dueAt, input.assigneeId, input.createdBy, input.now);
  const task = findTask(db, input.id);
  if (!task) throw new Error("insertTask: row missing after insert");
  return task;
}

export function findTask(db: DatabaseSync, id: string): TaskRow | null {
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id);
  return row ? mapTask(row) : null;
}

export function markTaskDone(db: DatabaseSync, id: string, doneBy: string, now: number): boolean {
  return Number(db.prepare("UPDATE crm_tasks SET done_at = ?, done_by = ? WHERE id = ? AND done_at IS NULL").run(now, doneBy, id).changes) > 0;
}

/** Open tasks first (by due date), then done tasks (most recent first). */
export function listLeadTasks(db: DatabaseSync, leadId: string): TaskRow[] {
  return db
    .prepare(
      `${SELECT} WHERE t.lead_id = ?
        ORDER BY t.done_at IS NOT NULL, CASE WHEN t.done_at IS NULL THEN t.due_at ELSE -t.done_at END, t.id`,
    )
    .all(leadId)
    .map(mapTask);
}

/** Earliest due date of the lead's open tasks (null when none). */
export function earliestOpenDue(db: DatabaseSync, leadId: string): number | null {
  return int(db.prepare("SELECT MIN(due_at) AS due FROM crm_tasks WHERE lead_id = ? AND done_at IS NULL").get(leadId)?.due);
}

/** Tasks assigned to a user, joined with their (non-erased) lead. */
export function listAssigneeTasks(
  db: DatabaseSync,
  input: { assigneeId: string; done: boolean; dueFrom?: number; dueBefore?: number; limit: number },
): TaskWithLeadRow[] {
  const where = ["t.assignee_id = ?", input.done ? "t.done_at IS NOT NULL" : "t.done_at IS NULL", "l.erased_at IS NULL"];
  const values: SQLInputValue[] = [input.assigneeId];
  if (input.dueFrom !== undefined) {
    where.push("t.due_at >= ?");
    values.push(input.dueFrom);
  }
  if (input.dueBefore !== undefined) {
    where.push("t.due_at < ?");
    values.push(input.dueBefore);
  }
  const order = input.done ? "t.done_at DESC, t.id" : "t.due_at ASC, t.id";
  return db
    .prepare(
      `SELECT t.*, u.display_name AS assignee_name, l.stage AS lead_stage, l.student_name AS lead_student_name,
              l.contact_name AS lead_contact_name, l.guardian_name AS lead_guardian_name, l.phone_e164 AS lead_phone
         FROM crm_tasks t
         JOIN crm_leads l ON l.id = t.lead_id
         LEFT JOIN users u ON u.id = t.assignee_id
        WHERE ${where.join(" AND ")}
        ORDER BY ${order} LIMIT ?`,
    )
    .all(...values, input.limit)
    .map((row) => ({
      ...mapTask(row),
      leadStage: String(row.lead_stage) as LeadStage,
      leadStudentName: text(row.lead_student_name),
      leadContactName: text(row.lead_contact_name),
      leadGuardianName: text(row.lead_guardian_name),
      leadPhone: text(row.lead_phone),
    }));
}

/** Erase (D-042): task titles are staff free text and may name the family; open tasks are closed. */
export function scrubTasks(db: DatabaseSync, leadId: string, replacement: string, now: number): number {
  return Number(
    db.prepare("UPDATE crm_tasks SET title = ?, done_at = COALESCE(done_at, ?) WHERE lead_id = ?").run(replacement, now, leadId)
      .changes,
  );
}
