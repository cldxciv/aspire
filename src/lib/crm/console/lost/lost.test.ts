import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import {
  assignLead,
  captureLead,
  changeStage,
  eraseLead,
  logContact,
  resolveCrmViewer,
  writeStaffMembership,
  type CaptureLeadInput,
  type CrmRole,
  type CrmViewer,
  type LostReason,
} from "../../index";
import { fail, leadScopeFor } from "../../access";
import { countUnreviewedLostEvents } from "../../repo/console-family";
import { scopedLeadWhere } from "../../repo/leads";
import { lostReview, lostReviewDays, lostReviewStaff, reviewLost, REOPEN_TASK_TITLE } from "./lost";
import { lostReviewInputSchema } from "./schemas";

// 1B-FAMILY (docs/admin-phase-1b-plan.md §5.H, §6.5): lost review on a fresh in-memory database.
// Synthetic people and numbers only.

const DAY = 86_400_000;
/** Wednesday 21 Oct 2026, 11:30 IST. */
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const ist = (day: string, time: string) => Date.parse(`${day}T${time}:00.000+05:30`);

let admin: CrmViewer;
let adminId: string;

function makeUser(role: Role, loginId: string) {
  return insertUser(getDb(), { role, loginId, displayName: `Name ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW - 60 * DAY });
}

function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function staff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []): CrmViewer {
  const user = makeUser("staff", loginId);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, NOW - 60 * DAY);
  return viewerOf(user.id, "staff");
}

let phoneCounter = 0;
function capture(at: number, overrides: Partial<CaptureLeadInput> = {}) {
  phoneCounter += 1;
  const result = captureLead(
    { source: "admissions", studentName: `Synthetic Student ${phoneCounter}`, phone: `96400${String(phoneCounter).padStart(5, "0")}`, consent: { textVersion: "test-v1" }, ...overrides },
    at,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result.leadId;
}

function lose(viewer: CrmViewer, leadId: string, reason: LostReason, at: number) {
  expect(changeStage(viewer, leadId, "lost", reason, at).ok).toBe(true);
}

const report = (viewer: CrmViewer, options: Parameters<typeof lostReview>[1] = {}) => {
  const result = lostReview(viewer, options, NOW);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
const stageOf = (leadId: string) => getDb().prepare("SELECT stage, lost_reason, assigned_to FROM crm_leads WHERE id = ?").get(leadId);
const openTasks = (leadId: string) =>
  getDb()
    .prepare("SELECT title, due_at, assignee_id FROM crm_tasks WHERE lead_id = ? AND done_at IS NULL")
    .all(leadId)
    .map((row) => ({ title: String(row.title), dueAt: Number(row.due_at), assigneeId: row.assignee_id === null ? null : String(row.assignee_id) }));
const reviews = () => getDb().prepare("SELECT lead_id, lost_at, decision FROM crm_lost_reviews ORDER BY reviewed_at, lead_id").all();

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

describe("the review list (§6.5)", () => {
  it("lists unreviewed lost events of the window on live, still-lost leads; a lead lost twice gives two events", () => {
    const exec = staff("exec.one", "counsellor");
    const old = capture(NOW - 30 * DAY);
    lose(admin, old, "fees", NOW - 20 * DAY);
    const called = capture(NOW - 10 * DAY);
    expect(assignLead(admin, called, exec.userId, NOW - 10 * DAY).ok).toBe(true);
    expect(logContact(exec, called, { channel: "call", outcome: "no_answer" }, NOW - 3 * DAY).ok).toBe(true);
    expect(logContact(exec, called, { channel: "whatsapp", outcome: "message_sent" }, NOW - 3 * DAY + 60_000).ok).toBe(true);
    expect(logContact(exec, called, { channel: "call", outcome: "busy" }, NOW - 2 * DAY - 60_000).ok).toBe(true);
    lose(exec, called, "not_reachable", NOW - 2 * DAY);
    // A call logged after the lost change is not counted for that event.
    expect(logContact(admin, called, { channel: "call", outcome: "connected" }, NOW - DAY).ok).toBe(true);
    const twice = capture(NOW - 9 * DAY);
    expect(assignLead(admin, twice, null, NOW - 9 * DAY).ok).toBe(true); // (auto-assignment gave it to the counsellor)
    lose(admin, twice, "fees", NOW - 5 * DAY);
    expect(changeStage(admin, twice, "contacted", null, NOW - 4 * DAY).ok).toBe(true);
    lose(admin, twice, "not_interested", NOW - DAY);
    const reopened = capture(NOW - 9 * DAY);
    lose(admin, reopened, "timing_or_batch", NOW - 3 * DAY);
    expect(changeStage(admin, reopened, "counselling_booked", null, NOW - 2 * DAY).ok).toBe(true);
    const erased = capture(NOW - 9 * DAY);
    lose(admin, erased, "other", NOW - 3 * DAY);
    expect(eraseLead(admin, erased, NOW - 2 * DAY).ok).toBe(true);

    const data = report(admin);
    expect(data.days).toBe(14);
    expect(data.items.map((item) => [item.leadId, item.reason])).toEqual([
      [twice, "not_interested"],
      [called, "not_reachable"],
      [twice, "fees"],
    ]);
    expect(data.items[1]).toMatchObject({
      name: expect.stringContaining("Synthetic Student"),
      lostAt: new Date(NOW - 2 * DAY).toISOString(),
      fromStage: "new",
      markedBy: { userId: exec.userId, name: "Name exec.one" },
      callsMade: 2,
      lastOutcome: "busy",
      daysSinceEnquiry: 8,
      assignee: { userId: exec.userId, displayName: "Name exec.one" },
    });
    expect(data.items[0]).toMatchObject({ fromStage: "contacted", callsMade: 0, lastOutcome: null, markedBy: { userId: adminId } });
    // The Needs attention count over the same definition equals the list (a reason edit is no new event).
    expect(changeStage(admin, twice, "lost", "fees", NOW - DAY + 1000).ok).toBe(true);
    expect(report(admin).items).toHaveLength(3);
    expect(countUnreviewedLostEvents(getDb(), scopedLeadWhere(leadScopeFor(admin)), { since: NOW - 14 * DAY, until: NOW })).toBe(3);
    // 30 days: the older one too.
    expect(report(admin, { days: 30 }).items.map((item) => item.leadId)).toContain(old);
    // The counsellor filter narrows to the leads that person holds now.
    expect(report(admin, { assignee: exec.userId }).items.map((item) => item.leadId)).toEqual([called]);
    expect(report(admin, { assignee: "unassigned" }).items.map((item) => item.leadId)).toEqual([twice, twice]);
  });

  it("counts lost reasons by who marked them, reviewed or reopened, but not erased leads", () => {
    const exec = staff("exec.one", "counsellor");
    const a = capture(NOW - 9 * DAY);
    expect(assignLead(admin, a, exec.userId, NOW - 9 * DAY).ok).toBe(true);
    lose(exec, a, "fees", NOW - 3 * DAY);
    const b = capture(NOW - 9 * DAY);
    lose(admin, b, "fees", NOW - 3 * DAY);
    expect(changeStage(admin, b, "contacted", null, NOW - 2 * DAY).ok).toBe(true);
    lose(admin, b, "not_interested", NOW - DAY);
    expect(changeStage(admin, b, "lost", "joined_other_institute", NOW - DAY + 1000).ok).toBe(true); // a reason edit, not a new event
    const c = capture(NOW - 9 * DAY);
    lose(admin, c, "other", NOW - 3 * DAY);
    expect(eraseLead(admin, c, NOW - 2 * DAY).ok).toBe(true);
    const { matrix } = report(admin);
    expect(matrix.total).toBe(3);
    expect(matrix.reasons).toEqual(["not_interested", "fees"]);
    expect(matrix.rows).toEqual([
      { userId: adminId, name: "Name admin.one", counts: { fees: 1, not_interested: 1 }, total: 2 },
      { userId: exec.userId, name: "Name exec.one", counts: { fees: 1 }, total: 1 },
    ]);
  });

  it("is for area heads (their scope) and admins only", () => {
    const exec = staff("exec.one", "counsellor");
    const head = staff("head.one", "manager", ["shimla"]);
    const shimla = capture(NOW - 5 * DAY, { centreSlug: "shimla" });
    const kullu = capture(NOW - 5 * DAY, { centreSlug: "kullu" });
    lose(admin, shimla, "fees", NOW - DAY);
    lose(admin, kullu, "fees", NOW - DAY);
    expect(lostReview(exec, {}, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect(reviewLost(exec, shimla, { lostAt: new Date(NOW - DAY).toISOString(), decision: "kept" }, NOW)).toMatchObject({ ok: false, error: "forbidden" });
    expect(report(head).items.map((item) => item.leadId)).toEqual([shimla]);
    expect(report(head).matrix.total).toBe(1);
    expect(report(admin).items).toHaveLength(2);
    expect(reviewLost(head, kullu, { lostAt: new Date(NOW - DAY).toISOString(), decision: "kept" }, NOW)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("offers on Reopen only the people lead routing lets this viewer hand the enquiry to; the filter keeps to their scope", () => {
    const head = staff("head.one", "manager", ["shimla"]);
    const shimlaExec = staff("exec.shimla", "counsellor", ["shimla"]);
    const kulluExec = staff("exec.kullu", "counsellor", ["kullu"]);
    const anyExec = staff("exec.any", "counsellor");
    const shimla = capture(NOW - 5 * DAY, { centreSlug: "shimla" });
    const kullu = capture(NOW - 5 * DAY, { centreSlug: "kullu" });
    lose(admin, shimla, "fees", NOW - DAY);
    lose(admin, kullu, "fees", NOW - DAY);
    const sorted = (ids: readonly string[] | null | undefined) => [...(ids ?? [])].sort();

    const scoped = lostReviewStaff(head, report(head).items.map((item) => item.leadId));
    if (!scoped.ok) throw new Error(scoped.error);
    expect(Object.keys(scoped.data.byLead)).toEqual([shimla]);
    expect(sorted(scoped.data.byLead[shimla])).toEqual(sorted([head.userId, shimlaExec.userId, anyExec.userId]));
    expect(sorted(scoped.data.filter)).toEqual(sorted([head.userId, shimlaExec.userId, anyExec.userId]));
    // Every person offered is one the server accepts; the one left out is refused.
    expect(reviewLost(head, shimla, { lostAt: new Date(NOW - DAY).toISOString(), decision: "reopened", assigneeId: kulluExec.userId }, NOW)).toMatchObject({
      ok: false,
      error: "validation",
    });
    expect(reviewLost(head, shimla, { lostAt: new Date(NOW - DAY).toISOString(), decision: "reopened", assigneeId: anyExec.userId }, NOW).ok).toBe(true);

    const all = lostReviewStaff(admin, [shimla, kullu]);
    if (!all.ok) throw new Error(all.error);
    const everyone = sorted([head.userId, shimlaExec.userId, kulluExec.userId, anyExec.userId]);
    expect(sorted(all.data.byLead[kullu])).toEqual(everyone);
    expect(all.data.filter).toBeNull();
    expect(lostReviewStaff(shimlaExec, [shimla])).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("reads the window from untrusted values (7, 14 or 30; else 14)", () => {
    expect([lostReviewDays("7"), lostReviewDays("30"), lostReviewDays(14), lostReviewDays("15"), lostReviewDays(null), lostReviewDays("x")]).toEqual([7, 30, 14, 14, 14, 14]);
  });
});

describe("keep lost and reopen", () => {
  it("keeps one event lost, once; audited with the decision only", () => {
    const lead = capture(NOW - 5 * DAY);
    lose(admin, lead, "fees", NOW - DAY);
    const lostAt = new Date(NOW - DAY).toISOString();
    expect(reviewLost(admin, lead, { lostAt, decision: "kept" }, NOW)).toEqual({ ok: true, data: { leadId: lead, lostAt, decision: "kept", stage: "lost", taskId: null } });
    expect(report(admin).items).toEqual([]);
    expect(reviewLost(admin, lead, { lostAt, decision: "kept" }, NOW)).toMatchObject({ ok: false, error: "conflict" });
    expect(reviewLost(admin, lead, { lostAt: new Date(NOW - 2 * DAY).toISOString(), decision: "kept" }, NOW)).toMatchObject({ ok: false, error: "not_found" });
    const audit = listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.lost_review");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ target: lead, details: { decision: "kept" } });
    expect(stageOf(lead)).toMatchObject({ stage: "lost", lost_reason: "fees" });
  });

  it("reopens to the stage it left, hands it on and adds a follow-up for tomorrow, in one step", () => {
    const one = staff("exec.one", "counsellor");
    const two = staff("exec.two", "counsellor");
    const lead = capture(NOW - 9 * DAY);
    expect(assignLead(admin, lead, one.userId, NOW - 9 * DAY).ok).toBe(true);
    expect(changeStage(admin, lead, "visited_or_demo", null, NOW - 5 * DAY).ok).toBe(true);
    lose(admin, lead, "fees", NOW - DAY);
    const lostAt = new Date(NOW - DAY).toISOString();
    const result = reviewLost(admin, lead, { lostAt, decision: "reopened", assigneeId: two.userId }, NOW);
    expect(result).toMatchObject({ ok: true, data: { decision: "reopened", stage: "visited_or_demo", taskId: expect.any(String) } });
    expect(stageOf(lead)).toEqual({ stage: "visited_or_demo", lost_reason: null, assigned_to: two.userId });
    expect(openTasks(lead)).toEqual([{ title: REOPEN_TASK_TITLE, dueAt: ist("2026-10-22", "10:00"), assigneeId: two.userId }]);
    expect(reviews()).toEqual([{ lead_id: lead, lost_at: NOW - DAY, decision: "reopened" }]);
    expect(report(admin).items).toEqual([]);
    expect(listAudit(getDb(), { limit: 50 }).find((entry) => entry.action === "crm.lost_review")).toMatchObject({ details: { decision: "reopened" } });
    // Once reopened, the event cannot be reviewed again.
    expect(reviewLost(admin, lead, { lostAt, decision: "kept" }, NOW)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("rolls every step back when one fails; refuses a follow-up outside 08:00–21:00 IST", () => {
    const one = staff("exec.one", "counsellor");
    const two = staff("exec.two", "counsellor");
    const lead = capture(NOW - 9 * DAY);
    expect(assignLead(admin, lead, one.userId, NOW - 9 * DAY).ok).toBe(true);
    lose(admin, lead, "fees", NOW - DAY);
    const lostAt = new Date(NOW - DAY).toISOString();
    const failing = reviewLost(admin, lead, { lostAt, decision: "reopened", reopenTo: "contacted", assigneeId: two.userId }, NOW, {
      changeStage,
      assignLead,
      createTask: () => fail("validation", "Task store unavailable."),
    });
    expect(failing).toMatchObject({ ok: false, error: "validation" });
    expect(stageOf(lead)).toEqual({ stage: "lost", lost_reason: "fees", assigned_to: one.userId });
    expect(openTasks(lead)).toEqual([]);
    expect(reviews()).toEqual([]);
    expect(listAudit(getDb(), { limit: 50 }).some((entry) => entry.action === "crm.lost_review")).toBe(false);

    const late = reviewLost(admin, lead, { lostAt, decision: "reopened", followUp: { kind: "at", at: new Date(ist("2026-10-22", "21:30")).toISOString() } }, NOW);
    expect(late).toMatchObject({ ok: false, error: "validation", fieldErrors: { followUp: ["No calls before 8 am or after 9 pm."] } });
    const past = reviewLost(admin, lead, { lostAt, decision: "reopened", followUp: { kind: "at", at: new Date(ist("2026-10-20", "10:00")).toISOString() } }, NOW);
    expect(past).toMatchObject({ ok: false, fieldErrors: { followUp: ["Choose a time from now on."] } });
    expect(stageOf(lead)).toMatchObject({ stage: "lost" });

    const picked = reviewLost(admin, lead, { lostAt, decision: "reopened", reopenTo: "new", followUp: { kind: "at", at: new Date(ist("2026-10-23", "16:00")).toISOString() } }, NOW);
    expect(picked).toMatchObject({ ok: true, data: { stage: "new" } });
    expect(openTasks(lead)).toEqual([{ title: REOPEN_TASK_TITLE, dueAt: ist("2026-10-23", "16:00"), assigneeId: one.userId }]);
  });

  it("refuses an erased lead, a lead no longer lost, and Enrolled as a reopen stage", () => {
    const lead = capture(NOW - 9 * DAY);
    lose(admin, lead, "fees", NOW - DAY);
    const lostAt = new Date(NOW - DAY).toISOString();
    expect(changeStage(admin, lead, "contacted", null, NOW - 1000).ok).toBe(true);
    expect(reviewLost(admin, lead, { lostAt, decision: "kept" }, NOW)).toMatchObject({ ok: false, error: "conflict" });
    lose(admin, lead, "fees", NOW - 500);
    expect(eraseLead(admin, lead, NOW - 100).ok).toBe(true);
    expect(reviewLost(admin, lead, { lostAt: new Date(NOW - 500).toISOString(), decision: "kept" }, NOW)).toMatchObject({ ok: false, error: "conflict" });
    expect(lostReviewInputSchema.safeParse({ lostAt, decision: "reopened", reopenTo: "enrolled" }).success).toBe(false);
    expect(lostReviewInputSchema.safeParse({ lostAt, decision: "reopened", reopenTo: "lost" }).success).toBe(false);
    expect(lostReviewInputSchema.safeParse({ lostAt, decision: "maybe" }).success).toBe(false);
    expect(lostReviewInputSchema.safeParse({ lostAt, decision: "kept", note: "x" }).success).toBe(false);
    expect(lostReviewInputSchema.safeParse({ lostAt, decision: "reopened", followUp: { kind: "preset", preset: "next_week" } }).success).toBe(false);
  });
});
