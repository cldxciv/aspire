import "server-only";

import { getDb, withTransaction } from "@/lib/db/connection";

import { CRM_AUDIT, crmAudit } from "./access";
import { captureLead } from "./capture";
import { cleanPagePath, cleanSlug, DAY_MS, istDayBounds, normalizePhoneE164 } from "./pure";
import { deleteActivitiesOfType, deleteActivitiesOfTypeBefore, insertActivity, upsertDailyToolUse } from "./repo/activities";
import {
  deleteExpiredGatePasses,
  deleteGatePass,
  deleteGatePassesForLead,
  findLiveGatePass,
  insertGatePass,
  trimGatePasses,
  type GatePassRow,
} from "./repo/gate-passes";
import { findLeadById, findLeadByPhone, updateLead } from "./repo/leads";
import type { Meta } from "./repo/rows";
import { GATE_LEAD_SOURCE, LEAD_TOOLS, type CaptureLeadInput, type GateSubmitter, type LeadTool } from "./types";

/**
 * Lead gate, CRM side (docs/lead-gate-plan.md §3): the family shares contact details once per
 * browser before a free tool's result; the capture goes through `captureLead` (dedupe by E.164,
 * consent registry, attribution) and the browser gets a pass (a row here, a signed cookie in
 * src/lib/lead-gate). Later tool uses on that browser may be noted as `tool_use` activities.
 * All SQL lives in ./repo (D-037). Synchronous (node:sqlite).
 */

/** A pass lasts this long from issue; it never slides (the family is asked again afterwards). */
export const GATE_PASS_TTL_MS = 180 * DAY_MS;
/** Browsers (passes) one lead may hold at once; the oldest are dropped beyond it. */
export const MAX_GATE_PASSES_PER_LEAD = 10;
/** `tool_use` entries are deleted this long after their last use (data minimisation). */
export const TOOL_USE_TTL_MS = 90 * DAY_MS;
const TOOL_USE_SWEEP_EVERY_MS = 60 * 60 * 1000;

export type GatePass = Omit<GatePassRow, "passHash">;

export interface NewGatePass {
  passHash: string;
  expiresAt: number;
  consentVersion: string;
  submittedBy: GateSubmitter | null;
  /** The consent shown covered noting tool use. */
  recordUse: boolean;
}

export interface GateUnlockInput {
  /** The capture (`source` is forced to `tool`). */
  lead: CaptureLeadInput;
  /**
   * The per-phone daily cap on new submissions was reached: append nothing and bind the pass to the
   * existing lead for this number (critique 1.13: the cap must not lock a real family out).
   */
  phoneCapped: boolean;
  pass: NewGatePass;
  /** This browser's previous pass, revoked in the same transaction. */
  replacePassHash?: string | null;
  /** Auto-assign a NEW lead (default true). */
  assignNew?: boolean;
}

export type GateUnlockResult =
  | { ok: true; leadId: string; isNew: boolean; captured: boolean }
  | { ok: false; error: "no_lead" | "invalid_phone" | "consent_missing" | "invalid_input" };

/**
 * Stores the gate submission and issues the pass in ONE transaction: either both are kept or
 * nothing is (so "Nothing was saved" stays true on failure). Expired passes are swept, and the
 * lead keeps at most MAX_GATE_PASSES_PER_LEAD. Throws only on database errors.
 */
export function unlockGateLead(input: GateUnlockInput, now: number = Date.now()): GateUnlockResult {
  const db = getDb();
  const result = withTransaction(db, (): GateUnlockResult => {
    let leadId: string;
    let isNew = false;
    let captured = false;
    if (input.phoneCapped) {
      const phone = normalizePhoneE164(input.lead.phone);
      const existing = phone ? findLeadByPhone(db, phone) : null;
      if (!existing) return { ok: false, error: "no_lead" };
      leadId = existing.id;
    } else {
      const capture = captureLead({ ...input.lead, source: GATE_LEAD_SOURCE }, now, {
        gate: true,
        assignNew: input.assignNew !== false,
      });
      if (!capture.ok) return capture;
      leadId = capture.leadId;
      isNew = capture.isNew;
      captured = true;
    }
    if (input.replacePassHash) deleteGatePass(db, input.replacePassHash);
    deleteExpiredGatePasses(db, now);
    insertGatePass(db, { ...input.pass, leadId, createdAt: now });
    trimGatePasses(db, leadId, MAX_GATE_PASSES_PER_LEAD);
    return { ok: true, leadId, isNew, captured };
  });
  if (result.ok) sweepToolUse(now);
  return result;
}

