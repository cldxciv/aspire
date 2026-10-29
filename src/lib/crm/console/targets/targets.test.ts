import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { resolveCrmViewer, writeStaffMembership, type CrmRole, type CrmViewer } from "../../index";
import { targetsBodySchema } from "./schemas";
import { getTargets, putTargets, sessionTargetFor, TARGET_MESSAGES } from "./targets";

// Session targets (docs/admin-phase-1b-plan.md §5.B, O4, O6): who may read and write, the strict
// body, the version conflict, the audit row, and the per-centre admissions target. Synthetic data.

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const HOUR = 3_600_000;

let adminId: string;
let admin: CrmViewer;
let superAdmin: CrmViewer;

function makeUser(role: Role, loginId: string) {
  return insertUser(getDb(), { id: `u-${loginId.replace(/[^a-z]/g, "-")}`, role, loginId, displayName: `Name ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW });
}

function makeStaff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []): CrmViewer {
  const user = makeUser("staff", loginId);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, NOW);
  const viewer = resolveCrmViewer({ userId: user.id, role: "staff", displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

const body = (overrides: Record<string, unknown> = {}) => ({
  period: "S2026",
  metric: "admissions",
  cells: [
    { centreSlug: "shimla", program: "jee", value: 40 },
    { centreSlug: "shimla", program: "neet", value: 20 },
    { centreSlug: "hamirpur", program: "any", value: 25 },
  ],
  expectedUpdatedAt: null,
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  for (const level of ["info", "warn"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  adminId = makeUser("admin", "admin.one").id;
  admin = resolveCrmViewer({ userId: adminId, role: "admin", displayName: "x" } as Session) as CrmViewer;
  superAdmin = { ...admin, superAdmin: true };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("who may read and write targets (§5.B, O4)", () => {
  it("only super admins write; admins and managers read; counsellors never", () => {
    const manager = makeStaff("head.shimla", "manager", ["shimla"]);
    const counsellor = makeStaff("couns.one", "counsellor");
    for (const viewer of [{ ...admin, superAdmin: false }, manager, counsellor]) {
      const denied = putTargets(viewer, body(), NOW);
      expect(denied).toMatchObject({ ok: false, error: "forbidden" });
    }
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_targets").get()?.n).toBe(0);
    expect(getTargets(counsellor, "S2026")).toMatchObject({ ok: false, error: "forbidden" });

    const saved = putTargets(superAdmin, body(), NOW);
    expect(saved.ok).toBe(true);
    const all = getTargets(admin, "S2026");
    expect(all.ok && all.data.cells).toHaveLength(3);
    expect(all.ok && all.data).toMatchObject({ period: "S2026", updatedAt: new Date(NOW).toISOString(), updatedBy: "Name admin.one" });
    // A manager reads only their centres' rows.
    const own = getTargets(manager, "S2026");
    expect(own.ok && own.data.cells.map((cell) => [cell.centreSlug, cell.program, cell.value])).toEqual([
      ["shimla", "jee", 40],
      ["shimla", "neet", 20],
    ]);
  });

  it("refuses anything but a session key (no month periods in 1b)", () => {
    expect(getTargets(admin, "M2026-11")).toMatchObject({ ok: false, error: "validation", message: TARGET_MESSAGES.invalidPeriod });
    expect(getTargets(admin, "S1999")).toMatchObject({ ok: false, error: "validation" });
    expect(putTargets(superAdmin, body({ period: "M2026-11" }), NOW)).toMatchObject({ ok: false, error: "validation" });
    expect(putTargets(superAdmin, body({ period: "S1999" }), NOW)).toMatchObject({ ok: false, error: "validation" });
  });
});

describe("the body (zod, §5.B)", () => {
  it("accepts unknown centre slugs and rejects bad programmes, metrics, values and duplicates", () => {
    expect(targetsBodySchema.safeParse(body({ cells: [{ centreSlug: "new-centre", program: "any", value: 0 }] })).success).toBe(true);
    const bad: unknown[] = [
      body({ metric: "monthly" }),
      body({ cells: [{ centreSlug: "shimla", program: "medical", value: 1 }] }),
      body({ cells: [{ centreSlug: "shimla", program: "jee", value: -1 }] }),
      body({ cells: [{ centreSlug: "shimla", program: "jee", value: 1.5 }] }),
      body({ cells: [{ centreSlug: "shimla", program: "jee", value: 100_001 }] }),
      body({ cells: [{ centreSlug: "Shimla Centre", program: "jee", value: 1 }] }),
      body({ cells: [{ centreSlug: "shimla", program: "jee", value: 1, extra: true }] }),
      body({
        cells: [
          { centreSlug: "shimla", program: "jee", value: 1 },
          { centreSlug: "shimla", program: "jee", value: 2 },
        ],
      }),
      body({ extra: 1 }),
      { period: "S2026", metric: "admissions", cells: [] },
    ];
    for (const value of bad) expect(targetsBodySchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    expect(putTargets(superAdmin, body({ cells: [{ centreSlug: "shimla", program: "jee", value: -5 }] }), NOW)).toMatchObject({
      ok: false,
      error: "validation",
      fieldErrors: { "cells.0.value": expect.any(Array) },
    });
    // The largest allowed value and an unknown centre save.
    expect(putTargets(superAdmin, body({ cells: [{ centreSlug: "new-centre", program: "jee", value: 100_000 }] }), NOW).ok).toBe(true);
  });
});

describe("saving (§5.B)", () => {
  it("replaces every cell of the period × metric in one go, leaving other metrics and sessions alone", () => {
    expect(putTargets(superAdmin, body(), NOW).ok).toBe(true);
    const first = getTargets(admin, "S2026");
    const stamp = first.ok ? first.data.updatedAt : null;
    expect(putTargets(superAdmin, body({ metric: "enquiries", cells: [{ centreSlug: "shimla", program: "any", value: 400 }], expectedUpdatedAt: stamp }), NOW + HOUR).ok).toBe(true);
    expect(putTargets(superAdmin, body({ period: "S2027", cells: [{ centreSlug: "kullu", program: "any", value: 9 }] }), NOW).ok).toBe(true);
    const second = getTargets(admin, "S2026");
    const replaced = putTargets(
      superAdmin,
      body({ cells: [{ centreSlug: "hamirpur", program: "foundation", value: 12 }], expectedUpdatedAt: second.ok ? second.data.updatedAt : null }),
      NOW + 2 * HOUR,
    );
    expect(replaced.ok).toBe(true);
    const cells = replaced.ok ? replaced.data.cells.map((cell) => `${cell.metric}:${cell.centreSlug}:${cell.program}=${cell.value}`).sort() : [];
    expect(cells).toEqual(["admissions:hamirpur:foundation=12", "enquiries:shimla:any=400"]);
    expect(sessionTargetFor(getDb(), "kullu", "S2027")).toBe(9);
    // An empty list clears the metric.
    const cleared = putTargets(superAdmin, body({ cells: [], expectedUpdatedAt: replaced.ok ? replaced.data.updatedAt : null }), NOW + 3 * HOUR);
    expect(cleared.ok && cleared.data.cells.map((cell) => cell.metric)).toEqual(["enquiries"]);
  });

  it("refuses a stale version (409) and always moves the version forward", () => {
    const saved = putTargets(superAdmin, body(), NOW);
    expect(saved.ok).toBe(true);
    // Someone who loaded the empty grid saves later: conflict.
    expect(putTargets(superAdmin, body(), NOW + HOUR)).toMatchObject({ ok: false, error: "conflict", message: TARGET_MESSAGES.versionConflict });
    expect(putTargets(superAdmin, body({ expectedUpdatedAt: new Date(NOW - 1).toISOString() }), NOW + HOUR)).toMatchObject({ ok: false, error: "conflict" });
    expect(putTargets(superAdmin, body({ expectedUpdatedAt: "not a date" }), NOW + HOUR)).toMatchObject({ ok: false, error: "validation" });
    // Two saves in the same millisecond still get different versions, so the second loader conflicts.
    const stamp = saved.ok ? saved.data.updatedAt : null;
    const again = putTargets(superAdmin, body({ expectedUpdatedAt: stamp }), NOW);
    expect(again.ok && again.data.updatedAt).toBe(new Date(NOW + 1).toISOString());
    expect(putTargets(superAdmin, body({ expectedUpdatedAt: stamp }), NOW)).toMatchObject({ ok: false, error: "conflict" });
  });

  it("a save that only clears cells still moves the version, so a stale save after it conflicts", () => {
    const twoId = makeUser("admin", "admin.two").id;
    const two: CrmViewer = { ...(resolveCrmViewer({ userId: twoId, role: "admin", displayName: "x" } as Session) as CrmViewer), superAdmin: true };
    const first = putTargets(superAdmin, body(), NOW);
    const second = putTargets(
      superAdmin,
      body({ metric: "enquiries", cells: [{ centreSlug: "shimla", program: "any", value: 400 }], expectedUpdatedAt: first.ok ? first.data.updatedAt : null }),
      NOW + HOUR,
    );
    // Both super admins load this version; the second one clears the admissions targets.
    const loaded = second.ok ? second.data.updatedAt : null;
    const cleared = putTargets(two, body({ cells: [], expectedUpdatedAt: loaded }), NOW + 2 * HOUR);
    expect(cleared.ok && cleared.data).toMatchObject({ updatedAt: new Date(NOW + 2 * HOUR).toISOString(), updatedBy: "Name admin.two" });
    // The first one's save, based on what they loaded, would silently bring the cleared targets back: refused.
    expect(putTargets(superAdmin, body({ expectedUpdatedAt: loaded }), NOW + 3 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
    // Clearing the session's last cells keeps a version (and who changed it last), so a save from the empty grid of before conflicts too.
    const empty = putTargets(two, body({ metric: "enquiries", cells: [], expectedUpdatedAt: cleared.ok ? cleared.data.updatedAt : null }), NOW + 4 * HOUR);
    expect(empty.ok && empty.data).toMatchObject({ cells: [], updatedAt: new Date(NOW + 4 * HOUR).toISOString(), updatedBy: "Name admin.two" });
    expect(putTargets(superAdmin, body(), NOW + 5 * HOUR)).toMatchObject({ ok: false, error: "conflict" });
    expect(putTargets(superAdmin, body({ expectedUpdatedAt: empty.ok ? empty.data.updatedAt : null }), NOW + 5 * HOUR).ok).toBe(true);
  });

  it("audits settings.targets_update with the period, metric and cell count only", () => {
    expect(putTargets(superAdmin, body(), NOW).ok).toBe(true);
    const rows = listAudit(getDb(), { limit: 20 }).filter((entry) => entry.action === "settings.targets_update");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: adminId, target: "S2026", details: { period: "S2026", metric: "admissions", cells: 3 } });
    expect(JSON.stringify(rows[0].details)).not.toMatch(/shimla|40|hamirpur/);
    // A refused save writes nothing.
    putTargets(superAdmin, body(), NOW + HOUR);
    expect(listAudit(getDb(), { limit: 20 }).filter((entry) => entry.action === "settings.targets_update")).toHaveLength(1);
  });
});

describe("the session target of a centre (§6.1 4t)", () => {
  it("sums every programme of the admissions metric; null without a cell or without a centre", () => {
    expect(sessionTargetFor(getDb(), "shimla", "S2026")).toBeNull();
    expect(putTargets(superAdmin, body(), NOW).ok).toBe(true);
    expect(sessionTargetFor(getDb(), "shimla", "S2026")).toBe(60);
    expect(sessionTargetFor(getDb(), "hamirpur", "S2026")).toBe(25);
    expect(sessionTargetFor(getDb(), "kullu", "S2026")).toBeNull();
    expect(sessionTargetFor(getDb(), null, "S2026")).toBeNull();
    expect(sessionTargetFor(getDb(), "shimla", "S2025")).toBeNull();
  });
});
