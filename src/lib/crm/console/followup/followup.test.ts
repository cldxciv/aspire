import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { getCentres } from "@/lib/data";

import { DEFAULT_CALLING_HOURS, DEFAULT_SPEED_RULE, type CallingHours } from "../../lead-ops-types";
import { assignLead, changeStage, logContact } from "../../leads";
import { fail } from "../../access";
import { RETRY_TASK_TITLE } from "../../sla/followups";
import { clocksOf, ist, lead, openTasksOf, staff, T0, user, viewerOf } from "../../sla/test-kit";
import { completeTask, createTask } from "../../tasks";
import { listTemplates, setTemplateStatus } from "../templates/templates";
import type { OutcomeInput, RhythmRuleKey } from "../types";
import { attemptSummary, offerNotReachable, streakAfter } from "./attempts";
import { followUpContext } from "./context";
import { defaultTaskTitle, FOLLOW_UP_TITLES, recordOutcome, type OutcomeServices } from "./outcome";
import {
  callingHoursLabel,
  clampToHardWindow,
  followUpOnDay,
  isInsideHardWindow,
  outsideCallingHours,
  preferredTimeIn,
  resolvePresets,
} from "./presets";
import { suggestFollowUp, suggestionToNext, type RhythmSuggestion } from "./rhythm";
import type { RhythmFacts } from "./types";

// 1B-CALLS (docs/admin-phase-1b-plan.md §5.C): presets, rhythm, attempts (pure) and the one-step
// outcome against a fresh in-memory database with lead routing's REAL SLA module.

const HOURS = DEFAULT_CALLING_HOURS; // Mon–Sat 09:00–19:00, Sun 10:00–13:00 IST
const NO_FACTS: RhythmFacts = { firstConnectedAt: null, visitedAt: null, contactsSinceVisit: 0, preferredTime: null };
const at = (day: string, time: string) => ist(day, time);

