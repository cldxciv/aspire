import "server-only";

/**
 * CRM services (M7 lead & admission engine; owner CRM-CORE; contract in docs/crm.md).
 * Server-only. Client components import types / constants from "@/lib/crm/types" instead.
 *
 * Every service is synchronous (node:sqlite), takes the viewer explicitly and an optional `now`
 * (epoch ms; defaults to Date.now()), enforces record-level access (D-038) and writes audit rows.
 *
 * Signatures (see each module for details):
 *   resolveCrmViewer(session)                                → CrmViewer | null
 *   captureLead(input: CaptureLeadInput, now?)               → CaptureLeadResult
 *   leadInputFromEnquiry(enquiry, { consentTextVersion?, consentAt?, context?, reference? }?) → CaptureLeadInput
 *     (consent version + context default to the enquiry's own `consentVersion` / `context`)
 *   createManualLead(viewer, input: ManualLeadInput, now?)   → CrmResult<{ leadId, isNew }>
 *   listLeads(viewer, filters?, { page?, pageSize? }?, now?) → LeadPage
 *   getLead(viewer, leadId, now?, { audit? }?)               → CrmResult<LeadDetail>          (audited view)
 *   updateLead(viewer, leadId, LeadPatch, now?)              → CrmResult<LeadDetail>
 *   changeStage(viewer, leadId, stage, lostReason?, now?)    → CrmResult<LeadDetail>
 *   assignLead(viewer, leadId, assigneeId | null, now?)      → CrmResult<LeadDetail>
 *   addNote(viewer, leadId, body, now?)                      → CrmResult<LeadActivity>
 *   logContact(viewer, leadId, { channel, outcome, body? }, now?) → CrmResult<LeadActivity>
 *   createTask(viewer, leadId, { title, dueAt, assigneeId? }, now?) → CrmResult<LeadTask>
 *   completeTask(viewer, taskId, now?)                       → CrmResult<LeadTask>
 *   myTasks(viewer, range?: TaskRange, now?)                 → MyTask[]
 *   funnelReport(viewer, { from, to })                       → FunnelReport
 *   exportLeadsCsv(viewer, filters?, now?)                   → CrmResult<{ csv, rows, filename }> (audited)
 *   eraseLead(viewer, leadId, now?)                          → CrmResult<{ leadId, erasedAt }>   (admin)
 *   listStaff(viewer) / upsertStaff(viewer, userId, StaffInput, now?)
 *   getAssignmentRules(viewer) / setAssignmentRules(viewer, rules, now?)
 */

export * from "./types";
export { canSeeLead, CRM_AUDIT, leadScopeFor, resolveCrmViewer, scopeCovers } from "./access";
export { pickAssignee } from "./assignment";
export { captureLead, createManualLead, leadContextFromEnquiry, leadInputFromEnquiry } from "./capture";
export {
  addNote,
  assignLead,
  changeStage,
  DEFAULT_PAGE_SIZE,
  getLead,
  listLeads,
  logContact,
  MAX_PAGE_SIZE,
  NOTE_MAX,
  updateLead,
  type LeadPatch,
} from "./leads";
export { completeTask, createTask, isTaskRange, myTasks, TASK_TITLE_MAX } from "./tasks";
export { EXPORT_MAX_ROWS, exportLeadsCsv, funnelReport, reportRange } from "./reports";
export {
  eraseLead,
  getAssignmentRules,
  listStaff,
  setAssignmentRules,
  staffMemberships,
  upsertStaff,
  validateStaffInput,
  writeStaffMembership,
} from "./admin";
export { normalizePhoneE164, istDayBounds, csvCell } from "./pure";
