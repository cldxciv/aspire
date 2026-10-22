import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { ArrivalKind, ArrivalResult, LeadArrival } from "./lead-ops-types";
import { autoAssign } from "./leads";
import { findLeadById } from "./repo/leads";
import { hasAnyClock } from "./repo/sla-core";
import { isAssignable, routeLead } from "./routing";
import { startSlaClock } from "./sla";

export type { ArrivalKind, ArrivalResult, LeadArrival };

/**
 * The lead arrival pipeline (owner: LR-CORE; FROZEN; docs/lead-routing-plan.md §14.1). Every
 * capture (website, tools, Meta, CSV, staff entry) calls this once the lead row is written, INSIDE
 * the caller's transaction:
 *
 * 1. reload the lead (with its routing area);
 * 2. route it (`routeLead`: area by centre, then by place; ROUTING decides);
 * 3. assign — unless `attached`, `assignNew` is false, or it is a lead-gate arrival on an existing
 *    lead (gate captures never re-assign). `firstEnquiry` = a repeat on a still-`new` lead that has
 *    no clock yet and is not a gate arrival (a tool sign-up's first real enquiry). With no assignee,
 *    or one who is no longer assignable (disabled, inactive, away, outside the new area on a reopen;
 *    `isAssignable`), `autoAssign` picks again (`replace`), recording from → to and `via`;
 * 4. start the first-call clock for `new`, `reopened` or a first enquiry (`startSlaClock`; reason
 *    `import` when asked, the CSV `slaClock` option overriding the policy; start = `arrivedAt`).
 */
export function onLeadArrival(db: DatabaseSync, a: LeadArrival): ArrivalResult {
  const lead = findLeadById(db, a.leadId);
  if (!lead) return { areaId: null, assigneeId: null, clockStarted: false };

  const routing = routeLead(db, lead, {
    districtInput: a.districtInput,
    stateInput: a.stateInput,
    gate: a.gate,
    at: a.at,
    actorId: a.actorId,
  });
  const routed = findLeadById(db, lead.id) ?? lead;
  const areaId = routing.areaId ?? routed.areaId;

  const firstEnquiry = a.kind === "repeat" && lead.stage === "new" && !a.gate && !hasAnyClock(db, lead.id);
  let assigneeId = routed.assignedTo;
  const gateOnExisting = a.gate && a.kind !== "new";
  if (a.kind !== "attached" && a.assignNew && !gateOnExisting) {
    const current = routed.assignedTo;
    const keep = current !== null && isAssignable(db, current, { now: a.at, kind: a.kind, firstEnquiry, areaId });
    if (!keep) assigneeId = autoAssign(db, routed, a.at, routing, { replace: current !== null });
  }

  let clockStarted = false;
  if (a.kind !== "attached" && (a.kind === "new" || a.kind === "reopened" || firstEnquiry)) {
    clockStarted = startSlaClock(db, {
      leadId: lead.id,
      source: a.source,
      gate: a.gate,
      manual: a.manual,
      reason: a.clockReason ?? (a.kind === "reopened" ? "reopened" : "new"),
      arrivedAt: a.arrivedAt,
      at: a.at,
      override: a.slaClock,
    });
  }
  return { areaId, assigneeId, clockStarted };
}
