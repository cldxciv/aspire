import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SLA seam is LR-SLA's: these tests never depend on its answers.
vi.mock("@/lib/crm/sla", () => ({
  startSlaClock: vi.fn(() => false),
  onContactLogged: vi.fn(),
  closeSlaClock: vi.fn(),
  recomputeOpenClocks: vi.fn(() => 0),
}));

import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests, withTransaction } from "@/lib/db/connection";

import { CRM_AUDIT } from "../access";
import { findLeadRouting } from "../repo/areas-core";
import { findAreaRow, listAreaMemberRows, listRerouteCandidates, listUserAreaIds } from "../repo/areas";
import { findLeadById } from "../repo/leads";
import { insertClock } from "../repo/sla-core";
import { findAvailability, findScopeMode } from "../repo/staff-ops";
import type { CrmViewer } from "../types";
import {
  addAreaAlias,
  areasPageData,
  changeLeadArea,
  createArea,
  listAreas,
  mergeAreas,
  reassignLeads,
  removeAreaAlias,
  rerouteOpenLeads,
  resolvePlace,
  setAreaMembers,
  setPersonAreas,
  setRoutingMode,
  setStaffAvailability,
  setupFromCentre,
  updateArea,
} from "./areas-service";
import { setUserAreas } from "./index";
import { ensureAreasSeededForRead } from "./seed";
import { join, lead, phone, staff, T0, user, viewerOf } from "./test-kit";
import { listUnmatchedPlaces } from "./unmatched";

const DAY = 86_400_000;
const db = () => getDb();

let sa: CrmViewer;
let admin: CrmViewer;

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  ensureAreasSeededForRead(getDb(), T0);
  // The only admin becomes the bootstrap super admin; a second one is an ordinary admin.
  sa = viewerOf(user("admin", "owner.sa").id, "admin");
  admin = viewerOf(user("admin", "plain.admin").id, "admin");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

/** The audit log must never carry names, phone numbers or typed places (§23). */
function expectNoPersonalData(words: string[]) {
  const text = JSON.stringify(listAudit(db(), { limit: 500 }));
  for (const word of words) expect(text, `audit contains ${word}`).not.toContain(word);
}

