import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser, setUserDisabled } from "@/lib/db/users";

import {
  addNote,
  captureLead,
  changeStage,
  completeTask,
  createManualLead,
  createTask,
  eraseLead,
  exportLeadsCsv,
  funnelReport,
  getLead,
  listLeads,
  logContact,
  myTasks,
  resolveCrmViewer,
  setAssignmentRules,
  updateLead,
  upsertStaff,
  writeStaffMembership,
  type CaptureLeadInput,
  type CrmRole,
  type CrmViewer,
} from "./index";

// CRM services against a fresh in-memory database per test. Synthetic people only.
const NOW = Date.UTC(2026, 9, 20, 6, 0, 0); // 11:30 IST
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let adminId: string;
let admin: CrmViewer;

function makeUser(role: Role, loginId: string, displayName = loginId) {
  return insertUser(getDb(), { role, loginId, displayName, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW });
}

function makeStaff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = [], active = true) {
  const user = makeUser("staff", loginId, `Staff ${loginId}`);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active }, NOW);
  return user;
}

function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function input(overrides: Partial<CaptureLeadInput> = {}): CaptureLeadInput {
  return {
    source: "admissions",
    studentName: "Test Student",
    phone: "98765 43210",
    currentClass: "class-11",
    programInterest: "jee",
    centreSlug: "shimla",
    consent: { textVersion: "2026-10-20.v1" },
    context: { page: "/admissions", utmSource: "newsletter" },
    ...overrides,
  };
}

