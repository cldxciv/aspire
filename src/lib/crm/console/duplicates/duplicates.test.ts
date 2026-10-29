import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { assignLead, captureLead, changeStage, eraseLead, resolveCrmViewer, writeStaffMembership, type CaptureLeadInput, type CrmRole, type CrmViewer } from "../../index";
import { upsertLeadRouting } from "../../repo/areas-core";
import { updateLeadMoreDetails } from "../details/details";
import { dismissDuplicate, findDuplicates, normName } from "./duplicates";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.F): possible duplicates on a fresh in-memory database.
// Synthetic people and numbers only.

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
let clock = NOW;
/** A new lead with a predictable main number `+9196300000NN`. */
function capture(overrides: Partial<CaptureLeadInput> = {}) {
  phoneCounter += 1;
  clock += 60_000;
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `96300${String(phoneCounter).padStart(5, "0")}`, consent: { textVersion: "test-v1" }, ...overrides },
    clock,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result.leadId;
}
const mobile = (n: number) => `+9196300${String(n).padStart(5, "0")}`;
const setAlt = (leadId: string, alt: string) => expect(updateLeadMoreDetails(admin, leadId, { altPhone: alt }, NOW).ok).toBe(true);
const ids = (viewer: CrmViewer, leadId: string) => {
  const result = findDuplicates(viewer, leadId);
  if (!result.ok) throw new Error(result.error);
  return result.data.map((match) => [match.leadId, match.reasons]);
};

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  phoneCounter = 0;
  clock = NOW;
  for (const level of ["info", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  adminId = makeUser("admin", "admin.one").id;
  admin = viewerOf(adminId, "admin");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("normName", () => {
  it("applies NFKC, lower case and collapsed, trimmed spaces", () => {
    expect(normName("  Riya   SHARMA ")).toBe("riya sharma");
    expect(normName("ｒｉｙａ\tsharma")).toBe("riya sharma"); // full-width letters (NFKC)
    expect(normName("रिया  शर्मा")).toBe("रिया शर्मा");
    expect(normName("   ")).toBeNull();
    expect(normName(null)).toBeNull();
  });
});

describe("matching (§5.F)", () => {
  it("rule (a): the second number against the other family's main or second number, both ways", () => {
    const a = capture(); // main 1
    const b = capture(); // main 2
    const c = capture(); // main 3
    const d = capture(); // main 4, unrelated
    setAlt(b, mobile(1)); // b's second number is a's main number
    setAlt(c, mobile(9)); // c and a share a second number
    setAlt(a, mobile(9));
    expect(ids(admin, a)).toEqual(
      expect.arrayContaining([
        [b, ["alt_is_main"]],
        [c, ["same_alt_phone"]],
      ]),
    );
    expect(ids(admin, a)).toHaveLength(2);
    expect(ids(admin, b)).toEqual([[a, ["main_is_alt"]]]);
    expect(ids(admin, c)).toEqual([[a, ["same_alt_phone"]]]);
    expect(ids(admin, d)).toEqual([]);
  });

  it("rule (b): the same normalised name, class and effective centre (area centre counts); never without a centre", () => {
    const db = getDb();
    db.prepare("INSERT INTO crm_areas (id, name_en, name_hi, default_centre_slug, created_at, updated_at) VALUES ('kangra', 'Kangra', 'कांगड़ा', 'dharamshala', ?, ?)").run(NOW, NOW);
    const a = capture({ studentName: "Riya Sharma", currentClass: "class-11", centreSlug: "dharamshala" });
    const routed = capture({ studentName: "  riya   SHARMA", currentClass: "class-11" });
    upsertLeadRouting(db, { leadId: routed, areaId: "kangra", match: "district", outcome: "area", placeInput: null, placeKey: null, gateOnly: false, routedAt: NOW, routedBy: null });
    const otherClass = capture({ studentName: "Riya Sharma", currentClass: "class-12", centreSlug: "dharamshala" });
    const otherCentre = capture({ studentName: "Riya Sharma", currentClass: "class-11", centreSlug: "shimla" });
    const noCentreOne = capture({ studentName: "Kabir Verma", currentClass: "class-9" });
    const noCentreTwo = capture({ studentName: "Kabir Verma", currentClass: "class-9" });
    expect(ids(admin, a)).toEqual([[routed, ["same_name_class_centre"]]]);
    expect(ids(admin, routed)).toEqual([[a, ["same_name_class_centre"]]]);
    expect(ids(admin, otherClass)).toEqual([]);
    expect(ids(admin, otherCentre)).toEqual([]);
    expect(ids(admin, noCentreOne)).toEqual([]);
    expect(ids(admin, noCentreTwo)).toEqual([]);
  });

  it("lists number matches first, merges reasons, leaves out erased leads and stops at 5", () => {
    const a = capture({ studentName: "Asha Rao", currentClass: "class-10", centreSlug: "shimla" });
    setAlt(a, mobile(50));
    const both = capture({ studentName: "asha rao", currentClass: "class-10", centreSlug: "shimla" });
    setAlt(both, mobile(50));
    const sameName = Array.from({ length: 6 }, () => capture({ studentName: "Asha Rao", currentClass: "class-10", centreSlug: "shimla" }));
    const result = findDuplicates(admin, a);
    if (!result.ok) throw new Error("expected matches");
    expect(result.data).toHaveLength(5);
    expect(result.data[0]).toMatchObject({ leadId: both, reasons: ["same_alt_phone", "same_name_class_centre"], stage: "new", centreSlug: "shimla", canDismiss: true });
    expect(eraseLead(admin, sameName[5], NOW + 1).ok).toBe(true);
    const after = findDuplicates(admin, a);
    expect(after.ok && after.data.map((match) => match.leadId)).not.toContain(sameName[5]);
    // An erased lead has no suggestions of its own.
    expect(findDuplicates(admin, sameName[5])).toEqual({ ok: true, data: [] });
  });

  it("never mentions a lead the viewer cannot see", () => {
    const one = staff("exec.one", "counsellor");
    const two = staff("exec.two", "counsellor");
    const mine = capture({ studentName: "Meera Jain", currentClass: "class-9", centreSlug: "shimla" });
    const theirs = capture({ studentName: "Meera Jain", currentClass: "class-9", centreSlug: "shimla" });
    const alsoMine = capture({ studentName: "Meera Jain", currentClass: "class-9", centreSlug: "shimla" });
    expect(assignLead(admin, mine, one.userId, NOW).ok).toBe(true);
    expect(assignLead(admin, alsoMine, one.userId, NOW).ok).toBe(true);
    expect(assignLead(admin, theirs, two.userId, NOW).ok).toBe(true);
    expect(ids(one, mine)).toEqual([[alsoMine, ["same_name_class_centre"]]]);
    expect(ids(admin, mine)).toHaveLength(2);
    expect(findDuplicates(two, mine)).toMatchObject({ ok: false, error: "not_found" });
    const result = findDuplicates(one, mine);
    expect(JSON.stringify(result)).not.toContain(theirs);
  });

  it("leaves out an enquiry already marked lost as a duplicate (by either rule), not one lost for another reason", () => {
    const a = capture({ studentName: "Tara Negi", currentClass: "class-11", centreSlug: "shimla" });
    const closed = capture();
    const closedByName = capture({ studentName: "Tara Negi", currentClass: "class-11", centreSlug: "shimla" });
    const lostOther = capture();
    setAlt(closed, mobile(1));
    setAlt(lostOther, mobile(1));
    expect(ids(admin, a)).toHaveLength(3);
    for (const [leadId, reason] of [
      [closed, "duplicate"],
      [closedByName, "duplicate"],
      [lostOther, "fees"],
    ] as const) {
      expect(changeStage(admin, leadId, "lost", reason, clock + 1000).ok).toBe(true);
    }
    expect(ids(admin, a)).toEqual([[lostOther, ["alt_is_main"]]]);
    // The closed enquiry's own page still points at the family it duplicates.
    expect(ids(admin, closed)).toContainEqual([a, ["main_is_alt"]]);
  });
});

describe("Not the same family", () => {
  it("is symmetric and permanent, audited once with ids only", () => {
    const a = capture();
    const b = capture();
    setAlt(b, mobile(1));
    expect(ids(admin, a)).toHaveLength(1);
    expect(dismissDuplicate(admin, b, a, NOW)).toEqual({ ok: true, data: { leadId: b, otherLeadId: a, dismissed: true } });
    expect(ids(admin, a)).toEqual([]);
    expect(ids(admin, b)).toEqual([]);
    expect(dismissDuplicate(admin, a, b, NOW)).toEqual({ ok: true, data: { leadId: a, otherLeadId: b, dismissed: false } });
    const [first, second] = a < b ? [a, b] : [b, a];
    expect(getDb().prepare("SELECT lead_a, lead_b FROM crm_duplicate_dismissals").all()).toEqual([{ lead_a: first, lead_b: second }]);
    const audit = listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.duplicate_dismiss");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ target: b, details: { otherLeadId: a } });
    // Still dismissed after the numbers change and change back.
    setAlt(b, mobile(77));
    setAlt(b, mobile(1));
    expect(ids(admin, a)).toEqual([]);
    expect(dismissDuplicate(admin, a, a, NOW)).toMatchObject({ ok: false, error: "validation" });
  });

  it("needs sight of BOTH leads (404 otherwise) and an admin, a manager or the assignee of either", () => {
    const one = staff("exec.one", "counsellor");
    const two = staff("exec.two", "counsellor");
    const mine = capture();
    const theirs = capture();
    const alsoMine = capture();
    expect(assignLead(admin, mine, one.userId, NOW).ok).toBe(true);
    expect(assignLead(admin, alsoMine, one.userId, NOW).ok).toBe(true);
    expect(assignLead(admin, theirs, two.userId, NOW).ok).toBe(true);
    expect(dismissDuplicate(one, mine, theirs, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(dismissDuplicate(one, theirs, mine, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(dismissDuplicate(one, mine, "no-such-lead", NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(dismissDuplicate(one, mine, alsoMine, NOW)).toMatchObject({ ok: true, data: { dismissed: true } });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_duplicate_dismissals").get()?.n).toBe(1);
    // A centre manager may dismiss any pair in their centres.
    const head = staff("head.one", "manager", ["shimla"]);
    const x = capture({ centreSlug: "shimla" });
    const y = capture({ centreSlug: "shimla" });
    expect(dismissDuplicate(head, x, y, NOW)).toMatchObject({ ok: true, data: { dismissed: true } });
    expect(dismissDuplicate(head, x, mine, NOW)).toMatchObject({ ok: false, error: "not_found" });
    // Erased leads cannot be changed.
    expect(eraseLead(admin, y, NOW).ok).toBe(true);
    expect(dismissDuplicate(admin, x, y, NOW)).toMatchObject({ ok: false, error: "conflict" });
  });
});
