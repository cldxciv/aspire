import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// /api/lead-gate route handlers (docs/lead-gate-plan.md §5) against a fresh in-memory database per
// test. Synthetic people and numbers only.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { connection } = await import("next/server");
const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { createTestUser, TestBrowser } = await import("@/lib/auth/testing/harness");
const { createSession } = await import("@/lib/auth/sessions");
const { captureLead, eraseLead, resolveCrmViewer, GATE_PASS_TTL_MS } = await import("@/lib/crm");
const { SlidingWindowRateLimiter } = await import("@/lib/server/rate-limit");
const { createLeadGateHandlers, LEAD_GATE_SERVER_MESSAGES } = await import("@/lib/lead-gate/handlers");
const { createLeadGateLimiters } = await import("@/lib/lead-gate/limits");
const { LEAD_GATE_CONSENT_VERSION, LEAD_GATE_ERRORS } = await import("@/lib/lead-gate/contract");
const { defaultLeadGateRuntime, leadGateRequiredResponse, recordLeadGateToolUse, resolveLeadGateAccess, LEAD_GATE_COOKIE } = await import(
  "@/lib/lead-gate/server"
);
const { isLeadGateResponse } = await import("@/components/lead-gate/lead-gate-client");
const { CONSENT_VERSION } = await import("@/lib/contracts/enquiry");
const { createEnquiryHandler } = await import("@/lib/server/enquiry-handler");
const { createPhoneCaptureLimiter } = await import("@/lib/server/enquiry-capture");
const logout = await import("@/app/api/auth/logout/route");

type Browser = InstanceType<typeof TestBrowser>;
type Limiters = ReturnType<typeof createLeadGateLimiters>;

// Whole seconds near the real clock: sessions and the sign-out path use the real Date.now().
const NOW = Math.floor(Date.now() / 1000) * 1000;
const HOUR = 60 * 60 * 1000;
const SECRET = "api-test-secret-0123456789abcdefghijklmnop";
const PATH = "/api/lead-gate";
const USAGE = "/api/lead-gate/usage";

const BODY = {
  studentName: "Gate Student",
  phone: "98100 12345",
  currentClass: "class-11",
  submittedBy: "parent",
  consent: true,
  consentVersion: LEAD_GATE_CONSENT_VERSION,
  tool: "predictor",
  context: { page: "/hi/tools/predictor", locale: "hi", utm_source: "insta", toolExam: "jee-main", toolBand: "score-180-189" },
  website: "",
};

let clock: { now: number };
let limiters: Limiters;
let handlers: ReturnType<typeof createLeadGateHandlers>;
let logs: MockInstance[] = [];
let ipCounter = 0;

function setup(overrides: Parameters<typeof createLeadGateHandlers>[0] = {}) {
  handlers = createLeadGateHandlers({ now: () => clock.now, limiters: () => limiters, ...overrides });
}

function browser(ip?: string): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, ip ?? `203.0.113.${ipCounter}`);
}

const status = (b: Browser) => b.send(handlers.GET, PATH);
const submit = (b: Browser, body: unknown = BODY, options = {}) => b.send(handlers.POST, PATH, { body, ...options });
const forget = (b: Browser, query = "", options = {}) => b.send(handlers.DELETE, `${PATH}${query}`, { method: "DELETE", ...options });
const usage = (b: Browser, body: unknown) => b.send(handlers.usagePOST, USAGE, { body });

function count(sql: string, ...params: string[]): number {
  return Number(getDb().prepare(sql).get(...params)?.n ?? 0);
}

function loggedLines(): string[] {
  return logs.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" ")));
}