/**
 * Issues a pass for an EXISTING lead without a new capture: after a stored public enquiry
 * (POST /api/enquiries, critique 1.8), so a family that just enquired is not asked again by the
 * tools. Such a pass carries the enquiry's consent version and `recordUse: false` (the enquiry
 * sentence does not cover noting tool use). False when the lead is unknown or erased.
 */
export function issueGatePassForLead(leadId: string, pass: NewGatePass, now: number = Date.now()): boolean {
  const db = getDb();
  return withTransaction(db, () => {
    const lead = findLeadById(db, leadId);
    if (!lead || lead.erasedAt !== null) return false;
    deleteExpiredGatePasses(db, now);
    insertGatePass(db, { ...pass, leadId, createdAt: now });
    trimGatePasses(db, leadId, MAX_GATE_PASSES_PER_LEAD);
    return true;
  });
}

/** The live pass behind a pass hash (not expired, lead not erased), or null. */
export function findGatePass(passHash: string, now: number = Date.now()): GatePass | null {
  const row = findLiveGatePass(getDb(), passHash, now);
  if (!row) return null;
  return {
    leadId: row.leadId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consentVersion: row.consentVersion,
    submittedBy: row.submittedBy,
    recordUse: row.recordUse,
  };
}

/** "Not you?" / sign-out: forgets one browser. True when a pass existed. */
export function revokeGatePass(passHash: string): boolean {
  return deleteGatePass(getDb(), passHash);
}

export function revokeGatePassesForLead(leadId: string): number {
  return deleteGatePassesForLead(getDb(), leadId);
}

// ---------------------------------------------------------------------------
// Tool use (`tool_use` activities)
// ---------------------------------------------------------------------------

/**
 * One use of a free tool, as a non-sensitive summary (plan §3): the tool, a key (exam / test id /
 * "rancho"), and per tool the exam, the predictor's score band or the mock test's 10-point score
 * band. Never answers, questions, photos, exact scores, category, state, gender or dates.
 */
export interface ToolUseInput {
  tool: LeadTool;
  /** Merge key within a day: the exam (predictor, planner), the test id (mock test), "rancho" (Rancho). */
  key: string;
  exam?: string | null;
  /** Predictor only, e.g. "score-180-189". */
  band?: string | null;
  /** Mock test only. */
  testId?: string | null;
  /** Mock test only, e.g. "pct-40-49" (see mockScoreBand). */
  scoreBand?: string | null;
  /** Locale-free page path. */
  page?: string | null;
}

const BAND = /^(?:score|percentile)-\d{1,4}-\d{1,4}$/;
const SCORE_BAND = /^pct-(?:below-0|\d{1,2}-\d{1,3})$/;

function toolUseFacts(input: ToolUseInput): { key: string; facts: Meta } | null {
  if (!(LEAD_TOOLS as readonly string[]).includes(input.tool)) return null;
  const key = cleanSlug(input.key, 60);
  if (!key) return null;
  const facts: Meta = {};
  const exam = cleanSlug(input.exam, 30);
  if (exam) facts.exam = exam;
  if (input.tool === "predictor" && typeof input.band === "string" && BAND.test(input.band)) facts.band = input.band;
  if (input.tool === "mock-test") {
    const testId = cleanSlug(input.testId, 60);
    if (testId) facts.testId = testId;
    if (typeof input.scoreBand === "string" && SCORE_BAND.test(input.scoreBand)) facts.scoreBand = input.scoreBand;
  }
  const page = cleanPagePath(input.page);
  if (page) facts.page = page;
  return { key, facts };
}

