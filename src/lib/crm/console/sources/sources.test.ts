import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usageKeyHash } from "@/lib/ask/usage";
import type { Role, Session } from "@/lib/auth/roles";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { upsertLeadRouting } from "../../repo/areas-core";
import { captureLead, eraseLead, resolveCrmViewer, writeStaffMembership, type CaptureLeadInput, type CrmRole, type CrmViewer } from "../../index";
import { xOfYText } from "@/components/console/shared/messages";
import { aiSummary, channelRows, funnel, heardRows, MAPS_TAG_KEY, mapsSummary, weeklyTrend, type OriginRow } from "./aggregate";
import { customRange, istDayKey, parseSourcesQuery, presetRange, sourcesHref } from "./range";
import { searchOverview } from "./search";
import { sourcesReport } from "./sources";
import { gateStatus, toolUsage } from "./tools";
import type { SourceRange } from "./types";

// "Where enquiries come from" (docs/admin-phase-1b-plan.md §5.J, §6.6, §6.7; 1B-SOURCES). A fresh
// in-memory database per test; synthetic people, hosts and numbers only.

const IST = (5 * 60 + 30) * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Wednesday 21 Oct 2026, 11:30 IST. */
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const istAt = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - IST;

let adminId: string;
let admin: CrmViewer;
let phoneCounter = 0;

function makeUser(role: Role, loginId: string) {
  return insertUser(getDb(), { role, loginId, displayName: `Name ${loginId}`, passwordHash: "scrypt$test", mustChangePassword: false, now: NOW });
}

function makeStaff(loginId: string, crmRole: CrmRole, centreSlugs: string[] = []) {
  const user = makeUser("staff", loginId);
  writeStaffMembership(getDb(), adminId, user.id, { crmRole, centreSlugs, active: true }, NOW);
  return user;
}

function viewerOf(userId: string, role: Role): CrmViewer {
  const viewer = resolveCrmViewer({ userId, role, displayName: "x" } as Session);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function capture(overrides: Partial<CaptureLeadInput> = {}, at = NOW - DAY): string {
  phoneCounter += 1;
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `90000${String(phoneCounter).padStart(5, "0")}`, consent: { textVersion: "2026-10-20.v2" }, ...overrides },
    at,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result.leadId;
}

const sql = (statement: string, ...values: (string | number | null)[]) => getDb().prepare(statement).run(...values);
const setSource = (leadId: string, source: string) => sql("UPDATE crm_leads SET source = ? WHERE id = ?", source, leadId);
const setStages = (leadId: string, stage: string, furthest: string) => sql("UPDATE crm_leads SET stage = ?, furthest_stage = ? WHERE id = ?", stage, furthest, leadId);
const heard = (leadId: string, value: string) => sql("INSERT INTO crm_lead_details (lead_id, heard_via, updated_at) VALUES (?, ?, ?)", leadId, value, NOW);

const range30 = (): SourceRange => presetRange("30d", NOW);

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("LEAD_GATE", "");
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