function capture(overrides: Partial<CaptureLeadInput> = {}, now = NOW) {
  const result = captureLead(input(overrides), now);
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result;
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

describe("captureLead", () => {
  it("stores a consented submission with an E.164 phone, attribution and an audit row", () => {
    const result = capture({ message: "Please call after 5", reference: "ENQ-7K3M9Q2XWD" });
    expect(result).toMatchObject({ ok: true, isNew: true, assigneeId: null });
    const lead = getLead(admin, result.leadId, NOW, { audit: false });
    if (!lead.ok) throw new Error("lead missing");
    expect(lead.data).toMatchObject({
      phone: "+919876543210",
      stage: "new",
      source: "admissions",
      centreSlug: "shimla",
      page: "/admissions",
      utm: { source: "newsletter" },
      consentTextVersion: "2026-10-20.v1",
      consentAt: new Date(NOW).toISOString(),
      message: "Please call after 5",
      submissionCount: 1,
    });
    expect(lead.data.activities.map((a) => a.type)).toEqual(["submission"]);
    expect(lead.data.activities[0].meta).toMatchObject({ source: "admissions", reference: "ENQ-7K3M9Q2XWD", page: "/admissions" });
    expect(listAudit(getDb(), { limit: 10 }).find((e) => e.action === "crm.lead_capture")).toMatchObject({
      actorId: null,
      target: result.leadId,
      details: { source: "admissions", isNew: true },
    });
  });

  it("refuses submissions without consent or with an invalid phone (nothing stored)", () => {
    expect(captureLead(input({ consent: { textVersion: "" } }), NOW)).toEqual({ ok: false, error: "consent_missing" });
    expect(captureLead({ ...input(), consent: undefined } as unknown as CaptureLeadInput, NOW)).toEqual({
      ok: false,
      error: "consent_missing",
    });
    expect(captureLead(input({ phone: "12345" }), NOW)).toEqual({ ok: false, error: "invalid_phone" });
    expect(captureLead(input({ source: "Bad Source!" }), NOW)).toEqual({ ok: false, error: "invalid_input" });
    expect(listLeads(admin, {}, {}, NOW).total).toBe(0);
  });

  it("dedupes by phone: one lead, submissions appended, empty fields filled, staff edits never overwritten", () => {
    const first = capture({ guardianName: null, email: null, centreSlug: "not-sure" });
    // A staff member corrects the student name and deliberately sets the centre.
    const edit = updateLead(admin, first.leadId, { fields: { studentName: "Corrected Name", centreSlug: "hamirpur" } }, NOW + 1);
    expect(edit.ok).toBe(true);

    const second = capture(
      {
        phone: "+91-98765-43210",
        studentName: "Other Name",
        guardianName: "Guardian Name",
        email: "family@example.com",
        centreSlug: "kullu",
        message: "Second message",
        source: "hero",
        context: { page: "/", utmSource: "other" },
      },
      NOW + HOUR,
    );
    expect(second).toMatchObject({ leadId: first.leadId, isNew: false });
    const third = capture({ phone: "09876543210", source: "contact", contactName: "Contact Name", studentName: null }, NOW + 2 * HOUR);
    expect(third.leadId).toBe(first.leadId);

    expect(listLeads(admin, {}, {}, NOW).total).toBe(1);
    const lead = getLead(admin, first.leadId, NOW + 3 * HOUR, { audit: false });
    if (!lead.ok) throw new Error("lead missing");
    expect(lead.data).toMatchObject({
      studentName: "Corrected Name", // staff-edited: kept
      centreSlug: "hamirpur", // staff-edited: kept
      guardianName: "Guardian Name", // was empty: filled
      email: "family@example.com", // was empty: filled
      contactName: "Contact Name",
      source: "admissions", // first touch kept
      page: "/admissions",
      utm: { source: "newsletter" },
      message: "Second message",
      submissionCount: 3,
    });
    expect(lead.data.staffEditedFields.sort()).toEqual(["centreSlug", "studentName"]);
    const submissions = lead.data.activities.filter((a) => a.type === "submission");
    expect(submissions).toHaveLength(3);
    expect(submissions[1].meta).toMatchObject({ source: "hero", filled: ["guardianName", "email"] });
  });

  it("reopens a lost lead that enquires again", () => {
    const { leadId } = capture();
    expect(changeStage(admin, leadId, "lost", "not_interested", NOW + 1).ok).toBe(true);
    capture({}, NOW + DAY);
    const lead = getLead(admin, leadId, NOW + DAY, { audit: false });
    if (!lead.ok) throw new Error("lead missing");
    expect(lead.data).toMatchObject({ stage: "new", lostReason: null });
    expect(lead.data.activities[0]).toMatchObject({ type: "stage_change", meta: { from: "lost", to: "new", reopened: true } });
  });
});

describe("auto-assignment", () => {
  it("round-robins among active counsellors in scope, skipping managers, inactive and disabled members", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const b = makeStaff("couns.b", "counsellor", []);
    makeStaff("couns.c", "counsellor", ["hamirpur"]);
    makeStaff("couns.inactive", "counsellor", ["shimla"], false);
    const disabled = makeStaff("couns.disabled", "counsellor", ["shimla"]);
    setUserDisabled(getDb(), disabled.id, true, NOW);
    makeStaff("mgr.shimla", "manager", ["shimla"]);

    const pool = [a.id, b.id].sort();
    const assigned = [0, 1, 2, 3].map((i) => capture({ phone: `98765000${10 + i}` }).assigneeId);
    expect(assigned).toEqual([pool[0], pool[1], pool[0], pool[1]]);

    // No centre → only unscoped counsellors.
    expect(capture({ phone: "9876500099", centreSlug: null }).assigneeId).toBe(b.id);
    const lead = listLeads(admin, { assignee: a.id }, {}, NOW).items[0];
    const detail = getLead(admin, lead.id, NOW, { audit: false });
    if (!detail.ok) throw new Error("lead missing");
    expect(detail.data.activities.find((x) => x.type === "assignment")?.meta).toMatchObject({ to: a.id, auto: true, via: "centre" });
  });

  it("applies the most specific rule first, then falls back, else leaves the lead unassigned", () => {
    expect(capture({ phone: "9876500001" }).assigneeId).toBeNull();

    const m = makeStaff("mgr.neet", "manager", ["shimla"]);
    const c1 = makeStaff("couns.one", "counsellor", ["shimla"]);
    const c2 = makeStaff("couns.two", "counsellor", ["shimla"]);
    const rules = setAssignmentRules(
      admin,
      [
        { centreSlug: null, programInterest: null, memberIds: [c2.id], active: true },
        { centreSlug: "shimla", programInterest: "neet", memberIds: [m.id], active: true },
        { centreSlug: "shimla", programInterest: null, memberIds: [c1.id], active: true },
      ],
      NOW,
    );
    expect(rules.ok).toBe(true);
    expect(capture({ phone: "9876500002", programInterest: "neet" }).assigneeId).toBe(m.id);
    expect(capture({ phone: "9876500003", programInterest: "jee" }).assigneeId).toBe(c1.id);
    expect(capture({ phone: "9876500004", centreSlug: "kullu" }).assigneeId).toBe(c2.id);

    // A rule whose pool is inactive is skipped.
    upsertStaff(admin, m.id, { crmRole: "manager", centreSlugs: ["shimla"], active: false }, NOW);
    expect(capture({ phone: "9876500005", programInterest: "neet" }).assigneeId).toBe(c1.id);
  });

  it("staff memberships and rules are changed by a super admin only (D-044); ordinary admins and managers read", () => {
    // The only admin was made super admin automatically when it first used the CRM.
    expect(admin.superAdmin).toBe(true);
    const second = viewerOf(makeUser("admin", "admin.two", "Admin Two").id, "admin");
    expect(second.superAdmin).toBeUndefined();
    const c = makeStaff("couns.sa", "counsellor");
    expect(upsertStaff(second, c.id, { crmRole: "manager", centreSlugs: [], active: true }, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect(setAssignmentRules(second, [], NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect(upsertStaff(admin, c.id, { crmRole: "manager", centreSlugs: [], active: true }, NOW).ok).toBe(true);
    expect(setAssignmentRules(admin, [], NOW).ok).toBe(true);
  });
});

describe("record-level access (D-038)", () => {
  it("counsellors see only their leads; managers their centres; admins everything; others nothing", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const b = makeStaff("couns.b", "counsellor", ["hamirpur"]);
    const shimlaMgr = makeStaff("mgr.shimla", "manager", ["shimla"]);
    const allMgr = makeStaff("mgr.all", "manager", []);
    const leadA = capture({ phone: "9876500011", centreSlug: "shimla" }).leadId;
    const leadB = capture({ phone: "9876500012", centreSlug: "hamirpur" }).leadId;
    const unassigned = capture({ phone: "9876500013", centreSlug: "kullu" }).leadId;

    const va = viewerOf(a.id, "staff");
    const vb = viewerOf(b.id, "staff");
    const vShimla = viewerOf(shimlaMgr.id, "staff");
    const vAll = viewerOf(allMgr.id, "staff");

    expect(listLeads(va, {}, {}, NOW).items.map((l) => l.id)).toEqual([leadA]);
    expect(listLeads(vb, {}, {}, NOW).items.map((l) => l.id)).toEqual([leadB]);
    expect(getLead(va, leadB, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(addNote(va, leadB, "x", NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(changeStage(va, leadB, "contacted", null, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(logContact(va, leadB, { channel: "call", outcome: "connected" }, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(createTask(va, leadB, { title: "Call", dueAt: NOW + HOUR }, NOW)).toMatchObject({ ok: false, error: "not_found" });

    expect(listLeads(vShimla, {}, {}, NOW).items.map((l) => l.id)).toEqual([leadA]);
    expect(getLead(vShimla, leadB, NOW).ok).toBe(false);
    expect(listLeads(vAll, {}, {}, NOW).total).toBe(3);
    expect(listLeads(admin, {}, {}, NOW).total).toBe(3);
    expect(getLead(vAll, unassigned, NOW).ok).toBe(true);

    // A scoped manager also sees a lead of another centre once it is assigned to them (admins may assign anyone).
    expect(updateLead(admin, leadB, { assigneeId: shimlaMgr.id }, NOW).ok).toBe(true);
    expect(listLeads(vShimla, {}, {}, NOW).items.map((l) => l.id).sort()).toEqual([leadA, leadB].sort());
    expect(getLead(vb, leadB, NOW).ok).toBe(false);
  });

  it("resolves viewers only for admins and active staff members", () => {
    const member = makeStaff("couns.a", "counsellor");
    const inactive = makeStaff("couns.off", "counsellor", [], false);
    const bare = makeUser("staff", "staff.bare");
    const student = makeUser("student", "learner.one");
    const parent = makeUser("parent", "parent.one");
    expect(resolveCrmViewer({ userId: member.id, role: "staff" })).toMatchObject({ role: "counsellor" });
    expect(resolveCrmViewer({ userId: inactive.id, role: "staff" })).toBeNull();
    expect(resolveCrmViewer({ userId: bare.id, role: "staff" })).toBeNull();
    expect(resolveCrmViewer({ userId: student.id, role: "student" })).toBeNull();
    expect(resolveCrmViewer({ userId: parent.id, role: "parent" })).toBeNull();
    expect(resolveCrmViewer({ userId: member.id, role: "staff", mustChangePassword: true })).toBeNull();
    expect(resolveCrmViewer(null)).toBeNull();
    // A staff-role session is never upgraded by a membership row on a non-staff account.
    writeStaffMembership(getDb(), adminId, student.id, { crmRole: "manager", centreSlugs: [], active: true }, NOW);
    expect(resolveCrmViewer({ userId: student.id, role: "student" })).toBeNull();
    expect(resolveCrmViewer({ userId: student.id, role: "staff" })).toBeNull();
  });
});

describe("stages and assignment changes", () => {
  it("requires a reason for lost, clears it on leaving lost and keeps the furthest stage", () => {
    const { leadId } = capture();
    expect(changeStage(admin, leadId, "lost", null, NOW)).toMatchObject({
      ok: false,
      error: "validation",
      fieldErrors: { lostReason: expect.any(Array) },
    });
    expect(changeStage(admin, leadId, "counselling_booked", null, NOW).ok).toBe(true);
    const lost = changeStage(admin, leadId, "lost", "fees", NOW + 1);
    expect(lost).toMatchObject({ ok: true, data: { stage: "lost", lostReason: "fees", furthestStage: "counselling_booked" } });
    const back = changeStage(admin, leadId, "contacted", null, NOW + 2);
    expect(back).toMatchObject({ ok: true, data: { stage: "contacted", lostReason: null, furthestStage: "counselling_booked" } });
    if (!back.ok) return;
    expect(back.data.activities.filter((a) => a.type === "stage_change").map((a) => a.meta.to)).toEqual([
      "contacted",
      "lost",
      "counselling_booked",
    ]);
  });

  it("lets admins / managers assign within scope, never counsellors", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const h = makeStaff("couns.h", "counsellor", ["hamirpur"]);
    const mgr = makeStaff("mgr.shimla", "manager", ["shimla"]);
    const { leadId, assigneeId } = capture({ centreSlug: "shimla" });
    expect(assigneeId).toBe(a.id);
    const va = viewerOf(a.id, "staff");
    const vm = viewerOf(mgr.id, "staff");
    expect(updateLead(va, leadId, { assigneeId: h.id }, NOW)).toMatchObject({ ok: false });
    expect(updateLead(vm, leadId, { assigneeId: h.id }, NOW)).toMatchObject({ ok: false, error: "validation" });
    expect(updateLead(vm, leadId, { assigneeId: a.id }, NOW)).toMatchObject({ ok: true, data: { assignee: { userId: a.id } } });
    expect(updateLead(va, leadId, { assigneeId: null }, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect(updateLead(admin, leadId, { assigneeId: h.id }, NOW)).toMatchObject({ ok: true });
    expect(updateLead(admin, leadId, { assigneeId: "no-such-user" }, NOW)).toMatchObject({ ok: false, error: "validation" });
    // After reassignment the first counsellor loses access.
    expect(getLead(va, leadId, NOW).ok).toBe(false);
    // Only real changes are audited (a → a is a no-op; a → h is one change).
    expect(listAudit(getDb(), { limit: 50 }).filter((e) => e.action === "crm.assign")).toHaveLength(1);
  });

  it("logs contacts (connected moves new → contacted) and validates fields", () => {
    const { leadId } = capture();
    const logged = logContact(admin, leadId, { channel: "whatsapp", outcome: "message_sent", body: "Sent brochure link" }, NOW);
    expect(logged).toMatchObject({ ok: true, data: { type: "whatsapp", meta: { outcome: "message_sent" }, body: "Sent brochure link" } });
    expect(getLead(admin, leadId, NOW, { audit: false })).toMatchObject({ data: { stage: "new" } });
    logContact(admin, leadId, { channel: "call", outcome: "connected" }, NOW + 1);
    expect(getLead(admin, leadId, NOW, { audit: false })).toMatchObject({ data: { stage: "contacted" } });
    expect(logContact(admin, leadId, { channel: "sms" as never, outcome: "connected" }, NOW)).toMatchObject({ error: "validation" });
    expect(updateLead(admin, leadId, { fields: { email: "not-an-email" } }, NOW)).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(Array) },
    });
    expect(addNote(admin, leadId, "   ", NOW)).toMatchObject({ ok: false, error: "validation" });
  });
});

describe("tasks", () => {
  it("tracks due / overdue, my tasks and the lead's next due date", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const va = viewerOf(a.id, "staff");
    const first = capture({ phone: "9876500021" });
    const second = capture({ phone: "9876500022" });
    expect(first.assigneeId).toBe(a.id);

    const overdue = createTask(va, first.leadId, { title: "Call back", dueAt: new Date(NOW - 20 * HOUR).toISOString() }, NOW);
    const today = createTask(va, second.leadId, { title: "Share fee sheet", dueAt: NOW + 3 * HOUR }, NOW);
    const later = createTask(va, second.leadId, { title: "Demo class", dueAt: NOW + 3 * DAY }, NOW);
    expect(overdue).toMatchObject({ ok: true, data: { overdue: true, assignee: { userId: a.id } } });
    expect(today.ok && later.ok).toBe(true);
    expect(createTask(va, first.leadId, { title: "x", dueAt: NOW - 3 * DAY }, NOW)).toMatchObject({ error: "validation" });
    expect(createTask(va, first.leadId, { title: "x", dueAt: "not a date" }, NOW)).toMatchObject({ error: "validation" });

    expect(myTasks(va, "overdue", NOW).map((t) => t.title)).toEqual(["Call back"]);
    expect(myTasks(va, "today", NOW).map((t) => t.title)).toEqual(["Share fee sheet"]);
    expect(myTasks(va, "upcoming", NOW).map((t) => t.title)).toEqual(["Share fee sheet", "Demo class"]);
    expect(myTasks(va, "open", NOW)).toHaveLength(3);
    expect(listLeads(va, { due: "overdue" }, {}, NOW).items.map((l) => l.id)).toEqual([first.leadId]);
    expect(listLeads(va, { due: "today" }, {}, NOW).items.map((l) => l.id)).toEqual([second.leadId]);
    expect(listLeads(va, { sort: "due" }, {}, NOW).items.map((l) => l.id)).toEqual([first.leadId, second.leadId]);

    if (!today.ok) return;
    expect(completeTask(va, today.data.id, NOW + HOUR)).toMatchObject({ ok: true, data: { doneAt: new Date(NOW + HOUR).toISOString() } });
    expect(completeTask(va, today.data.id, NOW + 2 * HOUR).ok).toBe(true); // idempotent
    const lead = getLead(va, second.leadId, NOW + HOUR, { audit: false });
    expect(lead).toMatchObject({ ok: true, data: { nextTaskDueAt: new Date(NOW + 3 * DAY).toISOString() } });
    expect(myTasks(va, "done", NOW + HOUR).map((t) => t.title)).toEqual(["Share fee sheet"]);

    // Another counsellor can neither see nor complete these tasks.
    const other = viewerOf(makeStaff("couns.b", "counsellor", ["hamirpur"]).id, "staff");
    if (!later.ok) return;
    expect(completeTask(other, later.data.id, NOW)).toMatchObject({ ok: false, error: "not_found" });
    expect(myTasks(other, "open", NOW)).toEqual([]);
  });
});

describe("manual leads", () => {
  it("creates staff-entered leads (counsellors keep them) and reuses an existing phone", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const va = viewerOf(a.id, "staff");
    const created = createManualLead(va, { source: "walk_in", studentName: "Walk In", phone: "9876500031", consent: true, note: "Came with father" }, NOW);
    expect(created).toMatchObject({ ok: true, data: { isNew: true } });
    if (!created.ok) return;
    expect(getLead(va, created.data.leadId, NOW, { audit: false })).toMatchObject({
      ok: true,
      data: { source: "walk_in", assignee: { userId: a.id }, consentTextVersion: "staff-recorded" },
    });
    expect(createManualLead(va, { source: "walk_in", studentName: "Again", phone: "+91 98765 00031", consent: true }, NOW)).toMatchObject({
      ok: true,
      data: { leadId: created.data.leadId, isNew: false },
    });
    expect(createManualLead(va, { source: "walk_in", phone: "123", consent: true } as never, NOW)).toMatchObject({
      ok: false,
      error: "validation",
    });
  });
});

describe("export (D-042)", () => {
  it("is admin / manager only, scoped, formula-safe and audited without personal data", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const mgr = makeStaff("mgr.hamirpur", "manager", ["hamirpur"]);
    capture({ phone: "9876500041", studentName: "=HYPERLINK(\"http://evil.example\",\"x\")", centreSlug: "shimla" });
    capture({ phone: "9876500042", studentName: "@Hamirpur Kid", centreSlug: "hamirpur" });

    expect(exportLeadsCsv(viewerOf(a.id, "staff"), {}, NOW)).toMatchObject({ ok: false, error: "forbidden" });

    const all = exportLeadsCsv(admin, {}, NOW);
    if (!all.ok) throw new Error("export failed");
    expect(all.data.rows).toBe(2);
    expect(all.data.filename).toBe("aspire-leads-2026-10-20.csv");
    expect(all.data.csv).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(all.data.csv).toContain(`"'+919876500041"`);
    expect(all.data.csv).toContain(`"'@Hamirpur Kid"`);
    for (const line of all.data.csv.replace(/^﻿/, "").trim().split("\r\n")) {
      for (const cell of line.match(/"(?:[^"]|"")*"/g) ?? []) expect(cell).not.toMatch(/^"[=+\-@\t\r]/);
    }

    const scoped = exportLeadsCsv(viewerOf(mgr.id, "staff"), { q: "Hamirpur" }, NOW);
    expect(scoped).toMatchObject({ ok: true, data: { rows: 1 } });
    const entries = listAudit(getDb(), { limit: 50 }).filter((e) => e.action === "crm.export");
    expect(entries).toHaveLength(2);
    expect(entries[0].details).toEqual({ rows: 1, filters: "q", truncated: false });
    expect(JSON.stringify(entries)).not.toContain("Hamirpur Kid");
  });
});

describe("erase (D-042)", () => {
  it("wipes personal data, keeps an anonymised stub for the funnel and is admin only", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const va = viewerOf(a.id, "staff");
    const { leadId } = capture({ guardianName: "Guardian Name", email: "family@example.com", message: "Call me" });
    addNote(va, leadId, "Father is Mr Example, prefers evenings", NOW);
    createTask(va, leadId, { title: "Call Mr Example", dueAt: NOW + HOUR }, NOW);
    changeStage(va, leadId, "contacted", null, NOW);

    expect(eraseLead(va, leadId, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    const erased = eraseLead(admin, leadId, NOW + 1);
    expect(erased).toMatchObject({ ok: true, data: { leadId } });
    expect(eraseLead(admin, leadId, NOW + 2)).toMatchObject({ ok: true }); // idempotent

    const stub = getLead(admin, leadId, NOW + 2, { audit: false });
    if (!stub.ok) throw new Error("stub missing");
    expect(stub.data).toMatchObject({
      erased: true,
      displayName: null,
      studentName: null,
      guardianName: null,
      phone: null,
      email: null,
      message: null,
      stage: "contacted",
      source: "admissions",
      centreSlug: "shimla",
      programInterest: "jee",
      nextTaskDueAt: null,
    });
    const text = JSON.stringify(stub.data);
    for (const secret of ["Test Student", "Guardian Name", "family@example.com", "9876543210", "Call me", "Mr Example"]) {
      expect(text).not.toContain(secret);
    }
    expect(stub.data.activities.every((activity) => activity.body === null)).toBe(true);
    expect(stub.data.tasks.every((task) => task.title === "[erased]" && task.doneAt !== null)).toBe(true);

    // Gone from the inbox and from staff, still counted in the funnel, can't be changed.
    expect(listLeads(admin, {}, {}, NOW).total).toBe(0);
    expect(listLeads(admin, { includeErased: true }, {}, NOW).total).toBe(1);
    expect(getLead(va, leadId, NOW).ok).toBe(false);
    expect(addNote(admin, leadId, "x", NOW)).toMatchObject({ ok: false, error: "conflict" });
    expect(funnelReport(admin, { from: NOW - DAY, to: NOW + DAY })).toMatchObject({ total: 1, byStage: { contacted: 1 } });

    // The same family enquiring again starts a fresh lead.
    expect(capture({}, NOW + DAY)).toMatchObject({ isNew: true });
    expect(listAudit(getDb(), { limit: 100 }).some((e) => e.action === "crm.lead_erase" && e.target === leadId)).toBe(true);
  });
});

describe("funnel report", () => {
  it("counts stages, reach, sources, centres, counsellors and conversion within the viewer's scope", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const l1 = capture({ phone: "9876500051", source: "hero" }).leadId;
    const l2 = capture({ phone: "9876500052", source: "admissions" }).leadId;
    capture({ phone: "9876500053", source: "admissions", centreSlug: "kullu" });
    capture({ phone: "9876500054", source: "contact" }, NOW - 40 * DAY); // outside the range
    changeStage(admin, l1, "enrolled", null, NOW);
    changeStage(admin, l2, "applied", null, NOW);
    changeStage(admin, l2, "lost", "fees", NOW);

    const report = funnelReport(admin, { from: NOW - 30 * DAY, to: NOW + DAY });
    expect(report.total).toBe(3);
    expect(report.byStage).toMatchObject({ enrolled: 1, lost: 1, new: 1 });
    expect(report.reached).toMatchObject({ new: 3, contacted: 2, applied: 2, enrolled: 1 });
    expect(report.bySource.map((s) => [s.key, s.total])).toEqual([
      ["admissions", 2],
      ["hero", 1],
    ]);
    expect(report.byCentre.find((c) => c.key === "kullu")?.total).toBe(1);
    expect(report.lostReasons).toEqual([{ key: "fees", count: 1 }]);
    expect(report.conversion).toEqual({ contactedRate: 0.6667, enrolledRate: 0.3333 });
    expect(report.byCounsellor.find((c) => c.userId === a.id)?.total).toBe(2);

    const mine = funnelReport(viewerOf(a.id, "staff"), { from: NOW - 30 * DAY, to: NOW + DAY });
    expect(mine.total).toBe(2);
  });
});

describe("audit rows never carry personal data", () => {
  it("covers capture, view, update, notes, contacts, tasks, export and erase", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const va = viewerOf(a.id, "staff");
    const { leadId } = capture({ studentName: "Secret Student", guardianName: "Secret Guardian", email: "secret@example.com", message: "Secret message" });
    capture({ studentName: "Secret Student", phone: "98765-43210" });
    getLead(va, leadId, NOW);
    updateLead(va, leadId, { fields: { guardianName: "Secret Renamed" }, stage: "contacted" }, NOW);
    addNote(va, leadId, "Secret note text", NOW);
    logContact(va, leadId, { channel: "call", outcome: "busy", body: "Secret call note" }, NOW);
    const task = createTask(va, leadId, { title: "Secret task title", dueAt: NOW + HOUR }, NOW);
    if (task.ok) completeTask(va, task.data.id, NOW);
    exportLeadsCsv(admin, { q: "Secret" }, NOW);
    eraseLead(admin, leadId, NOW);

    const entries = listAudit(getDb(), { limit: 200 }).filter((e) => e.action.startsWith("crm."));
    expect(new Set(entries.map((e) => e.action))).toEqual(
      new Set([
        "crm.staff_upsert",
        "crm.lead_capture",
        "crm.lead_view",
        "crm.lead_update",
        "crm.stage_change",
        "crm.note_add",
        "crm.contact_log",
        "crm.task_create",
        "crm.task_done",
        "crm.export",
        "crm.lead_erase",
      ]),
    );
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toMatch(/Secret|secret@|9876543210|98765/);
  });
});

describe("list privacy, tool ids and display names (CRM-UI requests)", () => {
  it("masks phones in lists and task lists; only the audited lead view has the full number", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const va = viewerOf(a.id, "staff");
    const { leadId } = capture({ phone: "9876500061" });
    createTask(va, leadId, { title: "Call", dueAt: NOW + HOUR }, NOW);

    const item = listLeads(va, {}, {}, NOW).items[0];
    expect(item.phone).toBe("+91 ••••• •0061");
    expect(item.phoneLast4).toBe("0061");
    expect(JSON.stringify(listLeads(admin, {}, {}, NOW))).not.toContain("9876500061");
    const task = myTasks(va, "open", NOW)[0];
    expect(task).toMatchObject({ leadPhone: "+91 ••••• •0061", leadPhoneLast4: "0061" });
    expect(getLead(va, leadId, NOW)).toMatchObject({ ok: true, data: { phone: "+919876500061", phoneLast4: "0061" } });
  });

  it("uses the contract's tool id mock-test everywhere (legacy mocktest rows are mapped) and reports byTool", () => {
    const legacy = capture({ phone: "9876500071", source: "tool", context: { tool: "mocktest" } });
    capture({ phone: "9876500072", source: "tool", context: { tool: "mock-test" } });
    capture({ phone: "9876500073", source: "tool", context: { tool: "predictor", toolExam: "jee-main", toolBand: "score-180-189" } });
    capture({ phone: "9876500074" });
    // A row written before the canonical id existed.
    getDb().prepare("UPDATE crm_leads SET tool = 'mocktest' WHERE id = ?").run(legacy.leadId);

    expect(listLeads(admin, {}, {}, NOW).items.filter((l) => l.tool === "mock-test")).toHaveLength(2);
    const detail = getLead(admin, legacy.leadId, NOW, { audit: false });
    expect(detail).toMatchObject({ ok: true, data: { tool: "mock-test", activities: [{ meta: { tool: "mock-test" } }] } });
    const report = funnelReport(admin, { from: NOW - DAY, to: NOW + DAY });
    expect(report.byTool?.map((row) => [row.key, row.total])).toEqual([
      ["mock-test", 2],
      ["none", 1],
      ["predictor", 1],
    ]);
    const csv = exportLeadsCsv(admin, {}, NOW);
    expect(csv.ok && csv.data.csv.includes('"mocktest"')).toBe(false);
  });

  it("names who was assigned (and from whom) on assignment entries; the assigner is the actor", () => {
    const a = makeStaff("couns.a", "counsellor", ["shimla"]);
    const b = makeStaff("couns.b", "counsellor", ["shimla"]);
    const { leadId, assigneeId } = capture({ phone: "9876500081" });
    const other = assigneeId === a.id ? b : a;
    updateLead(admin, leadId, { assigneeId: other.id }, NOW + 1);
    createTask(admin, leadId, { title: "Call", dueAt: NOW + HOUR, assigneeId: other.id }, NOW + 2);
    const detail = getLead(admin, leadId, NOW, { audit: false });
    if (!detail.ok) throw new Error("lead missing");
    const [manual, auto] = detail.data.activities.filter((x) => x.type === "assignment");
    expect(manual).toMatchObject({ actorName: "Admin One", meta: { toName: `Staff ${other.loginId}`, fromName: expect.stringMatching(/^Staff couns\./) } });
    expect(auto).toMatchObject({ actorId: null, meta: { auto: true, toName: expect.stringMatching(/^Staff couns\./) } });
    expect(detail.data.activities.find((x) => x.type === "task_created")?.meta.assigneeName).toBe(`Staff ${other.loginId}`);
  });
});

// ---------------------------------------------------------------------------------------------
// Admin console Phase 1b (docs/admin-phase-1b-plan.md §4.3): the new inbox filters.

describe("admin console 1b inbox filters (§4.3)", () => {
  it("contact=none, signups=hide and created=today|week|over24h narrow the inbox; centre compares the effective centre", () => {
    // NOW is Tuesday 20 Oct 2026, 11:30 IST: the week started on Monday 19 Oct, 00:00 IST.
    const fresh = capture({ phone: "9876500101" }, NOW).leadId;
    const called = capture({ phone: "9876500102" }, NOW - 20 * HOUR).leadId;
    const older = capture({ phone: "9876500103" }, NOW - 3 * DAY).leadId;
    const signup = captureLead(input({ phone: "9876500104", source: "tool", consent: { textVersion: "2026-10-21.gate.v1" } }), NOW - HOUR, { gate: true });
    if (!signup.ok) throw new Error("capture failed");
    // No centre of its own, but routed by district to Mandi, which the Kullu centre serves.
    const routed = capture({ phone: "9876500105", centreSlug: null, district: "mandi" }, NOW - 2 * HOUR).leadId;
    expect(logContact(admin, called, { channel: "call", outcome: "no_answer" }, NOW - 19 * HOUR).ok).toBe(true);

    const ids = (filters: Parameters<typeof listLeads>[1]) => listLeads(admin, filters, { pageSize: 100 }, NOW).items.map((lead) => lead.id).sort();
    expect(ids({ created: "today" })).toEqual([fresh, signup.leadId, routed].sort());
    expect(ids({ created: "week" })).toEqual([fresh, called, signup.leadId, routed].sort());
    expect(ids({ created: "over24h" })).toEqual([older]);
    expect(ids({ contact: "none" })).toEqual([fresh, older, signup.leadId, routed].sort());
    expect(ids({ signups: "hide" })).toEqual([fresh, called, older, routed].sort());
    expect(ids({ stage: "new", contact: "none", signups: "hide", created: "today" })).toEqual([fresh, routed].sort());
    expect(ids({ centre: "kullu" })).toEqual([routed]);
    expect(ids({ centre: "shimla" })).toEqual([fresh, called, older, signup.leadId].sort());
    expect(ids({ centre: "none" })).toEqual([]);
    // `created` replaces explicit dates; unknown values are ignored by the service.
    expect(ids({ created: "today", createdFrom: "2020-01-01" })).toEqual(ids({ created: "today" }));
    expect(ids({ created: "someday" as never })).toHaveLength(5);
  });

  it("logContact keeps the WhatsApp template and language, and an erase keeps them (non-personal)", () => {
    const { leadId } = capture({ phone: "9876500111" });
    expect(logContact(admin, leadId, { channel: "whatsapp", outcome: "message_sent", extra: { template: "missed_call", lang: "hi" } }, NOW)).toMatchObject({
      ok: true,
      data: { meta: { outcome: "message_sent", template: "missed_call", lang: "hi" } },
    });
    expect(eraseLead(admin, leadId, NOW + 1).ok).toBe(true);
    const detail = getLead(admin, leadId, NOW + 1, { audit: false });
    if (!detail.ok) throw new Error("lead missing");
    expect(detail.data.activities.find((x) => x.type === "whatsapp")?.meta).toEqual({ outcome: "message_sent", template: "missed_call", lang: "hi" });
  });
});
