import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Lead routing, integrate stage (docs/lead-routing-plan.md §25.5): one story across the packages,
// over the REAL route handlers and the REAL seams (routing, SLA, Meta, import), on one temporary
// in-memory database. Only the session lookup is stubbed (no cookies / scrypt), `after()` jobs are
// captured and run on purpose, Graph is an injected fake and the global fetch is guarded. The clock
// is fixed at Wed 21 Oct 2026 11:30 IST (inside the default calling hours). Synthetic people only.
const session = vi.hoisted(() => ({ current: null as null | { userId: string; role: "admin" | "staff"; displayName: string } }));
const deferred = vi.hoisted(() => ({ jobs: [] as (() => unknown)[] }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<object>()),
  getSession: vi.fn(async () => session.current),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
  after: vi.fn((job: () => unknown) => {
    deferred.jobs.push(job);
  }),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { insertUser } = await import("@/lib/db/users");
const { AUTH_MESSAGES } = await import("@/lib/auth/messages");
const { CONSENT_VERSION } = await import("@/lib/contracts/enquiry");
const { resetEnquiryRateLimiterForTests } = await import("@/lib/server/enquiry-handler");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { decodeCsvBytes } = await import("@/lib/crm/intake/decode");
const { parseCsv } = await import("@/lib/crm/intake/csv");
const { buildImportRows, chunkImportRows, guessMapping } = await import("@/lib/crm/intake/rows");
const { resetImportLimitersForTests } = await import("@/app/api/crm/import/_lib/route-kit");
const { resetMetaLimitersForTests } = await import("@/lib/crm/meta/http");
const { resetMetaInboxStateForTests } = await import("@/lib/crm/meta/inbox");
const { setMetaRuntimeForTests } = await import("@/lib/crm/meta/runtime");
const kit = await import("@/lib/crm/meta/fixtures/meta-kit");
const { runSuperAdminCli } = (await import("../../../../scripts/super-admin.mjs")) as {
  runSuperAdminCli: (db: unknown, args: string[], now?: number) => Promise<{ code: number; lines: string[] }>;
};

const superAdmins = await import("@/app/api/admin/super-admins/route");
const users = await import("@/app/api/admin/users/route");
const user = await import("@/app/api/admin/users/[userId]/route");
const resetPassword = await import("@/app/api/admin/users/[userId]/reset-password/route");
const areas = await import("./areas/route");
const members = await import("./areas/[areaId]/members/route");
const setupFromCentre = await import("./areas/setup-from-centre/route");
const speed = await import("./settings/speed/route");
const leads = await import("./leads/route");
const lead = await import("./leads/[leadId]/route");
const contacts = await import("./leads/[leadId]/contacts/route");
const erase = await import("./leads/[leadId]/erase/route");
const sla = await import("./sla/route");
const slaSummary = await import("./sla/summary/route");
const importPreview = await import("./import/preview/route");
const importBatches = await import("./import/batches/route");
const importRows = await import("./import/batches/[batchId]/rows/route");
const importFinish = await import("./import/batches/[batchId]/finish/route");
const webhook = await import("@/app/api/integrations/meta/webhook/route");
const enquiries = await import("@/app/api/enquiries/route");

vi.setConfig({ testTimeout: 60_000 });

const ORIGIN = "http://localhost:3000";
const T0 = Date.UTC(2026, 9, 21, 6, 0, 0); // Wed 11:30 IST
const HOUR = 60 * 60 * 1000;
const restoreFetch = kit.guardGlobalFetch();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON envelopes from many routes
type Json = { status: number; body: any };
type Who = { userId: string; role: "admin" | "staff" };
let ipCounter = 0;

function as(who: Who | null) {
  session.current = who ? { ...who, displayName: "Synthetic" } : null;
}

function request(path: string, init: { method?: string; body?: unknown } = {}) {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  ipCounter += 1;
  const headers: Record<string, string> = { origin: ORIGIN, host: "localhost:3000", "x-forwarded-for": `198.51.100.${ipCounter % 250}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

async function call(handler: (request: never, ctx: never) => Promise<Response> | Response, path: string, init: { method?: string; body?: unknown } = {}, params?: Record<string, string>): Promise<Json> {
  const response = await handler(request(path, init) as never, (params ? { params: Promise.resolve(params) } : undefined) as never);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function enquiry(body: Record<string, unknown>): Promise<Json> {
  ipCounter += 1;
  const response = await enquiries.POST(
    new Request(`${ORIGIN}/api/enquiries`, {
      method: "POST",
      headers: { host: "localhost:3000", origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": `203.0.113.${ipCounter % 250}` },
      body: JSON.stringify({ consent: true, consentVersion: CONSENT_VERSION, currentClass: "class-11", programInterest: "jee", ...body }),
    }),
  );
  return { status: response.status, body: await response.json() };
}

async function runDeferred() {
  const jobs = deferred.jobs.splice(0);
  for (const job of jobs) await job();
}

/** The browser half of the CSV import (decode → parse → map → build → chunk), as the wizard runs it. */
function csvRows(text: string) {
  const decoded = decodeCsvBytes(new TextEncoder().encode(text));
  const parsed = parseCsv(decoded.text);
  if (!parsed.ok) throw new Error("csv did not parse");
  const built = buildImportRows(parsed.header, parsed.rows, guessMapping(parsed.header), { encoding: decoded.encoding });
  const chunks = chunkImportRows(built.rows);
  expect(chunks).toHaveLength(1);
  return chunks[0];
}

async function importCsv(text: string) {
  const rows = csvRows(text);
  const preview = await call(importPreview.POST, "/api/crm/import/preview", { body: { rows, consentBasis: "meta_lead_form" } });
  expect(preview.status).toBe(200);
  const batch = await call(importBatches.POST, "/api/crm/import/batches", { body: { consentBasis: "meta_lead_form", startClock: true, rowsTotal: rows.length, fileName: "synthetic.csv" } });
  expect(batch.status).toBe(201);
  const batchId = String(batch.body.data.batch?.id ?? batch.body.data.id);
  const sent = await call(importRows.POST, `/api/crm/import/batches/${batchId}/rows`, { body: { rows, offset: 0 } }, { batchId });
  expect(sent.status).toBe(200);
  const finished = await call(importFinish.POST, `/api/crm/import/batches/${batchId}/finish`, { body: {} }, { batchId });
  expect(finished.status).toBe(200);
  const results = sent.body.data.results as { row: number; status: string; lostLeadId?: string }[];
  return { results, created: results.filter((r) => r.status === "created").length };
}

function fixtureCsv(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../lib/crm/intake/fixtures/${name}`, import.meta.url)), "utf8");
}

