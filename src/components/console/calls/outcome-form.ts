/**
 * Pure form logic of the call dialog and the WhatsApp "I sent it" step (docs/admin-phase-1b-plan.md
 * §5.C, §5.D; owner: 1B-CALLS). Client-safe and unit-tested: each function turns the form's raw
 * values into either a localisable issue or the exact `OutcomeInput` the server receives.
 */
import { htmlLang, type Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { CRM_TIME_ZONE, istDayKey, istDueAt } from "@/components/crm/format";
import type { ApiFailure } from "@/lib/auth/client-api";
import { offerNotReachable } from "@/lib/crm/console/followup/attempts";
import { callingHoursOn, isInsideHardWindow, outsideCallingHours } from "@/lib/crm/console/followup/presets";
import { suggestFollowUp, type RhythmSuggestion } from "@/lib/crm/console/followup/rhythm";
import { CALL_OUTCOMES, type FollowUpContextView } from "@/lib/crm/console/followup/types";
import type { FollowUpPreset, NextFollowUp, OutcomeInput, TemplateLang } from "@/lib/crm/console/types";
import type { ContactOutcome } from "@/lib/crm/types";
import type { CallsMessages } from "./messages";

export const OUTCOME_NOTE_MAX = 2000;
/** A picked time may be this far in the past (the server allows the same grace). */
const PAST_GRACE_MS = 5 * 60_000;

export type CallOutcomeChoice = (typeof CALL_OUTCOMES)[number] | "no_call";
/** The follow-up radio: a preset, "Pick a time", "Keep the existing follow-up", or none (closed enquiry). */
export type PickerChoice = FollowUpPreset | "pick" | "keep" | "none";

export interface PickerState {
  choice: PickerChoice | null;
  /** `YYYY-MM-DD` (India time) for "Pick a time". */
  date: string;
  /** `HH:MM` (India time). */
  time: string;
}

export type PickerIssue = "nextRequired" | "pickRequired" | "hardWindow" | "pastTime";

export const EMPTY_PICKER: PickerState = { choice: null, date: "", time: "" };

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
};

/** `HH:MM` in India time of an instant. */
export function istTimeKey(at: number): string {
  return new Date(at + (5 * 60 + 30) * 60_000).toISOString().slice(11, 16);
}

/** The rhythm suggestion for a chosen outcome (`no_call` = no contact), from the context's facts. */
export function suggestionFor(ctx: FollowUpContextView, outcome: CallOutcomeChoice | "message_sent" | null): RhythmSuggestion | null {
  if (outcome === null) return null;
  const now = ms(ctx.now) ?? Date.now();
  const value: ContactOutcome | null = outcome === "no_call" ? null : outcome;
  return suggestFollowUp({ outcome: value, stage: ctx.stage, now, hours: ctx.callingHours, facts: ctx.rhythm });
}

/** The picker pre-selected for a suggestion ("Pick a time" pre-filled with a suggested instant). */
export function pickerFromSuggestion(suggestion: RhythmSuggestion | null): PickerState {
  if (!suggestion) return EMPTY_PICKER;
  if (suggestion.choice === "pick") {
    return suggestion.at === null ? { choice: "pick", date: "", time: "" } : { choice: "pick", date: istDayKey(suggestion.at), time: istTimeKey(suggestion.at) };
  }
  return { choice: suggestion.choice, date: "", time: "" };
}

/** WhatsApp "Yes, I sent it": keep the existing follow-up when the lead has one, else Tomorrow (§5.D). */
export function whatsappDefaultPicker(ctx: Pick<FollowUpContextView, "openTask" | "stage">): PickerState {
  if (ctx.stage === "enrolled" || ctx.stage === "lost") return { choice: "none", date: "", time: "" };
  return { choice: ctx.openTask ? "keep" : "tomorrow", date: "", time: "" };
}

/** The instant a picker state points at (null for keep / none / an incomplete pick). */
export function pickerInstant(state: PickerState, ctx: Pick<FollowUpContextView, "presets">): number | null {
  if (state.choice === "later_today" || state.choice === "tomorrow" || state.choice === "in_3_days") return ms(ctx.presets[state.choice]);
  if (state.choice === "pick") return ms(istDueAt(state.date, state.time));
  return null;
}

