import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SLA seam is LR-SLA's: these tests never depend on its answers (no clock is started by it).
vi.mock("@/lib/crm/sla", () => ({
  startSlaClock: vi.fn(() => false),
  onContactLogged: vi.fn(),
  closeSlaClock: vi.fn(),
  recomputeOpenClocks: vi.fn(() => 0),
}));

import { getDb, resetDatabaseForTests, withTransaction } from "@/lib/db/connection";

import type { ArrivalKind } from "../lead-ops-types";
import { findLeadRouting } from "../repo/areas-core";
import { findLeadById } from "../repo/leads";
import { insertClock } from "../repo/sla-core";
import { setAssignmentRules } from "../admin";
import { isAssignable, pickAssigneeForLead } from "./index";
import { ensureAreasSeededForRead } from "./seed";
import { away, join, lead, phone, staff, T0, user, viewerOf } from "./test-kit";

const HOUR = 3_600_000;
const db = () => getDb();
const assigneeOf = (leadId: string) => findLeadById(db(), leadId)?.assignedTo ?? null;
const lastAssignmentVia = (leadId: string) =>
  JSON.parse(String(db().prepare("SELECT meta FROM crm_activities WHERE lead_id = ? AND type = 'assignment' ORDER BY id DESC LIMIT 1").get(leadId)?.meta ?? "{}")) as {
    via?: string;
    from?: string | null;
    to?: string | null;
  };

