/**
 * Browser-side requests of the family record (docs/admin-phase-1b-plan.md §5.E, §5.F, §5.H, §8;
 * owner: 1B-FAMILY): more details, "Not the same family" and the lost review. Pure builders, so
 * tests check the exact path, method and body without a network; `sendCrm` runs them. Client-safe.
 * Bodies carry ids, enum values and the staff member's own typed details only.
 */
import type { CrmRequest } from "@/components/crm/api";
import type { LeadDetailsPatch } from "@/lib/crm/console/details/schemas";
import type { ReopenFollowUp, ReopenStage } from "@/lib/crm/console/lost/types";

const lead = (id: string) => `/api/crm/leads/${encodeURIComponent(id)}`;

export const familyRequests = {
  /** The lead's more details. */
  details(leadId: string): CrmRequest {
    return { path: `${lead(leadId)}/details`, method: "GET" };
  },
  /** Only the changed fields; `null` clears one. */
  saveDetails(leadId: string, patch: LeadDetailsPatch): CrmRequest {
    return { path: `${lead(leadId)}/details`, method: "PUT", body: patch };
  },
  duplicates(leadId: string): CrmRequest {
    return { path: `${lead(leadId)}/duplicates`, method: "GET" };
  },
  /** "Not the same family": the pair is never suggested again. */
  dismissDuplicate(leadId: string, otherLeadId: string): CrmRequest {
    return { path: `${lead(leadId)}/duplicates`, method: "POST", body: { otherLeadId, action: "dismiss" } };
  },
  lostReview(input: { days: number; assignee?: string | null }): CrmRequest {
    const params = new URLSearchParams({ days: String(input.days) });
    if (input.assignee) params.set("assignee", input.assignee);
    return { path: `/api/crm/lost-review?${params.toString()}`, method: "GET" };
  },
  keepLost(leadId: string, lostAt: string): CrmRequest {
    return { path: `/api/crm/lost-review/${encodeURIComponent(leadId)}`, method: "POST", body: { lostAt, decision: "kept" } };
  },
  reopenLost(leadId: string, input: { lostAt: string; reopenTo: ReopenStage; assigneeId: string | null; followUp: ReopenFollowUp }): CrmRequest {
    const body: Record<string, unknown> = { lostAt: input.lostAt, decision: "reopened", reopenTo: input.reopenTo, followUp: input.followUp };
    if (input.assigneeId) body.assigneeId = input.assigneeId;
    return { path: `/api/crm/lost-review/${encodeURIComponent(leadId)}`, method: "POST", body };
  },
};
