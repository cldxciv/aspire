import "server-only";

import { getDb } from "@/lib/db/connection";

import { assignableMember, canSeeLead, CRM_MESSAGES, fail, leadScopeFor, ok } from "../../access";
import { assignLead, changeStage, leadDisplayName } from "../../leads";
import { DAY_MS, parseTime, toIso } from "../../pure";
import { findPreferredTime } from "../../repo/console-followup";
import {
  findLeadPlacements,
  findLostEvent,
  insertLostReview,
  isLostEventReviewed,
  listUnreviewedLostEvents,
  lostReasonCounts,
  type LostEventRow,
} from "../../repo/console-family";
import { findLeadById, scopedLeadWhere } from "../../repo/leads";
import { listAssignableStaff } from "../../repo/staff";
import { getCallingHours, getSpeedRule } from "../../settings";
import { createTask } from "../../tasks";
import { isLeadStage, LOST_REASONS, type CrmResult, type CrmViewer, type LeadStage } from "../../types";
import { requireOk, runAtomic } from "../atomic";
import { CONSOLE_AUDIT, consoleAudit } from "../audit";
import { isInsideHardWindow, resolveNext, resolvePresets } from "../followup/presets";
import { PREFERRED_TIMES, type PreferredTime } from "../types";
import {
  DEFAULT_LOST_REVIEW_DAYS,
  LOST_REVIEW_DAYS,
  LOST_REVIEW_MAX,
  REOPEN_STAGES,
  type LostReasonRow,
  type LostReviewDays,
  type LostReviewInput,
  type LostReviewItem,
  type LostReviewReport,
  type LostReviewResult,
  type ReopenFollowUp,
  type ReopenStage,
} from "./types";

/**
 * Lost review (docs/admin-phase-1b-plan.md §5.H, §6.5, D-081; owner: 1B-FAMILY). Area heads (their
 * scope) and admins (everything) go through the enquiries marked lost in the last 7 / 14 / 30 days
 * and either keep each one lost or reopen it. One review per lost EVENT (`crm_lost_reviews`, keyed
 * by the stage change's time). Reopening is one atomic write through the CRM services, so lead
 * routing's hooks fire: stage back → optional new assignee → a follow-up task → the review row.
 * Counsellors get 403. Audited `crm.lost_review { decision }` (no names, no reasons, no text).
 */

export const LOST_MESSAGES = {
  notLost: "This enquiry is no longer lost. Refresh the page.",
  eventNotFound: "That lost entry was not found. Refresh the page.",
  alreadyReviewed: "Someone has already reviewed this. Refresh the page.",
  hardWindow: "No calls before 8 am or after 9 pm.",
  past: "Choose a time from now on.",
  followUp: "Choose when to follow up.",
} as const;

/** Follow-up task title: stored text read in both languages, never family data (like 1B-CALLS's titles). */
export const REOPEN_TASK_TITLE = "Follow up after reopening · फिर से खोलने के बाद फ़ॉलो-अप";

/** A picked time may be up to this much in the past (the dialog was open for a while). */
const PAST_GRACE_MS = 5 * 60_000;

/** The review window from an untrusted value (7, 14 or 30; else 14). */
export function lostReviewDays(value: unknown): LostReviewDays {
  const number = typeof value === "string" ? Number(value) : value;
  return (LOST_REVIEW_DAYS as readonly unknown[]).includes(number) ? (number as LostReviewDays) : DEFAULT_LOST_REVIEW_DAYS;
}

function mayReview(viewer: CrmViewer): boolean {
  return viewer.role === "admin" || viewer.role === "manager";
}

function toItem(row: LostEventRow): LostReviewItem {
  return {
    leadId: row.leadId,
    name: leadDisplayName(row),
    lostAt: toIso(row.lostAt),
    fromStage: isLeadStage(row.fromStage) && row.fromStage !== "lost" ? row.fromStage : null,
    reason: row.reason,
    markedBy: row.actorId ? { userId: row.actorId, name: row.actorName } : null,
    callsMade: row.callsMade,
    lastOutcome: row.lastOutcome,
    daysSinceEnquiry: Math.max(0, Math.floor((row.lostAt - row.leadCreatedAt) / DAY_MS)),
    assignee: row.assignedTo ? { userId: row.assignedTo, displayName: row.assigneeName ?? "" } : null,
  };
}

/**
 * The review list (§6.5): unreviewed lost events in the last `days` days on live leads in scope
 * that are still lost, newest first (at most 200), plus the "lost reasons by counsellor" matrix
 * over every lost event in the window. `assignee` (a staff id or `unassigned`) narrows both to the
 * leads that person holds now.
 */
