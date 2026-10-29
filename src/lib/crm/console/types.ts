/**
 * Admin console Phase 1b — shared contracts (docs/admin-phase-1b-plan.md §4.1; owner: 1B-CORE,
 * frozen once 1B-CORE finished: a package that needs a change reports it). CLIENT-SAFE: no
 * server-only imports, no I/O. Phase 2 and Asha reuse the slot registry and the channel list.
 *
 * Times are ISO-8601 strings unless the name says `Ms` (epoch ms). Sessions run April–March in IST.
 */

import type { ContactOutcome, CrmPermissions, CrmViewer, LeadStage, LeadTask } from "../types";

// ---------------------------------------------------------------------------------------------
// Sessions (IST)

/** "S2026" = 1 Apr 2026 00:00 IST … 1 Apr 2027 00:00 IST. */
export type SessionKey = `S${number}`;
export interface SessionRef {
  key: SessionKey;
  /** "2026–27". */
  label: string;
  fromMs: number;
  toMs: number;
}

// ---------------------------------------------------------------------------------------------
// Programmes and metrics for targets / admissions (open vocabularies: zod-validated, length-CHECKed in SQL)

export const CONSOLE_PROGRAMS = ["jee", "neet", "foundation", "integrated", "any"] as const;
export type ConsoleProgram = (typeof CONSOLE_PROGRAMS)[number];
export const TARGET_METRICS = ["admissions", "enquiries", "counselling"] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];
export interface TargetCell {
  centreSlug: string;
  program: ConsoleProgram;
  metric: TargetMetric;
  value: number;
}
export interface TargetGrid {
  period: SessionKey;
  cells: TargetCell[];
  updatedAt: string | null;
  updatedBy: string | null;
}

// ---------------------------------------------------------------------------------------------
// Channels (how the family reached us) — order = classifier priority = tie-break order (§6.6)

export const CHANNELS = [
  "meta_ads",
  "scholarship_test",
  "imported_list",
  "paper_forms",
  "walk_in",
  "phone_call",
  "referral",
  "staff_other",
  "rancho",
  "free_tools",
  "google_maps",
  "ai_assistants",
  "paid_ads",
  "facebook_instagram",
  "search_engines",
  "whatsapp",
  "social",
  "campaign",
  "other_websites",
  "direct",
] as const;
export type Channel = (typeof CHANNELS)[number];

// ---------------------------------------------------------------------------------------------
// More enquiry details (open vocabularies: zod only; hostel is closed, SQL CHECK)

export const BOARDS = ["hpbose", "cbse", "icse", "other"] as const;
export type Board = (typeof BOARDS)[number];
export const HOSTEL_ANSWERS = ["yes", "no", "maybe"] as const;
export type HostelAnswer = (typeof HOSTEL_ANSWERS)[number];
export const TARGET_EXAMS = ["jee", "neet", "foundation", "boards", "other"] as const;
export type TargetExam = (typeof TARGET_EXAMS)[number];
export const HEARD_VIA = [
  "newspaper",
  "poster",
  "seminar",
  "google_maps",
  "google_search",
  "ai_assistant",
  "social_media",
  "old_student",
  "friend_family",
  "school_teacher",
  "other",
] as const;
export type HeardVia = (typeof HEARD_VIA)[number];
export const PREFERRED_TIMES = ["morning", "afternoon", "evening", "any"] as const;
export type PreferredTime = (typeof PREFERRED_TIMES)[number];
export const DECISION_MAKERS = ["father", "mother", "both_parents", "guardian", "student", "other"] as const;
export type DecisionMaker = (typeof DECISION_MAKERS)[number];

export interface LeadMoreDetails {
  altPhone: string | null;
  school: string | null;
  board: Board | null;
  hostel: HostelAnswer | null;
  targetExam: TargetExam | null;
  targetYear: number | null;
  heardVia: HeardVia | null;
  referredBy: string | null;
  intakeSession: SessionKey | null;
  preferredTime: PreferredTime | null;
  decisionMaker: DecisionMaker | null;
  updatedAt: string | null;
}

