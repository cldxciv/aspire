import { describe, expect, it, vi } from "vitest";

import { CONSENT_VERSION } from "@/lib/contracts/enquiry";

import { signWebhookBody, WEBHOOK_SIGNATURE_HEADER } from "./destinations/webhook";
import { CONSENT_TEXTS } from "./enquiry-consent";
import { createPhoneCaptureLimiter, PHONE_CAPTURE_LIMIT } from "./enquiry-capture";
import { createEnquiryHandler, ENQUIRY_MESSAGES } from "./enquiry-handler";
import type { LeadCaptureInput, LeadSink, LeadSinkResult } from "./lead-sink";
import type { ConfigWarningCode, EnquiryLogEntry, Logger } from "./logger";
import { SlidingWindowRateLimiter } from "./rate-limit";

/**
 * POST /api/enquiries with lead capture (ENQUIRY_STORE=crm, the default — D-039), using fake lead
 * sinks and a fake webhook. The destination-only path (ENQUIRY_STORE=off) is covered by
 * src/app/api/enquiries/route.test.ts.
 */

const ORIGIN = "http://localhost:3000";
const WEBHOOK_URL = "https://hooks.example.com/enquiries";
const WEBHOOK_SECRET = "handler-test-secret-0123456789abcdef";
const NOW = new Date("2026-10-20T10:00:00Z");

const PII = { name: "Zebra Testname", guardian: "Quokka Guardian", phone: "+91 98765 43210", message: "Private marker 7f3a" };

const hero = {
  source: "hero",
  name: PII.name,
  classOrExam: "neet-dropper",
  guardianName: PII.guardian,
  phone: PII.phone,
  message: PII.message,
  consent: true,
  consentVersion: CONSENT_VERSION,
  website: "",
  context: { page: "/admissions", locale: "en", utm_source: "facebook", tool: "predictor", toolExam: "neet-ug", toolBand: "score-600-609" },
};

let ip = 0;
function request(body: unknown): Request {
  ip += 1;
  return new Request(`${ORIGIN}/api/enquiries`, {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: ORIGIN,
      "content-type": "application/json",
      "x-forwarded-for": `198.51.100.${ip % 250}`,
    },
    body: JSON.stringify(body),
  });
}

function fakeSink(result: LeadSinkResult | (() => Promise<LeadSinkResult>)) {
  const capture = vi.fn<LeadSink["capture"]>(async () => (typeof result === "function" ? result() : result));
  return { sink: { kind: "custom", capture } satisfies LeadSink, capture };
}

function setup({
  env = {},
  sink = fakeSink({ ok: true, leadId: "lead_1", duplicate: false }).sink,
  webhook,
}: {
  env?: Record<string, string>;
  sink?: LeadSink;
  webhook?: { status: number } | "throws";
} = {}) {
  const entries: EnquiryLogEntry[] = [];
  const warnings: ConfigWarningCode[] = [];
  const logger: Logger = { enquiry: (entry) => entries.push(entry), configWarning: (code) => warnings.push(code) };
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (webhook === "throws") throw new TypeError(`fetch failed for ${WEBHOOK_URL}`);
    return new Response("ok", { status: webhook?.status ?? 200 });
  });
  const webhookEnv = webhook
    ? { ENQUIRY_DESTINATION: "webhook", ENQUIRY_WEBHOOK_URL: WEBHOOK_URL, ENQUIRY_WEBHOOK_SECRET: WEBHOOK_SECRET }
    : {};
  let refs = 0;
  const handler = createEnquiryHandler({
    rateLimiter: new SlidingWindowRateLimiter({ limit: 1000, windowMs: 60_000 }),
    phoneLimiter: createPhoneCaptureLimiter(),
    getEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://aspireiit.in", SHOW_PLACEHOLDER_CONTENT: "true", ...webhookEnv, ...env }),
    getLeadSink: () => sink,
    logger,
    now: () => NOW,
    fetchImpl,
    generateReference: () => `ENQ-TESTREF${String((refs += 1)).padStart(3, "0")}`,
  });
  return { handler, entries, warnings, fetchImpl };
}

/** Logs must never carry personal data (names, phone digits, message) or webhook secrets. */
function expectNoPii(entries: EnquiryLogEntry[], warnings: ConfigWarningCode[] = []) {
  const text = JSON.stringify([entries, warnings]);
  for (const value of [PII.name, PII.guardian, PII.message, "98765", "43210", WEBHOOK_URL, WEBHOOK_SECRET]) {
    expect(text).not.toContain(value);
  }
}

