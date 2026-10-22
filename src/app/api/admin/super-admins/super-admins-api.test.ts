import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/admin/super-admins (D-044; docs/lead-routing-plan.md §11, §21) against a fresh in-memory
// database per test. Synthetic accounts only.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { isEffectiveSuperAdminRow } = await import("@/lib/db/super-admins");
const { AUTH_MESSAGES } = await import("@/lib/auth/messages");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const login = await import("@/app/api/auth/login/route");
const list = await import("./route");
const one = await import("./[userId]/route");
const rules = await import("@/app/api/crm/rules/route");
const staffMember = await import("@/app/api/crm/staff/[userId]/route");

type Browser = InstanceType<typeof TestBrowser>;

const PASSWORD = "synthetic-pass-2026";
let ipCounter = 0;

function browser(): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, `198.18.1.${ipCounter % 250}`);
}

async function signedIn(loginId: string): Promise<Browser> {
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } });
  expect(response.status).toBe(200);
  return b;
}

const api = {
  list: (b: Browser) => b.send(list.GET, "/api/admin/super-admins"),
  put: (b: Browser, userId: string, body: unknown, options = {}) =>
    b.send(one.PUT, `/api/admin/super-admins/${userId}`, { method: "PUT", body, ...options }, params({ userId })),
};

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("GET /api/admin/super-admins", () => {
  it("needs an admin; the only admin becomes super admin automatically (once, audited)", async () => {
    expect((await api.list(browser())).status).toBe(401);
    await createTestUser({ role: "student", loginId: "learner.one", password: PASSWORD });
    expect((await api.list(await signedIn("learner.one"))).status).toBe(403);

    const owner = await createTestUser({ role: "admin", loginId: "owner.one", password: PASSWORD, displayName: "Owner" });
    const b = await signedIn("owner.one");
    const response = await api.list(b);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = (await response.json()).data;
    expect(data).toMatchObject({ youAreSuperAdmin: true, bootstrapPending: false, items: [{ userId: owner.id, via: "bootstrap", grantedBy: null }] });
    expect(listAudit(getDb(), { limit: 20 }).filter((entry) => entry.action === "auth.super_admin_bootstrap")).toHaveLength(1);
  });
});

describe("PUT /api/admin/super-admins/:userId", () => {
  async function setup() {
    const owner = await createTestUser({ role: "admin", loginId: "owner.one", password: PASSWORD });
    const ownerBrowser = await signedIn("owner.one");
    await api.list(ownerBrowser); // bootstrap while the owner is the only admin
    const cmo = await createTestUser({ role: "admin", loginId: "cmo.one", password: PASSWORD });
    const cmoBrowser = await signedIn("cmo.one");
    return { owner, ownerBrowser, cmo, cmoBrowser };
  }

  it("is super-admin only, same-origin, and checks the current password", async () => {
    const { owner, ownerBrowser, cmo, cmoBrowser } = await setup();
    // An ordinary admin can read the list but not change it.
    expect((await (await api.list(cmoBrowser)).json()).data).toMatchObject({ youAreSuperAdmin: false });
    const refused = await api.put(cmoBrowser, cmo.id, { superAdmin: true, currentPassword: PASSWORD });
    expect(refused.status).toBe(403);
    expect((await refused.json()).message).toBe(AUTH_MESSAGES.superAdminOnly);
    expect((await api.put(ownerBrowser, cmo.id, { superAdmin: true, currentPassword: PASSWORD }, { origin: "https://evil.example" })).status).toBe(403);
    const wrong = await api.put(ownerBrowser, cmo.id, { superAdmin: true, currentPassword: "not-my-password" });
    expect(wrong.status).toBe(422);
    expect((await wrong.json()).fieldErrors).toEqual({ currentPassword: [AUTH_MESSAGES.wrongCurrentPassword] });
    expect((await api.put(ownerBrowser, cmo.id, { superAdmin: true })).status).toBe(422);

    const granted = await api.put(ownerBrowser, cmo.id, { superAdmin: true, currentPassword: PASSWORD });
    expect(granted.status).toBe(200);
    expect((await granted.json()).data.items.map((item: { userId: string }) => item.userId).sort()).toEqual([owner.id, cmo.id].sort());
    expect(isEffectiveSuperAdminRow(getDb(), cmo.id)).toBe(true);
    expect(JSON.stringify(listAudit(getDb(), { limit: 50 }))).not.toContain(PASSWORD);
  });

  it("409 for the last super admin, 422 for a non-admin target, 404 for an unknown one", async () => {
    const { owner, ownerBrowser } = await setup();
    const last = await api.put(ownerBrowser, owner.id, { superAdmin: false, currentPassword: PASSWORD });
    expect(last.status).toBe(409);
    expect((await last.json()).message).toBe(AUTH_MESSAGES.lastSuperAdmin);
    const staff = await createTestUser({ role: "staff", loginId: "staff.one", password: PASSWORD });
    expect((await api.put(ownerBrowser, staff.id, { superAdmin: true, currentPassword: PASSWORD })).status).toBe(422);
    expect((await api.put(ownerBrowser, "00000000-0000-4000-8000-000000000000", { superAdmin: true, currentPassword: PASSWORD })).status).toBe(404);
    expect((await api.put(ownerBrowser, "../x", { superAdmin: true, currentPassword: PASSWORD })).status).toBe(400);
  });
});

describe("super-admin-only CRM settings are refused to ordinary admins (server-side, not hidden UI)", () => {
  it("rules and staff memberships: 403 for an ordinary admin, 200 for the super admin", async () => {
    await createTestUser({ role: "admin", loginId: "owner.one", password: PASSWORD });
    const ownerBrowser = await signedIn("owner.one");
    await api.list(ownerBrowser);
    await createTestUser({ role: "admin", loginId: "cmo.one", password: PASSWORD });
    const cmoBrowser = await signedIn("cmo.one");
    const staff = await createTestUser({ role: "staff", loginId: "staff.one", password: PASSWORD });

    const putRules = (b: Browser) => b.send(rules.PUT, "/api/crm/rules", { method: "PUT", body: { rules: [] } });
    const putStaff = (b: Browser) =>
      b.send(staffMember.PUT, `/api/crm/staff/${staff.id}`, { method: "PUT", body: { crmRole: "counsellor" } }, params({ userId: staff.id }));
    expect((await putRules(cmoBrowser)).status).toBe(403);
    expect((await putStaff(cmoBrowser)).status).toBe(403);
    expect((await putRules(ownerBrowser)).status).toBe(200);
    expect((await putStaff(ownerBrowser)).status).toBe(200);
  });
});
