import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { CONSENT_VERSIONS } from "@/lib/contracts/enquiry";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";
import { LEAD_GATE_CONSENT_VERSIONS } from "@/lib/lead-gate/contract";
import { activityOut } from "@/lib/mcp/tools/crm";

import {
  assignLead,
  captureLead,
  createManualLead,
  eraseLead,
  funnelReport,
  GATE_PASS_TTL_MS,
  gateDailyCounts,
  getLead,
  isGateConsentVersion,
  resolveCrmViewer,
  unlockGateLead,
  withdrawGateConsent,
  writeStaffMembership,
  type CaptureLeadInput,
  type CrmRole,
  type CrmViewer,
  type LeadActivity,
} from "./index";
import { insertActivity } from "./repo/activities";
import { eraseSchema, manualLeadSchema } from "./schemas";

// WP9 (lead gate in the CRM) + admin-console plan §8 Agent B (add / erase), against a fresh
// in-memory database per test. Synthetic people only.
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0); // 11:30 IST, 21 Oct
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const GATE_CONSENT = "2026-10-21.gate.v1";

let adminId: string;
let admin: CrmViewer;
let passCounter = 0;

function makeUser(role: Role, loginId: string, displayName = loginId) {
  return insertUser(getDb(), { role, loginId, displayName, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW });
}

function makeStaff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []) {
  const user = makeUser("staff", loginId, `Staff ${loginId}`);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, NOW);
  return user;
}

function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function gateUnlock(phone: string, at: number, lead: Partial<CaptureLeadInput> = {}, assignNew = true) {
  passCounter += 1;
  const result = unlockGateLead(
    {
      lead: {
        source: "tool",
        studentName: "Gate Student",
        phone,
        currentClass: "class-11",
        submittedBy: "student",
        consent: { textVersion: GATE_CONSENT, at, locale: "en", text: "Gate consent sentence." },
        context: { page: "/tools/predictor", tool: "predictor", locale: "en" },
        ...lead,
      },
      phoneCapped: false,
      pass: { passHash: `console-hash-${passCounter}`, expiresAt: at + GATE_PASS_TTL_MS, consentVersion: GATE_CONSENT, submittedBy: "student", recordUse: true },
      assignNew,
    },
    at,
  );
  if (!result.ok) throw new Error(`unlock failed: ${result.error}`);
  return result;
}

