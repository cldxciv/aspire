import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

/**
 * /api/ask against a fresh in-memory database per test, with the Anthropic SDK mocked: no test
 * ever reaches the real Claude API, and no real key is used.
 */

const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

type FakeEvent = Record<string, unknown>;
interface Script {
  /** Thrown by the first `next()` (an upstream error before any event). */
  error?: unknown;
  chunks?: string[];
  stopReason?: string;
}
const sdk = vi.hoisted(() => ({
  calls: [] as { params: Record<string, unknown>; apiKey: unknown }[],
  script: {} as Script,
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    beta: { messages: { stream: (params: Record<string, unknown>) => unknown } };
    constructor(options: { apiKey?: unknown }) {
      this.beta = {
        messages: {
          stream: (params) => {
            sdk.calls.push({ params, apiKey: options.apiKey });
            const script = sdk.script;
            const events: FakeEvent[] = [
              { type: "message_start", message: {} },
              ...(script.chunks ?? []).map((text) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })),
              { type: "message_stop" },
            ];
            let index = 0;
            return {
              [Symbol.asyncIterator]: () => ({
                next: async () => {
                  if (script.error) throw script.error;
                  return index < events.length ? { done: false, value: events[index++] } : { done: true, value: undefined };
                },
              }),
              finalMessage: async () => ({
                stop_reason: script.stopReason ?? "end_turn",
                usage: { input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 0 },
              }),
              abort: () => undefined,
            };
          },
        },
      };
    }
  }
  return { ...actual, default: FakeAnthropic, Anthropic: FakeAnthropic };
});

const { AuthenticationError, RateLimitError } = await import("@anthropic-ai/sdk");
const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { createTestUser, TestBrowser } = await import("@/lib/auth/testing/harness");
const loginRoute = await import("@/app/api/auth/login/route");
const { getWeakTopicsFromDoubts } = await import("@/lib/ask/weak-topics");
const ask = await import("./route");

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const TRAILER = '<aspire-meta>{"subject":"physics","topic":"Projectile motion","difficulty":"medium"}</aspire-meta>';
const STUDENT = { loginId: "ask.student", password: "learner-pass-2026", role: "student" as const };

let consoleSpies: MockInstance[] = [];

function browser(ip?: string) {
  return new TestBrowser(cookieState, ip);
}

function post(b: InstanceType<typeof TestBrowser>, body: unknown, options: Record<string, unknown> = {}) {
  return b.send(ask.POST, "/api/ask", { body, ...options });
}

async function readStream(response: Response) {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function answerText(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.t === "delta")
    .map((e) => e.text)
    .join("");
}

function loggedLines(): string[] {
  return consoleSpies.flatMap((spy) => spy.mock.calls.map((call) => String(call[0])));
}

beforeEach(() => {
  resetDatabaseForTests();
  cookieState.jar = new Map();
  sdk.calls = [];
  sdk.script = { chunks: ["Step 1: use **v² = u² + 2as**\n\n**Final answer:** 5 m\n", TRAILER.slice(0, 9), TRAILER.slice(9)] };
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
  vi.stubEnv("ASK_ASPIRE_GUEST_DAILY", "2");
  vi.stubEnv("ASK_ASPIRE_STUDENT_DAILY", "3");
  vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
  consoleSpies = [
    vi.spyOn(console, "info").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "error").mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const spy of consoleSpies) spy.mockRestore();
  resetDatabaseForTests();
});

