/**
 * One-step call outcome (docs/admin-phase-1b-plan.md §5.C; owner: 1B-CALLS) — view types that
 * EXTEND CORE's frozen `FollowUpContext` (src/lib/crm/console/types.ts) with what the dialog
 * needs to work out the suggestion and the "outside calling hours" warning in the browser.
 * CLIENT-SAFE: types and constants only.
 */
import type { CallingHours } from "../../lead-ops-types";
import type { ContactOutcome } from "../../types";
import type { FollowUpContext, PreferredTime, TemplateLang, TemplateSlotValues } from "../types";

/** Facts the rhythm table (§5.C) reads, gathered from the lead's timeline by the context builder. */
export interface RhythmFacts {
  /** The first call / WhatsApp with outcome `connected` (epoch ms), or null. */
  firstConnectedAt: number | null;
  /** The latest move to `visited_or_demo` (epoch ms), or null. */
  visitedAt: number | null;
  /** Calls and WhatsApps logged after `visitedAt` (0 when there was no visit). */
  contactsSinceVisit: number;
  /** The family's best time to call (`crm_lead_details.preferred_time`), or null when not recorded. */
  preferredTime: PreferredTime | null;
}

/** GET /api/crm/leads/[leadId]/outcome → this (CORE's `FollowUpContext` plus the fields below). */
export interface FollowUpContextView extends FollowUpContext {
  leadId: string;
  /** LR's calling hours (not secret): the browser checks a picked time against them. */
  callingHours: CallingHours;
  rhythm: RhythmFacts;
  /** Auto-filled template slots per language (the centre's name differs between English and Hindi). */
  slotsByLang: Record<TemplateLang, TemplateSlotValues>;
  /** The task being ticked off (opened from its Done button), or null. Never counted in `openTask`. */
  completingTask: { id: string; title: string } | null;
}

/** Outcomes a staff member can record for a CALL in the dialog (the order of the tiles). */
export const CALL_OUTCOMES = ["connected", "no_answer", "busy", "switched_off", "call_back_requested", "wrong_number"] as const satisfies readonly ContactOutcome[];
/** Outcomes a WhatsApp entry may carry (the composer only ever sends `message_sent`). */
export const WHATSAPP_OUTCOMES = ["message_sent", "connected", "wrong_number"] as const satisfies readonly ContactOutcome[];
/** "Nobody picked up" outcomes: they count towards the unanswered streak. */
export const UNANSWERED_OUTCOMES = ["no_answer", "busy", "switched_off"] as const satisfies readonly ContactOutcome[];

export function isUnansweredOutcome(outcome: string | null | undefined): boolean {
  return typeof outcome === "string" && (UNANSWERED_OUTCOMES as readonly string[]).includes(outcome);
}
