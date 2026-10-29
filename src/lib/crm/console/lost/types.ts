/**
 * Lost review — shapes shared by the API and the /crm/lost page (docs/admin-phase-1b-plan.md §5.H,
 * §6.5; owner: 1B-FAMILY). Client-safe.
 */
import type { LeadAssignee, LeadStage } from "../../types";

/** The review windows (days back from now); 14 by default (O12). */
export const LOST_REVIEW_DAYS = [7, 14, 30] as const;
export type LostReviewDays = (typeof LOST_REVIEW_DAYS)[number];
export const DEFAULT_LOST_REVIEW_DAYS: LostReviewDays = 14;
/** At most this many events are listed (newest first); the report says when there are more. */
export const LOST_REVIEW_MAX = 200;

export const LOST_REVIEW_DECISIONS = ["kept", "reopened"] as const;
export type LostReviewDecision = (typeof LOST_REVIEW_DECISIONS)[number];

/** Stages a lost enquiry may be reopened to: every open stage (never enrolled, never lost). */
export const REOPEN_STAGES = ["new", "contacted", "counselling_booked", "visited_or_demo", "applied", "test_taken", "offer"] as const satisfies readonly LeadStage[];
export type ReopenStage = (typeof REOPEN_STAGES)[number];

/** Follow-up of a reopened enquiry: a preset (resolved with lead routing's calling hours) or a picked time. */
export const REOPEN_FOLLOW_UP_PRESETS = ["tomorrow", "in_3_days", "later_today"] as const;
export type ReopenFollowUp = { kind: "preset"; preset: (typeof REOPEN_FOLLOW_UP_PRESETS)[number] } | { kind: "at"; at: string };

/** One lost event waiting for review (a lead lost twice and still lost gives two). */
export interface LostReviewItem {
  leadId: string;
  /** Best display name, or null. */
  name: string | null;
  /** When it was marked lost (the stage change's time; the review key). */
  lostAt: string;
  /** The stage it left (the default "Move back to"); null when unknown. */
  fromStage: LeadStage | null;
  reason: string | null;
  markedBy: { userId: string; name: string | null } | null;
  /** `call` entries before the lost change. */
  callsMade: number;
  /** Outcome of the latest call or WhatsApp before the lost change. */
  lastOutcome: string | null;
  /** Whole days from the enquiry to the lost change. */
  daysSinceEnquiry: number;
  assignee: LeadAssignee | null;
}

export interface LostReasonRow {
  /** Who marked the enquiries lost (null = the system). */
  userId: string | null;
  name: string | null;
  counts: Record<string, number>;
  total: number;
}

export interface LostReviewReport {
  days: LostReviewDays;
  /** Start of the window (ISO). */
  since: string;
  assignee: string | null;
  items: LostReviewItem[];
  /** More events than `LOST_REVIEW_MAX` exist. */
  truncated: boolean;
  /** "Lost reasons by counsellor": every lost event in the window, reviewed or not. */
  matrix: { reasons: string[]; rows: LostReasonRow[]; total: number };
}

export interface LostReviewInput {
  /** The event's `lostAt` exactly as listed (ISO). */
  lostAt: string;
  decision: LostReviewDecision;
  /** Reopen only: the stage to move back to (default: the stage it left, else Contacted). */
  reopenTo?: ReopenStage | null;
  /** Reopen only: hand the enquiry to this staff member (lead routing's assignment rules apply). */
  assigneeId?: string | null;
  /** Reopen only: when to follow up (default: tomorrow). */
  followUp?: ReopenFollowUp | null;
}

export interface LostReviewResult {
  leadId: string;
  lostAt: string;
  decision: LostReviewDecision;
  stage: LeadStage;
  /** The follow-up created when reopened. */
  taskId: string | null;
}