async function signedIn(role: "student" | "parent", options: { mustChangePassword?: boolean } = {}): Promise<Browser> {
  const user = await createTestUser({ role, loginId: `${role}.${ipCounter + 1}`, password: "pass-word-2026", ...options });
  const b = browser();
  b.jar.set("aspire_session", createSession(user.id).token);
  return b;
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("LEAD_GATE", "required");
  vi.stubEnv("LEAD_GATE_SECRET", SECRET);
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
  resetDatabaseForTests();
  clock = { now: NOW };
  limiters = createLeadGateLimiters(() => clock.now);
  setup();
  logs = (["info", "warn", "error", "log"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("GET /api/lead-gate", () => {
  it("locked when the gate is required and this browser has nothing; private headers", async () => {
    const response = await status(browser());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(await response.json()).toEqual({
      ok: true,
      data: { mode: "required", unlocked: false, via: null, recordsUse: false, expiresAt: null },
    });
  });

  it("open as `off` when LEAD_GATE is unset, and while sample data is shown", async () => {
    vi.stubEnv("LEAD_GATE", "");
    expect((await (await status(browser())).json()).data).toMatchObject({ mode: "off", unlocked: true, via: "off" });
    vi.stubEnv("LEAD_GATE", "required");
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    expect((await (await status(browser())).json()).data).toMatchObject({ mode: "off", unlocked: true, via: "off" });
  });

  it.each([
    ["student", {}],
    ["parent", {}],
    ["student", { mustChangePassword: true }],
  ] as const)("a signed-in %s (%o) skips the gate", async (role, options) => {
    const b = await signedIn(role, options);
    expect((await (await status(b)).json()).data).toEqual({ mode: "required", unlocked: true, via: "session", recordsUse: false, expiresAt: null });
  });

  it("re-throws a prerender bail-out untouched and logs nothing", async () => {
    const bailout = Object.assign(new Error("simulated"), { digest: "HANGING_PROMISE_REJECTION" });
    vi.mocked(connection).mockRejectedValueOnce(bailout);
    await expect(status(browser())).rejects.toBe(bailout);
    expect(loggedLines()).toEqual([]);
  });
});

describe("POST /api/lead-gate", () => {
  it("stores the family as a `tool` lead, sets a hardened signed cookie and unlocks this browser", async () => {
    const b = browser();
    const response = await submit(b);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const expiresAt = new Date(NOW + GATE_PASS_TTL_MS).toISOString();
    expect(await response.json()).toEqual({ ok: true, data: { unlocked: true, via: "pass", recordsUse: true, expiresAt } });

    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(/^aspire_tool_pass=lg1\.[A-Za-z0-9_-]{43}\.\d{10}\.[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=lax/i);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=15552000/);
    expect(cookie).not.toMatch(/; Secure/i);

    const lead = getDb().prepare("SELECT * FROM crm_leads").get();
    expect(lead).toMatchObject({
      source: "tool",
      tool: "predictor",
      page: "/tools/predictor",
      utm_source: "insta",
      phone_e164: "+919810012345",
      consent_text_version: LEAD_GATE_CONSENT_VERSION,
    });
    const submission = JSON.parse(String(getDb().prepare("SELECT meta FROM crm_activities WHERE type = 'submission'").get()?.meta));
    expect(submission).toMatchObject({ source: "tool", toolExam: "jee-main", toolBand: "score-180-189", submittedBy: "parent", locale: "hi", consentLocale: "hi" });
    expect(submission.consentText).toMatch(/गोपनीयता सूचना/);

    // Only the hash of the pass id is stored.
    const passId = b.jar.get(LEAD_GATE_COOKIE)?.split(".")[1] ?? "missing";
    expect(JSON.stringify(getDb().prepare("SELECT * FROM crm_gate_passes").all())).not.toContain(passId);

    expect((await (await status(b)).json()).data).toEqual({ mode: "required", unlocked: true, via: "pass", recordsUse: true, expiresAt });
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await submit(browser());
    expect(response.status).toBe(201);
    expect(response.headers.getSetCookie()[0]).toMatch(/; Secure/i);
  });

  it("answers a new and an existing family identically and never returns a name", async () => {
    captureLead({ source: "admissions", studentName: "Riya Existing", phone: "9822012345", consent: { textVersion: "2026-10-20.v2" } }, NOW - HOUR);
    const fresh = await (await submit(browser())).text();
    const existing = await (await submit(browser(), { ...BODY, phone: "9822012345", studentName: "Someone Else" })).text();
    expect(existing).toBe(fresh);
    const b = browser();
    await submit(b, { ...BODY, phone: "9822012345" });
    const answer = await (await status(b)).text();
    for (const text of [fresh, existing, answer]) {
      expect(text).not.toMatch(/Riya|Someone|Gate Student/);
    }
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(2);
  });

  it("validates every field (422) with the contract's messages, incl. an implausible number and a stale consent version", async () => {
    const response = await submit(browser(), { ...BODY, studentName: "", phone: "9876543210", currentClass: "", submittedBy: "", consent: false });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "validation",
      fieldErrors: {
        studentName: [LEAD_GATE_ERRORS.studentName],
        phone: [LEAD_GATE_ERRORS.phoneImplausible],
        currentClass: [LEAD_GATE_ERRORS.currentClass],
        submittedBy: [LEAD_GATE_ERRORS.submittedBy],
        consent: [LEAD_GATE_ERRORS.consent],
      },
    });
    const stale = await submit(browser(), { ...BODY, consentVersion: "2026-10-20.v2" });
    expect(stale.status).toBe(422);
    expect((await stale.json()).fieldErrors).toEqual({ consentVersion: [LEAD_GATE_ERRORS.consentVersion] });
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(0);
  });

  it("refuses cross-origin (403), wrong content type (415), oversized (413) and malformed (400) requests without a cookie", async () => {
    const cases: [number, Promise<Response>][] = [
      [403, submit(browser(), BODY, { origin: "https://evil.example" })],
      [415, submit(browser(), BODY, { contentType: "text/plain" })],
      [413, submit(browser(), { ...BODY, website: "x".repeat(5000) })],
      [400, submit(browser(), "{not json")],
    ];
    for (const [expected, pending] of cases) {
      const response = await pending;
      expect(response.status).toBe(expected);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(0);
  });

  it("limits unlocks per connection (429, its own limiter)", async () => {
    limiters = { ...limiters, submit: new SlidingWindowRateLimiter({ limit: 2, windowMs: 10 * 60 * 1000, now: () => clock.now }) };
    const ip = "198.51.100.20";
    expect((await submit(browser(ip))).status).toBe(201);
    expect((await submit(browser(ip), { ...BODY, phone: "9822012345" })).status).toBe(201);
    const third = await submit(browser(ip), { ...BODY, phone: "9833012345" });
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await third.json()).toMatchObject({ error: "rate_limited", message: LEAD_GATE_SERVER_MESSAGES.rateLimited });
    // Same /64 for IPv6 privacy addresses.
    limiters = { ...limiters, submit: new SlidingWindowRateLimiter({ limit: 1, windowMs: 10 * 60 * 1000, now: () => clock.now }) };
    expect((await submit(browser("2401:4900:1c2a:3b4c::1"))).status).toBe(201);
    expect((await submit(browser("2401:4900:1c2a:3b4c::2"), { ...BODY, phone: "9844012345" })).status).toBe(429);
  });

  it("past the per-phone cap: a pass bound to the existing lead without a new submission; no lead → 429 (phone)", async () => {
    limiters = { ...limiters, phone: new SlidingWindowRateLimiter({ limit: 1, windowMs: 24 * HOUR, now: () => clock.now }) };
    expect((await submit(browser())).status).toBe(201);
    const capped = browser();
    expect((await submit(capped)).status).toBe(201);
    expect(count("SELECT submission_count AS n FROM crm_leads")).toBe(1);
    expect((await (await status(capped)).json()).data.via).toBe("pass");

    limiters = {
      ...limiters,
      phone: { check: () => ({ allowed: false, limit: 1, remaining: 0, retryAfterSeconds: 3600 }), reset() {} } as unknown as InstanceType<typeof SlidingWindowRateLimiter>,
    };
    const none = await submit(browser(), { ...BODY, phone: "9855012345" });
    expect(none.status).toBe(429);
    expect(none.headers.get("x-lead-gate-limit")).toBe("phone");
    expect(none.headers.get("retry-after")).toBe("3600");
    expect(none.headers.getSetCookie()).toEqual([]);
  });

  it("honeypot: looks unlocked (201 + cookie) but stores nothing, and the cookie never works", async () => {
    const b = browser();
    const response = await submit(b, { ...BODY, website: "https://spam.example" });
    expect(response.status).toBe(201);
    expect(b.jar.get(LEAD_GATE_COOKIE)).toBeDefined();
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(0);
    const after = await status(b);
    expect((await after.json()).data).toMatchObject({ unlocked: false });
    expect(after.headers.getSetCookie()[0]).toMatch(/^aspire_tool_pass=;.*Max-Age=0/i);
  });

  it("signed in or gate off: 200, nothing stored, body never read", async () => {
    const student = await signedIn("student");
    const response = await submit(student);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ unlocked: true, via: "session", recordsUse: false, expiresAt: null });
    vi.stubEnv("LEAD_GATE", "off");
    expect((await (await submit(browser(), "{not json")).json()).data).toMatchObject({ via: "off" });
    expect(count("SELECT COUNT(*) AS n FROM crm_leads")).toBe(0);
  });

  it("a store failure is honest: 500, nothing saved, no cookie, no details in the log", async () => {
    setup({
      unlock: () => {
        throw new Error("disk full near Gate Student 9810012345");
      },
    });
    const response = await submit(browser());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "server_error", message: LEAD_GATE_SERVER_MESSAGES.storeFailed });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(loggedLines().join("\n")).not.toMatch(/disk full|Gate Student|9810012345/);
  });

  it("flood breaker: above the hourly ceiling new captures pause (503) and the gate degrades to optional", async () => {
    vi.stubEnv("LEAD_GATE_MAX_NEW_LEADS_PER_HOUR", "2");
    expect((await submit(browser())).status).toBe(201);
    expect((await submit(browser(), { ...BODY, phone: "9822012345" })).status).toBe(201);
    const paused = await submit(browser(), { ...BODY, phone: "9833012345" });
    expect(paused.status).toBe(503);
    expect(await paused.json()).toMatchObject({ error: "not_configured", message: LEAD_GATE_SERVER_MESSAGES.paused });
    expect((await (await status(browser())).json()).data.mode).toBe("optional");
    clock.now += HOUR + 1;
    expect((await (await status(browser())).json()).data.mode).toBe("required");
  });

  it("re-asks a browser whose pass expired, was tampered with, or whose lead was erased (and clears the cookie)", async () => {
    const tampered = browser();
    await submit(tampered);
    const value = tampered.jar.get(LEAD_GATE_COOKIE) ?? "";
    tampered.jar.set(LEAD_GATE_COOKIE, value.replace(/\.(\d{10})\./, (_m, s: string) => `.${Number(s) + 1}.`));
    const tamperedStatus = await status(tampered);
    expect((await tamperedStatus.json()).data.unlocked).toBe(false);
    expect(tamperedStatus.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);

    const expired = browser();
    await submit(expired);
    clock.now = NOW + GATE_PASS_TTL_MS + 1;
    expect((await (await status(expired)).json()).data.unlocked).toBe(false);
    clock.now = NOW;

    const erased = browser();
    await submit(erased);
    const admin = await createTestUser({ role: "admin", loginId: "admin.one", password: "admin-pass-2026" });
    const viewer = resolveCrmViewer({ userId: admin.id, role: "admin" });
    const leadId = String(getDb().prepare("SELECT id FROM crm_leads").get()?.id);
    if (!viewer) throw new Error("no viewer");
    expect(eraseLead(viewer, leadId)).toMatchObject({ ok: true });
    expect((await (await status(erased)).json()).data.unlocked).toBe(false);
  });
});

