import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Role, Session } from "@/lib/auth/roles";
import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests, withTransaction } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { consoleFilterChips, EMPTY_FILTERS, parseBackParam, parseInboxFilters, toLeadFilters } from "@/components/crm/format";
import { messagesFor } from "@/i18n/messages";
import { leadFiltersFromSearch } from "../http";
import {
  addNote,
  captureLead,
  createTask,
  eraseLead,
  getLead,
  listLeads,
  logContact,
  resolveCrmViewer,
  writeStaffMembership,
  type CaptureLeadInput,
  type CaptureLeadOptions,
  type CrmRole,
  type CrmViewer,
  type LeadFilters,
} from "../index";
import { fail, leadScopeFor, ok } from "../access";
import { upsertLeadRouting } from "../repo/areas-core";
import { IMPORTED_SQL, TEST_LEAD_SQL, TOOL_SIGNUP_SQL } from "../repo/console-sql";
import { scopedLeadWhere } from "../repo/leads";
import { requireOk, runAtomic } from "./atomic";
import { CONSOLE_AUDIT, consoleAudit } from "./audit";
import { getCentreLinks, putCentreLinks, validateMapsUrl } from "./centre-links";
import { consoleCentres, titleCaseSlug, viewerCentreSlugs } from "./centres";
import { classifyChannel, gbpTaggedPath, hostMatches, isAiAssistantHost, isMapsSignal, normalizeHost, type ChannelInput } from "./channels";
import { countForFilters, inboxHref } from "./counts";
import { eraseConsoleData } from "./erase";
import { consoleHomeFor } from "./home";
import { currentSession, istDayStart, istWeekStart, isSessionKey, sessionOf, sessionRef, sessionsForPicker } from "./session";
import { consolePermissions, CHANNELS } from "./types";

// Admin console Phase 1b foundations (docs/admin-phase-1b-plan.md §3, §4, §6). A fresh in-memory
// database per test; synthetic people and numbers only.

const IST = (5 * 60 + 30) * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Wednesday 21 Oct 2026, 11:30 IST. */
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const istAt = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - IST;

let adminId: string;
let admin: CrmViewer;

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

let phoneCounter = 0;
function capture(overrides: Partial<CaptureLeadInput> = {}, at = NOW, options: CaptureLeadOptions = {}) {
  phoneCounter += 1;
  const result = captureLead(
    {
      source: "admissions",
      studentName: "Synthetic Student",
      phone: `90000${String(phoneCounter).padStart(5, "0")}`,
      consent: { textVersion: "2026-10-20.v2" },
      ...overrides,
    },
    at,
    options,
  );
  if (!result.ok) throw new Error(`capture failed: ${result.error}`);
  return result.leadId;
}

