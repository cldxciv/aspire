/**
 * CRM (lead & admission engine, M7) — shared types and constants. CLIENT-SAFE: no server-only
 * imports, no I/O. Client components import from here ("@/lib/crm/types"); server code may import
 * everything from "@/lib/crm" (which re-exports this file). Owner: CRM-CORE. See docs/crm.md.
 *
 * Times in every shape below are ISO-8601 strings (UTC) unless the name says `Ms` (epoch ms).
 */

// ---------------------------------------------------------------------------
// Pipeline (D-040)
// ---------------------------------------------------------------------------

/** Pipeline stages in funnel order, then `lost`. */
export const LEAD_STAGES = [
  "new",
  "contacted",
  "counselling_booked",
  "visited_or_demo",
  "applied",
  "test_taken",
  "offer",
  "enrolled",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** The funnel stages (everything except `lost`), in order. */
export const FUNNEL_STAGES = LEAD_STAGES.filter((stage) => stage !== "lost") as Exclude<LeadStage, "lost">[];

/** Stages that still need work (not enrolled, not lost). */
export const OPEN_STAGES: readonly LeadStage[] = LEAD_STAGES.filter((stage) => stage !== "enrolled" && stage !== "lost");

/** Why a lead was lost. Required when moving a lead to `lost`. */
export const LOST_REASONS = [
  "not_reachable",
  "not_interested",
  "joined_other_institute",
  "fees",
  "location_or_distance",
  "timing_or_batch",
  "wrong_number",
  "duplicate",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);
}

export function isLostReason(value: unknown): value is LostReason {
  return typeof value === "string" && (LOST_REASONS as readonly string[]).includes(value);
}

/** Position in the funnel (0 = new … 7 = enrolled); `lost` → -1. */
export function stageOrdinal(stage: LeadStage): number {
  return stage === "lost" ? -1 : FUNNEL_STAGES.indexOf(stage);
}

// ---------------------------------------------------------------------------
// Sources, tools, contact channels
// ---------------------------------------------------------------------------

/**
 * Where a lead came from. Public forms use the enquiry contract's `source` (hero, admissions,
 * contact, quick); tool CTAs use `tool` (with `LeadContext.tool` naming the tool); staff-entered
 * leads use walk_in / phone_call / referral / other. Stored as text: an unknown but well-formed
 * source (`/^[a-z][a-z0-9_-]{0,31}$/`) is accepted and reported as itself.
 */
export const PUBLIC_LEAD_SOURCES = ["hero", "admissions", "contact", "quick", "tool"] as const;
/**
 * Source of leads captured by the lead gate (contact details before a free tool's result;
 * docs/lead-gate-plan.md): the existing `tool` value; `LeadContext.tool` names the tool that asked.
 */
export const GATE_LEAD_SOURCE = "tool";
/** Who filled in the lead gate ("I am the student / parent or guardian"); kept on the submission activity. */
export const GATE_SUBMITTERS = ["student", "parent"] as const;
export type GateSubmitter = (typeof GATE_SUBMITTERS)[number];
export const MANUAL_LEAD_SOURCES = ["walk_in", "phone_call", "referral", "other"] as const;
export const KNOWN_LEAD_SOURCES = [...PUBLIC_LEAD_SOURCES, ...MANUAL_LEAD_SOURCES] as const;
export type ManualLeadSource = (typeof MANUAL_LEAD_SOURCES)[number];
export type KnownLeadSource = (typeof KNOWN_LEAD_SOURCES)[number];

/**
 * Student tools with a "talk to a counsellor" CTA (D-039) — the enquiry contract's ENQUIRY_TOOLS
 * spelling. Rows stored with the early id "mocktest" are returned as "mock-test".
 */
export const LEAD_TOOLS = ["predictor", "mock-test", "ask", "planner"] as const;
export type LeadTool = (typeof LEAD_TOOLS)[number];

/** Program interest values (same as the enquiry contract's PROGRAM_INTEREST_OPTIONS). */
export const LEAD_PROGRAMS = ["jee", "neet", "foundation", "integrated", "not-sure"] as const;
/** Class values (same as the enquiry contract's CLASS_OPTIONS). */
export const LEAD_CLASSES = ["class-6-8", "class-9", "class-10", "class-11", "class-12", "dropper"] as const;