describe("presets (§5.C)", () => {
  it("later today = now + LR's retry wait in WORKING minutes; 18:30 carries over to the next morning", () => {
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, at("2026-10-21", "11:30"), null).later_today).toBe(at("2026-10-21", "13:30"));
    // Wed 18:30: 30 working minutes left today, 90 more from Thu 09:00.
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, at("2026-10-21", "18:30"), null).later_today).toBe(at("2026-10-22", "10:30"));
    // The rule's own wait is used (not a second rule).
    const rule = { ...DEFAULT_SPEED_RULE, retry: { ...DEFAULT_SPEED_RULE.retry, firstAfterMinutes: 30 } };
    expect(resolvePresets(HOURS, rule, at("2026-10-21", "11:30"), null).later_today).toBe(at("2026-10-21", "12:00"));
  });

  it("tomorrow / in 3 days: the first open day at the family's preferred window", () => {
    const wed = at("2026-10-21", "18:30");
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, wed, null).tomorrow).toBe(at("2026-10-22", "10:00")); // opening + 60 min
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, wed, "any").tomorrow).toBe(at("2026-10-22", "10:00"));
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, wed, "morning").tomorrow).toBe(at("2026-10-22", "09:00"));
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, wed, "afternoon").tomorrow).toBe(at("2026-10-22", "13:00"));
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, wed, "evening").tomorrow).toBe(at("2026-10-22", "16:30"));
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, wed, null).in_3_days).toBe(at("2026-10-24", "10:00")); // Sat
  });

  it("Sunday's short hours: never later than 30 minutes before closing", () => {
    const sat = at("2026-10-24", "12:00");
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, sat, null).tomorrow).toBe(at("2026-10-25", "11:00"));
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, sat, "evening").tomorrow).toBe(at("2026-10-25", "12:30"));
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, sat, "afternoon").tomorrow).toBe(at("2026-10-25", "12:30"));
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, sat, "morning").tomorrow).toBe(at("2026-10-25", "10:00"));
    // Saturday 18:30 + 2 working hours: 30 min Sat, 90 min Sun (10:00–11:30).
    expect(resolvePresets(HOURS, DEFAULT_SPEED_RULE, at("2026-10-24", "18:30"), null).later_today).toBe(at("2026-10-25", "11:30"));
  });

  it("skips closed dates and closed weekdays", () => {
    const closed: CallingHours = { ...HOURS, closedDates: ["2026-10-22", "2026-10-24"] };
    const wed = at("2026-10-21", "12:00");
    expect(resolvePresets(closed, DEFAULT_SPEED_RULE, wed, null).tomorrow).toBe(at("2026-10-23", "10:00"));
    expect(resolvePresets(closed, DEFAULT_SPEED_RULE, wed, null).in_3_days).toBe(at("2026-10-25", "11:00")); // Sun
    const noSunday: CallingHours = { ...HOURS, week: { ...HOURS.week, sun: { open: false, start: "10:00", end: "13:00" } } };
    expect(resolvePresets(noSunday, DEFAULT_SPEED_RULE, at("2026-10-24", "12:00"), null).tomorrow).toBe(at("2026-10-26", "10:00"));
  });

  it("08:00–21:00 IST is the outer limit: presets move inside it, a picked time outside it is refused", () => {
    expect(isInsideHardWindow(at("2026-10-21", "08:00"))).toBe(true);
    expect(isInsideHardWindow(at("2026-10-21", "21:00"))).toBe(true);
    expect(isInsideHardWindow(at("2026-10-21", "21:30"))).toBe(false);
    expect(isInsideHardWindow(at("2026-10-21", "07:59"))).toBe(false);
    expect(clampToHardWindow(at("2026-10-21", "07:00"))).toBe(at("2026-10-21", "08:00"));
    expect(clampToHardWindow(at("2026-10-21", "21:30"))).toBe(at("2026-10-22", "08:00"));
    // Calling hours that run late never push a preset past 21:00.
    const late: CallingHours = { ...HOURS, week: { ...HOURS.week, wed: { open: true, start: "06:00", end: "23:30" } } };
    const preset = resolvePresets(late, DEFAULT_SPEED_RULE, at("2026-10-21", "20:30"), null).later_today;
    expect(isInsideHardWindow(preset)).toBe(true);
    expect(preferredTimeIn({ start: at("2026-10-21", "09:00"), end: at("2026-10-21", "09:20") }, "evening")).toBe(at("2026-10-21", "09:00"));
  });

  it("outside calling hours is only a warning; the label shows the day's window", () => {
    expect(outsideCallingHours(HOURS, at("2026-10-21", "20:00"))).toBe(true);
    expect(outsideCallingHours(HOURS, at("2026-10-21", "12:00"))).toBe(false);
    expect(callingHoursLabel(HOURS, at("2026-10-21", "12:00"))).toBe("09:00–19:00");
    expect(callingHoursLabel(HOURS, at("2026-10-25", "08:00"))).toBe("10:00–13:00");
  });
});

