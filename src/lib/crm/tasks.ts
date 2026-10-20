import "server-only";

import { randomUUID } from "node:crypto";

import { getDb, withTransaction } from "@/lib/db/connection";

import { assignableMember, canSeeLead, CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, ok } from "./access";
import { leadDisplayName, toLeadTask } from "./leads";
import { cleanText, DAY_MS, istDayBounds, maskPhone, parseTime, phoneLastDigits, toIso } from "./pure";
import { insertActivity } from "./repo/activities";
import { findLeadById, updateLead } from "./repo/leads";
import { earliestOpenDue, findTask, insertTask, listAssigneeTasks, markTaskDone } from "./repo/tasks";
import { TASK_RANGES, type CrmResult, type CrmViewer, type LeadTask, type MyTask, type TaskRange } from "./types";

/** Follow-up tasks (D-040): due dates, "today / overdue" views. */

export const TASK_TITLE_MAX = 200;
const MAX_FUTURE_MS = 2 * 365 * DAY_MS;

/**
 * Creates a follow-up on a lead the viewer can see. Assignee: `assigneeId` (admin / manager may
 * pick any assignable staff member; counsellors only themselves), else the lead's assignee, else
 * the viewer. `dueAt` must lie between one day ago and two years ahead.
 */
export function createTask(
  viewer: CrmViewer,
  leadId: string,
  input: { title: string; dueAt: string | number; assigneeId?: string | null },
  now: number = Date.now(),
): CrmResult<LeadTask> {
  const fieldErrors: Record<string, string[]> = {};
  const title = cleanText(input.title, TASK_TITLE_MAX);
  if (!title) fieldErrors.title = ["Describe the follow-up."];
  const dueAt = parseTime(input.dueAt);
  if (dueAt === null || dueAt < now - DAY_MS || dueAt > now + MAX_FUTURE_MS) fieldErrors.dueAt = ["Choose a due date."];
  if (Object.keys(fieldErrors).length > 0 || !title || dueAt === null) {
    return fail("validation", CRM_MESSAGES.validation, fieldErrors);
  }

  const db = getDb();
  return withTransaction(db, (): CrmResult<LeadTask> => {
    const lead = findLeadById(db, leadId);
    if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
    if (lead.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);

    let assigneeId = lead.assignedTo ?? viewer.userId;
    if (input.assigneeId && input.assigneeId !== viewer.userId) {
      if (viewer.role === "counsellor") return fail("forbidden", CRM_MESSAGES.forbidden);
      if (!assignableMember(db, viewer, input.assigneeId, lead.centreSlug)) {
        return fail("validation", CRM_MESSAGES.validation, { assigneeId: ["Choose an active staff member."] });
      }
      assigneeId = input.assigneeId;
    } else if (input.assigneeId === viewer.userId || viewer.role === "counsellor") {
      assigneeId = viewer.userId;
    }

    const task = insertTask(db, { id: randomUUID(), leadId, title, dueAt, assigneeId, createdBy: viewer.userId, now });
    updateLead(db, leadId, { nextTaskDueAt: earliestOpenDue(db, leadId), updatedAt: now, lastActivityAt: now });
    insertActivity(db, {
      leadId,
      type: "task_created",
      meta: { taskId: task.id, dueAt: toIso(dueAt), assigneeId },
      actorId: viewer.userId,
      at: now,
    });
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.taskCreate, target: leadId, details: { taskId: task.id }, now });
    return ok(toLeadTask(task, now));
  });
}

/** Marks a task done (idempotent). Allowed for its assignee and anyone who can see the lead. */
export function completeTask(viewer: CrmViewer, taskId: string, now: number = Date.now()): CrmResult<LeadTask> {
  const db = getDb();
  return withTransaction(db, (): CrmResult<LeadTask> => {
    const task = findTask(db, taskId);
    if (!task) return fail("not_found", CRM_MESSAGES.taskNotFound);
    const lead = findLeadById(db, task.leadId);
    if (!lead || (!canSeeLead(viewer, lead) && task.assigneeId !== viewer.userId)) {
      return fail("not_found", CRM_MESSAGES.taskNotFound);
    }
    if (lead.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);
    if (task.doneAt !== null) return ok(toLeadTask(task, now));

    markTaskDone(db, taskId, viewer.userId, now);
    updateLead(db, lead.id, { nextTaskDueAt: earliestOpenDue(db, lead.id), updatedAt: now, lastActivityAt: now });
    insertActivity(db, { leadId: lead.id, type: "task_done", meta: { taskId }, actorId: viewer.userId, at: now });
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.taskDone, target: lead.id, details: { taskId }, now });
    const fresh = findTask(db, taskId);
    return fresh ? ok(toLeadTask(fresh, now)) : fail("not_found", CRM_MESSAGES.taskNotFound);
  });
}

export function isTaskRange(value: unknown): value is TaskRange {
  return typeof value === "string" && (TASK_RANGES as readonly string[]).includes(value);
}

/**
 * The viewer's own tasks: `today` (due this Asia/Kolkata day, open), `overdue` (open, due before
 * now), `upcoming` (open, due from now), `open` (all open), `done` (latest 100). Tasks on leads the
 * viewer can no longer see (reassigned away) are left out.
 */
export function myTasks(viewer: CrmViewer, range: TaskRange = "open", now: number = Date.now()): MyTask[] {
  const db = getDb();
  const { start, end } = istDayBounds(now);
  const window =
    range === "today"
      ? { dueFrom: start, dueBefore: end }
      : range === "overdue"
        ? { dueBefore: now }
        : range === "upcoming"
          ? { dueFrom: now }
          : {};
  const rows = listAssigneeTasks(db, {
    assigneeId: viewer.userId,
    done: range === "done",
    ...window,
    limit: range === "done" ? 100 : 500,
  });
  const result: MyTask[] = [];
  for (const row of rows) {
    const lead = findLeadById(db, row.leadId);
    if (!lead || !canSeeLead(viewer, lead)) continue;
    result.push({
      ...toLeadTask(row, now),
      leadDisplayName: leadDisplayName({
        studentName: row.leadStudentName,
        contactName: row.leadContactName,
        guardianName: row.leadGuardianName,
      }),
      leadStage: row.leadStage,
      leadPhone: maskPhone(row.leadPhone),
      leadPhoneLast4: phoneLastDigits(row.leadPhone),
    });
  }
  return result;
}