describe("DELETE /api/lead-gate", () => {
  it("“Not you?” forgets this browser only; idempotent; same-origin only", async () => {
    const a = browser();
    const b = browser();
    await submit(a);
    await submit(b);
    const response = await forget(a);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { forgotten: true, withdrawn: false } });
    expect(response.headers.getSetCookie()[0]).toMatch(/^aspire_tool_pass=;.*Max-Age=0/i);
    expect((await (await status(a)).json()).data.unlocked).toBe(false);
    expect((await (await status(b)).json()).data.unlocked).toBe(true);
    expect(count("SELECT COUNT(*) AS n FROM crm_gate_passes")).toBe(1);
    expect((await forget(a)).status).toBe(200);
    expect((await forget(b, "", { origin: "https://evil.example" })).status).toBe(403);
  });

  it("?withdraw=1 withdraws consent: every browser of the family is forgotten and the open lead is closed", async () => {
    const a = browser();
    const b = browser();
    await submit(a);
    await submit(b);
    expect((await (await forget(a, "?withdraw=1")).json()).data).toEqual({ forgotten: true, withdrawn: true });
    expect((await (await status(b)).json()).data.unlocked).toBe(false);
    expect(getDb().prepare("SELECT stage, lost_reason FROM crm_leads").get()).toEqual({ stage: "lost", lost_reason: "not_interested" });
    expect((await (await forget(browser(), "?withdraw=1")).json()).data).toEqual({ forgotten: true, withdrawn: false });
  });
});

