import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/mcp end to end over simulated HTTP requests (no network), fresh in-memory database per test.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { findUserById, insertUser } = await import("@/lib/db/users");
const { insertParentLink } = await import("@/lib/db/links");
const { upsertTopic } = await import("@/lib/db/features/ask");
const { createSession } = await import("@/lib/auth/sessions");
const { istDateKey } = await import("@/lib/planner/dates");
const { createMcpToken, hashMcpToken, revokeMcpToken } = await import("@/lib/mcp/tokens");
const { resetMcpRateLimitsForTests, MCP_RATE_LIMITS } = await import("@/lib/mcp/auth");
const { MCP_SERVER_VERSION } = await import("@/lib/mcp/info");
const { runTool } = await import("@/lib/mcp/server");
const { MCP_SERVICES, normalizeScopes } = await import("@/lib/mcp/scopes");
const route = await import("./route");

const URL_MCP = "http://localhost:3000/api/mcp";
const PROTOCOL = "2025-11-25";

let ipCounter = 0;
let ip = "198.51.100.1";
/** Every response body/text seen in a test, for the "no secrets" checks. */
let seen: string[] = [];

type Json = Record<string, unknown>;

function request(
  body: unknown,
  options: { token?: string | null; headers?: Record<string, string>; method?: string; rawBody?: string } = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "mcp-protocol-version": PROTOCOL,
    "x-forwarded-for": ip,
    ...options.headers,
  };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const method = options.method ?? "POST";
  return new Request(URL_MCP, {
    method,
    headers,
    body: method === "POST" ? (options.rawBody ?? JSON.stringify(body)) : undefined,
  });
}

async function send(req: Request): Promise<{ status: number; headers: Headers; json: Json | null }> {
  const handler = req.method === "GET" ? route.GET : req.method === "DELETE" ? route.DELETE : route.POST;
  const response = await handler(req);
  const text = await response.text();
  seen.push(text);
  return { status: response.status, headers: response.headers, json: text ? (JSON.parse(text) as Json) : null };
}

let rpcId = 0;
async function rpc(token: string | null, method: string, params?: unknown, headers?: Record<string, string>) {
  rpcId += 1;
  return send(request({ jsonrpc: "2.0", id: rpcId, method, ...(params === undefined ? {} : { params }) }, { token, headers }));
}

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Json;
  isError?: boolean;
}

async function call(token: string, name: string, args: Json = {}): Promise<ToolResult> {
  const { status, json } = await rpc(token, "tools/call", { name, arguments: args });
  expect(status).toBe(200);
  return (json as { result: ToolResult }).result;
}

const NOW = Date.now();

function user(role: "admin" | "student" | "parent", loginId: string, displayName = `Test ${loginId}`) {
  return insertUser(getDb(), {
    role,
    loginId,
    displayName,
    passwordHash: "scrypt$32768$8$1$c2FsdA$aGFzaA",
    mustChangePassword: false,
    now: NOW,
  });
}

let admin: ReturnType<typeof user>;
let readToken: string;
let writeToken: string;
let readTokenId: string;
let writeTokenId: string;

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetMcpRateLimitsForTests();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  ipCounter += 1;
  ip = `198.51.100.${ipCounter % 250}`;
  seen = [];
  admin = user("admin", "admin.one", "Office Admin");
  const read = createMcpToken({ name: "Reader", scopes: "read", createdBy: admin.id });
  const write = createMcpToken({ name: "Writer", scopes: "read write", createdBy: admin.id });
  readToken = read.token;
  writeToken = write.token;
  readTokenId = read.record.id;
  writeTokenId = write.record.id;
});

afterEach(() => {
  // No response may ever contain a password hash, an MCP token or its hash.
  const all = seen.join("\n");
  expect(all).not.toContain("scrypt$");
  expect(all).not.toContain("asp_mcp_");
  expect(all).not.toContain(hashMcpToken(readToken));
  expect(all).not.toContain(hashMcpToken(writeToken));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
  resetMcpRateLimitsForTests();
});