/** The editable fields of `LeadMoreDetails` (CORE addition: one list for the form, the API and the timeline labels). */
export const LEAD_DETAIL_FIELDS = [
  "altPhone",
  "school",
  "board",
  "hostel",
  "targetExam",
  "targetYear",
  "heardVia",
  "referredBy",
  "intakeSession",
  "preferredTime",
  "decisionMaker",
] as const satisfies readonly (keyof LeadMoreDetails)[];
export type LeadDetailField = (typeof LEAD_DETAIL_FIELDS)[number];
/** Timeline `field_update { fields: ["details.school", …] }` entries use this prefix. */
export const DETAIL_FIELD_PREFIX = "details.";

// ---------------------------------------------------------------------------------------------
// Follow-ups

export const FOLLOW_UP_PRESETS = ["later_today", "tomorrow", "in_3_days"] as const;
export type FollowUpPreset = (typeof FOLLOW_UP_PRESETS)[number];
export type NextFollowUp =
  | { kind: "preset"; preset: FollowUpPreset }
  | { kind: "at"; at: string /* ISO */ }
  | { kind: "none"; reason: "wrong_number" | "closing" | "has_other_task" };
/** Decision 9: "not reachable" is suggested after this many unanswered calls in a row. */
export const NOT_REACHABLE_AFTER = 5;
/** Decision 9's outer limit (IST): no follow-up is set before 08:00 or after 21:00. */
export const HARD_CALL_WINDOW = { start: "08:00", end: "21:00" } as const;
/**
 * Rhythm rule keys (§5.C). `contacted_later` (CORE addition) is the "past day 10 → in 3 days" row;
 * 1B-CALLS may use `contacted_d10` there instead.
 */
export const RHYTHM_RULE_KEYS = [
  "retry",
  "switched_off",
  "call_back",
  "wrong_number",
  "contacted_d2",
  "contacted_d5",
  "contacted_d10",
  "contacted_later",
  "booked",
  "after_visit_d1",
  "after_visit_d3",
  "after_test",
  "closed",
] as const;
export type RhythmRuleKey = (typeof RHYTHM_RULE_KEYS)[number];
export interface AttemptSummary {
  calls: number;
  unansweredStreak: number;
  suggestNotReachable: boolean;
}
export interface FollowUpContext {
  now: string;
  presets: Record<FollowUpPreset, string>;
  suggested: { next: NextFollowUp; ruleKey: RhythmRuleKey } | null;
  attempts: AttemptSummary;
  openTask: { id: string; dueAt: string | null; title: string } | null;
  openTaskCount: number;
  outsideCallingHoursNow: boolean;
  callingHoursLabel: string;
  stage: LeadStage;
  templateSlots: TemplateSlotValues;
  defaultLang: TemplateLang;
}
export interface OutcomeInput {
  contact: {
    channel: "call" | "whatsapp";
    outcome: ContactOutcome;
    note?: string | null;
    template?: { key: string; lang: TemplateLang } | null;
  } | null;
  taskId?: string | null;
  next: NextFollowUp;
  nextTitle?: string | null;
  markNotReachable?: boolean;
  markLostWrongNumber?: boolean;
}
export interface OutcomeResult {
  activityId: number | null;
  task: LeadTask | null;
  completedTaskId: string | null;
  attempts: AttemptSummary;
  stage: LeadStage;
  outsideCallingHours: boolean;
}

// ---------------------------------------------------------------------------------------------
// Templates — ONE slot registry for 1b, Phase 2 and Asha (names follow docs/admissions-agent-voice.md)