/** The picker's live problem with a picked time (shown before saving), or null. */
export function pickerIssue(state: PickerState, ctx: Pick<FollowUpContextView, "presets" | "now">): PickerIssue | null {
  if (state.choice === null) return "nextRequired";
  if (state.choice !== "pick") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date) || !/^\d{2}:\d{2}$/.test(state.time)) return "pickRequired";
  const at = pickerInstant(state, ctx);
  if (at === null) return "pickRequired";
  if (!isInsideHardWindow(at)) return "hardWindow";
  const now = ms(ctx.now) ?? Date.now();
  if (at < now - PAST_GRACE_MS) return "pastTime";
  return null;
}

/** Whether the chosen time is outside LR's calling hours ("Save anyway?" — a warning only). */
export function pickerOutsideHours(state: PickerState, ctx: Pick<FollowUpContextView, "presets" | "callingHours">): boolean {
  const at = pickerInstant(state, ctx);
  return at !== null && isInsideHardWindow(at) && outsideCallingHours(ctx.callingHours, at);
}

/**
 * The "outside calling hours" warning for the CHOSEN day (not today): "Outside calling hours
 * (10:00–14:00). Save anyway?" with that day's window, or "No calling hours that day" when the day
 * is closed. Null when the chosen time is inside calling hours (or there is no time yet).
 */
export function outsideHoursText(
  state: PickerState,
  ctx: Pick<FollowUpContextView, "presets" | "callingHours">,
  c: Pick<CallsMessages["calls"], "outsideHours" | "outsideHoursClosed">,
): string | null {
  const at = pickerInstant(state, ctx);
  if (at === null || !pickerOutsideHours(state, ctx)) return null;
  const hours = callingHoursOn(ctx.callingHours, at);
  return hours === null ? c.outsideHoursClosed : format(c.outsideHours, { hours });
}

/** The picker as the server's `NextFollowUp`, or the issue to show. */
export function pickerToNext(
  state: PickerState,
  ctx: Pick<FollowUpContextView, "presets" | "now" | "stage">,
): { ok: true; next: NextFollowUp } | { ok: false; issue: PickerIssue } {
  const issue = pickerIssue(state, ctx);
  if (issue) return { ok: false, issue };
  switch (state.choice) {
    case "later_today":
    case "tomorrow":
    case "in_3_days":
      return { ok: true, next: { kind: "preset", preset: state.choice } };
    case "keep":
      return { ok: true, next: { kind: "none", reason: "has_other_task" } };
    case "none":
      return { ok: true, next: { kind: "none", reason: "closing" } };
    case "pick": {
      const at = istDueAt(state.date, state.time);
      return at ? { ok: true, next: { kind: "at", at } } : { ok: false, issue: "pickRequired" };
    }
    default:
      return { ok: false, issue: "nextRequired" };
  }
}

export interface CallFormState {
  outcome: CallOutcomeChoice | null;
  note: string;
  picker: PickerState;
  /** "Mark lost: wrong number" (ticked by default once Wrong number is chosen). */
  markWrongNumber: boolean;
  /** "Mark as not reachable" (only when offered). */
  markNotReachable: boolean;
}

export type CallFormIssue = "outcomeRequired" | "noteTooLong" | PickerIssue;

/** Whether the follow-up picker shows for this form (hidden for a wrong number or a not-reachable mark). */
export function pickerVisible(state: Pick<CallFormState, "outcome" | "markNotReachable">, ctx: Pick<FollowUpContextView, "attempts">): boolean {
  if (state.outcome === "wrong_number") return false;
  if (state.markNotReachable && notReachableOffered(state.outcome, ctx)) return false;
  return true;
}

export function notReachableOffered(outcome: CallOutcomeChoice | null, ctx: Pick<FollowUpContextView, "attempts">): boolean {
  if (outcome === null) return false;
  return offerNotReachable(ctx.attempts, outcome === "no_call" ? null : outcome);
}