function mcpAudit() {
  return listAudit(getDb(), { limit: 500 }).filter((entry) => entry.action.startsWith("mcp.") && entry.action !== "mcp.token_create");
}

// ---------------------------------------------------------------------------

describe("authentication", () => {
  it("401 with WWW-Authenticate: Bearer when the token is missing, malformed or unknown", async () => {
    for (const token of [null, "not-a-token", `asp_mcp_${"x".repeat(43)}`]) {
      const response = await rpc(token, "tools/list");
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/^Bearer realm="aspire-mcp"/);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.json).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 } });
    }
    const basic = await send(request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { headers: { authorization: "Basic dXNlcjpwYXNz" } }));
    expect(basic.status).toBe(401);
  });

  it("401 for revoked and expired tokens and for a disabled creator", async () => {
    revokeMcpToken(readTokenId, admin.id);
    expect((await rpc(readToken, "tools/list")).status).toBe(401);

    const shortLived = createMcpToken({ name: "short", expiresInDays: 1, createdBy: admin.id });
    vi.spyOn(Date, "now").mockReturnValue(NOW + 2 * 24 * 60 * 60 * 1000);
    const expired = await rpc(shortLived.token, "tools/list");
    expect(expired.status).toBe(401);
    expect(expired.headers.get("www-authenticate")).toContain('error="invalid_token"');
    vi.mocked(Date.now).mockRestore();

    getDb().prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(admin.id);
    expect((await rpc(writeToken, "tools/list")).status).toBe(401);
  });

  it("rejects browser requests from other sites, allows same-origin and non-browser clients", async () => {
    const evil = await rpc(readToken, "tools/list", undefined, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const nullOrigin = await rpc(readToken, "tools/list", undefined, { origin: "null" });
    expect(nullOrigin.status).toBe(403);
    const crossSite = await rpc(readToken, "tools/list", undefined, { "sec-fetch-site": "cross-site" });
    expect(crossSite.status).toBe(403);
    // The origin check runs before authentication: no token needed to be refused.
    expect((await rpc(null, "tools/list", undefined, { origin: "https://evil.example" })).status).toBe(403);

    const same = await rpc(readToken, "tools/list", undefined, { origin: "http://localhost:3000" });
    expect(same.status).toBe(200);
    expect((await rpc(readToken, "tools/list")).status).toBe(200);
  });

  it("GET and DELETE answer 405 (stateless server) after authentication", async () => {
    const get = await send(request(null, { token: readToken, method: "GET" }));
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
    expect(get.headers.get("cache-control")).toBe("no-store");
    expect((await send(request(null, { token: readToken, method: "DELETE" }))).status).toBe(405);
    expect((await send(request(null, { token: null, method: "GET" }))).status).toBe(401);
  });

  it("rate limits each token (120 per 10 minutes)", async () => {
    for (let i = 0; i < MCP_RATE_LIMITS.perToken.limit; i += 1) {
      const response = await send(request({ jsonrpc: "2.0", method: "notifications/initialized" }, { token: readToken }));
      expect(response.status).toBe(202);
    }
    const limited = await rpc(readToken, "tools/list");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await rpc(writeToken, "tools/list")).status).toBe(200);
  });

  it("blocks an IP after 20 failed authentications, even with a valid token", async () => {
    for (let i = 0; i < MCP_RATE_LIMITS.authFailuresPerIp.limit; i += 1) {
      expect((await rpc(`asp_mcp_${String(i).padStart(43, "0")}`, "tools/list")).status).toBe(401);
    }
    expect((await rpc(readToken, "tools/list")).status).toBe(429);
    ip = "203.0.113.9";
    expect((await rpc(readToken, "tools/list")).status).toBe(200);
  });

  it("413 for an oversized body, 400 for invalid JSON", async () => {
    const big = await send(request(null, { token: readToken, rawBody: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", pad: "x".repeat(70_000) }) }));
    expect(big.status).toBe(413);
    const bad = await send(request(null, { token: readToken, rawBody: "{not json" }));
    expect(bad.status).toBe(400);
    expect(bad.json).toMatchObject({ error: { code: -32700 } });
  });
});

describe("protocol", () => {
  it("initialize returns the server info, instructions and tools capability", async () => {
    const response = await rpc(readToken, "initialize", {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("mcp-session-id")).toBeNull();
    const result = (response.json as { result: Json }).result;
    expect(result.protocolVersion).toBe(PROTOCOL);
    expect(result.serverInfo).toMatchObject({ name: "aspire-website", version: MCP_SERVER_VERSION });
    expect(result.capabilities).toMatchObject({ tools: {} });
    expect(String(result.instructions)).toContain("minors");
  });

  it("tools/list returns every tool (full-access token) with correct annotations and object input schemas", async () => {
    const full = createMcpToken({
      name: "Full",
      scopes: MCP_SERVICES.flatMap((service) => (service.hasWrite ? [`${service.id}:write`] : [`${service.id}:read`])),
      createdBy: admin.id,
    });
    const response = await rpc(full.token, "tools/list");
    const tools = (response.json as { result: { tools: { name: string; description: string; annotations: Json; inputSchema: Json }[] } })
      .result.tools;
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect([...byName.keys()].sort()).toEqual(MCP_SERVICES.flatMap((service) => [...service.tools.read, ...service.tools.write]).sort());
    expect(byName.size).toBe(23);
    for (const name of MCP_SERVICES.flatMap((service) => service.tools.read)) {
      expect(byName.get(name)?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
    for (const name of MCP_SERVICES.flatMap((service) => service.tools.write)) {
      expect(byName.get(name)?.annotations).toMatchObject({ readOnlyHint: false });
      expect(byName.get(name)?.description).toMatch(/^WRITE/);
    }
    // Only account disabling and unlinking are destructive; no CRM tool deletes anything.
    const destructive = tools.filter((tool) => tool.annotations.destructiveHint === true).map((tool) => tool.name).sort();
    expect(destructive).toEqual(["set_account_disabled", "unlink_parent_student"]);
    expect(byName.get("create_account")?.annotations.destructiveHint).toBe(false);
    expect(byName.get("create_account")?.description).toContain("ONE-TIME temporary password");
    for (const tool of tools) expect(tool.inputSchema.type).toBe("object");
  });

  it("an unknown tool is an error result and is audited as 'unknown'", async () => {
    const result = await call(readToken, "drop_database", { "free text": "x" });
    expect(result.isError).toBe(true);
    const [entry] = mcpAudit();
    expect(entry).toMatchObject({ action: "mcp.call", actorId: admin.id, details: { tool: "unknown", mcpKeyId: readTokenId } });
  });

  it("invalid arguments are rejected by the input schema", async () => {
    const tooMany = await call(readToken, "list_accounts", { limit: 101 });
    expect(tooMany.isError).toBe(true);
    expect(tooMany.content[0].text).toContain("Input validation error");
    const badId = await call(readToken, "get_account", { id: "../../etc" });
    expect(badId.isError).toBe(true);
    const badRole = await call(writeToken, "create_account", { role: "admin", loginId: "new.admin", displayName: "X" });
    expect(badRole.isError).toBe(true);
    expect(findUserByLoginIdCount("new.admin")).toBe(0);
  });
});

function findUserByLoginIdCount(loginId: string): number {
  return Number(getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE login_id = ?").get(loginId)?.n ?? 0);
}

describe("read tools", () => {
  it("site_status reports configuration without secrets", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-secret-value");
    vi.stubEnv("ENQUIRY_DESTINATION", "webhook");
    vi.stubEnv("ENQUIRY_WEBHOOK_URL", "https://hooks.example.com/secret-path");
    vi.stubEnv("ENQUIRY_WEBHOOK_SECRET", "webhook-secret-0123456789");
    vi.stubEnv("PREVIEW_ACCESS_PASSWORD", "preview-password-123");
    const result = await call(readToken, "site_status");
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      server: { name: "aspire-website", version: MCP_SERVER_VERSION },
      enquiries: { delivery: "connected", webhook: "connected", storedAsCrmLeads: true, availableViaMcp: true },
      askAspire: { configured: true },
      previewPasswordGate: { enabled: true },
      mcp: {
        thisToken: {
          name: "Reader",
          scopes: ["site:read", "accounts:read", "progress:read", "audit:read", "content:read"],
          access: { site: "read", accounts: "read", progress: "read", audit: "read", content: "read", crm: "none" },
        },
      },
    });
    const text = JSON.stringify(result);
    for (const secret of ["sk-ant-test-secret-value", "secret-path", "webhook-secret-0123456789", "preview-password-123"]) {
      expect(text).not.toContain(secret);
    }
    // The text block carries the same data for clients that only read `content`.
    expect(result.content[0].text).toContain('"enquiries"');
  });

  it("site_status says where enquiries go (CRM leads, webhook, or nowhere)", async () => {
    vi.stubEnv("ENQUIRY_DESTINATION", "");
    vi.stubEnv("ENQUIRY_STORE", "off");
    const off = await call(readToken, "site_status");
    expect(off.structuredContent).toMatchObject({
      enquiries: { delivery: "not_configured", storedAsCrmLeads: false, webhook: "not_configured", availableViaMcp: false },
    });
    vi.stubEnv("ENQUIRY_STORE", "");
    const crm = await call(readToken, "site_status");
    expect(crm.structuredContent).toMatchObject({ enquiries: { delivery: "connected", storedAsCrmLeads: true, availableViaMcp: true } });
  });

  it("list_accounts filters, searches and paginates without password data", async () => {
    const s1 = user("student", "stu.alpha", "Asha Verma");
    user("student", "stu.beta", "Bhavna Rao");
    user("parent", "par.one", "Parent One");
    getDb().prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(s1.id);

    const students = await call(readToken, "list_accounts", { role: "student" });
    expect(students.structuredContent).toMatchObject({ total: 2, nextOffset: null });
    const accounts = (students.structuredContent as { accounts: Json[] }).accounts;
    expect(Object.keys(accounts[0]).sort()).toEqual(
      ["createdAt", "disabled", "displayName", "id", "loginId", "mustChangePassword", "role", "updatedAt"].sort(),
    );

    const active = await call(readToken, "list_accounts", { role: "student", status: "active" });
    expect((active.structuredContent as { accounts: Json[] }).accounts.map((a) => a.loginId)).toEqual(["stu.beta"]);

    const search = await call(readToken, "list_accounts", { search: "ASHA" });
    expect((search.structuredContent as { accounts: Json[] }).accounts.map((a) => a.loginId)).toEqual(["stu.alpha"]);

    const page = await call(readToken, "list_accounts", { limit: 1, offset: 1 });
    expect(page.structuredContent).toMatchObject({ total: 4, offset: 1, limit: 1, nextOffset: 2 });
    expect(page.content[0].text).toContain("offset 2");

    // Audit rows name the tool and token only, never the search text.
    const calls = mcpAudit().filter((entry) => entry.action === "mcp.call");
    expect(calls).toHaveLength(4);
    expect(calls.every((entry) => entry.details.tool === "list_accounts" && entry.details.mcpKeyId === readTokenId)).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("ASHA");
  });

  it("get_account returns links; unknown ids are a not_found error", async () => {
    const parent = user("parent", "par.one", "Parent One");
    const student = user("student", "stu.one", "Student One");
    insertParentLink(getDb(), { parentId: parent.id, studentId: student.id, createdBy: admin.id, now: NOW });

    const asParent = await call(readToken, "get_account", { id: parent.id });
    expect(asParent.structuredContent).toMatchObject({
      account: { id: parent.id, role: "parent", loginId: "par.one" },
      linkedStudents: [{ id: student.id, displayName: "Student One", loginId: "stu.one", disabled: false }],
    });
    const asStudent = await call(readToken, "get_account", { id: student.id });
    expect(asStudent.structuredContent).toMatchObject({ linkedParents: [{ id: parent.id }] });

    const missing = await call(readToken, "get_account", { id: "no-such-id" });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent).toMatchObject({ error: "not_found" });
  });

  it("list_audit_log filters by action prefix and pages with beforeId", async () => {
    await call(readToken, "site_status");
    await call(readToken, "site_status");
    const all = await call(readToken, "list_audit_log", { action: "mcp.", limit: 2 });
    const data = all.structuredContent as { entries: Json[]; nextBeforeId: number | null };
    expect(data.entries).toHaveLength(2);
    expect(data.entries.every((entry) => String(entry.action).startsWith("mcp."))).toBe(true);
    expect(data.entries[0]).toMatchObject({ action: "mcp.call", actorId: admin.id, actorName: "Office Admin" });
    expect(data.nextBeforeId).not.toBeNull();

    const next = await call(readToken, "list_audit_log", { action: "mcp.", beforeId: data.nextBeforeId as number, limit: 100 });
    const older = (next.structuredContent as { entries: Json[] }).entries;
    expect(older.length).toBeGreaterThan(0);
    expect(older.every((entry) => Number(entry.id) < (data.nextBeforeId as number))).toBe(true);

    const exact = await call(readToken, "list_audit_log", { action: "mcp.token_create" });
    expect((exact.structuredContent as { entries: Json[] }).entries).toHaveLength(2);
    const invalid = await call(readToken, "list_audit_log", { action: "DROP TABLE" });
    expect(invalid.isError).toBe(true);
  });

  it("get_student_progress returns counts and labels only", async () => {
    const student = user("student", "stu.one", "Student One");
    const parent = user("parent", "par.one");
    getDb()
      .prepare(
        `INSERT INTO mocktest_attempts (id, user_id, test_id, window_id, client_attempt_id, answers, time_spent, score, max_score,
          correct, wrong, unattempted, time_taken_sec, started_at, submitted_at, created_at)
         VALUES ('a1', ?, 'jee-sample-1', NULL, 'c1', '["ANSWER_MARKER"]', '[1]', 40, 100, 12, 3, 10, 1800, ?, ?, ?)`,
      )
      .run(student.id, NOW - 5000, NOW - 1000, NOW - 1000);
    getDb()
      .prepare("INSERT INTO planner_daily (user_id, day, xp, blocks, reviews) VALUES (?, ?, 30, 2, 5)")
      .run(student.id, istDateKey(NOW));
    upsertTopic(getDb(), { userId: student.id, subject: "physics", topicKey: "projectile motion", topic: "Projectile motion", now: NOW });

    const result = await call(readToken, "get_student_progress", { studentId: student.id });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      student: { id: student.id, displayName: "Student One" },
      mockTests: { totalAttempts: 1, testsTaken: 1, averageAccuracy: 0.8, bestByTest: [{ testId: "jee-sample-1", bestScore: 40, maxScore: 100, attempts: 1 }] },
      planner: { hasPlan: false, activeDaysLast30: 1, blocksDoneLast30: 2, reviewsLast30: 5 },
      askWeakTopics: [{ subject: "physics", topic: "Projectile motion", doubts: 1 }],
    });
    expect(JSON.stringify(result)).not.toContain("ANSWER_MARKER");

    const notStudent = await call(readToken, "get_student_progress", { studentId: parent.id });
    expect(notStudent.structuredContent).toMatchObject({ error: "not_a_student" });
  });

  it("list_programs, list_centres and list_results follow the website's visibility rules", async () => {
    const programs = await call(readToken, "list_programs", { exam: "NEET", limit: 100 });
    const programItems = (programs.structuredContent as { programs: Json[] }).programs;
    expect(programItems.length).toBeGreaterThan(0);
    expect(programItems.every((p) => (p.tracks as string[]).includes("NEET"))).toBe(true);
    expect(JSON.stringify(programItems)).not.toContain("sourceRef");

    const centres = await call(readToken, "list_centres", { limit: 100 });
    const centreItems = (centres.structuredContent as { centres: Json[] }).centres;
    expect(centreItems.length).toBeGreaterThan(0);
    expect(centreItems.every((c) => !("head" in c) && !("image" in c))).toBe(true);

    const rankers = await call(readToken, "list_results", { kind: "rankers", limit: 100 });
    const rankerData = rankers.structuredContent as { total: number; items: Json[]; nextOffset: number | null };
    expect(rankerData.items.length).toBeLessThanOrEqual(100);
    expect(JSON.stringify(rankerData)).not.toMatch(/photo|\.webp|result-cards/);

    const results = await call(readToken, "list_results", {});
    expect(JSON.stringify(results.structuredContent)).not.toMatch(/"photo"|"quote"|"school"/);

    // Production mode: placeholder (unverified) records disappear, exactly like on the website.
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const prod = await call(readToken, "list_results", { kind: "rankers" });
    const prodItems = (prod.structuredContent as { items: Json[] }).items;
    expect(prodItems.every((item) => item.placeholder === false)).toBe(true);
    const prodPrograms = await call(readToken, "list_programs", { limit: 100 });
    expect((prodPrograms.structuredContent as { programs: Json[] }).programs.every((p) => p.placeholder === false)).toBe(true);
  });
});

