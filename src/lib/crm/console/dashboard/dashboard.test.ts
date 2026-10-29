import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseInboxFilters, toLeadFilters } from "@/components/crm/format";
import type { Role, Session } from "@/lib/auth/roles";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { leadFiltersFromSearch } from "../../http";
import {
  assignLead,
  captureLead,
  changeStage,
  createTask,
  eraseLead,
  listLeads,
  logContact,
  resolveCrmViewer,
  writeStaffMembership,
  type CaptureLeadInput,
  type CaptureLeadOptions,
  type CrmRole,
  type CrmViewer,
  type LeadFilters,
} from "../../index";
import { upsertLeadRouting } from "../../repo/areas-core";
import { admissionsDone } from "../admissions/admissions";
import { lostReview } from "../lost/lost";
import { parseAdmissionsQuery } from "../admissions/query";
import { parseSourcesQuery } from "../sources/range";
import { sourcesReport } from "../sources/sources";
import { putTargets } from "../targets/targets";
import type { CentreNumbers, ConsoleNumbers } from "../types";
import { attentionFilters, LOST_REVIEW_DAYS, lostToReviewCount, needsAttention } from "./attention";
import { admissionsHref, topSourcesHref } from "./links";
import { centreRows, consoleNumbers, numberFilters, topSources, type NumberKey } from "./numbers";

// "Your numbers" (docs/admin-phase-1b-plan.md §5.A, §6.1, §6.2): every formula on one fixture
// database, and every linked number round-tripped through its link to the list that shows it.
// Synthetic people, places and numbers only; a fresh in-memory database per test.

const IST = (5 * 60 + 30) * 60_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Wednesday 21 Oct 2026, 11:30 IST (session 2026–27; the week started Monday 19 Oct 00:00 IST). */
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const istAt = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - IST;
const BASE = "https://aspire.invalid";

let adminId: string;
let admin: CrmViewer;