describe("rhythm (§5.C table, decision 9)", () => {
  const now = at("2026-10-21", "11:30"); // Wednesday
  const suggest = (outcome: Parameters<typeof suggestFollowUp>[0]["outcome"], stage: Parameters<typeof suggestFollowUp>[0]["stage"], facts: Partial<RhythmFacts> = {}, when = now) =>
    suggestFollowUp({ outcome, stage, now: when, hours: HOURS, facts: { ...NO_FACTS, ...facts } });
  const row = (s: RhythmSuggestion): [string, number | null, RhythmRuleKey] => [s.choice, s.at, s.ruleKey];

  it("no answer / busy → later today (retry); switched off → tomorrow; call back → pick; wrong number → none", () => {
    expect(row(suggest("no_answer", "new"))).toEqual(["later_today", null, "retry"]);
    expect(row(suggest("busy", "contacted"))).toEqual(["later_today", null, "retry"]);
    expect(row(suggest("switched_off", "new"))).toEqual(["tomorrow", null, "switched_off"]);
    expect(row(suggest("call_back_requested", "contacted"))).toEqual(["pick", null, "call_back"]);
    expect(row(suggest("wrong_number", "new"))).toEqual(["none", null, "wrong_number"]);
  });

  it("connected while contacted (or new → contacted): day 2, 5, 10 after the first connected call, then every 3 days", () => {
    expect(row(suggest("connected", "new"))).toEqual(["pick", at("2026-10-23", "10:00"), "contacted_d2"]);
    const first = at("2026-10-21", "11:00");
    expect(row(suggest("connected", "contacted", { firstConnectedAt: first }))).toEqual(["pick", at("2026-10-23", "10:00"), "contacted_d2"]);
    expect(row(suggest("connected", "contacted", { firstConnectedAt: first }, at("2026-10-23", "12:00")))).toEqual(["pick", at("2026-10-26", "10:00"), "contacted_d5"]);
    expect(row(suggest("connected", "contacted", { firstConnectedAt: first, preferredTime: "evening" }, at("2026-10-26", "12:00")))).toEqual([
      "pick",
      at("2026-10-31", "16:30"),
      "contacted_d10",
    ]);
    expect(row(suggest("connected", "contacted", { firstConnectedAt: first }, at("2026-10-31", "12:00")))).toEqual(["in_3_days", null, "contacted_later"]);
    // Day 2 on a Sunday: Sunday's short window.
    expect(row(suggest("connected", "contacted", { firstConnectedAt: at("2026-10-23", "11:00") }, at("2026-10-23", "11:05")))).toEqual(["pick", at("2026-10-25", "11:00"), "contacted_d2"]);
  });

  it("booked → tomorrow; after a visit → tomorrow, then in 3 days; applied / test / offer → tomorrow; closed → none", () => {
    expect(row(suggest("connected", "counselling_booked"))).toEqual(["tomorrow", null, "booked"]);
    expect(row(suggest("connected", "visited_or_demo", { visitedAt: now - 3_600_000, contactsSinceVisit: 0 }))).toEqual(["tomorrow", null, "after_visit_d1"]);
    expect(row(suggest("connected", "visited_or_demo", { visitedAt: now - 86_400_000, contactsSinceVisit: 1 }))).toEqual(["in_3_days", null, "after_visit_d3"]);
    for (const stage of ["applied", "test_taken", "offer"] as const) expect(row(suggest("connected", stage))).toEqual(["tomorrow", null, "after_test"]);
    expect(row(suggest("connected", "enrolled"))).toEqual(["none", null, "closed"]);
    expect(row(suggest("no_answer", "lost"))).toEqual(["none", null, "closed"]);
  });

  it("no call needed follows the stage; WhatsApp 'message sent' follows the connected rows", () => {
    expect(row(suggest(null, "new"))).toEqual(["later_today", null, "retry"]);
    expect(row(suggest(null, "counselling_booked"))).toEqual(["tomorrow", null, "booked"]);
    expect(row(suggest("message_sent", "offer"))).toEqual(["tomorrow", null, "after_test"]);
  });

  it("maps a suggestion onto NextFollowUp (call back: the staff member picks)", () => {
    expect(suggestionToNext(suggest("no_answer", "new"))).toEqual({ kind: "preset", preset: "later_today" });
    expect(suggestionToNext(suggest("wrong_number", "new"))).toEqual({ kind: "none", reason: "wrong_number" });
    expect(suggestionToNext(suggest("connected", "lost"))).toEqual({ kind: "none", reason: "closing" });
    expect(suggestionToNext(suggest("call_back_requested", "new"))).toBeNull();
    expect(suggestionToNext(suggest("connected", "new"))).toEqual({ kind: "at", at: new Date(at("2026-10-23", "10:00")).toISOString() });
    expect(followUpOnDay(HOURS, Math.floor((at("2026-10-23", "00:00") + 19_800_000) / 86_400_000), null)).toBe(at("2026-10-23", "10:00"));
  });
});