async function listedTools(token: string): Promise<string[]> {
  const response = await rpc(token, "tools/list");
  expect(response.status).toBe(200);
  return (response.json as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name);
}

/** Legacy whole-token scopes cover the services that existed then (not crm). */
const LEGACY_SERVICES = MCP_SERVICES.filter((service) => service.id !== "crm");
const READ_TOOLS = LEGACY_SERVICES.flatMap((service) => service.tools.read);
const WRITE_TOOLS = MCP_SERVICES.find((service) => service.id === "accounts")!.tools.write;
/** Full access, in service-catalogue order (each service's read tools, then its write tools). */
const ALL_TOOLS = LEGACY_SERVICES.flatMap((service) => [...service.tools.read, ...service.tools.write]);

describe("per-service scopes", () => {
  it("tools/list follows the token's scopes (legacy read, legacy read write, mixed)", async () => {
    expect(await listedTools(readToken)).toEqual(READ_TOOLS);
    expect(await listedTools(writeToken)).toEqual(ALL_TOOLS);

    const mixed = createMcpToken({ name: "Mixed", scopes: ["accounts:read", "content:read"], createdBy: admin.id });
    expect(await listedTools(mixed.token)).toEqual(["list_accounts", "get_account", "list_programs", "list_centres", "list_results"]);

    const accountsWrite = createMcpToken({ name: "Accounts writer", scopes: ["accounts:write"], createdBy: admin.id });
    expect(await listedTools(accountsWrite.token)).toEqual(["list_accounts", "get_account", ...WRITE_TOOLS]);

    const siteOnly = createMcpToken({ name: "Status", scopes: ["site:read"], createdBy: admin.id });
    expect(await listedTools(siteOnly.token)).toEqual(["site_status"]);
  });

  it("calls outside the token's scopes are forbidden and audited, inside them they work", async () => {
    const mixed = createMcpToken({ name: "Mixed", scopes: ["accounts:read", "content:read"], createdBy: admin.id });
    const student = user("student", "stu.one");

    const allowed = await call(mixed.token, "list_programs", { limit: 2 });
    expect(allowed.isError).toBeFalsy();
    expect((await call(mixed.token, "get_account", { id: student.id })).isError).toBeFalsy();

    for (const [tool, args] of [
      ["site_status", {}],
      ["list_audit_log", {}],
      ["get_student_progress", { studentId: student.id }],
      ["set_account_disabled", { userId: student.id, disabled: true }],
      ["create_account", { role: "student", loginId: "stu.x", displayName: "X" }],
    ] as const) {
      const denied = await call(mixed.token, tool, args as Json);
      expect(denied.isError).toBe(true);
      expect(denied.structuredContent).toMatchObject({ error: "forbidden" });
      expect(denied.content[0].text).toMatch(/needs the '(site|audit|progress|accounts):(read|write)' permission/);
    }
    // Even invalid arguments to an out-of-scope tool get "forbidden", not a schema error.
    expect((await call(mixed.token, "list_audit_log", { limit: 999 })).structuredContent).toMatchObject({ error: "forbidden" });

    expect(findUserById(getDb(), student.id)?.disabled).toBe(false);
    expect(findUserByLoginIdCount("stu.x")).toBe(0);
    const denials = mcpAudit().filter((entry) => entry.details.outcome === "forbidden");
    expect(denials.map((entry) => entry.action).sort()).toEqual(
      [
        "mcp.create_account",
        "mcp.get_student_progress",
        "mcp.list_audit_log",
        "mcp.list_audit_log",
        "mcp.set_account_disabled",
        "mcp.site_status",
      ].sort(),
    );
    expect(denials.every((entry) => entry.details.mcpKeyId === mixed.record.id && entry.actorId === admin.id)).toBe(true);
    const calls = mcpAudit().filter((entry) => entry.action === "mcp.call");
    expect(calls).toHaveLength(8);
    expect(calls[0].details.scopes).toBe("accounts:read content:read");
  });

  it("accounts:write allows the write tools", async () => {
    const writer = createMcpToken({ name: "Accounts writer", scopes: ["accounts:write"], createdBy: admin.id });
    const created = await call(writer.token, "create_account", { role: "parent", loginId: "par.new", displayName: "New Parent" });
    expect(created.isError).toBeFalsy();
    expect(findUserByLoginIdCount("par.new")).toBe(1);
    expect((await call(writer.token, "list_programs")).structuredContent).toMatchObject({ error: "forbidden" });
  });

  it("site_status reports this token's permissions per service", async () => {
    const token = createMcpToken({ name: "Status + content", scopes: ["site:read", "content:read"], createdBy: admin.id });
    const result = await call(token.token, "site_status");
    expect(result.structuredContent).toMatchObject({
      mcp: {
        thisToken: {
          scopes: ["site:read", "content:read"],
          access: { site: "read", accounts: "none", progress: "none", audit: "none", content: "read", crm: "none" },
          tools: ["site_status", "list_programs", "list_centres", "list_results"],
        },
      },
    });
    expect(result.content[0].text).toContain("site=read, content=read");
  });

  it("tokens stored with the legacy 'read write' value keep full access", async () => {
    getDb().prepare("UPDATE mcp_tokens SET scopes = 'read write' WHERE id = ?").run(readTokenId);
    expect(await listedTools(readToken)).toEqual(ALL_TOOLS);
  });
});

