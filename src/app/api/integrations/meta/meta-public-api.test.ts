import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The PUBLIC Meta endpoints (docs/lead-routing-plan.md §18.1, §18.2, §18.5): the webhook (Meta's
// handshake and signed deliveries) and the optional loopback cron. Real handlers on a fresh
// in-memory database; `after()` is captured so the deferred processing can be run on purpose;
// Graph is an injected fake (the global fetch is guarded). Routing / SLA seams are test-defined.
const deferred = vi.hoisted(() => ({ jobs: [] as (() => unknown)[] }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn((job: () => unknown) => deferred.jobs.push(job)),
}));
vi.mock("@/lib/crm/routing", async (original) => ({ ...(await original<object>()), ...(await import("@/lib/crm/meta/fixtures/seams")).routingSeam() }));
vi.mock("@/lib/crm/sla", async (original) => ({ ...(await original<object>()), ...(await import("@/lib/crm/meta/fixtures/seams")).slaSeam() }));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { ensureVerifyToken, readMetaSecret } = await import("@/lib/crm/meta/config");
const { findInboxRow } = await import("@/lib/crm/repo/meta");
const { resetMetaLimitersForTests } = await import("@/lib/crm/meta/http");
const { resetMetaInboxStateForTests } = await import("@/lib/crm/meta/inbox");
const { setMetaRuntimeForTests } = await import("@/lib/crm/meta/runtime");
const { readMetaStatus } = await import("@/lib/crm/meta/status");
const kit = await import("@/lib/crm/meta/fixtures/meta-kit");
const webhook = await import("./webhook/route");
const sync = await import("./sync/route");

const { FORM_ID, LEAD_ID, TEST_CENTRES, TEST_INTEGRATIONS_SECRET, configureMeta, fakeGraph, fixtureJson, fixtureText, sign, unicodeEscapedBody } = kit;
const restoreFetch = kit.guardGlobalFetch();
afterAll(() => {
  restoreFetch();
  expect(kit.globalFetchCalls.count).toBe(0);
});

const SITE = "https://aspire.thechunkmedia.com";
const CRON_TOKEN = "cron-token-0123456789-abcdefghijklmnopqrstuv";

function get(query: Record<string, string>) {
  return new NextRequest(`${SITE}/api/integrations/meta/webhook?${new URLSearchParams(query).toString()}`, {
    headers: { host: "127.0.0.1:3011", "x-forwarded-host": "aspire.thechunkmedia.com", "x-forwarded-proto": "https", "x-forwarded-for": "198.51.100.7" },
  });
}

function post(body: string, signature: string | null, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": "198.51.100.7", ...extra };
  if (signature !== null) headers["x-hub-signature-256"] = signature;
  return new NextRequest(`${SITE}/api/integrations/meta/webhook`, { method: "POST", headers, body });
}

