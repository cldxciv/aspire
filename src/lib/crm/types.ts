/**
 * CRM (lead & admission engine, M7) — shared types and constants. CLIENT-SAFE: no server-only
 * imports, no I/O. Client components import from here ("@/lib/crm/types"); server code may import
 * everything from "@/lib/crm" (which re-exports this file). Owner: CRM-CORE. See docs/crm.md.
 *
 * Times in every shape below are ISO-8601 strings (UTC) unless the name says `Ms` (epoch ms).
 */

import type {
  CaptureExistingMode,
  LeadOrigin,
  LeadOriginView,
  LeadRoutingView,
  SlaClockView,
  SlaFilter,
  SystemConsentMethod,
} from "./lead-ops-types";

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
/**
 * True for a lead-gate consent sentence id ("2026-10-21.gate.v1"; src/lib/lead-gate/contract.ts
 * LEAD_GATE_CONSENT_VERSIONS). Matched by shape, not by the live list, so a retired gate version
 * still reads as a gate capture on old leads. Client-safe (no zod import into CRM pages).
 */
export function isGateConsentVersion(version: unknown): boolean {
  return typeof version === "string" && /^\d{4}-\d{2}-\d{2}\.gate\.v\d+$/.test(version);
}
/** SQL LIKE pattern for the same check (gate counts in reports). */
export const GATE_CONSENT_VERSION_LIKE = "%.gate.v%";
export const MANUAL_LEAD_SOURCES = ["walk_in", "phone_call", "referral", "other"] as const;
/**
 * Lead routing (docs/lead-routing-plan.md §14.2): leads from Meta lead forms (live or imported from
 * a Leads Center download) and from lists staff import with the families' consent.
 */
export const INTAKE_SOURCES = ["meta_lead_ad", "csv_import"] as const;
/**
 * How a family entered by staff agreed to be contacted (admin-console plan §8, Agent B): said yes
 * in person, on the phone, signed a form, or agreed in a WhatsApp / SMS message. Kept on the
 * `created` activity as proof of consent (survives erase: it is not personal data).
 */
