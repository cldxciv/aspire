/**
 * Lead routing, the 1-hour call rule and Meta Lead Ads — every shared type and constant of
 * docs/lead-routing-plan.md §11 – §19 (owner: LR-CORE; FROZEN after LR-CORE: a package that needs a
 * change reports it instead of editing this file). CLIENT-SAFE: no server-only imports, no I/O.
 *
 * Times in API shapes are ISO-8601 strings (UTC) unless a name says `Ms` / `At` on a server-side
 * row (epoch ms). Settings documents (`crm_settings`) hold exactly the shapes below as JSON.
 */
import type { ContactOutcome, CrmRole, LeadStage } from "./types";

// ---------------------------------------------------------------------------------------------
// §11 Super admin (D-044)

export const SUPER_ADMIN_VIAS = ["bootstrap", "cli", "admin"] as const;
export type SuperAdminVia = (typeof SUPER_ADMIN_VIAS)[number];

/** One active grant, as GET /api/admin/super-admins lists it (admins only; never a secret). */
export interface SuperAdminEntry {
  userId: string;
  displayName: string;
  loginId: string;
  via: SuperAdminVia;
  grantedAt: string;
  /** null = set automatically (bootstrap) or by the server command (CLI). */
  grantedBy: { userId: string; displayName: string } | null;
  /** The grant counts: the account is an enabled admin. */
  effective: boolean;
}

/** GET /api/admin/super-admins and PUT /api/admin/super-admins/:userId answer. */
export interface SuperAdminList {
  items: SuperAdminEntry[];
  youAreSuperAdmin: boolean;
  /** No effective super admin exists: every admin sees the "run the server command" banner. */
  bootstrapPending: boolean;
}

/** Fixed refusal codes (API `fieldErrors` / messages map onto these). */
export const SUPER_ADMIN_ERRORS = ["last_super_admin", "super_admin_target", "super_admin_only", "not_admin"] as const;
export type SuperAdminError = (typeof SUPER_ADMIN_ERRORS)[number];

/** The server command an admin is told to run when nobody is super admin yet. */
export const SUPER_ADMIN_CLI = "npm run auth:super-admin -- grant <login id>";

// ---------------------------------------------------------------------------------------------
// §12 Settings documents (`crm_settings`)

export const CRM_SETTING_KEYS = ["calling_hours", "speed_rule", "routing", "areas_seed", "meta_config", "meta_status"] as const;
export type CrmSettingKey = (typeof CRM_SETTING_KEYS)[number];

