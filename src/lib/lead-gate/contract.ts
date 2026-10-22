import { z } from "zod";

import { CLASS_OPTIONS, ENQUIRY_TOOLS, phoneSchema } from "@/lib/contracts/enquiry";

/**
 * Lead gate contract (docs/lead-gate-plan.md). CLIENT-SAFE: zod + constants only, no I/O.
 * Shared by <LeadGateForm> (client-side validation), the /api/lead-gate route handlers
 * (authoritative validation) and the tool owners' server routes (/api/ask, /api/mocktest/score).
 *
 * The enquiry contract (src/lib/contracts/enquiry.ts) stays FROZEN: this file only imports from it.
 */

// ── Tools, roles, modes ──────────────────────────────────────────────────────

/** Tools that ask for contact details before a result: the enquiry contract's ENQUIRY_TOOLS. "ask" = Rancho everywhere (Ask page, /rancho, floating chat). */
export const LEAD_GATE_TOOLS = ENQUIRY_TOOLS;
export type LeadGateTool = (typeof LEAD_GATE_TOOLS)[number];

/** Tools whose use the BROWSER reports (POST /api/lead-gate/usage). Rancho and mock-test scores are recorded by their own server routes, so a client can never spoof them. */
export const CLIENT_RECORDED_TOOLS = ["predictor", "planner"] as const;
export type ClientRecordedTool = (typeof CLIENT_RECORDED_TOOLS)[number];

/** "I am the: student / parent or guardian". */
export const LEAD_GATE_ROLES = ["student", "parent"] as const;
export type LeadGateRole = (typeof LEAD_GATE_ROLES)[number];

/**
 * `LEAD_GATE` (server env, read per request — never at build time):
 *  - off: no gate (the default when unset; also forced with no lead store, or with no secret in production;
 *    sample data does NOT force it off since the owner decision of 21 Oct 2026: the form discloses it instead);
 *  - optional: the form is shown with "Continue without sharing"; the server does not enforce;
 *  - required: results need contact details once per browser; /api/ask and /api/mocktest/score enforce it.
 */
export const LEAD_GATE_MODES = ["off", "optional", "required"] as const;
export type LeadGateMode = (typeof LEAD_GATE_MODES)[number];

/**
 * Why a browser may see results: the gate is off, a signed-in account that is let through, or a
 * pass (contact details shared on this browser).
 *
 * `session` (owner decision 22 Oct 2026): ONLY a signed-in student or parent account that already
 * has a mobile number on file. Accounts have no phone field yet, so today no account gets it:
 * students and parents are asked once like everyone else (name pre-filled, `LeadGatePrefill`), and
 * staff and admins always see the same form as a visitor, so testing matches reality.
 */
export type LeadGateVia = "off" | "session" | "pass";

/**
 * Account roles that may skip the gate (with a mobile on file) or get the form pre-filled: the
 * gate's own "I am the" roles. Staff-side roles (admin, staff) are treated exactly like visitors.
 */
export const LEAD_GATE_ACCOUNT_ROLES = LEAD_GATE_ROLES;

/**
 * What <LeadGateForm> pre-fills for a signed-in student or parent account that must still share
 * details (GET /api/lead-gate `prefill`). Every value stays editable; nothing is pre-ticked.
 *  - `studentName`: a student account's own name; a parent account's linked learner when exactly
 *    one is linked; else null (2–80 characters, like the form's field).
 *  - `submittedBy`: the account's role, pre-selected under "I am the".
 */
export interface LeadGatePrefill {
  studentName: string | null;
  submittedBy: LeadGateRole;
}

// ── Consent (D-039 registry, lead-gate version) ──────────────────────────────

/**
 * Id of the consent sentence <LeadGateForm> shows (`leadGate.consent`, en + hi). The server keeps
 * the exact text per language in src/lib/server/enquiry-consent.ts (LEAD_GATE_CONSENT_TEXTS); a
 * test fails when the messages change without a new version. Enquiry forms keep their own
 * versions: /api/enquiries rejects this one and /api/lead-gate rejects theirs.
 */
export const LEAD_GATE_CONSENT_VERSION = "2026-10-21.gate.v1";
/** Versions the gate accepts AND that keep an issued pass valid: dropping one here re-asks every family that agreed to it. */
export const LEAD_GATE_CONSENT_VERSIONS = [LEAD_GATE_CONSENT_VERSION] as const;
export type LeadGateConsentVersion = (typeof LEAD_GATE_CONSENT_VERSIONS)[number];

// ── Endpoints and wire markers ───────────────────────────────────────────────