/**
 * Notes one tool use on a lead (merged per tool + key + Asia/Kolkata day). Does NOT touch the
 * lead's `last_activity_at` (retention runs on it, and unattended tool use must not keep a lead
 * alive; critique 0.8) and writes no audit row (the family's own action, high volume). Returns
 * `recorded: false` for an unknown/erased lead or an invalid summary. Throws only on database errors.
 */
export function recordToolUse(leadId: string, input: ToolUseInput, now: number = Date.now()): { recorded: boolean; uses?: number } {
  const parsed = toolUseFacts(input);
  if (!parsed) return { recorded: false };
  const db = getDb();
  const result = withTransaction(db, () => {
    const lead = findLeadById(db, leadId);
    if (!lead || lead.erasedAt !== null) return { recorded: false };
    const { start, end } = istDayBounds(now);
    const { uses } = upsertDailyToolUse(db, { leadId, tool: input.tool, key: parsed.key, dayStart: start, dayEnd: end, facts: parsed.facts, now });
    return { recorded: true, uses };
  });
  sweepToolUse(now);
  return result;
}

let lastSweepAt = Number.NEGATIVE_INFINITY;

/** Deletes `tool_use` entries older than TOOL_USE_TTL_MS, at most once an hour per process (or when `force`). */
export function sweepToolUse(now: number = Date.now(), force = false): number {
  if (!force && now - lastSweepAt < TOOL_USE_SWEEP_EVERY_MS) return 0;
  lastSweepAt = now;
  return deleteActivitiesOfTypeBefore(getDb(), "tool_use", now - TOOL_USE_TTL_MS);
}

/** Test helper. */
export function resetGateSweepForTests(): void {
  lastSweepAt = Number.NEGATIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// Withdrawal ("Stop Aspire contacting me")
// ---------------------------------------------------------------------------

/**
 * The family withdrew consent from under a tool (DELETE /api/lead-gate?withdraw=1). Revokes every
 * pass of the lead (no browser keeps noting tool use), moves an open lead to `lost`
 * (`not_interested`, so nobody keeps calling; a later gate capture never reopens it, a deliberate
 * enquiry still does), and adds a `consent_withdrawn` entry. An enrolled lead keeps its stage.
 * Audited without personal data. Idempotent.
 */
export function withdrawGateConsent(leadId: string, now: number = Date.now()): { withdrawn: boolean; passesRevoked: number } {
  const db = getDb();
  return withTransaction(db, () => {
    const lead = findLeadById(db, leadId);
    const passesRevoked = deleteGatePassesForLead(db, leadId);
    if (!lead || lead.erasedAt !== null) return { withdrawn: false, passesRevoked };
    const closeLead = lead.stage !== "lost" && lead.stage !== "enrolled";
    if (closeLead) {
      updateLead(db, leadId, { stage: "lost", lostReason: "not_interested", updatedAt: now, lastActivityAt: now });
      insertActivity(db, {
        leadId,
        type: "stage_change",
        meta: { from: lead.stage, to: "lost", lostReason: "not_interested", via: "lead_gate" },
        actorId: null,
        at: now,
      });
    } else {
      updateLead(db, leadId, { updatedAt: now, lastActivityAt: now });
    }
    insertActivity(db, { leadId, type: "consent_withdrawn", meta: { via: "lead_gate", browsersForgotten: passesRevoked }, actorId: null, at: now });
    crmAudit(db, {
      actorId: null,
      action: CRM_AUDIT.gateWithdraw,
      target: leadId,
      details: { gateBrowsers: passesRevoked, stageChanged: closeLead },
      now,
    });
    return { withdrawn: true, passesRevoked };
  });
}

/** Erase (D-042) helper: deletes the lead's passes and `tool_use` entries. Runs inside eraseLead's transaction. */
export function deleteGateDataForLead(db: Parameters<typeof deleteGatePassesForLead>[0], leadId: string): { passesRevoked: number; toolUsesDeleted: number } {
  return { passesRevoked: deleteGatePassesForLead(db, leadId), toolUsesDeleted: deleteActivitiesOfType(db, leadId, "tool_use") };
}
