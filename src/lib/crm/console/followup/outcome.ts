import "server-only";

import { getDb } from "@/lib/db/connection";

import { canSeeLead, CRM_MESSAGES, fail, ok } from "../../access";
import { changeStage, logContact } from "../../leads";
import { cleanText } from "../../pure";
import { findPreferredTime, listContactEntries } from "../../repo/console-followup";
import { findLeadById } from "../../repo/leads";
import { findTask, listLeadTasks } from "../../repo/tasks";
import { getCallingHours, getSpeedRule } from "../../settings";
import { RETRY_TASK_TITLE } from "../../sla/followups";
import { completeTask, createTask } from "../../tasks";
import type { CrmResult, CrmViewer, LostReason } from "../../types";
import { requireOk, runAtomic } from "../atomic";
import { findApprovedTemplate } from "../templates/templates";
import { PREFERRED_TIMES, type OutcomeInput, type OutcomeResult, type PreferredTime } from "../types";
import { attemptSummary } from "./attempts";
import { isInsideHardWindow, outsideCallingHours, resolveNext, resolvePresets } from "./presets";
import { CALL_OUTCOMES, isUnansweredOutcome, WHATSAPP_OUTCOMES } from "./types";

/**
 * One-step call outcome (docs/admin-phase-1b-plan.md §5.C, D-079; owner: 1B-CALLS). One atomic
 * write (`runAtomic`), through the CRM services so lead routing's SLA hooks fire:
 *
 *   1. `taskId` → `completeTask` (the task must belong to this lead, else 422);
 *   2. unless "no follow-up" or a lost mark: resolve the time (preset or picked), check the
 *      08:00–21:00 IST limit, `createTask`. Created BEFORE the contact is logged, so lead routing's
 *      automatic "Call again" retry (skipped when an open task exists) never adds a second task;
 *   3. `contact` → `logContact` with `extra { template, lang }` (LR's first-call clock runs);
 *   4. `markNotReachable` / `markLostWrongNumber` → `changeStage(lost, not_reachable | wrong_number)`.
 *      When the logged call itself was unanswered, 4 runs BEFORE 3, so LR does not add a retry task
 *      to an enquiry that is being closed (LR skips retries on lost leads).
 *
 * The lost change is stamped 1 ms AFTER the call it follows (`at = now + 1` when a contact is
 * logged), whatever the write order: the timeline (newest first) and the lost review (§6.5: calls
 * with `at ≤` the lost change, the last outcome before it) read "the call, then lost" whether they
 * compare with `<` or `≤`. Known effect of running 4 before 3: LR's clock `attempts` counter does
 * not count that closing call (LR stops counting on lost leads); activity counts are unaffected.
 *
 * Any failure rolls every step back. Audits come from the services (task create / done, contact
 * log with the template key, stage change): ids and enum values only.
 */

export const OUTCOME_MESSAGES = {
  contactRequired: "Choose what happened.",
  outcomeChannel: "This outcome does not fit this kind of contact.",
  templateChannel: "Templates are only for WhatsApp messages.",
  templateNotApproved: "Only approved templates can be used.",
  taskNotOnLead: "This task does not belong to this enquiry.",
  nextRequired: "Choose when to follow up.",
  hardWindow: "No calls before 8 am or after 9 pm.",
  past: "Choose a time from now on.",
  bothMarks: "Choose one: not reachable or wrong number.",
  wrongNumberOnly: "Mark lost as wrong number only after a wrong-number call.",
  notReachableOnly: "Mark as not reachable only after an unanswered call.",
} as const;

/** A picked time may be up to this much in the past (the dialog was open for a while). */
export const PAST_GRACE_MS = 5 * 60_000;

/**
 * Follow-up titles are stored text read in both languages (like lead routing's retry title), so
 * they are bilingual and never contain family data.
 */
export const FOLLOW_UP_TITLES = {
  callAgain: RETRY_TASK_TITLE,
  callBack: "Call back as asked · कहे अनुसार वापस कॉल करें",
  whatsapp: "Follow up on the WhatsApp message · WhatsApp मैसेज पर फ़ॉलो-अप करें",
  followUp: "Follow-up call · फ़ॉलो-अप कॉल",
} as const;

export function defaultTaskTitle(contact: OutcomeInput["contact"]): string {
  if (!contact) return FOLLOW_UP_TITLES.followUp;
  if (contact.channel === "whatsapp") return FOLLOW_UP_TITLES.whatsapp;
  if (isUnansweredOutcome(contact.outcome)) return FOLLOW_UP_TITLES.callAgain;
  if (contact.outcome === "call_back_requested") return FOLLOW_UP_TITLES.callBack;
  return FOLLOW_UP_TITLES.followUp;
}

/** The services the outcome runs through (injectable so a test can make one step fail). */
export interface OutcomeServices {
  completeTask: typeof completeTask;
  createTask: typeof createTask;
  logContact: typeof logContact;
  changeStage: typeof changeStage;
}

const SERVICES: OutcomeServices = { completeTask, createTask, logContact, changeStage };