function openClockFor(leadId: string) {
  insertClock(db(), { leadId, reason: "new", source: "admissions", startedAt: T0, dueAt: T0 + HOUR, tier1At: null, tier2At: null, policyVersion: 1 });
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  ensureAreasSeededForRead(getDb(), T0);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("pools in order: own area → serving-centre team → legacy rules → queue (§13.4)", () => {
  it("walks the four steps", () => {
    const exec = staff("exec.kangra", "counsellor");
    join("kangra", exec.id, { centreSlug: "dharamshala" });
    const legacy = staff("legacy.one", "counsellor");

    const own = lead(phone(), { district: "Palampur" });
    expect(own.assigneeId).toBe(exec.id);
    expect(lastAssignmentVia(own.leadId)).toMatchObject({ via: "area", to: exec.id });

    // Chamba has nobody: the team of its serving centre (Dharamshala → Kangra) takes it.
    const borrowed = lead(phone(), { district: "Dalhousie" });
    expect(findLeadRouting(db(), borrowed.leadId)?.areaId).toBe("chamba");
    expect(borrowed.assigneeId).toBe(exec.id);
    expect(lastAssignmentVia(borrowed.leadId).via).toBe("area_borrow");

    // No area: legacy round-robin, which leaves area members out.
    const noArea = lead(phone(), { district: "Atlantis" });
    expect(noArea.assigneeId).toBe(legacy.id);
    expect(lastAssignmentVia(noArea.leadId).via).toBe("centre");

    // Una's serving team (Hamirpur) is empty: legacy again.
    const una = lead(phone(), { district: "Una" });
    expect(una.assigneeId).toBe(legacy.id);

    // Nobody left in the legacy pool: the lead waits (Unassigned queue / its area's queue).
    db().prepare("UPDATE crm_staff SET active = 0 WHERE user_id = ?").run(legacy.id);
    expect(lead(phone(), { district: "Atlantis" }).assigneeId).toBeNull();
    expect(lead(phone(), { district: "Una" }).assigneeId).toBeNull();
  });

  it("legacy rules never hand a lead to someone with an area membership", () => {
    const exec = staff("exec.kullu", "counsellor");
    join("kullu", exec.id);
    const admin = user("admin", "admin.rules");
    const rules = setAssignmentRules(viewerOf(admin.id, "admin"), [{ centreSlug: null, programInterest: null, memberIds: [exec.id], active: true }], T0);
    expect(rules.ok).toBe(true);
    expect(lead(phone(), { district: "Atlantis" }).assigneeId).toBeNull();
  });

  it("prefers people tied to the effective centre, then untied people, then everyone", () => {
    const tied = staff("exec.tied", "counsellor");
    const untied = staff("exec.untied", "counsellor");
    const elsewhere = staff("exec.elsewhere", "counsellor");
    join("shimla", tied.id, { centreSlug: "shimla" });
    join("shimla", untied.id);
    join("shimla", elsewhere.id, { centreSlug: "hamirpur" });
    // No centre given: the area's serving centre (Shimla) is the effective one.
    for (let i = 0; i < 3; i += 1) expect(lead(phone(), { district: "Theog" }).assigneeId).toBe(tied.id);
    away(tied.id, T0 + 24 * HOUR);
    for (let i = 0; i < 3; i += 1) expect(lead(phone(), { district: "Theog" }).assigneeId).toBe(untied.id);
    db().prepare("DELETE FROM crm_area_members WHERE user_id = ?").run(untied.id);
    expect(lead(phone(), { district: "Theog" }).assigneeId).toBe(elsewhere.id);
  });

  it("puts area heads in the call pool only with 'takes leads'", () => {
    const head = staff("head.kullu", "manager");
    join("kullu", head.id, { takesLeads: false });
    expect(lead(phone(), { district: "Manali" }).assigneeId).toBeNull();
    join("kullu", head.id, { takesLeads: true });
    expect(lead(phone(), { district: "Manali" }).assigneeId).toBe(head.id);
  });

  it("skips people who are away, disabled or inactive", () => {
    const a = staff("exec.a", "counsellor");
    const b = staff("exec.b", "counsellor");
    join("mandi", a.id);
    join("mandi", b.id);
    away(a.id, T0 + HOUR);
    expect(new Set([0, 1, 2].map(() => lead(phone(), { district: "Sundernagar" }).assigneeId))).toEqual(new Set([b.id]));
    db().prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(b.id);
    expect(lead(phone(), { district: "Sundernagar" }).assigneeId).toBeNull();
    // Away has ended.
    expect(lead(phone(), { district: "Sundernagar" }, T0 + 2 * HOUR).assigneeId).toBe(a.id);
  });
});

describe("load-aware picking (A5)", () => {
  it("gives the lead to the person with the fewest open first-call clocks, ties round-robin", () => {
    const a = staff("exec.a", "counsellor");
    const b = staff("exec.b", "counsellor");
    join("solan", a.id);
    join("solan", b.id);
    // a holds two leads with open clocks.
    for (let i = 0; i < 2; i += 1) {
      const held = lead(phone(), { district: "Baddi" });
      db().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(a.id, held.leadId);
      openClockFor(held.leadId);
    }
    expect(lead(phone(), { district: "Baddi" }).assigneeId).toBe(b.id);
    expect(lead(phone(), { district: "Baddi" }).assigneeId).toBe(b.id);
    // b now has two leads too, but no clocks (the SLA seam is a spy): b still has the fewest.
    const third = lead(phone(), { district: "Baddi" });
    expect(third.assigneeId).toBe(b.id);
    openClockFor(third.leadId);
    for (const row of db().prepare("SELECT id FROM crm_leads WHERE assigned_to = ?").all(b.id)) {
      if (row.id !== third.leadId) openClockFor(String(row.id));
    }
    // a: 2 open clocks, b: 3 → a.
    expect(lead(phone(), { district: "Baddi" }).assigneeId).toBe(a.id);
  });

  it("is fair over 100 leads (round-robin when loads are equal)", () => {
    const people = ["exec.x", "exec.y", "exec.z"].map((login) => staff(login, "counsellor"));
    for (const person of people) join("hamirpur", person.id);
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i += 1) {
      const id = lead(phone(), { district: "Nadaun" }).assigneeId as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect([...counts.values()].sort()).toEqual([33, 33, 34]);
  });
});

describe("tool sign-ups (A2)", () => {
  it("keeps gate leads with no area unassigned in areas mode, and assigns them in legacy mode", () => {
    staff("legacy.one", "counsellor");
    const gate = lead(phone(), { source: "tool" }, T0, { gate: true });
    expect(gate.assigneeId).toBeNull();
    expect(findLeadRouting(db(), gate.leadId)).toMatchObject({ areaId: null, gateOnly: true });
    // A gate lead WITH an area is routed normally.
    const exec = staff("exec.kangra", "counsellor");
    join("kangra", exec.id);
    expect(lead(phone(), { source: "tool", centreSlug: "dharamshala" }, T0, { gate: true }).assigneeId).toBe(exec.id);

    db().prepare("INSERT INTO crm_settings (key, value, version, updated_at) VALUES ('routing', '{\"mode\":\"legacy\"}', 1, ?)").run(T0);
    expect(lead(phone(), { source: "tool" }, T0, { gate: true }).assigneeId).not.toBeNull();
  });
});

describe("re-picking an unavailable assignee (§14.1)", () => {
  it("re-picks when the assignee is disabled or inactive, on any arrival", () => {
    const a = staff("exec.a", "counsellor");
    const b = staff("exec.b", "counsellor");
    join("kinnaur", a.id);
    const number = phone();
    const first = lead(number, { district: "Kalpa" });
    expect(first.assigneeId).toBe(a.id);
    join("kinnaur", b.id);
    db().prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(a.id);
    lead(number, { district: "Kalpa" }, T0 + HOUR);
    expect(assigneeOf(first.leadId)).toBe(b.id);
    expect(lastAssignmentVia(first.leadId)).toMatchObject({ from: a.id, to: b.id, via: "area" });
  });

  it("re-picks an away assignee on a reopened lead, keeps them on an ordinary repeat", () => {
    const a = staff("exec.a", "counsellor");
    const b = staff("exec.b", "counsellor");
    join("sirmaur", a.id);
    const number = phone();
    const first = lead(number, { district: "Nahan" });
    expect(first.assigneeId).toBe(a.id);
    join("sirmaur", b.id);
    away(a.id, T0 + 48 * HOUR);
    db().prepare("UPDATE crm_leads SET stage = 'contacted' WHERE id = ?").run(first.leadId);
    lead(number, {}, T0 + HOUR);
    expect(assigneeOf(first.leadId)).toBe(a.id);
    db().prepare("UPDATE crm_leads SET stage = 'lost', lost_reason = 'not_interested' WHERE id = ?").run(first.leadId);
    lead(number, {}, T0 + 2 * HOUR);
    expect(findLeadById(db(), first.leadId)?.stage).toBe("new");
    expect(assigneeOf(first.leadId)).toBe(b.id);
  });

  it("re-picks on a reopen when the assignee does not serve the lead's new area", () => {
    const kangra = staff("exec.kangra", "counsellor");
    const kullu = staff("exec.kullu", "counsellor");
    join("kangra", kangra.id);
    join("kullu", kullu.id);
    const number = phone();
    const first = lead(number, { centreSlug: "dharamshala" });
    expect(first.assigneeId).toBe(kangra.id);
    // An old lead with no area (e.g. from before routing): the family comes back from Manali.
    db().prepare("DELETE FROM crm_lead_routing WHERE lead_id = ?").run(first.leadId);
    db().prepare("UPDATE crm_leads SET stage = 'lost', lost_reason = 'not_interested', centre_slug = NULL WHERE id = ?").run(first.leadId);
    lead(number, { district: "Manali" }, T0 + HOUR);
    expect(findLeadRouting(db(), first.leadId)?.areaId).toBe("kullu");
    expect(assigneeOf(first.leadId)).toBe(kullu.id);
  });

  it("keeps a legacy assignee on a reopen while the lead's area (and its serving team) has nobody", () => {
    const legacy = staff("legacy.one", "counsellor");
    const number = phone();
    const first = lead(number, { district: "Theog" });
    expect(first.assigneeId).toBe(legacy.id);
    db().prepare("UPDATE crm_leads SET stage = 'lost', lost_reason = 'not_interested' WHERE id = ?").run(first.leadId);
    lead(number, {}, T0 + HOUR);
    expect(assigneeOf(first.leadId)).toBe(legacy.id);
    // Once Shimla has its own executive, the next reopen moves the lead to them.
    const own = staff("exec.shimla", "counsellor");
    join("shimla", own.id);
    db().prepare("UPDATE crm_leads SET stage = 'lost', lost_reason = 'not_interested' WHERE id = ?").run(first.leadId);
    lead(number, {}, T0 + 2 * HOUR);
    expect(assigneeOf(first.leadId)).toBe(own.id);
  });

  it("isAssignable: the seam's rules", () => {
    const a = staff("exec.a", "counsellor");
    const b = staff("exec.b", "counsellor");
    join("kangra", a.id);
    const ctx: { now: number; kind: ArrivalKind; firstEnquiry: boolean; areaId: string | null } = { now: T0, kind: "repeat", firstEnquiry: false, areaId: "kangra" };
    const check = (userId: string, overrides: Partial<typeof ctx> = {}) => withTransaction(db(), () => isAssignable(db(), userId, { ...ctx, ...overrides }));
    expect(check(a.id)).toBe(true);
    away(a.id, T0 + HOUR);
    expect(check(a.id)).toBe(true);
    expect(check(a.id, { kind: "new" })).toBe(false);
    expect(check(a.id, { firstEnquiry: true })).toBe(false);
    expect(check(b.id, { kind: "reopened", now: T0 + 2 * HOUR })).toBe(false);
    expect(check(a.id, { kind: "reopened", now: T0 + 2 * HOUR })).toBe(true);
    // Chamba has nobody: Kangra's team serves it.
    expect(check(a.id, { kind: "reopened", now: T0 + 2 * HOUR, areaId: "chamba" })).toBe(true);
    db().prepare("UPDATE crm_staff SET active = 0 WHERE user_id = ?").run(a.id);
    expect(check(a.id)).toBe(false);
    expect(check("no-such-user")).toBe(false);
  });

  it("pickAssigneeForLead honours `exclude`", () => {
    const a = staff("exec.a", "counsellor");
    join("una", a.id);
    const created = lead(phone(), { district: "Amb" });
    const row = findLeadById(db(), created.leadId);
    if (!row) throw new Error("missing lead");
    const routing = { areaId: "una", outcome: "area" as const, match: "town" as const };
    expect(withTransaction(db(), () => pickAssigneeForLead(db(), row, routing, T0))?.userId).toBe(a.id);
    expect(withTransaction(db(), () => pickAssigneeForLead(db(), row, routing, T0, { exclude: [a.id] }))).toBeNull();
  });
});