async function findLead(q: string) {
  const list = await call(leads.GET, `/api/crm/leads?q=${encodeURIComponent(q)}`);
  expect(list.status).toBe(200);
  return list.body.data.items as { id: string; stage: string; assignee: { userId: string } | null; area?: { id: string } | null }[];
}

async function detail(leadId: string) {
  const got = await call(lead.GET, `/api/crm/leads/${leadId}`, {}, { leadId });
  expect(got.status).toBe(200);
  return got.body.data;
}

const ids: Record<string, string> = {};
const sa = (): Who => ({ userId: ids.sa, role: "admin" });
const admin2 = (): Who => ({ userId: ids.admin2, role: "admin" });
const staff = (key: string): Who => ({ userId: ids[key], role: "staff" });

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("INTEGRATIONS_SECRET", kit.TEST_INTEGRATIONS_SECRET);
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", "");
  vi.stubEnv("ENQUIRY_STORE", "crm");
  vi.stubEnv("ENQUIRY_DESTINATION", "none");
  vi.stubEnv("LEAD_GATE_ASSIGN", "");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  resetImportLimitersForTests();
  resetMetaLimitersForTests();
  resetMetaInboxStateForTests();
  resetEnquiryRateLimiterForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterAll(() => {
  setMetaRuntimeForTests(null);
  restoreFetch();
  expect(kit.globalFetchCalls.count).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("lead routing, end to end (§25.5)", () => {
  it("1. one admin: the CLI list makes them super admin; a second, ordinary admin is refused every super-admin write", async () => {
    const db = getDb();
    ids.sa = insertUser(db, { role: "admin", loginId: "sa.one", displayName: "Synthetic SA", passwordHash: "scrypt$test", mustChangePassword: false, now: T0 }).id;
    const cli = await runSuperAdminCli(db, ["list"], T0);
    expect(cli.code).toBe(0);
    expect(cli.lines.join("\n")).toMatch(/made super admin automatically/);
    expect(cli.lines.join("\n")).toContain("sa.one");
    ids.admin2 = insertUser(db, { role: "admin", loginId: "admin.two", displayName: "Synthetic Admin", passwordHash: "scrypt$test", mustChangePassword: false, now: T0 }).id;

    as(admin2());
    const listed = await call(superAdmins.GET, "/api/admin/super-admins");
    expect(listed.body.data).toMatchObject({ youAreSuperAdmin: false, items: [expect.objectContaining({ userId: ids.sa })] });
    expect((await call(areas.POST, "/api/crm/areas", { body: { nameEn: "Synthetic", nameHi: "Synthetic" } })).status).toBe(403);
    expect((await call(speed.PUT, "/api/crm/settings/speed", { method: "PUT", body: { speedRule: {}, expectedVersion: { speedRule: 0 } } })).status).toBe(403);
    expect((await call(users.POST, "/api/admin/users", { body: { role: "staff", loginId: "nope.staff", displayName: "Nope", crm: { crmRole: "counsellor" } } })).status).toBe(403);
    const reset = await call(resetPassword.POST, `/api/admin/users/${ids.sa}/reset-password`, { body: {} }, { userId: ids.sa });
    expect(reset.status).toBe(403);
    expect(reset.body).toMatchObject({ error: "forbidden", message: AUTH_MESSAGES.superAdminTarget });
    expect((await call(user.PATCH, `/api/admin/users/${ids.sa}`, { method: "PATCH", body: { disabled: true } }, { userId: ids.sa })).status).toBe(403);
  });

  it("2. the super admin sees 12 areas; Set up from centre (Dharamshala) staffs Kangra and Chamba", async () => {
    as(sa());
    const listed = await call(areas.GET, "/api/crm/areas");
    const list = listed.body.data.items ?? listed.body.data;
    expect(list).toHaveLength(12);
    const create = async (key: string, loginId: string, crmRole: "manager" | "counsellor") => {
      const created = await call(users.POST, "/api/admin/users", { body: { role: "staff", loginId, displayName: `Synthetic ${key}`, crm: { crmRole, centreSlugs: [], areaIds: [] } } });
      expect(created.status).toBe(201);
      ids[key] = String(created.body.data.user.id);
    };
    await create("dhHead", "dh.head", "manager");
    await create("dhExec1", "dh.exec1", "counsellor");
    await create("dhExec2", "dh.exec2", "counsellor");
    const setup = await call(setupFromCentre.POST, "/api/crm/areas/setup-from-centre", {
      body: { centreSlug: "dharamshala", headIds: [ids.dhHead], executiveIds: [ids.dhExec1, ids.dhExec2], headsTakeCalls: false },
    });
    expect(setup.status).toBe(200);
    expect(setup.body.data.areaIds).toEqual(expect.arrayContaining(["kangra", "chamba"]));
    const after = (await call(areas.GET, "/api/crm/areas")).body.data;
    const kangra = (after.items ?? after).find((a: { id: string }) => a.id === "kangra");
    expect(kangra.members.map((m: { userId: string }) => m.userId).sort()).toEqual([ids.dhHead, ids.dhExec1, ids.dhExec2].sort());
    expect(kangra.coverage).toMatchObject({ hasExecutive: true, hasHead: true });
  });

  it("3. a signed webhook → one lead routed to Kangra, given to the Dharamshala executive with fewer open clocks, due one working hour later; a redelivery adds nothing", async () => {
    // An earlier Kangra enquiry gives one executive an open first-call clock.
    const first = await enquiry({ source: "admissions", name: "Synthetic Earlier", phone: "9600000001", district: "kangra" });
    expect(first.status).toBe(201);
    as(sa());
    const [earlier] = await findLead("9600000001");
    expect(earlier.area?.id).toBe("kangra");
    const busy = earlier.assignee?.userId;
    expect([ids.dhExec1, ids.dhExec2]).toContain(busy);

    kit.configureMeta(getDb());
    const graph = kit.fakeGraph({ [`GET ${kit.LEAD_ID}`]: { body: kit.fixtureJson("lead-full.json") } });
    setMetaRuntimeForTests({ fetchImpl: graph.fetchImpl, centres: async () => kit.TEST_CENTRES });
    const body = kit.fixtureText("webhook-docs.json");
    const post = () =>
      webhook.POST(new NextRequest(`${ORIGIN}/api/integrations/meta/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.200", "x-hub-signature-256": kit.sign(body) }, body }));
    expect((await post()).status).toBe(200);
    await runDeferred();

    const metaLeads = getDb().prepare("SELECT id FROM crm_leads WHERE source = 'meta_lead_ad'").all();
    expect(metaLeads).toHaveLength(1);
    const metaLead = await detail(String(metaLeads[0].id));
    expect(metaLead.routing).toMatchObject({ areaId: "kangra" });
    expect(metaLead.assignee?.userId).toBe([ids.dhExec1, ids.dhExec2].find((id) => id !== busy));
    expect(metaLead.sla).toMatchObject({ state: "due", reason: "new", startedAt: new Date(T0).toISOString(), dueAt: new Date(T0 + HOUR).toISOString() });
    ids.metaLead = metaLead.id;
    ids.metaAssignee = metaLead.assignee.userId;

    expect((await post()).status).toBe(200);
    await runDeferred();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads WHERE source = 'meta_lead_ad'").get()?.n).toBe(1);
    expect(graph.calls.filter((c) => c.path === kit.LEAD_ID)).toHaveLength(1);
  });

  it("4. a Solan lead with no Solan people is borrowed by the Shimla team; the Shimla head sees it, not Kangra's leads", async () => {
    as(sa());
    for (const [key, loginId, crmRole] of [["shHead", "sh.head", "manager"], ["shExec", "sh.exec", "counsellor"]] as const) {
      const created = await call(users.POST, "/api/admin/users", { body: { role: "staff", loginId, displayName: `Synthetic ${key}`, crm: { crmRole, centreSlugs: [], areaIds: [] } } });
      expect(created.status).toBe(201);
      ids[key] = String(created.body.data.user.id);
    }
    const put = await call(members.PUT, "/api/crm/areas/shimla/members", { method: "PUT", body: { members: [{ userId: ids.shHead }, { userId: ids.shExec, centreSlug: "shimla", takesLeads: true }] } }, { areaId: "shimla" });
    expect(put.status).toBe(200);

    expect((await enquiry({ source: "contact", topic: "admissions", name: "Synthetic Solan", phone: "9600000002", district: "solan" })).status).toBe(201);
    const [solan] = await findLead("9600000002");
    expect(solan.area?.id).toBe("solan");
    expect(solan.assignee?.userId).toBe(ids.shExec);
    const solanDetail = await detail(solan.id);
    expect(solanDetail.activities.find((a: { type: string }) => a.type === "assignment")?.meta).toMatchObject({ via: "area_borrow" });

    as(staff("shHead"));
    const seen = (await call(leads.GET, "/api/crm/leads")).body.data.items.map((l: { id: string }) => l.id);
    expect(seen).toContain(solan.id);
    expect(seen).not.toContain(ids.metaLead);
    ids.solanLead = solan.id;
  });

  it("5. the CSV fixture twice → 0 created the second time; an overlapping file adds only its new row; a lost family is attached, not reopened", async () => {
    as(sa());
    const day1 = fixtureCsv("daily-1.csv");
    const firstRun = await importCsv(day1);
    expect(firstRun.created).toBeGreaterThan(0);
    const again = await importCsv(day1);
    expect(again.created).toBe(0);
    expect(again.results.every((r) => r.status === "already_imported" || r.status === "invalid_phone" || r.status === "missing_phone")).toBe(true);
    const day2 = await importCsv(fixtureCsv("daily-2.csv"));
    const day2Lines = fixtureCsv("daily-2.csv").trim().split(/\r?\n/).length - 1;
    const day1Lines = day1.trim().split(/\r?\n/).length - 1;
    expect(day2.created).toBe(day2Lines - day1Lines);

    const [family] = await findLead("6000010051");
    const lost = await call(lead.PATCH, `/api/crm/leads/${family.id}`, { method: "PATCH", body: { stage: "lost", lostReason: "not_interested" } }, { leadId: family.id });
    expect(lost.status).toBe(200);
    const before = await detail(family.id);
    const reappears = await importCsv(
      ["id,created_time,form_id,full_name,phone_number,city", `l:1234567890123491,${new Date(T0 - HOUR).toISOString().replace(/\.\d{3}Z$/, "+0000")},f:900000000000001,Day One A,p:+916000010051,Hamirpur`].join("\n"),
    );
    expect(reappears.results).toEqual([expect.objectContaining({ status: "attached", lostLeadId: family.id })]);
    const after = await detail(family.id);
    expect(after).toMatchObject({ stage: "lost", lostReason: "not_interested" });
    expect(after.assignee?.userId ?? null).toBe(before.assignee?.userId ?? null);
    expect(after.submissionCount).toBe(before.submissionCount + 1);
    expect(after.sla ?? null).toEqual(before.sla ?? null);
    ids.lostFamily = family.id;
  });

  it("6. erase that family → a re-import of an older row is skipped as erased_family", async () => {
    as(sa());
    const erased = await call(erase.POST, `/api/crm/leads/${ids.lostFamily}/erase`, { body: { confirm: true, reason: "wrong_or_test" } }, { leadId: ids.lostFamily });
    expect(erased.status).toBe(200);
    vi.setSystemTime(T0 + 5 * 60_000);
    const back = await importCsv(
      ["id,created_time,form_id,full_name,phone_number,city", `l:1234567890123492,${new Date(T0 - 2 * HOUR).toISOString().replace(/\.\d{3}Z$/, "+0000")},f:900000000000001,Day One A,p:+916000010051,Hamirpur`].join("\n"),
    );
    expect(back.results).toEqual([expect.objectContaining({ status: "erased_family" })]);
    expect(await findLead("6000010051")).toEqual([]);
  });

  it("7. no_answer → a retry task for the assignee; connected → the clock is met and reached_at is set", async () => {
    vi.setSystemTime(T0 + 10 * 60_000);
    as(staff(ids.metaAssignee === ids.dhExec1 ? "dhExec1" : "dhExec2"));
    const leadId = ids.metaLead;
    const noAnswer = await call(contacts.POST, `/api/crm/leads/${leadId}/contacts`, { body: { channel: "call", outcome: "no_answer", body: null } }, { leadId });
    expect(noAnswer.status).toBe(201);
    const afterMiss = await detail(leadId);
    const retry = afterMiss.tasks.filter((t: { doneAt: string | null }) => t.doneAt === null);
    expect(retry).toHaveLength(1);
    expect(retry[0]).toMatchObject({ assignee: expect.objectContaining({ userId: ids.metaAssignee }), dueAt: new Date(T0 + 10 * 60_000 + 2 * HOUR).toISOString() });
    expect(afterMiss.sla ?? null).toBeNull(); // the first attempt resolves the first-call clock (any_attempt)

    vi.setSystemTime(T0 + 20 * 60_000);
    const connected = await call(contacts.POST, `/api/crm/leads/${leadId}/contacts`, { body: { channel: "call", outcome: "connected", body: null } }, { leadId });
    expect(connected.status).toBe(201);
    const clock = getDb().prepare("SELECT met, first_attempt_at AS firstAt, reached_at AS reachedAt, attempts FROM crm_sla_clocks WHERE lead_id = ?").get(leadId);
    expect(clock).toMatchObject({ met: 1, firstAt: T0 + 10 * 60_000, reachedAt: T0 + 20 * 60_000, attempts: 2 });
  });

  it("8. past due: the uncalled Solan lead is overdue in the Shimla head's area queue and per-executive digest", async () => {
    vi.setSystemTime(T0 + 2 * HOUR);
    as(staff("shHead"));
    const queue = await call(sla.GET, "/api/crm/sla?view=area");
    expect(queue.status).toBe(200);
    const items = queue.body.data.items as { leadId: string; clock: { state: string } }[];
    expect(items.find((i) => i.leadId === ids.solanLead)?.clock.state).toBe("overdue");
    expect(items.map((i) => i.leadId)).not.toContain(ids.metaLead);
    const summary = await call(slaSummary.GET, "/api/crm/sla/summary");
    expect(summary.status).toBe(200);
    // Digest per executive (A7): the Solan lead plus the imported Sirmaur / Kinnaur families the
    // Shimla executive also covers (their import clocks are past due too).
    expect(summary.body.data.area.areas).toEqual(expect.arrayContaining([expect.objectContaining({ id: "solan", overdue: 1 })]));
    expect(summary.body.data.area.byExecutive).toEqual([expect.objectContaining({ userId: ids.shExec, overdue: 3, away: false })]);
    as(staff(ids.metaAssignee === ids.dhExec1 ? "dhExec1" : "dhExec2"));
    expect((await call(sla.GET, "/api/crm/sla?view=area")).status).toBe(403);
  });

  it("9. Meta health for super admins: nothing waiting after the import, then the silence alert after 48 hours without a Meta lead", async () => {
    as(sa());
    const fresh = await call(slaSummary.GET, "/api/crm/sla/summary");
    expect(fresh.body.data.sa.meta).toEqual({ pending: 0, failed: 0, paused: null, silentHours: null });
    vi.setSystemTime(T0 + 50 * HOUR);
    const silent = await call(slaSummary.GET, "/api/crm/sla/summary");
    expect(silent.body.data.sa.meta).toMatchObject({ pending: 0, silentHours: 50 });
  });
});
