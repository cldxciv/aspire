import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { assignLead, captureLead, eraseLead, resolveCrmViewer, writeStaffMembership, type CaptureLeadInput, type CrmRole, type CrmViewer } from "../../index";
import { getLeadMoreDetails, toLeadMoreDetails, updateLeadMoreDetails } from "./details";
import { checkAltPhone, intakeSessionChoices, istYear, targetYearChoices } from "./rules";
import { leadDetailsPatchSchema } from "./schemas";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.E): more enquiry details on a fresh in-memory database.
// Synthetic people and numbers only.

/** Wednesday 21 Oct 2026, 11:30 IST. */
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);

let admin: CrmViewer;
let adminId: string;

function makeUser(role: Role, loginId: string) {
  return insertUser(getDb(), { role, loginId, displayName: `Name ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW });
}

function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function staff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []): CrmViewer {
  const user = makeUser("staff", loginId);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, NOW);
  return viewerOf(user.id, "staff");
}

let phoneCounter = 0;
function capture(overrides: Partial<CaptureLeadInput> = {}) {
  phoneCounter += 1;
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `96200${String(phoneCounter).padStart(5, "0")}`, consent: { textVersion: "test-v1" }, ...overrides },
    NOW,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result.leadId;
}

const phoneOf = (leadId: string) => String(getDb().prepare("SELECT phone_e164 FROM crm_leads WHERE id = ?").get(leadId)?.phone_e164);
const fieldUpdates = (leadId: string) =>
  getDb()
    .prepare("SELECT meta FROM crm_activities WHERE lead_id = ? AND type = 'field_update' ORDER BY id")
    .all(leadId)
    .map((row) => JSON.parse(String(row.meta)).fields as string[]);

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  phoneCounter = 0;
  for (const level of ["info", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  adminId = makeUser("admin", "admin.one").id;
  admin = viewerOf(adminId, "admin");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("rules shared by the form and the server", () => {
  it("normalises the second number like Add enquiry and refuses the main number", () => {
    expect(checkAltPhone("096200 00077", null)).toEqual({ ok: true, value: "+919620000077" });
    expect(checkAltPhone("+91-96200-00077", "+919620000001")).toEqual({ ok: true, value: "+919620000077" });
    expect(checkAltPhone("  ", null)).toEqual({ ok: true, value: null });
    expect(checkAltPhone(null, null)).toEqual({ ok: true, value: null });
    expect(checkAltPhone("12345", null)).toEqual({ ok: false, issue: "altPhoneInvalid" });
    expect(checkAltPhone("5620000077", null)).toEqual({ ok: false, issue: "altPhoneInvalid" }); // not a mobile (starts 5)
    expect(checkAltPhone("9620000001", "+919620000001")).toEqual({ ok: false, issue: "altPhoneSame" });
  });

  it("offers target years from this IST year to +4 and the current and next session", () => {
    expect(istYear(Date.UTC(2026, 11, 31, 19, 0))).toBe(2027); // 1 Jan 2027 00:30 IST
    expect(targetYearChoices(NOW)).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(targetYearChoices(NOW, 2025)).toEqual([2025, 2026, 2027, 2028, 2029, 2030]);
    expect(intakeSessionChoices(NOW)).toEqual(["S2026", "S2027"]);
    expect(intakeSessionChoices(NOW, "S2025")).toEqual(["S2025", "S2026", "S2027"]);
  });

  it("validates the partial body strictly against the code's vocabularies", () => {
    expect(leadDetailsPatchSchema.safeParse({ school: "Govt. Senior Secondary School", board: "hpbose" }).success).toBe(true);
    expect(leadDetailsPatchSchema.safeParse({ board: null, hostel: "maybe", targetYear: 2027, intakeSession: "S2027" }).success).toBe(true);
    expect(leadDetailsPatchSchema.safeParse({}).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ board: "state_board" }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ hostel: "sometimes" }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ heardVia: "radio" }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ preferredTime: "night" }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ decisionMaker: "uncle" }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ targetYear: 2026.5 }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ intakeSession: "2026" }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ school: "x".repeat(121) }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ referredBy: "x".repeat(81) }).success).toBe(false);
    expect(leadDetailsPatchSchema.safeParse({ school: "ok", phone: "+919620000001" }).success).toBe(false);
  });
});

describe("more details: read and save (§5.E)", () => {
  it("starts empty, saves a partial update, keeps the other fields, and clears with null", () => {
    const leadId = capture();
    expect(getLeadMoreDetails(admin, leadId)).toEqual({ ok: true, data: toLeadMoreDetails(null) });
    const first = updateLeadMoreDetails(admin, leadId, { school: "  Govt.   Senior Secondary School ", board: "hpbose", altPhone: "096200 00077" }, NOW);
    expect(first).toMatchObject({ ok: true, data: { school: "Govt. Senior Secondary School", board: "hpbose", altPhone: "+919620000077", heardVia: null } });
    const second = updateLeadMoreDetails(admin, leadId, { heardVia: "ai_assistant", targetYear: 2028, intakeSession: "S2027", hostel: "yes" }, NOW + 1000);
    expect(second).toMatchObject({ ok: true, data: { school: "Govt. Senior Secondary School", board: "hpbose", heardVia: "ai_assistant", targetYear: 2028, intakeSession: "S2027", hostel: "yes" } });
    const cleared = updateLeadMoreDetails(admin, leadId, { board: null, school: "" }, NOW + 2000);
    expect(cleared).toMatchObject({ ok: true, data: { board: null, school: null, heardVia: "ai_assistant" } });
    expect(fieldUpdates(leadId)).toEqual([
      ["details.altPhone", "details.school", "details.board"],
      ["details.hostel", "details.targetYear", "details.heardVia", "details.intakeSession"],
      ["details.school", "details.board"],
    ]);
    // Saving the same values again writes nothing.
    expect(updateLeadMoreDetails(admin, leadId, { heardVia: "ai_assistant" }, NOW + 3000).ok).toBe(true);
    expect(fieldUpdates(leadId)).toHaveLength(3);
  });

  it("refuses a second number that is not an Indian mobile or is the main number; a year or session out of range", () => {
    const leadId = capture();
    const same = updateLeadMoreDetails(admin, leadId, { altPhone: phoneOf(leadId).slice(3) }, NOW);
    expect(same).toMatchObject({ ok: false, error: "validation", fieldErrors: { altPhone: ["This is already the family's main number."] } });
    const invalid = updateLeadMoreDetails(admin, leadId, { altPhone: "12345" }, NOW);
    expect(invalid).toMatchObject({ ok: false, error: "validation", fieldErrors: { altPhone: ["Enter a 10-digit Indian mobile number."] } });
    expect(updateLeadMoreDetails(admin, leadId, { targetYear: 2031 }, NOW)).toMatchObject({ ok: false, fieldErrors: { targetYear: expect.any(Array) } });
    expect(updateLeadMoreDetails(admin, leadId, { targetYear: 2025 }, NOW)).toMatchObject({ ok: false, fieldErrors: { targetYear: expect.any(Array) } });
    expect(updateLeadMoreDetails(admin, leadId, { intakeSession: "S2028" }, NOW)).toMatchObject({ ok: false, fieldErrors: { intakeSession: expect.any(Array) } });
    expect(fieldUpdates(leadId)).toEqual([]);
    // A value saved earlier may stay when the year moves on (editing another field).
    expect(updateLeadMoreDetails(admin, leadId, { targetYear: 2026, intakeSession: "S2026" }, NOW).ok).toBe(true);
    const nextYear = NOW + 400 * 86_400_000;
    expect(updateLeadMoreDetails(admin, leadId, { targetYear: 2026, intakeSession: "S2026", school: "New school" }, nextYear)).toMatchObject({
      ok: true,
      data: { targetYear: 2026, intakeSession: "S2026", school: "New school" },
    });
  });

  it("is open to anyone who sees the lead and 404 for anyone else", () => {
    const one = staff("exec.one", "counsellor");
    const leadId = capture();
    expect(assignLead(admin, leadId, one.userId, NOW).ok).toBe(true);
    const two = staff("exec.two", "counsellor");
    expect(updateLeadMoreDetails(one, leadId, { preferredTime: "evening" }, NOW)).toMatchObject({ ok: true, data: { preferredTime: "evening" } });
    expect(getLeadMoreDetails(two, leadId)).toMatchObject({ ok: false, error: "not_found" });
    expect(updateLeadMoreDetails(two, leadId, { preferredTime: "morning" }, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(getLeadMoreDetails(one, leadId)).toMatchObject({ ok: true, data: { preferredTime: "evening" } });
    // A centre manager sees the leads of their centre.
    const head = staff("head.one", "manager", ["shimla"]);
    const shimla = capture({ centreSlug: "shimla" });
    expect(updateLeadMoreDetails(head, shimla, { decisionMaker: "both_parents" }, NOW).ok).toBe(true);
    expect(getLeadMoreDetails(head, leadId)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("records a read (which carries the full second number) as a lead view without values; the lead page's own read skips it", () => {
    const leadId = capture();
    expect(updateLeadMoreDetails(admin, leadId, { altPhone: "9620000078" }, NOW).ok).toBe(true);
    const views = () => listAudit(getDb(), { limit: 50, target: leadId }).filter((entry) => entry.action === "crm.lead_view");
    expect(views()).toHaveLength(0);
    expect(getLeadMoreDetails(admin, leadId, { audit: false, now: NOW })).toMatchObject({ ok: true, data: { altPhone: "+919620000078" } });
    expect(views()).toHaveLength(0);
    expect(getLeadMoreDetails(admin, leadId, { now: NOW }).ok).toBe(true);
    expect(views().map((entry) => entry.actorId)).toEqual([adminId]);
    expect(JSON.stringify(views())).not.toContain("9620000078");
    // An unseen lead: 404 and nothing recorded.
    const other = staff("exec.unseen", "counsellor");
    expect(getLeadMoreDetails(other, leadId, { now: NOW })).toMatchObject({ ok: false, error: "not_found" });
    expect(views()).toHaveLength(1);
  });

  it("audits field names only, never the values", () => {
    const leadId = capture();
    expect(updateLeadMoreDetails(admin, leadId, { altPhone: "9620000077", school: "Synthetic Public School", referredBy: "A Synthetic Neighbour" }, NOW).ok).toBe(true);
    const entries = listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.lead_details_update");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ target: leadId, details: { fields: "details.altPhone,details.school,details.referredBy" } });
    const text = JSON.stringify(listAudit(getDb(), { limit: 50 }));
    for (const value of ["9620000077", "Synthetic Public School", "Synthetic Neighbour"]) expect(text).not.toContain(value);
  });

  it("erase wipes the second number, school and referred-by, keeps the rest, and blocks later edits", () => {
    const leadId = capture();
    expect(
      updateLeadMoreDetails(
        admin,
        leadId,
        { altPhone: "9620000077", school: "Synthetic Public School", referredBy: "A Synthetic Neighbour", heardVia: "google_maps", intakeSession: "S2027", board: "cbse", preferredTime: "morning" },
        NOW,
      ).ok,
    ).toBe(true);
    expect(eraseLead(admin, leadId, NOW + 1000).ok).toBe(true);
    expect(getLeadMoreDetails(admin, leadId)).toMatchObject({
      ok: true,
      data: { altPhone: null, school: null, referredBy: null, heardVia: "google_maps", intakeSession: "S2027", board: "cbse", preferredTime: "morning" },
    });
    expect(updateLeadMoreDetails(admin, leadId, { heardVia: "newspaper" }, NOW + 2000)).toMatchObject({ ok: false, error: "conflict" });
    // The timeline entry keeps only the field names (non-personal).
    expect(fieldUpdates(leadId)).toEqual([["details.altPhone", "details.school", "details.board", "details.heardVia", "details.referredBy", "details.intakeSession", "details.preferredTime"]]);
  });
});