/** Open vocabulary: 'general' = the lead-page composer; Phase 2 adds 'booking' and 'test'. */
export const TEMPLATE_CONTEXTS = ["general", "booking", "test"] as const;
export type TemplateContext = (typeof TEMPLATE_CONTEXTS)[number];
export const TEMPLATE_LANGS = ["en", "hi", "hinglish"] as const;
export type TemplateLang = (typeof TEMPLATE_LANGS)[number];
export const TEMPLATE_STATUSES = ["draft", "approved", "retired"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
export const TEMPLATE_SLOTS = [
  "parent_name",
  "student_first_name",
  "counsellor_name",
  "centre",
  "centre_map_link",
  "prospectus_link",
  "date",
  "time",
  "test_date",
  "registration_deadline",
  "batch_start",
  "days",
  "test_name",
  "roll_no",
  "reporting_time",
  "venue",
  "admit_link",
  "bring_list",
  "meet_person",
] as const;
export type TemplateSlot = (typeof TEMPLATE_SLOTS)[number];
/** 1b fills these; staff type the rest. */
export const AUTO_FILLED_SLOTS = [
  "parent_name",
  "student_first_name",
  "counsellor_name",
  "centre",
  "centre_map_link",
  "prospectus_link",
] as const satisfies readonly TemplateSlot[];
/** `^[a-z][a-z0-9_]{0,39}$`, validated against `crm_wa_templates`. */
export type TemplateKey = string;
export const TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const SEED_KEYS_1B = [
  "first_contact",
  "missed_call",
  "centre_location",
  "prospectus",
  "visit_invite",
  "test_date",
  "batch_start",
  "after_visit",
] as const;
export type TemplateSlotValues = Partial<Record<TemplateSlot, string>>;
export interface WaTemplate {
  key: TemplateKey;
  context: string;
  position: number;
  status: TemplateStatus;
  bodies: Record<TemplateLang, string>;
  version: number;
  seeded: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------------------------
// Settings documents added by 1b (`crm_settings` keys `centre_links`, `wa_links`; §3)

export interface CentreLinksSetting {
  centres: Record<string, { mapsUrl: string | null }>;
}
export interface WaLinksSetting {
  prospectusUrl: string | null;
}
/** Every link stored in these documents is https and at most this long. */
export const CONSOLE_URL_MAX = 300;

// ---------------------------------------------------------------------------------------------
// Numbers and attention

/** `slug: null` = "No centre yet". */
export interface CentreRef {
  slug: string | null;
  label: string;
  demo: boolean;
}
/** LOCALE-FREE hrefs (localise with `localePath`). */
export interface CentreNumberLinks {
  today: string;
  week: string;
  notCalled: string;
  notCalledOver24h: string;
  overdue: string;
  admissions: string;
  sources: string;
}
export interface CentreNumbers {
  centre: CentreRef;
  enquiriesToday: number;
  enquiriesWeek: number;
  toolSignupsWeek: number;
  importedWeek: number;
  erasedWeek: number;
  notCalled: number;
  notCalledOver24h: number;
  overdue: number;
  admissionsSession: number;
  sessionTarget: number | null;
  topSources: { channel: Channel; count: number }[];
  enquiries30d: number;
  links: CentreNumberLinks;
}
export interface ConsoleNumbers {
  generatedAt: string;
  session: SessionRef;
  rows: CentreNumbers[];
  total: CentreNumbers;
  centreListIsDemo: boolean;
}
export const ATTENTION_KINDS = ["unassigned", "tool_signups", "not_called_24h", "overdue_by_counsellor", "lost_to_review"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];
export interface AttentionItem {
  kind: AttentionKind;
  count: number;
  href: string;
  userId?: string | null;
  name?: string | null;
}

// ---------------------------------------------------------------------------------------------
// Console permissions (derived; never stored)

export interface ConsolePermissions {
  canViewNumbers: boolean;
  canEditTargets: boolean;
  canViewTargets: boolean;
  canViewSources: boolean;
  canSeeToolUsage: boolean;
  canEditCentreLinks: boolean;
  canReviewLost: boolean;
  canManageTemplates: boolean;
  canViewTemplateAdmin: boolean;
  canEditDetails: boolean;
}

/**
 * Plan §4.1 / §7: numbers, targets (read), sources, lost review and the template admin page (read)
 * = CRM admins and managers; tool usage rows = CRM admins; targets edit, centre links edit and
 * template manage = super admins; details edit = everyone (lead visibility is checked separately).
 * Duplicate dismissal is decided per pair (§5.F). Every page and API checks again on the server.
 */
export function consolePermissions(viewer: Pick<CrmViewer, "role">, p: Pick<CrmPermissions, "isSuperAdmin">): ConsolePermissions {
  const adminOrManager = viewer.role === "admin" || viewer.role === "manager";
  const superAdmin = viewer.role === "admin" && p.isSuperAdmin === true;
  return {
    canViewNumbers: adminOrManager,
    canEditTargets: superAdmin,
    canViewTargets: adminOrManager,
    canViewSources: adminOrManager,
    canSeeToolUsage: viewer.role === "admin",
    canEditCentreLinks: superAdmin,
    canReviewLost: adminOrManager,
    canManageTemplates: superAdmin,
    canViewTemplateAdmin: adminOrManager,
    canEditDetails: true,
  };
}
