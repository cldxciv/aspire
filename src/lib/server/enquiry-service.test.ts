import { describe, expect, it, vi } from "vitest";

import { CONSENT_VERSION, enquirySchema, type Enquiry } from "@/lib/contracts/enquiry";

import type { EnquiryDestination } from "./destinations";
import { noneDestination } from "./destinations/none";
import {
  buildEnquiryPayload,
  checkPreferredCentre,
  ENQUIRY_REFERENCE_PATTERN,
  PREFERRED_CENTRE_ERROR,
  generateEnquiryReference,
  isHoneypotTriggered,
  submitEnquiry,
} from "./enquiry-service";

const enquiry: Enquiry = {
  source: "admissions",
  name: "Test Student",
  phone: "+919876543210",
  email: "",
  consent: true,
  consentVersion: CONSENT_VERSION,
  currentClass: "class-11",
  programInterest: "jee",
  website: "",
};

function fakeWebhook(result: Awaited<ReturnType<EnquiryDestination["deliver"]>>) {
  const deliver = vi.fn<EnquiryDestination["deliver"]>(async () => result);
  return { destination: { kind: "webhook", deliver } satisfies EnquiryDestination, deliver };
}

describe("generateEnquiryReference", () => {
  it("produces ENQ- plus 10 Crockford base32 characters, unique across calls", () => {
    const refs = new Set(Array.from({ length: 500 }, generateEnquiryReference));
    expect(refs.size).toBe(500);
    for (const ref of refs) expect(ref).toMatch(ENQUIRY_REFERENCE_PATTERN);
  });
});

describe("isHoneypotTriggered", () => {
  it("is false for missing/empty/whitespace website and true otherwise", () => {
    expect(isHoneypotTriggered({ ...enquiry, website: undefined })).toBe(false);
    expect(isHoneypotTriggered({ ...enquiry, website: "  " })).toBe(false);
    expect(isHoneypotTriggered({ ...enquiry, website: "http://spam.example" })).toBe(true);
  });
});

describe("buildEnquiryPayload", () => {
  it("drops the honeypot and empty optional strings, and stamps receivedAt/consentAt + the consent version", () => {
    const payload = buildEnquiryPayload(enquiry, "ENQ-0123456789", new Date("2026-10-19T10:00:00Z"));
    expect(payload).toEqual({
      reference: "ENQ-0123456789",
      receivedAt: "2026-10-19T10:00:00.000Z",
      consentAt: "2026-10-19T10:00:00.000Z",
      consentVersion: CONSENT_VERSION,
      enquiry: {
        source: "admissions",
        name: "Test Student",
        phone: "+919876543210",
        consent: true,
        currentClass: "class-11",
        programInterest: "jee",
      },
    });
  });
});