export function lostReview(
  viewer: CrmViewer,
  options: { days?: LostReviewDays; assignee?: string | null } = {},
  now: number = Date.now(),
): CrmResult<LostReviewReport> {
  if (!mayReview(viewer)) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  const days = options.days ?? DEFAULT_LOST_REVIEW_DAYS;
  const since = now - days * DAY_MS;
  const assignee = options.assignee && /^[A-Za-z0-9_-]{1,64}$/.test(options.assignee) ? options.assignee : undefined;
  const scope = scopedLeadWhere(leadScopeFor(viewer));
  const filter = { since, until: now, assignee };
  const rows = listUnreviewedLostEvents(db, scope, filter, LOST_REVIEW_MAX + 1);

  const byPerson = new Map<string, LostReasonRow>();
  const seen = new Set<string>();
  let total = 0;
  for (const entry of lostReasonCounts(db, scope, filter)) {
    const key = entry.actorId ?? "";
    const row = byPerson.get(key) ?? { userId: entry.actorId, name: entry.actorName, counts: {}, total: 0 };
    row.counts[entry.reason] = (row.counts[entry.reason] ?? 0) + entry.count;
    row.total += entry.count;
    total += entry.count;
    seen.add(entry.reason);
    byPerson.set(key, row);
  }
  const order: readonly string[] = [...LOST_REASONS, "unspecified"];
  const reasons = [...seen].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib) || a.localeCompare(b);
  });

  return ok({
    days,
    since: toIso(since),
    assignee: assignee ?? null,
    items: rows.slice(0, LOST_REVIEW_MAX).map(toItem),
    truncated: rows.length > LOST_REVIEW_MAX,
    matrix: { reasons, rows: [...byPerson.values()].sort((a, b) => b.total - a.total || (a.name ?? "").localeCompare(b.name ?? "")), total },
  });
}

/** Staff ids for the /crm/lost page's pickers (ids only; the page adds the names). */
export interface LostReviewStaff {
  /** Per listed enquiry: who this viewer may hand it to on Reopen. */
  byLead: Record<string, string[]>;
  /** The counsellor filter: the people in this viewer's scope; null = everyone (admins, unscoped area heads). */
  filter: string[] | null;
}

/**
 * Who the /crm/lost pickers offer (§5.H). "Assign to" on Reopen lists, per enquiry, only the staff
 * lead routing's `assignableMember` lets this viewer hand it to: the rule `assignLead` re-checks,
 * so the dialog never offers someone the server refuses. The counsellor filter lists the people
 * eligible for any enquiry in the viewer's areas or centres, and the viewer. Computed once per
 * (centre, area) pair. Area heads and admins only (403).
 */
export function lostReviewStaff(viewer: CrmViewer, leadIds: readonly string[]): CrmResult<LostReviewStaff> {
  if (!mayReview(viewer)) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  const staff = listAssignableStaff(db);
  const everyone = staff.map((member) => member.userId);
  const cache = new Map<string, string[]>();
  const eligible = (lead: { centreSlug: string | null; areaId: string | null }): string[] => {
    // `assignableMember` lets anyone but an area head hand a lead to every assignable member.
    if (viewer.role !== "manager") return everyone;
    const key = `${lead.centreSlug ?? ""}\u0000${lead.areaId ?? ""}`;
    let ids = cache.get(key);
    if (!ids) {
      ids = staff.filter((member) => assignableMember(db, viewer, member.userId, lead) !== null).map((member) => member.userId);
      cache.set(key, ids);
    }
    return ids;
  };
  const byLead: Record<string, string[]> = {};
  for (const [leadId, placement] of findLeadPlacements(db, leadIds)) byLead[leadId] = eligible(placement);

  let filter: string[] | null = null;
  const areaIds = viewer.areaScope?.areaIds ?? [];
  const centreSlugs = [...new Set([...(viewer.areaScope?.centreSlugs ?? []), ...viewer.centreSlugs])];
  // Same test as `leadScopeFor`: an area head with areas, or a legacy one with a centre scope.
  if (viewer.role === "manager" && (viewer.areaScope || viewer.centreSlugs.length > 0)) {
    const ids = new Set<string>([viewer.userId]);
    for (const areaId of areaIds) for (const id of eligible({ centreSlug: null, areaId })) ids.add(id);
    for (const centreSlug of centreSlugs) for (const id of eligible({ centreSlug, areaId: null })) ids.add(id);
    filter = [...ids];
  }
  return ok({ byLead, filter });
}