describe("attempts (§5.C, decision 10)", () => {
  const call = (outcome: string) => ({ type: "call" as const, outcome });
  it("counts calls and the unanswered streak, newest first; an answered call or a WhatsApp resets it", () => {
    expect(attemptSummary([])).toEqual({ calls: 0, unansweredStreak: 0, suggestNotReachable: false });
    expect(attemptSummary([call("no_answer"), call("busy"), call("switched_off"), call("connected"), call("no_answer")])).toEqual({
      calls: 5,
      unansweredStreak: 3,
      suggestNotReachable: false,
    });
    expect(attemptSummary([call("no_answer"), { type: "whatsapp", outcome: "message_sent" }, call("no_answer")]).unansweredStreak).toBe(1);
    expect(attemptSummary([call("no_answer"), call("call_back_requested"), call("no_answer")]).unansweredStreak).toBe(1);
    expect(attemptSummary(Array.from({ length: 5 }, () => call("no_answer")))).toEqual({ calls: 5, unansweredStreak: 5, suggestNotReachable: true });
  });

  it("offers 'not reachable' when streak + this unanswered call reaches 5, never right after the family was reached", () => {
    expect(streakAfter({ unansweredStreak: 4 }, "no_answer")).toBe(5);
    expect(streakAfter({ unansweredStreak: 4 }, "connected")).toBe(0);
    expect(offerNotReachable({ unansweredStreak: 4 }, "busy")).toBe(true);
    expect(offerNotReachable({ unansweredStreak: 3 }, "busy")).toBe(false);
    expect(offerNotReachable({ unansweredStreak: 5 }, null)).toBe(true);
    expect(offerNotReachable({ unansweredStreak: 9 }, "connected")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The one-step outcome against the database (real LR-SLA module).

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

function counsellorWithLead(loginId = "exec.one", overrides: Parameters<typeof lead>[0] = {}) {
  const account = staff(loginId, "counsellor");
  const viewer = viewerOf(account.id, "staff");
  const captured = lead(overrides);
  expect(captured.assigneeId).toBe(account.id);
  return { account, viewer, leadId: captured.leadId };
}

const later: OutcomeInput["next"] = { kind: "preset", preset: "later_today" };
const noAnswer = (extra: Partial<OutcomeInput> = {}): OutcomeInput => ({ contact: { channel: "call", outcome: "no_answer" }, next: later, ...extra });

describe("recordOutcome (§5.C, D-079)", () => {
  it("a no-answer call leaves EXACTLY ONE open follow-up (ours), and LR's clock counts the attempt", () => {
    const { viewer, leadId } = counsellorWithLead();
    const result = recordOutcome(viewer, leadId, noAnswer(), T0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.task?.dueAt).toBe(new Date(ist("2026-10-21", "13:30")).toISOString());
    expect(result.data.outsideCallingHours).toBe(false);
    expect(result.data.attempts).toEqual({ calls: 1, unansweredStreak: 1, suggestNotReachable: false });
    const open = openTasksOf(leadId);
    expect(open).toHaveLength(1);
    expect(open[0].title).toBe(FOLLOW_UP_TITLES.callAgain);
    expect(open[0].createdBy).not.toBeNull(); // the staff member's task, not LR's automatic retry
    const [clock] = clocksOf(leadId);
    expect(clock).toMatchObject({ resolution: "attempt", firstAttemptChannel: "call", retriesCreated: 0 });
  });

  it("without our follow-up LR's retry would have been the second task (control)", () => {
    const { viewer, leadId } = counsellorWithLead();
    expect(createTask(viewer, leadId, { title: "Existing", dueAt: ist("2026-10-22", "10:00") }, T0).ok).toBe(true);
    expect(recordOutcome(viewer, leadId, noAnswer({ next: { kind: "none", reason: "has_other_task" } }), T0).ok).toBe(true);
    expect(openTasksOf(leadId).map((task) => task.title)).toEqual(["Existing"]);
    expect(openTasksOf(leadId)).not.toContainEqual(expect.objectContaining({ title: RETRY_TASK_TITLE, createdBy: null }));
  });

  it("refuses a follow-up outside 08:00–21:00 IST (21:30) and writes nothing", () => {
    const { viewer, leadId } = counsellorWithLead();
    const result = recordOutcome(viewer, leadId, noAnswer({ next: { kind: "at", at: new Date(ist("2026-10-22", "21:30")).toISOString() } }), T0);
    expect(result).toMatchObject({ ok: false, error: "validation", fieldErrors: { next: ["No calls before 8 am or after 9 pm."] } });
    expect(openTasksOf(leadId)).toEqual([]);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type = 'call'").get(leadId)?.n).toBe(0);
  });

  it("accepts a time outside calling hours (inside 08:00–21:00) and says so", () => {
    const { viewer, leadId } = counsellorWithLead();
    const result = recordOutcome(viewer, leadId, noAnswer({ next: { kind: "at", at: new Date(ist("2026-10-22", "20:00")).toISOString() } }), T0);
    expect(result).toMatchObject({ ok: true, data: { outsideCallingHours: true } });
    expect(openTasksOf(leadId)[0].dueAt).toBe(ist("2026-10-22", "20:00"));
  });

  it("422 without a next follow-up; contact null needs a task; a picked time in the past is refused", () => {
    const { viewer, leadId } = counsellorWithLead();
    expect(recordOutcome(viewer, leadId, noAnswer({ next: { kind: "none", reason: "has_other_task" } }), T0)).toMatchObject({
      ok: false,
      fieldErrors: { next: ["Choose when to follow up."] },
    });
    expect(recordOutcome(viewer, leadId, { contact: null, next: later }, T0)).toMatchObject({ ok: false, fieldErrors: { contact: ["Choose what happened."] } });
    expect(recordOutcome(viewer, leadId, noAnswer({ next: { kind: "at", at: new Date(ist("2026-10-20", "12:00")).toISOString() } }), T0)).toMatchObject({
      ok: false,
      fieldErrors: { next: ["Choose a time from now on."] },
    });
    // A WhatsApp outcome on a call, or a template on a call, is refused.
    expect(recordOutcome(viewer, leadId, { contact: { channel: "call", outcome: "message_sent" }, next: later }, T0)).toMatchObject({ ok: false, error: "validation" });
    expect(openTasksOf(leadId)).toEqual([]);
  });

  it("task done: completes the task, sets the next one, and 'no call needed' logs no contact", () => {
    const { viewer, leadId } = counsellorWithLead();
    const task = createTask(viewer, leadId, { title: "Call after exams", dueAt: ist("2026-10-21", "15:00") }, T0);
    if (!task.ok) throw new Error("task");
    const result = recordOutcome(viewer, leadId, { contact: null, taskId: task.data.id, next: { kind: "preset", preset: "tomorrow" } }, T0 + 60_000);
    expect(result).toMatchObject({ ok: true, data: { completedTaskId: task.data.id, activityId: null } });
    expect(openTasksOf(leadId).map((open) => [open.title, open.dueAt])).toEqual([[FOLLOW_UP_TITLES.followUp, ist("2026-10-22", "10:00")]]);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type IN ('call','whatsapp')").get(leadId)?.n).toBe(0);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type = 'task_done'").get(leadId)?.n).toBe(1);
  });

  it("a task of another lead is refused (422); an unseen lead is 404 even with the viewer's own task", () => {
    const { viewer, leadId } = counsellorWithLead("exec.one");
    const other = staff("exec.two", "counsellor");
    const otherViewer = viewerOf(other.id, "staff");
    const second = lead();
    const admin = viewerOf(user("admin", "owner.sa").id, "admin");
    expect(assignLead(admin, second.leadId, other.id, T0).ok).toBe(true);
    const theirs = createTask(otherViewer, second.leadId, { title: "Theirs", dueAt: ist("2026-10-22", "10:00") }, T0);
    if (!theirs.ok) throw new Error("task");
    expect(recordOutcome(viewer, leadId, noAnswer({ taskId: theirs.data.id }), T0)).toMatchObject({ ok: false, fieldErrors: { taskId: [expect.any(String)] } });
    // exec.one cannot complete exec.two's task on exec.two's lead (they cannot see it): 404, nothing done.
    expect(recordOutcome(viewer, second.leadId, noAnswer({ taskId: theirs.data.id }), T0)).toMatchObject({ ok: false, error: "not_found" });
    expect(openTasksOf(second.leadId).map((task) => task.id)).toEqual([theirs.data.id]);
  });

  it("is atomic: a failure while logging the contact rolls back the task completion and the new follow-up", () => {
    const { viewer, leadId } = counsellorWithLead();
    const task = createTask(viewer, leadId, { title: "Call back", dueAt: ist("2026-10-21", "15:00") }, T0);
    if (!task.ok) throw new Error("task");
    const services: OutcomeServices = { completeTask, createTask, logContact: () => fail("conflict", "boom"), changeStage };
    const result = recordOutcome(viewer, leadId, noAnswer({ taskId: task.data.id }), T0, services);
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect(openTasksOf(leadId).map((open) => open.id)).toEqual([task.data.id]);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type IN ('task_done','task_created')").get(leadId)?.n).toBe(1); // only the original task_created
  });

  it("5 unanswered calls → 'not reachable' moves the enquiry to lost (not_reachable), closes LR's clock, leaves no task", () => {
    const { viewer, leadId } = counsellorWithLead();
    let now = T0;
    for (let call = 1; call <= 4; call += 1) {
      const open = openTasksOf(leadId)[0];
      const result = recordOutcome(viewer, leadId, noAnswer(open ? { taskId: open.id } : {}), now);
      expect(result.ok).toBe(true);
      now += 30 * 60_000;
    }
    const before = openTasksOf(leadId);
    expect(before).toHaveLength(1);
    const final = recordOutcome(viewer, leadId, noAnswer({ taskId: before[0].id, next: { kind: "none", reason: "closing" }, markNotReachable: true }), now);
    expect(final).toMatchObject({ ok: true, data: { stage: "lost", task: null, attempts: { calls: 5, unansweredStreak: 5, suggestNotReachable: true } } });
    const row = getDb().prepare("SELECT stage, lost_reason FROM crm_leads WHERE id = ?").get(leadId);
    expect(row).toEqual({ stage: "lost", lost_reason: "not_reachable" });
    expect(openTasksOf(leadId)).toEqual([]); // no "Call again" retry on a lead being closed
    expect(clocksOf(leadId).every((clock) => clock.resolvedAt !== null)).toBe(true);
    // Time order is "the 5th call, then lost" (lost stamped 1 ms later), so the lost review counts the call either way.
    const lostAt = Number(
      getDb().prepare("SELECT at FROM crm_activities WHERE lead_id = ? AND type = 'stage_change' AND json_extract(meta, '$.to') = 'lost'").get(leadId)?.at,
    );
    expect(lostAt).toBe(now + 1);
    const callsBefore = (op: "<" | "<=") => getDb().prepare(`SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type = 'call' AND at ${op} ?`).get(leadId, lostAt)?.n;
    expect(callsBefore("<")).toBe(5);
    expect(callsBefore("<=")).toBe(5);
    const newest = getDb().prepare("SELECT type FROM crm_activities WHERE lead_id = ? AND type IN ('call','stage_change') ORDER BY at DESC, id DESC LIMIT 1").get(leadId);
    expect(newest?.type).toBe("stage_change");
  });

  it("wrong number + 'Mark lost' → lost (wrong_number) and no follow-up; the mark needs a wrong-number call", () => {
    const { viewer, leadId } = counsellorWithLead();
    expect(recordOutcome(viewer, leadId, noAnswer({ markLostWrongNumber: true }), T0)).toMatchObject({ ok: false, fieldErrors: { markLostWrongNumber: [expect.any(String)] } });
    const result = recordOutcome(viewer, leadId, { contact: { channel: "call", outcome: "wrong_number" }, next: { kind: "none", reason: "wrong_number" }, markLostWrongNumber: true }, T0);
    expect(result).toMatchObject({ ok: true, data: { stage: "lost", task: null } });
    expect(getDb().prepare("SELECT lost_reason FROM crm_leads WHERE id = ?").get(leadId)?.lost_reason).toBe("wrong_number");
    expect(openTasksOf(leadId)).toEqual([]);
    // The first-call clock still counts the call as an attempt (logged before the lost mark).
    expect(clocksOf(leadId)[0]).toMatchObject({ resolution: "attempt", firstAttemptChannel: "call" });
    const at = (where: string) => Number(getDb().prepare(`SELECT at FROM crm_activities WHERE lead_id = ? AND ${where}`).get(leadId)?.at);
    expect(at("type = 'stage_change' AND json_extract(meta, '$.to') = 'lost'")).toBe(at("type = 'call'") + 1);
  });

  it("WhatsApp 'message sent' only with an APPROVED template; meta keeps { template, lang }; the audit names the key only", () => {
    const owner = user("admin", "owner.sa");
    const ownerViewer = viewerOf(owner.id, "admin");
    const { viewer, leadId } = counsellorWithLead();
    const sent = (key: string): OutcomeInput => ({ contact: { channel: "whatsapp", outcome: "message_sent", template: { key, lang: "hi" } }, next: { kind: "preset", preset: "tomorrow" } });
    // Not seeded yet, then a DRAFT: both refused.
    expect(recordOutcome(viewer, leadId, sent("missed_call"), T0)).toMatchObject({ ok: false, fieldErrors: { "contact.template": [expect.any(String)] } });
    expect(listTemplates(ownerViewer, { all: true }, T0).ok).toBe(true);
    expect(recordOutcome(viewer, leadId, sent("missed_call"), T0)).toMatchObject({ ok: false, fieldErrors: { "contact.template": [expect.any(String)] } });
    // Approved by the super admin: accepted.
    const version = Number(getDb().prepare("SELECT version FROM crm_wa_templates WHERE key = 'missed_call'").get()?.version);
    expect(setTemplateStatus(ownerViewer, "missed_call", { status: "approved", expectedVersion: version }, T0).ok).toBe(true);
    const result = recordOutcome(viewer, leadId, sent("missed_call"), T0);
    expect(result.ok).toBe(true);
    const activity = getDb().prepare("SELECT type, meta FROM crm_activities WHERE lead_id = ? AND type = 'whatsapp'").get(leadId);
    expect(activity?.type).toBe("whatsapp");
    expect(JSON.parse(String(activity?.meta))).toEqual({ outcome: "message_sent", template: "missed_call", lang: "hi" });
    const audit = listAudit(getDb(), { limit: 50 }).find((entry) => entry.action === "crm.contact_log");
    expect(audit?.details).toEqual({ channel: "whatsapp", outcome: "message_sent", template: "missed_call" });
    expect(openTasksOf(leadId).map((task) => task.title)).toEqual([FOLLOW_UP_TITLES.whatsapp]);
  });

  it("MCP-logged contacts are unchanged: no template, no task, the clock untouched (L3)", () => {
    const { account, leadId } = counsellorWithLead();
    const mcp = viewerOf(account.id, "staff", "mcp");
    expect(logContact(mcp, leadId, { channel: "call", outcome: "no_answer" }, T0).ok).toBe(true);
    const meta = JSON.parse(String(getDb().prepare("SELECT meta FROM crm_activities WHERE lead_id = ? AND type = 'call'").get(leadId)?.meta));
    expect(meta).toEqual({ outcome: "no_answer" });
    expect(openTasksOf(leadId)).toEqual([]);
    expect(clocksOf(leadId)[0]).toMatchObject({ resolvedAt: null, attempts: 0 });
  });

  it("default task titles are bilingual and never hold family data", () => {
    expect(defaultTaskTitle({ channel: "call", outcome: "busy" })).toBe(RETRY_TASK_TITLE);
    expect(defaultTaskTitle({ channel: "call", outcome: "call_back_requested" })).toBe(FOLLOW_UP_TITLES.callBack);
    expect(defaultTaskTitle({ channel: "whatsapp", outcome: "message_sent" })).toBe(FOLLOW_UP_TITLES.whatsapp);
    expect(defaultTaskTitle(null)).toBe(FOLLOW_UP_TITLES.followUp);
    for (const title of Object.values(FOLLOW_UP_TITLES)) expect(title).toMatch(/ · /);
  });
});

describe("followUpContext (GET …/outcome)", () => {
  it("presets, attempts, the other open task (never the one being ticked off), slots per language, Hindi default", async () => {
    const { viewer, leadId } = counsellorWithLead("exec.one", {
      studentName: "Riya Sharma",
      guardianName: "Anil Sharma",
      centreSlug: "shimla",
      context: { locale: "hi" },
    });
    const first = createTask(viewer, leadId, { title: "First", dueAt: ist("2026-10-21", "15:00") }, T0);
    const second = createTask(viewer, leadId, { title: "Second", dueAt: ist("2026-10-22", "15:00") }, T0);
    if (!first.ok || !second.ok) throw new Error("tasks");
    expect(recordOutcome(viewer, leadId, noAnswer({ next: { kind: "none", reason: "has_other_task" } }), T0).ok).toBe(true);

    const ctx = await followUpContext(viewer, leadId, T0, { taskId: first.data.id });
    if (!ctx.ok) throw new Error("context");
    const [en, hi] = await Promise.all([getCentres(undefined, "en"), getCentres(undefined, "hi")]);
    expect(ctx.data).toMatchObject({
      leadId,
      stage: "new",
      openTask: { id: second.data.id, title: "Second" },
      openTaskCount: 1,
      completingTask: { id: first.data.id, title: "First" },
      attempts: { calls: 1, unansweredStreak: 1 },
      defaultLang: "hi",
      callingHoursLabel: "09:00–19:00",
      outsideCallingHoursNow: false,
      presets: { later_today: new Date(ist("2026-10-21", "13:30")).toISOString(), tomorrow: new Date(ist("2026-10-22", "10:00")).toISOString() },
      suggested: { next: { kind: "preset", preset: "later_today" }, ruleKey: "retry" },
    });
    expect(ctx.data.slotsByLang.en).toEqual({
      parent_name: "Anil Sharma",
      student_first_name: "Riya",
      counsellor_name: "Person exec.one",
      centre: en.find((centre) => centre.slug === "shimla")?.name,
    });
    expect(ctx.data.slotsByLang.hi.centre).toBe(hi.find((centre) => centre.slug === "shimla")?.name);
    expect(ctx.data.templateSlots).toEqual(ctx.data.slotsByLang.hi);
    // Unseen lead → 404; nothing about it is returned.
    const stranger = viewerOf(staff("exec.two", "counsellor").id, "staff");
    expect(await followUpContext(stranger, leadId, T0)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("an erased lead is 409; a closed (lost) lead suggests no follow-up", async () => {
    const { viewer, leadId } = counsellorWithLead();
    expect(changeStage(viewer, leadId, "lost", "fees", T0).ok).toBe(true);
    const ctx = await followUpContext(viewer, leadId, T0);
    expect(ctx).toMatchObject({ ok: true, data: { stage: "lost", suggested: { next: { kind: "none", reason: "closing" }, ruleKey: "closed" } } });
    getDb().prepare("UPDATE crm_leads SET erased_at = ? WHERE id = ?").run(T0, leadId);
    const admin = viewerOf(user("admin", "owner.sa").id, "admin");
    expect(await followUpContext(admin, leadId, T0)).toMatchObject({ ok: false, error: "conflict" });
  });
});
