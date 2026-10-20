/**
 * Browser-side calls to CRM-CORE's `/api/crm/**` JSON APIs (same-origin, D-007 envelope; see
 * docs/crm.md §3). Each request is described by a pure builder (`crmRequests.*`) so tests can
 * check the exact path, method and body without a network; `sendCrm` runs one through `callApi`.
 */
import { format } from "@/i18n/format";
import { callApi, retryAfterMinutes, type ApiFailure, type ApiResult } from "@/lib/auth/client-api";
import type {
  AssignmentRuleInput,
  ConsentMethod,
  ContactChannel,
  ContactOutcome,
  CrmRole,
  EditableLeadField,
  EraseReason,
  LeadStage,
  LostReason,
  ManualDuplicateMode,
  ManualLeadSource,
  StaffInput,
} from "@/lib/crm/types";

/** Body of POST /api/crm/leads as the "Add enquiry" form sends it (empty optional fields left out). */
export type NewLeadBody = {
  source: ManualLeadSource;
  studentName?: string;
  guardianName?: string;
  phone: string;
  email?: string;
  currentClass?: string;
  programInterest?: string;
  centreSlug?: string;
  note?: string;
  consent: true;
  consentMethod: ConsentMethod;
  onDuplicate: ManualDuplicateMode;
};
import type { CrmMessages } from "./format";

export type CrmRequest = {
  path: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

const lead = (id: string) => `/api/crm/leads/${encodeURIComponent(id)}`;

export const crmRequests = {
  /** Stage change; `lost` requires a reason (the server enforces it too). */
  changeStage(leadId: string, stage: LeadStage, lostReason?: LostReason): CrmRequest {
    if (stage === "lost" && !lostReason) throw new Error("A lost reason is required");
    return { path: lead(leadId), method: "PATCH", body: stage === "lost" ? { stage, lostReason } : { stage } };
  },
  /** Assign to a staff member, or `null` for the unassigned queue (managers / admins). */
  assign(leadId: string, assigneeId: string | null): CrmRequest {
    return { path: lead(leadId), method: "PATCH", body: { assigneeId } };
  },
  /** D-041: records a call / WhatsApp the staff member made themselves. Nothing is sent. */
  logContact(leadId: string, input: { channel: ContactChannel; outcome: ContactOutcome; note?: string }): CrmRequest {
    const note = input.note?.trim();
    return {
      path: `${lead(leadId)}/contacts`,
      method: "POST",
      body: note ? { channel: input.channel, outcome: input.outcome, body: note } : { channel: input.channel, outcome: input.outcome },
    };
  },
  addNote(leadId: string, body: string): CrmRequest {
    return { path: `${lead(leadId)}/notes`, method: "POST", body: { body: body.trim() } };
  },
  createTask(leadId: string, input: { title: string; dueAt: string }): CrmRequest {
    return { path: `${lead(leadId)}/tasks`, method: "POST", body: { title: input.title.trim(), dueAt: input.dueAt } };
  },
  /** "Add enquiry": a walk-in / phone / referral family (`onDuplicate: "report"` first, `"append"` for "Log a visit"). */
  createLead(body: NewLeadBody): CrmRequest {
    return { path: "/api/crm/leads", method: "POST", body };
  },
  /** "Edit details": only the changed fields; `null` clears one. */
  updateDetails(leadId: string, fields: Partial<Record<EditableLeadField, string | null>>): CrmRequest {
    return { path: lead(leadId), method: "PATCH", body: { fields } };
  },
  /** Admin only (D-042): wipes the family's personal data, keeps an anonymous stub. */
  erase(leadId: string, reason: EraseReason): CrmRequest {
    return { path: `${lead(leadId)}/erase`, method: "POST", body: { confirm: true, reason } };
  },
  completeTask(taskId: string): CrmRequest {
    return { path: `/api/crm/tasks/${encodeURIComponent(taskId)}`, method: "PATCH", body: { done: true } };
  },
  /** Admin users API: account + CRM membership in one transaction; the temporary password comes back once. */
  createStaff(input: { displayName: string; loginId: string; crmRole: CrmRole; centreSlugs: string[] }): CrmRequest {
    return {
      path: "/api/admin/users",
      method: "POST",
      body: {
        role: "staff",
        displayName: input.displayName.trim().replace(/\s+/g, " "),
        loginId: input.loginId.trim().toLowerCase(),
        crm: { crmRole: input.crmRole, centreSlugs: input.centreSlugs },
      },
    };
  },
  updateStaff(userId: string, input: StaffInput): CrmRequest {
    return {
      path: `/api/crm/staff/${encodeURIComponent(userId)}`,
      method: "PUT",
      body: { crmRole: input.crmRole, centreSlugs: input.centreSlugs, active: input.active },
    };
  },
  saveRules(rules: readonly AssignmentRuleInput[]): CrmRequest {
    return {
      path: "/api/crm/rules",
      method: "PUT",
      body: {
        rules: rules.map((rule) => ({
          centreSlug: rule.centreSlug,
          programInterest: rule.programInterest,
          memberIds: rule.memberIds,
          active: rule.active,
        })),
      },
    };
  },
};

/** CSV export of leads created in a range (GET; the server checks manager/admin, scopes and audits). */
export function exportHref(range: { from: string; to: string }): string {
  return `/api/crm/export?${new URLSearchParams({ createdFrom: range.from, createdTo: range.to }).toString()}`;
}

export function sendCrm<T>(request: CrmRequest): Promise<ApiResult<T>> {
  return callApi<T>(request.path, { method: request.method, body: request.body });
}

/** Localised copy for a failed CRM call: the server's English text is never shown. */
export function crmFailureMessage(result: ApiFailure, t: Pick<CrmMessages, "errors">, minutes = retryAfterMinutes): string {
  const e = t.errors;
  if (result.error === "unauthenticated") return e.sessionExpired;
  if (result.known === "passwordChangeRequired") return e.passwordChangeRequired;
  if (result.status === 409) return e.conflict;
  switch (result.error) {
    case "forbidden":
      return e.forbidden;
    case "not_found":
      return e.notFound;
    case "validation":
    case "bad_request":
      return e.validation;
    case "rate_limited":
      return format(e.rateLimited, { minutes: minutes(result.retryAfterSeconds) });
    case "not_configured":
      return e.notConfigured;
    case "network":
      return e.network;
    default:
      return e.server;
  }
}