function cron(headers: Record<string, string>) {
  return new NextRequest("http://127.0.0.1:3011/api/integrations/meta/sync", { method: "POST", headers: { host: "127.0.0.1:3011", ...headers } });
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("INTEGRATIONS_SECRET", TEST_INTEGRATIONS_SECRET);
  vi.stubEnv("INTEGRATIONS_SECRET_PREVIOUS", "");
  vi.stubEnv("INTEGRATIONS_CRON_TOKEN", "");
  resetDatabaseForTests();
  resetMetaLimitersForTests();
  resetMetaInboxStateForTests();
  deferred.jobs.length = 0;
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  setMetaRuntimeForTests(null);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const privateHeaders = (response: Response) => ({ cache: response.headers.get("cache-control"), robots: response.headers.get("x-robots-tag") });

describe("GET /api/integrations/meta/webhook (handshake)", () => {
  it("returns the challenge as text for the right verify token and records the verified site", async () => {
    configureMeta(getDb());
    ensureVerifyToken(getDb(), { actorId: null, now: Date.now() });
    const token = readMetaSecret(getDb(), "verify_token");
    expect(token.ok).toBe(true);
    const response = await webhook.GET(get({ "hub.mode": "subscribe", "hub.verify_token": token.ok ? token.value : "", "hub.challenge": "1158201444" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("1158201444");
    expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(privateHeaders(response)).toEqual({ cache: "no-store", robots: "noindex, nofollow" });
    expect(readMetaStatus(getDb()).verifiedSiteUrl).toBe(SITE);
  });

  it("403 for a wrong or missing token, 400 for a malformed challenge", async () => {
    configureMeta(getDb());
    expect((await webhook.GET(get({ "hub.mode": "subscribe", "hub.verify_token": "anything", "hub.challenge": "1" }))).status).toBe(403);
    ensureVerifyToken(getDb(), { actorId: null, now: Date.now() });
    const token = readMetaSecret(getDb(), "verify_token");
    const value = token.ok ? token.value : "";
    expect((await webhook.GET(get({ "hub.mode": "subscribe", "hub.verify_token": `${value}x`, "hub.challenge": "1" }))).status).toBe(403);
    const bad = await webhook.GET(get({ "hub.mode": "subscribe", "hub.verify_token": value, "hub.challenge": "<b>x</b>" }));
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain("<b>");
    expect(readMetaStatus(getDb()).lastVerifyAt).toBeNull();
  });
});

describe("POST /api/integrations/meta/webhook (deliveries)", () => {
  it("503 when nothing can be verified (no app secret)", async () => {
    configureMeta(getDb(), { appSecret: false });
    const body = fixtureText("webhook-docs.json");
    const response = await webhook.POST(post(body, sign(body)));
    expect(response.status).toBe(503);
    expect(privateHeaders(response)).toEqual({ cache: "no-store", robots: "noindex, nofollow" });
  });

  it("accepts a signed delivery (raw bytes, incl. a unicode-escaped body), answers 200 at once and processes after the response", async () => {
    configureMeta(getDb());
    const body = fixtureText("webhook-docs.json");
    const response = await webhook.POST(post(body, sign(body)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(findInboxRow(getDb(), LEAD_ID)?.status).toBe("pending");
    expect(deferred.jobs).toHaveLength(1);
    const graph = fakeGraph({ [`GET ${LEAD_ID}`]: { body: fixtureJson("lead-full.json") } });
    setMetaRuntimeForTests({ fetchImpl: graph.fetchImpl, centres: async () => TEST_CENTRES });
    await deferred.jobs[0]();
    expect(findInboxRow(getDb(), LEAD_ID)?.status).toBe("imported");
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 1 });

    const unicode = unicodeEscapedBody();
    expect((await webhook.POST(post(unicode, sign(unicode)))).status).toBe(200);
    expect(findInboxRow(getDb(), "12345678901234568")?.formId).toBe(FORM_ID);
  });

  it("401 for a tampered body or a missing / malformed signature; nothing is stored", async () => {
    configureMeta(getDb());
    const body = fixtureText("webhook-docs.json");
    expect((await webhook.POST(post(body.replace("998877665544332", "998877665544339"), sign(body)))).status).toBe(401);
    expect((await webhook.POST(post(body, null))).status).toBe(401);
    expect((await webhook.POST(post(body, sign(body).replace("sha256=", "sha1=")))).status).toBe(401);
    expect((await webhook.POST(post(body, "sha256=xyz"))).status).toBe(401);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_meta_inbox").get()).toEqual({ n: 0 });
    expect(deferred.jobs).toHaveLength(0);
  });

  it("400 for unreadable JSON (signed), 413 above 2 MB", async () => {
    configureMeta(getDb());
    expect((await webhook.POST(post("{not json", sign("{not json")))).status).toBe(400);
    const big = post("{}", sign("{}"), { "content-length": String(2 * 1024 * 1024 + 1) });
    expect((await webhook.POST(big)).status).toBe(413);
  });

  it("holds the ids (200) while the integration is switched off; nothing is processed", async () => {
    configureMeta(getDb(), { enabled: false });
    const body = fixtureText("webhook-docs.json");
    expect((await webhook.POST(post(body, sign(body)))).status).toBe(200);
    expect(findInboxRow(getDb(), LEAD_ID)?.status).toBe("held");
    expect(deferred.jobs).toHaveLength(0);
  });
});

describe("POST /api/integrations/meta/sync (loopback cron)", () => {
  it("is 404 while INTEGRATIONS_CRON_TOKEN is unset or short", async () => {
    expect((await sync.POST(cron({ authorization: `Bearer ${CRON_TOKEN}` }))).status).toBe(404);
    vi.stubEnv("INTEGRATIONS_CRON_TOKEN", "short-token");
    expect((await sync.POST(cron({ authorization: "Bearer short-token" }))).status).toBe(404);
  });

  it("refuses anything that came through the proxy or a non-loopback host, and a wrong bearer", async () => {
    vi.stubEnv("INTEGRATIONS_CRON_TOKEN", CRON_TOKEN);
    const auth = { authorization: `Bearer ${CRON_TOKEN}` };
    // nginx appends the client's public address (a list when the client sent its own header).
    for (const forwarded of ["203.0.113.9", "1.2.3.4, 172.18.0.1", "172.18.0.1, 203.0.113.9", "::ffff:203.0.113.9", "2001:db8::1", "fd0::1"]) {
      expect((await sync.POST(cron({ ...auth, "x-forwarded-for": forwarded }))).status, forwarded).toBe(403);
    }
    expect((await sync.POST(cron({ ...auth, "x-real-ip": "203.0.113.9" }))).status).toBe(403);
    expect((await sync.POST(cron({ ...auth, "x-forwarded-for": "172.18.0.1", "x-real-ip": "172.18.0.1" }))).status).toBe(403);
    expect((await sync.POST(cron({ ...auth, host: "aspire.thechunkmedia.com" }))).status).toBe(403);
    expect((await sync.POST(cron({ authorization: `Bearer ${CRON_TOKEN}x` }))).status).toBe(401);
    expect((await sync.POST(cron({ authorization: CRON_TOKEN }))).status).toBe(401);
    expect((await sync.POST(cron({}))).status).toBe(401);
  });

  it("accepts the single private / loopback X-Forwarded-For that Next adds itself for a direct call (Docker's port mapping)", async () => {
    vi.stubEnv("INTEGRATIONS_CRON_TOKEN", CRON_TOKEN);
    for (const forwarded of ["172.18.0.1", "::ffff:172.18.0.1", "127.0.0.1", "10.0.0.5", "192.168.1.2", "::1", "fd12:3456::1"]) {
      const response = await sync.POST(cron({ authorization: `Bearer ${CRON_TOKEN}`, "x-forwarded-for": forwarded, "x-forwarded-host": "127.0.0.1:3011", "x-forwarded-proto": "http" }));
      expect(response.status, forwarded).toBe(200);
      expect(await response.json()).toEqual({ ok: true, data: { processed: 0, enqueued: 0 } });
    }
  });

  it("with the token over loopback: reconciles the forms and processes → { processed, enqueued }", async () => {
    vi.stubEnv("INTEGRATIONS_CRON_TOKEN", CRON_TOKEN);
    configureMeta(getDb());
    const graph = fakeGraph({
      [`GET ${FORM_ID}/leads`]: { body: fixtureJson("form-leads.json") },
      "GET *": (call) => ({ body: kit.leadBody({ id: call.path, phone: call.path.endsWith("1") ? "+919812345671" : "+919812345672" }) }),
    });
    setMetaRuntimeForTests({ fetchImpl: graph.fetchImpl, centres: async () => TEST_CENTRES });
    for (const host of ["127.0.0.1:3011", "localhost:3011"]) {
      const response = await sync.POST(cron({ host, authorization: `Bearer ${CRON_TOKEN}` }));
      expect(response.status).toBe(200);
      expect(privateHeaders(response)).toEqual({ cache: "no-store", robots: "noindex, nofollow" });
      const body = (await response.json()) as { ok: boolean; data: { processed: number; enqueued: number } };
      if (host.startsWith("127")) expect(body).toEqual({ ok: true, data: { processed: 2, enqueued: 2 } });
      else expect(body).toEqual({ ok: true, data: { processed: 0, enqueued: 0 } });
    }
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_leads").get()).toEqual({ n: 2 });
  });
});
