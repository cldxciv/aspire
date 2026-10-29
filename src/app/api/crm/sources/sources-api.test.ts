import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/crm/sources and GET / PUT /api/crm/settings/centre-links (1B-SOURCES;
// docs/admin-phase-1b-plan.md §5.J, §7, §8) against a fresh in-memory database, through the real
// auth (sign-in, session cookie, same-origin checks). Synthetic people, hosts and numbers only.
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
const { createTestUser, TestBrowser } = await import("@/lib/auth/testing/harness");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { sourcesRequests } = await import("@/components/console/sources/api");
const login = await import("@/app/api/auth/login/route");
const sources = await import("./route");
const links = await import("../settings/centre-links/route");

type Browser = InstanceType<typeof TestBrowser>;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "synthetic-pass-2026";
const HOUR = 3_600_000;
let ip = 0;
let phone = 0;
const browser = (): Browser => new TestBrowser(cookieState, `198.51.100.${(ip += 1) % 250}`);

async function signedIn(loginId: string): Promise<Browser> {
  const b = browser();
  expect((await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } })).status).toBe(200);
  return b;
}

async function staffUser(loginId: string, crmRole: "counsellor" | "manager", centreSlugs: string[] = []) {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs, active: true }, Date.now());
  return user;
}

function lead(centreSlug: string | null, referrer: string | null) {
  phone += 1;
  const result = captureLead(
    {
      source: "admissions",
      studentName: "Synthetic Student",
      phone: `96000${String(phone).padStart(5, "0")}`,
      centreSlug,
      consent: { textVersion: "2026-10-20.v2" },
      context: { referrer },
    },
    Date.now() - HOUR,
  );
  if (!result.ok) throw new Error("capture failed");
  return result.leadId;
}

const call = (b: Browser, handler: (request: never) => Promise<Response>, request: { path: string; method: string; body?: unknown }, options: { origin?: string | null } = {}) =>
  b.send(handler as never, request.path, { method: request.method, body: request.body, ...options });

/** The bootstrap super admin (the only admin when it first signs in), a plain admin, an area head (Shimla) and a counsellor. */
async function people() {
  const owner = await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
  const sa = await signedIn("owner.sa");
  expect((await call(sa, links.GET, sourcesRequests.getCentreLinks())).status).toBe(200); // bootstraps the super admin grant
  await createTestUser({ role: "admin", loginId: "plain.admin", password: PASSWORD });
  await staffUser("head.shimla", "manager", ["shimla"]);
  await staffUser("exec.one", "counsellor");
  return { owner, sa };
}

const centreAudit = () => listAudit(getDb(), { limit: 100 }).filter((entry) => entry.action === "settings.centre_links_update");

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  phone = 0;
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("GET /api/crm/sources", () => {
  it("answers CRM admins (everything) and area heads (their scope); never counsellors or strangers", async () => {
    const { sa } = await people();
    lead("shimla", "chatgpt.com");
    lead("shimla", null);
    lead("kangra", "www.google.com");

    const anonymous = await call(browser(), sources.GET, sourcesRequests.report({ range: "30d" }));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    expect(anonymous.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await call(await signedIn("exec.one"), sources.GET, sourcesRequests.report())).status).toBe(403);

    const all = await call(sa, sources.GET, sourcesRequests.report({ range: "30d" }));
    expect(all.status).toBe(200);
    const report = (await all.json()).data;
    expect(report).toMatchObject({ total: 3, range: { key: "30d" }, centre: null });
    expect(report.channels.find((row: { channel: string }) => row.channel === "ai_assistants").enquiries).toBe(1);
    expect(report.tools.usage.days).toHaveLength(14);

    const head = await call(await signedIn("head.shimla"), sources.GET, sourcesRequests.report({ range: "30d" }));
    expect(head.status).toBe(200);
    const scoped = (await head.json()).data;
    expect(scoped.total).toBe(2);
    expect(scoped.tools.usage).toBeNull(); // usage rows: admins only
    const plain = await call(await signedIn("plain.admin"), sources.GET, sourcesRequests.report({ centre: "kangra" }));
    expect((await plain.json()).data).toMatchObject({ total: 1, centre: "kangra", range: { key: "90d" } });
  });

  it("refuses a range or centre it cannot use (422) instead of guessing", async () => {
    const { sa } = await people();
    const bad = await call(sa, sources.GET, sourcesRequests.report({ from: "2026-10-09", to: "2026-10-01" }));
    expect(bad.status).toBe(422);
    expect(Object.keys((await bad.json()).fieldErrors)).toEqual(["range"]);
    const centre = await call(sa, sources.GET, sourcesRequests.report({ centre: "Not A Slug" }));
    expect(centre.status).toBe(422);
    expect(Object.keys((await centre.json()).fieldErrors)).toEqual(["centre"]);
    expect((await call(sa, sources.GET, sourcesRequests.report({ range: "session", centre: "none" }))).status).toBe(200);
  });
});