export const LEAD_GATE_ENDPOINT = "/api/lead-gate";
export const LEAD_GATE_USAGE_ENDPOINT = "/api/lead-gate/usage";

/** Response header on a 401 that means "share contact details first" (never on other 401s). */
export const LEAD_GATE_HEADER = "X-Lead-Gate";
export const LEAD_GATE_HEADER_REQUIRED = "required";
/** Body marker next to the frozen `unauthenticated` error code on a gate 401. */
export const LEAD_GATE_BODY_MARKER = "lead";
/** Header on a 429 from the per-phone cap (vs. the per-connection limit). */
export const LEAD_GATE_LIMIT_HEADER = "X-Lead-Gate-Limit";

/** Request body caps. */
export const LEAD_GATE_MAX_BODY_BYTES = 4 * 1024;
export const LEAD_GATE_USAGE_MAX_BODY_BYTES = 1024;

// ── Field rules and English messages (the `leadGate.errors` catalog repeats these) ──

export const LEAD_GATE_ERRORS = {
  studentName: "Enter the student's name (at least 2 characters)",
  studentNameTooLong: "Name is too long",
  phone: "Enter a valid 10-digit mobile number",
  phoneImplausible: "Please enter a real mobile number. Aspire may call it.",
  currentClass: "Select the class",
  submittedBy: "Choose whether you are the student or a parent",
  consent: "Please tick the box to agree before continuing",
  consentVersion: "Please reload the page and confirm the consent statement again",
  tool: "Unknown tool",
} as const;

/**
 * True for numbers people type to get past a form: all one digit (9999999999) or a run of
 * consecutive digits in the last nine (9876543210, 9123456789, 6789012345). Input: any format the
 * enquiry contract's phoneSchema accepts. No OTP is sent (D-041), so this only catches the obvious.
 */
export function isImplausibleMobile(raw: string): boolean {
  const digits = raw.replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(digits)) return true;
  const tail = digits.slice(1).split("").map(Number);
  const steps = tail.slice(1).map((digit, index) => (digit - tail[index] + 10) % 10);
  return steps.every((step) => step === 1) || steps.every((step) => step === 9);
}

const classValues = CLASS_OPTIONS.map((option) => option.value) as [
  (typeof CLASS_OPTIONS)[number]["value"],
  ...(typeof CLASS_OPTIONS)[number]["value"][],
];

/**
 * POST /api/lead-gate. `context` is attribution only (page, locale, utm_*, referrer, toolExam /
 * toolBand for the predictor): the server re-validates it with the enquiry contract's lenient
 * `enquiryContextSchema` after forcing `context.tool` to `tool`; anything invalid is dropped.
 * `website` is the honeypot.
 */
export const leadGateSubmitSchema = z.object({
  studentName: z.string().trim().min(2, LEAD_GATE_ERRORS.studentName).max(80, LEAD_GATE_ERRORS.studentNameTooLong),
  phone: phoneSchema.refine((phone) => !isImplausibleMobile(phone), LEAD_GATE_ERRORS.phoneImplausible),
  currentClass: z.enum(classValues, { error: LEAD_GATE_ERRORS.currentClass }),
  submittedBy: z.enum(LEAD_GATE_ROLES, { error: LEAD_GATE_ERRORS.submittedBy }),
  consent: z.literal(true, { error: LEAD_GATE_ERRORS.consent }),
  consentVersion: z.enum(LEAD_GATE_CONSENT_VERSIONS, { error: LEAD_GATE_ERRORS.consentVersion }),
  tool: z.enum(LEAD_GATE_TOOLS, { error: LEAD_GATE_ERRORS.tool }),
  context: z.record(z.string(), z.unknown()).optional().catch(undefined),
  website: z.string().max(200).optional(),
});
export type LeadGateSubmitInput = z.input<typeof leadGateSubmitSchema>;
export type LeadGateSubmit = z.output<typeof leadGateSubmitSchema>;

/** Field names in display order (focus goes to the first invalid one). */
export const LEAD_GATE_FIELDS = ["studentName", "phone", "currentClass", "submittedBy", "consent"] as const;
export type LeadGateField = (typeof LEAD_GATE_FIELDS)[number];

const EXAM = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Predictor band, e.g. "score-180-189" / "percentile-98-99" (never the exact value). Same rule as the enquiry context. */
export const PREDICTOR_BAND_PATTERN = /^(?:score|percentile)-\d{1,4}-\d{1,4}$/;

