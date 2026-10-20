import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONSENT_VERSION } from "@/lib/contracts/enquiry";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";

import { CONSENT_TEXTS } from "./enquiry-consent";
import { createEnquiryHandler } from "./enquiry-handler";
import { createPhoneCaptureLimiter } from "./enquiry-capture";
import { crmLeadSink, toCaptureLeadInput, toLeadContext, type LeadCaptureInput } from "./lead-sink";
import type { Logger } from "./logger";
import { SlidingWindowRateLimiter } from "./rate-limit";

/** The real CRM sink (CRM-CORE captureLead) against a fresh in-memory database. Synthetic data only. */

const RECEIVED_AT = "2026-10-20T10:00:00.000Z";

const input: LeadCaptureInput = {
  reference: "ENQ-TESTREF001",
  receivedAt: RECEIVED_AT,
  source: "admissions",
  phone: "+919000000001",
  name: "Test Student",
  currentClass: "class-12",
  programInterest: "jee",
  preferredCentre: "not-sure",
  message: "Test message",
  consent: { version: CONSENT_VERSION, locale: "hi", text: CONSENT_TEXTS[CONSENT_VERSION].hi, givenAt: RECEIVED_AT },
  locale: "hi",
  context: {
    page: "/hi/admissions",
    locale: "hi",
    utm_source: "facebook",
    utm_campaign: "neet-2027",
    tool: "mock-test",
    referrer: "www.google.com",
  },
};

type Row = Record<string, unknown>;
const leadRows = () => getDb().prepare("SELECT * FROM crm_leads ORDER BY created_at").all() as Row[];

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
});

afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});

describe("toLeadContext / toCaptureLeadInput (contract → CRM shape)", () => {
  it("strips the locale from the page, keeps the referrer host, maps tool ids and keeps the page language", () => {
    expect(toLeadContext(input.context)).toEqual({
      page: "/admissions",
      referrer: "www.google.com",
      tool: "mock-test",
      toolExam: null,
      toolBand: null,
      locale: "hi",
      utmSource: "facebook",
      utmMedium: null,
      utmCampaign: "neet-2027",
      utmTerm: null,
      utmContent: null,
    });
    expect(toLeadContext(undefined)).toBeUndefined();
    expect(toLeadContext({ locale: "en" })).toBeUndefined();
    expect(toLeadContext({ tool: "predictor", toolExam: "jee-main", toolBand: "percentile-98-99" }, "en")).toMatchObject({
      tool: "predictor",
      toolExam: "jee-main",
      toolBand: "percentile-98-99",
      locale: "en",
    });
  });

  it("passes the consent version, time, language and exact text, the reference and the page language", () => {
    expect(toCaptureLeadInput(input)).toMatchObject({
      source: "admissions",
      studentName: "Test Student",
      phone: "+919000000001",
      centreSlug: "not-sure",
      reference: "ENQ-TESTREF001",
      consent: { textVersion: CONSENT_VERSION, at: Date.parse(RECEIVED_AT), locale: "hi", text: CONSENT_TEXTS[CONSENT_VERSION].hi },
      context: { locale: "hi", page: "/admissions" },
    });
    // No attribution at all: the page language still travels.
    expect(toCaptureLeadInput({ ...input, context: undefined, locale: "en" }).context).toEqual({ locale: "en" });
  });
});

describe("crmLeadSink", () => {
  it("creates one lead per phone, then appends repeat submissions to it (duplicate)", async () => {
    const first = await crmLeadSink.capture(input);
    expect(first).toMatchObject({ ok: true, duplicate: false });
    const second = await crmLeadSink.capture({ ...input, reference: "ENQ-TESTREF002", source: "contact", topic: "other" });
    expect(second).toEqual({ ok: true, leadId: first.ok ? first.leadId : "", duplicate: true });

    const rows = leadRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      phone_e164: "+919000000001",
      student_name: "Test Student",
      source: "admissions",
      consent_text_version: CONSENT_VERSION,
      consent_at: Date.parse(RECEIVED_AT),
      page: "/admissions",
      referrer: "www.google.com",
      tool: "mock-test",
      utm_source: "facebook",
      utm_campaign: "neet-2027",
      submission_count: 2,
    });
  });

  it("keeps the consent language + exact sentence, page language and predictor detail on the submission", async () => {
    const result = await crmLeadSink.capture({
      ...input,
      context: { ...input.context, tool: "predictor", toolExam: "jee-main", toolBand: "percentile-98-99" },
    });
    if (!result.ok) throw new Error("capture failed");
    const activity = getDb().prepare("SELECT meta FROM crm_activities WHERE lead_id = ? AND type = 'submission'").get(result.leadId) as Row;
    expect(JSON.parse(activity.meta as string)).toMatchObject({
      consentTextVersion: CONSENT_VERSION,
      consentLocale: "hi",
      consentText: CONSENT_TEXTS[CONSENT_VERSION].hi,
      locale: "hi",
      tool: "predictor",
      toolExam: "jee-main",
      toolBand: "percentile-98-99",
      page: "/admissions",
    });
  });

  it("reports the CRM's refusal as a failure code (never throws)", async () => {
    await expect(crmLeadSink.capture({ ...input, phone: "12345" })).resolves.toEqual({ ok: false, code: "invalid_phone" });
    expect(leadRows()).toHaveLength(0);
  });
});

describe("POST /api/enquiries → CRM (end to end, default ENQUIRY_STORE)", () => {
  it("stores a hero enquiry as a lead and answers received", async () => {
    const logger: Logger = { enquiry: () => undefined, configWarning: () => undefined };
    const handler = createEnquiryHandler({
      rateLimiter: new SlidingWindowRateLimiter({ limit: 100, windowMs: 60_000 }),
      phoneLimiter: createPhoneCaptureLimiter(),
      getEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://aspireiit.in", SHOW_PLACEHOLDER_CONTENT: "true" }),
      logger,
      now: () => new Date(RECEIVED_AT),
    });
    const response = await handler(
      new Request("http://localhost:3000/api/enquiries", {
        method: "POST",
        headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({
          source: "hero",
          name: "Test Student",
          classOrExam: "neet-dropper",
          guardianName: "Test Parent",
          phone: "90000 00002",
          consent: true,
          consentVersion: CONSENT_VERSION,
          website: "",
          context: { page: "/", locale: "en", tool: "planner" },
        }),
      }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "received" });

    const rows = leadRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      phone_e164: "+919000000002",
      guardian_name: "Test Parent",
      current_class: "dropper",
      program_interest: "neet",
      source: "hero",
      tool: "planner",
      page: "/",
      consent_text_version: CONSENT_VERSION,
    });
    const activity = getDb().prepare("SELECT meta FROM crm_activities WHERE lead_id = ?").get(rows[0].id as string) as Row;
    expect(JSON.parse(activity.meta as string)).toMatchObject({ reference: body.reference });
  });
});