describe("POST /api/lead-gate/usage", () => {
  it("notes predictor / planner use on the family's lead (merged per day, locale-free page)", async () => {
    const b = browser();
    await submit(b);
    const body = { tool: "predictor", exam: "jee-main", band: "score-180-189", page: "/hi/tools/predictor" };
    expect(await (await usage(b, body)).json()).toEqual({ ok: true, data: { recorded: true } });
    await usage(b, body);
    await usage(b, { tool: "planner", exam: "neet", band: "score-1-2" });
    const entries = getDb()
      .prepare("SELECT meta FROM crm_activities WHERE type = 'tool_use' ORDER BY id")
      .all()
      .map((row) => JSON.parse(String(row.meta)));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ tool: "predictor", key: "jee-main", band: "score-180-189", page: "/tools/predictor", uses: 2 });
    expect(entries[1]).toEqual({ tool: "planner", key: "neet", exam: "neet", uses: 1, lastAt: new Date(NOW).toISOString() });
  });

  it("refuses Rancho and mock-test (recorded by their own routes) and says why nothing was recorded", async () => {
    const b = browser();
    await submit(b);
    expect((await usage(b, { tool: "ask", exam: "rancho" })).status).toBe(422);
    expect((await usage(b, { tool: "mock-test", exam: "jee-main" })).status).toBe(422);
    expect((await (await usage(browser(), { tool: "planner", exam: "neet" })).json()).data).toEqual({ recorded: false, reason: "no_pass" });
    expect((await (await usage(await signedIn("student"), { tool: "planner", exam: "neet" })).json()).data).toEqual({ recorded: false, reason: "session" });
    vi.stubEnv("LEAD_GATE", "off");
    expect((await (await usage(b, { tool: "planner", exam: "neet" })).json()).data).toEqual({ recorded: false, reason: "off" });
    expect(count("SELECT COUNT(*) AS n FROM crm_activities WHERE type = 'tool_use'")).toBe(0);
  });

  it("LEAD_GATE_RECORD_USE=parent: a student's pass unlocks but never records, and says so", async () => {
    vi.stubEnv("LEAD_GATE_RECORD_USE", "parent");
    const b = browser();
    expect((await (await submit(b, { ...BODY, submittedBy: "student" })).json()).data.recordsUse).toBe(false);
    expect((await (await status(b)).json()).data).toMatchObject({ unlocked: true, recordsUse: false });
    expect((await (await usage(b, { tool: "planner", exam: "neet" })).json()).data).toEqual({ recorded: false, reason: "not_recorded" });
  });

  it("limits uses per pass (429)", async () => {
    limiters = { ...limiters, usagePerPass: new SlidingWindowRateLimiter({ limit: 1, windowMs: HOUR, now: () => clock.now }) };
    const b = browser();
    await submit(b);
    expect((await usage(b, { tool: "planner", exam: "neet" })).status).toBe(200);
    expect((await usage(b, { tool: "planner", exam: "neet" })).status).toBe(429);
  });
});

