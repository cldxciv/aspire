import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { CONSENT_VERSION } from "@/lib/contracts/enquiry";

import { ENQUIRY_MESSAGES, resetEnquiryRateLimiterForTests } from "@/lib/server/enquiry-handler";
import { resetLoggerStateForTests } from "@/lib/server/logger";
import { WEBHOOK_SIGNATURE_HEADER, signWebhookBody } from "@/lib/server/destinations/webhook";

import { POST } from "./route";

const ORIGIN = "http://localhost:3000";
const WEBHOOK_URL = "https://hooks.example.com/enquiries";
const WEBHOOK_SECRET = "route-test-secret-0123456789abcdef";

const PII = {
  name: "Unique Testname Zebra",
  phone: "+91 98765 43210",
  email: "pii-check@example.com",
  message: "Private message marker 7f3a",
  guardianName: "Guardian Marker Quokka",
};

const validQuick = {
  source: "quick",
  name: PII.name,
  phone: PII.phone,
  email: PII.email,
  message: PII.message,
  currentClass: "class-11",
  programInterest: "jee",
  intent: "scholarship",
  consent: true,
  consentVersion: CONSENT_VERSION,
  website: "",
};

let ipCounter = 0;
function freshIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

function enquiryRequest(
  body: unknown,
  options: { headers?: Record<string, string>; ip?: string; rawBody?: BodyInit } = {},
): Request {
  return new Request(`${ORIGIN}/api/enquiries`, {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: ORIGIN,
      "content-type": "application/json",
      "x-forwarded-for": options.ip ?? freshIp(),
      ...options.headers,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

let logSpies: MockInstance[] = [];
function loggedText(): string {
  return logSpies.flatMap((spy) => spy.mock.calls.map((call) => call.join(" "))).join("\n");
}
function loggedEntries(): Record<string, unknown>[] {
  return loggedText()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function useWebhook() {
  vi.stubEnv("ENQUIRY_DESTINATION", "webhook");
  vi.stubEnv("ENQUIRY_WEBHOOK_URL", WEBHOOK_URL);
  vi.stubEnv("ENQUIRY_WEBHOOK_SECRET", WEBHOOK_SECRET);
}

beforeEach(() => {
  resetEnquiryRateLimiterForTests();
  resetLoggerStateForTests();
  // These tests cover the destination path (ENQUIRY_STORE=off = the pre-M7 behaviour). Lead capture
  // (the default, ENQUIRY_STORE=crm) is tested with fake sinks in src/lib/server/enquiry-handler.test.ts.
  vi.stubEnv("ENQUIRY_STORE", "off");
  vi.stubEnv("ENQUIRY_DESTINATION", "");
  vi.stubEnv("ENQUIRY_WEBHOOK_URL", "");
  vi.stubEnv("ENQUIRY_WEBHOOK_SECRET", "");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://aspireiit.in");
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true"); // placeholder centres (e.g. "shimla") are valid preferredCentre values
  logSpies = [
    vi.spyOn(console, "info").mockImplementation(() => undefined),
    vi.spyOn(console, "warn").mockImplementation(() => undefined),
    vi.spyOn(console, "error").mockImplementation(() => undefined),
    vi.spyOn(console, "log").mockImplementation(() => undefined),
  ];
});

afterEach(() => {
  // PII must never reach the logs, whatever the outcome of the test.
  const text = loggedText();
  for (const value of [PII.name, PII.email, PII.message, PII.guardianName, "98765", "9876543210", "198.51.100."]) {
    expect(text).not.toContain(value);
  }
  expect(text).not.toContain(WEBHOOK_URL);
  expect(text).not.toContain(WEBHOOK_SECRET);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function expectNoStoreJson(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  return (await response.json()) as Record<string, unknown>;
}

describe("POST /api/enquiries — destination none (default)", () => {
  it("validates and answers 200 not_configured without sending anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(enquiryRequest(validQuick));
    expect(response.status).toBe(200);
    expect(await expectNoStoreJson(response)).toEqual({
      ok: true,
      status: "not_configured",
      message: ENQUIRY_MESSAGES.notConfigured,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loggedEntries()).toContainEqual(
      expect.objectContaining({ event: "enquiry", outcome: "not_configured", source: "quick" }),
    );
  });

  it.each([
    { source: "admissions", currentClass: "class-12", programInterest: "neet", preferredCentre: "shimla" },
    { source: "contact", topic: "scholarship" },
  ])("accepts the $source form", async (extra) => {
    const response = await POST(
      enquiryRequest({ name: PII.name, phone: "9876543210", consent: true, consentVersion: CONSENT_VERSION, website: "", ...extra }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("not_configured");
  });

  it("never claims 'received' when no destination is configured", async () => {
    const body = await (await POST(enquiryRequest(validQuick))).json();
    expect(body.status).not.toBe("received");
    expect(body).not.toHaveProperty("reference");
  });
});

describe("POST /api/enquiries — validation", () => {
  it("returns 422 with field errors", async () => {
    const response = await POST(enquiryRequest({ ...validQuick, phone: "12345", email: "nope", consent: false }));
    expect(response.status).toBe(422);
    const body = await expectNoStoreJson(response);
    expect(body).toMatchObject({ ok: false, error: "validation" });
    const fieldErrors = body.fieldErrors as Record<string, string[]>;
    expect(Object.keys(fieldErrors).sort()).toEqual(["consent", "email", "phone"]);
    expect(fieldErrors.phone).toEqual(["Enter a valid 10-digit mobile number"]);
  });

  it("returns 422 for an unknown source", async () => {
    const response = await POST(enquiryRequest({ ...validQuick, source: "admin" }));
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toHaveProperty("source");
  });

  it("returns 422 when preferredCentre is free text instead of a centre slug", async () => {
    const response = await POST(
      enquiryRequest({
        source: "admissions",
        name: PII.name,
        phone: "9876543210",
        consent: true,
        consentVersion: CONSENT_VERSION,
        currentClass: "class-12",
        programInterest: "neet",
        preferredCentre: "Near the bus stand",
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({ preferredCentre: ["Select a centre from the list"] });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(enquiryRequest(null, { rawBody: '{"name": "x",' }));
    expect(response.status).toBe(400);
    expect(await expectNoStoreJson(response)).toMatchObject({ ok: false, error: "bad_request" });
  });

  it.each([["[]"], ['"text"'], ["null"], ["42"], [""]])("returns 400 for a non-object body %j", async (raw) => {
    const response = await POST(enquiryRequest(null, { rawBody: raw }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("bad_request");
  });

  it("returns 413 for a body over 10 KB", async () => {
    const response = await POST(enquiryRequest({ ...validQuick, message: "x".repeat(11 * 1024) }));
    expect(response.status).toBe(413);
    expect(await expectNoStoreJson(response)).toMatchObject({ ok: false, error: "bad_request" });
  });
});

describe("POST /api/enquiries — CSRF / origin", () => {
  it("returns 403 for a cross-origin request", async () => {
    const response = await POST(enquiryRequest(validQuick, { headers: { origin: "https://evil.example" } }));
    expect(response.status).toBe(403);
    expect(await expectNoStoreJson(response)).toMatchObject({ ok: false, error: "forbidden" });
    expect(loggedEntries()).toContainEqual(expect.objectContaining({ outcome: "forbidden", reason: "origin_mismatch" }));
  });

  it("returns 403 for Sec-Fetch-Site: cross-site without Origin", async () => {
    const request = enquiryRequest(validQuick, { headers: { "sec-fetch-site": "cross-site" } });
    request.headers.delete("origin");
    expect((await POST(request)).status).toBe(403);
  });

  it("returns 403 when neither Origin nor Sec-Fetch-Site is sent", async () => {
    const request = enquiryRequest(validQuick);
    request.headers.delete("origin");
    expect((await POST(request)).status).toBe(403);
  });

  it("accepts the NEXT_PUBLIC_SITE_URL origin", async () => {
    const response = await POST(
      enquiryRequest(validQuick, { headers: { host: "internal:3000", origin: "https://aspireiit.in" } }),
    );
    expect(response.status).toBe(200);
  });

  it("accepts Sec-Fetch-Site: same-origin without Origin", async () => {
    const request = enquiryRequest(validQuick, { headers: { "sec-fetch-site": "same-origin" } });
    request.headers.delete("origin");
    expect((await POST(request)).status).toBe(200);
  });
});

describe("POST /api/enquiries — content type", () => {
  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=abc"])(
    "returns 415 for %s",
    async (contentType) => {
      const response = await POST(enquiryRequest(validQuick, { headers: { "content-type": contentType } }));
      expect(response.status).toBe(415);
      expect(await expectNoStoreJson(response)).toMatchObject({ ok: false, error: "bad_request" });
    },
  );

  it("returns 415 when Content-Type is missing", async () => {
    const request = enquiryRequest(validQuick);
    request.headers.delete("content-type");
    expect((await POST(request)).status).toBe(415);
  });
});

describe("POST /api/enquiries — rate limiting", () => {
  it("allows 5 requests per IP per 10 minutes, then 429 with Retry-After", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 5; i++) expect((await POST(enquiryRequest(validQuick, { ip }))).status).toBe(200);

    const blocked = await POST(enquiryRequest(validQuick, { ip }));
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(590);
    expect(retryAfter).toBeLessThanOrEqual(600);
    expect(await expectNoStoreJson(blocked)).toMatchObject({ ok: false, error: "rate_limited" });

    // A different client is unaffected.
    expect((await POST(enquiryRequest(validQuick, { ip: "203.0.113.51" }))).status).toBe(200);
  });

  it("counts invalid submissions too (the limit is applied before parsing)", async () => {
    const ip = "203.0.113.60";
    for (let i = 0; i < 5; i++) await POST(enquiryRequest({ source: "quick" }, { ip }));
    expect((await POST(enquiryRequest(validQuick, { ip }))).status).toBe(429);
  });

  it("does not count requests rejected by the origin check", async () => {
    const ip = "203.0.113.70";
    for (let i = 0; i < 10; i++) {
      await POST(enquiryRequest(validQuick, { ip, headers: { origin: "https://evil.example" } }));
    }
    expect((await POST(enquiryRequest(validQuick, { ip }))).status).toBe(200);
  });
});

describe("POST /api/enquiries — honeypot", () => {
  it("returns the genuine not_configured response when no destination is set", async () => {
    const response = await POST(enquiryRequest({ ...validQuick, website: "http://spam.example" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "not_configured",
      message: ENQUIRY_MESSAGES.notConfigured,
    });
    expect(loggedEntries()).toContainEqual(expect.objectContaining({ outcome: "honeypot" }));
  });

  it("returns a normal-looking 201 in webhook mode but never calls the webhook", async () => {
    useWebhook();
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(enquiryRequest({ ...validQuick, website: "http://spam.example" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "received" });
    expect(body.reference).toMatch(/^ENQ-[0-9A-Z]{10}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still validates honeypot submissions (invalid ones get the same 422 as anyone)", async () => {
    const response = await POST(enquiryRequest({ ...validQuick, website: "x", phone: "1" }));
    expect(response.status).toBe(422);
  });
});

describe("POST /api/enquiries — webhook destination", () => {
  it("returns 201 received with a reference when the webhook accepts", async () => {
    useWebhook();
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(enquiryRequest(validQuick));
    expect(response.status).toBe(201);
    const body = await expectNoStoreJson(response);
    expect(body).toMatchObject({ ok: true, status: "received", message: ENQUIRY_MESSAGES.received });
    expect(body.reference).toMatch(/^ENQ-[0-9A-Z]{10}$/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    const sent = JSON.parse(init?.body as string);
    expect(sent.reference).toBe(body.reference);
    expect(sent.consentAt).toBe(sent.receivedAt);
    expect(sent.consentVersion).toBe(CONSENT_VERSION);
    expect(sent.enquiry).toEqual({
      source: "quick",
      name: PII.name,
      phone: "+919876543210",
      email: PII.email,
      message: PII.message,
      currentClass: "class-11",
      programInterest: "jee",
      intent: "scholarship",
      consent: true,
    });
    expect(new Headers(init?.headers).get(WEBHOOK_SIGNATURE_HEADER)).toBe(
      signWebhookBody(init?.body as string, WEBHOOK_SECRET),
    );
    expect(loggedEntries()).toContainEqual(
      expect.objectContaining({ outcome: "received", reference: body.reference, source: "quick" }),
    );
  });

  it("returns 500 server_error when the webhook answers non-2xx", async () => {
    useWebhook();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("down", { status: 503 })));

    const response = await POST(enquiryRequest(validQuick));
    expect(response.status).toBe(500);
    const body = await expectNoStoreJson(response);
    expect(body).toEqual({ ok: false, error: "server_error", message: ENQUIRY_MESSAGES.serverError });
    expect(loggedEntries()).toContainEqual(expect.objectContaining({ outcome: "delivery_failed", reason: "http_503" }));
  });

  it("returns 500 server_error when the webhook is unreachable", async () => {
    useWebhook();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError(`fetch failed for ${WEBHOOK_URL}`);
      }),
    );
    const response = await POST(enquiryRequest(validQuick));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("server_error");
    expect(loggedEntries()).toContainEqual(expect.objectContaining({ outcome: "delivery_failed", reason: "network" }));
  });

  it("behaves as none (and warns once) when webhook is selected but the secret is missing", async () => {
    vi.stubEnv("ENQUIRY_DESTINATION", "webhook");
    vi.stubEnv("ENQUIRY_WEBHOOK_URL", WEBHOOK_URL);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const first = await POST(enquiryRequest(validQuick));
    await POST(enquiryRequest(validQuick));
    expect(first.status).toBe(200);
    expect((await first.json()).status).toBe("not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
    const warnings = loggedEntries().filter((entry) => entry.event === "config");
    expect(warnings).toEqual([expect.objectContaining({ code: "enquiry_webhook_secret_missing", level: "warn" })]);
  });
});

// ── hero: 3-step home page form (D-021) ──────────────────────────────────────

const validHero = {
  source: "hero",
  name: PII.name,
  classOrExam: "neet-dropper",
  guardianName: PII.guardianName,
  phone: PII.phone,
  email: PII.email,
  preferredCentre: "shimla",
  message: PII.message,
  consent: true,
  consentVersion: CONSENT_VERSION,
  website: "",
};

describe("POST /api/enquiries — hero form", () => {
  it("validates and answers 200 not_configured without sending anything", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(enquiryRequest(validHero));
    expect(response.status).toBe(200);
    expect(await expectNoStoreJson(response)).toEqual({
      ok: true,
      status: "not_configured",
      message: ENQUIRY_MESSAGES.notConfigured,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loggedEntries()).toContainEqual(
      expect.objectContaining({ event: "enquiry", outcome: "not_configured", source: "hero" }),
    );
  });

  it("forwards currentClass + programInterest (not classOrExam) to the webhook and answers 201", async () => {
    useWebhook();
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(enquiryRequest(validHero));
    expect(response.status).toBe(201);
    const body = await expectNoStoreJson(response);
    expect(body).toMatchObject({ ok: true, status: "received", message: ENQUIRY_MESSAGES.received });
    expect(body.reference).toMatch(/^ENQ-[0-9A-Z]{10}$/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const sent = JSON.parse(init?.body as string);
    expect(sent.reference).toBe(body.reference);
    expect(sent.enquiry).toEqual({
      source: "hero",
      name: PII.name,
      guardianName: PII.guardianName,
      phone: "+919876543210",
      email: PII.email,
      preferredCentre: "shimla",
      message: PII.message,
      consent: true,
      currentClass: "dropper",
      programInterest: "neet",
    });
    expect(new Headers(init?.headers).get(WEBHOOK_SIGNATURE_HEADER)).toBe(
      signWebhookBody(init?.body as string, WEBHOOK_SECRET),
    );
    expect(loggedEntries()).toContainEqual(
      expect.objectContaining({ outcome: "received", reference: body.reference, source: "hero" }),
    );
  });

  it("does not forward a blank centre, email or message (the hero UI sends no email)", async () => {
    useWebhook();
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    const { email: _email, ...withoutEmail } = validHero;
    void _email;
    const response = await POST(enquiryRequest({ ...withoutEmail, preferredCentre: "", message: "" }));
    expect(response.status).toBe(201);
    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(Object.keys(sent.enquiry).sort()).toEqual(
      ["consent", "currentClass", "guardianName", "name", "phone", "programInterest", "source"].sort(),
    );
  });

  it("returns 422 on classOrExam for a combination that is not offered", async () => {
    const response = await POST(enquiryRequest({ ...validHero, classOrExam: "neet-class-6-8" }));
    expect(response.status).toBe(422);
    expect((await expectNoStoreJson(response)).fieldErrors).toEqual({
      classOrExam: ["Select a class / target exam"],
    });
  });

  it.each([undefined, "", "   ", "Q"])("returns 422 on guardianName when it is %j (required for hero)", async (guardianName) => {
    const response = await POST(enquiryRequest({ ...validHero, guardianName }));
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({ guardianName: ["Enter the parent or guardian's name"] });
  });

  it("returns 422 when preferredCentre is free text", async () => {
    const response = await POST(enquiryRequest({ ...validHero, preferredCentre: "Near the bus stand" }));
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({ preferredCentre: ["Select a centre from the list"] });
  });

  it("returns 422 when preferredCentre is a centre that is not published", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false"); // placeholder centres such as "shimla" are hidden
    const response = await POST(enquiryRequest(validHero));
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({ preferredCentre: ["Select a centre from the list"] });
    expect(loggedEntries()).toContainEqual(expect.objectContaining({ outcome: "validation_failed", source: "hero" }));
  });

  it("returns 422 with the missing step fields when only step 1 was filled", async () => {
    const response = await POST(
      enquiryRequest({
        source: "hero",
        name: PII.name,
        classOrExam: "jee-class-11",
        phone: "",
        consentVersion: CONSENT_VERSION,
        website: "",
      }),
    );
    expect(response.status).toBe(422);
    expect(Object.keys((await response.json()).fieldErrors).sort()).toEqual(["consent", "guardianName", "phone"]);
  });

  it("honeypot: mirrors the genuine response and never calls the webhook", async () => {
    const spam = { ...validHero, website: "http://spam.example" };
    const none = await POST(enquiryRequest(spam));
    expect(none.status).toBe(200);
    expect((await none.json()).status).toBe("not_configured");

    useWebhook();
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const webhook = await POST(enquiryRequest(spam));
    expect(webhook.status).toBe(201);
    expect((await webhook.json()).reference).toMatch(/^ENQ-[0-9A-Z]{10}$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loggedEntries().filter((entry) => entry.outcome === "honeypot")).toHaveLength(2);
  });

  it("accepts a worst-case hero payload, which stays under the 10 KB limit", async () => {
    const payload = {
      ...validHero,
      name: "अ".repeat(80),
      guardianName: "ब".repeat(80),
      message: "म".repeat(1000),
    };
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(10 * 1024);
    const response = await POST(enquiryRequest(payload));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("not_configured");
  });
});

// ── M7 lead capture (D-039) on the destination path ─────────────────────────

describe("POST /api/enquiries — consent version and context (D-039)", () => {
  it("rejects a submission without consentVersion (a page from before the consent change) with 422", async () => {
    const { consentVersion: _version, ...stale } = validHero;
    void _version;
    const response = await POST(enquiryRequest(stale));
    expect(response.status).toBe(422);
    expect(Object.keys((await response.json()).fieldErrors)).toEqual(["consentVersion"]);
  });

  it("forwards the validated context at the top level of the webhook payload, never inside `enquiry`", async () => {
    useWebhook();
    const fetchSpy = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const context = {
      page: "/hi/admissions",
      locale: "hi",
      utm_source: "facebook",
      tool: "predictor",
      toolExam: "jee-main",
      toolBand: "score-180-189",
      referrer: "https://www.google.com/search?q=x", // not a host → dropped
      phone: PII.phone, // unknown key → stripped
    };
    const response = await POST(enquiryRequest({ ...validHero, context }));
    expect(response.status).toBe(201);
    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(sent.context).toEqual({
      page: "/hi/admissions",
      locale: "hi",
      utm_source: "facebook",
      tool: "predictor",
      toolExam: "jee-main",
      toolBand: "score-180-189",
    });
    expect(sent.enquiry).not.toHaveProperty("context");
    expect(sent.enquiry).not.toHaveProperty("consentVersion");
  });

  it("never rejects an enquiry because of its context", async () => {
    const response = await POST(enquiryRequest({ ...validQuick, context: { page: "x".repeat(500), utm_source: "<b>" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("not_configured");
  });
});
