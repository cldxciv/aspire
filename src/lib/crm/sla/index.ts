import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { ContactLogVia } from "../lead-ops-types";
import { findLeadById } from "../repo/leads";
import { bumpClockAttempts, findClockById, listOpenClockTimes, markClockReached, updateClockTimes } from "../repo/sla";
import { closeClock, findLatestClock, findOpenClock, insertClock, resolveClock, type ClockRow } from "../repo/sla-core";
import { stageOrdinal, type ContactOutcome, type LeadStage } from "../types";
import { workingMsBetween } from "./calling-hours";
import { maybeCreateRetry } from "./followups";
import { holderAt } from "./holder";
import { clockAllowed, clockTimes, loadPolicy } from "./policy";

/**
 * SEAM `@/lib/crm/sla` (docs/lead-routing-plan.md §14.3, §15, D-046; owner LR-SLA, replacing
 * LR-CORE's stub). The SIGNATURES are frozen: CORE calls them from `arrival.ts`, `leads.ts`
 * (`logContact`, `changeStage`) and `admin.ts` (`eraseLead`), always inside the caller's
 * transaction. Nothing here sends anything (D-041); nothing here writes an activity or an audit
 * row except the retry task (`createFollowUpTask`, audited `crm.task_create { auto: true }`).
 *
 * - `startSlaClock`: one open clock per lead; policy (sources, tool sign-ups) or the CSV override;
 *   start = `arrivedAt` (Meta: the inbox `received_at`); due / alert times in working minutes.
 * - `onContactLogged`: the first qualifying HUMAN contact resolves the clock (met / late, working
 *   time, the holder at due time); later attempts are counted, "reached" is noted, unanswered calls
 *   get a "Call again" task. MCP (`via: "mcp"`) never touches a clock (L3).
 * - `closeSlaClock`: lost → `closed`; erase → `erased`. Reassignment never resets a clock.
 * - `recomputeOpenClocks`: after a policy change, from each clock's start.
 */

/** Starts a first-call clock when the policy (or the CSV `override`) says so. True = started. */
export function startSlaClock(
  db: DatabaseSync,
  a: {
    leadId: string;
    source: string;
    gate: boolean;
    manual: boolean;
    reason: "new" | "reopened" | "import";
    arrivedAt: number;
    at: number;
    override?: boolean;
  },
): boolean {
  const lead = findLeadById(db, a.leadId);
  if (!lead || lead.erasedAt !== null || lead.stage === "lost" || lead.stage === "enrolled") return false;
  if (findOpenClock(db, a.leadId)) return false;
  const policy = loadPolicy(db);
  if (!clockAllowed(policy.rule, { source: a.source, gate: a.gate, override: a.override })) return false;
  // A late-processed lead is honestly late (Meta: received_at); never a start in the future.
  const startedAt = Number.isFinite(a.arrivedAt) ? Math.min(a.arrivedAt, a.at) : a.at;
  const times = clockTimes(policy, startedAt);
  insertClock(db, { leadId: a.leadId, reason: a.reason, source: a.source, startedAt, ...times, policyVersion: policy.version });
  return true;
}

function isReached(c: { channel: "call" | "whatsapp" | "stage"; outcome: ContactOutcome | null; stage?: LeadStage }, reachedOutcomes: readonly ContactOutcome[]): boolean {
  if (c.channel === "stage") return c.stage !== undefined && c.stage !== "lost" && stageOrdinal(c.stage) >= stageOrdinal("counselling_booked");
  return c.outcome !== null && reachedOutcomes.includes(c.outcome);
}

/**
 * A contact was logged (`call` / `whatsapp`) or the lead moved to contacted or beyond (`stage`).
 * Only `via: "ui"` counts (MCP never does, L3); later attempts count, retries, reached.
 */
export function onContactLogged(
  db: DatabaseSync,
  c: {
    leadId: string;
    channel: "call" | "whatsapp" | "stage";
    outcome: ContactOutcome | null;
    stage?: LeadStage;
    actorId: string;
    via: ContactLogVia;
    at: number;
  },
): void {
  if (c.via !== "ui") return;
  const lead = findLeadById(db, c.leadId);
  if (!lead || lead.erasedAt !== null) return;
  const { hours, rule } = loadPolicy(db);
  const attempt = c.channel !== "stage";

  let clock: ClockRow | null = null;
  const open = findOpenClock(db, c.leadId);
  if (open) {
    const qualifies = c.channel === "stage" || rule.countOnly === "any_attempt" || c.outcome === "connected";
    if (qualifies) {
      resolveClock(db, open.id, {
        at: c.at,
        by: c.actorId,
        channel: c.channel,
        assigneeAtDue: holderAt(db, lead.id, Math.min(c.at, open.dueAt), lead.assignedTo),
        workMs: workingMsBetween(hours, open.startedAt, c.at),
        met: c.at <= open.dueAt,
      });
    } else if (attempt) {
      bumpClockAttempts(db, open.id);
    }
    clock = findClockById(db, open.id);
  } else {
    // After the first call: keep counting on the latest clock until the family is reached or the lead closes.
    const latest = findLatestClock(db, c.leadId);
    if (latest && latest.resolution === "attempt" && latest.reachedAt === null && lead.stage !== "lost" && lead.stage !== "enrolled") {
      if (attempt) bumpClockAttempts(db, latest.id);
      clock = findClockById(db, latest.id);
    }
  }
  if (!clock) return;

  if (isReached(c, rule.reachedOutcomes)) {
    markClockReached(db, clock.id, c.at);
    return;
  }
  if (attempt && clock.reachedAt === null && lead.stage !== "lost" && lead.stage !== "enrolled") {
    maybeCreateRetry(db, { clock, leadId: lead.id, assigneeId: lead.assignedTo, outcome: c.outcome, hours, rule, at: c.at });
  }
}

/** Closes the open clock: `closed` (lead lost) or `erased` (erase). */
export function closeSlaClock(db: DatabaseSync, c: { leadId: string; resolution: "closed" | "erased"; at: number }): void {
  closeClock(db, c.leadId, c.resolution, c.at);
}

/**
 * Recomputes due / alert times of every open clock from its start under the current policy and
 * stamps the new `policy_version`. Returns how many clocks got different times. Inside the
 * caller's transaction (the speed-settings save).
 */
export function recomputeOpenClocks(db: DatabaseSync, now: number): number {
  void now;
  const policy = loadPolicy(db);
  let changed = 0;
  for (const clock of listOpenClockTimes(db)) {
    const times = clockTimes(policy, clock.startedAt);
    const differs = times.dueAt !== clock.dueAt || times.tier1At !== clock.tier1At || times.tier2At !== clock.tier2At;
    if (!differs && clock.policyVersion === policy.version) continue;
    updateClockTimes(db, clock.id, { ...times, policyVersion: policy.version });
    if (differs) changed += 1;
  }
  return changed;
}
