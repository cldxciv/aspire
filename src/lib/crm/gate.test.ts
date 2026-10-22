import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import {
  captureLead,
  changeStage,
  eraseLead,
  findGatePass,
  getLead,
  GATE_PASS_TTL_MS,
  MAX_GATE_PASSES_PER_LEAD,
  recordToolUse,
  resolveCrmViewer,
  revokeGatePass,
  sweepToolUse,
  TOOL_USE_TTL_MS,
  unlockGateLead,
  withdrawGateConsent,
  writeStaffMembership,
  type CaptureLeadInput,
  type CrmViewer,
  type GateUnlockInput,
} from "./index";
import { resetGateSweepForTests } from "./gate";
import { writeSetting } from "./settings";

// Lead gate, CRM side (docs/lead-gate-plan.md §3), against a fresh in-memory database per test.
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0); // 11:30 IST
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const GATE_CONSENT = "2026-10-21.gate.v1";

let admin: CrmViewer;
let counsellorId: string;
let passCounter = 0;

function makeUser(role: Role, loginId: string) {
  return insertUser(getDb(), { role, loginId, displayName: loginId, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW });
}

function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function gateInput(overrides: Partial<GateUnlockInput> = {}, lead: Partial<CaptureLeadInput> = {}): GateUnlockInput {
  passCounter += 1;
  return {
    lead: {
      source: "tool",
      studentName: "Gate Student",
      phone: "+919810012345",
      currentClass: "class-11",
      submittedBy: "parent",
      consent: { textVersion: GATE_CONSENT, at: NOW, locale: "en", text: "Gate consent sentence." },
      context: { page: "/tools/predictor", tool: "predictor", toolExam: "jee-main", toolBand: "score-180-189", locale: "en" },
      ...lead,
    },
    phoneCapped: false,
    pass: { passHash: `hash-${passCounter}`, expiresAt: NOW + GATE_PASS_TTL_MS, consentVersion: GATE_CONSENT, submittedBy: "parent", recordUse: true },
    ...overrides,
  };
}

function unlock(overrides: Partial<GateUnlockInput> = {}, lead: Partial<CaptureLeadInput> = {}, now = NOW) {
  const result = unlockGateLead(gateInput(overrides, lead), now);
  if (!result.ok) throw new Error(`unlock failed: ${result.error}`);
  return result;
}

function detail(leadId: string) {
  const lead = getLead(admin, leadId, NOW, { audit: false });
  if (!lead.ok) throw new Error("lead missing");
  return lead.data;
}