/** One enquiry per classifier rule (plan §6.6), plus an erased one and a test-erased one. */
function world() {
  const ids = {
    meta: capture(),
    scholarship: capture(),
    csv: capture(),
    paper: capture(),
    walkIn: capture({ centreSlug: "shimla" }),
    phone: capture(),
    referral: capture(),
    other: capture(),
    rancho: capture({ source: "tool", context: { tool: "ask", utmSource: "chatgpt" } }),
    predictor: capture({ source: "tool", context: { tool: "predictor" } }),
    leadAd: capture({ context: { utmMedium: "lead_ad", utmSource: "facebook" } }),
    gbp: capture({ centreSlug: "shimla", context: { utmSource: "google", utmMedium: "gbp", utmCampaign: "gbp-shimla", page: "/centres" } }),
    mapsRef: capture({ centreSlug: "shimla", context: { referrer: "https://maps.app.goo.gl/AbC123", page: "/centres" } }),
    chatOpenai: capture({ context: { referrer: "chat.openai.com", page: "/admissions" } }),
    chatgptUtm: capture({ context: { utmSource: "chatgpt.com", page: "/admissions" } }),
    cpc: capture({ context: { utmSource: "google", utmMedium: "cpc", utmCampaign: "diwali-jee", referrer: "www.google.com" } }),
    googleIn: capture({ context: { referrer: "www.google.co.in" } }),
    bingPort: capture({ context: { referrer: "bing.com:8443" } }),
    wa: capture({ context: { referrer: "wa.me" } }),
    youtube: capture({ context: { referrer: "m.youtube.com" } }),
    campaign: capture({ context: { utmCampaign: "diwali-jee", utmSource: "newsletter", utmMedium: "email" } }),
    otherSite: capture({ context: { referrer: "example.org" } }),
    direct: capture(),
    erasedAi: capture({ context: { referrer: "perplexity.ai" } }),
    testLead: capture({ context: { referrer: "claude.ai" } }),
  };
  setSource(ids.meta, "meta_lead_ad");
  setSource(ids.scholarship, "scholarship_test");
  setSource(ids.csv, "csv_import");
  setSource(ids.paper, "paper_form");
  setSource(ids.walkIn, "walk_in");
  setSource(ids.phone, "phone_call");
  setSource(ids.referral, "referral");
  setSource(ids.other, "other");
  setStages(ids.gbp, "enrolled", "enrolled");
  setStages(ids.mapsRef, "lost", "counselling_booked");
  setStages(ids.chatOpenai, "offer", "offer");
  heard(ids.mapsRef, "google_maps");
  heard(ids.direct, "google_maps");
  heard(ids.walkIn, "ai_assistant");
  heard(ids.phone, "newspaper");
  heard(ids.referral, "billboard_2027");
  expect(eraseLead(admin, ids.erasedAi, NOW - HOUR, { reason: "family_request" }).ok).toBe(true);
  expect(eraseLead(admin, ids.testLead, NOW - HOUR, { reason: "wrong_or_test" }).ok).toBe(true);
  return ids;
}

// ---------------------------------------------------------------------------------------------
describe("range and centre query (§5.J controls)", () => {
  it("reads presets, custom IST dates and the effective-centre filter; flags what it cannot use", () => {
    const get = (params: Record<string, string>) => (name: string) => params[name];
    expect(parseSourcesQuery(get({}), NOW).range).toMatchObject({ key: "90d", fromMs: NOW - 90 * DAY, toMs: NOW });
    expect(parseSourcesQuery(get({ range: "30d" }), NOW).range).toMatchObject({ key: "30d", fromMs: NOW - 30 * DAY });
    expect(parseSourcesQuery(get({ range: "session" }), NOW).range).toMatchObject({ key: "session", fromMs: istAt(2026, 4, 1), fromDay: "2026-04-01" });
    const custom = parseSourcesQuery(get({ range: "custom", from: "2026-10-01", to: "2026-10-07" }), NOW);
    expect(custom.range).toEqual({ key: "custom", fromMs: istAt(2026, 10, 1), toMs: istAt(2026, 10, 8), fromDay: "2026-10-01", toDay: "2026-10-07" });
    expect(parseSourcesQuery(get({ from: "2026-10-01", to: "2026-10-07" }), NOW).range.key).toBe("custom");
    // A preset wins over stray dates (the form always sends the date fields).
    expect(parseSourcesQuery(get({ range: "30d", from: "2026-10-01", to: "2026-10-07" }), NOW).range.key).toBe("30d");
    // To-day in the future is cut at now.
    expect(customRange("2026-10-20", "2026-10-30", NOW)).toMatchObject({ toMs: NOW, toDay: "2026-10-21" });
    const badQueries: Record<string, string>[] = [{ from: "2026-10-07", to: "2026-10-01" }, { from: "2026-02-30", to: "2026-03-01" }, { from: "2020-01-01", to: "2026-10-01" }, { range: "custom" }, { range: "7y" }];
    for (const bad of badQueries) {
      const parsed = parseSourcesQuery(get(bad), NOW);
      expect(parsed.invalid.range, JSON.stringify(bad)).toBe(true);
      expect(parsed.range.key).toBe("90d");
    }
    expect(parseSourcesQuery(get({ centre: "shimla" }), NOW)).toMatchObject({ centre: "shimla", invalid: { centre: false } });
    expect(parseSourcesQuery(get({ centre: "none" }), NOW).centre).toBe("none");
    expect(parseSourcesQuery(get({ centre: "Shimla Hills!" }), NOW)).toMatchObject({ centre: null, invalid: { centre: true } });
    expect(sourcesHref(presetRange("90d", NOW), null)).toBe("/crm/sources");
    expect(sourcesHref(presetRange("30d", NOW), "shimla", "#maps")).toBe("/crm/sources?range=30d&centre=shimla#maps");
    expect(sourcesHref(custom.range, null)).toBe("/crm/sources?from=2026-10-01&to=2026-10-07");
    expect(istDayKey(istAt(2026, 10, 21) - 1)).toBe("2026-10-20");
  });
});

