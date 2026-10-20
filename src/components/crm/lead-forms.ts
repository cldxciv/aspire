/**
 * Pure form logic behind the lead-detail islands (client-safe, unit-tested): each turns the
 * form's raw values into either a localisable validation issue or the exact CRM request.
 */
import { CONTACT_CHANNELS, isLeadStage, isLostReason, type ContactChannel, type ContactOutcome, type LeadStage } from "@/lib/crm/types";
import { crmRequests, type CrmRequest } from "./api";
import { istDueAt } from "./format";
import { OUTCOMES_BY_CHANNEL } from "./types";

export const NOTE_MAX = 2000;
export const TASK_TITLE_MAX = 200;

export type FormResult<Issue extends string> = { ok: true; request: CrmRequest } | { ok: false; issue: Issue };

/** Stage change: moving to `lost` needs a reason; anything else goes straight through. */
export function stageChangeRequest(
  leadId: string,
  stage: string,
  lostReason?: string,
): FormResult<"invalidStage" | "reasonRequired"> {
  if (!isLeadStage(stage)) return { ok: false, issue: "invalidStage" };
  if (stage === "lost") {
    if (!isLostReason(lostReason)) return { ok: false, issue: "reasonRequired" };
    return { ok: true, request: crmRequests.changeStage(leadId, "lost", lostReason) };
  }
  return { ok: true, request: crmRequests.changeStage(leadId, stage) };
}

/** Whether choosing `next` from `current` must open the lost-reason dialog first. */
export function needsLostReason(current: LeadStage, next: string): boolean {
  return next === "lost" && current !== "lost";
}

export function isContactChannel(value: unknown): value is ContactChannel {
  return typeof value === "string" && (CONTACT_CHANNELS as readonly string[]).includes(value);
}

/** "Log this call / message": channel + an outcome valid for it + optional note. */
export function logContactRequest(
  leadId: string,
  input: { channel: string; outcome: string; note?: string },
): FormResult<"outcomeRequired" | "noteTooLong"> {
  if (!isContactChannel(input.channel)) return { ok: false, issue: "outcomeRequired" };
  const outcomes = OUTCOMES_BY_CHANNEL[input.channel] as readonly string[];
  if (!outcomes.includes(input.outcome)) return { ok: false, issue: "outcomeRequired" };
  if ((input.note ?? "").trim().length > NOTE_MAX) return { ok: false, issue: "noteTooLong" };
  return {
    ok: true,
    request: crmRequests.logContact(leadId, { channel: input.channel, outcome: input.outcome as ContactOutcome, note: input.note }),
  };
}

export function noteRequest(leadId: string, body: string): FormResult<"required" | "tooLong"> {
  const text = body.trim();
  if (!text) return { ok: false, issue: "required" };
  if (text.length > NOTE_MAX) return { ok: false, issue: "tooLong" };
  return { ok: true, request: crmRequests.addNote(leadId, text) };
}

export function taskRequest(
  leadId: string,
  input: { title: string; date: string; time?: string },
): FormResult<"titleRequired" | "dueRequired"> {
  const title = input.title.trim();
  if (!title || title.length > TASK_TITLE_MAX) return { ok: false, issue: "titleRequired" };
  const dueAt = istDueAt(input.date, input.time);
  if (!dueAt) return { ok: false, issue: "dueRequired" };
  return { ok: true, request: crmRequests.createTask(leadId, { title, dueAt }) };
}
