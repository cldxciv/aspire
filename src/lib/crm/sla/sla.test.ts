import type { SQLInputValue } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";

import { eraseLead } from "../admin";
import { DEFAULT_CALLING_HOURS, DEFAULT_SPEED_RULE, type SpeedRule } from "../lead-ops-types";
import { assignLead, changeStage, logContact } from "../leads";
import { queryLeads, type LeadScope } from "../repo/leads";
import { leadFilterWhere, type LeadFilter } from "../repo/sla";
import { setAvailability } from "../repo/staff-ops";
import { setUserAreas } from "../routing";
import { updateArea } from "../routing/areas-service";
import { completeTask } from "../tasks";
import { addWorkingMinutes } from "./calling-hours";
import { RETRY_TASK_TITLE } from "./followups";
import { closeSlaClock, onContactLogged, recomputeOpenClocks, startSlaClock } from "./index";
import { saveSpeedSettings } from "./policy";
import { slaQueue, slaSummary } from "./views";
import { clocksOf, HOUR, ist, lead, MINUTE, openTasksOf, phone, staff, T0, user, viewerOf } from "./test-kit";

// LR-SLA (docs/lead-routing-plan.md §15, §24): the real seam against a fresh in-memory database,
// through CORE's capture / contact / stage / erase services and ROUTING's real routing.

const db = () => getDb();

/** The first admin is the bootstrap super admin (D-044). */
function owner() {
  const account = user("admin", "owner.sa");
  return { account, viewer: viewerOf(account.id, "admin") };
}

function saveRule(viewer: ReturnType<typeof viewerOf>, patch: Partial<SpeedRule>, at = T0, version = currentVersion("speed_rule")) {
  const result = saveSpeedSettings(viewer, { speedRule: { ...DEFAULT_SPEED_RULE, ...patch }, expectedVersion: { speedRule: version } }, recomputeOpenClocks, at);
  if (!result.ok) throw new Error(`save failed: ${result.error}`);
  return result.data;
}

