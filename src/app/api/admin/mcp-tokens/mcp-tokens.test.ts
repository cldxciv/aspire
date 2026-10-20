import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Admin MCP access-token APIs (MCP-ADMIN) against a fresh in-memory database per test, with real
// sessions (login route → cookie → getSession()). Synthetic accounts only.
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
const { createSession } = await import("@/lib/auth/sessions");
const { listAudit } = await import("@/lib/db/audit");
const { hashMcpToken, resolveMcpToken } = await import("@/lib/mcp/tokens");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const login = await import("@/app/api/auth/login/route");
const tokens = await import("./route");
const tokenById = await import("./[tokenId]/route");
const { MCP_TOKEN_WRITE_LIMIT, resetMcpTokenLimitersForTests } = await import("./shared");

type Browser = InstanceType<typeof TestBrowser>;

const ADMIN = { role: "admin" as const, loginId: "admin.one", password: "admin-pass-2026", displayName: "Office Admin" };
const VIEW_KEYS = ["createdAt", "createdByName", "expiresAt", "id", "lastUsedAt", "name", "revokedAt", "scopes", "status"];

let ipCounter = 0;
function browser() {
  ipCounter += 1;
  return new TestBrowser(cookieState, `198.18.1.${ipCounter % 250}`);
}

/** Signs in through the real login route (cookie set by the response). */
async function signedIn(credentials: { loginId: string; password: string }): Promise<Browser> {
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: credentials });
  expect(response.status).toBe(200);
  return b;
}

/** A real database session for `userId` (skips the login route's scrypt check to keep tests light). */
function withSession(userId: string): Browser {
  const b = browser();
  b.jar.set("aspire_session", createSession(userId).token);
  return b;
}

async function asAdmin(): Promise<{ b: Browser; adminId: string }> {
  const admin = await createTestUser(ADMIN);
  return { b: withSession(admin.id), adminId: admin.id };
}

const api = {
  list: (b: Browser) => b.send(tokens.GET, "/api/admin/mcp-tokens"),
  create: (b: Browser, body: unknown, options = {}) => b.send(tokens.POST, "/api/admin/mcp-tokens", { body, ...options }),
  revoke: (b: Browser, tokenId: string, options = {}) =>
    b.send(tokenById.DELETE, `/api/admin/mcp-tokens/${tokenId}`, { method: "DELETE", ...options }, params({ tokenId })),
};

type Created = {
  token: string;
  mcpUrl: string;
  record: { id: string; name: string; scopes: string; status: string; expiresAt: string; createdAt: string; revokedAt: string | null };
};

async function create(b: Browser, body: Record<string, unknown> = { name: "Office laptop", scopes: "read" }): Promise<Created> {
  const response = await api.create(b, body);
  expect(response.status).toBe(201);
  return (await response.json()).data as Created;
}

const someId = "00000000-0000-4000-8000-000000000000";

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetMcpTokenLimitersForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("access control (deny by default)", () => {
  const calls = (b: Browser) => [api.list(b), api.create(b, { name: "Some token", scopes: "read" }), api.revoke(b, someId)];

  it("requires a session: 401 for every endpoint, never cached or indexed", async () => {
    for (const response of await Promise.all(calls(browser()))) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toMatch(/noindex/);
    }
  });

  it("forbids students and parents: 403 for every endpoint", async () => {
    const student = await createTestUser({ role: "student", loginId: "learner.one", password: "learner-pass-2026" });
    const parent = await createTestUser({ role: "parent", loginId: "parent.one", password: "parent-pass-2026" });
    for (const user of [student, parent]) {
      const b = withSession(user.id);
      for (const response of await Promise.all(calls(b))) expect(response.status).toBe(403);
    }
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM mcp_tokens").get()?.n).toBe(0);
  });

  it("forbids an admin who still has a temporary password (403 on every endpoint)", async () => {
    const admin = await createTestUser({ ...ADMIN, mustChangePassword: true });
    const b = withSession(admin.id);
    for (const response of await Promise.all(calls(b))) {
      expect(response.status).toBe(403);
      expect((await response.json()).message).toMatch(/temporary password/);
    }
  });

  it("allows an admin signed in through the login route (200 list, private headers)", async () => {
    await createTestUser(ADMIN);
    const b = await signedIn(ADMIN);
    const response = await api.list(b);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(await response.json()).toEqual({ ok: true, data: [] });
  });

  it("refuses cross-origin writes even from an admin, and changes nothing", async () => {
    const { b } = await asAdmin();
    const { record } = await create(b);
    const evil = { origin: "https://evil.example" };
    expect((await api.create(b, { name: "Evil token", scopes: "read write" }, evil)).status).toBe(403);
    expect((await api.revoke(b, record.id, evil)).status).toBe(403);
    expect((await api.revoke(b, record.id, { origin: null })).status).toBe(403);
    const list = (await (await api.list(b)).json()).data as Created["record"][];
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("active");
  });
});