/** The call dialog's request body, or the first issue to show. */
export function buildCallOutcome(
  state: CallFormState,
  ctx: FollowUpContextView,
  taskId: string | null,
): { ok: true; input: OutcomeInput } | { ok: false; issue: CallFormIssue } {
  if (state.outcome === null || (state.outcome === "no_call" && !taskId)) return { ok: false, issue: "outcomeRequired" };
  const note = state.note.trim();
  if (note.length > OUTCOME_NOTE_MAX) return { ok: false, issue: "noteTooLong" };
  const contact: OutcomeInput["contact"] = state.outcome === "no_call" ? null : { channel: "call", outcome: state.outcome, note: note || null };
  const base = { contact, taskId: taskId ?? null };
  if (state.outcome === "wrong_number") {
    return { ok: true, input: { ...base, next: { kind: "none", reason: "wrong_number" }, markLostWrongNumber: state.markWrongNumber } };
  }
  if (state.markNotReachable && notReachableOffered(state.outcome, ctx)) {
    return { ok: true, input: { ...base, next: { kind: "none", reason: "closing" }, markNotReachable: true } };
  }
  const next = pickerToNext(state.picker, ctx);
  if (!next.ok) return next;
  return { ok: true, input: { ...base, next: next.next } };
}

/**
 * The save was refused because the template is no longer approved (a super admin edited, sent back
 * or retired it while WhatsApp was open): 422 with a `contact.template` field error. The message was
 * really sent, so the composer offers to log it as the staff member's own message instead.
 */
export function templateRefused(failure: Pick<ApiFailure, "error" | "fieldErrors">): boolean {
  return failure.error === "validation" && Object.prototype.hasOwnProperty.call(failure.fieldErrors, "contact.template");
}

/** WhatsApp "Yes, I sent it": the logged contact (`message_sent`) with the template used, if any. */
export function buildWhatsAppSent(
  picker: PickerState,
  ctx: FollowUpContextView,
  template: { key: string; lang: TemplateLang } | null,
): { ok: true; input: OutcomeInput } | { ok: false; issue: PickerIssue } {
  const next = pickerToNext(picker, ctx);
  if (!next.ok) return next;
  return { ok: true, input: { contact: { channel: "whatsapp", outcome: "message_sent", template }, next: next.next } };
}

// ---------------------------------------------------------------------------------------------
// Labels

/** "Today 4:10 pm" / "Tomorrow 10:00 am" / "Thu, 23 Oct 10:00 am" (India time). */
export function whenLabel(at: number, now: number, locale: Locale, c: Pick<CallsMessages["calls"], "when">): string {
  const time = new Intl.DateTimeFormat(htmlLang[locale], { hour: "numeric", minute: "2-digit", timeZone: CRM_TIME_ZONE }).format(at);
  const day = istDayKey(at);
  if (day === istDayKey(now)) return format(c.when.today, { time });
  if (day === istDayKey(now + 86_400_000)) return format(c.when.tomorrow, { time });
  const date = new Intl.DateTimeFormat(htmlLang[locale], { weekday: "short", day: "numeric", month: "short", timeZone: CRM_TIME_ZONE }).format(at);
  return format(c.when.other, { day: date, time });
}

/** "Attempt 4 · 3 unanswered in a row" (the attempt being logged now = calls so far + 1). */
export function attemptText(attempts: { calls: number; unansweredStreak: number }, c: Pick<CallsMessages["calls"], "attempt" | "attemptFirst">): string {
  const n = attempts.calls + 1;
  return attempts.unansweredStreak > 0 ? format(c.attempt, { n, m: attempts.unansweredStreak }) : format(c.attemptFirst, { n });
}

/** The status line after saving (role="status"). */
export function savedMessage(
  input: OutcomeInput,
  result: { task: { dueAt: string } | null },
  now: number,
  locale: Locale,
  c: CallsMessages["calls"],
): string {
  if (input.markNotReachable || input.markLostWrongNumber) return c.savedLost;
  const due = ms(result.task?.dueAt);
  const fromTask = Boolean(input.taskId);
  if (due !== null) return format(fromTask ? c.savedTask : c.saved, { when: whenLabel(due, now, locale, c) });
  if (input.next.kind === "none" && input.next.reason === "has_other_task") return c.keptExisting;
  return fromTask ? c.savedTaskNoNext : c.savedNoNext;
}
