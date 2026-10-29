/**
 * Possible duplicates — shapes shared by the API and the lead page (docs/admin-phase-1b-plan.md
 * §5.F; owner: 1B-FAMILY). Client-safe.
 */
import type { LeadAssignee, LeadStage } from "../../types";

/**
 * Why a lead is suggested: (a) the numbers — `same_alt_phone` (both second numbers match),
 * `main_is_alt` (their main number is this family's second number), `alt_is_main` (their second
 * number is this family's main number); (b) `same_name_class_centre`.
 */
export const DUPLICATE_REASONS = ["same_alt_phone", "main_is_alt", "alt_is_main", "same_name_class_centre"] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];

/** At most this many suggestions per lead. */
export const DUPLICATES_MAX = 5;

/** One suggested lead (always one the viewer can see; an unseen lead is never mentioned). */
export interface DuplicateMatch {
  leadId: string;
  /** Best display name (student, contact form name, guardian), or null. */
  name: string | null;
  stage: LeadStage;
  /** The effective centre (own centre, else the routing area's centre). */
  centreSlug: string | null;
  assignee: LeadAssignee | null;
  createdAt: string;
  reasons: DuplicateReason[];
  /** The viewer may mark the pair "Not the same family" (sees both, and is admin, manager or the assignee of either). */
  canDismiss: boolean;
}

export interface DuplicateDismissal {
  leadId: string;
  otherLeadId: string;
  /** False when the pair was already marked. */
  dismissed: boolean;
}
