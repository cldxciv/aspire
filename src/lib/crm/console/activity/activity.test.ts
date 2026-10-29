import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import {
  assignLead,
  captureLead,
  changeStage,
  completeTask,
  createTask,
  logContact,
  resolveCrmViewer,
  writeStaffMembership,
  type CrmRole,
  type CrmViewer,
} from "../../index";
import { callsPerActiveDay, counsellorActivity } from "./activity";

// Counsellor activity (docs/admin-phase-1b-plan.md §5.G, §6.4): the formulas, IST active days,
// scope (managers never count activity on enquiries outside their scope), counsellors see only
// their own row, and contacts logged through AI assistant access are counted with a footnote.

const IST = (5 * 60 + 30) * 60_000;
const istAt = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - IST;
const RANGE = { from: istAt(2026, 10, 19), to: istAt(2026, 10, 22) };

let adminId: string;
let admin: CrmViewer;

function makeUser(role: Role, loginId: string) {
  return insertUser(getDb(), { id: `u-${loginId.replace(/[^a-z]/g, "-")}`, role, loginId, displayName: `Name ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now: istAt(2026, 1, 1) });
}

function makeStaff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []): CrmViewer {
  const user = makeUser("staff", loginId);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, istAt(2026, 1, 1));
  const viewer = resolveCrmViewer({ userId: user.id, role: "staff", displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.data;
}

let phone = 0;
function lead(centreSlug: string): string {
  phone += 1;
  const result = captureLead({ source: "admissions", studentName: "Synthetic Student", phone: `94000${String(phone).padStart(5, "0")}`, centreSlug, consent: { textVersion: "2026-10-20.v2" } }, istAt(2026, 10, 1));
  if (!result.ok) throw new Error("capture failed");
  return result.leadId;
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  phone = 0;
  for (const level of ["info", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  adminId = makeUser("admin", "admin.one").id;
  admin = resolveCrmViewer({ userId: adminId, role: "admin", displayName: "x" } as Session) as CrmViewer;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

/** Counsellor one works Shimla, counsellor two Hamirpur; an AI assistant logs one Hamirpur call. */
function world(options: { mcpAudit?: boolean } = {}) {
  const l1 = lead("shimla");
  const l2 = lead("hamirpur");
  const l3 = lead("shimla");
  const l4 = lead("shimla");
  // Staff after the leads, so nothing is assigned automatically.
  const c1 = makeStaff("couns.one", "counsellor");
  const c2 = makeStaff("couns.two", "counsellor");
  for (const [leadId, person] of [
    [l1, c1],
    [l3, c1],
    [l4, c1],
    [l2, c2],
  ] as const) {
    must(assignLead(admin, leadId, person.userId, istAt(2026, 10, 2)));
  }
  must(changeStage(admin, l4, "enrolled", null, istAt(2026, 10, 10))); // before the range
  // Counsellor one: calls either side of IST midnight (two active days, one UTC day), a busy, a
  // connected call and a WhatsApp on the third day, a follow-up done; one call before the range.
  must(logContact(c1, l1, { channel: "call", outcome: "connected" }, istAt(2026, 10, 18, 22, 0)));
  must(logContact(c1, l1, { channel: "call", outcome: "no_answer" }, istAt(2026, 10, 19, 23, 50)));
  must(logContact(c1, l1, { channel: "call", outcome: "connected" }, istAt(2026, 10, 20, 0, 10)));
  must(logContact(c1, l1, { channel: "call", outcome: "busy" }, istAt(2026, 10, 20, 15, 0)));
  must(logContact(c1, l3, { channel: "call", outcome: "connected" }, istAt(2026, 10, 21, 9, 0)));
  must(logContact(c1, l3, { channel: "whatsapp", outcome: "message_sent" }, istAt(2026, 10, 21, 10, 0)));
  const task = must(createTask(admin, l1, { title: "Follow up", dueAt: istAt(2026, 10, 21, 10, 0) }, istAt(2026, 10, 20, 16, 0)));
  must(completeTask(c1, task.id, istAt(2026, 10, 21, 10, 30)));
  must(changeStage(admin, l3, "enrolled", null, istAt(2026, 10, 21, 11, 0)));
  // Counsellor two: one unanswered call. The AI assistant (MCP, the admin's key) logs one connected call.
  must(logContact(c2, l2, { channel: "call", outcome: "no_answer" }, istAt(2026, 10, 20, 12, 0)));
  const at = istAt(2026, 10, 21, 12, 0);
  must(logContact({ ...admin, superAdmin: false, channel: "mcp" }, l2, { channel: "call", outcome: "connected" }, at));
  if (options.mcpAudit !== false) mcpRows(l2, at);
  return { l1, l2, l3, c1, c2 };
}

/**
 * The audit rows MCP writes for one `log_lead_contact` call by the admin's key: `mcp.call` before
 * dispatch (every call, refused ones too) and, after it ran, the tool row (target = the lead,
 * `outcome` = `changed` when it wrote, else the error code with no target).
 */
function mcpRows(leadId: string | null, at: number, outcome = "changed") {
  recordAudit(getDb(), { actorId: adminId, action: "mcp.call", target: null, details: { tool: "log_lead_contact", via: "mcp", mcpKeyId: "key-1", scopes: "crm:write" }, now: at });
  recordAudit(getDb(), {
    actorId: adminId,
    action: "mcp.log_lead_contact",
    target: outcome === "changed" ? leadId : null,
    details: { ...(outcome === "changed" ? { channel: "call", contactOutcome: "connected" } : {}), via: "mcp", mcpKeyId: "key-1", outcome },
    now: at,
  });
}

describe("counsellor activity (§6.4)", () => {
  it("counts calls, connected, WhatsApps, follow-ups, IST active days, open enquiries and admissions", () => {
    const { c1, c2 } = world();
    const report = counsellorActivity(admin, RANGE);
    expect(report).toMatchObject({ own: false, scoped: false, mcpIncluded: true, from: new Date(RANGE.from).toISOString(), to: new Date(RANGE.to).toISOString() });
    const one = report.rows.find((row) => row.userId === c1.userId);
    expect(one).toEqual({
      userId: c1.userId,
      name: "Name couns.one",
      calls: 4,
      connected: 2,
      whatsapps: 1,
      followUps: 1,
      activeDays: 3, // 19 Oct 23:50 and 20 Oct 00:10 IST are two days
      callsPerActiveDay: 1.3,
      openLeads: 1, // l1 (l3 and l4 were admitted)
      admissions: 1, // l3 in the range; l4 before it
      self: false,
    });
    expect(report.rows.find((row) => row.userId === c2.userId)).toMatchObject({ calls: 1, connected: 0, activeDays: 1, openLeads: 1, admissions: 0 });
    // The AI assistant's call is counted under the admin whose key logged it.
    expect(report.rows.find((row) => row.userId === adminId)).toMatchObject({ calls: 1, connected: 1, self: true, name: "Name admin.one" });
    expect(report.rows[0].userId).toBe(c1.userId); // most calls first
  });

  it("shows the footnote only when an AI assistant logged a counted contact", () => {
    const { l1, l2 } = world({ mcpAudit: false });
    expect(counsellorActivity(admin, RANGE).mcpIncluded).toBe(false);
    // A refused call (its `mcp.call` row and a tool row with the error, no lead) logged nothing.
    mcpRows(null, istAt(2026, 10, 21, 12, 30), "forbidden");
    expect(counsellorActivity(admin, RANGE).mcpIncluded).toBe(false);
    // Outside the dates: not counted either.
    mcpRows(l2, istAt(2026, 10, 22, 9, 0));
    expect(counsellorActivity(admin, RANGE).mcpIncluded).toBe(false);

    // The AI assistant logs a Hamirpur call: the footnote for the admin and the Hamirpur head.
    mcpRows(l2, istAt(2026, 10, 21, 12, 0));
    expect(counsellorActivity(admin, RANGE).mcpIncluded).toBe(true);
    expect(counsellorActivity(makeStaff("head.hamirpur", "manager", ["hamirpur"]), RANGE).mcpIncluded).toBe(true);
    // A Shimla head counts the admin's Shimla call, but the AI assistant's call was not on their enquiries.
    must(logContact(admin, l1, { channel: "call", outcome: "busy" }, istAt(2026, 10, 21, 13, 0)));
    const shimla = counsellorActivity(makeStaff("head.shimla", "manager", ["shimla"]), RANGE);
    expect(shimla.rows.find((row) => row.userId === adminId)).toMatchObject({ calls: 1, connected: 0 });
    expect(shimla.mcpIncluded).toBe(false);
  });

  it("area heads list their areas' active members only, like admins (disabled or inactive members are left out)", () => {
    const db = getDb();
    const at = istAt(2026, 1, 1);
    db.prepare("INSERT INTO crm_areas (id, name_en, name_hi, default_centre_slug, created_at, updated_at) VALUES ('north-zone', 'North', 'उत्तर', NULL, ?, ?)").run(at, at);
    const head = makeStaff("head.north", "manager");
    const member = makeStaff("couns.north", "counsellor");
    const disabled = makeStaff("couns.gone", "counsellor");
    const inactive = makeStaff("couns.paused", "counsellor");
    for (const person of [head, member, disabled, inactive]) {
      db.prepare("INSERT INTO crm_area_members (area_id, user_id, created_at) VALUES ('north-zone', ?, ?)").run(person.userId, at);
    }
    db.prepare("INSERT INTO crm_staff_scope (user_id, mode, set_at) VALUES (?, 'areas', ?)").run(head.userId, at);
    db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(disabled.userId);
    writeStaffMembership(db, adminId, inactive.userId, { crmRole: "counsellor", centreSlugs: [], active: false }, at);

    const north = resolveCrmViewer({ userId: head.userId, role: "staff", displayName: "x" } as Session);
    if (!north?.areaScope) throw new Error("expected an area head");
    expect(counsellorActivity(north, RANGE).rows.map((row) => row.userId).sort()).toEqual([head.userId, member.userId].sort());
    // Admins leave the same two out.
    const everyone = counsellorActivity(admin, RANGE).rows.map((row) => row.userId);
    expect(everyone).toContain(member.userId);
    expect(everyone).not.toContain(disabled.userId);
    expect(everyone).not.toContain(inactive.userId);
  });

  it("managers count only activity on enquiries in their scope", () => {
    const { c1, c2 } = world();
    const head = makeStaff("head.hamirpur", "manager", ["hamirpur"]);
    const report = counsellorActivity(head, RANGE);
    expect(report.scoped).toBe(true);
    expect(report.rows.some((row) => row.userId === c1.userId)).toBe(false);
    expect(report.rows.find((row) => row.userId === c2.userId)).toMatchObject({ calls: 1, openLeads: 1 });
    expect(report.rows.find((row) => row.userId === head.userId)).toMatchObject({ self: true, calls: 0 });
    expect(report.rows.find((row) => row.userId === adminId)).toMatchObject({ calls: 1 });
  });

  it("counsellors see only their own row ('Your numbers')", () => {
    const { c1 } = world();
    const report = counsellorActivity(c1, RANGE);
    expect(report.own).toBe(true);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ userId: c1.userId, self: true, calls: 4, whatsapps: 1, followUps: 1 });
    // A counsellor with nothing logged still gets their row, all zeros.
    const quiet = makeStaff("couns.three", "counsellor");
    expect(counsellorActivity(quiet, RANGE).rows).toEqual([
      expect.objectContaining({ userId: quiet.userId, calls: 0, connected: 0, activeDays: 0, callsPerActiveDay: null, openLeads: 0, admissions: 0 }),
    ]);
  });

  it("calls per active day: one decimal, blank without an active day", () => {
    expect(callsPerActiveDay(0, 0)).toBeNull();
    expect(callsPerActiveDay(5, 0)).toBeNull();
    expect(callsPerActiveDay(4, 3)).toBe(1.3);
    expect(callsPerActiveDay(10, 4)).toBe(2.5);
  });
});