function activities(leadId: string): LeadActivity[] {
  const lead = getLead(admin, leadId, NOW, { audit: false });
  if (!lead.ok) throw new Error("lead missing");
  return lead.data.activities;
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  adminId = makeUser("admin", "admin.one", "Admin One").id;
  admin = viewerOf(adminId, "admin");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("gate consent versions", () => {
  it("recognises every lead-gate version by shape and no enquiry version", () => {
    for (const version of LEAD_GATE_CONSENT_VERSIONS) expect(isGateConsentVersion(version), version).toBe(true);
    for (const version of CONSENT_VERSIONS) expect(isGateConsentVersion(version), version).toBe(false);
    for (const junk of ["staff-recorded", "", null, 7, "2026-10-21.gate.v1 ", "x.gate.v1"]) expect(isGateConsentVersion(junk)).toBe(false);
  });
});

describe("Add enquiry: consent method and duplicates (admin-console plan §8, Agent B)", () => {
  it("keeps how the family agreed on the created entry, and rejects an unknown method", () => {
    const created = createManualLead(admin, { source: "walk_in", studentName: "Walk In", phone: "9876500031", consent: true, consentMethod: "in_person" }, NOW);
    expect(created).toMatchObject({ ok: true, data: { isNew: true, canOpen: true } });
    if (!created.ok) return;
    const entry = activities(created.data.leadId).find((activity) => activity.type === "created");
    expect(entry?.meta).toMatchObject({ source: "walk_in", consentMethod: "in_person" });
    expect(createManualLead(admin, { source: "walk_in", studentName: "Bad", phone: "9876500032", consent: true, consentMethod: "telepathy" as never }, NOW)).toMatchObject({
      ok: false,
      error: "validation",
      fieldErrors: { consentMethod: expect.any(Array) },
    });
  });

  it("reports a number already on file without writing anything, then logs the visit on request", () => {
    const first = createManualLead(admin, { source: "phone_call", guardianName: "Parent One", phone: "9876500041", consent: true, consentMethod: "phone" }, NOW);
    if (!first.ok) throw new Error("create failed");
    const before = activities(first.data.leadId).length;
    const audits = listAudit(getDb(), { limit: 100 }).filter((row) => row.action === "crm.lead_create").length;

    const reported = createManualLead(admin, { source: "walk_in", studentName: "Same Family", phone: "+91 98765 00041", consent: true, consentMethod: "in_person", onDuplicate: "report" }, NOW + HOUR);
    expect(reported).toEqual({ ok: true, data: { leadId: first.data.leadId, isNew: false, duplicate: true, canOpen: true, closed: false, withdrawn: false } });
    expect(activities(first.data.leadId)).toHaveLength(before);
    expect(listAudit(getDb(), { limit: 100 }).filter((row) => row.action === "crm.lead_create")).toHaveLength(audits);
    // The check itself is audited, without phone or name.
    const check = listAudit(getDb(), { limit: 100 }).find((row) => row.action === "crm.lead_duplicate_check");
    expect(check).toMatchObject({ target: first.data.leadId, details: { source: "walk_in", canOpen: true } });
    expect(JSON.stringify(check?.details)).not.toMatch(/98765|Same Family/);
    const untouched = getLead(admin, first.data.leadId, NOW, { audit: false });
    expect(untouched.ok && untouched.data.studentName).toBeNull();

    const logged = createManualLead(admin, { source: "walk_in", studentName: "Same Family", phone: "9876500041", consent: true, consentMethod: "in_person", onDuplicate: "append", note: "Visited with mother" }, NOW + HOUR);
    expect(logged).toMatchObject({ ok: true, data: { leadId: first.data.leadId, isNew: false, canOpen: true } });
    expect(logged.ok && logged.data.duplicate).toBeFalsy();
    const visit = activities(first.data.leadId).find((activity) => activity.type === "created" && activity.meta.existing === true);
    expect(visit).toMatchObject({ body: "Visited with mother", meta: { source: "walk_in", consentMethod: "in_person", existing: true } });
  });

  it("tells a counsellor they cannot open a family assigned to someone else, but lets them log the visit", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const b = makeStaff("couns.b", "counsellor", ["shimla"]);
    const theirs = createManualLead(viewerOf(a.id, "staff"), { source: "walk_in", studentName: "Family A", phone: "9876500051", consent: true }, NOW);
    if (!theirs.ok) throw new Error("create failed");
    const vb = viewerOf(b.id, "staff");
    expect(createManualLead(vb, { source: "walk_in", studentName: "Family A", phone: "9876500051", consent: true, onDuplicate: "report" }, NOW)).toMatchObject({
      ok: true,
      data: { duplicate: true, canOpen: false, leadId: null },
    });
    expect(createManualLead(vb, { source: "walk_in", studentName: "Family A", phone: "9876500051", consent: true, onDuplicate: "append" }, NOW)).toMatchObject({
      ok: true,
      data: { isNew: false, canOpen: false },
    });
    expect(getLead(vb, theirs.data.leadId, NOW, { audit: false })).toMatchObject({ ok: false, error: "not_found" });
    expect(activities(theirs.data.leadId).filter((activity) => activity.type === "created")).toHaveLength(2);
  });

  it("reports a closed family and one that asked Aspire to stop contacting them", () => {
    const unlocked = gateUnlock("9876500055", NOW - DAY);
    const report = () => createManualLead(admin, { source: "walk_in", studentName: "Back Again", phone: "9876500055", consent: true, onDuplicate: "report" }, NOW);
    expect(report()).toMatchObject({ ok: true, data: { duplicate: true, closed: false, withdrawn: false } });
    expect(withdrawGateConsent(unlocked.leadId, NOW - HOUR)).toMatchObject({ withdrawn: true });
    expect(report()).toMatchObject({ ok: true, data: { duplicate: true, closed: true, withdrawn: true } });
    // Once staff log the visit (the family agreed again), the latest word is consent, not the withdrawal.
    createManualLead(admin, { source: "walk_in", studentName: "Back Again", phone: "9876500055", consent: true, consentMethod: "in_person", onDuplicate: "append" }, NOW);
    expect(report()).toMatchObject({ ok: true, data: { duplicate: true, closed: false, withdrawn: false } });
  });

  it("validates the new body fields at the API boundary", () => {
    const body = { source: "walk_in", phone: "9876500061", studentName: "X Y", consent: true };
    expect(manualLeadSchema.safeParse({ ...body, consentMethod: "written", onDuplicate: "report" }).success).toBe(true);
    expect(manualLeadSchema.safeParse({ ...body, consentMethod: "smoke-signal" }).success).toBe(false);
    expect(manualLeadSchema.safeParse({ ...body, onDuplicate: "merge" }).success).toBe(false);
    expect(eraseSchema.safeParse({ confirm: true }).success).toBe(true);
    expect(eraseSchema.safeParse({ confirm: true, reason: "family_request" }).success).toBe(true);
    expect(eraseSchema.safeParse({ confirm: true, reason: "because" }).success).toBe(false);
    // Lead routing (§13.8, H4): an optional district; system consent methods are never accepted here.
    expect(manualLeadSchema.safeParse({ ...body, district: "kangra" }).success).toBe(true);
    expect(manualLeadSchema.safeParse({ ...body, consentMethod: "meta_lead_form" }).success).toBe(false);
    expect(manualLeadSchema.safeParse({ ...body, consentMethod: "csv_import" }).success).toBe(false);
  });

  it("keeps the family's district out of the lead row and off the timeline (it only routes)", () => {
    const result = createManualLead(admin, { source: "phone_call", studentName: "Phone Student", phone: "9876500071", consent: true, district: "lahaul-spiti" }, NOW);
    if (!result.ok || result.data.duplicate) throw new Error("expected a new lead");
    const lead = getLead(admin, result.data.leadId, NOW, { audit: false });
    if (!lead.ok) throw new Error();
    expect(JSON.stringify(lead.data.activities)).not.toContain("lahaul");
    expect(lead.data.message).toBeNull();
  });
});