describe("checkPreferredCentre", () => {
  const admissions = { ...enquiry, source: "admissions" } as const;

  it("accepts absent, empty, 'not-sure' and a published centre slug", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    try {
      for (const preferredCentre of [undefined, "", "not-sure", "shimla"]) {
        await expect(checkPreferredCentre({ ...admissions, preferredCentre })).resolves.toBeNull();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects free text and centres that are not published", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    try {
      for (const preferredCentre of ["My house, 12 Mall Road", "shimla"]) {
        await expect(checkPreferredCentre({ ...admissions, preferredCentre })).resolves.toEqual({
          preferredCentre: [PREFERRED_CENTRE_ERROR],
        });
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("hero enquiries (D-021)", () => {
  const hero: Enquiry = {
    source: "hero",
    name: "Test Student",
    guardianName: "Test Parent",
    phone: "+919876543210",
    consent: true,
    consentVersion: CONSENT_VERSION,
    currentClass: "dropper",
    programInterest: "neet",
  };

  it("checkPreferredCentre accepts absent, empty, 'not-sure' and a published centre slug", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    try {
      for (const preferredCentre of [undefined, "", "not-sure", "shimla"]) {
        await expect(checkPreferredCentre({ ...hero, preferredCentre })).resolves.toBeNull();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("checkPreferredCentre rejects free text and centres that are not published", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    try {
      for (const preferredCentre of ["My house, 12 Mall Road", "shimla", "palampur"]) {
        await expect(checkPreferredCentre({ ...hero, preferredCentre })).resolves.toEqual({
          preferredCentre: [PREFERRED_CENTRE_ERROR],
        });
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("checkPreferredCentre ignores sources without a centre field", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    try {
      const contact: Enquiry = {
        source: "contact",
        name: "Parent",
        phone: "9876543210",
        consent: true,
        consentVersion: CONSENT_VERSION,
        topic: "other",
      };
      await expect(checkPreferredCentre(contact)).resolves.toBeNull();
      const quick: Enquiry = {
        source: "quick",
        name: "Test Student",
        phone: "9876543210",
        consent: true,
        consentVersion: CONSENT_VERSION,
        currentClass: "class-11",
        programInterest: "jee",
        intent: "enquiry",
      };
      await expect(checkPreferredCentre(quick)).resolves.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("buildEnquiryPayload forwards currentClass + programInterest and drops classOrExam, the honeypot and blank optional fields", () => {
    const parsed = enquirySchema.parse({
      source: "hero",
      name: "Test Student",
      classOrExam: "jee-class-12",
      guardianName: "  Test Parent ",
      phone: "+91 98765 43210",
      email: "",
      preferredCentre: "",
      message: "",
      consent: true,
      consentVersion: CONSENT_VERSION,
      website: "",
    });
    expect(buildEnquiryPayload(parsed, "ENQ-0123456789", new Date("2026-10-20T10:00:00Z"))).toEqual({
      reference: "ENQ-0123456789",
      receivedAt: "2026-10-20T10:00:00.000Z",
      consentAt: "2026-10-20T10:00:00.000Z",
      consentVersion: CONSENT_VERSION,
      enquiry: {
        source: "hero",
        name: "Test Student",
        guardianName: "Test Parent",
        phone: "+919876543210",
        consent: true,
        currentClass: "class-12",
        programInterest: "jee",
      },
    });
  });

  it("buildEnquiryPayload keeps the optional fields when they are given", () => {
    const parsed = enquirySchema.parse({
      source: "hero",
      name: "Test Student",
      classOrExam: "foundation-class-10",
      guardianName: "Test Parent",
      phone: "9876543210",
      email: "parent@example.com",
      preferredCentre: "not-sure",
      message: "Weekend batches?",
      consent: true,
      consentVersion: CONSENT_VERSION,
      context: { page: "/", tool: "planner" },
    });
    expect(buildEnquiryPayload(parsed, "ENQ-0123456789", new Date("2026-10-20T10:00:00Z"))).toMatchObject({
      consentVersion: CONSENT_VERSION,
      context: { page: "/", tool: "planner" },
    });
    expect(buildEnquiryPayload(parsed, "ENQ-0123456789", new Date("2026-10-20T10:00:00Z")).enquiry).toEqual({
      source: "hero",
      name: "Test Student",
      guardianName: "Test Parent",
      phone: "9876543210",
      email: "parent@example.com",
      preferredCentre: "not-sure",
      message: "Weekend batches?",
      consent: true,
      currentClass: "class-10",
      programInterest: "foundation",
    });
  });
});

describe("submitEnquiry", () => {
  const deps = { now: () => new Date("2026-10-19T10:00:00Z"), generateReference: () => "ENQ-TESTREF001" };

  it("returns not_configured for the none destination", async () => {
    await expect(submitEnquiry(enquiry, { destination: noneDestination, ...deps })).resolves.toEqual({
      kind: "not_configured",
      honeypot: false,
    });
  });

  it("returns received only when the destination accepts", async () => {
    const { destination, deliver } = fakeWebhook({ status: "accepted" });
    await expect(submitEnquiry(enquiry, { destination, ...deps })).resolves.toEqual({
      kind: "received",
      reference: "ENQ-TESTREF001",
      honeypot: false,
    });
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ reference: "ENQ-TESTREF001" }));
  });

  it("returns failed when the destination fails", async () => {
    const { destination } = fakeWebhook({ status: "failed", reason: "http_status", httpStatus: 502 });
    await expect(submitEnquiry(enquiry, { destination, ...deps })).resolves.toEqual({
      kind: "failed",
      reference: "ENQ-TESTREF001",
      reason: "http_status",
      httpStatus: 502,
    });
  });

  it("honeypot: mirrors the genuine response but never delivers", async () => {
    const spam = { ...enquiry, website: "http://spam.example" };
    const { destination, deliver } = fakeWebhook({ status: "accepted" });
    await expect(submitEnquiry(spam, { destination, ...deps })).resolves.toEqual({
      kind: "received",
      reference: "ENQ-TESTREF001",
      honeypot: true,
    });
    expect(deliver).not.toHaveBeenCalled();
    await expect(submitEnquiry(spam, { destination: noneDestination, ...deps })).resolves.toEqual({
      kind: "not_configured",
      honeypot: true,
    });
  });
});