export const CONSENT_METHODS = ["in_person", "phone", "written", "message"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];
/** What staff do when the number they type already has a lead: add to it, or only report it. */
export const MANUAL_DUPLICATE_MODES = ["append", "report"] as const;
export type ManualDuplicateMode = (typeof MANUAL_DUPLICATE_MODES)[number];
/** Why an admin erased a lead's personal data (kept on the erase entry and in the audit log). */
export const ERASE_REASONS = ["family_request", "consent_withdrawn", "wrong_or_test", "no_longer_needed", "other"] as const;
export type EraseReason = (typeof ERASE_REASONS)[number];
export const KNOWN_LEAD_SOURCES = [...PUBLIC_LEAD_SOURCES, ...MANUAL_LEAD_SOURCES, ...INTAKE_SOURCES] as const;
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
   * created { source, consentMethod?, existing?: true, filled? } · erase { reason? } ·
   * lead gate (docs/lead-gate-plan.md): submission also { submittedBy?: "student" | "parent", onLostLead?: true,
   *   accountId?, accountRole?: "student" | "parent" (shared while signed in to that account; dropped on erase) } ·
   * tool_use { tool, key, exam?, band?, feature?: "countdown" (planner), testId?, scoreBand?, page?, uses, lastAt } (never answers, questions,
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
  /** Lead routing (§13): the routing area (id + names), or null without an area. Lists always set it. */
  area?: { id: string; en: string; hi: string } | null;
  /** The open first-call clock (§15), or null when there is none. Lists always set it. */
  sla?: SlaClockView | null;
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
  /** Lead routing (§13, §20): area, how it was matched and the family's own words; null = never routed. */
  routing?: LeadRoutingView | null;
  /** Imported / Meta leads (§18): where the lead came from (refs only). */
  origins?: LeadOriginView[];
  /**
   * A Meta lead form without the configured consent checkbox (or an imported Meta row without it):
   * staff confirm consent and that they speak to a parent / guardian on the first call (H4).
   */
  confirmConsent?: boolean;
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
  /** Lead routing (§13.5, §21): an area id, `none` (no area) or `tool_signups`. Only ever narrows the viewer's scope. */
  area?: string;
  /** First-call clock (§15): `open`, `overdue` or `escalated`. */
  sla?: SlaFilter;
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
  consent: {
    textVersion: string;
    at?: number;
    locale?: string | null;
    text?: string | null;
    /** System consent (§14.2, H4): Meta lead form or an imported list. Never offered by "Add enquiry". */
    method?: SystemConsentMethod;
  };
  context?: LeadContext;
  /** The enquiry reference shown to the family (ENQ-…), kept on the submission activity. */
  reference?: string | null;
  /** Lead gate: who filled in the form. Kept on the submission activity (not a lead field). */
  submittedBy?: GateSubmitter | null;
  /**
   * Lead routing (§13.4, §13.8): the place the family gave (an HP district id or `outside-hp` from
   * the forms, a Meta `district` / `city` answer, a CSV column), ≤ 60. Routes the lead; kept on the
   * routing row (wiped on erase), never on the lead.
   */
  district?: string | null;
  /** The family's state, when given (a non-HP state only matches `border` aliases; A8). */
  state?: string | null;
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
  /**
   * Lead gate only (`gate: true`; owner decision 22 Oct 2026): the signed-in student or parent
   * account that shared the details. Kept on the submission activity as `accountId` (the opaque
   * account id) + `accountRole`; nothing else from the account is copied. Not kept after an erase.
   */
  account?: GateAccountLink | null;
  /**
   * Lead routing §14.2 (CORE, additive). `origin`: idempotency (an existing `(provider, externalId)`
   * returns `alreadyImported` and writes nothing; otherwise the ref is stored once the lead is known).
   */
  origin?: LeadOrigin;
  /**
   * `merge` (default) = today's behaviour. `attach` (imports, late Meta leads; H3, A4): an existing
   * family only gets a `submission` entry (meta `attached: true`), +1 submission and its empty,
   * never staff-edited fields filled — never its consent, stage, lost reason, assignee or message,
   * and no clock. New families behave like `merge`.
   */
  existing?: CaptureExistingMode;
  /**
   * Meta chronology (H3): switch to `attach` when the Meta `createdAt` is earlier than the lead's last
   * move to `lost` / `enrolled` or its last consent withdrawal.
   */
  attachIfOlderThanHistory?: { createdAt: number | null };
  /**
   * Erase suppression (M5): when the keyed hash of the phone is suppressed and (`createdAt` is null
   * or earlier than the erase), return `erased_family` and write nothing.
   */
  suppression?: { createdAt: number | null };
  /** ≤ 12 primitive keys added to the submission activity's meta (import batch, Meta form / ad ids …). */
  submissionMeta?: SubmissionMeta;
  /** ≤ 1000: the family's other answers; the submission body when there is no message; erased like a message. */
  answers?: string | null;
  /** CSV option: start (true) / never start (false) a first-call clock for a NEW family; undefined = policy. */
  slaClock?: boolean;
  clockReason?: "import";
  /** Clock start (epoch ms): now by default; Meta uses the inbox `received_at`. */
  arrivedAt?: number;
}

/** Structured facts a capture may add to its submission entry (primitives only). */
export type SubmissionMeta = Record<string, string | number | boolean | null>;

/** A portal account linked to a lead-gate submission (student or parent accounts only; never staff). */
export interface GateAccountLink {
  userId: string;
  role: GateSubmitter;
}

export type CaptureLeadError = "consent_missing" | "invalid_phone" | "invalid_input" | "erased_family";

/** §14.2: `attached` = an existing family in attach mode; `alreadyImported` = the origin ref existed (nothing written). */
export type CaptureLeadResult =
  | { ok: true; leadId: string; isNew: boolean; assigneeId: string | null; attached?: true; alreadyImported?: true }
  | { ok: false; error: CaptureLeadError };

/** The result when no `suppression` was asked for: never `erased_family`. */
export type UnsuppressedCaptureResult =
  | Extract<CaptureLeadResult, { ok: true }>
  | { ok: false; error: Exclude<CaptureLeadError, "erased_family"> };

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
  /** How the family agreed (kept on the `created` activity). */
  consentMethod?: ConsentMethod | null;
  /** Lead routing (§13.8): an HP district id or `outside-hp`, optional. */
  district?: string | null;
  /**
   * The phone already has a lead: `append` (default) adds this contact to it; `report` changes
   * nothing and answers `duplicate: true` so the screen can offer "Open" / "Log a visit".
   */
  onDuplicate?: ManualDuplicateMode;
}

/** `createManualLead` / POST /api/crm/leads answer when something was written (a new lead, or this contact added to the family on file). */
export interface ManualLeadResult {
  leadId: string;
  isNew: boolean;
  duplicate?: false;
  /** The viewer may open the lead (a counsellor may log a visit on a family assigned to someone else). */
  canOpen: boolean;
}