function area(id: string, defaultCentre: string | null, centres: string[] = []) {
  const db = getDb();
  db.prepare("INSERT INTO crm_areas (id, name_en, name_hi, default_centre_slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, `Area ${id}`, `क्षेत्र ${id}`, defaultCentre, NOW, NOW);
  for (const centre of centres) db.prepare("INSERT INTO crm_area_centres (centre_slug, area_id, created_at) VALUES (?, ?, ?)").run(centre, id, NOW);
}

function routeTo(leadId: string, areaId: string | null, gateOnly = false) {
  upsertLeadRouting(getDb(), { leadId, areaId, match: areaId ? "district" : null, outcome: areaId ? "area" : "empty", placeInput: null, placeKey: null, gateOnly, routedAt: NOW, routedBy: null });
}

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
describe("sessions and IST weeks (§4.2)", () => {
  it("splits sessions at 1 April 00:00 IST", () => {
    expect(sessionOf(istAt(2027, 3, 31, 23, 59))).toBe("S2026");
    expect(sessionOf(istAt(2027, 4, 1, 0, 0))).toBe("S2027");
    expect(sessionOf(istAt(2027, 4, 1, 0, 0) - 1)).toBe("S2026");
    // 31 Mar 20:00 UTC is already 1 April in India.
    expect(sessionOf(Date.UTC(2027, 2, 31, 20, 0))).toBe("S2027");
    expect(sessionRef("S2026")).toEqual({ key: "S2026", label: "2026–27", fromMs: istAt(2026, 4, 1), toMs: istAt(2027, 4, 1) });
    expect(sessionRef("S2099").label).toBe("2099–00");
    expect(currentSession(NOW).key).toBe("S2026");
    expect(sessionsForPicker(NOW).map((s) => s.key)).toEqual(["S2024", "S2025", "S2026", "S2027"]);
    expect(["S2026", "S2000"].every(isSessionKey)).toBe(true);
    expect(["S26", "2026", "S1999", "M2026-11", null, 2026].some(isSessionKey)).toBe(false);
  });

  it("starts days at 00:00 IST and weeks on Monday 00:00 IST", () => {
    expect(istDayStart(NOW)).toBe(istAt(2026, 10, 21));
    expect(istDayStart(istAt(2026, 10, 21) - 1)).toBe(istAt(2026, 10, 20));
    expect(istWeekStart(NOW)).toBe(istAt(2026, 10, 19));
    // Sunday 23:59 IST belongs to the week that started on the previous Monday.
    expect(istWeekStart(istAt(2026, 10, 18, 23, 59))).toBe(istAt(2026, 10, 12));
    expect(istWeekStart(istAt(2026, 10, 19, 0, 0))).toBe(istAt(2026, 10, 19));
    expect(istWeekStart(istAt(2026, 10, 25, 23, 59))).toBe(istAt(2026, 10, 19));
  });
});

// ---------------------------------------------------------------------------------------------
describe("channel classifier (§6.6)", () => {
  const web = (overrides: Partial<ChannelInput>): ChannelInput => ({ source: "hero", ...overrides });

  it.each<[string, ChannelInput, (typeof CHANNELS)[number]]>([
    ["Meta lead form", { source: "meta_lead_ad" }, "meta_ads"],
    ["utm_medium=lead_ad", web({ utmMedium: "lead_ad", utmSource: "facebook" }), "meta_ads"],
    ["scholarship test (Phase 2)", { source: "scholarship_test" }, "scholarship_test"],
    ["imported list", { source: "csv_import", referrer: "chatgpt.com" }, "imported_list"],
    ["paper form (Phase 2)", { source: "paper_form" }, "paper_forms"],
    ["walk-in", { source: "walk_in" }, "walk_in"],
    ["phone call", { source: "phone_call" }, "phone_call"],
    ["referral", { source: "referral" }, "referral"],
    ["staff other", { source: "other" }, "staff_other"],
    ["Rancho (ask)", { source: "tool", tool: "ask" }, "rancho"],
    ["free tool", { source: "tool", tool: "predictor", referrer: "chatgpt.com" }, "free_tools"],
    ["tool set on a form", web({ tool: "mock-test" }), "free_tools"],
    ["utm_medium=gbp", web({ utmMedium: "gbp", referrer: "chatgpt.com" }), "google_maps"],
    ["utm_source=gmb", web({ utmSource: "GMB" }), "google_maps"],
    ["utm_campaign=gbp-shimla", web({ utmCampaign: "gbp-shimla" }), "google_maps"],
    ["maps.app.goo.gl", web({ referrer: "maps.app.goo.gl" }), "google_maps"],
    ["g.page", web({ referrer: "g.page" }), "google_maps"],
    ["chat.openai.com", web({ referrer: "chat.openai.com" }), "ai_assistants"],
    ["chatgpt.com with a port", web({ referrer: "chatgpt.com:443" }), "ai_assistants"],
    ["a subdomain of perplexity.ai", web({ referrer: "www.perplexity.ai" }), "ai_assistants"],
    ["utm_source=chatgpt.com", web({ utmSource: "chatgpt.com", utmCampaign: "x" }), "ai_assistants"],
    ["utm_medium=cpc", web({ utmMedium: "cpc", utmSource: "google" }), "paid_ads"],
    ["utm_source=ig", web({ utmSource: "ig" }), "facebook_instagram"],
    ["l.facebook.com", web({ referrer: "l.facebook.com" }), "facebook_instagram"],
    ["www.google.co.in", web({ referrer: "www.google.co.in" }), "search_engines"],
    ["google.com", web({ referrer: "google.com" }), "search_engines"],
    ["bing.com", web({ referrer: "www.bing.com" }), "search_engines"],
    ["yandex.ru", web({ referrer: "yandex.ru" }), "search_engines"],
    ["wa.me", web({ referrer: "wa.me" }), "whatsapp"],
    ["utm_source=whatsapp", web({ utmSource: "whatsapp" }), "whatsapp"],
    ["m.youtube.com", web({ referrer: "m.youtube.com" }), "social"],
    ["t.co", web({ referrer: "t.co" }), "social"],
    ["a campaign tag only", web({ utmCampaign: "jee-2027" }), "campaign"],
    ["another website", web({ referrer: "news.example.org" }), "other_websites"],
    ["nothing", web({}), "direct"],
  ])("%s", (_name, row, channel) => {
    expect(classifyChannel(row)).toBe(channel);
  });

  it("matches hosts exactly or as subdomains, port stripped; tags the GBP link", () => {
    expect(normalizeHost("HTTPS://Chat.OpenAI.com:8443/c/abc?x=1")).toBe("chat.openai.com");
    expect(normalizeHost("maps.app.goo.gl/xyz")).toBe("maps.app.goo.gl");
    expect(normalizeHost("")).toBeNull();
    expect(hostMatches("a.b.claude.ai", ["claude.ai"])).toBe(true);
    expect(hostMatches("notclaude.ai", ["claude.ai"])).toBe(false);
    expect(hostMatches("claude.ai.evil.com", ["claude.ai"])).toBe(false);
    expect(isAiAssistantHost("gemini.google.com")).toBe(true);
    expect(isAiAssistantHost("www.google.com")).toBe(false);
    expect(isMapsSignal({ source: "tool", utmMedium: "maps" })).toBe(true);
    expect(classifyChannel({ source: "hero", referrer: "maps.google.com" })).toBe("google_maps");
    expect(gbpTaggedPath("shimla")).toBe("/centres?utm_source=google&utm_medium=gbp&utm_campaign=gbp-shimla");
    expect(CHANNELS.at(-1)).toBe("direct");
  });
});

// ---------------------------------------------------------------------------------------------
// A fixture inbox: 9 leads across centres, areas, tool sign-ups, an import and an erased lead.

interface World {
  today: string;
  calledYesterday: string;
  areaNoCentre: string;
  signupInArea: string;
  signupUnrouted: string;
  oldSignupNoRow: string;
  noCentre: string;
  imported: string;
  erased: string;
}

function world(): World {
  const gate = { textVersion: "2026-10-21.gate.v1" };
  const today = capture({ centreSlug: "shimla" }, NOW);
  const calledYesterday = capture({ centreSlug: "shimla" }, NOW - 30 * HOUR);
  const areaNoCentre = capture({ centreSlug: null }, NOW - 3 * DAY);
  const signupInArea = capture({ source: "tool", consent: gate, centreSlug: "shimla" }, NOW - 2 * HOUR, { gate: true });
  const signupUnrouted = capture({ source: "tool", consent: gate, centreSlug: null }, NOW - HOUR, { gate: true });
  const oldSignupNoRow = capture({ source: "tool", consent: gate, centreSlug: null }, NOW - 10 * DAY, { gate: true });
  const noCentre = capture({ source: "contact", centreSlug: null }, NOW - 10 * 60_000);
  const imported = capture({ centreSlug: "hamirpur" }, NOW - 40 * HOUR);
  const erased = capture({ centreSlug: "shimla", context: { referrer: "chatgpt.com" } }, NOW - 5 * HOUR);
  const db = getDb();
  area("north-zone", "north-centre", ["north-centre"]);
  routeTo(areaNoCentre, "north-zone");
  routeTo(noCentre, null);
  routeTo(signupUnrouted, null, true);
  db.prepare("DELETE FROM crm_lead_routing WHERE lead_id = ?").run(oldSignupNoRow);
  db.prepare("UPDATE crm_leads SET source = 'csv_import' WHERE id = ?").run(imported);
  const called = logContact(admin, calledYesterday, { channel: "call", outcome: "no_answer" }, NOW - 29 * HOUR);
  if (!called.ok) throw new Error("log failed");
  const gone = eraseLead(admin, erased, NOW - HOUR, { reason: "wrong_or_test" });
  if (!gone.ok) throw new Error("erase failed");
  return { today, calledYesterday, areaNoCentre, signupInArea, signupUnrouted, oldSignupNoRow, noCentre, imported, erased };
}

const inboxIds = (viewer: CrmViewer, filters: LeadFilters = {}) =>
  listLeads(viewer, filters, { pageSize: 100 }, NOW)
    .items.map((lead) => lead.id)
    .sort();

const inboxTotal = (viewer: CrmViewer, filters: LeadFilters) => listLeads(viewer, filters, { pageSize: 100 }, NOW).total;

describe("scopedLeadWhere and the console SQL fragments (§4.2)", () => {
  it("returns the same leads as the inbox for every scope kind", () => {
    const w = world();
    const legacyHead = makeStaff("head.shimla", "manager", ["shimla"]);
    const areaHead = makeStaff("head.north", "manager");
    getDb().prepare("INSERT INTO crm_area_members (area_id, user_id, created_at) VALUES ('north-zone', ?, ?)").run(areaHead.id, NOW);
    getDb().prepare("INSERT INTO crm_staff_scope (user_id, mode, set_at) VALUES (?, 'areas', ?)").run(areaHead.id, NOW);
    const counsellor = makeStaff("couns.one", "counsellor");
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id IN (?, ?)").run(counsellor.id, w.today, w.noCentre);

    const viewers = [admin, viewerOf(legacyHead.id, "staff"), viewerOf(areaHead.id, "staff"), viewerOf(counsellor.id, "staff")];
    expect(viewers.map((viewer) => leadScopeFor(viewer).kind)).toEqual(["all", "centres", "areas", "assigned"]);
    for (const viewer of viewers) {
      const { sql, values } = scopedLeadWhere(leadScopeFor(viewer));
      const ids = getDb()
        .prepare(`SELECT l.id FROM crm_leads l WHERE ${sql} AND l.erased_at IS NULL ORDER BY l.id`)
        .all(...values)
        .map((row) => String(row.id))
        .sort();
      expect(ids, viewer.role).toEqual(inboxIds(viewer));
    }
    expect(scopedLeadWhere({ kind: "all" })).toEqual({ sql: "1=1", values: [] });
    expect(inboxIds(viewerOf(areaHead.id, "staff"))).toEqual([w.areaNoCentre]);
    expect(inboxIds(viewerOf(counsellor.id, "staff"))).toEqual([w.noCentre, w.today].sort());
  });

  it("finds tool sign-ups (routed, unrouted, older without a routing row), imports and test leads", () => {
    const w = world();
    const select = (condition: string) =>
      getDb()
        .prepare(`SELECT l.id FROM crm_leads l WHERE ${condition} ORDER BY l.id`)
        .all()
        .map((row) => String(row.id))
        .sort();
    expect(select(TOOL_SIGNUP_SQL)).toEqual([w.signupInArea, w.signupUnrouted, w.oldSignupNoRow].sort());
    expect(select(IMPORTED_SQL)).toEqual([w.imported]);
    expect(select(TEST_LEAD_SQL)).toEqual([w.erased]);
  });

  it("a tool lead with no consent version and no routing row is not a sign-up, and signups=hide keeps it", () => {
    world();
    const before = countForFilters(admin, { signups: "hide" }, NOW);
    const bare = capture({ source: "tool", centreSlug: null }, NOW - HOUR);
    getDb().prepare("DELETE FROM crm_lead_routing WHERE lead_id = ?").run(bare);
    getDb().prepare("UPDATE crm_leads SET consent_text_version = NULL WHERE id = ?").run(bare);
    const flag = getDb().prepare(`SELECT ${TOOL_SIGNUP_SQL} AS v FROM crm_leads l WHERE l.id = ?`).get(bare)?.v;
    expect(flag).toBe(0);
    expect(countForFilters(admin, { signups: "hide" }, NOW)).toBe(before + 1);
    expect(inboxIds(admin, { signups: "hide" })).toContain(bare);
  });
});

describe("countForFilters equals the inbox total (§4.2, §4.3, §10.2)", () => {
  /** `null`: only "equals the inbox" (the count depends on lead routing's automatic retry task). */
  const cases: [string, LeadFilters, number | null][] = [
    ["contact=none", { contact: "none" }, 7],
    ["signups=hide", { signups: "hide" }, 5],
    ["created=today", { created: "today" }, 4],
    ["created=week", { created: "week" }, 6],
    ["created=over24h", { created: "over24h" }, 4],
    ["not yet called", { stage: "new", contact: "none", signups: "hide" }, 4],
    ["not yet called, over 24 h", { stage: "new", contact: "none", signups: "hide", created: "over24h" }, 2],
    ["centre=shimla", { centre: "shimla" }, 3],
    ["centre=north-centre (area-routed, no centre of its own)", { centre: "north-centre" }, 1],
    ["centre=none", { centre: "none" }, 3],
    ["overdue follow-ups", { due: "overdue", stage: "open" }, null],
    ["tool sign-up queue (LR)", { area: "tool_signups", stage: "open" }, 1],
  ];

  it.each(cases)("%s", (_name, filters, expected) => {
    world();
    const counted = countForFilters(admin, filters, NOW);
    expect(counted).toBe(inboxTotal(admin, filters));
    if (expected !== null) expect(counted).toBe(expected);
  });

  it("counts within the viewer's scope and splits by effective centre or assignee", () => {
    const w = world();
    const head = makeStaff("head.north", "manager");
    getDb().prepare("INSERT INTO crm_area_members (area_id, user_id, created_at) VALUES ('north-zone', ?, ?)").run(head.id, NOW);
    getDb().prepare("INSERT INTO crm_staff_scope (user_id, mode, set_at) VALUES (?, 'areas', ?)").run(head.id, NOW);
    const manager = viewerOf(head.id, "staff");
    expect(countForFilters(manager, { contact: "none" }, NOW)).toBe(inboxTotal(manager, { contact: "none" }));
    expect(countForFilters(manager, { centre: "north-centre" }, NOW)).toBe(1);
    expect(countForFilters(manager, { centre: "shimla" }, NOW)).toBe(0);

    const byCentre = countForFilters(admin, { created: "week" }, NOW, "centre");
    expect(byCentre).toEqual([
      { key: "shimla", count: 3 },
      { key: null, count: 2 },
      { key: "hamirpur", count: 1 },
    ]);
    for (const row of byCentre) expect(countForFilters(admin, { created: "week", centre: row.key ?? "none" }, NOW)).toBe(row.count);
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(adminId, w.today);
    const byAssignee = countForFilters(admin, { created: "today" }, NOW, "assignee");
    expect(byAssignee.reduce((sum, row) => sum + row.count, 0)).toBe(4);
    expect(byAssignee.find((row) => row.key === adminId)?.count).toBe(1);
  });

  it("round-trips every console filter through its link (inboxHref ↔ leadFiltersFromSearch and the inbox URL parser)", () => {
    const filters: LeadFilters[] = [
      { created: "today" },
      { created: "week", centre: "shimla" },
      { stage: "new", contact: "none", signups: "hide" },
      { stage: "new", contact: "none", signups: "hide", created: "over24h", centre: "none" },
      { due: "overdue", stage: "open", assignee: "u_abc123" },
      { assignee: "unassigned", stage: "open", signups: "hide" },
      { area: "tool_signups", stage: "open" },
    ];
    for (const f of filters) {
      const href = inboxHref(f);
      expect(href.startsWith("/crm?")).toBe(true);
      expect(leadFiltersFromSearch(new URL(href, "https://aspire.invalid").searchParams)).toEqual(f);
      // The Enquiries PAGE reads the very filters that were counted (plus its default sort).
      const parsed = parseInboxFilters(new URL(href, "https://aspire.invalid").searchParams);
      expect(toLeadFilters(parsed)).toEqual({ ...f, sort: "recent_activity" });
    }
    expect(inboxHref({})).toBe("/crm");
  });

  it("list rows carry the effective centre the centre filter compared", () => {
    const w = world();
    const rows = listLeads(admin, { centre: "north-centre" }, { pageSize: 100 }, NOW).items;
    expect(rows.map((row) => [row.id, row.centreSlug, row.effectiveCentreSlug])).toEqual([[w.areaNoCentre, null, "north-centre"]]);
    const all = listLeads(admin, {}, { pageSize: 100 }, NOW).items;
    for (const row of all) expect(row.effectiveCentreSlug, row.id).toBe(row.centreSlug ?? (row.id === w.areaNoCentre ? "north-centre" : null));
    expect(listLeads(admin, { centre: "none" }, { pageSize: 100 }, NOW).items.every((row) => row.effectiveCentreSlug === null)).toBe(true);
  });

  it("linked numbers count live leads only: includeErased and sort never reach a link or a count", () => {
    world();
    expect(inboxHref({ stage: "new", includeErased: true, sort: "newest" })).toBe("/crm?stage=new");
    expect(countForFilters(admin, { includeErased: true }, NOW)).toBe(inboxTotal(admin, {}));
    expect(countForFilters(admin, { includeErased: true }, NOW)).toBeLessThan(inboxTotal(admin, { includeErased: true }));
    expect(countForFilters(admin, { includeErased: true }, NOW, "centre").reduce((sum, row) => sum + row.count, 0)).toBe(inboxTotal(admin, {}));
  });
});

// ---------------------------------------------------------------------------------------------
describe("runAtomic (§4.2)", () => {
  const notes = (leadId: string) => getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type = 'note'").get(leadId)?.n;
  const tasks = (leadId: string) => getDb().prepare("SELECT COUNT(*) AS n FROM crm_tasks WHERE lead_id = ?").get(leadId)?.n;

  it("commits when every step succeeds", () => {
    const leadId = capture();
    const result = runAtomic(getDb(), () => {
      requireOk(addNote(admin, leadId, "First", NOW));
      return ok(requireOk(createTask(admin, leadId, { title: "Call back", dueAt: NOW + DAY }, NOW)).id);
    });
    expect(result.ok).toBe(true);
    expect(notes(leadId)).toBe(1);
    expect(tasks(leadId)).toBe(1);
  });

  it("rolls every earlier step back on a failed step, a returned failure or a thrown error", () => {
    const leadId = capture();
    const failed = runAtomic(getDb(), () => {
      requireOk(addNote(admin, leadId, "Kept?", NOW));
      requireOk(createTask(admin, leadId, { title: "Call back", dueAt: NOW + DAY }, NOW));
      requireOk(logContact(admin, leadId, { channel: "call", outcome: "nonsense" as never }, NOW));
      return ok(true);
    });
    expect(failed).toMatchObject({ ok: false, error: "validation" });
    expect(notes(leadId)).toBe(0);
    expect(tasks(leadId)).toBe(0);

    const returned = runAtomic(getDb(), () => {
      addNote(admin, leadId, "Kept?", NOW);
      return fail("conflict", "Stop here.");
    });
    expect(returned).toEqual({ ok: false, error: "conflict", message: "Stop here." });
    expect(notes(leadId)).toBe(0);

    expect(() =>
      runAtomic(getDb(), () => {
        addNote(admin, leadId, "Kept?", NOW);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(notes(leadId)).toBe(0);
    expect(getDb().isTransaction).toBe(false);
  });

  it("inside an outer transaction, rolls back only its own writes (savepoint)", () => {
    const leadId = capture();
    withTransaction(getDb(), () => {
      addNote(admin, leadId, "Outer", NOW);
      const inner = runAtomic(getDb(), () => {
        addNote(admin, leadId, "Inner", NOW);
        return fail("validation", "No.");
      });
      expect(inner.ok).toBe(false);
    });
    expect(notes(leadId)).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("erase keeps the referrer host, wipes personal details and keeps template meta (§3)", () => {
  it("eraseLead calls eraseConsoleData before the referrer is wiped", () => {
    const leadId = capture({ context: { referrer: "https://chatgpt.com/c/abc" } });
    const db = getDb();
    db.prepare(
      `INSERT INTO crm_lead_details (lead_id, alt_phone_e164, school, board, referred_by, heard_via, intake_session, preferred_time, updated_at)
       VALUES (?, '+919000099999', 'Synthetic School', 'cbse', 'An old student', 'ai_assistant', 'S2026', 'evening', ?)`,
    ).run(leadId, NOW);
    const sent = logContact(admin, leadId, { channel: "whatsapp", outcome: "message_sent", extra: { template: "missed_call", lang: "hi" } }, NOW);
    expect(sent.ok).toBe(true);
    expect(eraseLead(admin, leadId, NOW + HOUR, { reason: "family_request" }).ok).toBe(true);

    expect(db.prepare("SELECT referrer FROM crm_leads WHERE id = ?").get(leadId)).toEqual({ referrer: null });
    expect(db.prepare("SELECT referrer_host, kept_at FROM crm_lead_attribution WHERE lead_id = ?").get(leadId)).toEqual({ referrer_host: "chatgpt.com", kept_at: NOW + HOUR });
    expect(db.prepare("SELECT alt_phone_e164, school, referred_by, board, heard_via, intake_session, preferred_time FROM crm_lead_details WHERE lead_id = ?").get(leadId)).toEqual({
      alt_phone_e164: null,
      school: null,
      referred_by: null,
      board: "cbse",
      heard_via: "ai_assistant",
      intake_session: "S2026",
      preferred_time: "evening",
    });
    const lead = getLead(admin, leadId, NOW + HOUR, { audit: false });
    if (!lead.ok) throw new Error("lead missing");
    expect(lead.data.activities.find((activity) => activity.type === "whatsapp")?.meta).toEqual({ outcome: "message_sent", template: "missed_call", lang: "hi" });
  });

  it("is idempotent and writes no attribution without a referrer", () => {
    const leadId = capture();
    eraseConsoleData(getDb(), { id: leadId, referrer: null }, NOW);
    eraseConsoleData(getDb(), { id: leadId, referrer: "claude.ai" }, NOW);
    eraseConsoleData(getDb(), { id: leadId, referrer: "claude.ai" }, NOW + 1);
    expect(getDb().prepare("SELECT referrer_host, kept_at FROM crm_lead_attribution").all()).toEqual([{ referrer_host: "claude.ai", kept_at: NOW + 1 }]);
  });
});

describe("logContact extra (§4.2)", () => {
  it("stores template and lang in the activity meta and the template in the audit row, never the text", () => {
    const leadId = capture();
    const result = logContact(admin, leadId, { channel: "whatsapp", outcome: "message_sent", extra: { template: "first_contact", lang: "hinglish" } }, NOW);
    if (!result.ok) throw new Error("log failed");
    expect(result.data.meta).toEqual({ outcome: "message_sent", template: "first_contact", lang: "hinglish" });
    const audit = listAudit(getDb(), { limit: 5 }).find((entry) => entry.action === "crm.contact_log");
    expect(audit?.details).toEqual({ channel: "whatsapp", outcome: "message_sent", template: "first_contact" });
    const plain = logContact(admin, leadId, { channel: "call", outcome: "busy" }, NOW + 1);
    expect(plain.ok && plain.data.meta).toEqual({ outcome: "busy" });
    expect(logContact(admin, leadId, { channel: "whatsapp", outcome: "message_sent", extra: { template: "Bad Key!" } }, NOW)).toMatchObject({
      ok: false,
      fieldErrors: { template: expect.any(Array) },
    });
    expect(logContact(admin, leadId, { channel: "whatsapp", outcome: "message_sent", extra: { lang: "fr" as never } }, NOW)).toMatchObject({
      ok: false,
      fieldErrors: { lang: expect.any(Array) },
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("centres (§4.2, O1)", () => {
  it("unions website centres, area centres, area default centres and lead centres", async () => {
    capture({ centreSlug: "zz-lead-centre" });
    area("north-zone", "north-default", ["north-centre"]);
    const centres = await consoleCentres(getDb(), "en");
    const slugs = centres.map((centre) => centre.slug);
    for (const slug of ["north-centre", "north-default", "zz-lead-centre"]) expect(slugs).toContain(slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(centres.find((centre) => centre.slug === "zz-lead-centre")).toEqual({ slug: "zz-lead-centre", label: "Zz Lead Centre", demo: true });
    expect(titleCaseSlug("dharamshala_west-2")).toBe("Dharamshala West 2");
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect((await consoleCentres(getDb(), "hi")).every((centre) => centre.demo === false)).toBe(true);
  });

  it("gives a manager the centres of their areas plus the areas' serving centres", () => {
    capture();
    area("north-zone", "north-default", ["north-centre"]);
    const head = makeStaff("head.north", "manager");
    getDb().prepare("INSERT INTO crm_area_members (area_id, user_id, created_at) VALUES ('north-zone', ?, ?)").run(head.id, NOW);
    getDb().prepare("INSERT INTO crm_staff_scope (user_id, mode, set_at) VALUES (?, 'areas', ?)").run(head.id, NOW);
    expect(viewerCentreSlugs(getDb(), viewerOf(head.id, "staff"))).toEqual(["north-centre", "north-default"]);
    expect(viewerCentreSlugs(getDb(), admin)).toBeNull();
    const legacy = makeStaff("head.legacy", "manager", ["shimla"]);
    expect(viewerCentreSlugs(getDb(), viewerOf(legacy.id, "staff"))).toEqual(["shimla"]);
    expect(viewerCentreSlugs(getDb(), viewerOf(makeStaff("head.all", "manager").id, "staff"))).toBeNull();
  });
});

describe("centre links (§3, §5.J)", () => {
  it("accepts only https Google Maps links", () => {
    for (const good of [
      "https://maps.app.goo.gl/AbC123",
      "https://goo.gl/maps/xyz",
      "https://g.page/r/abc",
      "https://maps.google.com/?cid=1",
      "https://www.google.com/maps/place/Aspire",
      "https://google.com/maps",
    ]) {
      expect(validateMapsUrl(good), good).not.toBeNull();
    }
    for (const bad of [
      "http://maps.app.goo.gl/x",
      "https://evil.example/maps",
      "https://www.google.com/search?q=aspire",
      "https://maps.app.goo.gl.evil.example/x",
      "https://user:secret@maps.app.goo.gl/x",
      "https://maps.app.goo.gl:8443/x",
      "javascript:alert(1)",
      `https://maps.app.goo.gl/${"x".repeat(290)}`,
      "",
      null,
    ]) {
      expect(validateMapsUrl(bad), String(bad)).toBeNull();
    }
  });

  it("saves with an optimistic version and audits counts only", () => {
    const db = getDb();
    expect(getCentreLinks(db)).toMatchObject({ version: 0, value: { centres: {} }, isDefault: true });
    const saved = putCentreLinks(db, { centres: { shimla: { mapsUrl: "https://maps.app.goo.gl/AbC123" }, kullu: { mapsUrl: null } } }, { actorId: adminId, expectedVersion: 0, now: NOW });
    expect(saved).toMatchObject({ ok: true, data: { version: 1, value: { centres: { shimla: { mapsUrl: "https://maps.app.goo.gl/AbC123" }, kullu: { mapsUrl: null } } } } });
    expect(putCentreLinks(db, { centres: {} }, { actorId: adminId, expectedVersion: 0, now: NOW })).toMatchObject({ ok: false, error: "conflict" });
    expect(putCentreLinks(db, { centres: { shimla: { mapsUrl: "https://evil.example" } } }, { actorId: adminId, expectedVersion: 1, now: NOW })).toMatchObject({
      ok: false,
      error: "validation",
      fieldErrors: { "centres.shimla.mapsUrl": expect.any(Array) },
    });
    expect(putCentreLinks(db, { centres: { "Bad Slug": { mapsUrl: null } } }, { actorId: adminId, expectedVersion: 1, now: NOW })).toMatchObject({ ok: false });
    expect(getCentreLinks(db)).toMatchObject({ version: 1, isDefault: false });
    const audit = listAudit(db, { limit: 10 }).filter((entry) => entry.action.startsWith("settings.") || entry.action === "crm.settings_update");
    expect(audit).toEqual([expect.objectContaining({ action: "settings.centre_links_update", target: "centre_links", details: { centres: 1, version: 1 } })]);
  });
});

describe("console audit (§9)", () => {
  it("joins lists, drops keys that could carry personal data and writes the known codes", () => {
    consoleAudit(getDb(), {
      actorId: adminId,
      action: CONSOLE_AUDIT.leadDetailsUpdate,
      target: "lead-1",
      details: { fields: ["details.school", "details.board"], phone: "+919000000001", referrerUrl: "https://x", token: "t" },
      now: NOW,
    });
    expect(listAudit(getDb(), { limit: 1 })[0]).toMatchObject({ action: "crm.lead_details_update", details: { fields: "details.school,details.board" } });
    expect(Object.values(CONSOLE_AUDIT).sort()).toEqual([
      "crm.duplicate_dismiss",
      "crm.lead_details_update",
      "crm.lost_review",
      "settings.centre_links_update",
      "settings.targets_update",
      "settings.template_status",
      "settings.template_update",
      "settings.wa_links_update",
    ]);
  });
});

describe("role homes (§5.A)", () => {
  it("sends each role to its home", () => {
    const db = getDb();
    const session = (userId: string, role: Role, extra: Partial<Session> = {}): Session => ({ userId, role, displayName: "x", ...extra });
    const manager = makeStaff("head.one", "manager");
    const counsellor = makeStaff("couns.one", "counsellor");
    const qbOnly = makeUser("staff", "qb.only");
    const qbInactive = makeUser("staff", "qb.inactive");
    const bare = makeUser("staff", "staff.bare");
    const insertQb = db.prepare("INSERT INTO qb_members (user_id, qb_role, subjects, active, created_at, updated_at) VALUES (?, 'author', '[]', ?, ?, ?)");
    insertQb.run(qbOnly.id, 1, NOW, NOW);
    insertQb.run(qbInactive.id, 0, NOW, NOW);
    insertQb.run(counsellor.id, 1, NOW, NOW);

    expect(consoleHomeFor(session(adminId, "admin"), db)).toEqual({ kind: "home", path: "/admin" });
    expect(consoleHomeFor(session(manager.id, "staff"), db)).toEqual({ kind: "home", path: "/crm/dashboard" });
    // A CRM membership wins over a question-bank membership.
    expect(consoleHomeFor(session(counsellor.id, "staff"), db)).toEqual({ kind: "home", path: "/crm/today" });
    expect(consoleHomeFor(session(qbOnly.id, "staff"), db)).toEqual({ kind: "home", path: "/admin/questions" });
    expect(consoleHomeFor(session(qbInactive.id, "staff"), db)).toEqual({ kind: "home", path: "/crm" });
    expect(consoleHomeFor(session(bare.id, "staff"), db)).toEqual({ kind: "home", path: "/crm" });
    expect(consoleHomeFor(session("u_student", "student"), db)).toEqual({ kind: "home", path: "/student" });
    expect(consoleHomeFor(session("u_parent", "parent"), db)).toEqual({ kind: "home", path: "/parent" });
    expect(consoleHomeFor(session(manager.id, "staff", { mustChangePassword: true }), db)).toEqual({ kind: "change_password" });
    expect(consoleHomeFor(null, db)).toEqual({ kind: "signed_out" });
  });
});

describe("console permissions (§4.1, §7)", () => {
  it("derives the matrix from the CRM role and the super-admin grant", () => {
    const of = (role: CrmViewer["role"], isSuperAdmin = false) => consolePermissions({ role }, { isSuperAdmin });
    expect(of("counsellor")).toEqual({
      canViewNumbers: false,
      canEditTargets: false,
      canViewTargets: false,
      canViewSources: false,
      canSeeToolUsage: false,
      canEditCentreLinks: false,
      canReviewLost: false,
      canManageTemplates: false,
      canViewTemplateAdmin: false,
      canEditDetails: true,
    });
    expect(of("manager")).toMatchObject({ canViewNumbers: true, canViewTargets: true, canViewSources: true, canReviewLost: true, canViewTemplateAdmin: true, canSeeToolUsage: false, canEditTargets: false });
    expect(of("admin")).toMatchObject({ canSeeToolUsage: true, canEditTargets: false, canManageTemplates: false, canEditCentreLinks: false });
    expect(of("admin", true)).toMatchObject({ canEditTargets: true, canManageTemplates: true, canEditCentreLinks: true });
    // A grant flag on a non-admin never makes a super admin.
    expect(of("manager", true).canEditTargets).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
describe("privacy in URLs (§1.2 rule 11)", () => {
  const PHONE_RUN = /\d{10}/;

  it("link builders never carry a 10-digit run or an @", () => {
    const t = messagesFor("en", "crm");
    const hostile: LeadFilters = { q: "9876500001 family@example.com", createdFrom: "2026-10-01", createdTo: "2026-10-21", stage: "new", centre: "shimla", created: "week", contact: "none", signups: "hide" };
    const outputs = [
      inboxHref(hostile),
      inboxHref({ assignee: "u_abc123", due: "overdue", stage: "open" }),
      gbpTaggedPath("shimla"),
      parseBackParam("/crm/admissions?session=S2026&centre=shimla&q=9876500001&email=family@example.com")?.path ?? "",
      parseBackParam("/crm/lost?days=14&assignee=u_abc123&phone=9876500001")?.path ?? "",
      parseBackParam("/crm/dashboard?area=kangra&from=2026-10-01&to=2026-10-21&note=a@b.c")?.path ?? "",
      ...consoleFilterChips(t, { ...EMPTY_FILTERS, contact: "none", signups: "hide", created: "today", stage: "new" }).map((chip) => chip.removeQuery),
    ];
    for (const output of outputs) {
      expect(output, output).not.toMatch(PHONE_RUN);
      expect(output, output).not.toContain("@");
      expect(output, output).not.toContain("%40");
    }
    expect(inboxHref(hostile)).toBe("/crm?stage=new&centre=shimla&contact=none&signups=hide&created=week");
  });

  it("the one exception: a chip's remove link keeps the viewer's own current search (`q`) and adds nothing else", () => {
    // Chip links only ever point at the SAME inbox page the viewer is on, whose URL already carries
    // the `q` they typed into its GET search form (as the inbox's pagination links do). They add no
    // other text, and 1B-FAMILY must not reuse a chip href outside the inbox.
    const t = messagesFor("en", "crm");
    const current = { ...EMPTY_FILTERS, q: "9876500001", contact: "none" as const, signups: "hide" as const };
    const chips = consoleFilterChips(t, current);
    expect(chips.map((chip) => chip.removeQuery)).toEqual(["?q=9876500001&signups=hide", "?q=9876500001&contact=none"]);
    for (const chip of chips) {
      const params = new URLSearchParams(chip.removeQuery);
      expect(params.get("q")).toBe(current.q);
      expect([...params.keys()].every((key) => key === "q" || key === "contact" || key === "signups")).toBe(true);
    }
    // Without a search, no chip link carries any typed text.
    for (const chip of consoleFilterChips(t, { ...current, q: "" })) expect(new URLSearchParams(chip.removeQuery).has("q")).toBe(false);
  });
});