describe("sourcesReport over P_all (§6.6 classifier, erased stubs, test leads)", () => {
  it("classifies every rule into its channel; erased enquiries count, test leads do not", () => {
    world();
    const report = sourcesReport(admin, range30(), null, NOW);
    expect(report.total).toBe(24); // 25 captured − 1 test lead
    expect(report.erased).toBe(1);
    const byChannel = Object.fromEntries(report.channels.map((row) => [row.channel, row.enquiries]));
    expect(byChannel).toEqual({
      meta_ads: 2, // source meta_lead_ad + utm_medium=lead_ad
      scholarship_test: 1,
      imported_list: 1,
      paper_forms: 1,
      walk_in: 1,
      phone_call: 1,
      referral: 1,
      staff_other: 1,
      rancho: 1, // tool ask wins over its chatgpt tag
      free_tools: 1,
      google_maps: 2, // gbp tag + maps.app.goo.gl referrer
      ai_assistants: 3, // chat.openai.com, utm_source=chatgpt.com, erased perplexity.ai (kept host)
      paid_ads: 1,
      search_engines: 2, // www.google.co.in, bing.com:8443 (port stripped)
      whatsapp: 1,
      social: 1, // m.youtube.com (subdomain)
      campaign: 1,
      other_websites: 1,
      direct: 1,
    });
    // Largest first, ties in CHANNELS order.
    expect(report.channels.slice(0, 4).map((row) => row.channel)).toEqual(["ai_assistants", "meta_ads", "google_maps", "search_engines"]);
    const maps = report.channels.find((row) => row.channel === "google_maps");
    expect(maps).toMatchObject({ enquiries: 2, reachedCounselling: 2, admitted: 1, smallSample: true });
    expect(xOfYText(maps?.reachedCounselling ?? 0, maps?.enquiries ?? 0, "en")).toBe("2 of 2 (100 %)");
  });

  it("keeps an erased enquiry's referrer host and counts it (referrers and AI all signals)", () => {
    const ids = world();
    const kept = getDb().prepare("SELECT referrer_host FROM crm_lead_attribution WHERE lead_id = ?").get(ids.erasedAi);
    expect(kept?.referrer_host).toBe("perplexity.ai");
    expect(getDb().prepare("SELECT referrer FROM crm_leads WHERE id = ?").get(ids.erasedAi)?.referrer).toBeNull();
    const report = sourcesReport(admin, range30(), null, NOW);
    expect(report.referrers.rows).toContainEqual({ host: "perplexity.ai", enquiries: 1, ai: true });
    expect(report.referrers.rows.some((row) => row.host === "claude.ai")).toBe(false); // the test lead
    expect(report.ai.bySignal).toContainEqual({ key: "perplexity.ai", count: 1 });
  });

  it("counts each family once in the all-signals views (visit tag or referrer ∪ staff answer)", () => {
    world();
    const report = sourcesReport(admin, range30(), null, NOW);
    // Maps: gbp tag, maps referrer (+ heard google_maps), direct (heard google_maps only).
    expect(report.maps).toMatchObject({ enquiries: 3, fromVisit: 2, fromStaff: 2, both: 1, reachedCounselling: 2, admitted: 1 });
    expect(report.maps.bySignal).toEqual([
      { key: "maps.app.goo.gl", count: 1 },
      { key: MAPS_TAG_KEY, count: 1 },
    ]);
    // AI: chat.openai.com, utm chatgpt.com, Rancho lead tagged chatgpt (channel rancho), erased perplexity, walk-in told staff.
    expect(report.ai).toMatchObject({ enquiries: 5, fromVisit: 4, fromStaff: 1, both: 0, reachedCounselling: 1, admitted: 0 });
    expect(report.ai.bySignal.map((entry) => entry.key).sort()).toEqual(["chat.openai.com", "chatgpt", "chatgpt.com", "perplexity.ai"]);
  });

  it("builds campaigns (most common source / medium), referring hosts with AI flags, landing pages and how they heard", () => {
    world();
    const report = sourcesReport(admin, range30(), null, NOW);
    expect(report.campaigns.rows[0]).toMatchObject({ campaign: "diwali-jee", enquiries: 2, topSource: "google", topMedium: "cpc" });
    expect(report.campaigns.rows.map((row) => row.campaign)).toEqual(["diwali-jee", "gbp-shimla"]);
    expect(report.campaigns.untagged).toBe(21);
    expect(report.campaigns.other).toBeNull();
    expect(report.referrers.rows.find((row) => row.host === "chat.openai.com")?.ai).toBe(true);
    expect(report.referrers.rows.find((row) => row.host === "bing.com")?.ai).toBe(false);
    expect(report.referrers.none).toBe(report.total - report.referrers.rows.reduce((sum, row) => sum + row.enquiries, 0));
    expect(report.pages.rows).toEqual([
      { page: "/admissions", enquiries: 2 },
      { page: "/centres", enquiries: 2 },
    ]);
    expect(report.heard).toEqual([
      { key: "newspaper", enquiries: 1 },
      { key: "google_maps", enquiries: 2 },
      { key: "ai_assistant", enquiries: 1 },
      { key: "billboard_2027", enquiries: 1 },
      { key: null, enquiries: 19 },
    ]);
  });

  it("folds everything after the top 20 into Other", () => {
    for (let index = 0; index < 23; index += 1) capture({ context: { utmCampaign: `camp-${String(index).padStart(2, "0")}`, referrer: `site${index}.example.org`, page: `/p${index}` } });
    const report = sourcesReport(admin, range30(), null, NOW);
    expect(report.campaigns.rows).toHaveLength(20);
    expect(report.campaigns.other).toMatchObject({ enquiries: 3, distinct: 3 });
    expect(report.referrers.other).toEqual({ enquiries: 3, distinct: 3 });
    expect(report.pages.other).toEqual({ enquiries: 3, distinct: 3 });
  });

  it("writes rates as x of y even when y is 0, and shows Google Maps and AI rows at 0", () => {
    expect(funnel([])).toEqual({ enquiries: 0, reachedCounselling: 0, admitted: 0, smallSample: true });
    expect(xOfYText(0, 0, "en")).toBe("0 of 0");
    const report = sourcesReport(admin, range30(), null, NOW);
    expect(report.total).toBe(0);
    expect(report.channels.map((row) => row.channel)).toEqual(["google_maps", "ai_assistants"]);
    expect(report.heard).toEqual([]);
    expect(report.weekly.series).toEqual([]);
  });

  it("marks groups under 10 as a small sample", () => {
    for (let index = 0; index < 10; index += 1) capture({ context: { referrer: "wa.me" } });
    const report = sourcesReport(admin, range30(), null, NOW);
    expect(report.channels.find((row) => row.channel === "whatsapp")).toMatchObject({ enquiries: 10, smallSample: false });
    expect(report.channels.find((row) => row.channel === "google_maps")).toMatchObject({ enquiries: 0, smallSample: true });
  });

  it("limits area heads to their scope, and filters by the effective centre", () => {
    world();
    const head = makeStaff("head.shimla", "manager", ["shimla"]);
    const manager = viewerOf(head.id, "staff");
    const report = sourcesReport(manager, range30(), null, NOW);
    expect(report.total).toBe(3); // walk-in, gbp, maps referrer
    expect(report.tools.usage).toBeNull();
    const area = capture({ centreSlug: null, context: { referrer: "wa.me" } });
    sql("INSERT INTO crm_areas (id, name_en, name_hi, default_centre_slug, created_at, updated_at) VALUES ('north-zone', 'North', 'उत्तर', 'kullu', ?, ?)", NOW, NOW);
    upsertLeadRouting(getDb(), { leadId: area, areaId: "north-zone", match: "district", outcome: "area", placeInput: null, placeKey: null, gateOnly: false, routedAt: NOW, routedBy: null });
    expect(sourcesReport(admin, range30(), "kullu", NOW).total).toBe(1);
    expect(sourcesReport(admin, range30(), "shimla", NOW).total).toBe(3);
    expect(sourcesReport(admin, range30(), "none", NOW).total).toBe(21);
  });

  it("only counts enquiries created in the range", () => {
    capture({}, NOW - 31 * DAY);
    capture({}, NOW - 29 * DAY);
    expect(sourcesReport(admin, range30(), null, NOW).total).toBe(1);
    expect(sourcesReport(admin, presetRange("90d", NOW), null, NOW).total).toBe(2);
  });
});