describe("lead capture (ENQUIRY_STORE unset = crm)", () => {
  it("stores the lead with E.164 phone, consent text + version + time and the validated context; answers 201", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler, entries, fetchImpl } = setup({ sink });

    const response = await handler(request(hero));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ok: true,
      status: "received",
      reference: "ENQ-TESTREF001",
      message: ENQUIRY_MESSAGES.received,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    const input: LeadCaptureInput = capture.mock.calls[0][0];
    expect(input).toEqual({
      reference: "ENQ-TESTREF001",
      receivedAt: NOW.toISOString(),
      source: "hero",
      phone: "+919876543210",
      name: PII.name,
      guardianName: PII.guardian,
      currentClass: "dropper",
      programInterest: "neet",
      message: PII.message,
      consent: { version: CONSENT_VERSION, locale: "en", text: CONSENT_TEXTS[CONSENT_VERSION].en, givenAt: NOW.toISOString() },
      locale: "en",
      context: hero.context,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(entries).toEqual([
      expect.objectContaining({ outcome: "received", reference: "ENQ-TESTREF001", source: "hero", store: "stored", forward: "none" }),
    ]);
    expectNoPii(entries);
  });

  it("stores the Hindi consent text for an enquiry from a /hi page", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler } = setup({ sink });
    await handler(request({ ...hero, context: { page: "/hi" } }));
    expect(capture.mock.calls[0][0].consent).toMatchObject({ locale: "hi", text: CONSENT_TEXTS[CONSENT_VERSION].hi });
  });

  it("maps admissions and contact enquiries (blank optional fields dropped)", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler } = setup({ sink });
    const base = { name: PII.name, phone: "09876543210", consent: true, consentVersion: CONSENT_VERSION };
    await handler(request({ ...base, source: "admissions", currentClass: "class-12", programInterest: "jee", email: "", preferredCentre: "not-sure" }));
    await handler(request({ ...base, source: "contact", topic: "scholarship", message: "" }));
    expect(capture.mock.calls[0][0]).toMatchObject({ source: "admissions", phone: "+919876543210", preferredCentre: "not-sure" });
    expect(capture.mock.calls[0][0]).not.toHaveProperty("email");
    expect(capture.mock.calls[0][0]).not.toHaveProperty("context");
    expect(capture.mock.calls[1][0]).toMatchObject({ source: "contact", topic: "scholarship" });
    expect(capture.mock.calls[1][0]).not.toHaveProperty("message");
  });

  it("a repeat submission for a known phone (duplicate) is still received", async () => {
    const { handler, entries } = setup({ sink: fakeSink({ ok: true, leadId: "lead_1", duplicate: true }).sink });
    const response = await handler(request(hero));
    expect(response.status).toBe(201);
    expect(entries[0]).toMatchObject({ outcome: "received", store: "duplicate" });
  });

  it("ALSO forwards to the webhook when one is configured, with the same reference", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler, entries, fetchImpl } = setup({ sink, webhook: { status: 200 } });
    const response = await handler(request(hero));
    expect(response.status).toBe(201);
    const { reference } = await response.json();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    const sent = JSON.parse(init?.body as string);
    expect(sent).toMatchObject({ reference, consentVersion: CONSENT_VERSION, context: hero.context });
    expect(sent.enquiry).toMatchObject({ source: "hero", phone: "+919876543210" });
    expect(new Headers(init?.headers).get(WEBHOOK_SIGNATURE_HEADER)).toBe(signWebhookBody(init?.body as string, WEBHOOK_SECRET));
    expect(entries[0]).toMatchObject({ outcome: "received", store: "stored", forward: "sent" });
    expectNoPii(entries);
  });

  it("stored but the webhook failed: still received (the lead is kept), the failure is logged", async () => {
    const { handler, entries } = setup({ webhook: { status: 503 } });
    const response = await handler(request(hero));
    expect(response.status).toBe(201);
    expect(entries[0]).toMatchObject({ outcome: "received", store: "stored", forward: "failed", reason: "http_503" });
  });
});