function makeUser(role: Role, loginId: string) {
  // Readable ids (no random UUID digits), so the "no 10-digit run" link check is deterministic.
  return insertUser(getDb(), { id: `u-${loginId.replace(/[^a-z]/g, "-")}`, role, loginId, displayName: `Name ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW - 400 * DAY });
}

function makeStaff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []) {
  const user = makeUser("staff", loginId);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, NOW - 400 * DAY);
  return user;
}

function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

let phoneCounter = 0;
function capture(overrides: Partial<CaptureLeadInput> = {}, at = NOW, options: CaptureLeadOptions = {}) {
  phoneCounter += 1;
  const result = captureLead(
    {
      source: "admissions",
      studentName: "Synthetic Student",
      phone: `91000${String(phoneCounter).padStart(5, "0")}`,
      consent: { textVersion: "2026-10-20.v2" },
      ...overrides,
    },
    at,
    options,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result.leadId;
}

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.data;
}

function area(id: string, defaultCentre: string | null, centres: string[] = []) {
  const db = getDb();
  db.prepare("INSERT INTO crm_areas (id, name_en, name_hi, default_centre_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, `Area ${id}`, `क्षेत्र ${id}`, defaultCentre, NOW, NOW);
  for (const centre of centres) db.prepare("INSERT INTO crm_area_centres (centre_slug, area_id, created_at) VALUES (?, ?, ?)").run(centre, id, NOW);
}

function routeTo(leadId: string, areaId: string | null, gateOnly = false) {
  upsertLeadRouting(getDb(), { leadId, areaId, match: areaId ? "district" : null, outcome: areaId ? "area" : "empty", placeInput: null, placeKey: null, gateOnly, routedAt: NOW, routedBy: null });
}

const enrol = (leadId: string, at: number) => must(changeStage(admin, leadId, "enrolled", null, at));
const intake = (leadId: string, session: string) =>
  getDb().prepare("INSERT INTO crm_lead_details (lead_id, intake_session, updated_at) VALUES (?, ?, ?)").run(leadId, session, NOW);

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

// ---------------------------------------------------------------------------------------------
// The fixture: four website centres, an area with its own serving centre, "No centre yet",
// tool sign-ups (in an area and unrouted), an import, an erased stub, a test-erased lead,
// admissions on both sides of 1 April, joining sessions that override the admission date, lost
// enquiries (unreviewed, reviewed, old) and overdue follow-ups for two counsellors.

interface World {
  todayShimla: string;
  mondayStart: string;
  sundayLate: string;
  signupInArea: string;
  erasedStub: string;
  testErased: string;
  enrolledNow: string;
  erasedEnrolled: string;
  calledYesterday: string;
  imported: string;
  intakeOverride: string;
  enrolledBefore: string;
  enrolledAfter: string;
  intakeIntoCurrent: string;
  lostRecent: string;
  areaNoCentre: string;
  noCentre: string;
  signupUnrouted: string;
  couns1: string;
  couns2: string;
}

function world(): World {
  const db = getDb();
  const gate = { textVersion: "2026-10-21.gate.v1" };
  // Shimla
  const todayShimla = capture({ centreSlug: "shimla", context: { referrer: "chatgpt.com" } }, NOW - HOUR);
  const mondayStart = capture({ centreSlug: "shimla" }, istAt(2026, 10, 19, 0, 0));
  const sundayLate = capture({ centreSlug: "shimla", context: { referrer: "www.google.co.in" } }, istAt(2026, 10, 18, 23, 59));
  const signupInArea = capture({ source: "tool", consent: gate, centreSlug: "shimla" }, NOW - 2 * HOUR, { gate: true });
  const erasedStub = capture({ centreSlug: "shimla", context: { referrer: "chatgpt.com" } }, NOW - 5 * HOUR);
  const testErased = capture({ centreSlug: "shimla" }, NOW - 4 * HOUR);
  const enrolledNow = capture({ centreSlug: "shimla", programInterest: "jee" }, NOW - 10 * DAY);
  const erasedEnrolled = capture({ centreSlug: "shimla", programInterest: "neet" }, NOW - 12 * DAY);
  // Hamirpur
  const calledYesterday = capture({ centreSlug: "hamirpur" }, NOW - 30 * HOUR);
  const imported = capture({ centreSlug: "hamirpur" }, NOW - 40 * HOUR);
  const intakeOverride = capture({ centreSlug: "hamirpur", programInterest: "foundation" }, NOW - 40 * DAY);
  // Kullu and Dharamshala (admissions either side of 1 April; lost enquiries)
  const enrolledBefore = capture({ centreSlug: "kullu" }, istAt(2026, 3, 1));
  const enrolledAfter = capture({ centreSlug: "kullu", programInterest: "integrated" }, istAt(2026, 3, 2));
  const intakeIntoCurrent = capture({ centreSlug: "dharamshala", programInterest: "not-sure" }, istAt(2026, 2, 1));
  const lostRecent = capture({ centreSlug: "kullu" }, NOW - 5 * DAY);
  const lostReviewed = capture({ centreSlug: "kullu" }, NOW - 6 * DAY);
  const lostOld = capture({ centreSlug: "kullu" }, NOW - 40 * DAY);
  // An area with its own serving centre; no centre at all; an unrouted tool sign-up.
  const areaNoCentre = capture({ centreSlug: null }, NOW - 26 * HOUR);
  const noCentre = capture({ source: "contact", centreSlug: null }, NOW - 10 * MINUTE);
  const signupUnrouted = capture({ source: "tool", consent: gate, centreSlug: null }, NOW - HOUR, { gate: true });

  area("north-zone", "north-centre", ["north-centre"]);
  routeTo(areaNoCentre, "north-zone");
  routeTo(noCentre, null);
  routeTo(signupUnrouted, null, true);
  db.prepare("UPDATE crm_leads SET source = 'csv_import' WHERE id = ?").run(imported);
  must(logContact(admin, calledYesterday, { channel: "call", outcome: "no_answer" }, NOW - 29 * HOUR));

  enrol(enrolledNow, NOW - 2 * DAY);
  enrol(erasedEnrolled, NOW - 3 * DAY);
  enrol(intakeOverride, NOW - DAY);
  intake(intakeOverride, "S2027");
  enrol(enrolledBefore, istAt(2026, 3, 31, 23, 59));
  enrol(enrolledAfter, istAt(2026, 4, 1, 0, 0));
  enrol(intakeIntoCurrent, istAt(2026, 3, 10));
  intake(intakeIntoCurrent, "S2026");

  must(changeStage(admin, lostRecent, "lost", "not_interested", NOW - 2 * DAY));
  const lostAt = NOW - 3 * DAY;
  must(changeStage(admin, lostReviewed, "lost", "fees", lostAt));
  db.prepare("INSERT INTO crm_lost_reviews (lead_id, lost_at, decision, reviewed_at, reviewed_by) VALUES (?, ?, 'kept', ?, ?)").run(lostReviewed, lostAt, NOW - DAY, adminId);
  must(changeStage(admin, lostOld, "lost", "fees", NOW - 20 * DAY));

  must(eraseLead(admin, erasedStub, NOW - 3 * HOUR, { reason: "family_request" }));
  must(eraseLead(admin, testErased, NOW - 3 * HOUR, { reason: "wrong_or_test" }));
  must(eraseLead(admin, erasedEnrolled, NOW - DAY, { reason: "family_request" }));

  // Overdue follow-ups: two for counsellor one (Shimla), one for counsellor two (Hamirpur).
  const couns1 = makeStaff("couns.one", "counsellor").id;
  const couns2 = makeStaff("couns.two", "counsellor").id;
  for (const [leadId, person] of [
    [todayShimla, couns1],
    [mondayStart, couns1],
    [imported, couns2],
  ] as const) {
    must(assignLead(admin, leadId, person, NOW - 3 * HOUR));
    must(createTask(admin, leadId, { title: "Call back", dueAt: NOW - 2 * HOUR }, NOW - 3 * HOUR));
  }

  return {
    todayShimla,
    mondayStart,
    sundayLate,
    signupInArea,
    erasedStub,
    testErased,
    enrolledNow,
    erasedEnrolled,
    calledYesterday,
    imported,
    intakeOverride,
    enrolledBefore,
    enrolledAfter,
    intakeIntoCurrent,
    lostRecent,
    areaNoCentre,
    noCentre,
    signupUnrouted,
    couns1,
    couns2,
  };
}

const inboxTotal = (viewer: CrmViewer, filters: LeadFilters) => listLeads(viewer, filters, { pageSize: 100 }, NOW).total;
/** How many events the Lost review list (1B-FAMILY, /crm/lost, 14 days) shows the viewer. */
const lostListLength = (viewer: CrmViewer) => must(lostReview(viewer, { days: LOST_REVIEW_DAYS }, NOW)).items.length;
const row = (data: ConsoleNumbers, slug: string | null) => {
  const found = data.rows.find((entry) => entry.centre.slug === slug);
  if (!found) throw new Error(`no row ${slug}`);
  return found;
};
const VALUE: Record<NumberKey, (entry: CentreNumbers) => number> = {
  today: (entry) => entry.enquiriesToday,
  week: (entry) => entry.enquiriesWeek,
  notCalled: (entry) => entry.notCalled,
  notCalledOver24h: (entry) => entry.notCalledOver24h,
  overdue: (entry) => entry.overdue,
};

/**
 * Every linked number of every row (and the Total) opens a list whose filters are exactly the ones
 * that were counted, and that list's total is the number. Also checks the Enquiries PAGE parser.
 */
function expectLinksMatch(viewer: CrmViewer, data: ConsoleNumbers) {
  for (const entry of [...data.rows, data.total]) {
    const centre = entry === data.total ? undefined : (entry.centre.slug ?? "none");
    const counted = numberFilters(centre);
    for (const key of Object.keys(VALUE) as NumberKey[]) {
      const href = entry.links[key];
      const url = new URL(href, BASE);
      expect(url.pathname).toBe("/crm");
      const filters = leadFiltersFromSearch(url.searchParams);
      expect(filters, `${centre ?? "total"} ${key}`).toEqual(counted[key]);
      expect(toLeadFilters(parseInboxFilters(url.searchParams))).toEqual({ ...counted[key], sort: "recent_activity" });
      expect(inboxTotal(viewer, filters), `${centre ?? "total"} ${key}`).toBe(VALUE[key](entry));
    }
    // Admissions this session → Admissions done for the same session and centre: the same total.
    const admissionsUrl = new URL(entry.links.admissions, BASE);
    expect(entry.links.admissions).toBe(admissionsHref(data.session.key, centre));
    const query = parseAdmissionsQuery((name) => admissionsUrl.searchParams.get(name), NOW);
    expect(query).toMatchObject({ session: data.session.key, centre: centre ?? null, invalid: false });
    expect(admissionsDone(viewer, query.session, query.centre, 1).total).toBe(entry.admissionsSession);
    // Top sources → Where enquiries come from, last 30 days, same centre: each chip's count is that channel's row.
    expect(entry.links.sources).toBe(topSourcesHref(centre));
    const sourcesUrl = new URL(entry.links.sources, BASE);
    const sources = parseSourcesQuery((name) => sourcesUrl.searchParams.get(name), NOW);
    const report = sourcesReport(viewer, sources.range, sources.centre, NOW);
    expect(report.total).toBe(entry.enquiries30d);
    for (const chip of entry.topSources) expect(report.channels.find((channel) => channel.channel === chip.channel)?.enquiries).toBe(chip.count);
  }
}

// ---------------------------------------------------------------------------------------------
describe("five numbers by centre (§6.1)", () => {
  it("counts every formula on the fixture (admin: every centre)", async () => {
    const w = world();
    must(
      putTargets({ ...admin, superAdmin: true }, {
        period: "S2026",
        metric: "admissions",
        cells: [
          { centreSlug: "shimla", program: "jee", value: 10 },
          { centreSlug: "shimla", program: "neet", value: 5 },
        ],
        expectedUpdatedAt: null,
      }, NOW - HOUR),
    );
    const data = await consoleNumbers(admin, NOW, "en");
    expect(data.session.key).toBe("S2026");
    expect(data.generatedAt).toBe(new Date(NOW).toISOString());

    // Rows: the website centres (content order), then other centres by slug, then "No centre yet".
    const slugs = data.rows.map((entry) => entry.centre.slug);
    expect(slugs.slice(0, 4)).toEqual(["shimla", "hamirpur", "dharamshala", "kullu"]);
    expect(slugs).toContain("north-centre");
    expect(slugs.at(-1)).toBeNull();

    const shimla = row(data, "shimla");
    expect(shimla).toMatchObject({
      enquiriesToday: 2, // today + the tool sign-up (the erased and test-erased leads are not in the list)
      enquiriesWeek: 3, // + Monday 00:00 IST; Sunday 23:59 IST is last week
      toolSignupsWeek: 1,
      importedWeek: 0,
      erasedWeek: 1, // the erased stub (test-erased leads are never counted)
      notCalled: 3, // tool sign-ups left out; Sunday's lead still waits
      notCalledOver24h: 2,
      overdue: 2,
      admissionsSession: 2, // the erased admission still counts
      sessionTarget: 15,
      enquiries30d: 7,
    });
    // Erased lead's referrer host survives (ai_assistants 2); ties in CHANNELS order (free tools before search engines).
    expect(shimla.topSources).toEqual([
      { channel: "direct", count: 3 },
      { channel: "ai_assistants", count: 2 },
      { channel: "free_tools", count: 1 },
    ]);

    const hamirpur = row(data, "hamirpur");
    expect(hamirpur).toMatchObject({ enquiriesWeek: 2, importedWeek: 1, toolSignupsWeek: 0, notCalled: 1, notCalledOver24h: 1, admissionsSession: 0, sessionTarget: null });
    expect(hamirpur.topSources).toEqual([]); // 3 enquiries in 30 days: too few to rank
    expect(row(data, "kullu").admissionsSession).toBe(1); // 1 April 00:00 IST is the new session
    expect(row(data, "dharamshala").admissionsSession).toBe(1); // joining session S2026 overrides a March admission
    expect(row(data, "north-centre")).toMatchObject({ enquiriesWeek: 1, notCalled: 1, notCalledOver24h: 1 });
    const none = row(data, null);
    expect(none).toMatchObject({ enquiriesToday: 2, toolSignupsWeek: 1, notCalled: 1 });

    expect(data.total).toMatchObject({
      enquiriesWeek: data.rows.reduce((sum, entry) => sum + entry.enquiriesWeek, 0),
      toolSignupsWeek: 2,
      importedWeek: 1,
      erasedWeek: 1,
      admissionsSession: 4,
      sessionTarget: 15, // Σ over the centres shown
    });
    expect(data.centreListIsDemo).toBe(true);
    expect(inboxTotal(admin, { assignee: w.couns1 })).toBe(2);
  });

  it("every linked number opens a list with the same total (admin, legacy manager, area head)", async () => {
    world();
    expectLinksMatch(admin, await consoleNumbers(admin, NOW, "en"));

    const legacyHead = makeStaff("head.hamirpur", "manager", ["hamirpur"]);
    const legacy = viewerOf(legacyHead.id, "staff");
    const scoped = await consoleNumbers(legacy, NOW, "en");
    expect(scoped.rows.map((entry) => entry.centre.slug)).toEqual(["hamirpur"]);
    expectLinksMatch(legacy, scoped);

    const areaHead = makeStaff("head.north", "manager");
    getDb().prepare("INSERT INTO crm_area_members (area_id, user_id, created_at) VALUES ('north-zone', ?, ?)").run(areaHead.id, NOW);
    getDb().prepare("INSERT INTO crm_staff_scope (user_id, mode, set_at) VALUES (?, 'areas', ?)").run(areaHead.id, NOW);
    const north = viewerOf(areaHead.id, "staff");
    const own = await consoleNumbers(north, NOW, "hi");
    expect(own.rows.map((entry) => entry.centre.slug)).toEqual(["north-centre"]);
    expect(own.total).toMatchObject({ enquiriesWeek: 1, notCalled: 1, admissionsSession: 0, sessionTarget: null });
    expectLinksMatch(north, own);
  });

  it("the Total covers the whole scope, and 'No target set' stays null until a cell exists", async () => {
    world();
    const before = await consoleNumbers(admin, NOW);
    expect(before.rows.every((entry) => entry.sessionTarget === null)).toBe(true);
    expect(before.total.sessionTarget).toBeNull();
    for (const key of Object.keys(VALUE) as NumberKey[]) expect(VALUE[key](before.total)).toBe(inboxTotal(admin, numberFilters()[key]));
    // A target of 0 is a target ("n of 0"), not "No target set".
    must(putTargets({ ...admin, superAdmin: true }, { period: "S2026", metric: "admissions", cells: [{ centreSlug: "kullu", program: "any", value: 0 }], expectedUpdatedAt: null }, NOW));
    const after = await consoleNumbers(admin, NOW);
    expect(row(after, "kullu").sessionTarget).toBe(0);
    expect(after.total.sessionTarget).toBe(0);
    // Other periods and metrics never leak into the session's admissions target.
    must(putTargets({ ...admin, superAdmin: true }, { period: "S2026", metric: "enquiries", cells: [{ centreSlug: "shimla", program: "any", value: 99 }], expectedUpdatedAt: new Date(NOW).toISOString() }, NOW + 1));
    expect(row(await consoleNumbers(admin, NOW), "shimla").sessionTarget).toBeNull();
  });

  it("a manager sees only their own centres' targets, as on Targets and Admissions done; admins every target", async () => {
    world();
    const head = makeStaff("head.hamirpur", "manager", ["hamirpur"]);
    const manager = viewerOf(head.id, "staff");
    // An enquiry of another centre assigned to the manager puts that centre among their rows.
    const kulluLead = capture({ centreSlug: "kullu" }, NOW - DAY);
    must(assignLead(admin, kulluLead, head.id, NOW - HOUR));
    const cells = [
      { centreSlug: "kullu", program: "any" as const, value: 40 },
      { centreSlug: "hamirpur", program: "jee" as const, value: 25 },
      { centreSlug: "new-centre", program: "any" as const, value: 10 },
    ];
    must(putTargets({ ...admin, superAdmin: true }, { period: "S2026", metric: "admissions", cells, expectedUpdatedAt: null }, NOW - HOUR));

    const data = await consoleNumbers(manager, NOW);
    expect(data.rows.map((entry) => entry.centre.slug)).toEqual(["hamirpur", "kullu"]);
    expect(row(data, "kullu").sessionTarget).toBeNull();
    expect(row(data, "hamirpur").sessionTarget).toBe(25);
    expect(data.total.sessionTarget).toBe(25);
    const page = admissionsDone(manager, data.session.key, null, 1);
    expect(page.summary.target).toBe(data.total.sessionTarget);
    expect(page.total).toBe(data.total.admissionsSession);
    expectLinksMatch(manager, data);

    // Admins: every target, a centre with a target but no enquiries yet included, and the Total
    // target equals Admissions done's.
    const all = await consoleNumbers(admin, NOW);
    expect(row(all, "new-centre")).toMatchObject({ sessionTarget: 10, admissionsSession: 0 });
    expect(all.total.sessionTarget).toBe(75);
    expect(admissionsDone(admin, all.session.key, null, 1).summary.target).toBe(75);
  });

  it("splits the week at Monday 00:00 IST", async () => {
    capture({ centreSlug: "kullu" }, istAt(2026, 10, 18, 23, 59));
    capture({ centreSlug: "kullu" }, istAt(2026, 10, 19, 0, 0));
    expect(row(await consoleNumbers(admin, NOW), "kullu").enquiriesWeek).toBe(1);
    // A week later the Monday lead belongs to last week.
    expect(row(await consoleNumbers(admin, istAt(2026, 10, 26, 0, 0)), "kullu").enquiriesWeek).toBe(0);
  });

  it("ranks top sources by count with CHANNELS order on ties, and not under 5 enquiries", () => {
    const origin = (source: string, referrer: string | null = null) => ({ centre: null, source, tool: null, referrer, utmSource: null, utmMedium: null, utmCampaign: null });
    expect(topSources([origin("walk_in"), origin("admissions"), origin("phone_call"), origin("referral")])).toEqual([]);
    expect(
      topSources([origin("admissions"), origin("walk_in"), origin("phone_call"), origin("admissions", "wa.me"), origin("admissions", "chatgpt.com")]),
    ).toEqual([
      { channel: "walk_in", count: 1 },
      { channel: "phone_call", count: 1 },
      { channel: "ai_assistants", count: 1 },
    ]);
  });

  it("builds rows from the viewer's centres plus any centre found, then 'No centre yet'", () => {
    const all = [
      { slug: "shimla", label: "Shimla", demo: true },
      { slug: "hamirpur", label: "Hamirpur", demo: true },
    ];
    expect(centreRows(all, null, ["zeta-town", null, "shimla"], true).map((ref) => [ref.slug, ref.label])).toEqual([
      ["shimla", "Shimla"],
      ["hamirpur", "Hamirpur"],
      ["zeta-town", "Zeta Town"],
      [null, ""],
    ]);
    expect(centreRows(all, ["hamirpur"], ["hamirpur"], false).map((ref) => ref.slug)).toEqual(["hamirpur"]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("needs attention (§6.2)", () => {
  it("admin variant: every kind with a count, links that round-trip, overdue per person then everyone", () => {
    const w = world();
    const items = needsAttention(admin, NOW, "admin");
    const kinds = items.map((item) => item.kind);
    expect(kinds[0]).toBe("unassigned");
    expect(kinds).toContain("tool_signups");
    expect(kinds).toContain("not_called_24h");
    expect(kinds.at(-1)).toBe("lost_to_review");
    expect(items.every((item) => item.count > 0)).toBe(true);

    const f = attentionFilters();
    const tool = items.find((item) => item.kind === "tool_signups");
    expect(tool).toMatchObject({ count: 1, href: "/crm?stage=open&area=tool_signups" });
    expect(items.find((item) => item.kind === "not_called_24h")?.count).toBe(inboxTotal(admin, f.notCalled24));

    const overdue = items.filter((item) => item.kind === "overdue_by_counsellor");
    const one = overdue.find((item) => item.userId === w.couns1);
    expect(one).toMatchObject({ count: 2, name: "Name couns.one", href: `/crm?stage=open&assignee=${w.couns1}&due=overdue` });
    expect(overdue.find((item) => item.userId === w.couns2)).toMatchObject({ count: 1, name: "Name couns.two" });
    const everyone = overdue.at(-1);
    expect(everyone?.userId).toBeUndefined();
    expect(everyone?.count).toBe(inboxTotal(admin, f.overdue));
    expect(everyone?.count).toBe(overdue.slice(0, -1).reduce((sum, item) => sum + item.count, 0));

    // Every inbox-linked row: the list for its href shows the same total.
    for (const item of items) {
      if (item.kind === "lost_to_review") continue;
      const url = new URL(item.href, BASE);
      expect(url.pathname).toBe("/crm");
      expect(inboxTotal(admin, leadFiltersFromSearch(url.searchParams)), item.kind).toBe(item.count);
      expect(toLeadFilters(parseInboxFilters(url.searchParams))).toMatchObject(leadFiltersFromSearch(url.searchParams));
    }
    // Lost to review: unreviewed lost events of the last 14 days on live leads still lost, the
    // same number as the Lost review list it links to.
    expect(items.at(-1)).toEqual({ kind: "lost_to_review", count: 1, href: "/crm/lost" });
    expect(lostListLength(admin)).toBe(1);
  });

  it("counts a lead lost, reopened and lost again as two events; a reason edit is not an event; reopening drops them", () => {
    const lead = capture({ centreSlug: "kullu" }, NOW - 5 * DAY);
    must(changeStage(admin, lead, "lost", "fees", NOW - 4 * DAY));
    must(changeStage(admin, lead, "contacted", null, NOW - 3 * DAY));
    must(changeStage(admin, lead, "lost", "not_interested", NOW - 2 * DAY));
    const lostRow = () => needsAttention(admin, NOW, "admin").find((item) => item.kind === "lost_to_review");
    expect(lostRow()?.count).toBe(2);
    // Changing the reason of a lead that is already lost (lost → lost) is not a new event.
    must(changeStage(admin, lead, "lost", "fees", NOW - DAY));
    expect(lostRow()?.count).toBe(2);
    expect(lostListLength(admin)).toBe(2);
    // A manager of the centre gets the same count as their Lost review list; another centre's head none.
    const kullu = viewerOf(makeStaff("head.kullu", "manager", ["kullu"]).id, "staff");
    expect(lostToReviewCount(kullu, NOW)).toBe(2);
    expect(lostListLength(kullu)).toBe(2);
    const shimla = viewerOf(makeStaff("head.shimla", "manager", ["shimla"]).id, "staff");
    expect(lostToReviewCount(shimla, NOW)).toBe(0);
    expect(lostListLength(shimla)).toBe(0);
    must(changeStage(admin, lead, "contacted", null, NOW - HOUR));
    expect(lostRow()).toBeUndefined();
    expect(lostListLength(admin)).toBe(0);
  });

  it("crm variant: no unassigned or tool sign-up rows (lead routing shows them), scoped to the manager", () => {
    world();
    const crm = needsAttention(admin, NOW, "crm");
    expect(crm.some((item) => item.kind === "unassigned" || item.kind === "tool_signups")).toBe(false);
    expect(crm.some((item) => item.kind === "not_called_24h")).toBe(true);

    const head = makeStaff("head.hamirpur", "manager", ["hamirpur"]);
    const manager = viewerOf(head.id, "staff");
    const scoped = needsAttention(manager, NOW, "crm");
    for (const item of scoped) {
      if (item.kind === "lost_to_review") continue;
      expect(inboxTotal(manager, leadFiltersFromSearch(new URL(item.href, BASE).searchParams))).toBe(item.count);
    }
    // Kullu's lost enquiry is not in a Hamirpur head's scope.
    expect(scoped.some((item) => item.kind === "lost_to_review")).toBe(false);
  });

  it("shows nothing when nothing waits", () => {
    expect(needsAttention(admin, NOW, "admin")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("links carry no personal data (§1.2 rule 11)", () => {
  it("no 10-digit run and no @ in any number or attention link", async () => {
    world();
    const data = await consoleNumbers(admin, NOW);
    const hrefs = [...data.rows, data.total].flatMap((entry) => Object.values(entry.links));
    hrefs.push(...needsAttention(admin, NOW, "admin").map((item) => item.href));
    expect(hrefs.length).toBeGreaterThan(20);
    for (const href of hrefs) {
      expect(href).not.toMatch(/\d{10}/);
      expect(href).not.toContain("@");
      expect(href.startsWith("/crm")).toBe(true);
    }
  });
});