describe("server helpers for the tool owners' routes", () => {
  it("the gate 401: frozen code + X-Lead-Gate header + body marker; other 401s are not the gate", async () => {
    const response = leadGateRequiredResponse();
    expect(response.status).toBe(401);
    expect(response.headers.get("x-lead-gate")).toBe("required");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: false, error: "unauthenticated", gate: "lead" });
    expect(isLeadGateResponse(response)).toBe(true);
    expect(isLeadGateResponse(new Response(null, { status: 401 }))).toBe(false);
  });

  it("resolveLeadGateAccess + recordLeadGateToolUse: a pass records a mock-test band; a session or no pass records nothing", async () => {
    const runtime = { ...defaultLeadGateRuntime, now: () => clock.now, limiters: () => limiters };
    const b = browser();
    await submit(b);
    cookieState.jar = b.jar;
    const access = await resolveLeadGateAccess(runtime);
    expect(access).toMatchObject({ mode: "required", unlocked: true, via: "pass", enforce: false });
    expect(recordLeadGateToolUse(access, { tool: "mock-test", key: "jee-mock-1", testId: "jee-mock-1", scoreBand: "pct-40-49" }, NOW)).toBe(true);

    cookieState.jar = new Map();
    const locked = await resolveLeadGateAccess(runtime);
    expect(locked).toMatchObject({ unlocked: false, enforce: true, pass: null });
    expect(recordLeadGateToolUse(locked, { tool: "ask", key: "rancho" })).toBe(false);

    const student = await signedIn("student");
    cookieState.jar = student.jar;
    const session = await resolveLeadGateAccess(runtime);
    expect(session).toMatchObject({ via: "session", enforce: false });
    expect(recordLeadGateToolUse(session, { tool: "ask", key: "rancho" })).toBe(false);
    expect(count("SELECT COUNT(*) AS n FROM crm_activities WHERE type = 'tool_use'")).toBe(1);
  });

  it("signing out also forgets this browser's pass", async () => {
    const b = browser();
    await submit(b);
    const response = await b.send(logout.POST, "/api/auth/logout", { method: "POST" });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().some((cookie) => /^aspire_tool_pass=;.*Max-Age=0/i.test(cookie))).toBe(true);
    expect(count("SELECT COUNT(*) AS n FROM crm_gate_passes")).toBe(0);
  });
});

