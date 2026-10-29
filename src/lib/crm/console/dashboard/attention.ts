import "server-only";

import { getDb } from "@/lib/db/connection";

import { leadScopeFor } from "../../access";
import { DAY_MS } from "../../pure";
import { countUnreviewedLostEvents } from "../../repo/console-family";
import { scopedLeadWhere } from "../../repo/leads";
import { findDisplayNames } from "../../repo/staff";
import type { CrmViewer, LeadFilters } from "../../types";
import { countForFilters, inboxHref } from "../counts";
import type { AttentionItem } from "../types";
import { LOST_REVIEW_PATH } from "./links";
import { numberFilters } from "./numbers";

/**
 * Needs attention (docs/admin-phase-1b-plan.md §5.A, §6.2; owner: 1B-NUMBERS): only rows with a
 * count above 0, each linking to its list.
 *
 * - `admin` (`/admin`): unassigned · free tool users waiting · not called within 24 h · overdue
 *   follow-up tasks per counsellor (top 8, then everyone) · lost enquiries to review;
 * - `crm` (`/crm/dashboard`): the same without unassigned and tool sign-ups, which lead routing's
 *   own tiles already show there.
 *
 * Inbox-linked counts use CORE's `countForFilters` with the exact filters of the link. Overdue rows
 * per person: `userId` = the person, `null` = nobody assigned; the closing "everyone" row has no
 * `userId` at all (undefined).
 */

export type AttentionVariant = "admin" | "crm";

/** Overdue rows per person before "everyone"; the lost-review window (days, O12). */
export const ATTENTION_TOP_PEOPLE = 8;
export const LOST_REVIEW_DAYS = 14;

/** The inbox filters behind the attention rows (plan §6.2). */
export function attentionFilters(): { unassigned: LeadFilters; toolSignups: LeadFilters; notCalled24: LeadFilters; overdue: LeadFilters } {
  const numbers = numberFilters();
  return {
    unassigned: { assignee: "unassigned", stage: "open", signups: "hide" },
    // Lead routing's own tool sign-up queue, used as is (unrouted sign-ups with an open stage).
    toolSignups: { area: "tool_signups", stage: "open" },
    notCalled24: numbers.notCalledOver24h,
    overdue: numbers.overdue,
  };
}

/**
 * Unreviewed lost events of the last 14 days in the viewer's scope: 1B-FAMILY's own count, the
 * same WHERE as the /crm/lost list it links to (a reason edit on a lead already lost is not an
 * event), so the number equals that list's length.
 */
export function lostToReviewCount(viewer: CrmViewer, now: number): number {
  return countUnreviewedLostEvents(getDb(), scopedLeadWhere(leadScopeFor(viewer)), { since: now - LOST_REVIEW_DAYS * DAY_MS, until: now });
}

/** The Needs attention rows for `viewer` (their scope) as of `now`. Reads only. */
export function needsAttention(viewer: CrmViewer, now: number, variant: AttentionVariant): AttentionItem[] {
  const db = getDb();
  const f = attentionFilters();
  const items: AttentionItem[] = [];
  const push = (item: AttentionItem) => {
    if (item.count > 0) items.push(item);
  };
  const linked = (kind: AttentionItem["kind"], filters: LeadFilters): AttentionItem => ({ kind, count: countForFilters(viewer, filters, now), href: inboxHref(filters) });

  if (variant === "admin") {
    push(linked("unassigned", f.unassigned));
    push(linked("tool_signups", f.toolSignups));
  }
  push(linked("not_called_24h", f.notCalled24));

  // Overdue follow-up tasks per person: the inbox count of number 3 split by assignee.
  const groups = countForFilters(viewer, f.overdue, now, "assignee").filter((group) => group.count > 0);
  const top = groups.slice(0, ATTENTION_TOP_PEOPLE);
  const names = findDisplayNames(db, top.flatMap((group) => (group.key === null ? [] : [group.key])));
  for (const group of top) {
    push({
      kind: "overdue_by_counsellor",
      count: group.count,
      href: inboxHref({ ...f.overdue, assignee: group.key ?? "unassigned" }),
      userId: group.key,
      name: group.key === null ? null : (names.get(group.key) ?? null),
    });
  }
  if (groups.length > 1) push(linked("overdue_by_counsellor", f.overdue));

  push({ kind: "lost_to_review", count: lostToReviewCount(viewer, now), href: LOST_REVIEW_PATH });
  return items;
}