describe("create: validation", () => {
  it.each([
    ["missing name", { scopes: "read" }, "name"],
    ["name too short", { name: "ab", scopes: "read" }, "name"],
    ["name too long", { name: "x".repeat(61), scopes: "read" }, "name"],
    ["name of spaces", { name: "     ", scopes: "read" }, "name"],
    ["name with a control character", { name: "bad\u0007name", scopes: "read" }, "name"],
    ["name with a bidi override", { name: `safe${String.fromCharCode(0x202e)}txt.exe`, scopes: "read" }, "name"],
    ["name not a string", { name: 12345, scopes: "read" }, "name"],
    ["unknown scope", { name: "Laptop", scopes: "write" }, "scopes"],
    ["scope array", { name: "Laptop", scopes: ["read"] }, "scopes"],
    ["expiry 0", { name: "Laptop", scopes: "read", expiresInDays: 0 }, "expiresInDays"],
    ["expiry 366", { name: "Laptop", scopes: "read", expiresInDays: 366 }, "expiresInDays"],
    ["fractional expiry", { name: "Laptop", scopes: "read", expiresInDays: 1.5 }, "expiresInDays"],
    ["expiry as a string", { name: "Laptop", scopes: "read", expiresInDays: "90" }, "expiresInDays"],
  ])("422 for %s", async (_label, body, field) => {
    const { b } = await asAdmin();
    const response = await api.create(b, body);
    expect(response.status).toBe(422);
    const json = await response.json();
    expect(json).toMatchObject({ ok: false, error: "validation" });
    expect(Object.keys(json.fieldErrors)).toContain(field);
  });

  it("422 for unknown fields (a client cannot choose createdBy)", async () => {
    const { b } = await asAdmin();
    const response = await api.create(b, { name: "Laptop", scopes: "read", createdBy: someId });
    expect(response.status).toBe(422);
  });

  it("JSON only (415), at most 4 KB (413), a JSON object (400)", async () => {
    const { b } = await asAdmin();
    expect((await api.create(b, "name=x", { contentType: "text/plain" })).status).toBe(415);
    expect((await api.create(b, { name: "x".repeat(5000), scopes: "read" })).status).toBe(413);
    expect((await api.create(b, "{not json")).status).toBe(400);
    expect((await api.create(b, "[1,2]")).status).toBe(400);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM mcp_tokens").get()?.n).toBe(0);
  });

  it("defaults to read-only and 90 days; normalises the name; accepts Hindi names", async () => {
    const { b } = await asAdmin();
    const before = Date.now();
    const { record } = await create(b, { name: "  Office   laptop  " });
    expect(record.scopes).toBe("read");
    expect(record.name).toBe("Office laptop");
    const days = (Date.parse(record.expiresAt) - Date.parse(record.createdAt)) / 86_400_000;
    expect(days).toBe(90);
    expect(Date.parse(record.createdAt)).toBeGreaterThanOrEqual(before - 1000);
    const hindi = await create(b, { name: "ऑफ़िस लैपटॉप", scopes: "read write", expiresInDays: 7 });
    expect(hindi.record).toMatchObject({ name: "ऑफ़िस लैपटॉप", scopes: "read write", status: "active" });
  });
});