describe("viewers", () => {
  it("bootstraps exactly one super admin", () => {
    expect(sa.superAdmin).toBe(true);
    expect(admin.superAdmin).toBeUndefined();
  });

  it("lets managers and admins read, never counsellors", () => {
    const head = viewerOf(staff("head.a", "manager").id, "staff");
    const exec = viewerOf(staff("exec.a", "counsellor").id, "staff");
    expect(listAreas(head, T0).ok).toBe(true);
    expect(listAreas(admin, T0).ok).toBe(true);
    expect(listAreas(exec, T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(areasPageData(exec, T0).ok).toBe(false);
    expect(resolvePlace(exec, "Nahan", null, T0).ok).toBe(false);
    const page = areasPageData(head, T0);
    if (!page.ok) throw new Error("expected page data");
    expect(page.data.areas).toHaveLength(12);
    expect(page.data.routing.value.mode).toBe("areas");
    expect(page.data.legacyManagerIds).toContain(head.userId);
    expect(resolvePlace(head, "Nahan", null, T0)).toMatchObject({ ok: true, data: { areaId: "sirmaur", outcome: "area" } });
  });
});

describe("the super-admin guard on every write", () => {
  it("refuses ordinary admins, area heads and executives", () => {
    const head = viewerOf(staff("head.a", "manager").id, "staff");
    const exec = staff("exec.a", "counsellor");
    const execViewer = viewerOf(exec.id, "staff");
    for (const viewer of [admin, head, execViewer]) {
      expect(createArea(viewer, { nameEn: "North", nameHi: "उत्तर" }, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(updateArea(viewer, "kangra", { nameEn: "X" }, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(setAreaMembers(viewer, "kangra", [{ userId: exec.id }], T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(addAreaAlias(viewer, "kangra", { label: "Pathankot", kind: "border" }, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(removeAreaAlias(viewer, "kangra", "palampur", T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(mergeAreas(viewer, { from: "chamba", into: "kangra", people: [] }, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(setupFromCentre(viewer, { centreSlug: "shimla", headIds: [], executiveIds: [exec.id], headsTakeCalls: false }, T0)).toMatchObject({
        ok: false,
        error: "forbidden",
      });
      expect(rerouteOpenLeads(viewer, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(setPersonAreas(viewer, exec.id, ["kangra"], T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(setRoutingMode(viewer, "legacy", 0, T0)).toMatchObject({ ok: false, error: "forbidden" });
      expect(listUnmatchedPlaces(viewer, T0)).toMatchObject({ ok: false, error: "forbidden" });
    }
    expect(listUserAreaIds(db(), exec.id)).toEqual([]);
    expect(listAudit(db(), { limit: 50 }).filter((entry) => entry.action.startsWith("crm.area"))).toEqual([]);
  });
});

describe("area administration (§13.6)", () => {
  it("creates, edits, moves centres and switches an area off", () => {
    const created = createArea(sa, { nameEn: "Upper Shimla", nameHi: "ऊपरी शिमला", defaultCentreSlug: "shimla" }, T0);
    expect(created).toMatchObject({ ok: true, data: { id: "upper-shimla", kind: "custom", active: true } });
    expect(createArea(sa, { nameEn: "Upper Shimla", nameHi: "x" }, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(createArea(sa, { id: "merge", nameEn: "M", nameHi: "म" }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(createArea(sa, { nameEn: "", nameHi: "म" }, T0)).toMatchObject({ ok: false, error: "validation" });
    // The new area's own name routes families to it.
    expect(resolvePlace(sa, "Upper Shimla", null, T0)).toMatchObject({ ok: true, data: { areaId: "upper-shimla" } });

    // Moving the Shimla centre into the new area.
    expect(updateArea(sa, "upper-shimla", { centres: ["shimla"] }, T0)).toMatchObject({ ok: true, data: { centres: ["shimla"] } });
    expect(findLeadRouting(db(), lead(phone(), { centreSlug: "shimla" }).leadId)?.areaId).toBe("upper-shimla");
    expect(updateArea(sa, "upper-shimla", { centres: ["nowhere"] }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(updateArea(sa, "missing", { nameEn: "X" }, T0)).toMatchObject({ ok: false, error: "not_found" });

    // Switched off: no longer a routing target.
    expect(updateArea(sa, "sirmaur", { active: false }, T0)).toMatchObject({ ok: true, data: { active: false } });
    expect(resolvePlace(sa, "Nahan", null, T0)).toMatchObject({ ok: true, data: { areaId: null, outcome: "unknown" } });
    expect(listAudit(db(), { limit: 50 }).map((entry) => entry.action)).toEqual(expect.arrayContaining([CRM_AUDIT.areaCreate, CRM_AUDIT.areaUpdate]));
  });

  it("replaces an area's people and gives managers the explicit areas scope", () => {
    const head = staff("head.k", "manager");
    const exec = staff("exec.k", "counsellor");
    expect(findScopeMode(db(), head.id)).toBeNull();
    const result = setAreaMembers(sa, "kangra", [{ userId: head.id, takesLeads: true }, { userId: exec.id, centreSlug: "dharamshala", takesLeads: true }], T0);
    expect(result.ok).toBe(true);
    expect(listAreaMemberRows(db(), "kangra").map((member) => [member.userId, member.centreSlug, member.takesLeads])).toEqual(
      expect.arrayContaining([
        [head.id, null, true],
        [exec.id, "dharamshala", false],
      ]),
    );
    expect(findScopeMode(db(), head.id)).toBe("areas");
    expect(setAreaMembers(sa, "kangra", [{ userId: "nobody" }], T0)).toMatchObject({ ok: false, error: "validation" });
    expect(setAreaMembers(sa, "kangra", [{ userId: exec.id }], T0).ok).toBe(true);
    expect(listAreaMemberRows(db(), "kangra").map((member) => member.userId)).toEqual([exec.id]);
    if (!result.ok) throw new Error("expected area");
    expect(result.data.coverage).toMatchObject({ hasExecutive: true, hasHead: true });
    const chamba = listAreas(sa, T0);
    if (!chamba.ok) throw new Error("expected areas");
    expect(chamba.data.find((area) => area.id === "chamba")?.coverage).toEqual({ hasExecutive: false, hasHead: false, coveredBy: "kangra" });
    expectNoPersonalData(["Person head.k", "Person exec.k"]);
  });

  it("sets up a centre's team in its own area and every area it serves", () => {
    const head = staff("head.dh", "manager");
    const exec = staff("exec.dh", "counsellor");
    const result = setupFromCentre(sa, { centreSlug: "dharamshala", headIds: [head.id], executiveIds: [exec.id], headsTakeCalls: true }, T0);
    expect(result).toEqual({ ok: true, data: { areaIds: ["chamba", "kangra"], heads: 1, executives: 1 } });
    for (const areaId of ["kangra", "chamba"]) {
      const rows = listAreaMemberRows(db(), areaId);
      expect(rows.find((row) => row.userId === exec.id)).toMatchObject({ centreSlug: "dharamshala", takesLeads: false });
      expect(rows.find((row) => row.userId === head.id)).toMatchObject({ takesLeads: true });
    }
    expect(findScopeMode(db(), head.id)).toBe("areas");
    // Roles must match the column they were picked in.
    expect(setupFromCentre(sa, { centreSlug: "kullu", headIds: [exec.id], executiveIds: [], headsTakeCalls: false }, T0)).toMatchObject({
      ok: false,
      error: "validation",
    });
    expect(setupFromCentre(sa, { centreSlug: "nowhere", headIds: [], executiveIds: [exec.id], headsTakeCalls: false }, T0)).toMatchObject({
      ok: false,
      error: "validation",
    });
    // Kullu's centre serves Kullu, Mandi and Lahaul and Spiti.
    const kullu = setupFromCentre(sa, { centreSlug: "kullu", headIds: [], executiveIds: [staff("exec.ku", "counsellor").id], headsTakeCalls: false }, T0);
    expect(kullu).toMatchObject({ ok: true, data: { areaIds: ["kullu", "lahaul-spiti", "mandi"] } });
    const audit = listAudit(db(), { limit: 10 }).find((entry) => entry.action === CRM_AUDIT.areaSetupFromCentre);
    expect(audit?.details).toMatchObject({ heads: 0, executives: 1 });
  });

  it("merges an area with a move-or-remove choice for each person (L5)", () => {
    const stay = staff("exec.stay", "counsellor");
    const go = staff("exec.go", "counsellor");
    join("chamba", stay.id, { centreSlug: "dharamshala" });
    join("chamba", go.id);
    const chambaLead = lead(phone(), { district: "Dalhousie" });
    expect(findLeadRouting(db(), chambaLead.leadId)?.areaId).toBe("chamba");

    expect(mergeAreas(sa, { from: "chamba", into: "kangra", people: [{ userId: stay.id, action: "move" }] }, T0)).toMatchObject({
      ok: false,
      error: "validation",
    });
    expect(mergeAreas(sa, { from: "kangra", into: "kangra", people: [] }, T0)).toMatchObject({ ok: false, error: "validation" });
    const merged = mergeAreas(
      sa,
      {
        from: "chamba",
        into: "kangra",
        people: [
          { userId: stay.id, action: "move" },
          { userId: go.id, action: "remove" },
        ],
      },
      T0,
    );
    expect(merged.ok).toBe(true);
    expect(findAreaRow(db(), "chamba")).toMatchObject({ active: false, mergedInto: "kangra" });
    expect(listAreaMemberRows(db(), "chamba")).toEqual([]);
    expect(listAreaMemberRows(db(), "kangra").map((row) => row.userId)).toEqual([stay.id]);
    expect(findLeadRouting(db(), chambaLead.leadId)?.areaId).toBe("kangra");
    // Chamba's places now route to Kangra.
    expect(resolvePlace(sa, "Dalhousie", null, T0)).toMatchObject({ ok: true, data: { areaId: "kangra" } });
    expect(mergeAreas(sa, { from: "chamba", into: "kangra", people: [] }, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(updateArea(sa, "chamba", { active: true }, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(listAudit(db(), { limit: 5 }).find((entry) => entry.action === CRM_AUDIT.areaMerge)?.details).toMatchObject({
      into: "kangra",
      moved: 1,
      removed: 1,
      leads: 1,
    });
  });
});

describe("unmatched places → alias → re-route (A8)", () => {
  it("lists unmatched places for super admins and maps one with a click", () => {
    const exec = staff("exec.k", "counsellor");
    join("kangra", exec.id);
    const first = lead(phone(), { district: "Pathankot, Punjab" });
    const second = lead(phone(), { district: "Pathankot, Punjab" });
    db().prepare("UPDATE crm_leads SET stage = 'lost', lost_reason = 'not_interested' WHERE id = ?").run(second.leadId);
    lead(phone(), { district: "Atlantis" });
    expect(first.assigneeId).toBeNull();

    const listed = listUnmatchedPlaces(sa, T0);
    if (!listed.ok) throw new Error("expected a list");
    expect(listed.data[0]).toEqual({ key: "pathankotpunjab", sample: "Pathankot, Punjab", count: 2, open: 1, outcomes: ["outside_hp"] });
    expect(listed.data.map((item) => item.key)).toContain("atlantis");

    const mapped = addAreaAlias(sa, "kangra", { label: "Pathankot", kind: "border", placeKey: "pathankotpunjab" }, T0 + 1000);
    expect(mapped).toEqual({ ok: true, data: { alias: { key: "pathankot", label: "Pathankot", kind: "border" }, rerouted: 1, assigned: 1 } });
    expect(findLeadRouting(db(), first.leadId)).toMatchObject({ areaId: "kangra", match: "border", routedBy: sa.userId });
    expect(findLeadById(db(), first.leadId)?.assignedTo).toBe(exec.id);
    // The closed lead was not touched; the next family from there routes on arrival.
    expect(findLeadRouting(db(), second.leadId)?.areaId).toBeNull();
    expect(findLeadRouting(db(), lead(phone(), { district: "Pathankot, Punjab" }).leadId)?.areaId).toBe("kangra");
    const after = listUnmatchedPlaces(sa, T0);
    expect(after.ok && after.data.find((item) => item.key === "pathankotpunjab")).toMatchObject({ count: 1, open: 0 });

    // A key another area uses is refused; the same area is idempotent.
    expect(addAreaAlias(sa, "una", { label: "Pathankot", kind: "border" }, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(addAreaAlias(sa, "kangra", { label: "Pathankot", kind: "border" }, T0).ok).toBe(true);
    expect(addAreaAlias(sa, "kangra", { label: "  ", kind: "town" }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(removeAreaAlias(sa, "kangra", "pathankot", T0)).toEqual({ ok: true, data: { removed: true } });
    expect(removeAreaAlias(sa, "kangra", "pathankot", T0)).toMatchObject({ ok: false, error: "not_found" });
    expectNoPersonalData(["Pathankot", "Atlantis", "Person exec.k"]);
  });

  it("re-routes open leads with no area or nobody, with counts in the audit", () => {
    const early = lead(phone(), { district: "Atlantis" });
    const noOne = lead(phone(), { district: "Manali" });
    expect(noOne.assigneeId).toBeNull();
    // The area learns the place, and someone joins Kullu.
    withTransaction(db(), () =>
      db().prepare("INSERT INTO crm_area_aliases (alias_key, area_id, label, kind, created_at) VALUES ('atlantis', 'kangra', 'Atlantis', 'town', ?)").run(T0),
    );
    const exec = staff("exec.k", "counsellor");
    join("kangra", exec.id);
    join("kullu", exec.id);
    const result = rerouteOpenLeads(sa, T0 + 1000);
    expect(result).toEqual({ ok: true, data: { checked: 2, routed: 1, assigned: 2 } });
    expect(findLeadRouting(db(), early.leadId)).toMatchObject({ areaId: "kangra", outcome: "area" });
    expect(findLeadById(db(), noOne.leadId)?.assignedTo).toBe(exec.id);
    expect(listAudit(db(), { limit: 5 }).find((entry) => entry.action === CRM_AUDIT.areaReroute)?.details).toEqual({ checked: 2, routed: 1, assigned: 2 });
  });

  it("leaves out leads re-routing can never change, so they never fill its window", () => {
    // Tool sign-ups with no place wait in Tool sign-ups (A2); an assigned lead with no place or centre stays put.
    const signUps = [0, 1, 2].map(() => lead(phone(), { source: "tool" }, T0, { gate: true }).leadId);
    const later = lead(phone(), { district: "Manali" }, T0 + 1);
    expect(later.assigneeId).toBeNull();
    const plain = staff("exec.legacy", "counsellor");
    const noPlace = lead(phone());
    expect(noPlace.assigneeId).toBe(plain.id);
    expect(listRerouteCandidates(db(), 10, true)).toEqual([later.leadId]);
    // Legacy mode assigns tool sign-ups again, so they are candidates there.
    expect(listRerouteCandidates(db(), 10, false)).toEqual([...[...signUps].sort(), later.leadId]);
  });

  it("never moves families outside Himachal or a deliberate 'No area' into an HP area", () => {
    const exec = staff("exec.b", "counsellor");
    join("bilaspur", exec.id);
    join("kangra", exec.id);
    // A CSV / Meta row: an HP town name, but the family's state is another one (the state is not stored).
    const far = lead(phone(), { district: "Bilaspur", state: "Chhattisgarh" });
    expect(findLeadRouting(db(), far.leadId)).toMatchObject({ areaId: null, outcome: "outside_hp", placeKey: "bilaspur" });
    // A common misspelling of Himachal is still Himachal.
    expect(findLeadRouting(db(), lead(phone(), { district: "Ghumarwin", state: "Himanchal Pradesh" }).leadId)?.areaId).toBe("bilaspur");
    // The forms' "Outside Himachal" answer is not a place: no key, never an unmatched place.
    const outside = lead(phone(), { district: "outside-hp" });
    expect(findLeadRouting(db(), outside.leadId)).toMatchObject({ outcome: "outside_hp", placeKey: null });
    // A deliberate "No area".
    const manual = lead(phone(), { district: "Palampur" });
    expect(manual.assigneeId).toBe(exec.id);
    expect(changeLeadArea(sa, manual.leadId, null, T0).ok).toBe(true);

    const listed = listUnmatchedPlaces(sa, T0);
    expect(listed.ok && listed.data.map((item) => item.key)).toEqual(["bilaspur"]);

    // Re-routing, and re-adding the district's own name, leave all three where they are.
    expect(rerouteOpenLeads(sa, T0 + 1000)).toEqual({ ok: true, data: { checked: 2, routed: 0, assigned: 0 } });
    expect(addAreaAlias(sa, "bilaspur", { label: "Bilaspur", kind: "town" }, T0 + 2000)).toMatchObject({
      ok: true,
      data: { alias: { key: "bilaspur", kind: "district" }, rerouted: 0, assigned: 0 },
    });
    expect(findLeadRouting(db(), far.leadId)).toMatchObject({ areaId: null, outcome: "outside_hp" });
    expect(findLeadRouting(db(), outside.leadId)?.areaId).toBeNull();
    expect(findLeadRouting(db(), manual.leadId)).toMatchObject({ areaId: null, routedBy: sa.userId });
    expect(findLeadById(db(), far.leadId)?.assignedTo).toBeNull();

    // Only a border alias moves an outside-HP family, on re-route as on arrival.
    const border = lead(phone(), { district: "Pathankot", state: "Punjab" });
    withTransaction(db(), () =>
      db().prepare("INSERT INTO crm_area_aliases (alias_key, area_id, label, kind, created_at) VALUES ('pathankot', 'kangra', 'Pathankot', 'border', ?)").run(T0),
    );
    expect(rerouteOpenLeads(sa, T0 + 3000)).toMatchObject({ ok: true, data: { routed: 1, assigned: 1 } });
    expect(findLeadRouting(db(), border.leadId)).toMatchObject({ areaId: "kangra", match: "border" });
    expect(findLeadRouting(db(), far.leadId)?.areaId).toBeNull();

    // Mapping that very unmatched place is the super admin's explicit choice.
    expect(addAreaAlias(sa, "bilaspur", { label: "Bilaspur", kind: "border", placeKey: "bilaspur" }, T0 + 4000)).toMatchObject({
      ok: true,
      data: { rerouted: 1, assigned: 1 },
    });
    expect(findLeadRouting(db(), far.leadId)?.areaId).toBe("bilaspur");
  });
});

describe("bulk reassign rights (A5)", () => {
  function setup() {
    const head = staff("head.k", "manager");
    const from = staff("exec.from", "counsellor");
    const to = staff("exec.to", "counsellor");
    const outsider = staff("exec.out", "counsellor");
    expect(setAreaMembers(sa, "kangra", [{ userId: head.id }, { userId: from.id }], T0).ok).toBe(true);
    join("kullu", outsider.id);
    const leads = [lead(phone(), { district: "Palampur" }), lead(phone(), { district: "Palampur" })];
    for (const item of leads) expect(item.assigneeId).toBe(from.id);
    join("kangra", to.id);
    return { head: viewerOf(head.id, "staff"), from, to, outsider, leads };
  }

  it("a head reassigns their own members' leads; never someone else's", () => {
    const { head, from, to, outsider, leads } = setup();
    expect(reassignLeads(head, { fromUserId: outsider.id, scope: "open" }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(reassignLeads(admin, { fromUserId: from.id, scope: "open" }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(reassignLeads(viewerOf(to.id, "staff"), { fromUserId: from.id, scope: "open" }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    // Uncalled = with an open first-call clock: only one lead has one.
    insertClock(db(), { leadId: leads[0].leadId, reason: "new", source: "admissions", startedAt: T0, dueAt: T0 + 3_600_000, tier1At: null, tier2At: null, policyVersion: 1 });
    expect(reassignLeads(head, { fromUserId: from.id, scope: "uncalled" }, T0)).toEqual({ ok: true, data: { moved: 1, unassigned: 0 } });
    expect(findLeadById(db(), leads[0].leadId)?.assignedTo).toBe(to.id);
    expect(findLeadById(db(), leads[1].leadId)?.assignedTo).toBe(from.id);
    expect(reassignLeads(head, { fromUserId: from.id, scope: "open", toUserId: from.id }, T0)).toMatchObject({ ok: false, error: "validation" });
  });

  it("a super admin reassigns anyone's leads, to a chosen person or the queue", () => {
    const { from, outsider, leads } = setup();
    expect(reassignLeads(sa, { fromUserId: from.id, scope: "open", toUserId: outsider.id }, T0)).toEqual({ ok: true, data: { moved: 2, unassigned: 0 } });
    for (const item of leads) expect(findLeadById(db(), item.leadId)?.assignedTo).toBe(outsider.id);
    // Nobody else in Kullu is free for a re-pick: Palampur leads go back to Kangra's team.
    expect(reassignLeads(sa, { fromUserId: outsider.id, scope: "open" }, T0)).toEqual({ ok: true, data: { moved: 2, unassigned: 0 } });
    const entry = listAudit(db(), { limit: 5 }).find((item) => item.action === CRM_AUDIT.bulkReassign);
    expect(entry).toMatchObject({ target: outsider.id, details: { scope: "open", moved: 2, unassigned: 0, chosen: false } });
  });
});

describe("Away until … (A5)", () => {
  it("self, an area head for their members, a super admin — nobody else", () => {
    const head = staff("head.k", "manager");
    const member = staff("exec.k", "counsellor");
    const other = staff("exec.o", "counsellor");
    join("kangra", head.id);
    join("kangra", member.id);
    join("kullu", other.id);
    const until = new Date(T0 + 3 * DAY).toISOString();
    const headViewer = viewerOf(head.id, "staff");
    expect(setStaffAvailability(viewerOf(member.id, "staff"), { userId: member.id, awayUntil: until, note: "Wedding leave" }, T0)).toMatchObject({
      ok: true,
      data: { userId: member.id, awayUntil: until, note: "Wedding leave" },
    });
    expect(setStaffAvailability(headViewer, { userId: member.id, awayUntil: null }, T0)).toMatchObject({ ok: true, data: { awayUntil: null } });
    expect(findAvailability(db(), member.id)).toBeNull();
    expect(setStaffAvailability(headViewer, { userId: other.id, awayUntil: until }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(setStaffAvailability(viewerOf(member.id, "staff"), { userId: other.id, awayUntil: until }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(setStaffAvailability(admin, { userId: other.id, awayUntil: until }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(setStaffAvailability(sa, { userId: other.id, awayUntil: until }, T0).ok).toBe(true);
    // At most 60 days ahead, never in the past.
    expect(setStaffAvailability(sa, { userId: other.id, awayUntil: new Date(T0 + 70 * DAY).toISOString() }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(setStaffAvailability(sa, { userId: other.id, awayUntil: new Date(T0 - DAY).toISOString() }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(setStaffAvailability(sa, { userId: "nobody", awayUntil: null }, T0)).toMatchObject({ ok: false });
    expectNoPersonalData(["Wedding"]);
  });
});

describe("a lead's area (§13.7)", () => {
  it("lets a super admin or a manager who sees the lead move it, re-picking the executive", () => {
    const kangra = staff("exec.kangra", "counsellor");
    const kullu = staff("exec.kullu", "counsellor");
    const head = staff("head.k", "manager");
    join("kangra", kangra.id);
    join("kullu", kullu.id);
    expect(setPersonAreas(sa, head.id, ["kangra"], T0).ok).toBe(true);
    const created = lead(phone(), { district: "Palampur" });
    expect(created.assigneeId).toBe(kangra.id);

    expect(changeLeadArea(admin, created.leadId, "kullu", T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(changeLeadArea(viewerOf(kullu.id, "staff"), created.leadId, "kullu", T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(changeLeadArea(viewerOf(head.id, "staff"), created.leadId, "missing", T0)).toMatchObject({ ok: false, error: "validation" });
    const moved = changeLeadArea(viewerOf(head.id, "staff"), created.leadId, "kullu", T0 + 1000);
    expect(moved).toEqual({ ok: true, data: { leadId: created.leadId, areaId: "kullu", assigneeId: kullu.id } });
    expect(findLeadRouting(db(), created.leadId)).toMatchObject({ areaId: "kullu", match: "manual", routedBy: head.id });
    // The head no longer sees it (Kullu is not theirs): not found for them now.
    expect(changeLeadArea(viewerOf(head.id, "staff"), created.leadId, "kangra", T0)).toMatchObject({ ok: false, error: "not_found" });
    expect(changeLeadArea(sa, created.leadId, null, T0)).toMatchObject({ ok: true, data: { areaId: null, assigneeId: kullu.id } });
    expect(listAudit(db(), { limit: 5 }).find((entry) => entry.action === CRM_AUDIT.leadReroute)?.details).toEqual({ from: "kullu", to: null, reassigned: false });
  });
});

describe("setUserAreas seam (replaces CORE's stub)", () => {
  it("replaces memberships, keeps centre ties, sets the areas scope for managers", () => {
    const head = staff("head.k", "manager");
    const exec = staff("exec.k", "counsellor");
    join("kangra", exec.id, { centreSlug: "dharamshala" });
    const run = (userId: string, ids: string[]) => withTransaction(db(), () => setUserAreas(db(), userId, ids, { actorId: sa.userId, now: T0 }));
    expect(run(exec.id, ["kangra", "chamba"])).toEqual({ ok: true });
    expect(listAreaMemberRows(db(), "kangra").find((row) => row.userId === exec.id)?.centreSlug).toBe("dharamshala");
    expect(listUserAreaIds(db(), exec.id)).toEqual(["chamba", "kangra"]);
    expect(run(exec.id, ["chamba"])).toEqual({ ok: true });
    expect(listUserAreaIds(db(), exec.id)).toEqual(["chamba"]);
    expect(findScopeMode(db(), exec.id)).toBeNull();
    // A manager with no areas still gets the explicit scope (sees only assigned leads).
    expect(run(head.id, [])).toEqual({ ok: true });
    expect(findScopeMode(db(), head.id)).toBe("areas");
    expect(run(exec.id, ["atlantis"])).toEqual({ ok: false, error: "unknown_area" });
    expect(updateArea(sa, "una", { active: false }, T0).ok).toBe(true);
    expect(run(exec.id, ["una"])).toEqual({ ok: false, error: "inactive_area" });
    expect(run(sa.userId, ["kangra"])).toEqual({ ok: false, error: "not_staff" });
  });
});

describe("routing mode", () => {
  it("is super-admin only with an optimistic lock", () => {
    expect(setRoutingMode(sa, "legacy", 5, T0)).toMatchObject({ ok: false, error: "conflict" });
    expect(setRoutingMode(sa, "legacy", 0, T0)).toMatchObject({ ok: true, data: { value: { mode: "legacy" }, version: 1 } });
    expect(listAudit(db(), { limit: 5 }).find((entry) => entry.action === CRM_AUDIT.settingsUpdate)?.details).toEqual({ key: "routing", version: 1 });
  });
});