function asPreferredTime(value: string | null): PreferredTime | null {
  return value !== null && (PREFERRED_TIMES as readonly string[]).includes(value) ? (value as PreferredTime) : null;
}

export function recordOutcome(
  viewer: CrmViewer,
  leadId: string,
  input: OutcomeInput,
  now: number = Date.now(),
  services: OutcomeServices = SERVICES,
): CrmResult<OutcomeResult> {
  const db = getDb();
  const lead = findLeadById(db, leadId);
  if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
  if (lead.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);

  const errors: Record<string, string[]> = {};
  const contact = input.contact;
  const taskId = input.taskId ?? null;
  if (!contact && !taskId) errors.contact = [OUTCOME_MESSAGES.contactRequired];
  if (contact) {
    const allowed: readonly string[] = contact.channel === "call" ? CALL_OUTCOMES : WHATSAPP_OUTCOMES;
    if (!allowed.includes(contact.outcome)) errors["contact.outcome"] = [OUTCOME_MESSAGES.outcomeChannel];
    if (contact.template) {
      if (contact.channel !== "whatsapp") errors["contact.template"] = [OUTCOME_MESSAGES.templateChannel];
      else if (!findApprovedTemplate(db, contact.template.key)) errors["contact.template"] = [OUTCOME_MESSAGES.templateNotApproved];
    }
  }
  const markNotReachable = input.markNotReachable === true;
  const markWrongNumber = input.markLostWrongNumber === true;
  if (markNotReachable && markWrongNumber) errors.markNotReachable = [OUTCOME_MESSAGES.bothMarks];
  else if (markWrongNumber && contact?.outcome !== "wrong_number") errors.markLostWrongNumber = [OUTCOME_MESSAGES.wrongNumberOnly];
  else if (markNotReachable && contact && !isUnansweredOutcome(contact.outcome)) errors.markNotReachable = [OUTCOME_MESSAGES.notReachableOnly];
  if (taskId) {
    const task = findTask(db, taskId);
    if (!task || task.leadId !== lead.id) errors.taskId = [OUTCOME_MESSAGES.taskNotOnLead];
  }

  const lostReason: LostReason | null = markNotReachable ? "not_reachable" : markWrongNumber ? "wrong_number" : null;
  const hours = getCallingHours(db).value;
  let dueAt: number | null = null;
  if (input.next.kind === "none") {
    const otherOpenTasks = listLeadTasks(db, lead.id).filter((task) => task.doneAt === null && task.id !== taskId).length;
    const closed = lead.stage === "enrolled" || lead.stage === "lost";
    if (!(contact?.outcome === "wrong_number" || lostReason !== null || closed || otherOpenTasks > 0)) errors.next = [OUTCOME_MESSAGES.nextRequired];
  } else if (lostReason === null) {
    const presets = resolvePresets(hours, getSpeedRule(db).value, now, asPreferredTime(findPreferredTime(db, lead.id)));
    dueAt = resolveNext(input.next, presets);
    if (dueAt === null) errors.next = [OUTCOME_MESSAGES.nextRequired];
    else if (!isInsideHardWindow(dueAt)) errors.next = [OUTCOME_MESSAGES.hardWindow];
    else if (input.next.kind === "at" && dueAt < now - PAST_GRACE_MS) errors.next = [OUTCOME_MESSAGES.past];
  }
  if (Object.keys(errors).length > 0) return fail("validation", CRM_MESSAGES.validation, errors);

  const title = cleanText(input.nextTitle, 200) ?? defaultTaskTitle(contact);
  const markFirst = lostReason !== null && contact !== null && isUnansweredOutcome(contact.outcome);
  // "The call, then lost" in time order, even when the lost change is written first (see above).
  const lostAt = contact !== null ? now + 1 : now;
  return runAtomic(db, (): CrmResult<OutcomeResult> => {
    // 1. Tick the task off.
    const completedTaskId = taskId ? requireOk(services.completeTask(viewer, taskId, now)).id : null;
    // 2. The chosen follow-up, before the contact (one task per call).
    const task = dueAt !== null ? requireOk(services.createTask(viewer, lead.id, { title, dueAt }, now)) : null;
    // 3. (and 4.) The contact and the optional lost mark.
    if (lostReason && markFirst) requireOk(services.changeStage(viewer, lead.id, "lost", lostReason, lostAt));
    let activityId: number | null = null;
    if (contact) {
      const template = contact.channel === "whatsapp" && contact.template ? contact.template : null;
      const activity = requireOk(
        services.logContact(
          viewer,
          lead.id,
          { channel: contact.channel, outcome: contact.outcome, body: contact.note ?? null, extra: template ? { template: template.key, lang: template.lang } : null },
          now,
        ),
      );
      activityId = activity.id;
    }
    if (lostReason && !markFirst) requireOk(services.changeStage(viewer, lead.id, "lost", lostReason, lostAt));
    const fresh = findLeadById(db, lead.id);
    return ok({
      activityId,
      task,
      completedTaskId,
      attempts: attemptSummary(listContactEntries(db, lead.id)),
      stage: fresh?.stage ?? lead.stage,
      outsideCallingHours: dueAt !== null && outsideCallingHours(hours, dueAt),
    });
  });
}
