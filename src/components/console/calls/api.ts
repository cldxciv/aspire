/**
 * Browser-side requests of the one-step outcome and the WhatsApp templates (docs/admin-phase-1b-plan.md
 * §5.C, §5.D, §8; owner: 1B-CALLS). Pure builders, so tests check the exact path, method and body
 * without a network; `sendCrm` (src/components/crm/api.ts) runs them. Client-safe.
 */
import type { CrmRequest } from "@/components/crm/api";
import type { OutcomeInput, TemplateLang, TemplateStatus } from "@/lib/crm/console/types";

const lead = (id: string) => `/api/crm/leads/${encodeURIComponent(id)}`;
const template = (key: string) => `/api/crm/templates/${encodeURIComponent(key)}`;

export const callsRequests = {
  /** The dialog's context (`FollowUpContextView`); `taskId` = opened from that task's Done button. */
  outcomeContext(leadId: string, taskId?: string | null): CrmRequest {
    const query = taskId ? `?${new URLSearchParams({ taskId }).toString()}` : "";
    return { path: `${lead(leadId)}/outcome${query}`, method: "GET" };
  },
  /** One atomic write: tick the task off → follow-up → log the contact → optional lost. Nothing is sent. */
  recordOutcome(leadId: string, input: OutcomeInput): CrmRequest {
    return { path: `${lead(leadId)}/outcome`, method: "POST", body: input };
  },
  /** Approved templates of a context (the composer). */
  approvedTemplates(context = "general"): CrmRequest {
    return { path: `/api/crm/templates?${new URLSearchParams({ context }).toString()}`, method: "GET" };
  },
  /** Every template with its status (area heads, admins, super admins). */
  allTemplates(): CrmRequest {
    return { path: "/api/crm/templates?all=1", method: "GET" };
  },
  editTemplate(key: string, input: { lang: TemplateLang; body: string; expectedVersion: number }): CrmRequest {
    return { path: template(key), method: "PUT", body: { lang: input.lang, body: input.body, expectedVersion: input.expectedVersion } };
  },
  templateStatus(key: string, input: { status: TemplateStatus; expectedVersion: number }): CrmRequest {
    return { path: `${template(key)}/status`, method: "POST", body: { status: input.status, expectedVersion: input.expectedVersion } };
  },
  saveProspectusLink(input: { prospectusUrl: string | null; expectedVersion: number }): CrmRequest {
    return { path: "/api/crm/templates/links", method: "PUT", body: { prospectusUrl: input.prospectusUrl, expectedVersion: input.expectedVersion } };
  },
};
