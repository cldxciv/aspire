import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The SLA seam is replaced by spies: these tests check CORE's WIRING (who calls the seam, with
// what), never a stub's output (docs/lead-routing-plan.md §14.3, P5).
vi.mock("@/lib/crm/sla", () => ({
  startSlaClock: vi.fn(() => false),
  onContactLogged: vi.fn(),
  closeSlaClock: vi.fn(),
  recomputeOpenClocks: vi.fn(() => 0),
}));
// The routing seam is test-defined too (never the stub's or ROUTING's real answers): no seed, every
// arrival routes to "no area", nobody is picked unless a test says so; tests write routing rows
// themselves (`routeTo`).
vi.mock("@/lib/crm/routing", () => ({
  ensureAreasSeeded: vi.fn(),
  routeLead: vi.fn(() => ({ areaId: null, outcome: "empty", match: null })),
  pickAssigneeForLead: vi.fn(() => null),
  isAssignable: vi.fn(() => true),
  setUserAreas: vi.fn(() => ({ ok: true })),
  previewPlace: vi.fn(() => null),
}));

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { CRM_AUDIT } from "./access";
import {
  canSeeLead,
  captureLead,
  changeStage,
  createFollowUpTask,
  createManualLead,
  eraseLead,
  funnelReport,
  gateDailyCounts,
  getCallingHours,
  getLead,
  getMetaConfig,
  getSpeedRule,
  leadFilterForbidden,
  listLeads,
  logContact,
  minutesToDue,
  resolveCrmViewer,
  slaClockView,
  updateLead,
  validateCallingHours,
  validateSpeedRule,
  writeSetting,
  writeStaffMembership,
  DEFAULT_CALLING_HOURS,
  DEFAULT_SPEED_RULE,
  type CaptureLeadInput,
  type CaptureLeadOptions,
  type CrmRole,
  type CrmViewer,
  type LeadFilters,
} from "./index";
import { assignableMember } from "./access";
import { lastActivityAt } from "./repo/activities";
import { findLeadRouting, responsibleAreaIds, upsertLeadRouting } from "./repo/areas-core";
import { findExternalRef, suppressionErasedAt } from "./repo/intake";
import { findLeadById, findLeadByPhone } from "./repo/leads";
import { setScopeMode } from "./repo/staff-ops";
import { manualLeadSchema } from "./schemas";
import { isAssignable, pickAssigneeForLead } from "./routing";
import { closeSlaClock, onContactLogged, startSlaClock } from "./sla";

// Synthetic people and numbers only.
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0); // 11:30 IST
const HOUR = 60 * 60 * 1000;
const KEY = "lead-ops-test-key-0123456789-abcdefghijklmnopqrstuvwxyz";

let adminId: string;
let admin: CrmViewer;

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

function area(id: string, defaultCentre: string | null, centres: string[] = []) {
  const db = getDb();
  db.prepare("INSERT INTO crm_areas (id, name_en, name_hi, default_centre_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    `Area ${id}`,
    `क्षेत्र ${id}`,
    defaultCentre,
    NOW,
    NOW,
  );
  for (const centre of centres) db.prepare("INSERT INTO crm_area_centres (centre_slug, area_id, created_at) VALUES (?, ?, ?)").run(centre, id, NOW);
}

function member(areaId: string, userId: string) {
  getDb().prepare("INSERT INTO crm_area_members (area_id, user_id, created_at) VALUES (?, ?, ?)").run(areaId, userId, NOW);
}

function routeTo(leadId: string, areaId: string | null, placeInput: string | null = null) {
  upsertLeadRouting(getDb(), { leadId, areaId, match: areaId ? "district" : null, outcome: areaId ? "area" : "unknown", placeInput, placeKey: placeInput, gateOnly: false, routedAt: NOW, routedBy: null });
}

function input(phone: string, overrides: Partial<CaptureLeadInput> = {}): CaptureLeadInput {
  return {
    source: "admissions",
    studentName: "Test Student",
    phone,
    consent: { textVersion: "2026-10-20.v2" },
    ...overrides,
  };
}

function capture(phone: string, overrides: Partial<CaptureLeadInput> = {}, now = NOW, options: CaptureLeadOptions = {}) {
  const result = captureLead(input(phone, overrides), now, options);
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result;
}

