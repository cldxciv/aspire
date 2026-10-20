/**
 * Types for the staff CRM workspace. The data shapes are CRM-CORE's contract
 * (`@/lib/crm/types`, client-safe; docs/crm.md); this file only adds UI-side view models.
 */
export {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  CRM_ROLES,
  FUNNEL_STAGES,
  LEAD_CLASSES,
  LEAD_PROGRAMS,
  LEAD_STAGES,
  LEAD_TOOLS,
  LOST_REASONS,
  OPEN_STAGES,
  crmPermissions,
  isLeadStage,
  isLostReason,
  type ActivityType,
  type AssignmentRule,
  type AssignmentRuleInput,
  type ContactChannel,
  type ContactOutcome,
  type CrmPermissions,
  type CrmRole,
  type CrmStaffMember,
  type CrmViewer,
  type FunnelCount,
  type FunnelReport,
  type LeadActivity,
  type LeadAssignee,
  type LeadDetail,
  type LeadPage,
  type LeadStage,
  type LeadSummary,
  type LeadTask,
  type LostReason,
  type MyTask,
  type StaffInput,
} from "@/lib/crm/types";

import type { ContactChannel, ContactOutcome, LeadStage } from "@/lib/crm/types";

/** Outcomes offered per channel in the "log this contact" dialog. */
export const OUTCOMES_BY_CHANNEL: Readonly<Record<ContactChannel, readonly ContactOutcome[]>> = {
  call: ["connected", "no_answer", "busy", "switched_off", "call_back_requested", "wrong_number"],
  whatsapp: ["message_sent", "connected", "wrong_number"],
};

/** A select option already resolved to its display label (server → client). */
export interface Option {
  value: string;
  label: string;
}

/**
 * A lead as handed to CLIENT components (pipeline board, Today quick actions): no full phone
 * number — only the last four digits — so masked rows never ship the number to the browser.
 */
export interface LeadCard {
  id: string;
  name: string;
  stage: LeadStage;
  phoneLast4: string | null;
  classProgram: string | null;
  centre: string | null;
  assignee: string | null;
  nextTaskDueAt: string | null;
  overdue: boolean;
}
