import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseBackParam } from "@/components/crm/format";
import type { Role, Session } from "@/lib/auth/roles";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import {
  assignLead,
  captureLead,
  changeStage,
  eraseLead,
  resolveCrmViewer,
  writeStaffMembership,
  type CaptureLeadInput,
  type CrmRole,
  type CrmViewer,
} from "../../index";
import { admissionsHref } from "../dashboard/links";
import { putTargets } from "../targets/targets";
import { ADMISSIONS_PAGE_SIZE, admissionsDone } from "./admissions";
import { parseAdmissionsQuery } from "./query";

// Admissions done (docs/admin-phase-1b-plan.md §5.B, §6.3, O8): scope, session attribution, erased
// stubs counted without a name, programme buckets, targets beside totals, paging and back links.

const IST = (5 * 60 + 30) * 60_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const istAt = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - IST;

let adminId: string;
let admin: CrmViewer;

function makeUser(role: Role, loginId: string) {
  return insertUser(getDb(), { id: `u-${loginId.replace(/[^a-z]/g, "-")}`, role, loginId, displayName: `Name ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW - 400 * DAY });
}

function makeStaff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []): CrmViewer {
  const user = makeUser("staff", loginId);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, NOW - 400 * DAY);
  const viewer = resolveCrmViewer({ userId: user.id, role: "staff", displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

let phone = 0;
function enrolled(input: Partial<CaptureLeadInput>, createdAt: number, enrolledAt: number): string {
  phone += 1;
  const result = captureLead({ source: "admissions", studentName: `Student ${phone}`, phone: `93000${String(phone).padStart(5, "0")}`, consent: { textVersion: "2026-10-20.v2" }, ...input }, createdAt);
  if (!result.ok) throw new Error("capture failed");
  const moved = changeStage(admin, result.leadId, "enrolled", null, enrolledAt);
  if (!moved.ok) throw new Error("stage failed");
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

describe("admissions done (§6.3)", () => {
  it("counts the joining session, else the session of the move to Admitted (1 April IST boundary)", () => {
    const before = enrolled({ centreSlug: "kullu" }, istAt(2026, 3, 1), istAt(2026, 3, 31, 23, 59));
    const after = enrolled({ centreSlug: "kullu", programInterest: "jee" }, istAt(2026, 3, 1), istAt(2026, 4, 1, 0, 0));
    const pulledIn = enrolled({ centreSlug: "shimla", programInterest: "neet" }, istAt(2026, 2, 1), istAt(2026, 3, 10));
    const pushedOut = enrolled({ centreSlug: "shimla" }, NOW - 5 * DAY, NOW - DAY);
    const insert = getDb().prepare("INSERT INTO crm_lead_details (lead_id, intake_session, updated_at) VALUES (?, ?, ?)");
    insert.run(pulledIn, "S2026", NOW);
    insert.run(pushedOut, "S2027", NOW);
    const ids = (session: "S2025" | "S2026" | "S2027") => admissionsDone(admin, session, null).items.map((item) => item.leadId).sort();
    expect(ids("S2025")).toEqual([before]);
    expect(ids("S2026")).toEqual([after, pulledIn].sort());
    expect(ids("S2027")).toEqual([pushedOut]);
    // Leads that are no longer Admitted are not counted.
    expect(changeStage(admin, after, "lost", "other", NOW).ok).toBe(true);
    expect(ids("S2026")).toEqual([pulledIn]);
  });

  it("buckets programmes, totals per centre, shows targets beside totals, and counts erased stubs without a name", () => {
    enrolled({ centreSlug: "shimla", programInterest: "jee" }, NOW - 9 * DAY, NOW - 3 * DAY);
    enrolled({ centreSlug: "shimla", programInterest: "not-sure" }, NOW - 9 * DAY, NOW - 2 * DAY);
    const gone = enrolled({ centreSlug: "hamirpur", programInterest: "foundation", context: { referrer: "chatgpt.com" } }, NOW - 9 * DAY, NOW - 2 * DAY);
    enrolled({ centreSlug: null }, NOW - 9 * DAY, NOW - DAY);
    expect(eraseLead(admin, gone, NOW - DAY, { reason: "family_request" }).ok).toBe(true);
    expect(
      putTargets({ ...admin, superAdmin: true }, { period: "S2026", metric: "admissions", cells: [{ centreSlug: "shimla", program: "any", value: 10 }, { centreSlug: "kullu", program: "jee", value: 4 }], expectedUpdatedAt: null }, NOW).ok,
    ).toBe(true);

    const report = admissionsDone(admin, "S2026", null);
    expect(report.total).toBe(4);
    expect(report.showTargets).toBe(true);
    const shimla = report.summary.rows.find((row) => row.centre === "shimla");
    expect(shimla).toMatchObject({ total: 2, target: 10, counts: { jee: 1, any: 1, neet: 0, foundation: 0, integrated: 0 } });
    expect(report.summary.rows.find((row) => row.centre === "kullu")).toMatchObject({ total: 0, target: 4 });
    expect(report.summary.rows.find((row) => row.centre === null)).toMatchObject({ total: 1, target: null });
    expect(report.summary.rows.at(-1)?.centre).toBeNull();
    expect(report.summary).toMatchObject({ total: 4, target: 14, totals: { jee: 1, any: 2, foundation: 1, neet: 0, integrated: 0 } });

    const erased = report.items.find((item) => item.leadId === gone);
    expect(erased).toMatchObject({ erased: true, name: null, centreSlug: "hamirpur", program: "foundation", channel: "ai_assistants" });
    expect(report.items.filter((item) => !item.erased).every((item) => item.name?.startsWith("Student"))).toBe(true);
    // Newest admission first.
    expect(report.items.map((item) => item.admittedAt)).toEqual([...report.items.map((item) => item.admittedAt)].sort().reverse());

    // The centre filter: one centre, or `none` for "No centre yet".
    expect(admissionsDone(admin, "S2026", "shimla").total).toBe(2);
    expect(admissionsDone(admin, "S2026", "none").total).toBe(1);
    expect(admissionsDone(admin, "S2026", "kullu")).toMatchObject({ total: 0, summary: { rows: [{ centre: "kullu", target: 4 }] } });
  });

  it("is scoped: counsellors their own families (no targets), managers their centres", () => {
    // Leads first: staff created later get no automatic assignment.
    const mine = enrolled({ centreSlug: "shimla" }, NOW - 9 * DAY, NOW - 2 * DAY);
    enrolled({ centreSlug: "shimla" }, NOW - 9 * DAY, NOW - 2 * DAY);
    const theirs = enrolled({ centreSlug: "hamirpur" }, NOW - 9 * DAY, NOW - 2 * DAY);
    const counsellor = makeStaff("couns.one", "counsellor");
    const head = makeStaff("head.hamirpur", "manager", ["hamirpur"]);
    expect(assignLead(admin, mine, counsellor.userId, NOW - DAY).ok).toBe(true);
    putTargets({ ...admin, superAdmin: true }, { period: "S2026", metric: "admissions", cells: [{ centreSlug: "shimla", program: "any", value: 9 }, { centreSlug: "hamirpur", program: "any", value: 3 }], expectedUpdatedAt: null }, NOW);

    const own = admissionsDone(counsellor, "S2026", null);
    expect(own.items.map((item) => item.leadId)).toEqual([mine]);
    expect(own.items[0].assignee).toEqual({ userId: counsellor.userId, displayName: "Name couns.one" });
    expect(own.showTargets).toBe(false);
    expect(own.summary.rows.every((row) => row.target === null)).toBe(true);

    const scoped = admissionsDone(head, "S2026", null);
    expect(scoped.items.map((item) => item.leadId)).toEqual([theirs]);
    expect(scoped.summary.rows).toEqual([expect.objectContaining({ centre: "hamirpur", total: 1, target: 3 })]);
    expect(admissionsDone(admin, "S2026", null).total).toBe(3);
  });

  it("pages 50 at a time and clamps the page", () => {
    for (let i = 0; i < ADMISSIONS_PAGE_SIZE + 3; i += 1) enrolled({ centreSlug: "kullu" }, NOW - 9 * DAY, NOW - 2 * DAY + i * 1000);
    const first = admissionsDone(admin, "S2026", null, 1);
    expect(first).toMatchObject({ total: 53, page: 1, pages: 2, pageSize: 50 });
    expect(first.items).toHaveLength(50);
    const second = admissionsDone(admin, "S2026", null, 2);
    expect(second.items).toHaveLength(3);
    expect(new Set([...first.items, ...second.items].map((item) => item.leadId)).size).toBe(53);
    expect(admissionsDone(admin, "S2026", null, 99).page).toBe(2);
  });
});

describe("query and links (§5.B)", () => {
  it("parses session, centre and page, falling back on anything unusable", () => {
    const parse = (query: string) => parseAdmissionsQuery((name) => new URLSearchParams(query).get(name), NOW);
    expect(parse("")).toEqual({ session: "S2026", centre: null, page: 1, invalid: false });
    expect(parse("session=S2025&centre=shimla&page=3")).toEqual({ session: "S2025", centre: "shimla", page: 3, invalid: false });
    expect(parse("centre=none")).toMatchObject({ centre: "none", invalid: false });
    expect(parse("session=M2026-11&centre=Not%20A%20Slug&page=0")).toEqual({ session: "S2026", centre: null, page: 1, invalid: true });
  });

  it("builds links that the lead page's Back link keeps (back kind admissions)", () => {
    expect(admissionsHref("S2026")).toBe("/crm/admissions?session=S2026");
    expect(admissionsHref("S2026", "shimla", 2)).toBe("/crm/admissions?session=S2026&centre=shimla&page=2");
    expect(admissionsHref("S2026", "none", 1)).toBe("/crm/admissions?session=S2026&centre=none");
    expect(admissionsHref("S2026", "Bad Slug")).toBe("/crm/admissions?session=S2026");
    expect(parseBackParam(admissionsHref("S2026", "shimla", 2))).toEqual({ path: "/crm/admissions?session=S2026&centre=shimla&page=2", kind: "admissions" });
    expect(parseBackParam(admissionsHref("S2026", "none"))).toEqual({ path: "/crm/admissions?session=S2026&centre=none", kind: "admissions" });
  });
});