describe("POST /api/ask", () => {
  it("returns 503 not_configured without a key and never calls the API", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await post(browser(), { question: "What is inertia?", language: "en" });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "not_configured" });
    expect(sdk.calls).toHaveLength(0);

    const status = await browser().send(ask.GET, "/api/ask");
    expect(await status.json()).toMatchObject({ ok: true, data: { configured: false, account: "guest" } });
  });

  it("rejects cross-origin requests and wrong content types", async () => {
    const crossOrigin = await post(browser(), { question: "q", language: "en" }, { origin: "https://evil.example" });
    expect(crossOrigin.status).toBe(403);
    const formPost = await post(browser(), "question=q", { contentType: "application/x-www-form-urlencoded" });
    expect(formPost.status).toBe(415);
    const badJson = await post(browser(), "{not json");
    expect(badJson.status).toBe(400);
    expect(sdk.calls).toHaveLength(0);
  });

  it("validates the body: missing question, bad language, photo consent", async () => {
    expect((await post(browser(), { question: "   ", language: "en" })).status).toBe(422);
    expect((await post(browser(), { question: "q", language: "fr" })).status).toBe(422);
    const noConsent = await post(browser(), { language: "en", image: { mediaType: "image/jpeg", data: Buffer.from(JPEG).toString("base64") } });
    expect(noConsent.status).toBe(422);
    expect(await noConsent.json()).toMatchObject({ fieldErrors: { photoConsent: expect.any(Array) } });
    expect(sdk.calls).toHaveLength(0);
  });

  it("re-checks the photo by magic bytes and size", async () => {
    const fake = await post(browser(), {
      language: "en",
      photoConsent: true,
      image: { mediaType: "image/jpeg", data: Buffer.from("<svg onload=alert(1)>").toString("base64") },
    });
    expect(fake.status).toBe(422);
    expect(await fake.json()).toMatchObject({ fieldErrors: { image: expect.any(Array) } });

    const wrongType = await post(browser(), { language: "en", photoConsent: true, image: { mediaType: "image/gif", data: "R0lGODlh" } });
    expect(wrongType.status).toBe(422);

    const huge = new Uint8Array(4 * 1024 * 1024 + 10);
    huge.set(JPEG);
    const tooLarge = await post(browser(), { language: "en", photoConsent: true, image: { mediaType: "image/jpeg", data: Buffer.from(huge).toString("base64") } });
    expect(tooLarge.status).toBe(413);
    expect(sdk.calls).toHaveLength(0);
  });

  it("streams the answer with the trailer stripped and passes the photo to the model", async () => {
    const response = await post(browser(), {
      question: "Find the height",
      subject: "physics",
      language: "hi",
      photoConsent: true,
      image: { mediaType: "image/jpeg", data: Buffer.from(JPEG).toString("base64") },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const events = await readStream(response);
    expect(events[0]).toEqual({ t: "start", remaining: 1, limit: 2 });
    const text = answerText(events);
    expect(text).toContain("**Final answer:** 5 m");
    expect(text).not.toContain("aspire-meta");
    expect(events.at(-1)).toEqual({ t: "done", stop: "end_turn", meta: { subject: "physics", topic: "Projectile motion", difficulty: "medium" } });

    expect(sdk.calls).toHaveLength(1);
    const { params, apiKey } = sdk.calls[0];
    expect(apiKey).toBe("test-key-not-real");
    const content = (params.messages as { content: { type: string; text?: string }[] }[])[0].content;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect(content[1].text).toContain("Hindi");
    expect(content[1].text).toContain("Physics");

    // Logs carry fixed codes and token counts only: no question, answer, topic, IP or key.
    const logs = loggedLines().join("\n");
    expect(logs).toContain('"outcome":"answered"');
    for (const secret of ["Find the height", "Final answer", "Projectile", "203.0.113", "test-key-not-real"]) {
      expect(logs).not.toContain(secret);
    }
  });

  it("limits guests per IP per day with 429 + Retry-After; another IP is separate", async () => {
    const guest = browser("203.0.113.20");
    for (let i = 0; i < 2; i += 1) {
      const ok = await post(guest, { question: `q${i}`, language: "en" });
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const limited = await post(guest, { question: "q3", language: "en" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ ok: false, error: "rate_limited" });
    expect(sdk.calls).toHaveLength(2);

    const other = await post(browser("203.0.113.21"), { question: "q", language: "en" });
    expect(other.status).toBe(200);
    await other.text();

    const status = await guest.send(ask.GET, "/api/ask");
    expect(await status.json()).toMatchObject({ data: { configured: true, account: "guest", limit: 2, used: 2, remaining: 0 } });

    // QA-SEC-M6: once the allowance is used up the body is not even read (a junk or huge body
    // gets the same cheap 429, not a 400 / 413 after buffering it).
    const junk = await guest.send(ask.POST, "/api/ask", { body: "{not json" });
    expect(junk.status).toBe(429);
    const huge = await guest.send(ask.POST, "/api/ask", { body: { language: "en", question: "x".repeat(6 * 1024 * 1024) } });
    expect(huge.status).toBe(429);
    expect(sdk.calls).toHaveLength(3);
  });

  it("gives signed-in students their own allowance and stores weak topics; guests store nothing", async () => {
    const user = await createTestUser(STUDENT);
    const student = browser("203.0.113.30");
    const login = await student.send(loginRoute.POST, "/api/auth/login", { body: { loginId: STUDENT.loginId, password: STUDENT.password } });
    expect(login.status).toBe(200);

    for (let i = 0; i < 3; i += 1) {
      const ok = await post(student, { question: `q${i}`, language: "en" });
      expect(ok.status).toBe(200);
      await ok.text();
    }
    expect((await post(student, { question: "q4", language: "en" })).status).toBe(429);
    expect(getWeakTopicsFromDoubts(user.id)).toEqual([
      expect.objectContaining({ subject: "physics", topic: "Projectile motion", count: 3 }),
    ]);
    const status = await student.send(ask.GET, "/api/ask");
    expect(await status.json()).toMatchObject({ data: { account: "student", limit: 3, remaining: 0 } });

    // A guest on the same IP still has the guest allowance, and nothing is stored for guests.
    const guest = await post(browser("203.0.113.30"), { question: "q", language: "en" });
    expect(guest.status).toBe(200);
    await guest.text();
    const rows = getDb().prepare("SELECT COUNT(*) AS n FROM ask_topics").get();
    expect(Number(rows?.n)).toBe(1);
  });

  it("maps upstream errors before the answer and does not count the question", async () => {
    sdk.script = { error: new AuthenticationError(401, undefined, "invalid x-api-key", new Headers()) };
    const auth = await post(browser("203.0.113.40"), { question: "q", language: "en" });
    expect(auth.status).toBe(503);
    expect(await auth.json()).toMatchObject({ error: "not_configured" });

    sdk.script = { error: new RateLimitError(429, undefined, "slow down", new Headers()) };
    const busy = await post(browser("203.0.113.40"), { question: "q", language: "en" });
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("60");
    expect(await busy.json()).toMatchObject({ error: "server_error" });

    const status = await browser("203.0.113.40").send(ask.GET, "/api/ask");
    expect(await status.json()).toMatchObject({ data: { used: 0, remaining: 2 } });
    expect(loggedLines().join("\n")).not.toContain("invalid x-api-key");
  });

  it("reports refusals and truncation in the done event", async () => {
    sdk.script = { chunks: ["I can't help with that."], stopReason: "refusal" };
    const refused = await readStream(await post(browser(), { question: "q", language: "en" }));
    expect(refused.at(-1)).toEqual({ t: "done", stop: "refusal", meta: null });

    sdk.script = { chunks: ["Long answer"], stopReason: "max_tokens" };
    const truncated = await readStream(await post(browser("203.0.113.50"), { question: "q", language: "en" }));
    expect(truncated.at(-1)).toMatchObject({ t: "done", stop: "max_tokens" });
  });
});

describe("GET /api/ask", () => {
  it("is private and never exposes the key", async () => {
    const response = await browser().send(ask.GET, "/api/ask");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toContain("test-key-not-real");
    expect(JSON.parse(text)).toMatchObject({ ok: true, data: { configured: true, account: "guest", limit: 2, remaining: 2, maxImageBytes: 4 * 1024 * 1024 } });
  });
});