/**
 * Planner features other than a study plan, sent as the usage `key` (planner only):
 * `countdown` = the homepage widget's exam countdown. The family's record then reads
 * "Study planner · exam countdown · JEE Main" instead of a plan for that exam.
 */
export const LEAD_GATE_USAGE_KEYS = ["countdown"] as const;
export type LeadGateUsageKey = (typeof LEAD_GATE_USAGE_KEYS)[number];

/**
 * POST /api/lead-gate/usage: one use of a browser-only tool. Only the exam, (predictor) the score
 * band and (planner) which feature (`key`): never the exact score, category, state, gender or
 * planner dates. `ask` and `mock-test` are rejected (422): their own server routes record them.
 * The predictor's `key` and the planner's `band` are dropped.
 */
export const leadGateUsageSchema = z
  .object({
    tool: z.enum(CLIENT_RECORDED_TOOLS, { error: "This tool is recorded by its own server route" }),
    exam: z.string().max(30).regex(EXAM, "Unknown exam"),
    band: z.string().max(30).regex(PREDICTOR_BAND_PATTERN, "Unknown band").optional(),
    key: z.enum(LEAD_GATE_USAGE_KEYS, { error: "Unknown key" }).optional(),
    /** Locale-free or locale-prefixed site path the result was shown on ("/" = the homepage widget). */
    page: z.string().max(200).optional().catch(undefined),
  })
  .transform((usage) => (usage.tool === "predictor" ? { ...usage, key: undefined } : { ...usage, band: undefined }));
export type LeadGateUsageInput = z.input<typeof leadGateUsageSchema>;

// ── Responses (D-007 envelope `{ ok: true, data }`) ──────────────────────────

/**
 * GET /api/lead-gate. No lead field (name, number, class) is ever returned; the only name is the
 * signed-in account's own, in `prefill`, to its own browser.
 */
export interface LeadGateStatusData {
  mode: LeadGateMode;
  /** Results may be shown now (gate off, a student/parent account with a mobile on file, or this browser shared details). */
  unlocked: boolean;
  via: LeadGateVia | null;
  /** Tool use on this browser is noted on the family's record (pass only). */
  recordsUse: boolean;
  /** When this browser's pass ends (pass only). */
  expiresAt: string | null;
  /**
   * Results on this site currently come from sample (placeholder) data: the site-wide
   * showPlaceholderContent() check the pages use. <LeadGateForm> then says so plainly, up front
   * before its fields. Reported in every mode; it never changes the mode. Site-wide on purpose for
   * now (every tool's data is sample); once some official tables load while demo mode stays on, it
   * over-claims and needs a per-result flag from the host (e.g. the predictor's hasSampleData).
   */
  sample: boolean;
  /**
   * A signed-in student or parent account that is asked (no mobile on file): what the form
   * pre-fills (editable). Null for guests, staff and admins (the visitor's form), with the gate
   * off and for an account let through. The server always sends it; optional for clients and
   * fixtures from before 22 Oct 2026 (absent = null).
   */
  prefill?: LeadGatePrefill | null;
}

/** POST /api/lead-gate (201 for a pass; 200 for `session` / `off`, where nothing is stored). Identical for a new and an existing family. */
export interface LeadGateUnlockData {
  unlocked: true;
  via: LeadGateVia;
  recordsUse: boolean;
  expiresAt: string | null;
}

/** DELETE /api/lead-gate ("Not you?" / `?withdraw=1` "Stop contacting me"). */
export interface LeadGateForgetData {
  forgotten: true;
  /** Consent was withdrawn on the family's record (only when this browser held a valid pass). */
  withdrawn: boolean;
}

export type LeadGateUsageSkipReason = "off" | "session" | "no_pass" | "not_recorded";

/** POST /api/lead-gate/usage. The client ignores failures; on `no_pass` it forgets its local hint. */
export interface LeadGateUsageData {
  recorded: boolean;
  reason?: LeadGateUsageSkipReason;
}

// ── Result summaries (shared by client and server) ──────────────────────────

export const MOCK_SCORE_BAND_PATTERN = /^pct-(?:below-0|\d{1,2}-\d{1,3})$/;

/**
 * A mock-test score as a 10-point band of the maximum ("pct-40-49", "pct-90-100"), never the exact
 * score. Negative totals (negative marking) → "pct-below-0". Null when `max` is not positive.
 */
export function mockScoreBand(score: number, max: number): string | null {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  const percent = (score / max) * 100;
  if (percent < 0) return "pct-below-0";
  const low = Math.min(90, Math.floor(percent / 10) * 10);
  return `pct-${low}-${low === 90 ? 100 : low + 9}`;
}