/**
 * `onDuplicate: "report"` found the family on file and changed nothing (the check itself is
 * audited as `crm.lead_duplicate_check`, without phone or name).
 */
export interface ManualLeadDuplicate {
  duplicate: true;
  isNew: false;
  /** The lead's id — `null` when the viewer may not open it (no ids outside their scope). */
  leadId: string | null;
  canOpen: boolean;
  /** The family's lead is closed (`lost`): "Log a visit" reopens it. */
  closed: boolean;
  /** The family's latest word was "Stop Aspire contacting me": only log a visit if they agreed again. */
  withdrawn: boolean;
}

/** Every answer of `createManualLead` / POST /api/crm/leads. */
export type ManualLeadAnswer = ManualLeadResult | ManualLeadDuplicate;

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
  /**
   * Super admin (D-044): an admin with an active grant, checked per request. Never set for staff
   * or for MCP callers. Missing = false.
   */
  superAdmin?: boolean;
  /**
   * Explicit manager scope (H2; `crm_staff_scope` mode `areas`): the areas they answer for
   * (`responsibleAreaIds`) and the centres in those areas. Missing = the legacy centre scope.
   */
  areaScope?: { areaIds: string[]; centreSlugs: string[] };
  /** Where the request came from: the CRM UI, or an assistant over MCP (never resolves a clock, L3). Missing = "ui". */
  channel?: "ui" | "mcp";
}

export interface CrmPermissions {
  canAssign: boolean;
  canExport: boolean;
  canErase: boolean;
  /** Staff logins, CRM role, scope and active flag (D-044, Q7): super admins only. */
  canManageStaff: boolean;
  canViewStaff: boolean;
  /** Assignment rules and the routing mode: super admins only. */
  canEditRules: boolean;
  canCreateLeads: boolean;
  /** Lead routing §22. */
  isSuperAdmin: boolean;
  /** `/crm/dashboard`: managers (their areas), admins, super admins. */
  canViewDashboard: boolean;
  /** `/crm/settings/**` pages (read-only unless `canEditSettings`). */
  canViewSettings: boolean;
  /** Areas, people, calling hours, speed rule, routing mode: super admins only. */
  canEditSettings: boolean;
  /** CSV import: super admins only. */
  canImport: boolean;
  /** Import history: admins (every super admin is an admin). */
  canViewImportHistory: boolean;
  /** Meta settings, secrets, actions and the Meta inbox: super admins only. */
  canManageIntegrations: boolean;
  /** Meta connection status (no secrets): managers and admins. */
  canViewIntegrationStatus: boolean;
  /** "Reassign uncalled leads of X": area heads (their own members) and super admins. */
  canReassignBulk: boolean;
  /**
   * "Away until …" for themselves (staff). Who may set it for SOMEONE ELSE (an area head for their
   * members, a super admin for anyone) is `canSetAvailability(viewer, targetId)` in access.ts.
   */
  canSetOwnAvailability: boolean;
}

export function crmPermissions(viewer: Pick<CrmViewer, "role"> & { superAdmin?: boolean }): CrmPermissions {
  const admin = viewer.role === "admin";
  const manager = viewer.role === "manager";
  const superAdmin = admin && viewer.superAdmin === true;
  return {
    canAssign: admin || manager,
    canExport: admin || manager,
    canErase: admin,
    canManageStaff: superAdmin,
    canViewStaff: admin || manager,
    canEditRules: superAdmin,
    canCreateLeads: true,
    isSuperAdmin: superAdmin,
    canViewDashboard: admin || manager,
    canViewSettings: admin || manager,
    canEditSettings: superAdmin,
    canImport: superAdmin,
    canViewImportHistory: admin,
    canManageIntegrations: superAdmin,
    canViewIntegrationStatus: admin || manager,
    canReassignBulk: superAdmin || manager,
    canSetOwnAvailability: !admin,
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
  /**
   * Lead gate (contact details before a free tool's result): forms received per IST day in the
   * range, newest day first, days with none left out. `newFamilies` created a lead;
   * `knownFamilies` were already on file. Counted by when the form arrived, not by lead creation.
   */
  gateDaily?: GateDayCount[];
}

export interface GateDayCount {
  /** IST calendar day `YYYY-MM-DD`. */
  day: string;
  newFamilies: number;
  knownFamilies: number;
}

/** Service result. `not_found` also covers leads the viewer may not see (no existence leak). */
export type CrmErrorCode = "not_found" | "forbidden" | "validation" | "conflict";

export type CrmResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: CrmErrorCode; message: string; fieldErrors?: Record<string, string[]> };