describe("/api/crm/settings/centre-links", () => {
  it("lets CRM admins and area heads read; counsellors never", async () => {
    await people();
    const head = await call(await signedIn("head.shimla"), links.GET, sourcesRequests.getCentreLinks());
    expect(head.status).toBe(200);
    expect((await head.json()).data).toMatchObject({ key: "centre_links", value: { centres: {} }, version: 0, isDefault: true });
    expect((await call(await signedIn("exec.one"), links.GET, sourcesRequests.getCentreLinks())).status).toBe(403);
    expect((await call(browser(), links.GET, sourcesRequests.getCentreLinks())).status).toBe(401);
  });

  it("lets only super admins save (403 for admins, area heads, counsellors and other origins)", async () => {
    const { sa } = await people();
    const body = sourcesRequests.saveCentreLinks({ shimla: { mapsUrl: "https://maps.app.goo.gl/Synthetic1" } }, 0);
    for (const loginId of ["plain.admin", "head.shimla", "exec.one"]) {
      expect((await call(await signedIn(loginId), links.PUT, body)).status, loginId).toBe(403);
    }
    expect((await call(sa, links.PUT, body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(browser(), links.PUT, body)).status).toBe(401);
    expect(centreAudit()).toEqual([]);
  });

  it("saves with the optimistic lock, validates every link, and audits counts only", async () => {
    const { owner, sa } = await people();
    const saved = await call(
      sa,
      links.PUT,
      sourcesRequests.saveCentreLinks({ shimla: { mapsUrl: "https://maps.app.goo.gl/Synthetic1" }, kangra: { mapsUrl: "https://www.google.com/maps/place/Synthetic" }, mandi: { mapsUrl: null } }, 0),
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({
      version: 1,
      value: { centres: { shimla: { mapsUrl: "https://maps.app.goo.gl/Synthetic1" }, kangra: { mapsUrl: "https://www.google.com/maps/place/Synthetic" }, mandi: { mapsUrl: null } } },
    });
    expect(centreAudit()).toEqual([expect.objectContaining({ actorId: owner.id, target: "centre_links", details: { centres: 2, version: 1 } })]);
    expect(JSON.stringify(centreAudit())).not.toMatch(/goo\.gl|google\.com/);

    // Someone saved meanwhile → 409, nothing written.
    const stale = await call(sa, links.PUT, sourcesRequests.saveCentreLinks({ shimla: { mapsUrl: null } }, 0));
    expect(stale.status).toBe(409);

    for (const mapsUrl of ["http://maps.app.goo.gl/x", "https://evil.example/maps", "https://www.google.com/search?q=x", `https://maps.app.goo.gl/${"a".repeat(300)}`]) {
      const invalid = await call(sa, links.PUT, sourcesRequests.saveCentreLinks({ shimla: { mapsUrl } }, 1));
      expect(invalid.status, mapsUrl).toBe(422);
      expect(Object.keys((await invalid.json()).fieldErrors), mapsUrl).toEqual(["centres.shimla.mapsUrl"]);
    }
    const strict = await call(sa, links.PUT, { path: "/api/crm/settings/centre-links", method: "PUT", body: { centres: {}, expectedVersion: 1, extra: true } });
    expect(strict.status).toBe(422);
    const badSlug = await call(sa, links.PUT, sourcesRequests.saveCentreLinks({ "Bad Slug": { mapsUrl: null } }, 1));
    expect(badSlug.status).toBe(422);
    expect(centreAudit()).toHaveLength(1);

    const cleared = await call(sa, links.PUT, sourcesRequests.saveCentreLinks({ shimla: { mapsUrl: null } }, 1));
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data).toMatchObject({ version: 2, value: { centres: { shimla: { mapsUrl: null } } } });
    expect(centreAudit()[0]).toMatchObject({ details: { centres: 2, version: 2 } }); // shimla cleared, kangra dropped
  });
});