describe("a stored enquiry unlocks the tools on that browser too (critique 1.8)", () => {
  const ENQUIRY = {
    source: "contact",
    name: "Test Parent",
    phone: "9866012345",
    topic: "admissions",
    consent: true,
    consentVersion: CONSENT_VERSION,
  };

  function enquiryHandler() {
    return createEnquiryHandler({
      rateLimiter: new SlidingWindowRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 }),
      phoneLimiter: createPhoneCaptureLimiter(),
    });
  }

  it("sets a pass cookie next to the unchanged 201 body; the pass unlocks but never records use", async () => {
    const send = enquiryHandler();
    const b = browser();
    const response = await b.send(send, "/api/enquiries", { body: ENQUIRY });
    expect(response.status).toBe(201);
    expect(Object.keys(await response.json()).sort()).toEqual(["message", "ok", "reference", "status"]);
    // Real clock here (the default runtime): about 180 days.
    expect(response.headers.getSetCookie()[0]).toMatch(/^aspire_tool_pass=lg1\.[^;]+; Path=\/; Max-Age=155(?:51|52)\d{3}; HttpOnly; SameSite=Lax$/);
    expect((await (await status(b)).json()).data).toMatchObject({ unlocked: true, via: "pass", recordsUse: false });
    expect((await (await usage(b, { tool: "planner", exam: "neet" })).json()).data).toEqual({ recorded: false, reason: "not_recorded" });
    expect(getDb().prepare("SELECT consent_version, record_use, submitted_by FROM crm_gate_passes").get()).toEqual({
      consent_version: CONSENT_VERSION,
      record_use: 0,
      submitted_by: null,
    });
    // The same browser enquiring again keeps its pass.
    expect((await b.send(send, "/api/enquiries", { body: ENQUIRY })).headers.getSetCookie()).toEqual([]);
  });

  it("no cookie when the gate is off or for a honeypot", async () => {
    const send = enquiryHandler();
    expect((await browser().send(send, "/api/enquiries", { body: { ...ENQUIRY, website: "spam" } })).headers.getSetCookie()).toEqual([]);
    vi.stubEnv("LEAD_GATE", "off");
    const off = await browser().send(send, "/api/enquiries", { body: { ...ENQUIRY, phone: "9877012345" } });
    expect(off.status).toBe(201);
    expect(off.headers.getSetCookie()).toEqual([]);
    expect(count("SELECT COUNT(*) AS n FROM crm_gate_passes")).toBe(0);
  });
});

describe("logs", () => {
  it("carry fixed codes only: never the name, phone, IP, token or context", async () => {
    const b = browser("198.51.100.77");
    await submit(b);
    const token = b.jar.get(LEAD_GATE_COOKIE) ?? "lg1.unset";
    await submit(browser("198.51.100.77"), { ...BODY, phone: "9876543210" });
    await usage(b, { tool: "predictor", exam: "jee-main", band: "score-180-189" });
    await forget(b, "?withdraw=1");
    const text = loggedLines().join("\n");
    expect(text).toContain('"event":"lead_gate"');
    for (const secret of ["Gate Student", "9810012345", "98100", "198.51.100.77", "insta", token, SECRET]) {
      expect(text).not.toContain(secret);
    }
  });
});
