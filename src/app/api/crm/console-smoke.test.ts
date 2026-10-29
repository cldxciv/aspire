import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Admin console 1b, integrate stage (docs/admin-phase-1b-plan.md §14.6): one smoke story over the
// REAL route handlers on a temporary database FILE (AUTH_DB_PATH), deleted afterwards. Only the
// session lookup is stubbed (no cookies / scrypt). The clock is fixed at Wed 21 Oct 2026 11:30 IST
// (inside the default calling hours) and moved forward by hand. Synthetic people and numbers only.
const session = vi.hoisted(() => ({ current: null as null | { userId: string; role: "admin" | "staff"; displayName: string } }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<object>()),
  getSession: vi.fn(async () => session.current),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
  after: vi.fn(() => undefined),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { insertUser } = await import("@/lib/db/users");
const { ensureSuperAdminBootstrap, isSuperAdmin } = await import("@/lib/auth/super-admin");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { assignLead, captureLead, createTask, eraseLead, resolveCrmViewer } = await import("@/lib/crm");
const { consoleNumbers } = await import("@/lib/crm/console/dashboard/numbers");
const { needsAttention } = await import("@/lib/crm/console/dashboard/attention");
const { offerNotReachable } = await import("@/lib/crm/console/followup/attempts");

const adminUsers = await import("@/app/api/admin/users/route");
const members = await import("./areas/[areaId]/members/route");
const leads = await import("./leads/route");
const outcome = await import("./leads/[leadId]/outcome/route");
const details = await import("./leads/[leadId]/details/route");
const duplicates = await import("./leads/[leadId]/duplicates/route");
const lostList = await import("./lost-review/route");
const lostDecide = await import("./lost-review/[leadId]/route");
const templates = await import("./templates/route");
const templateStatus = await import("./templates/[key]/status/route");
const sources = await import("./sources/route");

vi.setConfig({ testTimeout: 120_000 });

const ORIGIN = "http://localhost:3000";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Wed 21 Oct 2026, 11:30 IST. */
const T0 = Date.UTC(2026, 9, 21, 6, 0, 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON envelopes from many routes
type Json = { status: number; body: any };
type Who = { userId: string; role: "admin" | "staff" };
type Handler = (request: never, ctx: never) => Promise<Response> | Response;

let ipCounter = 0;
let dir = "";
const ids: Record<string, string> = {};
const leadIds: Record<string, string> = {};

function as(who: Who | null) {
  session.current = who ? { ...who, displayName: "Synthetic" } : null;
}
const sa = (): Who => ({ userId: ids.sa, role: "admin" });
const head = (): Who => ({ userId: ids.head, role: "staff" });
const couns = (): Who => ({ userId: ids.couns, role: "staff" });

function request(path: string, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  ipCounter += 1;
  const headers: Record<string, string> = { origin: ORIGIN, host: "localhost:3000", "x-forwarded-for": `198.51.100.${ipCounter % 250}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

async function call(handler: Handler, path: string, init: { method?: string; body?: unknown } = {}, params?: Record<string, string>): Promise<Json> {
  const response = await handler(request(path, init) as never, (params ? { params: Promise.resolve(params) } : undefined) as never);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function viewerOf(who: Who) {
  const viewer = resolveCrmViewer({ ...who, displayName: "Synthetic" } as never);
  if (!viewer) throw new Error("expected a CRM viewer");
  return viewer;
}

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.data;
}

let phoneCounter = 0;
/** A synthetic Indian mobile (90000000xx–style test range, never a real family). */
const nextPhone = () => `90000${String((phoneCounter += 1)).padStart(5, "0")}`;
const GATE = { textVersion: "2026-10-21.gate.v1" };

function capture(key: string, input: Record<string, unknown>, at: number, options: { gate?: boolean } = {}) {
  const phone = typeof input.phone === "string" ? input.phone : nextPhone();
  const result = captureLead(
    { source: "admissions", studentName: `Synthetic ${key}`, consent: { textVersion: "2026-10-20.v2" }, ...input, phone } as never,
    at,
    options,
  );
  if (!result.ok) throw new Error(`capture ${key} failed: ${result.error}`);
  leadIds[key] = result.leadId;
  return result.leadId;
}

const openTasks = (leadId: string) => getDb().prepare("SELECT id FROM crm_tasks WHERE lead_id = ? AND done_at IS NULL").all(leadId).map((row) => String(row.id));
const leadRow = (leadId: string) => getDb().prepare("SELECT stage, lost_reason FROM crm_leads WHERE id = ?").get(leadId) as { stage: string; lost_reason: string | null };

/** GET /api/crm/leads total for a `/crm?…` href, as `who`. */
async function inboxTotal(href: string): Promise<number> {
  const url = new URL(href, ORIGIN);
  expect(url.pathname).toBe("/crm");
  const listed = await call(leads.GET, `/api/crm/leads${url.search}`);
  expect(listed.status, href).toBe(200);
  return listed.body.data.total;
}

async function lostListLength(href: string): Promise<number> {
  const url = new URL(href, ORIGIN);
  expect(url.pathname).toBe("/crm/lost");
  const listed = await call(lostList.GET, `/api/crm/lost-review${url.search}`);
  expect(listed.status, href).toBe(200);
  return listed.body.data.items.length;
}

const NUMBER_KEYS = [
  ["today", "enquiriesToday"],
  ["week", "enquiriesWeek"],
  ["notCalled", "notCalled"],
  ["notCalledOver24h", "notCalledOver24h"],
  ["overdue", "overdue"],
] as const;

/** Every linked number of every row (and the Total), and every attention row, equals its list's total. */
async function expectNumbersMatchLists(who: Who, variant: "admin" | "crm") {
  as(who);
  const viewer = viewerOf(who);
  const data = await consoleNumbers(viewer, Date.now(), "en");
  let checked = 0;
  for (const entry of [...data.rows, data.total]) {
    for (const [link, value] of NUMBER_KEYS) {
      expect(await inboxTotal(entry.links[link]), `${entry.centre.slug ?? "total"} ${link}`).toBe(entry[value]);
      checked += 1;
    }
  }
  for (const item of needsAttention(viewer, Date.now(), variant)) {
    const count = new URL(item.href, ORIGIN).pathname === "/crm/lost" ? await lostListLength(item.href) : await inboxTotal(item.href);
    expect(count, `${item.kind} ${item.href}`).toBe(item.count);
    checked += 1;
  }
  return { data, checked };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "aspire-console-smoke-"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("AUTH_DB_PATH", join(dir, "smoke.sqlite"));
  vi.stubEnv("ENQUIRY_STORE", "crm");
  vi.stubEnv("ENQUIRY_DESTINATION", "none");
  vi.stubEnv("LEAD_GATE_ASSIGN", "");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetDatabaseForTests();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
  expect(existsSync(dir)).toBe(false);
});

describe("admin console 1b smoke (§14.6)", () => {
  it("1. a super admin, an area head (one area), a counsellor and 30 fixture enquiries", async () => {
    const db = getDb();
    ids.sa = insertUser(db, { role: "admin", loginId: "sa.smoke", displayName: "Synthetic SA", passwordHash: "scrypt$test", mustChangePassword: false, now: T0 - 400 * DAY }).id;
    ensureSuperAdminBootstrap(db, T0);
    expect(isSuperAdmin(ids.sa)).toBe(true);

    // 30 enquiries before any staff exists (no auto-assignment), spread over centres, sources and days.
    const at = (hoursAgo: number) => T0 - hoursAgo * HOUR;
    capture("shimlaToday", { centreSlug: "shimla", programInterest: "jee" }, at(1));
    capture("shimlaToday2", { centreSlug: "shimla", source: "contact", contactName: "Synthetic Parent" }, at(2));
    capture("shimlaMonday", { centreSlug: "shimla" }, Date.UTC(2026, 9, 18, 18, 30)); // Mon 19 Oct 00:00 IST
    capture("shimlaSunday", { centreSlug: "shimla" }, Date.UTC(2026, 9, 18, 18, 29)); // Sun 23:59 IST: last week
    capture("shimlaOld", { centreSlug: "shimla", context: { referrer: "www.google.com" } }, at(10 * 24));
    capture("shimlaAi", { centreSlug: "shimla", context: { referrer: "chatgpt.com" } }, at(5));
    capture("shimlaMaps", { centreSlug: "shimla", context: { utm: { source: "google", medium: "gbp", campaign: "gbp-shimla" } } }, at(30));
    capture("shimlaHero", { centreSlug: "shimla", source: "hero", programInterest: "neet" }, at(50));
    capture("shimlaQuick", { centreSlug: "shimla", source: "quick" }, at(26));
    capture("shimlaErased", { centreSlug: "shimla" }, at(3));
    capture("shimlaTestErased", { centreSlug: "shimla" }, at(4));
    capture("areaNoCentre", { centreSlug: null, district: "shimla" }, at(27)); // area-routed, no centre of its own
    capture("signupShimla", { source: "tool", consent: GATE, centreSlug: null, district: "shimla" }, at(6), { gate: true });
    capture("signupUnrouted", { source: "tool", consent: GATE, centreSlug: null }, at(7), { gate: true });
    capture("signupUnrouted2", { source: "tool", consent: GATE, centreSlug: null }, at(31), { gate: true });
    capture("hamirpur1", { centreSlug: "hamirpur" }, at(1.5));
    capture("hamirpur2", { centreSlug: "hamirpur", source: "contact" }, at(28));
    capture("hamirpurImport", { centreSlug: "hamirpur" }, at(40));
    capture("hamirpurImport2", { centreSlug: "hamirpur" }, at(45));
    capture("kullu1", { centreSlug: "kullu" }, at(8));
    capture("kullu2", { centreSlug: "kullu", context: { referrer: "www.bing.com" } }, at(60));
    capture("kullu3", { centreSlug: "kullu", source: "hero" }, at(100));
    capture("dharamshala1", { centreSlug: "dharamshala" }, at(9));
    capture("dharamshala2", { centreSlug: "dharamshala", source: "quick" }, at(72));
    capture("dharamshala3", { centreSlug: "dharamshala" }, at(20 * 24));
    capture("noCentre", { source: "contact", centreSlug: null }, at(0.5));
    capture("noCentre2", { source: "contact", centreSlug: null }, at(30));
    capture("callsLead", { centreSlug: "shimla" }, at(0.25)); // step 3
    capture("notReachable", { centreSlug: "shimla" }, at(0.2)); // step 4
    capture("familyA", { centreSlug: "shimla", guardianName: "Synthetic Guardian" }, at(0.1)); // step 6
    expect(Object.keys(leadIds)).toHaveLength(30);
    db.prepare("UPDATE crm_leads SET source = 'csv_import' WHERE id IN (?, ?)").run(leadIds.hamirpurImport, leadIds.hamirpurImport2);

    // Staff through the real routes: the super admin creates both logins and puts them in the Shimla area.
    as(sa());
    for (const [key, loginId, crmRole] of [["head", "head.shimla", "manager"], ["couns", "couns.shimla", "counsellor"]] as const) {
      const created = await call(adminUsers.POST, "/api/admin/users", { body: { role: "staff", loginId, displayName: `Synthetic ${key}`, crm: { crmRole, centreSlugs: [], areaIds: [] } } });
      expect(created.status).toBe(201);
      ids[key] = String(created.body.data.user.id);
    }
    const put = await call(members.PUT, "/api/crm/areas/shimla/members", { method: "PUT", body: { members: [{ userId: ids.head }, { userId: ids.couns, centreSlug: "shimla", takesLeads: true }] } }, { areaId: "shimla" });
    expect(put.status).toBe(200);

    const admin = viewerOf(sa());
    for (const key of ["shimlaToday", "shimlaMonday", "callsLead", "notReachable", "familyA"]) must(assignLead(admin, leadIds[key], ids.couns, T0 - 10 * MINUTE));
    // Two overdue follow-ups for the counsellor.
    for (const key of ["shimlaToday", "shimlaMonday"]) must(createTask(admin, leadIds[key], { title: "Call back", dueAt: T0 - HOUR }, T0 - 2 * HOUR));
    must(eraseLead(admin, leadIds.shimlaErased, T0 - 30 * MINUTE, { reason: "family_request" }));
    must(eraseLead(admin, leadIds.shimlaTestErased, T0 - 30 * MINUTE, { reason: "wrong_or_test" }));
  });

  it("2. every linked number equals the GET /api/crm/leads total for its link (super admin and area head)", async () => {
    const admin = await expectNumbersMatchLists(sa(), "admin");
    expect(admin.data.rows.map((row) => row.centre.slug)).toEqual(expect.arrayContaining(["shimla", "hamirpur", "kullu", "dharamshala", null]));
    const shimla = admin.data.rows.find((row) => row.centre.slug === "shimla");
    // The area-routed lead without a centre counts under its area's centre; erased leads are only a sub-line.
    expect(shimla).toMatchObject({ overdue: 2, erasedWeek: 1 });
    expect(admin.data.total.toolSignupsWeek).toBe(3);
    expect(admin.data.total.importedWeek).toBe(2);
    expect(admin.checked).toBeGreaterThan(25);

    const manager = await expectNumbersMatchLists(head(), "crm");
    expect(manager.data.rows.map((row) => row.centre.slug)).toEqual(["shimla"]);
    expect(manager.data.total.enquiriesWeek).toBeLessThan(admin.data.total.enquiriesWeek);
  });

  it("3. the counsellor logs a no-answer with 'later today': exactly one open task; lead routing's clock records the attempt", async () => {
    as(couns());
    const leadId = leadIds.callsLead;
    const context = await call(outcome.GET, `/api/crm/leads/${leadId}/outcome`, {}, { leadId });
    expect(context.status).toBe(200);
    const saved = await call(outcome.POST, `/api/crm/leads/${leadId}/outcome`, { body: { contact: { channel: "call", outcome: "no_answer" }, next: { kind: "preset", preset: "later_today" } } }, { leadId });
    expect(saved.status).toBe(201);
    expect(openTasks(leadId)).toHaveLength(1);
    const clock = getDb().prepare("SELECT attempts, resolution FROM crm_sla_clocks WHERE lead_id = ? ORDER BY id DESC").get(leadId) as { attempts: number; resolution: string | null };
    expect(Number(clock.attempts)).toBe(1);
  });

  it("4. five unanswered calls offer 'not reachable' → lost (not_reachable) → listed for review → the area head reopens it with a task", async () => {
    as(couns());
    const leadId = leadIds.notReachable;
    for (let call_ = 1; call_ <= 4; call_ += 1) {
      vi.setSystemTime(T0 + call_ * 20 * MINUTE);
      const [taskId] = openTasks(leadId);
      const saved = await call(outcome.POST, `/api/crm/leads/${leadId}/outcome`, { body: { contact: { channel: "call", outcome: "no_answer" }, taskId: taskId ?? null, next: { kind: "preset", preset: "later_today" } } }, { leadId });
      expect(saved.status, `call ${call_}`).toBe(201);
      expect(openTasks(leadId)).toHaveLength(1);
    }
    vi.setSystemTime(T0 + 100 * MINUTE);
    const context = await call(outcome.GET, `/api/crm/leads/${leadId}/outcome`, {}, { leadId });
    // Four unanswered so far: the dialog offers "not reachable" as soon as a fifth no-answer is chosen.
    expect(context.body.data.attempts).toMatchObject({ calls: 4, unansweredStreak: 4 });
    expect(offerNotReachable(context.body.data.attempts, "no_answer")).toBe(true);
    expect(offerNotReachable(context.body.data.attempts, "spoke")).toBe(false);
    const [taskId] = openTasks(leadId);
    const fifth = await call(outcome.POST, `/api/crm/leads/${leadId}/outcome`, { body: { contact: { channel: "call", outcome: "no_answer" }, taskId, next: { kind: "none", reason: "closing" }, markNotReachable: true } }, { leadId });
    expect(fifth.status).toBe(201);
    expect(leadRow(leadId)).toEqual({ stage: "lost", lost_reason: "not_reachable" });
    expect(openTasks(leadId)).toHaveLength(0);

    // Counsellors may not review; the area head sees the event (a minute later: the lost change is
    // stamped 1 ms after the call it follows) and reopens it.
    vi.setSystemTime(T0 + 101 * MINUTE);
    expect((await call(lostList.GET, "/api/crm/lost-review?days=14")).status).toBe(403);
    as(head());
    const listed = await call(lostList.GET, "/api/crm/lost-review?days=14");
    expect(listed.status).toBe(200);
    const event = listed.body.data.items.find((item: { leadId: string }) => item.leadId === leadId);
    expect(event).toMatchObject({ reason: "not_reachable", callsMade: 5 });
    const reopened = await call(lostDecide.POST, `/api/crm/lost-review/${leadId}`, { body: { lostAt: event.lostAt, decision: "reopened" } }, { leadId });
    expect(reopened.status).toBe(200);
    expect(leadRow(leadId).stage).not.toBe("lost");
    expect(openTasks(leadId)).toHaveLength(1);
    const after = await call(lostList.GET, "/api/crm/lost-review?days=14");
    expect(after.body.data.items.some((item: { leadId: string }) => item.leadId === leadId)).toBe(false);
  });

  it("5. the super admin approves missed_call; the counsellor is offered it; only the confirmed send logs message_sent with the template", async () => {
    as(sa());
    const all = await call(templates.GET, "/api/crm/templates?all=1");
    expect(all.status).toBe(200);
    const missed = all.body.data.find((template: { key: string }) => template.key === "missed_call");
    expect(missed).toMatchObject({ status: "draft" });
    as(couns());
    expect((await call(templates.GET, "/api/crm/templates?context=general")).body.data).toEqual([]);
    expect((await call(templateStatus.POST, "/api/crm/templates/missed_call/status", { body: { status: "approved", expectedVersion: missed.version } }, { key: "missed_call" })).status).toBe(403);
    as(sa());
    const approved = await call(templateStatus.POST, "/api/crm/templates/missed_call/status", { body: { status: "approved", expectedVersion: missed.version } }, { key: "missed_call" });
    expect(approved.status).toBe(200);

    as(couns());
    const offered = await call(templates.GET, "/api/crm/templates?context=general");
    expect(offered.body.data.map((template: { key: string }) => template.key)).toEqual(["missed_call"]);
    const leadId = leadIds.callsLead;
    const before = Number(getDb().prepare("SELECT COUNT(*) AS n FROM crm_activities WHERE lead_id = ? AND type = 'whatsapp'").get(leadId)?.n);
    expect(before).toBe(0); // opening WhatsApp writes nothing; only "Yes, I sent it" posts
    const [taskId] = openTasks(leadId);
    const sent = await call(outcome.POST, `/api/crm/leads/${leadId}/outcome`, {
      body: { contact: { channel: "whatsapp", outcome: "message_sent", template: { key: "missed_call", lang: "en" } }, taskId, next: { kind: "preset", preset: "tomorrow" } },
    }, { leadId });
    expect(sent.status).toBe(201);
    const rows = getDb().prepare("SELECT meta FROM crm_activities WHERE lead_id = ? AND type = 'whatsapp'").all(leadId);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(String(rows[0].meta))).toMatchObject({ outcome: "message_sent", template: "missed_call", lang: "en" });
    expect(openTasks(leadId)).toHaveLength(1);
  });

  it("6. a second number equal to another enquiry's phone suggests a duplicate; dismissing it removes the suggestion", async () => {
    as(couns());
    const leadId = leadIds.familyA;
    const other = leadIds.shimlaToday; // also assigned to the counsellor
    const otherPhone = String(getDb().prepare("SELECT phone_e164 FROM crm_leads WHERE id = ?").get(other)?.phone_e164).replace(/^\+91/, "");
    expect(otherPhone).toMatch(/^\d{10}$/);
    const saved = await call(details.PUT, `/api/crm/leads/${leadId}/details`, { method: "PUT", body: { altPhone: otherPhone } }, { leadId });
    expect(saved.status).toBe(200);
    const suggested = await call(duplicates.GET, `/api/crm/leads/${leadId}/duplicates`, {}, { leadId });
    expect(suggested.status).toBe(200);
    expect(suggested.body.data.map((match: { leadId: string }) => match.leadId)).toContain(other);
    const dismissed = await call(duplicates.POST, `/api/crm/leads/${leadId}/duplicates`, { body: { otherLeadId: other, action: "dismiss" } }, { leadId });
    expect(dismissed.status).toBe(200);
    const gone = await call(duplicates.GET, `/api/crm/leads/${leadId}/duplicates`, {}, { leadId });
    expect(gone.body.data.map((match: { leadId: string }) => match.leadId)).not.toContain(other);
    // From the other side too: the dismissal is per pair.
    const reverse = await call(duplicates.GET, `/api/crm/leads/${other}/duplicates`, {}, { leadId: other });
    expect(reverse.body.data.map((match: { leadId: string }) => match.leadId)).not.toContain(leadId);
  });

  it("7. an enquiry from chatgpt.com is erased; Where enquiries come from still counts 1 AI-assistant enquiry", async () => {
    as(sa());
    const admin = viewerOf(sa());
    must(eraseLead(admin, leadIds.shimlaAi, Date.now(), { reason: "family_request" }));
    expect(getDb().prepare("SELECT referrer_host FROM crm_lead_attribution WHERE lead_id = ?").get(leadIds.shimlaAi)?.referrer_host).toBe("chatgpt.com");
    const report = await call(sources.GET, "/api/crm/sources?range=30d");
    expect(report.status).toBe(200);
    expect(report.body.data.channels.find((row: { channel: string }) => row.channel === "ai_assistants")).toMatchObject({ enquiries: 1 });
    expect(report.body.data.ai).toMatchObject({ enquiries: 1, fromVisit: 1 });
    expect(report.body.data.erased).toBeGreaterThanOrEqual(2);
    as(couns());
    expect((await call(sources.GET, "/api/crm/sources?range=30d")).status).toBe(403);
  });

  it("8. POST /api/admin/users: a staff login without a CRM role → 422", async () => {
    as(sa());
    const plain = await call(adminUsers.POST, "/api/admin/users", { body: { role: "staff", loginId: "no.role", displayName: "Synthetic" } });
    expect(plain.status).toBe(422);
    expect(plain.body.fieldErrors).toEqual({ crm: ["Choose the CRM role."] });
  });

  it("numbers still match their lists after the story (super admin and area head)", async () => {
    await expectNumbersMatchLists(sa(), "admin");
    await expectNumbersMatchLists(head(), "crm");
  });
});