describe("Erase with a reason (admins)", () => {
  it("keeps the reason on the erase entry and in the audit row, and the consent method on the stub", () => {
    const created = createManualLead(admin, { source: "walk_in", studentName: "To Erase", phone: "9876500071", consent: true, consentMethod: "written" }, NOW);
    if (!created.ok) throw new Error("create failed");
    expect(eraseLead(admin, created.data.leadId, NOW + 1, { reason: "family_request" })).toMatchObject({ ok: true });
    const after = activities(created.data.leadId);
    expect(after.find((activity) => activity.type === "erase")?.meta).toEqual({ reason: "family_request" });
    expect(after.find((activity) => activity.type === "created")?.meta).toMatchObject({ consentMethod: "written" });
    const audit = listAudit(getDb(), { limit: 50 }).find((row) => row.action === "crm.lead_erase");
    expect(audit?.details).toMatchObject({ reason: "family_request" });

    const other = createManualLead(admin, { source: "walk_in", studentName: "No Reason", phone: "9876500072", consent: true }, NOW);
    if (!other.ok) throw new Error("create failed");
    eraseLead(admin, other.data.leadId, NOW + 2, { reason: "made-up" as never });
    expect(activities(other.data.leadId).find((activity) => activity.type === "erase")?.meta).toEqual({});
  });
});