/** A settings document with its optimistic-lock version (`expectedVersion` on every PUT). */
export interface SettingEnvelope<T> {
  key: CrmSettingKey;
  value: T;
  /** 0 = never saved (the default is shown). */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------------------------
// §13 Areas and routing (D-045)

/** Himachal Pradesh's 12 districts: the seeded area ids (src/content/hp-districts.ts uses the same ids). */
export const HP_DISTRICT_IDS = [
  "bilaspur",
  "chamba",
  "hamirpur",
  "kangra",
  "kinnaur",
  "kullu",
  "lahaul-spiti",
  "mandi",
  "shimla",
  "sirmaur",
  "solan",
  "una",
] as const;
export type HpDistrictId = (typeof HP_DISTRICT_IDS)[number];
/** The enquiry forms' "Outside Himachal" district choice. */
export const OUTSIDE_HP = "outside-hp";
/** Every value the optional enquiry `district` field accepts (empty = not given). */
export const DISTRICT_INPUT_VALUES = [...HP_DISTRICT_IDS, OUTSIDE_HP] as const;
export type DistrictInputValue = (typeof DISTRICT_INPUT_VALUES)[number];

export function isHpDistrictId(value: unknown): value is HpDistrictId {
  return typeof value === "string" && (HP_DISTRICT_IDS as readonly string[]).includes(value);
}

/** Free-text place input (the family's words) is cut to this length everywhere. */
export const PLACE_INPUT_MAX = 60;

export const AREA_KINDS = ["district", "custom"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
export const ALIAS_KINDS = ["district", "town", "spelling", "hindi", "border"] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number];
export const ROUTING_MATCHES = ["centre", "district", "town", "spelling", "hindi", "border", "fuzzy", "manual"] as const;
export type RoutingMatch = (typeof ROUTING_MATCHES)[number];
export const ROUTING_OUTCOMES = ["area", "unknown", "ambiguous", "outside_hp", "empty"] as const;
export type RoutingOutcome = (typeof ROUTING_OUTCOMES)[number];

/** Where a lead was routed (`routeLead`; also stored in `crm_lead_routing`). */
export interface RoutingResult {
  areaId: string | null;
  outcome: RoutingOutcome;
  match: RoutingMatch | null;
}

/** The resolver's answer for one place name (GET /api/crm/areas/resolve). */
export interface AreaResolution extends RoutingResult {
  /** `normaliseAlias()` of the input (null when empty). */
  key: string | null;
  /** Ambiguous: the areas it could be. */
  candidates?: string[];
}

export const ROUTING_MODES = ["areas", "legacy"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];
/** `crm_settings.routing`. */
export interface RoutingSettings {
  mode: RoutingMode;
}
export const DEFAULT_ROUTING_SETTINGS: RoutingSettings = { mode: "areas" };

/** `crm_settings.areas_seed`: once present, the seed never runs again. */
export interface AreasSeedSetting {
  seededAt: string;
  version: 1;
}

export interface CrmAreaAlias {
  key: string;
  label: string;
  kind: AliasKind;
}

/** A person in an area (role from `crm_staff`: manager = area head, counsellor = executive). */
export interface CrmAreaMember {
  userId: string;
  displayName: string;
  crmRole: CrmRole;
  centreSlug: string | null;
  /** Managers only: also in the call pool. */
  takesLeads: boolean;
  active: boolean;
  disabled: boolean;
  awayUntil: string | null;
}

/** GET /api/crm/areas item. */
export interface CrmArea {
  id: string;
  nameEn: string;
  nameHi: string;
  kind: AreaKind;
  /** Serving centre when the family named none. */
  defaultCentreSlug: string | null;
  active: boolean;
  mergedInto: string | null;
  position: number;
  centres: string[];
  aliases: CrmAreaAlias[];
  members: CrmAreaMember[];
  coverage: {
    hasExecutive: boolean;
    hasHead: boolean;
    /** The serving area whose team covers this one when it has nobody (A1); null = none needed / none. */
    coveredBy: string | null;
  };
}

/** Inbox `area` filter values besides an area id. */
export const AREA_FILTER_NONE = "none";
export const AREA_FILTER_TOOL_SIGNUPS = "tool_signups";

/** An area's display name in both languages (lists pick the viewer's language). */
export interface AreaName {
  id: string;
  en: string;
  hi: string;
  active: boolean;
}

/** Routing facts on the lead page (`LeadDetail.routing`). */
export interface LeadRoutingView {
  areaId: string | null;
  areaName: { en: string; hi: string } | null;
  match: RoutingMatch | null;
  outcome: RoutingOutcome;
  /** The family's words (≤ 60); null after erase. */
  placeInput: string | null;
  /** Every arrival so far was a tool sign-up. */
  gateOnly: boolean;
  routedAt: string;
  /** Display name of the person who set the area by hand; null = automatic. */
  routedBy: string | null;
}

/** GET /api/crm/areas/unmatched item (A8). */
export interface UnmatchedPlace {
  key: string;
  /** One example of what families typed. */
  sample: string;
  count: number;
  open: number;
  outcomes: RoutingOutcome[];
}

/** "Away until …" (A5). */
export const AVAILABILITY_MAX_DAYS = 60;
export const AVAILABILITY_NOTE_MAX = 80;
export interface StaffAvailability {
  userId: string;
  /** null = available. */
  awayUntil: string | null;
  note: string | null;
}

export const REASSIGN_SCOPES = ["uncalled", "open"] as const;
export type ReassignScope = (typeof REASSIGN_SCOPES)[number];

// ---------------------------------------------------------------------------------------------
// §14 Lead arrival (the pipeline every capture goes through; src/lib/crm/arrival.ts)

export type ArrivalKind = "new" | "reopened" | "repeat" | "attached";

export interface LeadArrival {
  leadId: string;
  /** attached = existing family, attach mode (history only). */
  kind: ArrivalKind;
  source: string;
  /** Lead-gate capture. */
  gate: boolean;
  /** Staff-entered (walk-in, phone call, …). */
  manual: boolean;
  /** ≤ 60, the family's words. */
  districtInput: string | null;
  stateInput: string | null;
  /** false = LEAD_GATE_ASSIGN=none. */
  assignNew: boolean;
  /** CSV option; undefined = policy. */
  slaClock?: boolean;
  clockReason?: "import";
  /** Clock start: now, or the Meta inbox `received_at`. */
  arrivedAt: number;
  actorId: string | null;
  at: number;
}

export interface ArrivalResult {
  areaId: string | null;
  assigneeId: string | null;
  clockStarted: boolean;
}

/** Consent recorded by the system for imported / Meta leads; never offered by "Add enquiry" (H4). */
export const SYSTEM_CONSENT_METHODS = ["meta_lead_form", "csv_import"] as const;
export type SystemConsentMethod = (typeof SYSTEM_CONSENT_METHODS)[number];

export const META_LEAD_SOURCE = "meta_lead_ad";
export const CSV_LEAD_SOURCE = "csv_import";
export const INTAKE_LEAD_SOURCES = [META_LEAD_SOURCE, CSV_LEAD_SOURCE] as const;

export const EXTERNAL_PROVIDERS = ["meta", "csv"] as const;
export type ExternalProvider = (typeof EXTERNAL_PROVIDERS)[number];
/** `CaptureLeadOptions.origin`: idempotency key of an imported / Meta lead. */
export interface LeadOrigin {
  provider: ExternalProvider;
  externalId: string;
  batchId?: string;
}

export const CAPTURE_EXISTING_MODES = ["merge", "attach"] as const;
export type CaptureExistingMode = (typeof CAPTURE_EXISTING_MODES)[number];
/** `CaptureLeadOptions.submissionMeta`: at most this many primitive keys. */
export const SUBMISSION_META_MAX_KEYS = 12;
/** `CaptureLeadOptions.answers`: at most this many characters. */
export const CAPTURE_ANSWERS_MAX = 1000;

/** Lead page: where an imported / Meta lead came from (`LeadDetail.origin`). */
export interface LeadOriginView {
  provider: ExternalProvider;
  /** Meta lead id (digits) for provider `meta`; null for keyed CSV refs. */
  metaLeadId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------------------------
// §15 Speed rule, calling hours, escalation (D-046)

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DayHours {
  open: boolean;
  /** "HH:MM", IST. */
  start: string;
  end: string;
}

/** `crm_settings.calling_hours`: hours when executives are actually at their phones (A7). */
export interface CallingHours {
  timezone: "Asia/Kolkata";
  week: Record<Weekday, DayHours>;
  /** YYYY-MM-DD, at most CALLING_HOURS_LIMITS.closedDates. */
  closedDates: string[];
}

/** `crm_settings.speed_rule`. */
export interface SpeedRule {
  /** Working minutes, 5–480; default 60. */
  firstCallMinutes: number;
  /** Default any_attempt (Q6). */
  countOnly: "any_attempt" | "connected";
  tiers: {
    /** Default true, 60. */
    areaHead: { enabled: boolean; afterMinutes: number };
    /** Default true, 240; > areaHead; ≤ 4320. */
    superAdmin: { enabled: boolean; afterMinutes: number };
  };
  /** Default true, 120, 3. */
  retry: { enabled: boolean; firstAfterMinutes: number; maxAttempts: number };
  /** Default connected, call_back_requested. */
  reachedOutcomes: ContactOutcome[];
  /** "Reached within": default 600 (≈ one working day). */
  reachedTargetMinutes: number;
  /** Sources that start a clock. */
  sources: string[];
  /** Tool sign-ups start a clock (Q2: default false). */
  leadGate: boolean;
}

export const CALLING_HOURS_LIMITS = { closedDates: 60 } as const;
export const SPEED_RULE_LIMITS = {
  firstCallMinutes: { min: 5, max: 480 },
  tierMinutes: { min: 5, max: 4320 },
  retryFirstAfterMinutes: { min: 15, max: 1440 },
  retryMaxAttempts: { min: 1, max: 10 },
  reachedTargetMinutes: { min: 30, max: 4320 },
  sources: 30,
} as const;

/** Q1 default: Mon–Sat 09:00–19:00, Sun 10:00–13:00 IST, no closed dates. */
export const DEFAULT_CALLING_HOURS: CallingHours = {
  timezone: "Asia/Kolkata",
  week: {
    mon: { open: true, start: "09:00", end: "19:00" },
    tue: { open: true, start: "09:00", end: "19:00" },
    wed: { open: true, start: "09:00", end: "19:00" },
    thu: { open: true, start: "09:00", end: "19:00" },
    fri: { open: true, start: "09:00", end: "19:00" },
    sat: { open: true, start: "09:00", end: "19:00" },
    sun: { open: true, start: "10:00", end: "13:00" },
  },
  closedDates: [],
};

export const DEFAULT_SPEED_RULE: SpeedRule = {
  firstCallMinutes: 60,
  countOnly: "any_attempt",
  tiers: { areaHead: { enabled: true, afterMinutes: 60 }, superAdmin: { enabled: true, afterMinutes: 240 } },
  retry: { enabled: true, firstAfterMinutes: 120, maxAttempts: 3 },
  reachedOutcomes: ["connected", "call_back_requested"],
  reachedTargetMinutes: 600,
  sources: ["hero", "admissions", "contact", "quick", "tool", META_LEAD_SOURCE, CSV_LEAD_SOURCE, "referral", "other"],
  leadGate: false,
};

export const CLOCK_REASONS = ["new", "reopened", "import"] as const;
export type ClockReason = (typeof CLOCK_REASONS)[number];
export const CLOCK_RESOLUTIONS = ["attempt", "closed", "erased"] as const;
export type ClockResolution = (typeof CLOCK_RESOLUTIONS)[number];
export const FIRST_ATTEMPT_CHANNELS = ["call", "whatsapp", "stage"] as const;
export type FirstAttemptChannel = (typeof FIRST_ATTEMPT_CHANNELS)[number];
/** Who logged a contact: a person in the CRM, or an assistant over MCP (never resolves a clock; L3). */
export type ContactLogVia = "ui" | "mcp";

/** `slaStateOf(clock, now)` (src/lib/crm/sla-state.ts); null = resolved. */
export const SLA_STATES = ["due", "overdue", "escalated"] as const;
export type SlaState = (typeof SLA_STATES)[number];
/** Inbox `sla` filter. */
export const SLA_FILTERS = ["open", "overdue", "escalated"] as const;
export type SlaFilter = (typeof SLA_FILTERS)[number];

/** The open first-call clock of a lead, as lists and the lead page show it. */
export interface SlaClockView {
  state: SlaState;
  reason: ClockReason;
  startedAt: string;
  dueAt: string;
  tier1At: string | null;
  tier2At: string | null;
}

export const SLA_VIEWS = ["mine", "area", "escalated", "unassigned", "tool_signups"] as const;
export type SlaView = (typeof SLA_VIEWS)[number];

/** GET /api/crm/sla?view=… item (masked phone only). */
export interface SlaQueueItem {
  leadId: string;
  displayName: string | null;
  phoneLast4: string | null;
  areaId: string | null;
  assignee: { userId: string; displayName: string } | null;
  source: string;
  clock: SlaClockView;
}

export interface SlaQueuePage {
  view: SlaView;
  items: SlaQueueItem[];
  total: number;
  generatedAt: string;
}

export type MetaPauseReason = "auth" | "permission";

/** GET /api/crm/sla/summary (the alert strip polls it every 60 s). */
export interface SlaSummary {
  generatedAt: string;
  mine: { callNow: number; overdue: number; nextDueAt: string | null; retriesDue: number };
  /** Area heads. */
  area?: {
    areas: { id: string; name: string; overdue: number; unassigned: number }[];
    byExecutive: { userId: string; name: string; overdue: number; away: boolean }[];
  };
  /** Super admins. */
  sa?: {
    escalated: number;
    unassignedNoArea: number;
    toolSignups: number;
    unmatchedPlaces: number;
    meta: { pending: number; failed: number; paused: MetaPauseReason | null; silentHours: number | null } | null;
  };
}

// ---------------------------------------------------------------------------------------------
// §16 Dashboard

export interface SpeedStats {
  clocks: number;
  met: number;
  metRate: number | null;
  reached: number;
  reachedRate: number | null;
  medianWorkMinutes: number | null;
}

export interface SpeedRow {
  key: string;
  label?: string;
  leads: number;
  attempted: number;
  met: number;
  missed: number;
  reached: number;
  medianWorkMinutes: number | null;
  open: number;
  overdue: number;
}

/** GET /api/crm/dashboard?from&to&area. */
export interface DashboardData {
  range: { from: string; to: string };
  scope: { areaIds: string[] | "all" };
  /** IST day, CRM arrival. */
  today: { newLeads: number; bySource: { key: string; count: number }[] };
  now: {
    callNow: number;
    overdue: number;
    escalated: number;
    unassignedInAreas: number;
    /** SA / admin only. */
    unassignedNoArea?: number;
    toolSignups?: number;
    unmatchedPlaces?: number;
    away: { userId: string; name: string; until: string }[];
  };
  speed: { live: SpeedStats; imported: SpeedStats };
  byArea: SpeedRow[];
  byExecutive: SpeedRow[];
  bySource: SpeedRow[];
  byCampaign: { key: string; total: number; contacted: number; reached: number; enrolled: number; junk: number }[];
  /** SA only. */
  meta?: {
    lastWebhookAt: string | null;
    lastImportAt: string | null;
    pending: number;
    failed: number;
    paused: MetaPauseReason | null;
    silentHours: number | null;
  };
}

// ---------------------------------------------------------------------------------------------
// §17 CSV import (D-048) and the shared field targets (CSV columns and Meta form questions)

/** Field targets a CSV column or a Meta question maps onto (src/lib/crm/intake/fields.ts guesses them). */
export const IMPORT_FIELD_TARGETS = [
  "metaLeadId",
  "createdTime",
  "formId",
  "formName",
  "adId",
  "adName",
  "adsetName",
  "campaignId",
  "campaignName",
  "platform",
  "isOrganic",
  "contactName",
  "studentName",
  "guardianName",
  "phone",
  "email",
  "district",
  "state",
  "currentClass",
  "programInterest",
  "centre",
  "submittedBy",
  "consentChecked",
] as const;
export type ImportFieldTarget = (typeof IMPORT_FIELD_TARGETS)[number];
/** `answer`: kept in the lead's answers text; `ignore`: not imported. */
export type ImportTarget = ImportFieldTarget | "answer" | "ignore";
export const IMPORT_TARGETS: readonly ImportTarget[] = [...IMPORT_FIELD_TARGETS, "answer", "ignore"];

export const IMPORT_DAMAGE_KINDS = ["phone_sci", "id_sci", "id_truncated", "text_mojibake"] as const;
export type ImportDamageKind = (typeof IMPORT_DAMAGE_KINDS)[number];

/** One mapped row the browser sends (values already normalised; the server re-validates). */
export interface ImportRowInput {
  row: number;
  metaLeadId?: string | null;
  createdTime?: string | null;
  formId?: string | null;
  formName?: string | null;
  adId?: string | null;
  adName?: string | null;
  adsetName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  platform?: string | null;
  isOrganic?: boolean | null;
  contactName?: string | null;
  studentName?: string | null;
  guardianName?: string | null;
  phone?: string | null;
  email?: string | null;
  district?: string | null;
  state?: string | null;
  currentClass?: string | null;
  programInterest?: string | null;
  centre?: string | null;
  submittedBy?: "student" | "parent" | null;
  consentChecked?: boolean | null;
  answers?: string | null;
  damaged?: ImportDamageKind[];
}

export const IMPORT_ROW_STATUSES = [
  "created",
  "attached",
  "already_imported",
  "erased_family",
  "invalid_phone",
  "missing_phone",
  "damaged",
  "consent_mismatch",
  "duplicate_in_file",
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

/** How the families on a list agreed to be contacted (required; H4). */
export const IMPORT_CONSENT_BASES = ["meta_lead_form", "in_person", "phone", "written", "message"] as const;
export type ImportConsentBasis = (typeof IMPORT_CONSENT_BASES)[number];
export const IMPORT_BATCH_KINDS = ["meta_csv", "csv"] as const;
export type ImportBatchKind = (typeof IMPORT_BATCH_KINDS)[number];

// ---------------------------------------------------------------------------------------------
// §18 Live Meta (D-047)

/** Pinned Graph API version (checked 22 Oct 2026); a super admin may override it. */
export const META_GRAPH_VERSION_DEFAULT = "v26.0";
export const META_GRAPH_VERSION_PATTERN = /^v\d{2}\.0$/;
export const META_INBOX_VIA = ["webhook", "sync", "manual"] as const;
export type MetaInboxVia = (typeof META_INBOX_VIA)[number];
export const META_INBOX_STATUSES = ["pending", "held", "processing", "imported", "duplicate", "test", "failed", "unavailable", "ignored"] as const;
export type MetaInboxStatus = (typeof META_INBOX_STATUSES)[number];
export const META_SECRET_NAMES = ["app_secret", "access_token", "page_token", "verify_token"] as const;
export type MetaSecretName = (typeof META_SECRET_NAMES)[number];
export const META_ACTIONS = [
  "check",
  "subscribe_page",
  "process_now",
  "retry_failed",
  "sync_forms",
  "sync_leads",
  "regenerate_verify_token",
  "reseal",
  "test_mode",
] as const;
export type MetaAction = (typeof META_ACTIONS)[number];

export interface MetaFormConfig {
  id: string;
  name: string;
  status: string;
  defaults: { programInterest?: string; centreSlug?: string };
  /** The form's consent checkbox (`custom_disclaimer_responses[].checkbox_key`); null = none set. */
  consentCheckboxKey: string | null;
}

/** `crm_settings.meta_config`: non-secret settings (secrets live in `crm_integration_secrets`). */
export interface MetaConfig {
  enabled: boolean;
  appId: string | null;
  pageId: string | null;
  graphVersion: string;
  tokenTransport: "header" | "query";
  fieldMap: Record<string, ImportTarget>;
  forms: MetaFormConfig[];
  testPhone: string | null;
  /** ISO; at most 24 h ahead. */
  acceptTestLeadsUntil: string | null;
  /** Default 48; 0 switches the alert off. */
  silenceAlertHours: number;
}

/** `crm_settings.meta_status`: written by the system (not audited). */
export interface MetaStatus {
  lastVerifyAt: string | null;
  verifiedSiteUrl: string | null;
  lastWebhookAt: string | null;
  lastSignatureFailureAt: string | null;
  lastImportAt: string | null;
  lastTestAt: string | null;
  lastSyncAt: string | null;
  paused: MetaPauseReason | null;
  pausedAt: string | null;
  lastErrorCode: string | null;
  consecutivePermissionFailures: number;
  tokenInfo: { type: string; expiresAt: string | null; scopes: string[]; checkedAt: string } | null;
  pageSubscribed: boolean | null;
  fieldsMode: { mode: "full" | "basic"; until: string | null };
}

export const DEFAULT_META_CONFIG: MetaConfig = {
  enabled: false,
  appId: null,
  pageId: null,
  graphVersion: META_GRAPH_VERSION_DEFAULT,
  tokenTransport: "header",
  fieldMap: {},
  forms: [],
  testPhone: null,
  acceptTestLeadsUntil: null,
  silenceAlertHours: 48,
};

export const DEFAULT_META_STATUS: MetaStatus = {
  lastVerifyAt: null,
  verifiedSiteUrl: null,
  lastWebhookAt: null,
  lastSignatureFailureAt: null,
  lastImportAt: null,
  lastTestAt: null,
  lastSyncAt: null,
  paused: null,
  pausedAt: null,
  lastErrorCode: null,
  consecutivePermissionFailures: 0,
  tokenInfo: null,
  pageSubscribed: null,
  fieldsMode: { mode: "full", until: null },
};

/** What the API says about a sealed secret: never its value (L4). */
export interface MetaSecretState {
  set: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  /** The envelope opens with the current key, only the previous one, or not at all. */
  keyOk: "current" | "previous" | false;
}

// ---------------------------------------------------------------------------------------------
// §19 Environment

export const INTEGRATIONS_ENV = {
  secret: "INTEGRATIONS_SECRET",
  previous: "INTEGRATIONS_SECRET_PREVIOUS",
  cronToken: "INTEGRATIONS_CRON_TOKEN",
} as const;
/** INTEGRATIONS_SECRET is an opaque string of at least this many characters (M13). */
export const INTEGRATIONS_SECRET_MIN_LENGTH = 43;

// ---------------------------------------------------------------------------------------------
// Small shared helpers (pure)

/** A stage that counts as "contacted or beyond" (not lost): a first contact for the clock. */
export function isContactedOrBeyond(stage: LeadStage): boolean {
  return stage !== "new" && stage !== "lost";
}