function currentVersion(key: string): number {
  return Number(db().prepare("SELECT version FROM crm_settings WHERE key = ?").get(key)?.version ?? 0);
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("starting a clock (§15 Start)", () => {
  it("starts on a website enquiry: due one working hour later, area head at 1 h, super admins at 4 h", () => {
    staff("exec.one", "counsellor");
    const { leadId, assigneeId } = lead();
    expect(assigneeId).not.toBeNull();
    expect(clocksOf(leadId)).toMatchObject([
      {
        reason: "new",
        source: "admissions",
        startedAt: T0,
        dueAt: ist("2026-10-21", "12:30"),
        tier1At: ist("2026-10-21", "12:30"),
        tier2At: ist("2026-10-21", "15:30"),
        policyVersion: 1,
        resolvedAt: null,
      },
    ]);
    // One open clock per lead: a repeat enquiry never starts a second one or resets it.
    lead({ phone: phoneOf(leadId) }, T0 + 20 * MINUTE);
    expect(clocksOf(leadId)).toHaveLength(1);
  });

  it("leaves tool sign-ups (lead gate) without a clock by default; their first real enquiry starts one", () => {
    staff("exec.one", "counsellor");
    const number = phone();
    const signup = lead({ phone: number, source: "tool" }, T0, { gate: true });
    expect(clocksOf(signup.leadId)).toEqual([]);
    lead({ phone: number, source: "admissions" }, T0 + HOUR);
    expect(clocksOf(signup.leadId)).toMatchObject([{ reason: "new", source: "admissions", startedAt: T0 + HOUR }]);
  });

  it("starts for tool sign-ups only when leadGate is on, and only for sources on the list", () => {
    const { viewer } = owner();
    staff("exec.one", "counsellor");
    expect(clocksOf(lead({ source: "phone_call" }).leadId)).toEqual([]);
    expect(clocksOf(lead({ source: "walk_in" }).leadId)).toEqual([]);
    expect(clocksOf(lead({ source: "contact" }).leadId)).toHaveLength(1);

    saveRule(viewer, { leadGate: true, sources: DEFAULT_SPEED_RULE.sources.filter((source) => source !== "contact") });
    expect(clocksOf(lead({ source: "contact" }, T0 + MINUTE).leadId)).toEqual([]);
    expect(clocksOf(lead({ source: "tool" }, T0 + MINUTE, { gate: true }).leadId)).toHaveLength(1);
  });

  it("honours the CSV option (override) and the import reason", () => {
    staff("exec.one", "counsellor");
    expect(clocksOf(lead({}, T0, { slaClock: false }).leadId)).toEqual([]);
    const imported = lead({ source: "csv_import", consent: { textVersion: "csv:in_person", method: "csv_import" } }, T0, { slaClock: true, clockReason: "import" });
    expect(clocksOf(imported.leadId)).toMatchObject([{ reason: "import", source: "csv_import" }]);
    // Even a source off the list starts with the override.
    expect(clocksOf(lead({ source: "phone_call" }, T0, { slaClock: true, clockReason: "import" }).leadId)).toMatchObject([{ reason: "import" }]);
  });

  it("starts a Meta lead at the inbox received time (honestly late), never in the future", () => {
    staff("exec.one", "counsellor");
    const late = lead({}, T0, { arrivedAt: T0 - 2 * HOUR });
    expect(clocksOf(late.leadId)).toMatchObject([{ startedAt: T0 - 2 * HOUR, dueAt: ist("2026-10-21", "10:30") }]);
    const ahead = lead({}, T0, { arrivedAt: T0 + 5 * HOUR });
    expect(clocksOf(ahead.leadId)[0].startedAt).toBe(T0);
  });

  it("starts a second clock (reason reopened) when a lost family enquires again; the first stays closed", () => {
    const { viewer: admin } = owner();
    staff("exec.one", "counsellor");
    const number = phone();
    const first = lead({ phone: number });
    expect(changeStage(admin, first.leadId, "lost", "not_interested", T0 + 5 * MINUTE).ok).toBe(true);
    const again = lead({ phone: number, source: "contact" }, T0 + HOUR);
    expect(again.leadId).toBe(first.leadId);
    expect(clocksOf(first.leadId)).toMatchObject([
      { reason: "new", resolution: "closed", resolvedAt: T0 + 5 * MINUTE },
      { reason: "reopened", source: "contact", startedAt: T0 + HOUR, resolvedAt: null, dueAt: ist("2026-10-21", "13:30") },
    ]);
  });

  it("does not start a reopened clock for a source off the list", () => {
    const { viewer: admin } = owner();
    staff("exec.one", "counsellor");
    saveRule(admin, { sources: DEFAULT_SPEED_RULE.sources.filter((source) => source !== "contact") });
    const number = phone();
    const first = lead({ phone: number });
    changeStage(admin, first.leadId, "lost", "not_interested", T0 + 5 * MINUTE);
    lead({ phone: number, source: "contact" }, T0 + HOUR);
    expect(clocksOf(first.leadId)).toMatchObject([{ reason: "new", resolution: "closed" }]);
  });

  it("never starts on an erased, lost or already-clocked lead (direct seam call)", () => {
    staff("exec.one", "counsellor");
    const { leadId } = lead();
    const start = (override?: boolean) =>
      startSlaClock(db(), { leadId, source: "admissions", gate: false, manual: false, reason: "new", arrivedAt: T0, at: T0, override });
    expect(start(true)).toBe(false);
    closeSlaClock(db(), { leadId, resolution: "closed", at: T0 });
    expect(start(false)).toBe(false);
    expect(start(true)).toBe(true);
  });
});

describe("resolving a clock (§15 Resolve)", () => {
  it("met or late, by call, WhatsApp or stage; working time and the first attempter are stored", () => {
    const exec = staff("exec.one", "counsellor");
    const viewer = viewerOf(exec.id, "staff");
    const byCall = lead();
    const byWhatsApp = lead();
    const byStage = lead();

    expect(logContact(viewer, byCall.leadId, { channel: "call", outcome: "no_answer" }, T0 + 30 * MINUTE).ok).toBe(true);
    expect(logContact(viewer, byWhatsApp.leadId, { channel: "whatsapp", outcome: "message_sent" }, T0 + 2 * HOUR).ok).toBe(true);
    expect(changeStage(viewer, byStage.leadId, "contacted", null, T0 + 10 * MINUTE).ok).toBe(true);

    expect(clocksOf(byCall.leadId)[0]).toMatchObject({ resolution: "attempt", met: true, workMs: 30 * MINUTE, firstAttemptChannel: "call", firstAttemptBy: exec.id, attempts: 1 });
    expect(clocksOf(byWhatsApp.leadId)[0]).toMatchObject({ resolution: "attempt", met: false, workMs: 2 * HOUR, firstAttemptChannel: "whatsapp" });
    expect(clocksOf(byStage.leadId)[0]).toMatchObject({ resolution: "attempt", met: true, firstAttemptChannel: "stage", workMs: 10 * MINUTE });
  });

  it("ignores MCP (an assistant never resolves, counts or retries; L3)", () => {
    const exec = staff("exec.one", "counsellor");
    const { leadId } = lead();
    expect(logContact(viewerOf(exec.id, "staff", "mcp"), leadId, { channel: "call", outcome: "no_answer" }, T0 + 10 * MINUTE).ok).toBe(true);
    onContactLogged(db(), { leadId, channel: "stage", outcome: null, stage: "contacted", actorId: exec.id, via: "mcp", at: T0 + 11 * MINUTE });
    expect(clocksOf(leadId)[0]).toMatchObject({ resolvedAt: null, attempts: 0, retriesCreated: 0 });
    expect(openTasksOf(leadId)).toEqual([]);
  });

  it("with countOnly = connected, an unanswered call only counts an attempt", () => {
    const { viewer: sa } = owner();
    saveRule(sa, { countOnly: "connected" });
    const exec = staff("exec.one", "counsellor");
    const viewer = viewerOf(exec.id, "staff");
    const { leadId } = lead();
    logContact(viewer, leadId, { channel: "call", outcome: "busy" }, T0 + 10 * MINUTE);
    expect(clocksOf(leadId)[0]).toMatchObject({ resolvedAt: null, attempts: 1 });
    logContact(viewer, leadId, { channel: "call", outcome: "connected" }, T0 + 20 * MINUTE);
    expect(clocksOf(leadId)[0]).toMatchObject({ resolution: "attempt", met: true, attempts: 2, reachedAt: T0 + 20 * MINUTE });
  });

  it("closes on lost and on erase", () => {
    const { viewer: admin } = owner();
    staff("exec.one", "counsellor");
    const lost = lead();
    const erased = lead();
    expect(changeStage(admin, lost.leadId, "lost", "not_interested", T0 + 5 * MINUTE).ok).toBe(true);
    expect(eraseLead(admin, erased.leadId, T0 + 6 * MINUTE, { reason: "wrong_or_test" }).ok).toBe(true);
    expect(clocksOf(lost.leadId)[0]).toMatchObject({ resolution: "closed", resolvedAt: T0 + 5 * MINUTE, firstAttemptAt: null });
    expect(clocksOf(erased.leadId)[0]).toMatchObject({ resolution: "erased", resolvedAt: T0 + 6 * MINUTE });
  });

  it("charges a late call to whoever held the lead at due time (A10), crediting the caller", () => {
    const { viewer: admin } = owner();
    const a = staff("exec.a", "counsellor");
    const b = staff("exec.b", "counsellor");
    const { leadId } = lead();
    assignLead(admin, leadId, a.id, T0);
    assignLead(admin, leadId, b.id, T0 + 90 * MINUTE); // after the 12:30 due time
    logContact(viewerOf(b.id, "staff"), leadId, { channel: "call", outcome: "connected" }, T0 + 2 * HOUR);
    expect(clocksOf(leadId)[0]).toMatchObject({ met: false, firstAttemptBy: b.id, assigneeAtDue: a.id });
  });
});

describe("policy changes recompute open clocks (§15 Policy change)", () => {
  it("moves due and alert times from each clock's start, bumps the version, audits key + version only", () => {
    const { viewer: sa, account } = owner();
    staff("exec.one", "counsellor");
    const open = lead();
    const done = lead();
    logContact(viewerOf(clocksAssignee(done.leadId), "staff"), done.leadId, { channel: "call", outcome: "connected" }, T0 + MINUTE);
    const before = clocksOf(done.leadId)[0];

    const saved = saveRule(sa, { firstCallMinutes: 30, tiers: { areaHead: { enabled: true, afterMinutes: 30 }, superAdmin: { enabled: false, afterMinutes: 240 } } }, T0 + 2 * MINUTE);
    expect(saved.recomputed).toBe(1);
    expect(saved.speedRule).toMatchObject({ version: 1, value: { firstCallMinutes: 30 } });
    expect(clocksOf(open.leadId)[0]).toMatchObject({ startedAt: T0, dueAt: ist("2026-10-21", "12:00"), tier1At: ist("2026-10-21", "12:00"), tier2At: null, policyVersion: 2 });
    expect(clocksOf(done.leadId)[0]).toEqual(before);

    const audit = listAudit(db(), { limit: 50 }).filter((entry) => entry.action === "crm.settings_update");
    expect(audit).toEqual([expect.objectContaining({ actorId: account.id, target: "speed_rule", details: { key: "speed_rule", version: 1 } })]);

    // Calling hours: Wednesday closed → the open clock is due Thursday.
    const hours = saveSpeedSettings(
      sa,
      { callingHours: { ...DEFAULT_CALLING_HOURS, closedDates: ["2026-10-21"] }, expectedVersion: { callingHours: 0 } },
      recomputeOpenClocks,
      T0 + 3 * MINUTE,
    );
    expect(hours.ok && hours.data.recomputed).toBe(1);
    expect(clocksOf(open.leadId)[0]).toMatchObject({ dueAt: ist("2026-10-22", "09:30"), policyVersion: 3 });
  });

  it("refuses a stale version (409) and anyone but a super admin, writing nothing", () => {
    const { viewer: sa } = owner();
    saveRule(sa, { firstCallMinutes: 45 });
    const stale = saveSpeedSettings(sa, { speedRule: { ...DEFAULT_SPEED_RULE, firstCallMinutes: 90 }, expectedVersion: { speedRule: 0 } }, recomputeOpenClocks, T0);
    expect(stale).toMatchObject({ ok: false, error: "conflict" });
    const plain = user("admin", "plain.admin");
    const head = staff("head.one", "manager");
    for (const viewer of [viewerOf(plain.id, "admin"), viewerOf(head.id, "staff")]) {
      expect(saveSpeedSettings(viewer, { speedRule: DEFAULT_SPEED_RULE, expectedVersion: { speedRule: 1 } }, recomputeOpenClocks, T0)).toMatchObject({ ok: false, error: "forbidden" });
    }
    const invalid = saveSpeedSettings(sa, { speedRule: { ...DEFAULT_SPEED_RULE, firstCallMinutes: 2 }, expectedVersion: { speedRule: 1 } }, recomputeOpenClocks, T0);
    expect(invalid).toMatchObject({ ok: false, error: "validation", fieldErrors: { "speedRule.firstCallMinutes": [expect.any(String)] } });
    expect(currentVersion("speed_rule")).toBe(1);
  });
});

describe("retries and reached (§15, A6)", () => {
  it("no_answer → +2 working hours; then the next opening + 1 h; at most 3; never a second open task", () => {
    const exec = staff("exec.one", "counsellor");
    const viewer = viewerOf(exec.id, "staff");
    const { leadId } = lead();
    const at1 = T0 + 10 * MINUTE; // 11:40
    logContact(viewer, leadId, { channel: "call", outcome: "no_answer" }, at1);
    let tasks = openTasksOf(leadId);
    expect(tasks).toEqual([{ id: expect.any(String), title: RETRY_TASK_TITLE, dueAt: addWorkingMinutes(DEFAULT_CALLING_HOURS, at1, 120), assigneeId: exec.id, createdBy: null }]);
    expect(tasks[0].dueAt).toBe(ist("2026-10-21", "13:40"));

    logContact(viewer, leadId, { channel: "call", outcome: "busy" }, T0 + 30 * MINUTE);
    expect(openTasksOf(leadId)).toHaveLength(1);
    expect(clocksOf(leadId)[0]).toMatchObject({ retriesCreated: 1, attempts: 2 });

    completeTask(viewer, tasks[0].id, ist("2026-10-21", "13:45"));
    logContact(viewer, leadId, { channel: "call", outcome: "switched_off" }, ist("2026-10-21", "13:45"));
    tasks = openTasksOf(leadId);
    expect(tasks.map((task) => task.dueAt)).toEqual([ist("2026-10-22", "10:00")]);

    completeTask(viewer, tasks[0].id, ist("2026-10-22", "10:05"));
    logContact(viewer, leadId, { channel: "call", outcome: "no_answer" }, ist("2026-10-22", "10:05"));
    tasks = openTasksOf(leadId);
    expect(tasks.map((task) => task.dueAt)).toEqual([ist("2026-10-23", "10:00")]);

    completeTask(viewer, tasks[0].id, ist("2026-10-23", "10:05"));
    logContact(viewer, leadId, { channel: "call", outcome: "no_answer" }, ist("2026-10-23", "10:05"));
    expect(openTasksOf(leadId)).toEqual([]);
    expect(clocksOf(leadId)[0]).toMatchObject({ retriesCreated: 3, attempts: 5, reachedAt: null });

    logContact(viewer, leadId, { channel: "call", outcome: "connected" }, ist("2026-10-23", "11:00"));
    expect(clocksOf(leadId)[0]).toMatchObject({ reachedAt: ist("2026-10-23", "11:00"), attempts: 6 });
    // Reached: nothing is counted or retried any more.
    logContact(viewer, leadId, { channel: "call", outcome: "no_answer" }, ist("2026-10-23", "12:00"));
    expect(clocksOf(leadId)[0].attempts).toBe(6);
    expect(openTasksOf(leadId)).toEqual([]);
  });

  it("counts the executive's call-backs due in the summary (mine.retriesDue) until the task is done", () => {
    const exec = staff("exec.one", "counsellor");
    const viewer = viewerOf(exec.id, "staff");
    const { leadId } = lead();
    const at = T0 + 10 * MINUTE; // 11:40 → "Call again" due 13:40
    logContact(viewer, leadId, { channel: "call", outcome: "no_answer" }, at);
    const [task] = openTasksOf(leadId);
    expect(task).toMatchObject({ title: RETRY_TASK_TITLE, dueAt: ist("2026-10-21", "13:40") });
    expect(slaSummary(viewer, at + HOUR).mine.retriesDue).toBe(0); // not due yet
    expect(slaSummary(viewer, at + 3 * HOUR).mine.retriesDue).toBe(1);
    // Someone else's summary never counts it.
    const other = staff("exec.two", "counsellor");
    expect(slaSummary(viewerOf(other.id, "staff"), at + 3 * HOUR).mine.retriesDue).toBe(0);
    expect(completeTask(viewer, task.id, at + 3 * HOUR).ok).toBe(true);
    expect(slaSummary(viewer, at + 3 * HOUR + MINUTE).mine.retriesDue).toBe(0);
  });

  it("notes 'reached' from a reached outcome or a stage from counselling booked on; retries can be switched off", () => {
    const { viewer: sa } = owner();
    const exec = staff("exec.one", "counsellor");
    const viewer = viewerOf(exec.id, "staff");
    const callBack = lead();
    logContact(viewer, callBack.leadId, { channel: "call", outcome: "call_back_requested" }, T0 + 5 * MINUTE);
    expect(clocksOf(callBack.leadId)[0].reachedAt).toBe(T0 + 5 * MINUTE);

    const staged = lead();
    changeStage(viewer, staged.leadId, "contacted", null, T0 + 5 * MINUTE);
    expect(clocksOf(staged.leadId)[0].reachedAt).toBeNull();
    changeStage(viewer, staged.leadId, "counselling_booked", null, T0 + 15 * MINUTE);
    expect(clocksOf(staged.leadId)[0]).toMatchObject({ reachedAt: T0 + 15 * MINUTE, firstAttemptChannel: "stage" });

    saveRule(sa, { retry: { enabled: false, firstAfterMinutes: 120, maxAttempts: 3 } });
    const quiet = lead({}, T0 + 20 * MINUTE);
    logContact(viewer, quiet.leadId, { channel: "call", outcome: "no_answer" }, T0 + 25 * MINUTE);
    expect(openTasksOf(quiet.leadId)).toEqual([]);
  });
});

describe("who is alerted (§15 tier 1 / tier 2) and the summary per role", () => {
  function areaSetup() {
    const { viewer: sa } = owner();
    const head = staff("head.kangra", "manager");
    const exec = staff("exec.kangra", "counsellor");
    const legacy = staff("exec.legacy", "counsellor");
    for (const person of [head, exec]) expect(setUserAreas(db(), person.id, ["kangra"], { actorId: head.id, now: T0 })).toEqual({ ok: true });
    const kangra = lead({ district: "Palampur" });
    const waiting = lead({ district: "Nurpur" }, T0, { assignNew: false });
    const chamba = lead({ district: "Dalhousie" });
    const solan = lead({ district: "Baddi" });
    const nowhere = lead();
    const queue = lead({}, T0, { assignNew: false });
    return { sa, head, exec, legacy, kangra, waiting, chamba, solan, nowhere, queue };
  }

  it("tier 1 reaches the area's own head, the serving area's head (Chamba → Kangra), else the super admins", () => {
    const w = areaSetup();
    expect([w.kangra.assigneeId, w.chamba.assigneeId]).toEqual([w.exec.id, w.exec.id]);
    expect([w.solan.assigneeId, w.nowhere.assigneeId]).toEqual([w.legacy.id, w.legacy.id]);
    const now = T0 + 2 * HOUR; // past the 12:30 area-head step, before the 15:30 super-admin step

    const head = slaSummary(viewerOf(w.head.id, "staff"), now, { lang: "hi" });
    expect(head.sa).toBeUndefined();
    // Areas in their list order (seed position: Chamba before Kangra), names in the asked language.
    expect(head.area?.areas).toEqual([
      { id: "chamba", name: "चंबा", overdue: 1, unassigned: 0 },
      { id: "kangra", name: "कांगड़ा", overdue: 2, unassigned: 1 },
    ]);
    expect(head.area?.byExecutive).toEqual([{ userId: w.exec.id, name: "Person exec.kangra", overdue: 2, away: false }]);

    const sa = slaSummary(w.sa, now);
    expect(sa.area?.areas).toEqual([
      { id: "solan", name: "Solan", overdue: 1, unassigned: 0 },
      { id: "none", name: "", overdue: 2, unassigned: 0 },
    ]);
    expect(sa.area?.byExecutive).toEqual([{ userId: w.legacy.id, name: "Person exec.legacy", overdue: 2, away: false }]);
    expect(sa.sa).toEqual({ escalated: 0, unassignedNoArea: 1, toolSignups: 0, unmatchedPlaces: 0, meta: null });
    expect(slaSummary(w.sa, T0 + 5 * HOUR).sa?.escalated).toBe(6);
  });

  it("a switched-off (not merged) area's late leads fall to the super admins, not to nobody", () => {
    const w = areaSetup();
    expect(updateArea(w.sa, "kangra", { active: false }, T0 + HOUR)).toMatchObject({ ok: true });
    const now = T0 + 2 * HOUR;
    // Heads only answer for active areas: the Kangra head (and Chamba, served from Kangra) drop out.
    expect(slaSummary(viewerOf(w.head.id, "staff"), now).area).toEqual({ areas: [], byExecutive: [] });
    const sa = slaSummary(w.sa, now).area?.areas ?? [];
    expect(sa).toHaveLength(4);
    expect(sa).toEqual(
      expect.arrayContaining([
        { id: "kangra", name: "Kangra", overdue: 2, unassigned: 1 },
        { id: "chamba", name: "Chamba", overdue: 1, unassigned: 0 },
        { id: "solan", name: "Solan", overdue: 1, unassigned: 0 },
        { id: "none", name: "", overdue: 2, unassigned: 0 },
      ]),
    );
  });

  it("scope SQL matches CORE's inbox (twin of repo/leads.ts scopeClause / areaClause)", () => {
    const w = areaSetup();
    lead({ source: "tool" }, T0, { gate: true }); // a tool sign-up with no area
    const centre = String(db().prepare("SELECT centre_slug FROM crm_area_centres WHERE area_id = 'kangra' ORDER BY centre_slug LIMIT 1").get()?.centre_slug);
    // A no-area lead at a Kangra centre: inside an area head's scope through the centre only.
    db().prepare("UPDATE crm_leads SET centre_slug = ? WHERE id = ?").run(centre, w.nowhere.leadId);
    eraseLead(w.sa, w.solan.leadId, T0 + MINUTE, { reason: "wrong_or_test" });

    const scopes: LeadScope[] = [
      { kind: "all" },
      { kind: "assigned", userId: w.exec.id },
      { kind: "centres", userId: w.legacy.id, centreSlugs: [centre] },
      { kind: "centres", userId: w.legacy.id, centreSlugs: [] },
      { kind: "areas", userId: w.head.id, areaIds: ["kangra", "chamba"], centreSlugs: [centre] },
      { kind: "areas", userId: w.exec.id, areaIds: ["solan"], centreSlugs: [] },
      { kind: "areas", userId: w.head.id, areaIds: [], centreSlugs: [] },
    ];
    const areas: [string | undefined, LeadFilter][] = [
      [undefined, {}],
      ["none", { areaKind: "none" }],
      ["tool_signups", { areaKind: "tool_signups" }],
      ["kangra", { areaIn: ["kangra"] }],
    ];
    const ours = (filter: LeadFilter) => {
      const where: string[] = [];
      const values: SQLInputValue[] = [];
      leadFilterWhere(filter, where, values);
      return db()
        .prepare(`SELECT l.id FROM crm_leads l WHERE ${where.join(" AND ")}`)
        .all(...values)
        .map((row) => String(row.id))
        .sort();
    };
    let compared = 0;
    for (const scope of scopes) {
      for (const [area, filter] of areas) {
        const core = queryLeads(db(), { scope, ...(area ? { area } : {}), limit: 1000, offset: 0 }).rows.map((row) => row.id).sort();
        expect(ours({ scope, ...filter }), `${JSON.stringify(scope)} / ${area ?? "any"}`).toEqual(core);
        if (core.length > 0) compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(10);
  });

  it("each role gets only its part: executive mine; head + area; super admin + sa", () => {
    const w = areaSetup();
    const now = T0 + 20 * MINUTE;
    const exec = slaSummary(viewerOf(w.exec.id, "staff"), now);
    expect(exec).toEqual({
      generatedAt: new Date(now).toISOString(),
      mine: { callNow: 2, overdue: 0, nextDueAt: new Date(ist("2026-10-21", "12:30")).toISOString(), retriesDue: 0 },
    });
    // Before the area-head step nothing is late: the head's digest is only the waiting lead.
    expect(slaSummary(viewerOf(w.head.id, "staff"), now).area).toEqual({ areas: [{ id: "kangra", name: "Kangra", overdue: 0, unassigned: 1 }], byExecutive: [] });

    setAvailability(db(), { userId: w.exec.id, awayUntil: T0 + 24 * HOUR, note: null, actorId: w.head.id, now: T0 });
    const later = slaSummary(viewerOf(w.head.id, "staff"), T0 + 2 * HOUR);
    expect(later.area?.byExecutive[0]).toMatchObject({ userId: w.exec.id, away: true });

    const plainAdmin = user("admin", "plain.admin");
    const plain = slaSummary(viewerOf(plainAdmin.id, "admin"), now);
    expect(plain.area).toBeUndefined();
    expect(plain.sa).toBeUndefined();
  });

  it("lists only the views a role may open (M2), earliest due first, masked", () => {
    const w = areaSetup();
    const now = T0 + 2 * HOUR;
    const exec = viewerOf(w.exec.id, "staff");
    const head = viewerOf(w.head.id, "staff");
    expect(slaQueue(exec, "area", now)).toMatchObject({ ok: false, error: "forbidden" });
    expect(slaQueue(head, "escalated", now)).toMatchObject({ ok: false, error: "forbidden" });
    const mine = slaQueue(exec, "mine", now);
    expect(mine.ok && mine.data.items.map((item) => item.leadId).sort()).toEqual([w.kangra.leadId, w.chamba.leadId].sort());
    expect(mine.ok && mine.data.items[0]).toMatchObject({ phoneLast4: expect.stringMatching(/^\d{4}$/), clock: { state: "overdue" } });
    expect(JSON.stringify(mine)).not.toMatch(/\+91\d{10}/);
    const area = slaQueue(head, "area", now);
    expect(area.ok && area.data.items.map((item) => item.leadId).sort()).toEqual([w.kangra.leadId, w.waiting.leadId, w.chamba.leadId].sort());
    const unassigned = slaQueue(w.sa, "unassigned", now);
    expect(unassigned.ok && unassigned.data.items.map((item) => item.leadId)).toEqual([w.queue.leadId]);
    const escalated = slaQueue(w.sa, "escalated", T0 + 5 * HOUR);
    expect(escalated.ok && escalated.data.total).toBe(6);
  });
});

function phoneOf(leadId: string): string {
  return String(db().prepare("SELECT phone_e164 FROM crm_leads WHERE id = ?").get(leadId)?.phone_e164).slice(3);
}

function clocksAssignee(leadId: string): string {
  return String(db().prepare("SELECT assigned_to FROM crm_leads WHERE id = ?").get(leadId)?.assigned_to);
}