/** D-041: nothing is sent by the system; staff log what they did via tel:/wa.me links. */
export const CONTACT_CHANNELS = ["call", "whatsapp"] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_OUTCOMES = [
  "connected",
  "no_answer",
  "busy",
  "switched_off",
  "wrong_number",
  "call_back_requested",
  "message_sent",
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

// ---------------------------------------------------------------------------
// Activities (timeline)
// ---------------------------------------------------------------------------

export const ACTIVITY_TYPES = [
  "submission", // a public form / tool CTA submission (first one creates the lead)
  "created", // lead entered by staff (walk-in, phone call, …)
  "note",
  "call",
  "whatsapp",
  "stage_change",
  "assignment",
  "field_update",
  "task_created",
  "task_done",
  "merge", // reserved (Phase 2)
  "erase",
  "tool_use", // a free tool used after the lead gate (one entry per tool + key + IST day; docs/lead-gate-plan.md)
  "consent_withdrawn", // the family chose "Stop Aspire contacting me" under a tool (lead gate)
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface LeadActivity {
  id: number;
  type: ActivityType;
  /** Free text: a staff note / call note, or the family's own message on a `submission`. `null` for system entries and after erase. */
  body: string | null;
  /**
   * Structured facts, never free text from the public. By type:
   * submission { source, tool?, toolExam?, toolBand?, locale?, page?, topic?, reference?, consentTextVersion,
   *   consentLocale?, consentText?, filled: string[] } ·
   * stage_change { from, to, lostReason? } ·
   * assignment { from: userId|null, to: userId|null, fromName?, toName?, auto?: boolean, via? } (who assigned = actorName;
   *   null actor = automatic) · task_created { taskId, dueAt, assigneeId, assigneeName? } ·
   * call/whatsapp { outcome } · field_update { fields: string[] } · task_created/task_done { taskId, dueAt? } ·
   * created { source } ·
   * lead gate (docs/lead-gate-plan.md): submission also { submittedBy?: "student" | "parent", onLostLead?: true } ·
   * tool_use { tool, key, exam?, band?, testId?, scoreBand?, page?, uses, lastAt } (never answers, questions,
   *   photos, exact scores, category, state, gender or dates; deleted on erase and after TOOL_USE_TTL_MS) ·
   * consent_withdrawn { via: "lead_gate", browsersForgotten }.
   */
  meta: Record<string, string | number | boolean | null | string[]>;
  /** Staff user id, or null for the system / the public. */
  actorId: string | null;
  actorName: string | null;
  at: string;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

/** Lead fields staff may edit (PATCH `fields`). Edited fields are never overwritten by later submissions. */
export const EDITABLE_LEAD_FIELDS = [
  "studentName",
  "guardianName",
  "contactName",
  "email",
  "currentClass",
  "programInterest",
  "centreSlug",
] as const;
export type EditableLeadField = (typeof EDITABLE_LEAD_FIELDS)[number];

export interface LeadAssignee {
  userId: string;
  displayName: string;
}

/** One row of the leads inbox. */
export interface LeadSummary {
  id: string;
  stage: LeadStage;
  lostReason: LostReason | null;
  /** Best display name: student name, else the contact-form name, else the guardian name. Null once erased. */
  displayName: string | null;
  studentName: string | null;
  guardianName: string | null;
  /**
   * In lists (`listLeads`, GET /api/crm/leads): MASKED, `+91 ••••• •1234` (only the last four digits).
   * In `LeadDetail` (audited view): the full E.164 number (+91XXXXXXXXXX) for tel: / wa.me links.
   * Null once erased.
   */
  phone: string | null;
  /** Last four digits of the phone (lists and detail). Null once erased. */
  phoneLast4?: string | null;
  centreSlug: string | null;
  programInterest: string | null;
  currentClass: string | null;
  source: string;
  tool: string | null;
  assignee: LeadAssignee | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  /** Earliest due date of the lead's open tasks. */
  nextTaskDueAt: string | null;
  /** An open task is past due. */
  overdue: boolean;
  /** Number of public submissions folded into this lead (dedupe). */
  submissionCount: number;
  erased: boolean;
}

export interface LeadTask {
  id: string;
  leadId: string;
  title: string;
  dueAt: string;
  doneAt: string | null;
  assignee: LeadAssignee | null;
  createdBy: string | null;
  createdAt: string;
  overdue: boolean;
}

export interface LeadDetail extends LeadSummary {
  contactName: string | null;
  email: string | null;
  /** The family's own message from the latest submission that had one. */
  message: string | null;
  page: string | null;
  referrer: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null; term: string | null; content: string | null };
  consentTextVersion: string | null;
  consentAt: string | null;
  /** Language and exact sentence of the latest recorded consent (from the latest submission that carried them). */
  consentLocale?: string | null;
  consentText?: string | null;
  /** Fields a staff member has edited (protected from later submissions). */
  staffEditedFields: EditableLeadField[];
  furthestStage: LeadStage;
  erasedAt: string | null;
  /** Newest first (max 200). */
  activities: LeadActivity[];
  /** Open tasks first (by due date), then done tasks. */
  tasks: LeadTask[];
}

export type LeadSort = "recent_activity" | "newest" | "oldest" | "due" | "name";
export const LEAD_SORTS: readonly LeadSort[] = ["recent_activity", "newest", "oldest", "due", "name"];

/** Inbox filters (GET /api/crm/leads query parameters have the same names). */
export interface LeadFilters {
  stage?: LeadStage | "open";
  centre?: string | "none";
  program?: string;
  source?: string;
  /** A staff user id, `me`, or `unassigned`. */
  assignee?: string;
  /** Leads whose earliest open task is due today (Asia/Kolkata) / already overdue. */
  due?: "today" | "overdue";
  /** Name (contains, case-insensitive) or phone digits (the last 4+ digits). */
  q?: string;
  /** Created on/after / before (ISO date or date-time). */
  createdFrom?: string;
  createdTo?: string;
  includeErased?: boolean;
  sort?: LeadSort;
}

export interface LeadPage {
  items: LeadSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Capture (public forms → leads; CRM-CAPTURE calls captureLead)
// ---------------------------------------------------------------------------

/** Attribution context sent with a public submission (all optional, all bounded). */
export interface LeadContext {
  /** Locale-free page path the form was on, e.g. "/admissions". */
  page?: string | null;
  /** External referrer: a host name ("www.google.com") or a URL (reduced to its host). */
  referrer?: string | null;
  /** Tool behind a "talk to a counsellor" CTA. */
  tool?: string | null;
  /** Predictor exam id / score band (never the exact score) — kept on the submission activity. */
  toolExam?: string | null;
  toolBand?: string | null;
  /** Site language the form was submitted in ("en" | "hi") — kept on the submission activity. */
  locale?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
}

export interface CaptureLeadInput {
  /** Enquiry `source` (hero | admissions | contact | quick | tool) — see KNOWN_LEAD_SOURCES. */
  source: string;
  studentName?: string | null;
  guardianName?: string | null;
  /** Name typed on a form that does not say whose it is (the contact form's "Your name"). */
  contactName?: string | null;
  /** Any Indian mobile format the enquiry contract accepts; stored as E.164 (+91…). */
  phone: string;
  email?: string | null;
  message?: string | null;
  currentClass?: string | null;
  programInterest?: string | null;
  /** Centre slug; "not-sure" / "" → none. */
  centreSlug?: string | null;
  /** Contact-form topic / quick-form intent etc. Kept in the submission activity's meta. */
  topic?: string | null;
  /**
   * D-039: the consent the submitter ticked. Required: no consent, no lead. `textVersion` is the
   * consent sentence id; `locale` and `text` are the language and exact sentence shown (kept on the
   * submission activity as proof of consent).
   */
  consent: { textVersion: string; at?: number; locale?: string | null; text?: string | null };
  context?: LeadContext;
  /** The enquiry reference shown to the family (ENQ-…), kept on the submission activity. */
  reference?: string | null;
  /** Lead gate: who filled in the form. Kept on the submission activity (not a lead field). */
  submittedBy?: GateSubmitter | null;
}

/** How `captureLead` treats a submission (defaults: an ordinary public enquiry). */
export interface CaptureLeadOptions {
  /**
   * A lead-gate capture (source `tool`). On an EXISTING lead it never reopens a lost lead (the
   * submission is appended with `onLostLead: true`), never re-runs auto-assignment, and keeps the
   * lead's own consent version and time when it already has one (the submission activity still
   * records the gate consent shown). Reasons: docs/lead-gate-plan.md §2 (critiques 0.2, 0.3, 1.1, 1.14).
   */
  gate?: boolean;
  /** Auto-assign a NEW lead (default true). `LEAD_GATE_ASSIGN=none` keeps gate leads in the Unassigned queue. */
  assignNew?: boolean;
}

export type CaptureLeadResult =
  | { ok: true; leadId: string; isNew: boolean; assigneeId: string | null }
  | { ok: false; error: "invalid_phone" | "consent_missing" | "invalid_input" };

/** Staff-entered lead (walk-in, phone call…): POST /api/crm/leads. */
export interface ManualLeadInput {
  source: ManualLeadSource;
  studentName?: string | null;
  guardianName?: string | null;
  phone: string;
  email?: string | null;
  currentClass?: string | null;
  programInterest?: string | null;
  centreSlug?: string | null;
  /** First note on the timeline. */
  note?: string | null;
  /** The family agreed to be contacted (recorded by the staff member). Must be true. */
  consent: true;
}

// ---------------------------------------------------------------------------
// Staff, viewers, rules
// ---------------------------------------------------------------------------

export const CRM_ROLES = ["counsellor", "manager"] as const;
export type CrmRole = (typeof CRM_ROLES)[number];

/**
 * Who is using the CRM (D-038). `admin` = a core admin account (sees everything);
 * `manager` = leads of their centres (all centres when `centreSlugs` is empty);
 * `counsellor` = only leads assigned to them.
 */
export interface CrmViewer {
  userId: string;
  displayName: string;
  role: "admin" | CrmRole;
  /** Empty = every centre (managers) / any centre for auto-assignment (counsellors). */
  centreSlugs: string[];
}

export interface CrmPermissions {
  canAssign: boolean;
  canExport: boolean;
  canErase: boolean;
  canManageStaff: boolean;
  canViewStaff: boolean;
  canEditRules: boolean;
  canCreateLeads: boolean;
}

export function crmPermissions(viewer: Pick<CrmViewer, "role">): CrmPermissions {
  const admin = viewer.role === "admin";
  const manager = viewer.role === "manager";
  return {
    canAssign: admin || manager,
    canExport: admin || manager,
    canErase: admin,
    canManageStaff: admin,
    canViewStaff: admin || manager,
    canEditRules: admin,
    canCreateLeads: true,
  };
}

export interface CrmStaffMember {
  userId: string;
  displayName: string;
  /** Admin view only. */
  loginId?: string;
  crmRole: CrmRole;
  centreSlugs: string[];
  /** CRM membership active (inactive members get no leads and cannot use the CRM). */
  active: boolean;
  /** The user account is disabled. */
  disabled: boolean;
  openLeads: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffInput {
  crmRole: CrmRole;
  centreSlugs: string[];
  active: boolean;
}

/** Auto-assignment rule: leads matching centre/program (null = any) go round-robin to `memberIds`. */
export interface AssignmentRule {
  id: string;
  centreSlug: string | null;
  programInterest: string | null;
  memberIds: string[];
  active: boolean;
}

export type AssignmentRuleInput = Omit<AssignmentRule, "id">;

// ---------------------------------------------------------------------------
// Tasks, reports
// ---------------------------------------------------------------------------

export type TaskRange = "today" | "overdue" | "upcoming" | "open" | "done";
export const TASK_RANGES: readonly TaskRange[] = ["today", "overdue", "upcoming", "open", "done"];

export interface MyTask extends LeadTask {
  leadDisplayName: string | null;
  leadStage: LeadStage;
  /** Masked like `LeadSummary.phone` in lists (`+91 ••••• •1234`). */
  leadPhone: string | null;
  leadPhoneLast4?: string | null;
}

export interface FunnelCount {
  key: string;
  label?: string;
  total: number;
  contacted: number;
  enrolled: number;
  lost: number;
}

export interface FunnelReport {
  from: string;
  to: string;
  /** Leads created in [from, to) that the viewer can see (erased stubs included). */
  total: number;
  /** Current stage counts. */
  byStage: Record<LeadStage, number>;
  /** How many leads ever reached each funnel stage (furthest stage ≥ stage). */
  reached: Record<Exclude<LeadStage, "lost">, number>;
  bySource: FunnelCount[];
  /** Tool CTAs ("talk to a counsellor" from predictor / mock test / Ask Aspire / planner); `none` = no tool. Always set by `funnelReport`. */
  byTool?: FunnelCount[];
  byCentre: FunnelCount[];
  byProgram: FunnelCount[];
  byCounsellor: (FunnelCount & { userId: string | null; displayName: string | null })[];
  lostReasons: { key: string; count: number }[];
  /** contacted / total and enrolled / total (0 when total is 0), rounded to 4 decimals. */
  conversion: { contactedRate: number; enrolledRate: number };
}

/** Service result. `not_found` also covers leads the viewer may not see (no existence leak). */
export type CrmErrorCode = "not_found" | "forbidden" | "validation" | "conflict";

export type CrmResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CrmErrorCode; message: string; fieldErrors?: Record<string, string[]> };