/** The services a reopen runs through (injectable so a test can make one step fail). */
export interface LostReviewServices {
  changeStage: typeof changeStage;
  assignLead: typeof assignLead;
  createTask: typeof createTask;
}

const SERVICES: LostReviewServices = { changeStage, assignLead, createTask };

function asPreferredTime(value: string | null): PreferredTime | null {
  return value !== null && (PREFERRED_TIMES as readonly string[]).includes(value) ? (value as PreferredTime) : null;
}

/**
 * Keep lost, or reopen, ONE lost event (`lostAt` exactly as listed). Area heads and admins only
 * (403); the lead must be visible (404), not erased (409), still lost (409) and the event not yet
 * reviewed (409). Reopen runs in `runAtomic`: `changeStage(reopenTo)` → `assignLead` (when another
 * person is chosen; lead routing's `assignableMember` decides who is eligible) → `createTask`
 * (default tomorrow at the family's preferred time, inside 08:00–21:00 IST) → the review row. Any
 * failure rolls every step back.
 */
export function reviewLost(
  viewer: CrmViewer,
  leadId: string,
  input: LostReviewInput,
  now: number = Date.now(),
  services: LostReviewServices = SERVICES,
): CrmResult<LostReviewResult> {
  if (!mayReview(viewer)) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  const lead = findLeadById(db, leadId);
  if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
  if (lead.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);
  const lostAt = parseTime(input.lostAt);
  const event = lostAt === null ? null : findLostEvent(db, leadId, lostAt);
  if (lostAt === null || !event) return fail("not_found", LOST_MESSAGES.eventNotFound);
  if (lead.stage !== "lost") return fail("conflict", LOST_MESSAGES.notLost);
  if (isLostEventReviewed(db, leadId, lostAt)) return fail("conflict", LOST_MESSAGES.alreadyReviewed);

  const audit = (decision: "kept" | "reopened") =>
    consoleAudit(db, { actorId: viewer.userId, action: CONSOLE_AUDIT.lostReview, target: leadId, details: { decision }, now });

  if (input.decision === "kept") {
    return runAtomic(db, (): CrmResult<LostReviewResult> => {
      if (!insertLostReview(db, { leadId, lostAt, decision: "kept", actorId: viewer.userId, now })) return fail("conflict", LOST_MESSAGES.alreadyReviewed);
      audit("kept");
      return ok({ leadId, lostAt: toIso(lostAt), decision: "kept", stage: lead.stage, taskId: null });
    });
  }

  const fromStage = event.fromStage;
  const reopenTo: ReopenStage =
    input.reopenTo ?? ((REOPEN_STAGES as readonly string[]).includes(fromStage ?? "") ? (fromStage as ReopenStage) : "contacted");
  const followUp: ReopenFollowUp = input.followUp ?? { kind: "preset", preset: "tomorrow" };
  const presets = resolvePresets(getCallingHours(db).value, getSpeedRule(db).value, now, asPreferredTime(findPreferredTime(db, leadId)));
  const dueAt = resolveNext(followUp, presets);
  const errors: Record<string, string[]> = {};
  if (dueAt === null) errors.followUp = [LOST_MESSAGES.followUp];
  else if (!isInsideHardWindow(dueAt)) errors.followUp = [LOST_MESSAGES.hardWindow];
  else if (followUp.kind === "at" && dueAt < now - PAST_GRACE_MS) errors.followUp = [LOST_MESSAGES.past];
  if (Object.keys(errors).length > 0 || dueAt === null) return fail("validation", CRM_MESSAGES.validation, errors);
  const assigneeId = input.assigneeId ?? null;

  return runAtomic(db, (): CrmResult<LostReviewResult> => {
    const reopened = requireOk(services.changeStage(viewer, leadId, reopenTo as LeadStage, null, now));
    if (assigneeId && assigneeId !== reopened.assignee?.userId) requireOk(services.assignLead(viewer, leadId, assigneeId, now));
    const task = requireOk(services.createTask(viewer, leadId, { title: REOPEN_TASK_TITLE, dueAt }, now));
    if (!insertLostReview(db, { leadId, lostAt, decision: "reopened", actorId: viewer.userId, now })) return fail("conflict", LOST_MESSAGES.alreadyReviewed);
    audit("reopened");
    return ok({ leadId, lostAt: toIso(lostAt), decision: "reopened", stage: reopenTo, taskId: task.id });
  });
}