function rows(sql: string, ...params: (string | number)[]) {
  return getDb().prepare(sql).all(...params);
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetGateSweepForTests();
  passCounter = 0;
  const adminUser = makeUser("admin", "admin.one");
  admin = viewerOf(adminUser.id, "admin");
  counsellorId = makeUser("staff", "counsellor.one").id;
  writeStaffMembership(getDb(), adminUser.id, counsellorId, { crmRole: "counsellor", centreSlugs: [], active: true }, NOW);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("unlockGateLead", () => {
  it("creates a source `tool` lead with the gate consent, the submitter, the tool's attribution and a pass (hash only)", () => {
    // Legacy routing keeps today's rule (a gate lead goes to the counsellor); areas mode is below.
    writeSetting(getDb(), "routing", { mode: "legacy" }, { expectedVersion: null, actorId: null, now: NOW, audit: false });
    const result = unlock();
    expect(result).toMatchObject({ ok: true, isNew: true, captured: true });
    const lead = detail(result.leadId);
    expect(lead).toMatchObject({
      source: "tool",
      tool: "predictor",
      page: "/tools/predictor",
      studentName: "Gate Student",
      phone: "+919810012345",
      currentClass: "class-11",
      consentTextVersion: GATE_CONSENT,
      consentText: "Gate consent sentence.",
      assignee: { userId: counsellorId },
    });
    expect(lead.activities.find((a) => a.type === "submission")?.meta).toMatchObject({
      source: "tool",
      tool: "predictor",
      toolExam: "jee-main",
      toolBand: "score-180-189",
      submittedBy: "parent",
      consentTextVersion: GATE_CONSENT,
    });
    expect(findGatePass("hash-1", NOW)).toEqual({
      leadId: result.leadId,
      createdAt: NOW,
      expiresAt: NOW + GATE_PASS_TTL_MS,
      consentVersion: GATE_CONSENT,
      submittedBy: "parent",
      recordUse: true,
    });
    expect(listAudit(getDb(), { limit: 20 }).find((e) => e.action === "crm.lead_capture")?.details).toMatchObject({ source: "tool", isNew: true });
  });

  it("areas mode (the default): a gate lead with no area is not auto-assigned and waits in Tool sign-ups (lead routing A2)", () => {
    const result = unlock();
    expect(result).toMatchObject({ ok: true, isNew: true, captured: true });
    const lead = detail(result.leadId);
    expect(lead).toMatchObject({ source: "tool", studentName: "Gate Student", consentTextVersion: GATE_CONSENT });
    expect(lead.assignee).toBeNull();
    expect(rows("SELECT area_id, gate_only FROM crm_lead_routing WHERE lead_id = ?", result.leadId)).toEqual([
      expect.objectContaining({ area_id: null, gate_only: 1 }),
    ]);
  });

  it("LEAD_GATE_ASSIGN=none: a new gate lead stays in the Unassigned queue", () => {
    const result = unlock({ assignNew: false });
    expect(detail(result.leadId).assignee).toBeNull();
  });

  it("dedupes into an enquiry lead by phone without downgrading its consent, reopening or re-assigning it", () => {
    const enquiry = captureLead(
      {
        source: "admissions",
        studentName: "Enquiry Student",
        phone: "98100 12345",
        consent: { textVersion: "2026-10-20.v2", locale: "en", text: "Enquiry consent sentence." },
      },
      NOW - DAY,
    );
    if (!enquiry.ok) throw new Error("capture failed");
    const before = detail(enquiry.leadId);

    const result = unlock({}, {}, NOW);
    expect(result).toMatchObject({ leadId: enquiry.leadId, isNew: false, captured: true });
    const lead = detail(enquiry.leadId);
    expect(lead.studentName).toBe("Enquiry Student"); // only empty fields are filled
    expect(lead.currentClass).toBe("class-11");
    expect(lead.consentTextVersion).toBe("2026-10-20.v2");
    expect(lead.consentAt).toBe(before.consentAt);
    expect(lead.consentText).toBe("Enquiry consent sentence."); // the sentence behind the lead's own version
    expect(lead.submissionCount).toBe(2);
    expect(lead.activities.filter((a) => a.type === "submission")[0].meta).toMatchObject({ source: "tool", consentTextVersion: GATE_CONSENT });
  });

  it("never reopens a lost lead (wrong number / not interested) and never re-runs assignment on it", () => {
    const first = unlock();
    changeStage(admin, first.leadId, "lost", "wrong_number", NOW + 1);
    const again = unlock({}, {}, NOW + HOUR);
    expect(again.leadId).toBe(first.leadId);
    const lead = detail(first.leadId);
    expect(lead.stage).toBe("lost");
    expect(lead.lostReason).toBe("wrong_number");
    expect(lead.activities.some((a) => a.type === "stage_change" && a.meta.reopened === true)).toBe(false);
    expect(lead.activities[0]).toMatchObject({ type: "submission", meta: { onLostLead: true } });
    // An ordinary enquiry still reopens it (a deliberate request).
    captureLead({ source: "admissions", studentName: "X", phone: "9810012345", consent: { textVersion: "2026-10-20.v2" } }, NOW + 2 * HOUR);
    expect(detail(first.leadId).stage).toBe("new");
  });

  it("past the per-phone cap: binds a pass to the existing lead without a new submission; no lead → no_lead", () => {
    const first = unlock();
    const capped = unlockGateLead(gateInput({ phoneCapped: true }), NOW + HOUR);
    expect(capped).toMatchObject({ ok: true, leadId: first.leadId, captured: false, isNew: false });
    expect(detail(first.leadId).submissionCount).toBe(1);
    expect(findGatePass(`hash-${passCounter}`, NOW + HOUR)?.leadId).toBe(first.leadId);

    expect(unlockGateLead(gateInput({ phoneCapped: true }, { phone: "9822012345" }), NOW)).toEqual({ ok: false, error: "no_lead" });
  });

  it("revokes this browser's previous pass, keeps at most 10 per lead, and sweeps expired ones", () => {
    const first = unlock();
    unlock({ replacePassHash: "hash-1" }, {}, NOW + 1);
    expect(findGatePass("hash-1", NOW + 2)).toBeNull();
    expect(findGatePass("hash-2", NOW + 2)?.leadId).toBe(first.leadId);

    for (let i = 0; i < MAX_GATE_PASSES_PER_LEAD + 3; i += 1) unlock({}, {}, NOW + 10 + i);
    const count = Number(rows("SELECT COUNT(*) AS n FROM crm_gate_passes WHERE lead_id = ?", first.leadId)[0]?.n);
    expect(count).toBe(MAX_GATE_PASSES_PER_LEAD);
    expect(findGatePass("hash-2", NOW + 100)).toBeNull(); // oldest dropped

    // Expired rows: not live, and swept on the next issue.
    const last = `hash-${passCounter}`;
    expect(findGatePass(last, NOW + GATE_PASS_TTL_MS + 100)).toBeNull();
    unlock({}, { phone: "9822012345" }, NOW + GATE_PASS_TTL_MS + 100);
    expect(Number(rows("SELECT COUNT(*) AS n FROM crm_gate_passes WHERE lead_id = ?", first.leadId)[0]?.n)).toBe(0);
  });

  it("is all-or-nothing: a pass that cannot be stored rolls the capture back", () => {
    unlock({}, { phone: "9822012345" }); // hash-1 exists
    const before = Number(rows("SELECT COUNT(*) AS n FROM crm_leads")[0]?.n);
    expect(() => unlockGateLead(gateInput({ pass: { ...gateInput().pass, passHash: "hash-1" } }), NOW)).toThrow();
    expect(Number(rows("SELECT COUNT(*) AS n FROM crm_leads")[0]?.n)).toBe(before);
  });

  it("revokeGatePass forgets one browser", () => {
    unlock();
    expect(revokeGatePass("hash-1")).toBe(true);
    expect(revokeGatePass("hash-1")).toBe(false);
    expect(findGatePass("hash-1", NOW)).toBeNull();
  });
});

describe("recordToolUse", () => {
  function toolUses(leadId: string) {
    return detail(leadId).activities.filter((a) => a.type === "tool_use");
  }

  it("merges uses per tool + key + IST day, keeps the latest summary, never bumps last activity", () => {
    const { leadId } = unlock();
    const lastActivity = detail(leadId).lastActivityAt;
    expect(recordToolUse(leadId, { tool: "predictor", key: "jee-main", exam: "jee-main", band: "score-150-159", page: "/" }, NOW + HOUR)).toEqual({
      recorded: true,
      uses: 1,
    });
    expect(recordToolUse(leadId, { tool: "predictor", key: "jee-main", exam: "jee-main", band: "score-180-189" }, NOW + 2 * HOUR)).toEqual({
      recorded: true,
      uses: 2,
    });
    const [entry] = toolUses(leadId);
    expect(entry.meta).toMatchObject({ tool: "predictor", key: "jee-main", exam: "jee-main", band: "score-180-189", page: "/", uses: 2 });
    expect(entry.actorId).toBeNull();
    expect(entry.body).toBeNull();
    expect(detail(leadId).lastActivityAt).toBe(lastActivity);

    recordToolUse(leadId, { tool: "predictor", key: "neet", exam: "neet" }, NOW + 3 * HOUR); // other key
    recordToolUse(leadId, { tool: "planner", key: "jee-main", exam: "jee-main" }, NOW + 3 * HOUR); // other tool
    expect(toolUses(leadId)).toHaveLength(3);
  });

  it("starts a new entry after midnight in India", () => {
    const { leadId } = unlock();
    const istMidnight = Date.UTC(2026, 9, 21, 18, 30, 0); // 22 Oct 00:00 IST
    recordToolUse(leadId, { tool: "ask", key: "rancho" }, istMidnight - 1);
    recordToolUse(leadId, { tool: "ask", key: "rancho" }, istMidnight);
    expect(toolUses(leadId).map((a) => a.meta.uses)).toEqual([1, 1]);
  });

  it("keeps only non-sensitive facts, per tool", () => {
    const { leadId } = unlock();
    recordToolUse(leadId, { tool: "mock-test", key: "jee-mock-1", testId: "jee-mock-1", exam: "jee-main", scoreBand: "pct-40-49", band: "score-1-2" }, NOW);
    recordToolUse(leadId, { tool: "planner", key: "neet", exam: "neet", band: "score-1-2", scoreBand: "pct-1-2" }, NOW);
    const [planner, mock] = toolUses(leadId);
    expect(mock.meta).toEqual({ tool: "mock-test", key: "jee-mock-1", testId: "jee-mock-1", exam: "jee-main", scoreBand: "pct-40-49", uses: 1, lastAt: new Date(NOW).toISOString() });
    expect(planner.meta).toEqual({ tool: "planner", key: "neet", exam: "neet", uses: 1, lastAt: new Date(NOW).toISOString() });
  });

  it("refuses unknown tools, bad keys and erased or unknown leads", () => {
    const { leadId } = unlock();
    expect(recordToolUse(leadId, { tool: "results" as never, key: "x" }, NOW)).toEqual({ recorded: false });
    expect(recordToolUse(leadId, { tool: "ask", key: "Not A Slug" }, NOW)).toEqual({ recorded: false });
    expect(recordToolUse("no-such-lead", { tool: "ask", key: "rancho" }, NOW)).toEqual({ recorded: false });
    eraseLead(admin, leadId, NOW);
    expect(recordToolUse(leadId, { tool: "ask", key: "rancho" }, NOW + 1)).toEqual({ recorded: false });
  });

  it("deletes tool-use entries older than the retention window", () => {
    const { leadId } = unlock();
    recordToolUse(leadId, { tool: "ask", key: "rancho" }, NOW);
    expect(sweepToolUse(NOW + TOOL_USE_TTL_MS - 1, true)).toBe(0);
    expect(sweepToolUse(NOW + TOOL_USE_TTL_MS + 1, true)).toBe(1);
    expect(toolUses(leadId)).toHaveLength(0);
  });
});

describe("erase and withdrawal", () => {
  it("eraseLead deletes the lead's passes and tool-use entries, keeps the submitter fact, audits the counts", () => {
    const { leadId } = unlock();
    unlock({}, {}, NOW + 1);
    recordToolUse(leadId, { tool: "ask", key: "rancho" }, NOW + 2);
    expect(eraseLead(admin, leadId, NOW + 3)).toMatchObject({ ok: true });
    expect(findGatePass("hash-1", NOW + 4)).toBeNull();
    expect(Number(rows("SELECT COUNT(*) AS n FROM crm_gate_passes")[0]?.n)).toBe(0);
    const stub = detail(leadId);
    expect(stub.activities.some((a) => a.type === "tool_use")).toBe(false);
    expect(stub.activities.find((a) => a.type === "submission")?.meta).toMatchObject({ submittedBy: "parent", source: "tool" });
    expect(JSON.stringify(stub)).not.toContain("Gate Student");
    expect(listAudit(getDb(), { limit: 50 }).find((e) => e.action === "crm.lead_erase")?.details).toEqual({ gateBrowsers: 2, toolUsesDeleted: 1 });
    // The same number later starts a new lead (no do-not-contact list across erase yet: plan §9).
    expect(unlock({}, {}, NOW + 5).leadId).not.toBe(leadId);
  });

  it("withdrawGateConsent revokes every pass, closes an open lead as not interested, and is not undone by the gate", () => {
    const { leadId } = unlock();
    unlock({}, {}, NOW + 1);
    expect(withdrawGateConsent(leadId, NOW + 2)).toEqual({ withdrawn: true, passesRevoked: 2 });
    const lead = detail(leadId);
    expect(lead).toMatchObject({ stage: "lost", lostReason: "not_interested" });
    expect(lead.activities[0]).toMatchObject({ type: "consent_withdrawn", meta: { via: "lead_gate", browsersForgotten: 2 } });
    expect(lead.activities[1]).toMatchObject({ type: "stage_change", meta: { to: "lost", lostReason: "not_interested", via: "lead_gate" } });
    expect(listAudit(getDb(), { limit: 50 }).find((e) => e.action === "crm.gate_withdraw")).toMatchObject({
      target: leadId,
      details: { gateBrowsers: 2, stageChanged: true },
    });

    unlock({}, {}, NOW + HOUR);
    expect(detail(leadId).stage).toBe("lost");
    expect(withdrawGateConsent("no-such-lead", NOW)).toEqual({ withdrawn: false, passesRevoked: 0 });
  });

  it("an enrolled family keeps its stage when it withdraws", () => {
    const { leadId } = unlock();
    changeStage(admin, leadId, "enrolled", null, NOW + 1);
    expect(withdrawGateConsent(leadId, NOW + 2).withdrawn).toBe(true);
    expect(detail(leadId).stage).toBe("enrolled");
  });
});