describe("write tools", () => {
  it("a read-only token cannot call write tools (forbidden, audited, nothing changes)", async () => {
    const result = await call(readToken, "create_account", { role: "student", loginId: "stu.new", displayName: "New Student" });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ error: "forbidden" });
    expect(findUserByLoginIdCount("stu.new")).toBe(0);
    const entries = mcpAudit();
    expect(entries.map((entry) => entry.action).sort()).toEqual(["mcp.call", "mcp.create_account"]);
    expect(entries.find((entry) => entry.action === "mcp.create_account")?.details).toMatchObject({
      outcome: "forbidden",
      mcpKeyId: readTokenId,
    });

    const student = user("student", "stu.one");
    const disable = await call(readToken, "set_account_disabled", { userId: student.id, disabled: true });
    expect(disable.structuredContent).toMatchObject({ error: "forbidden" });
    expect(findUserById(getDb(), student.id)?.disabled).toBe(false);
  });

  it("create_account returns a one-time temporary password and audits the change", async () => {
    const result = await call(writeToken, "create_account", { role: "student", loginId: "Stu.New", displayName: "  New   Student " });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { account: Json; temporaryPassword: string };
    expect(data.account).toMatchObject({ role: "student", loginId: "stu.new", displayName: "New Student", mustChangePassword: true });
    expect(data.temporaryPassword).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/);
    const stored = findUserById(getDb(), String(data.account.id));
    expect(stored?.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(stored?.passwordHash).not.toContain(data.temporaryPassword);

    const actions = listAudit(getDb(), { limit: 20 }).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["mcp.call", "mcp.create_account", "admin.user_create"]));
    const audit = listAudit(getDb(), { limit: 20 });
    expect(audit.find((entry) => entry.action === "mcp.create_account")).toMatchObject({
      actorId: admin.id,
      target: data.account.id,
      details: { outcome: "changed", via: "mcp", mcpKeyId: writeTokenId, role: "student" },
    });
    expect(JSON.stringify(audit)).not.toContain(data.temporaryPassword);

    const taken = await call(writeToken, "create_account", { role: "parent", loginId: "stu.new", displayName: "Someone" });
    expect(taken.structuredContent).toMatchObject({ error: "login_id_taken" });
    const invalid = await call(writeToken, "create_account", { role: "parent", loginId: "x", displayName: "Someone" });
    expect(invalid.structuredContent).toMatchObject({ error: "invalid_login_id" });
  });

  it("link_parent_student and unlink_parent_student are idempotent and check roles", async () => {
    const parent = user("parent", "par.one");
    const student = user("student", "stu.one");

    const link = await call(writeToken, "link_parent_student", { parentId: parent.id, studentId: student.id });
    expect(link.structuredContent).toMatchObject({ linked: true, changed: true });
    const again = await call(writeToken, "link_parent_student", { parentId: parent.id, studentId: student.id });
    expect(again.structuredContent).toMatchObject({ changed: false });
    const wrongRoles = await call(writeToken, "link_parent_student", { parentId: student.id, studentId: parent.id });
    expect(wrongRoles.structuredContent).toMatchObject({ error: "not_a_parent" });

    const unlink = await call(writeToken, "unlink_parent_student", { parentId: parent.id, studentId: student.id });
    expect(unlink.structuredContent).toMatchObject({ linked: false, changed: true });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM parent_links").get()?.n).toBe(0);

    const actions = listAudit(getDb(), { limit: 50 }).map((entry) => entry.action);
    expect(actions.filter((action) => action === "admin.link_add")).toHaveLength(1);
    expect(actions.filter((action) => action === "admin.link_remove")).toHaveLength(1);
    expect(actions.filter((action) => action === "mcp.link_parent_student")).toHaveLength(3);
  });

  it("set_account_disabled disables students (signing them out) but never touches admins", async () => {
    const student = user("student", "stu.one");
    createSession(student.id, { now: Date.now() });

    const off = await call(writeToken, "set_account_disabled", { userId: student.id, disabled: true });
    expect(off.structuredContent).toMatchObject({ changed: true, signedOutSessions: 1, account: { disabled: true } });
    expect(findUserById(getDb(), student.id)?.disabled).toBe(true);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(student.id)?.n).toBe(0);

    const on = await call(writeToken, "set_account_disabled", { userId: student.id, disabled: false });
    expect(on.structuredContent).toMatchObject({ changed: true, account: { disabled: false } });

    const otherAdmin = user("admin", "admin.two");
    for (const target of [admin.id, otherAdmin.id]) {
      const denied = await call(writeToken, "set_account_disabled", { userId: target, disabled: true });
      expect(denied.structuredContent).toMatchObject({ error: "forbidden" });
      expect(findUserById(getDb(), target)?.disabled).toBe(false);
    }
  });
});