describe("daily count of free-tool contact forms (WP9 reports)", () => {
  it("counts gate forms per IST day, new vs already on file, and ignores enquiries", () => {
    gateUnlock("9810000001", NOW); // new family, 21 Oct
    captureLead({ source: "admissions", studentName: "Enquired First", phone: "9810000002", consent: { textVersion: "2026-10-20.v2" } }, NOW - DAY);
    gateUnlock("9810000002", NOW + HOUR); // family already on file, 21 Oct
    gateUnlock("9810000003", Date.UTC(2026, 9, 21, 18, 15)); // 23:45 IST, still 21 Oct
    gateUnlock("9810000004", Date.UTC(2026, 9, 21, 18, 45)); // 00:15 IST, 22 Oct
    captureLead({ source: "hero", studentName: "Plain Enquiry", phone: "9810000005", consent: { textVersion: "2026-10-20.v2" } }, NOW);

    const range = { from: NOW - 2 * DAY, to: NOW + 3 * DAY };
    expect(gateDailyCounts(admin, range)).toEqual([
      { day: "2026-10-22", newFamilies: 1, knownFamilies: 0 },
      { day: "2026-10-21", newFamilies: 2, knownFamilies: 1 },
    ]);
    expect(funnelReport(admin, range).gateDaily).toEqual(gateDailyCounts(admin, range));
    expect(gateDailyCounts(admin, { from: NOW + 2 * DAY, to: NOW + 3 * DAY })).toEqual([]);
  });

  it("only counts leads the viewer can see, and keeps erased families in the counts", () => {
    const counsellor = makeStaff("couns.c", "counsellor");
    const mine = gateUnlock("9810000011", NOW, {}, false);
    gateUnlock("9810000012", NOW, {}, false);
    expect(assignLead(admin, mine.leadId, counsellor.id, NOW)).toMatchObject({ ok: true });
    const range = { from: NOW - DAY, to: NOW + DAY };
    expect(gateDailyCounts(viewerOf(counsellor.id, "staff"), range)).toEqual([{ day: "2026-10-21", newFamilies: 1, knownFamilies: 0 }]);
    expect(gateDailyCounts(viewerOf(makeStaff("couns.d", "counsellor").id, "staff"), range)).toEqual([]);
    eraseLead(admin, mine.leadId, NOW + 1, { reason: "wrong_or_test" });
    expect(gateDailyCounts(admin, range)).toEqual([{ day: "2026-10-21", newFamilies: 2, knownFamilies: 0 }]);
  });
});

describe("lead page keeps every consent behind a busy timeline", () => {
  it("adds older submissions / created / withdrawals when the latest 200 entries are all tool notes", () => {
    const unlocked = gateUnlock("9810000021", NOW - 300 * HOUR);
    const leadId = unlocked.leadId;
    const db = getDb();
    for (let i = 0; i < 230; i += 1) {
      insertActivity(db, { leadId, type: "tool_use", meta: { tool: "planner", key: `k${i}`, uses: 1 }, actorId: null, at: NOW - 200 * HOUR + i * HOUR });
    }
    const lead = getLead(admin, leadId, NOW + 40 * HOUR, { audit: false });
    if (!lead.ok) throw new Error("lead missing");
    const submissions = lead.data.activities.filter((activity) => activity.type === "submission");
    expect(submissions).toHaveLength(1);
    expect(submissions[0].meta).toMatchObject({ submittedBy: "student", consentTextVersion: GATE_CONSENT });
    expect(lead.data.consentText).toBe("Gate consent sentence.");
    expect(lead.data.activities.filter((activity) => activity.type === "tool_use").length).toBeLessThanOrEqual(200);
    const times = lead.data.activities.map((activity) => Date.parse(activity.at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe("MCP never hands score bands of tool use to an AI assistant (critique 0.13)", () => {
  it("strips band / scoreBand from tool_use notes, toolBand from submissions and the consent sentence everywhere", () => {
    const base = { body: null, actorId: null, actorName: null, at: new Date(NOW).toISOString() };
    const predictor: LeadActivity = { ...base, id: 1, type: "tool_use", meta: { tool: "predictor", key: "jee-main", exam: "jee-main", band: "score-180-189", uses: 3, lastAt: "x" } };
    const mock: LeadActivity = { ...base, id: 2, type: "tool_use", meta: { tool: "mock-test", key: "t1", testId: "t1", exam: "neet", scoreBand: "pct-40-49", uses: 1 } };
    const submission: LeadActivity = {
      ...base,
      id: 3,
      type: "submission",
      meta: { source: "tool", tool: "predictor", toolBand: "score-180-189", consentTextVersion: GATE_CONSENT, consentText: "sentence", consentLocale: "en" },
    };
    expect(activityOut(predictor).meta).toEqual({ tool: "predictor", key: "jee-main", exam: "jee-main", uses: 3, lastAt: "x" });
    expect(activityOut(mock).meta).toEqual({ tool: "mock-test", key: "t1", testId: "t1", exam: "neet", uses: 1 });
    expect(activityOut(submission).meta).toEqual({ source: "tool", tool: "predictor", consentTextVersion: GATE_CONSENT });
  });
});