describe("create: the token is shown once", () => {
  it("returns the plaintext token and a Claude Code endpoint once; the list never has the token or its hash", async () => {
    const { b, adminId } = await asAdmin();
    const created = await create(b, { name: "Office laptop", scopes: "read", expiresInDays: 30 });
    expect(created.token).toMatch(/^asp_mcp_[A-Za-z0-9_-]{43}$/);
    expect(created.mcpUrl).toBe("http://localhost:3000/api/mcp");
    expect(Object.keys(created.record).sort()).toEqual(VIEW_KEYS);
    expect(created.record).toMatchObject({ name: "Office laptop", scopes: "read", status: "active", revokedAt: null });

    const listResponse = await api.list(b);
    const text = await listResponse.text();
    expect(text).not.toContain(created.token);
    expect(text).not.toContain(hashMcpToken(created.token));
    expect(text).not.toMatch(/token_?hash|tokenHash/i);
    expect(text).not.toContain(adminId); // creator shown by display name only
    const list = JSON.parse(text).data as Record<string, unknown>[];
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(VIEW_KEYS);
    expect(list[0]).toMatchObject({ id: created.record.id, createdByName: ADMIN.displayName, lastUsedAt: null });

    // The token really works against the MCP token store.
    expect(resolveMcpToken(created.token)).toMatchObject({ ok: true, caller: { tokenId: created.record.id, scopes: "read" } });
  });

  it("is audited by the token module without the secret", async () => {
    const { b, adminId } = await asAdmin();
    const created = await create(b);
    const entries = listAudit(getDb(), { limit: 20 }).filter((entry) => entry.action.startsWith("mcp."));
    expect(entries).toEqual([expect.objectContaining({ action: "mcp.token_create", actorId: adminId, target: created.record.id })]);
    expect(JSON.stringify(entries)).not.toContain(created.token);
  });

  it("lists newest first and shows status", async () => {
    const { b } = await asAdmin();
    const first = await create(b, { name: "First token" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await create(b, { name: "Second token", scopes: "read write" });
    const list = (await (await api.list(b)).json()).data as Created["record"][];
    expect(list.map((t) => t.id)).toEqual([second.record.id, first.record.id]);
    expect(list.map((t) => t.status)).toEqual(["active", "active"]);
  });

  it("builds the endpoint from NEXT_PUBLIC_SITE_URL in production", async () => {
    const { b } = await asAdmin();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://aspire.example.com/some/path");
    const created = await create(b);
    expect(created.mcpUrl).toBe("https://aspire.example.com/api/mcp");
  });
});

describe("revoke", () => {
  it("revokes immediately, is idempotent and audited once", async () => {
    const { b, adminId } = await asAdmin();
    const created = await create(b);
    const response = await api.revoke(b, created.record.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain(created.token);
    const revoked = JSON.parse(text).data;
    expect(Object.keys(revoked).sort()).toEqual(VIEW_KEYS);
    expect(revoked).toMatchObject({ id: created.record.id, status: "revoked" });
    expect(revoked.revokedAt).toEqual(expect.any(String));
    expect(resolveMcpToken(created.token)).toEqual({ ok: false, reason: "revoked" });

    const again = await api.revoke(b, created.record.id);
    expect(again.status).toBe(200);
    expect((await again.json()).data.revokedAt).toBe(revoked.revokedAt);

    const list = (await (await api.list(b)).json()).data as Created["record"][];
    expect(list[0].status).toBe("revoked");
    const revokes = listAudit(getDb(), { limit: 20 }).filter((entry) => entry.action === "mcp.token_revoke");
    expect(revokes).toEqual([expect.objectContaining({ actorId: adminId, target: created.record.id })]);
  });

  it("404 for an unknown id, 400 for a malformed one", async () => {
    const { b } = await asAdmin();
    expect((await api.revoke(b, someId)).status).toBe(404);
    expect((await api.revoke(b, "bad id!")).status).toBe(400);
    expect((await api.revoke(b, "x".repeat(101))).status).toBe(400);
  });
});

describe("rate limiting", () => {
  it(`allows ${MCP_TOKEN_WRITE_LIMIT.limit} writes per admin per window, then 429 with Retry-After`, async () => {
    const { b } = await asAdmin();
    for (let i = 0; i < MCP_TOKEN_WRITE_LIMIT.limit; i += 1) expect((await api.revoke(b, someId)).status).toBe(404);
    const blocked = await api.create(b, { name: "One too many" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(blocked.headers.get("cache-control")).toBe("no-store");
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM mcp_tokens").get()?.n).toBe(0);
    // Reads have their own, looser budget.
    expect((await api.list(b)).status).toBe(200);
  });
});