describe("prerender safety", () => {
  it.each(["HANGING_PROMISE_REJECTION", "DYNAMIC_SERVER_USAGE"])("GET/POST re-throw Next's %s bail-out untouched", async (digest) => {
    const { connection } = await import("next/server");
    for (const method of ["GET", "POST"]) {
      const bailout = Object.assign(new Error(`simulated ${digest}`), { digest });
      vi.mocked(connection).mockRejectedValueOnce(bailout);
      const req = request({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { token: readToken, method });
      await expect(method === "GET" ? route.GET(req) : route.POST(req)).rejects.toBe(bailout);
    }
    expect(mcpAudit()).toHaveLength(0);
  });
});

describe("tool runner", () => {
  it("turns unexpected exceptions into a generic error without the message", async () => {
    const result = await runTool(
      {
        name: "list_programs",
        title: "t",
        description: "d",
        scope: "read",
        inputSchema: (await import("zod")).z.object({}),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        run() {
          throw new Error("SQLITE_ERROR near users.password_hash: secret detail");
        },
      },
      {},
      { caller: { tokenId: "t1", tokenName: "x", scopes: normalizeScopes("read"), createdBy: admin.id, expiresAt: NOW + 1000 }, now: NOW },
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret detail");
    expect(result.structuredContent).toMatchObject({ error: "server_error" });
  });
});