const ids = (viewer: CrmViewer, filters: LeadFilters = {}) => listLeads(viewer, filters, { pageSize: 100 }, NOW).items.map((lead) => lead.id).sort();

beforeEach(() => {
  vi.mocked(isAssignable).mockImplementation(() => true);
  vi.mocked(pickAssigneeForLead).mockImplementation(() => null);
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  vi.mocked(startSlaClock).mockClear();
  vi.mocked(onContactLogged).mockClear();
  vi.mocked(closeSlaClock).mockClear();
  adminId = makeUser("admin", "admin.one", "Admin One").id;
  admin = viewerOf(adminId, "admin");
  for (const level of ["warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

// ---------------------------------------------------------------------------------------------

describe("explicit manager scope (H2, §13.5)", () => {
  function world() {
    area("kangra", "dharamshala", ["dharamshala"]);
    area("chamba", "dharamshala"); // no centre, no head: served by the Dharamshala centre (A1)
    area("shimla", "shimla", ["shimla"]);
    const head = makeStaff("head.kangra", "manager");
    member("kangra", head.id);
    setScopeMode(getDb(), { userId: head.id, mode: "areas", actorId: adminId, now: NOW });
    const gate = { textVersion: "2026-10-21.gate.v1" };
    const inKangra = capture("9000000001", { consent: gate, source: "tool" }, NOW, { gate: true });
    routeTo(inKangra.leadId, "kangra", "Dharamsala");
    const byCentre = capture("9000000002", { centreSlug: "dharamshala" });
    const inChamba = capture("9000000003");
    routeTo(inChamba.leadId, "chamba");
    const inShimla = capture("9000000004", { consent: gate, source: "tool" }, NOW, { gate: true });
    routeTo(inShimla.leadId, "shimla");
    const mine = capture("9000000005");
    routeTo(mine.leadId, "shimla");
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(head.id, mine.leadId);
    return { head, inKangra, byCentre, inChamba, inShimla, mine };
  }

  it("an area head sees their areas (through EXISTS), the centres in them, the headless area they serve and their own leads — in the inbox, Reports and the lead-gate counts", () => {
    const w = world();
    const head = viewerOf(w.head.id, "staff");
    expect(head.areaScope).toEqual({ areaIds: ["kangra", "chamba"], centreSlugs: ["dharamshala"] });
    expect(ids(head)).toEqual([w.inKangra.leadId, w.byCentre.leadId, w.inChamba.leadId, w.mine.leadId].sort());
    expect(funnelReport(head, { from: NOW - HOUR, to: NOW + HOUR }).total).toBe(4);
    expect(gateDailyCounts(head, { from: NOW - HOUR, to: NOW + HOUR })).toEqual([{ day: "2026-10-21", newFamilies: 1, knownFamilies: 0 }]);
    expect(gateDailyCounts(admin, { from: NOW - HOUR, to: NOW + HOUR })).toEqual([{ day: "2026-10-21", newFamilies: 2, knownFamilies: 0 }]);
    expect(getLead(head, w.inShimla.leadId, NOW, { audit: false })).toMatchObject({ ok: false, error: "not_found" });
    expect(getLead(head, w.inChamba.leadId, NOW, { audit: false }).ok).toBe(true);
  });

  it("a serving area drops out of the head's scope once it gets its own active head", () => {
    const w = world();
    const chambaHead = makeStaff("head.chamba", "manager");
    member("chamba", chambaHead.id);
    expect(responsibleAreaIds(getDb(), w.head.id)).toEqual(["kangra"]);
  });

  it("an areas-scope manager with zero areas sees only assigned leads; legacy managers are unchanged", () => {
    const w = world();
    const empty = makeStaff("head.none", "manager");
    setScopeMode(getDb(), { userId: empty.id, mode: "areas", actorId: adminId, now: NOW });
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(empty.id, w.inShimla.leadId);
    expect(ids(viewerOf(empty.id, "staff"))).toEqual([w.inShimla.leadId]);

    const legacy = makeStaff("mgr.legacy", "manager", ["dharamshala"]);
    expect(viewerOf(legacy.id, "staff").areaScope).toBeUndefined();
    expect(ids(viewerOf(legacy.id, "staff"))).toEqual([w.byCentre.leadId]);
    const legacyAll = makeStaff("mgr.all", "manager");
    expect(ids(viewerOf(legacyAll.id, "staff"))).toHaveLength(5);
  });

  it("query parameters only narrow: an area outside the head's areas is refused, and never widens the list", () => {
    const w = world();
    const head = viewerOf(w.head.id, "staff");
    expect(leadFilterForbidden(head, { area: "shimla" })).toBe(true);
    expect(leadFilterForbidden(head, { area: "kangra" })).toBe(false);
    expect(leadFilterForbidden(head, { area: "none" })).toBe(false);
    expect(leadFilterForbidden(admin, { area: "shimla" })).toBe(false);
    expect(ids(head, { area: "kangra" })).toEqual([w.inKangra.leadId]);
    expect(ids(head, { area: "shimla" })).toEqual([w.mine.leadId]);
    expect(ids(admin, { area: "none" })).toEqual([w.byCentre.leadId]);
  });

  it("canSeeLead needs the routing area; area heads may assign only to members of the lead's area", () => {
    const w = world();
    const head = viewerOf(w.head.id, "staff");
    const exec = makeStaff("exec.kangra", "counsellor");
    member("kangra", exec.id);
    const other = makeStaff("exec.shimla", "counsellor");
    member("shimla", other.id);
    const lead = findLeadById(getDb(), w.inKangra.leadId);
    if (!lead) throw new Error();
    expect(lead.areaId).toBe("kangra");
    expect(canSeeLead(head, lead)).toBe(true);
    expect(canSeeLead(head, { ...lead, areaId: null })).toBe(false);
    expect(assignableMember(getDb(), head, exec.id, lead)).not.toBeNull();
    expect(assignableMember(getDb(), head, other.id, lead)).toBeNull();
  });

  it("area heads hand their team leads with no routing row (centre in their area) and leads of the headless area they serve", () => {
    const w = world();
    const head = viewerOf(w.head.id, "staff");
    const exec = makeStaff("exec.kangra", "counsellor");
    member("kangra", exec.id);
    const other = makeStaff("exec.shimla", "counsellor");
    member("shimla", other.id);

    // An older lead at a Kangra centre with no routing row (not backfilled).
    const byCentre = findLeadById(getDb(), w.byCentre.leadId);
    if (!byCentre) throw new Error();
    expect(byCentre.areaId).toBeNull();
    expect(assignableMember(getDb(), head, exec.id, byCentre)).not.toBeNull();
    expect(assignableMember(getDb(), head, other.id, byCentre)).toBeNull();
    expect(updateLead(head, byCentre.id, { assigneeId: exec.id }, NOW)).toMatchObject({ ok: true });

    // Chamba has no head: the Kangra team serves it (A1 borrow).
    const inChamba = findLeadById(getDb(), w.inChamba.leadId);
    if (!inChamba) throw new Error();
    expect(updateLead(head, inChamba.id, { assigneeId: exec.id }, NOW)).toMatchObject({ ok: true });
    expect(updateLead(head, inChamba.id, { assigneeId: other.id }, NOW)).toMatchObject({ ok: false, error: "validation" });

    // A lead outside their areas: never to their team, even though the Shimla executive exists.
    const inShimla = findLeadById(getDb(), w.inShimla.leadId);
    if (!inShimla) throw new Error();
    expect(assignableMember(getDb(), head, exec.id, inShimla)).toBeNull();
  });

  it("lists carry the area and the open first-call clock", () => {
    const w = world();
    getDb()
      .prepare("INSERT INTO crm_sla_clocks (lead_id, reason, source, started_at, due_at, tier1_at, tier2_at, policy_version) VALUES (?, 'new', 'tool', ?, ?, ?, ?, 1)")
      .run(w.inKangra.leadId, NOW - 2 * HOUR, NOW - HOUR, NOW - HOUR, NOW + HOUR);
    const item = listLeads(admin, { area: "kangra" }, {}, NOW).items[0];
    expect(item.area).toEqual({ id: "kangra", en: "Area kangra", hi: "क्षेत्र kangra" });
    expect(item.sla).toMatchObject({ state: "overdue", reason: "new" });
    expect(ids(admin, { sla: "overdue" })).toEqual([w.inKangra.leadId]);
    expect(ids(admin, { sla: "escalated" })).toEqual([]);
    expect(listLeads(admin, {}, { pageSize: 100 }, NOW).items.find((lead) => lead.id === w.byCentre.leadId)).toMatchObject({ area: null, sla: null });
  });
});

describe("captureLead §14.2", () => {
  it("existing: 'attach' adds history only: consent, stage, assignee, lost reason, message untouched; no clock", () => {
    const first = capture("9000000011", { message: "First message" });
    const counsellor = makeStaff("couns.a", "counsellor");
    changeStage(admin, first.leadId, "lost", "not_interested", NOW + HOUR);
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(counsellor.id, first.leadId);
    vi.mocked(startSlaClock).mockClear();
    const before = findLeadById(getDb(), first.leadId);

    const attached = captureLead(
      input("9000000011", { guardianName: "Parent Name", source: "csv_import", consent: { textVersion: "staff-recorded", method: "csv_import" } }),
      NOW + 2 * HOUR,
      { existing: "attach", answers: "Best time: evening", submissionMeta: { importBatch: "b1", source: "spoof" } },
    );
    expect(attached).toMatchObject({ ok: true, isNew: false, attached: true, assigneeId: counsellor.id });
    const after = findLeadById(getDb(), first.leadId);
    expect(after).toMatchObject({
      stage: "lost",
      lostReason: "not_interested",
      assignedTo: counsellor.id,
      consentTextVersion: before?.consentTextVersion,
      consentAt: before?.consentAt,
      message: "First message",
      guardianName: "Parent Name",
      submissionCount: (before?.submissionCount ?? 0) + 1,
    });
    expect(startSlaClock).not.toHaveBeenCalled();
    const lead = getLead(admin, first.leadId, NOW, { audit: false });
    if (!lead.ok) throw new Error();
    const submission = lead.data.activities.find((activity) => activity.type === "submission");
    expect(submission).toMatchObject({ body: "Best time: evening", meta: { attached: true, importBatch: "b1", source: "csv_import", consentMethod: "csv_import" } });
    expect(lead.data.activities.filter((activity) => activity.type === "stage_change")).toHaveLength(1);
  });

  it("Meta chronology: a lead created before the family was closed is attached; a newer one reopens it", () => {
    const first = capture("9000000012");
    changeStage(admin, first.leadId, "lost", "not_interested", NOW + HOUR);
    vi.mocked(startSlaClock).mockClear();
    const meta = (createdAt: number) =>
      captureLead(input("9000000012", { source: "meta_lead_ad", consent: { textVersion: "meta:111", method: "meta_lead_form" } }), NOW + 3 * HOUR, {
        attachIfOlderThanHistory: { createdAt },
      });
    expect(meta(NOW + HOUR - 60_000)).toMatchObject({ ok: true, attached: true });
    expect(findLeadById(getDb(), first.leadId)?.stage).toBe("lost");
    expect(startSlaClock).not.toHaveBeenCalled();
    expect(meta(NOW + 2 * HOUR)).toMatchObject({ ok: true, isNew: false });
    expect(findLeadById(getDb(), first.leadId)?.stage).toBe("new");
    expect(vi.mocked(startSlaClock).mock.calls[0][1]).toMatchObject({ leadId: first.leadId, reason: "reopened" });
    expect(lastActivityAt(getDb(), first.leadId, ["stage_change"], { toStages: ["lost"] })).toBe(NOW + HOUR);
  });

  it("origin refs are idempotent: the same Meta lead id writes nothing the second time", () => {
    const options: CaptureLeadOptions = { origin: { provider: "meta", externalId: "123456789012345" }, existing: "attach" };
    const one = captureLead(input("9000000013", { source: "meta_lead_ad" }), NOW, options);
    expect(one).toMatchObject({ ok: true, isNew: true });
    const activities = getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities").get()?.n;
    const two = captureLead(input("9000000013", { source: "meta_lead_ad" }), NOW + HOUR, options);
    expect(two).toMatchObject({ ok: true, alreadyImported: true, leadId: one.ok ? one.leadId : "" });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities").get()?.n).toBe(activities);
    expect(findExternalRef(getDb(), "meta", "123456789012345")).toMatchObject({ leadId: one.ok ? one.leadId : "" });
    expect(captureLead(input("9000000013"), NOW, { origin: { provider: "zapier" as "meta", externalId: "x" } })).toEqual({ ok: false, error: "invalid_input" });
  });

  it("an erased family is suppressed for imports and older Meta leads, not for the family's own new enquiry", () => {
    vi.stubEnv("INTEGRATIONS_SECRET", KEY);
    const first = capture("9000000014", { centreSlug: "shimla" });
    routeTo(first.leadId, null, "Some Town");
    expect(eraseLead(admin, first.leadId, NOW + HOUR, { reason: "family_request" }).ok).toBe(true);
    expect(findLeadRouting(getDb(), first.leadId)).toMatchObject({ placeInput: null, placeKey: null });
    expect(closeSlaClock).toHaveBeenCalledWith(expect.anything(), { leadId: first.leadId, resolution: "erased", at: NOW + HOUR });
    expect(listAudit(getDb(), { limit: 20 }).find((entry) => entry.action === CRM_AUDIT.leadErase)?.details).toMatchObject({ suppressed: true });

    const older = captureLead(input("9000000014", { source: "csv_import" }), NOW + 2 * HOUR, { suppression: { createdAt: NOW } });
    expect(older).toEqual({ ok: false, error: "erased_family" });
    expect(captureLead(input("9000000014"), NOW + 2 * HOUR, { suppression: { createdAt: null } })).toEqual({ ok: false, error: "erased_family" });
    expect(findLeadByPhone(getDb(), "+919000000014")).toBeNull();
    // A Meta lead created after the erase, and the family's own website enquiry, are new requests.
    expect(captureLead(input("9000000014"), NOW + 2 * HOUR, { suppression: { createdAt: NOW + 90 * 60_000 } })).toMatchObject({ ok: true, isNew: true });
  });

  it("erase without INTEGRATIONS_SECRET still erases but writes no suppression", () => {
    const first = capture("9000000015");
    expect(eraseLead(admin, first.leadId, NOW + HOUR).ok).toBe(true);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_erase_suppressions").get()?.n).toBe(0);
    vi.stubEnv("INTEGRATIONS_SECRET", KEY);
    expect(suppressionErasedAt(getDb(), [])).toBeNull();
  });

  it("system consent methods never reach 'Add enquiry' (H4); submission meta keeps only safe keys", () => {
    const counsellor = makeStaff("couns.b", "counsellor");
    const viewer = viewerOf(counsellor.id, "staff");
    const refused = createManualLead(viewer, { source: "walk_in", studentName: "Walk In", phone: "9000000016", consent: true, consentMethod: "meta_lead_form" as "phone" });
    expect(refused).toMatchObject({ ok: false, error: "validation" });
    const meta = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`key${i}`, i]));
    const captured = capture("9000000017", { consent: { textVersion: "meta:5", method: "meta_lead_form" } }, NOW, { submissionMeta: { ...meta, filled: "x", "bad-key": 1 } });
    const lead = getLead(admin, captured.leadId, NOW, { audit: false });
    if (!lead.ok) throw new Error();
    const submission = lead.data.activities.find((activity) => activity.type === "submission");
    expect(submission?.meta.consentMethod).toBe("meta_lead_form");
    expect(submission?.meta.filled).toEqual([]);
    expect(Object.keys(submission?.meta ?? {}).filter((key) => key.startsWith("key"))).toHaveLength(12);
    expect(lead.data.confirmConsent).toBe(true);
  });
});

describe("the arrival pipeline (§14.1)", () => {
  it("starts the clock for new, reopened and a tool sign-up's first enquiry, at arrivedAt, with the import reason and override", () => {
    const fresh = capture("9000000021", {}, NOW, { arrivedAt: NOW - 5 * 60_000 });
    expect(vi.mocked(startSlaClock).mock.calls.at(-1)?.[1]).toMatchObject({ leadId: fresh.leadId, reason: "new", arrivedAt: NOW - 5 * 60_000, gate: false, manual: false });

    captureLead(input("9000000022", { source: "csv_import" }), NOW, { slaClock: false, clockReason: "import", existing: "attach" });
    expect(vi.mocked(startSlaClock).mock.calls.at(-1)?.[1]).toMatchObject({ reason: "import", override: false });

    const gate = { textVersion: "2026-10-21.gate.v1" };
    const signup = capture("9000000023", { source: "tool", consent: gate }, NOW, { gate: true });
    expect(vi.mocked(startSlaClock).mock.calls.at(-1)?.[1]).toMatchObject({ leadId: signup.leadId, gate: true, reason: "new" });
    vi.mocked(startSlaClock).mockClear();
    capture("9000000023", { source: "tool", consent: gate }, NOW + HOUR, { gate: true });
    expect(startSlaClock).not.toHaveBeenCalled();
    capture("9000000023", { source: "admissions" }, NOW + 2 * HOUR);
    expect(vi.mocked(startSlaClock).mock.calls.at(-1)?.[1]).toMatchObject({ leadId: signup.leadId, reason: "new", gate: false });
  });

  it("re-picks an assignee who is no longer assignable (excluding them) and records from → to and via", () => {
    const a = makeStaff("couns.a", "counsellor");
    const b = makeStaff("couns.b", "counsellor");
    // Test-defined seam answers (never the stub's): A is not assignable; the pool offers B.
    vi.mocked(isAssignable).mockImplementation((_db, userId) => userId !== a.id);
    vi.mocked(pickAssigneeForLead).mockImplementation((_db, _lead, _routing, _now, opts) =>
      (opts?.exclude ?? []).includes(b.id) ? null : { userId: b.id, via: "area", areaId: "kangra" },
    );
    const first = capture("9000000024");
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(a.id, first.leadId);
    const again = capture("9000000024", {}, NOW + HOUR);
    expect(again.assigneeId).toBe(b.id);
    expect(vi.mocked(isAssignable).mock.calls.at(-1)?.[2]).toMatchObject({ kind: "repeat", firstEnquiry: true, now: NOW + HOUR });
    expect(vi.mocked(pickAssigneeForLead).mock.calls.at(-1)?.[4]).toEqual({ exclude: [a.id] });
    const lead = getLead(admin, first.leadId, NOW, { audit: false });
    if (!lead.ok) throw new Error();
    expect(lead.data.activities.find((activity) => activity.type === "assignment" && activity.meta.from === a.id)?.meta).toMatchObject({ to: b.id, auto: true, via: "area" });

    // Nobody else can take it: the lead moves to the unassigned queue (a head sees it).
    vi.mocked(isAssignable).mockImplementation(() => false);
    vi.mocked(pickAssigneeForLead).mockImplementation(() => null);
    expect(capture("9000000024", {}, NOW + 2 * HOUR).assigneeId).toBeNull();
    expect(findLeadById(getDb(), first.leadId)?.assignedTo).toBeNull();
    // A lead-gate arrival on an existing lead never re-assigns.
    vi.mocked(isAssignable).mockClear();
    capture("9000000024", { source: "tool", consent: { textVersion: "2026-10-21.gate.v1" } }, NOW + 3 * HOUR, { gate: true });
    expect(isAssignable).not.toHaveBeenCalled();
  });

  it("staff entry: a counsellor keeps their walk-in; the place goes to routing", () => {
    const counsellor = makeStaff("couns.c", "counsellor");
    const viewer = viewerOf(counsellor.id, "staff");
    const created = createManualLead(viewer, { source: "walk_in", studentName: "Walk In", phone: "9000000040", consent: true, district: "kangra" });
    if (!created.ok || created.data.duplicate) throw new Error();
    expect(findLeadById(getDb(), created.data.leadId)?.assignedTo).toBe(counsellor.id);
    expect(vi.mocked(startSlaClock).mock.calls.at(-1)?.[1]).toMatchObject({ manual: true, source: "walk_in" });
  });

  it("staff entry: the district is one of the 12 HP ids, outside-hp or empty (§13.8); free text is refused", () => {
    const counsellor = makeStaff("couns.d", "counsellor");
    const viewer = viewerOf(counsellor.id, "staff");
    expect(manualLeadSchema.safeParse({ source: "walk_in", phone: "9000000041", consent: true, district: "Near the bus stand" }).success).toBe(false);
    expect(manualLeadSchema.safeParse({ source: "walk_in", phone: "9000000041", consent: true, district: "outside-hp" }).success).toBe(true);
    expect(manualLeadSchema.safeParse({ source: "walk_in", phone: "9000000041", consent: true, district: "" }).success).toBe(true);
    const refused = createManualLead(viewer, { source: "walk_in", studentName: "Walk In", phone: "9000000041", consent: true, district: "Near the bus stand" });
    expect(refused).toMatchObject({ ok: false, error: "validation", fieldErrors: { district: [expect.any(String)] } });
    expect(findLeadByPhone(getDb(), "+919000000041")).toBeNull();
    const empty = createManualLead(viewer, { source: "walk_in", studentName: "Walk In", phone: "9000000042", consent: true, district: "" });
    expect(empty.ok).toBe(true);
  });
});

describe("SLA seam wiring (§14.3)", () => {
  it("logContact and stage moves reach the seam with via 'ui'; lost closes the clock", () => {
    const counsellor = makeStaff("couns.d", "counsellor");
    const viewer = viewerOf(counsellor.id, "staff");
    const lead = capture("9000000041");
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(counsellor.id, lead.leadId);
    expect(logContact(viewer, lead.leadId, { channel: "call", outcome: "no_answer" }, NOW).ok).toBe(true);
    expect(vi.mocked(onContactLogged).mock.calls.at(-1)?.[1]).toEqual({ leadId: lead.leadId, channel: "call", outcome: "no_answer", actorId: counsellor.id, via: "ui", at: NOW });
    expect(changeStage(viewer, lead.leadId, "counselling_booked", null, NOW + 1).ok).toBe(true);
    expect(vi.mocked(onContactLogged).mock.calls.at(-1)?.[1]).toMatchObject({ channel: "stage", stage: "counselling_booked", outcome: null, via: "ui" });
    expect(changeStage(viewer, lead.leadId, "lost", "fees", NOW + 2).ok).toBe(true);
    expect(closeSlaClock).toHaveBeenCalledWith(expect.anything(), { leadId: lead.leadId, resolution: "closed", at: NOW + 2 });
    // An assistant (MCP) is passed through as such: it never resolves a clock (L3).
    const reopened = capture("9000000041", {}, NOW + HOUR);
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(counsellor.id, reopened.leadId);
    logContact({ ...viewer, channel: "mcp" }, reopened.leadId, { channel: "whatsapp", outcome: "message_sent" }, NOW + 2 * HOUR);
    expect(vi.mocked(onContactLogged).mock.calls.at(-1)?.[1]).toMatchObject({ via: "mcp", channel: "whatsapp" });
  });

  it("createFollowUpTask: a system task, skipped when the lead already has an open one", () => {
    const lead = capture("9000000042");
    const task = createFollowUpTask(getDb(), { leadId: lead.leadId, title: "Call again", dueAt: NOW + 2 * HOUR, assigneeId: null, now: NOW, onlyIfNoOpenTask: true });
    expect(task).toMatchObject({ title: "Call again", createdBy: null });
    expect(createFollowUpTask(getDb(), { leadId: lead.leadId, title: "Call again", dueAt: NOW + 3 * HOUR, assigneeId: null, now: NOW, onlyIfNoOpenTask: true })).toBeNull();
    expect(findLeadById(getDb(), lead.leadId)?.nextTaskDueAt).toBe(NOW + 2 * HOUR);
    expect(listAudit(getDb(), { limit: 10 }).find((entry) => entry.action === CRM_AUDIT.taskCreate)).toMatchObject({ actorId: null, details: { auto: true } });
    expect(createFollowUpTask(getDb(), { leadId: "missing", title: "x", dueAt: NOW, assigneeId: null, now: NOW })).toBeNull();
  });
});

describe("settings documents (§12, §15)", () => {
  it("reads defaults without writing, writes with the version lock, audits { key, version } only", () => {
    const db = getDb();
    expect(getCallingHours(db)).toMatchObject({ value: DEFAULT_CALLING_HOURS, version: 0, isDefault: true });
    expect(getSpeedRule(db).value.firstCallMinutes).toBe(60);
    expect(db.prepare("SELECT COUNT(*) AS n FROM crm_settings").get()?.n).toBe(0);
    const rule = { ...DEFAULT_SPEED_RULE, firstCallMinutes: 45 };
    expect(writeSetting(db, "speed_rule", rule, { expectedVersion: 1, actorId: adminId, now: NOW })).toEqual({ ok: false, error: "version_conflict" });
    const saved = writeSetting(db, "speed_rule", rule, { expectedVersion: 0, actorId: adminId, now: NOW });
    expect(saved).toMatchObject({ ok: true, envelope: { version: 1, isDefault: false } });
    expect(getSpeedRule(db)).toMatchObject({ version: 1, value: { firstCallMinutes: 45 }, isDefault: false });
    expect(writeSetting(db, "speed_rule", rule, { expectedVersion: 0, actorId: adminId, now: NOW })).toEqual({ ok: false, error: "version_conflict" });
    const audit = listAudit(db, { limit: 5 }).find((entry) => entry.action === CRM_AUDIT.settingsUpdate);
    expect(audit?.details).toEqual({ key: "speed_rule", version: 1 });
    writeSetting(db, "meta_status", { lastWebhookAt: null }, { expectedVersion: null, actorId: null, now: NOW, audit: false });
    expect(listAudit(db, { limit: 5 }).filter((entry) => entry.action === CRM_AUDIT.settingsUpdate)).toHaveLength(1);
    // A malformed stored document falls back to the default (never throws).
    db.prepare("UPDATE crm_settings SET value = '{nope' WHERE key = 'speed_rule'").run();
    expect(getSpeedRule(db)).toMatchObject({ isDefault: true, version: 1 });
    expect(getMetaConfig(db).value).toMatchObject({ enabled: false, graphVersion: "v26.0", tokenTransport: "header" });
  });

  it("validates calling hours and the speed rule", () => {
    expect(validateCallingHours(DEFAULT_CALLING_HOURS)).toMatchObject({ ok: true });
    const closedAll = { ...DEFAULT_CALLING_HOURS, week: Object.fromEntries(Object.entries(DEFAULT_CALLING_HOURS.week).map(([day, hours]) => [day, { ...hours, open: false }])) };
    expect(validateCallingHours(closedAll)).toMatchObject({ ok: false, fieldErrors: { week: expect.any(Array) } });
    const inverted = { ...DEFAULT_CALLING_HOURS, week: { ...DEFAULT_CALLING_HOURS.week, mon: { open: true, start: "19:00", end: "09:00" } } };
    expect(validateCallingHours(inverted)).toMatchObject({ ok: false, fieldErrors: { "week.mon.end": expect.any(Array) } });
    expect(validateCallingHours({ ...DEFAULT_CALLING_HOURS, closedDates: ["2026-02-30"] })).toMatchObject({ ok: false });
    expect(validateSpeedRule(DEFAULT_SPEED_RULE)).toMatchObject({ ok: true });
    expect(validateSpeedRule({ ...DEFAULT_SPEED_RULE, firstCallMinutes: 2 })).toMatchObject({ ok: false, fieldErrors: { firstCallMinutes: expect.any(Array) } });
    expect(validateSpeedRule({ ...DEFAULT_SPEED_RULE, tiers: { areaHead: { enabled: true, afterMinutes: 240 }, superAdmin: { enabled: true, afterMinutes: 60 } } })).toMatchObject({
      ok: false,
      fieldErrors: { "tiers.superAdmin": expect.any(Array) },
    });
  });

  it("the clock view and minutes to due are pure", () => {
    expect(slaClockView({ reason: "import", startedAt: NOW, dueAt: NOW + HOUR, tier1At: null, tier2At: null }, NOW)).toMatchObject({ state: "due", reason: "import" });
    expect(minutesToDue(new Date(NOW + 30 * 60_000).toISOString(), NOW)).toBe(30);
  });
});
