/**
 * The follow-up rhythm (docs/admin-phase-1b-plan.md §5.C, decision 9, O9; owner: 1B-CALLS). PURE
 * and client-safe: the dialog shows the suggestion as soon as "what happened" is chosen; the server
 * uses the same function for the context's default. A suggestion is only pre-selected; staff can
 * always choose another time.
 *
 * | After this contact                         | Suggestion                                   | Rule key                    |
 * | no_answer / busy                           | later_today                                  | retry                       |
 * | switched_off                               | tomorrow                                     | switched_off                |
 * | call_back_requested                        | Pick a time                                  | call_back                   |
 * | wrong_number                               | none (+ mark lost)                           | wrong_number                |
 * | connected, contacted (or new → contacted)  | day 2, 5, 10 after the first connected call  | contacted_d2 / _d5 / _d10   |
 * |                                            | past day 10 → in_3_days                      | contacted_later             |
 * | connected, counselling_booked              | tomorrow                                     | booked                      |
 * | connected, visited_or_demo                 | tomorrow, or in_3_days after a follow-up     | after_visit_d1 / _d3        |
 * | connected, applied / test_taken / offer    | tomorrow (offer call within 48 h)            | after_test                  |
 * | enrolled / lost                            | none                                         | closed                      |
 *
 * `message_sent` (a WhatsApp the staff member confirmed) and "no call needed" (`null`) follow the
 * stage rows like `connected`; on a `new` lead with no contact the suggestion is `later_today`.
 */
import type { CallingHours } from "../../lead-ops-types";
import { istDayNumber } from "../../sla/calling-hours";
import type { ContactOutcome, LeadStage } from "../../types";
import type { FollowUpPreset, NextFollowUp, RhythmRuleKey } from "../types";
import { followUpOnDay } from "./presets";
import type { RhythmFacts } from "./types";

/** What the picker pre-selects: a preset, "Pick a time" (with a suggested instant or empty), or no follow-up. */
export type SuggestedChoice = FollowUpPreset | "pick" | "none";

export interface RhythmSuggestion {
  choice: SuggestedChoice;
  /** The suggested instant for `pick` (contacted day 2 / 5 / 10), else null (call back: staff pick it). */
  at: number | null;
  ruleKey: RhythmRuleKey;
}

/** Days after the first connected call (decision 9). */
export const CONTACTED_DAYS = [
  [2, "contacted_d2"],
  [5, "contacted_d5"],
  [10, "contacted_d10"],
] as const satisfies readonly (readonly [number, RhythmRuleKey])[];

export interface RhythmInput {
  /** The outcome being recorded now; null = no contact ("No call needed (task done)"). */
  outcome: ContactOutcome | null;
  /** The lead's stage BEFORE this contact. */
  stage: LeadStage;
  now: number;
  hours: CallingHours;
  facts: RhythmFacts;
}

const preset = (choice: FollowUpPreset, ruleKey: RhythmRuleKey): RhythmSuggestion => ({ choice, at: null, ruleKey });

export function suggestFollowUp(input: RhythmInput): RhythmSuggestion {
  const { outcome, stage, now, hours, facts } = input;
  if (stage === "enrolled" || stage === "lost") return { choice: "none", at: null, ruleKey: "closed" };
  switch (outcome) {
    case "no_answer":
    case "busy":
      return preset("later_today", "retry");
    case "switched_off":
      return preset("tomorrow", "switched_off");
    case "call_back_requested":
      return { choice: "pick", at: null, ruleKey: "call_back" };
    case "wrong_number":
      return { choice: "none", at: null, ruleKey: "wrong_number" };
    default:
      break;
  }
  // connected, message_sent or no contact: by stage.
  if (stage === "new") {
    if (outcome === null) return preset("later_today", "retry");
    return contactedRhythm(now, hours, facts, now);
  }
  if (stage === "contacted") return contactedRhythm(now, hours, facts, facts.firstConnectedAt ?? (outcome === "connected" ? now : null));
  if (stage === "counselling_booked") return preset("tomorrow", "booked");
  if (stage === "visited_or_demo") return facts.contactsSinceVisit === 0 ? preset("tomorrow", "after_visit_d1") : preset("in_3_days", "after_visit_d3");
  return preset("tomorrow", "after_test");
}

/** Day 2, then 5, then 10 after the first connected call, at the preferred window; past day 10 → in 3 days. */
function contactedRhythm(now: number, hours: CallingHours, facts: RhythmFacts, firstConnectedAt: number | null): RhythmSuggestion {
  const firstDay = istDayNumber(firstConnectedAt ?? now);
  const today = istDayNumber(now);
  for (const [days, ruleKey] of CONTACTED_DAYS) {
    if (today < firstDay + days) return { choice: "pick", at: followUpOnDay(hours, firstDay + days, facts.preferredTime), ruleKey };
  }
  return preset("in_3_days", "contacted_later");
}

/**
 * The suggestion as CORE's `NextFollowUp` (for `FollowUpContext.suggested`), or null when staff must
 * pick the time themselves (call back) — the picker then focuses "Pick a time".
 */
export function suggestionToNext(suggestion: RhythmSuggestion): NextFollowUp | null {
  if (suggestion.choice === "none") return { kind: "none", reason: suggestion.ruleKey === "wrong_number" ? "wrong_number" : "closing" };
  if (suggestion.choice === "pick") return suggestion.at === null ? null : { kind: "at", at: new Date(suggestion.at).toISOString() };
  return { kind: "preset", preset: suggestion.choice };
}
