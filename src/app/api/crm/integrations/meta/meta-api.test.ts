import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/crm/integrations/meta/** with the REAL guards (`requireCrm` / `requireCrmSuperAdmin`: same
// origin, session, CRM membership, effective super admin from `superadmin_grants`, rate limits)
// and the real password re-check. Only the session lookup is stubbed; `after()` is captured; Graph
// is never reached (the global fetch is guarded). Synthetic people only.
const session = vi.hoisted(() => ({ current: null as null | { userId: string; role: "admin" | "staff"; displayName: string } }));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<object>()),
  getSession: vi.fn(async () => session.current),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original<object>()), ...(await import("@/lib/crm/meta/fixtures/seams")).routingSeam() }));
vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original<object>()), ...(await import("@/lib/crm/meta/fixtures/seams")).slaSeam() }));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { insertUser } = await import("@/lib/db/users");
const { upsertGrant } = await import("@/lib/db/super-admins");
const { listAudit } = await import("@/lib/db/audit");
const { hashPassword } = await import("@/lib/auth/password");
const { writeStaffMembership } = await import("@/lib/crm/admin");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { insertInboxRow } = await import("@/lib/crm/repo/meta");
const kit = await import("@/lib/crm/meta/fixtures/meta-kit");
const config = await import("./route");
const secrets = await import("./secrets/route");
const actions = await import("./actions/route");
const inbox = await import("./inbox/route");

const { TEST_ACCESS_TOKEN, TEST_APP_SECRET, TEST_INTEGRATIONS_SECRET, configureMeta } = kit;
const restoreFetch = kit.guardGlobalFetch();
afterAll(() => {
  restoreFetch();
  expect(kit.globalFetchCalls.count).toBe(0);
});

const ORIGIN = "http://localhost:3000";
const PASSWORD = "synthetic-pass-2026";
let passwordHash = "";

type Who = "sa" | "admin" | "manager" | "counsellor" | "signed_out";
const ids = { sa: "", admin: "", manager: "", counsellor: "" };

function as(who: Who) {
  session.current = who === "signed_out" ? null : { userId: ids[who], role: who === "sa" || who === "admin" ? "admin" : "staff", displayName: `Test ${who}` };
}

function request(path: string, init: { method?: string; body?: unknown; origin?: string } = {}) {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = { origin: init.origin ?? ORIGIN, host: "localhost:3000" };
  if (method !== "GET") headers["content-type"] = "application/json";
  return new NextRequest(`${ORIGIN}${path}`, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("INTEGRATIONS_SECRET", TEST_INTEGRATIONS_SECRET);
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", "");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  passwordHash ||= await hashPassword(PASSWORD, { N: 2 ** 14, r: 8, p: 1 });
  const db = getDb();
  const now = Date.now();
  const user = (loginId: string, role: "admin" | "staff") => insertUser(db, { role, loginId, displayName: loginId, passwordHash, mustChangePassword: false, now }).id;
  ids.sa = user("sa.meta", "admin");
  ids.admin = user("admin.meta", "admin");
  ids.manager = user("head.meta", "staff");
  ids.counsellor = user("exec.meta", "staff");
  upsertGrant(db, { userId: ids.sa, via: "cli", by: null, now });
  writeStaffMembership(db, ids.sa, ids.manager, { crmRole: "manager", centreSlugs: [], active: true }, now);
  writeStaffMembership(db, ids.sa, ids.counsellor, { crmRole: "counsellor", centreSlugs: [], active: true }, now);
  as("sa");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const PATH = "/api/crm/integrations/meta";

describe("GET /api/crm/integrations/meta", () => {
  it("shows super admins the setup (secret STATES and the verify token) and never a secret value", async () => {
    configureMeta(getDb());
    const res = await config.GET(request(PATH));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const text = await res.text();
    expect(text).not.toContain(TEST_APP_SECRET);
    expect(text).not.toContain(TEST_ACCESS_TOKEN);
    const data = JSON.parse(text).data;
    expect(data.readiness).toMatchObject({ ready: true, keyConfigured: true });
    expect(data.admin.secrets.app_secret).toMatchObject({ set: true, keyOk: "current" });
    expect(data.admin.config.value).toMatchObject({ pageId: kit.PAGE_ID, enabled: true });
    expect(data.callbackUrl).toBe("http://localhost:3000/api/integrations/meta/webhook");
  });

  it("gives admins and area heads the status only; executives 403; signed out 401", async () => {
    configureMeta(getDb());
    for (const who of ["admin", "manager"] as const) {
      as(who);
      const res = await json(await config.GET(request(PATH)));
      expect(res.status, who).toBe(200);
      expect(res.body.data.admin, who).toBeUndefined();
      expect(res.body.data.counts, who).toBeDefined();
    }
    as("counsellor");
    expect((await config.GET(request(PATH))).status).toBe(403);
    as("signed_out");
    expect((await config.GET(request(PATH))).status).toBe(401);
  });
});

describe("PUT /api/crm/integrations/meta (super admin only)", () => {
  it("saves with the version lock, audits { version, enabled }, refuses others", async () => {
    const first = await json(await config.PUT(request(PATH, { method: "PUT", body: { config: { appId: "1234567890123", pageId: kit.PAGE_ID, enabled: true }, expectedVersion: 0 } })));
    expect(first.status).toBe(200);
    expect(first.body.data.admin.config).toMatchObject({ version: 1, value: { appId: "1234567890123", enabled: true } });
    expect((await config.PUT(request(PATH, { method: "PUT", body: { config: { enabled: false }, expectedVersion: 0 } }))).status).toBe(409);
    const bad = await json(await config.PUT(request(PATH, { method: "PUT", body: { config: { testPhone: "9812345679", appId: "abc" }, expectedVersion: 1 } })));
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.fieldErrors)).toEqual(expect.arrayContaining(["testPhone", "appId"]));
    const audit = listAudit(getDb(), { limit: 10 }).filter((entry) => entry.action === "crm.meta_config");
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toEqual({ version: 1, enabled: true });
    for (const who of ["admin", "manager", "counsellor"] as const) {
      as(who);
      expect((await config.PUT(request(PATH, { method: "PUT", body: { config: { enabled: false }, expectedVersion: 1 } }))).status, who).toBe(403);
    }
    as("sa");
    expect((await config.PUT(request(PATH, { method: "PUT", body: { config: { enabled: false }, expectedVersion: 1 }, origin: "https://attacker.example" }))).status).toBe(403);
  });
});

describe("/api/crm/integrations/meta/secrets (super admin + current password)", () => {
  const put = (body: unknown) => secrets.PUT(request(`${PATH}/secrets`, { method: "PUT", body }));

  it("needs the current password; stores the value sealed and answers with states only; audited { slot }", async () => {
    const wrong = await json(await put({ name: "app_secret", value: TEST_APP_SECRET, currentPassword: "not-my-password" }));
    expect(wrong.status).toBe(422);
    expect(wrong.body.fieldErrors.currentPassword).toBeDefined();
    const res = await put({ name: "app_secret", value: TEST_APP_SECRET, currentPassword: PASSWORD });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(TEST_APP_SECRET);
    const data = JSON.parse(text).data;
    expect(data.secrets.app_secret).toMatchObject({ set: true, keyOk: "current", updatedBy: ids.sa });
    expect(data.secrets.verify_token.set).toBe(true); // created with the app secret
    const audits = listAudit(getDb(), { limit: 10 }).filter((entry) => entry.action === "crm.meta_secret_set");
    expect(audits.map((entry) => entry.details)).toEqual(expect.arrayContaining([{ slot: "app_secret" }, { slot: "verify_token" }]));
    expect(JSON.stringify(listAudit(getDb(), { limit: 50 }))).not.toContain(TEST_APP_SECRET);
  });

  it("refuses a value that does not look like Meta's, other roles, and a missing server key", async () => {
    expect((await put({ name: "app_secret", value: "short", currentPassword: PASSWORD })).status).toBe(422);
    expect((await put({ name: "verify_token", value: "x".repeat(43), currentPassword: PASSWORD })).status).toBe(422);
    for (const who of ["admin", "manager", "counsellor"] as const) {
      as(who);
      expect((await put({ name: "access_token", value: TEST_ACCESS_TOKEN, currentPassword: PASSWORD })).status, who).toBe(403);
    }
    as("sa");
    vi.stubEnv("INTEGRATIONS_SECRET", "");
    expect((await put({ name: "access_token", value: TEST_ACCESS_TOKEN, currentPassword: PASSWORD })).status).toBe(503);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_integration_secrets").get()).toEqual({ n: 0 });
  });

  it("a new token lifts an auth pause and drops the old Page token; DELETE needs the password too", async () => {
    configureMeta(getDb());
    const { storeMetaSecret } = await import("@/lib/crm/meta/config");
    const { updateMetaStatus, readMetaStatus } = await import("@/lib/crm/meta/status");
    storeMetaSecret(getDb(), "page_token", "EAAsyntheticPageTokenForTestsOnly0123456789", { actorId: null, now: Date.now(), audit: false });
    updateMetaStatus(getDb(), { paused: "auth", pausedAt: new Date().toISOString() }, Date.now());
    expect((await put({ name: "access_token", value: TEST_ACCESS_TOKEN, currentPassword: PASSWORD })).status).toBe(200);
    expect(readMetaStatus(getDb()).paused).toBeNull();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_integration_secrets WHERE name = 'page_token'").get()).toEqual({ n: 0 });
    const del = (body: unknown) => secrets.DELETE(request(`${PATH}/secrets`, { method: "DELETE", body }));
    expect((await del({ name: "access_token", currentPassword: "nope" })).status).toBe(422);
    const removed = await json(await del({ name: "access_token", currentPassword: PASSWORD }));
    expect(removed.status).toBe(200);
    expect(removed.body.data.secrets.access_token.set).toBe(false);
    expect(listAudit(getDb(), { limit: 5 }).find((entry) => entry.action === "crm.meta_secret_delete")?.details).toEqual({ slot: "access_token" });
  });
});

describe("POST /api/crm/integrations/meta/actions (super admin only)", () => {
  const post = (body: unknown) => actions.POST(request(`${PATH}/actions`, { body }));

  it("refuses others; test mode needs a valid own number; audits { action }", async () => {
    for (const who of ["admin", "manager", "counsellor"] as const) {
      as(who);
      expect((await post({ action: "reseal" })).status, who).toBe(403);
    }
    as("sa");
    expect((await post({ action: "test_mode", on: true })).status).toBe(422);
    expect((await post({ action: "unknown" })).status).toBe(422);
    const on = await json(await post({ action: "test_mode", on: true, phone: "98123 45679" }));
    expect(on.status).toBe(200);
    expect(on.body.data).toMatchObject({ action: "test_mode", ok: true, testMode: { active: true } });
    expect(listAudit(getDb(), { limit: 5 })[0]).toMatchObject({ action: "crm.meta_action", details: { action: "test_mode", on: true } });
  });

  it("makes a verify token for super admins; 503 without the server key; a not-configured action fails with a fixed code", async () => {
    const made = await json(await post({ action: "regenerate_verify_token" }));
    expect(made.status).toBe(200);
    expect(made.body.data.verifyToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const check = await json(await post({ action: "check" }));
    expect(check.body.data).toEqual({ action: "check", ok: false, code: "not_configured", checks: [] });
    vi.stubEnv("INTEGRATIONS_SECRET", "");
    expect((await post({ action: "regenerate_verify_token" })).status).toBe(503);
  });
});

describe("GET /api/crm/integrations/meta/inbox (super admin only)", () => {
  it("lists ids and fixed codes for super admins; everyone else 403; unknown status 400", async () => {
    insertInboxRow(getDb(), { leadgenId: kit.LEAD_ID, via: "webhook", status: "pending", now: Date.now() });
    getDb().prepare("UPDATE crm_meta_inbox SET status = 'failed', last_error = 'invalid_phone'").run();
    const res = await json(await inbox.GET(request(`${PATH}/inbox`)));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([expect.objectContaining({ leadgenId: kit.LEAD_ID, status: "failed", lastError: "invalid_phone" })]);
    expect(res.body.data.counts.failed).toBe(1);
    expect((await inbox.GET(request(`${PATH}/inbox?status=imported`))).status).toBe(200);
    expect((await inbox.GET(request(`${PATH}/inbox?status=nope`))).status).toBe(400);
    for (const who of ["admin", "manager", "counsellor"] as const) {
      as(who);
      expect((await inbox.GET(request(`${PATH}/inbox`))).status, who).toBe(403);
    }
  });
});