describe("weekly trend (IST weeks from Monday 00:00)", () => {
  const row = (createdAt: number, overrides: Partial<OriginRow> = {}): OriginRow => ({
    createdAt,
    source: "admissions",
    tool: null,
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    page: null,
    stage: "new",
    furthestStage: "new",
    heardVia: null,
    erased: false,
    ...overrides,
  });

  it("puts Sunday 23:59 IST and Monday 00:00 IST in different weeks", () => {
    const range = customRange("2026-10-05", "2026-10-21", NOW) as SourceRange;
    const trend = weeklyTrend([row(istAt(2026, 10, 18, 23, 59)), row(istAt(2026, 10, 19, 0, 0)), row(istAt(2026, 10, 19, 0, 0), { referrer: "wa.me" })], range);
    expect(trend.weeks.map((week) => week.weekStart)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(trend.weeks.map((week) => week.total)).toEqual([0, 1, 2]);
    expect(trend.series).toEqual(["direct", "whatsapp"]);
    expect(trend.weeks[2].counts).toEqual({ direct: 1, whatsapp: 1 });
    // The range ends inside the current week (now), so that week is partial; a Monday start is not.
    expect(trend.weeks.map((week) => week.partial)).toEqual([false, false, true]);
    expect(trend.shownFromDay).toBeNull(); // the whole range is shown
  });

  it("shows at most the last 12 weeks and folds channels after the top 5 into Others", () => {
    const range = presetRange("session", NOW);
    const sources: Partial<OriginRow>[] = [
      { referrer: "wa.me" },
      { referrer: "example.org" },
      { utmCampaign: "x" },
      { referrer: "m.youtube.com" },
      { referrer: "bing.com" },
      { referrer: "chat.openai.com" },
      {},
    ];
    const rows = sources.flatMap((overrides, index) => Array.from({ length: index + 1 }, () => row(NOW - 2 * DAY, overrides)));
    rows.push(row(istAt(2026, 4, 2))); // older than the last 12 weeks: not in the trend
    const trend = weeklyTrend(rows, range);
    expect(trend.weeks).toHaveLength(12);
    expect(trend.weeks[0].partial).toBe(false);
    expect(trend.shownFromDay).toBe(trend.weeks[0].weekStart); // older weeks left out: the page says from when
    expect(trend.series).toEqual(["direct", "ai_assistants", "search_engines", "social", "campaign", "others"]);
    expect(trend.weeks[11].counts.others).toBe(1 + 2); // whatsapp 1 + other_websites 2
    expect(trend.weeks.reduce((sum, week) => sum + week.total, 0)).toBe(28);
  });
});

describe("Free tools & Rancho (§6.7)", () => {
  it("reads the contact-form status from the live lead-gate configuration", () => {
    expect(gateStatus()).toEqual({ mode: "off", offReason: "unset" });
    vi.stubEnv("LEAD_GATE", "optional");
    expect(gateStatus()).toEqual({ mode: "optional", offReason: null });
    vi.stubEnv("ENQUIRY_STORE", "off");
    expect(gateStatus()).toEqual({ mode: "off", offReason: "store_off" });
  });

  it("counts Rancho from the global key only, for today and yesterday", () => {
    const db = getDb();
    const today = istDayKey(NOW);
    const yesterday = istDayKey(NOW - DAY);
    const twoDaysAgo = istDayKey(NOW - 2 * DAY);
    const put = (hash: string, day: string, count: number) =>
      db.prepare("INSERT INTO ask_usage (key_hash, day, count, updated_at) VALUES (?, ?, ?, ?)").run(hash, day, count, NOW);
    put(usageKeyHash("global", "all", today), today, 5);
    put(usageKeyHash("global", "all", yesterday), yesterday, 3);
    put(usageKeyHash("global", "all", twoDaysAgo), twoDaysAgo, 9);
    put(usageKeyHash("ip", "198.51.100.7", today), today, 100);
    const days = toolUsage(admin, NOW);
    expect(days).toHaveLength(14);
    expect(days[13]).toMatchObject({ day: today, ranchoQuestions: 5 });
    expect(days[12]).toMatchObject({ day: yesterday, ranchoQuestions: 3 });
    expect(days.slice(0, 12).every((day) => day.ranchoQuestions === null)).toBe(true);
  });

  it("counts planner students once per day, saved mock tests, contact forms and tool uses noted", () => {
    const db = getDb();
    const students = ["s.one", "s.two"].map((loginId) => makeUser("student", loginId).id);
    const today = istDayKey(NOW);
    const yesterday = istDayKey(NOW - DAY);
    const plannerRow = db.prepare("INSERT INTO planner_daily (user_id, day, xp, blocks, reviews) VALUES (?, ?, 10, 1, 0)");
    plannerRow.run(students[0], today);
    plannerRow.run(students[1], today);
    plannerRow.run(students[0], yesterday);
    const attempt = (id: string, submittedAt: number) => {
      db.prepare(
        `INSERT INTO mocktest_attempts (id, user_id, test_id, window_id, client_attempt_id, answers, time_spent, score, max_score, correct, wrong, unattempted, time_taken_sec, started_at, submitted_at, created_at)
         VALUES (?, ?, 'jee-1', NULL, ?, '[]', '[]', 0, 300, 0, 0, 75, 60, ?, ?, ?)`,
      ).run(id, students[0], id, submittedAt - 60_000, submittedAt, submittedAt);
      db.prepare("INSERT INTO mocktest_attempt_meta (attempt_id, verify_id, server_submitted_at) VALUES (?, ?, ?)").run(id, `v-${id}`, submittedAt);
    };
    attempt("a1", istAt(2026, 10, 21, 0, 5));
    attempt("a2", istAt(2026, 10, 20, 23, 55));
    attempt("a3", istAt(2026, 10, 7, 12, 0)); // 14 days back: outside the card
    const gate = capture({ source: "tool", consent: { textVersion: "2026-10-21.gate.v1" }, context: { tool: "predictor" } }, NOW - HOUR);
    const toolUse = db.prepare("INSERT INTO crm_activities (lead_id, type, body, meta, actor_id, at) VALUES (?, 'tool_use', NULL, ?, NULL, ?)");
    toolUse.run(gate, JSON.stringify({ tool: "predictor", key: "jee-main", uses: 3 }), NOW - HOUR);
    toolUse.run(gate, JSON.stringify({ tool: "ask", key: "rancho", uses: 2 }), NOW - HOUR);
    toolUse.run(gate, JSON.stringify({ tool: "planner", key: "jee-main" }), NOW - DAY);

    const days = toolUsage(admin, NOW);
    const todayRow = days[13];
    expect(todayRow).toMatchObject({ day: today, plannerStudents: 2, mockTests: 1, contactNew: 1, contactKnown: 0, toolUses: 5, toolUsesByTool: { predictor: 3, ask: 2 } });
    expect(days[12]).toMatchObject({ day: yesterday, plannerStudents: 1, mockTests: 1, toolUses: 1, toolUsesByTool: { planner: 1 } });
    expect(days.reduce((sum, day) => sum + day.mockTests, 0)).toBe(2);

    const report = sourcesReport(admin, range30(), null, NOW);
    expect(report.tools.enquiriesByTool).toEqual([{ tool: "predictor", enquiries: 1 }]);
    expect(report.tools.usage?.days).toHaveLength(14);
  });
});

describe("search overview (/admin/search)", () => {
  it("counts search engines (channel), Google Maps and AI assistants (all signals) for 30 and 90 days", () => {
    world();
    capture({ context: { referrer: "www.google.com" } }, NOW - 60 * DAY);
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const overview = searchOverview(admin, NOW);
    expect(overview.hiddenFromSearch).toBe(true);
    expect(overview.periods.map((period) => period.days)).toEqual([30, 90]);
    expect(overview.periods[0]).toMatchObject({
      searchEngines: { enquiries: 2 },
      maps: { enquiries: 3, reachedCounselling: 2, admitted: 1 },
      ai: { enquiries: 5 },
    });
    expect(overview.periods[1].searchEngines.enquiries).toBe(3);
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect(searchOverview(admin, NOW).hiddenFromSearch).toBe(false);
  });
});

describe("pure sections", () => {
  it("keeps known answers in list order, then newer answers, then Not recorded", () => {
    const base = { createdAt: NOW, source: "x", page: null, stage: "new", furthestStage: "new", erased: false } as const;
    expect(heardRows([{ ...base, heardVia: "zzz" }, { ...base, heardVia: "poster" }, { ...base, heardVia: null }])).toEqual([
      { key: "poster", enquiries: 1 },
      { key: "zzz", enquiries: 1 },
      { key: null, enquiries: 1 },
    ]);
    expect(channelRows([]).map((row) => row.enquiries)).toEqual([0, 0]);
    expect(mapsSummary([]).enquiries).toBe(0);
    expect(aiSummary([{ ...base, heardVia: null, utmSource: "Claude.AI" }]).bySignal).toEqual([{ key: "claude.ai", count: 1 }]);
  });
});