describe("lead store failures are never hidden", () => {
  it("store fails and no webhook: 500 server_error, nothing claims received, the sink's code is logged", async () => {
    const { handler, entries } = setup({ sink: fakeSink({ ok: false, code: "db_locked" }).sink });
    const response = await handler(request(hero));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ ok: false, error: "server_error", message: ENQUIRY_MESSAGES.serverError });
    expect(body).not.toHaveProperty("reference");
    expect(entries).toEqual([
      expect.objectContaining({ outcome: "delivery_failed", store: "failed", forward: "none", reason: "store_db_locked" }),
    ]);
  });

  it("a throwing sink is a failure too (logged by error type only, never its message)", async () => {
    const sink = fakeSink(async () => {
      throw new RangeError(`constraint failed for ${PII.phone} ${PII.name}`);
    }).sink;
    const { handler, entries } = setup({ sink });
    expect((await handler(request(hero))).status).toBe(500);
    expect(entries[0]).toMatchObject({ outcome: "delivery_failed", reason: "store_exception_rangeerror" });
    expectNoPii(entries);
  });

  it("an unsafe failure code from a sink is replaced by 'unknown'", async () => {
    const { handler, entries } = setup({ sink: fakeSink({ ok: false, code: `bad ${PII.phone}` }).sink });
    await handler(request(hero));
    expect(entries[0]).toMatchObject({ reason: "store_unknown" });
    expectNoPii(entries);
  });

  it("store fails but the webhook accepts: received (forwarded), with the store failure logged", async () => {
    const { handler, entries } = setup({ sink: fakeSink({ ok: false, code: "crm_unavailable" }).sink, webhook: { status: 200 } });
    const response = await handler(request(hero));
    expect(response.status).toBe(201);
    expect(entries[0]).toMatchObject({ outcome: "received", store: "failed", forward: "sent", reason: "store_crm_unavailable" });
  });

  it("store and webhook both fail: 500", async () => {
    const { handler, entries } = setup({ sink: fakeSink({ ok: false, code: "db_locked" }).sink, webhook: "throws" });
    expect((await handler(request(hero))).status).toBe(500);
    expect(entries[0]).toMatchObject({ outcome: "delivery_failed", store: "failed", forward: "failed" });
    expectNoPii(entries);
  });
});

describe("ENQUIRY_STORE=off keeps the previous behaviour", () => {
  it("never calls the sink; no webhook → 200 not_configured", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler, entries } = setup({ env: { ENQUIRY_STORE: "off" }, sink });
    const response = await handler(request(hero));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "not_configured", message: ENQUIRY_MESSAGES.notConfigured });
    expect(capture).not.toHaveBeenCalled();
    expect(entries[0]).toMatchObject({ outcome: "not_configured" });
  });

  it("never calls the sink; webhook → 201 as before", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler } = setup({ env: { ENQUIRY_STORE: "off" }, sink, webhook: { status: 200 } });
    expect((await handler(request(hero))).status).toBe(201);
    expect(capture).not.toHaveBeenCalled();
  });

  it("an unknown ENQUIRY_STORE value is off, with a config warning", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler, warnings } = setup({ env: { ENQUIRY_STORE: "yes" }, sink });
    expect((await handler(request(hero))).status).toBe(200);
    expect(capture).not.toHaveBeenCalled();
    expect(warnings).toEqual(["enquiry_store_unknown"]);
  });
});

describe("spam and abuse", () => {
  it("honeypot: a normal-looking 201, nothing stored or sent, and it does not use up the phone cap", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler, entries, fetchImpl } = setup({ sink, webhook: { status: 200 } });
    for (let i = 0; i < PHONE_CAPTURE_LIMIT.limit + 2; i++) {
      const response = await handler(request({ ...hero, website: "http://spam.example" }));
      expect(response.status).toBe(201);
      expect((await response.json()).reference).toMatch(/^ENQ-/);
    }
    expect(capture).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(entries.every((entry) => entry.outcome === "honeypot")).toBe(true);
    expect((await handler(request(hero))).status).toBe(201);
  });

  it(`caps captures per mobile number at ${PHONE_CAPTURE_LIMIT.limit} a day, whatever the number's format or the connection`, async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: true });
    const { handler, entries } = setup({ sink });
    const formats = ["9876543210", "+91 98765 43210", "09876543210", "919876543210", "+91-98765-43210"];
    for (const phone of formats) expect((await handler(request({ ...hero, phone }))).status).toBe(201);

    const blocked = await handler(request(hero));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ ok: false, error: "rate_limited", message: ENQUIRY_MESSAGES.phoneRateLimited });
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(23 * 3600);
    expect(retryAfter).toBeLessThanOrEqual(24 * 3600);
    expect(capture).toHaveBeenCalledTimes(PHONE_CAPTURE_LIMIT.limit);
    expect(entries.at(-1)).toMatchObject({ outcome: "phone_rate_limited", source: "hero" });
    expectNoPii(entries);

    // Another family's number is unaffected.
    expect((await handler(request({ ...hero, phone: "9123456789" }))).status).toBe(201);
  });

  it("does not apply the phone cap when the store is off (previous behaviour)", async () => {
    const { handler } = setup({ env: { ENQUIRY_STORE: "off" } });
    for (let i = 0; i < PHONE_CAPTURE_LIMIT.limit + 1; i++) expect((await handler(request(hero))).status).toBe(200);
  });

  it("still refuses cross-origin requests before anything is stored", async () => {
    const { sink, capture } = fakeSink({ ok: true, leadId: "lead_1", duplicate: false });
    const { handler } = setup({ sink });
    const evil = request(hero);
    evil.headers.set("origin", "https://evil.example");
    expect((await handler(evil)).status).toBe(403);
    expect(capture).not.toHaveBeenCalled();
  });
});
