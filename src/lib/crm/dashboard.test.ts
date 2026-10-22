import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, resetDatabaseForTests } from "@/lib/db/connection";

import { clockOutcome, dashboardData, dashboardRange, median, speedStats } from "./dashboard";
import { DEFAULT_CALLING_HOURS, type DashboardData } from "./lead-ops-types";
import { assignLead, changeStage, logContact } from "./leads";
import type { DashboardClockRow } from "./repo/dashboard";
import { setAvailability } from "./repo/staff-ops";
import { setUserAreas } from "./routing";
import { HOUR, ist, lead, MINUTE, staff, T0, user, viewerOf } from "./sla/test-kit";

// LR-SLA (docs/lead-routing-plan.md §16, §24): the dashboard against a fresh in-memory database,
// with clocks started by the real SLA seam.

const db = () => getDb();
const RANGE = { from: T0 - 24 * HOUR, to: T0 + 24 * HOUR };

function data(result: ReturnType<typeof dashboardData>): DashboardData {
  if (!result.ok) throw new Error(`dashboard failed: ${result.error}`);
  return result.data;
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("pure statistics", () => {
  it("medians (odd, even, none) and rates", () => {
    expect(median([50, 10, 30])).toBe(30);
    expect(median([10, 20, 30, 45])).toBe(25);
    expect(median([])).toBeNull();
    const clock = (overrides: Partial<DashboardClockRow>): DashboardClockRow => ({
      id: 1,
      leadId: "l",
      reason: "new",
      source: "hero",
      startedAt: T0,
      dueAt: T0 + HOUR,
      tier1At: T0 + HOUR,
      tier2At: T0 + 4 * HOUR,
      resolvedAt: null,
      resolution: null,
      firstAttemptAt: null,
      firstAttemptBy: null,
      assigneeAtDue: null,
      workMs: null,
      met: null,
      reachedAt: null,
      assignedTo: null,
      areaId: null,
      ...overrides,
    });
    const now = T0 + 2 * HOUR;
    const outcomes = [
      clockOutcome(clock({ resolvedAt: T0 + 10 * MINUTE, resolution: "attempt", firstAttemptAt: T0 + 10 * MINUTE, met: true, workMs: 10 * MINUTE, reachedAt: T0 + 10 * MINUTE }), now, DEFAULT_CALLING_HOURS, 600),
      clockOutcome(clock({ resolvedAt: T0 + 90 * MINUTE, resolution: "attempt", firstAttemptAt: T0 + 90 * MINUTE, met: false, workMs: 90 * MINUTE }), now, DEFAULT_CALLING_HOURS, 600),
      clockOutcome(clock({}), now, DEFAULT_CALLING_HOURS, 600), // open past due: missed + overdue
      clockOutcome(clock({ resolvedAt: T0 + 5 * MINUTE, resolution: "closed" }), now, DEFAULT_CALLING_HOURS, 600), // closed in time: neither
      clockOutcome(clock({ startedAt: now - MINUTE, dueAt: now + HOUR, tier1At: now + HOUR }), now, DEFAULT_CALLING_HOURS, 600), // still in time
    ];
    expect(outcomes.map((o) => [o.met, o.missed, o.open, o.overdue])).toEqual([
      [true, false, false, false],
      [false, true, false, false],
      [false, true, true, true],
      [false, false, false, false],
      [false, false, true, false],
    ]);
    expect(speedStats(outcomes)).toEqual({ clocks: 5, met: 1, metRate: 0.3333, reached: 1, reachedRate: 1, medianWorkMinutes: 50 });
    expect(speedStats([])).toEqual({ clocks: 0, met: 0, metRate: null, reached: 0, reachedRate: null, medianWorkMinutes: null });
  });

  it("ranges: default 30 days; at most 366; from before to", () => {
    expect(dashboardRange(null, null, T0)).toEqual({ from: T0 - 30 * 24 * HOUR, to: T0 });
    expect(dashboardRange(T0, T0 - 1, T0)).toBeNull();
    expect(dashboardRange(T0 - 400 * 24 * HOUR, T0, T0)).toBeNull();
  });
});

describe("dashboardData", () => {
  function world() {
    const sa = user("admin", "owner.sa");
    const saViewer = viewerOf(sa.id, "admin");
    const head = staff("head.kangra", "manager");
    const exec = staff("exec.kangra", "counsellor");
    const other = staff("exec.other", "counsellor");
    for (const person of [head, exec]) setUserAreas(db(), person.id, ["kangra"], { actorId: sa.id, now: T0 });
    setUserAreas(db(), other.id, ["solan"], { actorId: sa.id, now: T0 });
    return { sa, saViewer, head, exec, other };
  }

  it("scopes area heads to their areas; ?area outside them is refused; counsellors get nothing", () => {
    const w = world();
    lead({ district: "Palampur" });
    lead({ district: "Baddi" });
    const head = viewerOf(w.head.id, "staff");
    const own = data(dashboardData(head, RANGE, T0 + 2 * HOUR));
    // Their own area, plus Chamba (no head of its own; served from Dharamshala, a Kangra centre; A1).
    expect(own.scope.areaIds).toEqual(["kangra", "chamba"]);
    expect(own.byArea.map((row) => row.key)).toEqual(["kangra"]);
    expect(own.now.unassignedNoArea).toBeUndefined();
    expect(own.meta).toBeUndefined();
    expect(dashboardData(head, { ...RANGE, area: "solan" }, T0)).toMatchObject({ ok: false, error: "forbidden" });
    expect(data(dashboardData(head, { ...RANGE, area: "kangra" }, T0)).scope.areaIds).toEqual(["kangra"]);
    expect(dashboardData(viewerOf(w.exec.id, "staff"), RANGE, T0)).toMatchObject({ ok: false, error: "forbidden" });

    const all = data(dashboardData(w.saViewer, RANGE, T0 + 2 * HOUR));
    expect(all.scope.areaIds).toBe("all");
    expect(all.byArea.map((row) => row.key).sort()).toEqual(["kangra", "solan"]);
    expect(all.now).toMatchObject({ callNow: 2, overdue: 2, escalated: 0, unassignedNoArea: 0, toolSignups: 0, unmatchedPlaces: 0 });
    expect(data(dashboardData(w.saViewer, { ...RANGE, area: "solan" }, T0)).byArea.map((row) => row.key)).toEqual(["solan"]);
  });

  it("splits live from imported clocks, credits met to the caller and charges missed to the holder at due time", () => {
    const w = world();
    const execViewer = viewerOf(w.exec.id, "staff");
    const quick = lead({ district: "Palampur" });
    const slow = lead({ district: "Palampur" });
    const handed = lead({ district: "Palampur" });
    lead({ district: "Palampur", source: "csv_import", consent: { textVersion: "csv:phone", method: "csv_import" } }, T0, { slaClock: true, clockReason: "import" });
    logContact(execViewer, quick.leadId, { channel: "call", outcome: "connected" }, T0 + 10 * MINUTE);
    logContact(execViewer, slow.leadId, { channel: "call", outcome: "no_answer" }, T0 + 30 * MINUTE);
    // Handed from the executive to the head after the due time; the head calls late.
    assignLead(w.saViewer, handed.leadId, w.head.id, T0 + 90 * MINUTE);
    changeStage(viewerOf(w.head.id, "staff"), handed.leadId, "contacted", null, T0 + 2 * HOUR);

    const result = data(dashboardData(w.saViewer, RANGE, T0 + 3 * HOUR));
    expect(result.speed.live).toEqual({ clocks: 3, met: 2, metRate: 0.6667, reached: 1, reachedRate: 1, medianWorkMinutes: 30 });
    expect(result.speed.imported).toMatchObject({ clocks: 1, met: 0, metRate: 0 });
    const exec = result.byExecutive.find((row) => row.key === w.exec.id);
    const head = result.byExecutive.find((row) => row.key === w.head.id);
    // The open, late imported clock is NOT charged to anyone in the per-executive or per-area tables (A7).
    expect(exec).toMatchObject({ label: "Person exec.kangra", leads: 3, attempted: 2, met: 2, missed: 1, open: 0, overdue: 0 });
    expect(head).toMatchObject({ attempted: 1, met: 0, missed: 0 });
    expect(result.byExecutive.reduce((sum, row) => sum + row.leads, 0)).toBe(3);
    expect(result.byArea).toEqual([expect.objectContaining({ key: "kangra", leads: 3, missed: 1, open: 0, overdue: 0 })]);
    expect(result.bySource.map((row) => row.key).sort()).toEqual(["admissions", "csv_import"]);
    expect(result.bySource.find((row) => row.key === "csv_import")).toMatchObject({ leads: 1, missed: 1, open: 1, overdue: 1 });
    expect(result.today).toEqual({ newLeads: 4, bySource: [{ key: "admissions", count: 3 }, { key: "csv_import", count: 1 }] });
  });

  it("counts junk per campaign and lists who is away in scope", () => {
    const w = world();
    const execViewer = viewerOf(w.exec.id, "staff");
    const diwali = (number: number) => lead({ district: "Palampur", context: { utmCampaign: "diwali-jee" }, phone: `94${String(number).padStart(8, "0")}` });
    const a = diwali(1);
    const b = diwali(2);
    const c = diwali(3);
    lead({ district: "Palampur" });
    logContact(execViewer, a.leadId, { channel: "call", outcome: "wrong_number" }, T0 + MINUTE);
    changeStage(w.saViewer, b.leadId, "lost", "duplicate", T0 + MINUTE);
    logContact(execViewer, c.leadId, { channel: "call", outcome: "connected" }, T0 + MINUTE);
    changeStage(w.saViewer, c.leadId, "enrolled", null, T0 + 2 * MINUTE);

    setAvailability(db(), { userId: w.other.id, awayUntil: ist("2026-10-25", "00:00"), note: null, actorId: w.sa.id, now: T0 });
    const result = data(dashboardData(w.saViewer, RANGE, T0 + HOUR));
    expect(result.byCampaign).toEqual([
      { key: "diwali-jee", total: 3, contacted: 1, reached: 1, enrolled: 1, junk: 2 },
      { key: "none", total: 1, contacted: 0, reached: 0, enrolled: 0, junk: 0 },
    ]);
    expect(result.now.away).toEqual([{ userId: w.other.id, name: "Person exec.other", until: new Date(ist("2026-10-25", "00:00")).toISOString() }]);
    // The Kangra head does not see Solan's people.
    expect(data(dashboardData(viewerOf(w.head.id, "staff"), RANGE, T0 + HOUR)).now.away).toEqual([]);
  });
});
